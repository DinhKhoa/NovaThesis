/**
 * MODULE 7 — TRAO ĐỔI & PHẢN HỒI (tầng nghiệp vụ)
 *
 * Tách khỏi `feedbacks.routes.ts` vì phần khó của module này không nằm ở HTTP mà
 * ở ba ràng buộc dữ liệu, cả ba đều đã có CHECK tương ứng dưới CSDL:
 *
 *   1. `feedbacks_exactly_one_target` — đúng một trong `milestone_id`/`document_id`.
 *   2. `feedbacks_max_depth` — `depth <= 2`, tức thread tối đa 3 cấp (UC 7.3).
 *   3. Phạm vi đọc phải nằm trong tập đề tài người dùng được thấy (Tenant Isolation).
 *
 * Ràng buộc CSDL là lưới an toàn cuối cùng, không phải giao diện người dùng: khi
 * nó bật lên, thứ đi ra là một lỗi Postgres 23514 vô nghĩa với sinh viên. Nên
 * mọi kiểm tra ở đây đều chạy TRƯỚC và trả về câu tiếng Việt cụ thể.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { badRequest, notFound } from "../../lib/errors";
import { thesisScopeFilter } from "../../domain/access";
import type { AuthUser } from "../../middleware/auth";
import { notifyMany, thesisAudience } from "../../services/notifications";

/* ==========================================================================
   HẰNG SỐ NGHIỆP VỤ
   ========================================================================== */

/** UC 7.4 BR — cửa sổ chỉnh sửa 15 phút kể từ `created_at`. */
export const EDIT_WINDOW_MS = 15 * 60_000;

/**
 * UC 7.3 BR — thread tối đa 3 cấp, nên `depth` chỉ nhận 0, 1, 2. Bình luận có
 * `depth = MAX_DEPTH` là lá: không ai trả lời tiếp được nữa.
 */
export const MAX_DEPTH = 2;

/** UC 7.7 BR — 5 MB mỗi tệp đính kèm. */
export const MAX_ATTACHMENT_MB = 5;
export const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024;

/* ==========================================================================
   HÌNH DẠNG TRUY VẤN
   ========================================================================== */

const NODE_INCLUDE = {
  author: { select: { id: true, full_name: true, role: true, avatar_url: true } },
  resolver: { select: { full_name: true } },
  milestone: { select: { id: true, name: true, thesis_id: true } },
  document: { select: { id: true, filename: true, thesis_id: true } },
} as const;

/**
 * Cây thread nạp sẵn đủ 3 cấp trong MỘT truy vấn.
 *
 * Prisma không có include đệ quy, mà `depth <= 2` nên viết tay đúng ba tầng là
 * đủ và là cách duy nhất tránh N+1: cách còn lại — lặp qua từng bình luận rồi
 * hỏi tiếp các trả lời — sinh ra 1 + N + N×M truy vấn cho mỗi trang danh sách.
 *
 * Trả lời sắp theo `created_at` TĂNG dần (ngược với danh sách gốc): trong một
 * cuộc trao đổi, đọc từ cũ tới mới mới đúng mạch hội thoại.
 */
export const THREAD_INCLUDE = {
  ...NODE_INCLUDE,
  replies: {
    orderBy: { created_at: "asc" },
    include: {
      ...NODE_INCLUDE,
      replies: {
        orderBy: { created_at: "asc" },
        include: NODE_INCLUDE,
      },
    },
  },
} as const;

/* ==========================================================================
   ĐỐI TƯỢNG ĐƯỢC BÌNH LUẬN
   ========================================================================== */

export interface FeedbackTarget {
  kind: "MILESTONE" | "DOCUMENT";
  milestone_id: number | null;
  document_id: number | null;
  thesis_id: number;
  /** Tên mốc / tên tệp — dùng trong tiêu đề thông báo. */
  label: string;
  /** Đường dẫn giao diện để bấm từ thông báo về đúng ngữ cảnh (UC 8.1). */
  link: string;
}

function buildTarget(
  milestone: { id: number; name: string; thesis_id: number } | null,
  document: { id: number; filename: string; thesis_id: number } | null
): FeedbackTarget {
  if (milestone) {
    return {
      kind: "MILESTONE",
      milestone_id: milestone.id,
      document_id: null,
      thesis_id: milestone.thesis_id,
      label: milestone.name,
      link: `/milestones?id=${milestone.id}`,
    };
  }
  if (document) {
    return {
      kind: "DOCUMENT",
      milestone_id: null,
      document_id: document.id,
      thesis_id: document.thesis_id,
      label: document.filename,
      link: `/documents?id=${document.id}`,
    };
  }
  // Cascade delete của Postgres dọn sạch bình luận khi mốc/tài liệu bị xoá
  // cứng, nên nhánh này chỉ chạm tới khi dữ liệu đã hỏng.
  throw notFound("Phản hồi này không còn gắn với mốc tiến độ hay tài liệu nào.");
}

/**
 * Tra cứu đối tượng đích và kiểm tra quy tắc "đúng một".
 *
 * Cố tình nhận cả hai tham số rồi tự đếm, thay vì tin vào tầng zod: đây là hàm
 * duy nhất mà mọi đường ghi đều đi qua, nên đặt bộ đếm ở đây thì không có lối
 * nào lách được ràng buộc CSDL.
 */
export async function resolveTarget(
  milestoneId: number | undefined,
  documentId: number | undefined
): Promise<FeedbackTarget> {
  if (milestoneId !== undefined && documentId !== undefined) {
    throw badRequest("Một phản hồi chỉ gắn được với một mốc tiến độ HOẶC một tài liệu, không phải cả hai.");
  }

  if (milestoneId !== undefined) {
    const milestone = await prisma.milestone.findFirst({
      where: { id: milestoneId, deleted_at: null },
      select: { id: true, name: true, thesis_id: true },
    });
    if (!milestone) throw notFound("Mốc tiến độ không tồn tại hoặc đã bị xóa.");
    return buildTarget(milestone, null);
  }

  if (documentId !== undefined) {
    const document = await prisma.document.findFirst({
      where: { id: documentId, deleted_at: null },
      select: { id: true, filename: true, thesis_id: true },
    });
    // UC 7.2 luồng ngoại lệ 4a — sinh viên vừa xoá tài liệu trong lúc giảng viên
    // đang gõ nhận xét.
    if (!document) throw notFound("Tài liệu không còn tồn tại.");
    return buildTarget(null, document);
  }

  throw badRequest("Phản hồi phải gắn với một mốc tiến độ hoặc một tài liệu.");
}

/* ==========================================================================
   NẠP BÌNH LUẬN CHO CÁC THAO TÁC GHI
   ========================================================================== */

export interface LoadedFeedback {
  id: number;
  user_id: number;
  parent_id: number | null;
  depth: number;
  content: string;
  created_at: Date;
  deleted_at: Date | null;
  is_resolved: boolean;
  file_url: string | null;
  reply_count: number;
  target: FeedbackTarget;
}

/**
 * Nạp một bình luận kèm ngữ cảnh đủ để quyết định quyền: tác giả, đề tài chứa
 * nó và số trả lời (quyết định xoá cứng hay xoá mềm ở UC 7.5).
 */
export async function loadFeedback(id: number): Promise<LoadedFeedback> {
  const row = await prisma.feedback.findUnique({
    where: { id },
    select: {
      id: true,
      user_id: true,
      parent_id: true,
      depth: true,
      content: true,
      created_at: true,
      deleted_at: true,
      is_resolved: true,
      file_url: true,
      milestone: { select: { id: true, name: true, thesis_id: true } },
      document: { select: { id: true, filename: true, thesis_id: true } },
      _count: { select: { replies: true } },
    },
  });

  if (!row) throw notFound("Phản hồi không tồn tại.");

  return {
    id: row.id,
    user_id: row.user_id,
    parent_id: row.parent_id,
    depth: row.depth,
    content: row.content,
    created_at: row.created_at,
    deleted_at: row.deleted_at,
    is_resolved: row.is_resolved,
    file_url: row.file_url,
    reply_count: row._count.replies,
    target: buildTarget(row.milestone, row.document),
  };
}

/* ==========================================================================
   PHẠM VI ĐỌC (UC 7.8)
   ========================================================================== */

export interface ListFilters {
  thesis_id?: number;
  target_type?: "MILESTONE" | "DOCUMENT";
  milestone_id?: number;
  document_id?: number;
  resolved?: boolean;
}

/**
 * Dựng điều kiện `where` cho danh sách bình luận GỐC.
 *
 * Phạm vi đi qua `thesisScopeFilter` — không có mệnh đề phân quyền nào tự viết ở
 * đây. Bình luận không có cột `thesis_id`, nên phạm vi được áp gián tiếp qua
 * quan hệ `milestone.thesis` / `document.thesis`; đây đúng là chỗ dễ quên nhất
 * và cũng là chỗ rò rỉ dữ liệu đắt nhất.
 *
 * Lưu ý về tài liệu được chia sẻ (UC 5.10): cố ý KHÔNG dùng
 * `accessibleDocumentIds` ở đây. Chia sẻ tài liệu là quyền đọc TÀI LIỆU, không
 * kèm quyền đọc cuộc trao đổi riêng giữa giảng viên và nhóm sở hữu tài liệu đó.
 */
export async function buildListWhere(
  user: AuthUser,
  filters: ListFilters
): Promise<Prisma.FeedbackWhereInput> {
  const scope = await thesisScopeFilter(user);

  // `AND` chứ không phải spread: `{ ...scope, id: thesis_id }` sẽ GHI ĐÈ mệnh đề
  // `id: { in: [...] }` của phạm vi, biến bộ lọc thành một lỗ hổng cho phép đọc
  // bình luận của đề tài bất kỳ chỉ bằng `?thesis_id=`.
  const thesisConditions: Prisma.ThesisWhereInput[] = [scope, { deleted_at: null }];
  if (filters.thesis_id !== undefined) thesisConditions.push({ id: filters.thesis_id });
  const thesis: Prisma.ThesisWhereInput = { AND: thesisConditions };

  const branches: Prisma.FeedbackWhereInput[] = [];

  const wantMilestone = filters.target_type !== "DOCUMENT" && filters.document_id === undefined;
  const wantDocument = filters.target_type !== "MILESTONE" && filters.milestone_id === undefined;

  if (wantMilestone) {
    branches.push({
      milestone_id: filters.milestone_id ?? { not: null },
      milestone: { deleted_at: null, thesis },
    });
  }
  if (wantDocument) {
    branches.push({
      document_id: filters.document_id ?? { not: null },
      document: { deleted_at: null, thesis },
    });
  }

  // Bộ lọc mâu thuẫn đã bị zod chặn từ trước; giữ lại nhánh này để `OR: []` —
  // vốn khớp KHÔNG bản ghi nào một cách âm thầm — không bao giờ lọt xuống Prisma.
  if (branches.length === 0) {
    throw badRequest("Bộ lọc mốc tiến độ và tài liệu mâu thuẫn với nhau.");
  }

  return {
    // Chỉ bình luận gốc: các trả lời đã nằm sẵn trong `replies` của chính chúng,
    // liệt kê phẳng ra đây sẽ khiến chúng hiện hai lần trên giao diện.
    parent_id: null,
    /*
     * Bản nháp do AI sinh KHÔNG phải một bình luận đã gửi.
     *
     * Nó nằm cùng bảng vì cùng hình dạng (xem `lib/milestone-review.ts`), nhưng
     * nó là ghi chú riêng cho người chấm và chỉ ra ở `GET /milestones/:id/ai-review`,
     * nơi có kiểm tra quyền `review`. Bỏ điều kiện này thì sinh viên sẽ đọc được
     * bản phê bình sơ bộ về chính bài của mình, mang tên giảng viên hướng dẫn,
     * trước cả khi giảng viên kịp mở nó ra.
     */
    is_ai_draft: false,
    OR: branches,
    ...(filters.resolved === undefined ? {} : { is_resolved: filters.resolved }),
  };
}

/* ==========================================================================
   THÔNG BÁO
   ========================================================================== */

/** Rút gọn nội dung cho thân thông báo; xuống dòng bị ép về một dòng. */
function preview(content: string, max = 160): string {
  const flat = content.replace(/\s+/gu, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * Báo cho "phía còn lại" của cuộc trao đổi.
 *
 * Giảng viên viết thì sinh viên nhận, và ngược lại (UC 7.1 bước 7, UC 7.3 bước
 * 7). Người viết luôn bị loại khỏi danh sách: không ai cần thông báo về chính
 * câu mình vừa gõ.
 */
export async function notifyFeedbackParticipants(opts: {
  actor: AuthUser;
  target: FeedbackTarget;
  content: string;
  parentAuthorUserId?: number | null;
}): Promise<void> {
  const audience = await thesisAudience(opts.target.thesis_id);

  const recipients: number[] = [];
  if (opts.actor.role === "STUDENT") {
    if (audience.lecturerUserId !== null) recipients.push(audience.lecturerUserId);
  } else if (opts.actor.role === "LECTURER") {
    recipients.push(...audience.studentUserIds);
  } else {
    // Admin không thuộc phía nào — báo cho cả hai.
    recipients.push(...audience.all);
  }

  // Tác giả bình luận cha luôn được báo, kể cả khi cùng phía với người trả lời:
  // đó là người đang chờ câu trả lời.
  if (opts.parentAuthorUserId != null) recipients.push(opts.parentAuthorUserId);

  const targets = recipients.filter((id) => id !== opts.actor.id);
  if (targets.length === 0) return;

  const where =
    opts.target.kind === "MILESTONE"
      ? `mốc “${opts.target.label}”`
      : `tài liệu “${opts.target.label}”`;

  await notifyMany(targets, {
    type: "FEEDBACK",
    title: `${opts.actor.full_name} đã phản hồi trên ${where}`,
    content: preview(opts.content),
    link: opts.target.link,
  });
}

/** UC 7.6 bước 6 — thread đóng lại hay mở lại đều phải báo cho sinh viên. */
export async function notifyResolveChange(opts: {
  actor: AuthUser;
  target: FeedbackTarget;
  isResolved: boolean;
}): Promise<void> {
  const audience = await thesisAudience(opts.target.thesis_id);
  const targets = audience.all.filter((id) => id !== opts.actor.id);
  if (targets.length === 0) return;

  await notifyMany(targets, {
    type: "FEEDBACK",
    title: opts.isResolved
      ? `Phản hồi trên “${opts.target.label}” đã được đánh dấu giải quyết`
      : `Phản hồi trên “${opts.target.label}” đã được mở lại`,
    content: opts.isResolved
      ? `${opts.actor.full_name} xác nhận nội dung trao đổi này đã được xử lý xong.`
      : `${opts.actor.full_name} mở lại luồng trao đổi này để tiếp tục xử lý.`,
    link: opts.target.link,
  });
}

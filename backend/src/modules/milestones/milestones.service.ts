/**
 * MODULE 4 — MỐC TIẾN ĐỘ · LỚP NGHIỆP VỤ
 *
 * Tệp này giữ ba thứ mà nếu để rải rác trong handler sẽ nhanh chóng lệch nhau:
 *
 *   1. Cách đọc/ghi một mốc (include dùng chung → serializer luôn nhận đủ quan hệ).
 *   2. Chuyển trạng thái: MỘT lối đi duy nhất qua `checkTransition`, kèm ghi
 *      `MilestoneHistory`. Ba endpoint khác nhau (đổi trạng thái, phê duyệt, yêu
 *      cầu sửa) đều là cùng một phép chuyển tiếp nhìn từ ba nút bấm khác nhau;
 *      cài đặt ba lần là cách chắc chắn để một trong ba quên ghi lịch sử.
 *   3. Quy ước thời gian. Cột `deadline` chứa nửa đêm UTC của một NGÀY (serializer
 *      cắt `toISOString().slice(0,10)`), nên mọi phép so sánh "trễ hạn / sắp đến
 *      hạn" phải quy về cùng một mốc, nếu không một mốc hạn hôm nay sẽ hiện "trễ"
 *      với người dùng ở múi giờ dương.
 */
import { Prisma, type MilestoneStatus, type UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { badRequest, conflict, notFound, unprocessable } from "../../lib/errors";
import { toMilestoneDTO, toThesisDTO } from "../serializers";
import { allowedTargets, checkTransition, STATUS_LABELS } from "../../domain/milestone-fsm";
import { visibleThesisIds } from "../../domain/access";
import { notifyMany, thesisAudience } from "../../services/notifications";
import type { AuthUser } from "../../middleware/auth";

/* ==========================================================================
   ĐỌC DỮ LIỆU
   ========================================================================== */

/**
 * Quan hệ mà `toMilestoneDTO` cần. Khai báo một lần rồi tái sử dụng: mỗi chỗ tự
 * viết `include` riêng là một chỗ có thể quên `_count.feedbacks` và trả về 0 sai.
 */
export const MILESTONE_INCLUDE = {
  thesis: { select: { id: true, title: true } },
  approver: { select: { full_name: true } },
  // Đếm có ĐIỀU KIỆN: bản nháp nhận xét của AI nằm cùng bảng `feedbacks` nhưng
  // không hiện trong luồng trao đổi (xem `feedbacks.service.ts`). Đếm cả nó sẽ
  // khiến giao diện báo "3 phản hồi" trên một mốc chỉ mở ra được 2.
  _count: { select: { feedbacks: { where: { is_ai_draft: false } } } },
} satisfies Prisma.MilestoneInclude;

export type MilestoneRecord = Prisma.MilestoneGetPayload<{ include: typeof MILESTONE_INCLUDE }>;

export async function loadMilestone(id: number): Promise<MilestoneRecord> {
  const milestone = await prisma.milestone.findFirst({
    where: { id, deleted_at: null },
    include: MILESTONE_INCLUDE,
  });
  if (!milestone) throw notFound("Mốc tiến độ không tồn tại hoặc đã bị xóa.");
  return milestone;
}

/**
 * DTO kèm `allowed_targets`.
 *
 * Giao diện Kanban chỉ được hiện những cột thả hợp lệ. Tính ở server bằng chính
 * bảng FSM của server bảo đảm hai bên không bao giờ hứa hai điều khác nhau —
 * bảng trong `frontend/src/lib/milestone-fsm.ts` chỉ để giải thích, không quyết định.
 */
export function toMilestoneView(m: MilestoneRecord, role: UserRole) {
  return { ...toMilestoneDTO(m), allowed_targets: allowedTargets(m.status, role, m) };
}

/* ==========================================================================
   THỜI GIAN
   ========================================================================== */

/**
 * Việt Nam không có DST nên độ lệch là hằng số; dùng số cố định tránh phụ thuộc
 * vào TZ của tiến trình (container thường chạy UTC còn người dùng thì không).
 */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

/** Nửa đêm của "hôm nay theo giờ Việt Nam", biểu diễn bằng mốc UTC như cột deadline. */
export function startOfToday(): Date {
  const vnNow = new Date(Date.now() + VN_OFFSET_MS);
  return new Date(Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), vnNow.getUTCDate()));
}

export function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * DAY_MS);
}

/** Định dạng ngày cho thông điệp lỗi và cho `MilestoneHistory` (đối chiếu được bằng mắt). */
export function dateText(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/* `dateField` và `toUtcMidnight` đã chuyển sang `middleware/validate.ts` — kỳ
   nghiên cứu của đề tài cần đúng cách đọc ngày này. Re-export để các tệp đang
   import từ đây không phải sửa. */
export { dateField, toUtcMidnight } from "../../middleware/validate";

/**
 * UC 4.1 BR — "Deadline không được nằm ngoài khoảng thời gian của đề tài".
 *
 * Khung thời gian nằm trên CHÍNH đề tài (`theses.start_date` / `end_date`), do
 * người tạo đề tài tự đặt. NovaThesis là nền tảng công khai dùng cho nhiều cơ sở
 * và nhiều nhóm nghiên cứu độc lập, nên không tồn tại một lịch chung mà hệ thống
 * có thể áp cho mọi người.
 *
 * Cả hai cột đều tuỳ chọn, và hai đầu được kiểm tra ĐỘC LẬP: một đề tài mới chỉ
 * biết ngày bắt đầu vẫn được ràng buộc ở đầu đó, thay vì mất trắng ràng buộc chỉ
 * vì thiếu ngày kết thúc.
 */
export async function assertDeadlineWithinThesis(
  thesisId: number,
  deadline: Date,
  label = "Hạn chót"
): Promise<void> {
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: { start_date: true, end_date: true },
  });
  if (!thesis) return;

  const { start_date, end_date } = thesis;

  // Kỳ nghiên cứu là tuỳ chọn. Chưa đặt thì không có gì để đối chiếu, và chặn
  // bừa ở đây sẽ khoá luôn các đề tài đang ở dạng nháp.
  if (start_date !== null && deadline < start_date) {
    throw badRequest(
      `${label} không được sớm hơn ngày bắt đầu kỳ nghiên cứu (${dateText(start_date)}).`
    );
  }

  if (end_date !== null && deadline > end_date) {
    throw badRequest(
      `${label} không được muộn hơn ngày kết thúc kỳ nghiên cứu (${dateText(end_date)}).`
    );
  }
}

/* ==========================================================================
   LỊCH SỬ (UC 4.12 — append-only)
   ========================================================================== */

export interface HistoryEntry {
  field_name: string;
  old_value?: string | null;
  new_value?: string | null;
  note?: string | null;
}

/**
 * Ghi lịch sử.
 *
 * Nhận `tx` chứ không dùng `prisma` toàn cục: dòng lịch sử và thay đổi tương ứng
 * phải cùng sống hoặc cùng chết. Một mốc đổi trạng thái mà không có dòng lịch sử
 * là lỗ hổng kiểm toán; một dòng lịch sử cho thay đổi đã rollback là nói dối.
 */
export function writeHistory(
  tx: Prisma.TransactionClient,
  milestoneId: number,
  actorId: number | null,
  entries: HistoryEntry[]
) {
  return tx.milestoneHistory.createMany({
    data: entries.map((e) => ({
      milestone_id: milestoneId,
      changed_by: actorId,
      field_name: e.field_name,
      old_value: e.old_value ?? null,
      new_value: e.new_value ?? null,
      note: e.note ?? null,
    })),
  });
}

/* ==========================================================================
   CHUYỂN TRẠNG THÁI (UC 4.8 / 4.10 / 4.11)
   ========================================================================== */

export interface TransitionInput {
  user: AuthUser;
  milestone: MilestoneRecord;
  to: MilestoneStatus;
  /** Nhận xét của người thực hiện, lưu vào dòng lịch sử. */
  note?: string | undefined;
  /** UC 4.11 — nội dung giảng viên yêu cầu sửa. */
  descriptionRevision?: string | undefined;
  /** Thay đổi minh chứng đi kèm trong cùng một giao dịch (UC 4.9 auto-submit). */
  evidence?: { file_url: string; filename: string } | undefined;
}

/**
 * Cổng DUY NHẤT để `milestones.status` thay đổi.
 *
 * Điều kiện `status: from` trong mệnh đề `where` là khoá lạc quan (optimistic
 * lock) — đúng tình huống ngoại lệ 5a của UC 4.10: sinh viên rút bài nộp đúng lúc
 * giảng viên bấm duyệt. Không có nó, hai request cùng chạy sẽ ghi đè nhau và
 * lịch sử sẽ ghi một phép chuyển tiếp chưa từng xảy ra.
 */
export async function transitionMilestone(input: TransitionInput): Promise<MilestoneRecord> {
  const { user, milestone, to } = input;
  const from = milestone.status;

  // Kiểm tra trên trạng thái minh chứng SẼ CÓ sau khi lưu: guard `needsEvidence`
  // phải thấy tệp vừa tải lên, nếu không auto-submit sẽ luôn bị chính nó chặn.
  const subject = input.evidence
    ? { evidence_file_url: input.evidence.file_url, evidence_filename: input.evidence.filename }
    : milestone;

  const check = checkTransition(from, to, user.role, subject);
  if (!check.allowed) throw unprocessable(check.reason, { status: [check.reason] });

  const data: Prisma.MilestoneUncheckedUpdateManyInput = { status: to };

  // Chỉ đụng vào dấu phê duyệt khi trạng thái THẬT SỰ đổi: gọi lại endpoint với
  // đúng trạng thái hiện tại (tải lại minh chứng cho mốc đang chờ duyệt) mà ghi
  // đè `approved_by` sẽ xoá mất người duyệt gốc.
  if (from !== to) {
    if (to === "COMPLETED") {
      data.approved_by = user.id;
      data.approved_at = new Date();
    } else if (from === "COMPLETED") {
      // Mở lại mốc đã duyệt: giữ nguyên dấu phê duyệt cũ sẽ khiến giao diện hiển
      // thị "đã duyệt bởi X" trên một mốc đang chờ làm lại.
      data.approved_by = null;
      data.approved_at = null;
    }
  }

  if (input.descriptionRevision !== undefined) {
    data.description_revision = input.descriptionRevision;
  }
  if (input.evidence) {
    data.evidence_file_url = input.evidence.file_url;
    data.evidence_filename = input.evidence.filename;
  }

  const history: HistoryEntry[] = [];
  if (from !== to) {
    history.push({
      field_name: "status",
      old_value: from,
      new_value: to,
      note: input.note ?? null,
    });
  }
  if (input.evidence) {
    history.push({
      field_name: "evidence",
      old_value: milestone.evidence_filename,
      new_value: input.evidence.filename,
    });
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.milestone.updateMany({
      where: { id: milestone.id, deleted_at: null, status: from },
      data,
    });
    if (updated.count === 0) {
      throw conflict(
        "Mốc tiến độ vừa được người khác cập nhật. Vui lòng tải lại trang rồi thử lại."
      );
    }

    if (history.length > 0) {
      await writeHistory(tx, milestone.id, user.id, history);
    }

    return tx.milestone.findFirstOrThrow({
      where: { id: milestone.id },
      include: MILESTONE_INCLUDE,
    });
  });
}

/* ==========================================================================
   THÔNG BÁO
   ========================================================================== */

export type Audience = "lecturer" | "students" | "counterpart";

/**
 * Gửi thông báo cho những người liên quan tới mốc.
 *
 * `counterpart` = "bên còn lại": sinh viên thao tác thì báo giảng viên và ngược
 * lại. Gửi cho cả hai bên sẽ khiến chính người vừa bấm nút nhận thông báo về
 * hành động của mình — nhiễu, và là cách nhanh nhất để người dùng học cách bỏ
 * qua chuông thông báo.
 *
 * Cố ý KHÔNG dùng `force`: tuỳ chọn nhận thông báo của UC 8.7 chỉ có ý nghĩa nếu
 * nó được tôn trọng. `force` dành riêng cho cảnh báo bảo mật bắt buộc.
 */
export async function notifyAboutMilestone(opts: {
  thesisId: number;
  milestoneId: number;
  actor: AuthUser;
  audience: Audience;
  title: string;
  content: string;
}): Promise<void> {
  const people = await thesisAudience(opts.thesisId);

  const lecturer = people.lecturerUserId === null ? [] : [people.lecturerUserId];
  const target =
    opts.audience === "lecturer"
      ? lecturer
      : opts.audience === "students"
        ? people.studentUserIds
        : opts.actor.role === "STUDENT"
          ? lecturer
          : people.studentUserIds;

  // Không tự gửi thông báo cho chính mình (Admin thao tác hộ có thể nằm trong danh sách).
  const recipients = target.filter((id) => id !== opts.actor.id);
  if (recipients.length === 0) return;

  await notifyMany(recipients, {
    type: "MILESTONE",
    title: opts.title,
    content: opts.content,
    link: `/milestones?milestone=${opts.milestoneId}`,
  });
}

/** Câu mô tả trạng thái dùng lại nhiều nơi — nhãn tiếng Việt lấy từ chính bảng FSM. */
export function statusSentence(name: string, thesisTitle: string, to: MilestoneStatus): string {
  return `Mốc “${name}” của đề tài “${thesisTitle}” đã chuyển sang trạng thái “${STATUS_LABELS[to]}”.`;
}

/* ==========================================================================
   DASHBOARD (UC 4.13 / 4.14)
   ========================================================================== */

const THESIS_CARD_INCLUDE = {
  lecturer: { select: { id: true, user: { select: { full_name: true } } } },
  members: {
    where: { left_at: null },
    select: {
      student: { select: { id: true, user: { select: { full_name: true } } } },
    },
  },
  _count: { select: { milestones: true, documents: true } },
} satisfies Prisma.ThesisInclude;

export interface MilestoneStats {
  total: number;
  completed: number;
  in_progress: number;
  overdue: number;
  due_soon: number;
  progress_percent: number;
}

/**
 * Đếm mốc theo trạng thái bằng `groupBy` thay vì tải hết về rồi lọc trong JS:
 * một đề tài có thể có hàng trăm mốc và ba con số cần đếm không đáng để chuyển
 * cả bảng qua mạng (§2.4 "Resource Constrained Thinking").
 */
export async function milestoneStats(thesisIds: number[] | null): Promise<MilestoneStats> {
  if (thesisIds !== null && thesisIds.length === 0) {
    return { total: 0, completed: 0, in_progress: 0, overdue: 0, due_soon: 0, progress_percent: 0 };
  }

  const scope: Prisma.MilestoneWhereInput = {
    deleted_at: null,
    ...(thesisIds === null ? {} : { thesis_id: { in: thesisIds } }),
  };

  const today = startOfToday();

  const [grouped, overdue, dueSoon] = await Promise.all([
    prisma.milestone.groupBy({ by: ["status"], where: scope, _count: { _all: true } }),
    prisma.milestone.count({
      where: { ...scope, status: { not: "COMPLETED" }, deadline: { lt: today } },
    }),
    prisma.milestone.count({
      where: {
        ...scope,
        status: { not: "COMPLETED" },
        deadline: { gte: today, lte: addDays(today, 7) },
      },
    }),
  ]);

  const byStatus = new Map<MilestoneStatus, number>();
  for (const row of grouped) byStatus.set(row.status, row._count._all);

  const total = grouped.reduce((sum, row) => sum + row._count._all, 0);
  const completed = byStatus.get("COMPLETED") ?? 0;
  // "Đang xử lý" = đã khởi động nhưng chưa xong. Gộp cả ba trạng thái giữa để
  // total = chưa bắt đầu + đang xử lý + hoàn thành, không bỏ sót mốc nào.
  const inProgress =
    (byStatus.get("ONGOING") ?? 0) +
    (byStatus.get("PENDING_APPROVAL") ?? 0) +
    (byStatus.get("REVISION_REQUIRED") ?? 0);

  return {
    total,
    completed,
    in_progress: inProgress,
    overdue,
    due_soon: dueSoon,
    progress_percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

/** Nhãn tiếng Việt cho dòng thời gian hoạt động. Khoá là `AuditAction`. */
const ACTIVITY_LABELS: Record<string, string> = {
  MILESTONE_CREATE: "đã tạo mốc",
  MILESTONE_UPDATE: "đã cập nhật mốc",
  MILESTONE_STATUS_CHANGE: "đã đổi trạng thái mốc",
  MILESTONE_APPROVE: "đã phê duyệt mốc",
  MILESTONE_REVISION: "đã yêu cầu chỉnh sửa mốc",
  MILESTONE_EXTENSION_REQUEST: "đã xin gia hạn mốc",
  MILESTONE_EXTENSION_REVIEW: "đã trả lời yêu cầu gia hạn",
  MILESTONE_DELETE: "đã xóa mốc",
  THESIS_CREATE: "đã tạo đề tài",
  THESIS_UPDATE: "đã cập nhật đề tài",
  THESIS_SUBMIT: "đã gửi duyệt đề tài",
  THESIS_APPROVE: "đã phê duyệt đề tài",
  THESIS_REVISION: "đã yêu cầu chỉnh sửa đề tài",
  THESIS_REJECT: "đã từ chối đề tài",
  THESIS_COMPLETE: "đã hoàn thành đề tài",
  DOCUMENT_UPLOAD: "đã tải lên",
  DOCUMENT_VERSION_UPLOAD: "đã tải lên phiên bản mới",
  DOCUMENT_UPDATE: "đã cập nhật tài liệu",
  DOCUMENT_SHARE: "đã chia sẻ tài liệu",
  DOCUMENT_DELETE: "đã xóa tài liệu",
  FEEDBACK_CREATE: "đã phản hồi",
  FEEDBACK_RESOLVE: "đã đánh dấu đã xử lý",
  AI_SUGGEST: "đã tạo gợi ý lộ trình",
};

/** Lấy tên đối tượng từ `details` mà không tin vào hình dạng của JSON. */
function activityTarget(details: Prisma.JsonValue | null): string {
  if (details === null || typeof details !== "object" || Array.isArray(details)) return "";
  const bag = details as Record<string, unknown>;
  for (const key of ["name", "title", "filename", "target"]) {
    const value = bag[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "";
}

export interface ActivityRow {
  id: number;
  actor: string;
  action: string;
  target: string;
  created_at: string;
}

/**
 * Dòng thời gian hoạt động trong phạm vi người dùng.
 *
 * Lọc theo `details.thesis_id` chứ không theo `user_id`: một giảng viên hướng dẫn
 * nhiều nhóm, lấy theo người sẽ kéo cả hoạt động ở đề tài khác vào dashboard của
 * sinh viên — đúng kiểu rò rỉ chéo mà Tenant Isolation (§2.1) cấm.
 */
export async function recentActivities(user: AuthUser, limit = 8): Promise<ActivityRow[]> {
  const scope = await visibleThesisIds(user);
  if (scope !== null && scope.length === 0) return [];

  const where: Prisma.SystemLogWhereInput = {
    level: { not: "ERROR" },
    action: { in: Object.keys(ACTIVITY_LABELS) },
    ...(scope === null
      ? {}
      : { OR: scope.map((id) => ({ details: { path: ["thesis_id"], equals: id } })) }),
  };

  const rows = await prisma.systemLog.findMany({
    where,
    orderBy: { created_at: "desc" },
    take: limit,
    select: {
      id: true,
      user_id: true,
      action: true,
      details: true,
      created_at: true,
      user: { select: { full_name: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    // "Bạn" thay vì tên riêng: dòng thời gian đọc tự nhiên hơn và khớp giao diện.
    actor: row.user_id === user.id ? "Bạn" : (row.user?.full_name ?? "Hệ thống"),
    action: ACTIVITY_LABELS[row.action] ?? row.action,
    target: activityTarget(row.details),
    created_at: row.created_at.toISOString(),
  }));
}

/**
 * UC 4.13 — Dashboard sinh viên.
 *
 * Không nhận `thesis_id` thì lấy đề tài được cập nhật gần nhất trong phạm vi:
 * sinh viên học lại có thể còn đề tài cũ trong lịch sử, và cái họ đang làm luôn
 * là cái vừa có hoạt động.
 */
export async function studentDashboard(user: AuthUser, thesisId: number | null) {
  const scopeIds = await visibleThesisIds(user);

  // Phạm vi và đề tài được chỉ định phải CÙNG có hiệu lực. Ghi đè khoá `id` sẽ
  // vô hiệu hoá bộ lọc phạm vi, nên điều kiện thứ hai đi qua `AND`.
  const where: Prisma.ThesisWhereInput = {
    deleted_at: null,
    ...(scopeIds === null ? {} : { id: { in: scopeIds } }),
    ...(thesisId === null ? {} : { AND: [{ id: thesisId }] }),
  };

  const thesis = await prisma.thesis.findFirst({
    where,
    orderBy: { updated_at: "desc" },
    include: THESIS_CARD_INCLUDE,
  });

  const [stats, upcoming, activities] = await Promise.all([
    milestoneStats(thesis ? [thesis.id] : []),
    thesis
      ? prisma.milestone.findMany({
          where: { thesis_id: thesis.id, deleted_at: null, status: { not: "COMPLETED" } },
          orderBy: [{ deadline: "asc" }, { order_index: "asc" }],
          take: 5,
          include: MILESTONE_INCLUDE,
        })
      : Promise.resolve([]),
    recentActivities(user, 8),
  ]);

  return {
    thesis: thesis ? toThesisDTO(thesis) : null,
    ...stats,
    upcoming: upcoming.map((m) => toMilestoneView(m, user.role)),
    recent_activities: activities,
  };
}

export interface LecturerBoardRow {
  thesis_id: number;
  title: string;
  student_names: string[];
  total: number;
  completed: number;
  overdue: number;
  progress_percent: number;
  last_activity_at: string;
}

/**
 * UC 4.14 — Dashboard giảng viên.
 *
 * Một truy vấn kèm quan hệ lồng nhau rồi tổng hợp trong bộ nhớ, thay vì lặp
 * `count()` cho từng đề tài. Với 20 nhóm hướng dẫn, cách kia là 60 lượt đi CSDL —
 * đúng lỗi N+1 mà `Yêu cầu dự án.md` §3.3 gọi là "sát thủ hiệu năng".
 */
export async function lecturerDashboard(user: AuthUser): Promise<LecturerBoardRow[]> {
  const scopeIds = await visibleThesisIds(user);
  if (scopeIds !== null && scopeIds.length === 0) return [];

  const theses = await prisma.thesis.findMany({
    where: {
      deleted_at: null,
      ...(scopeIds === null ? {} : { id: { in: scopeIds } }),
    },
    select: {
      id: true,
      title: true,
      updated_at: true,
      members: {
        where: { left_at: null },
        select: { student: { select: { user: { select: { full_name: true } } } } },
      },
      milestones: {
        where: { deleted_at: null },
        select: { status: true, deadline: true, updated_at: true },
      },
    },
    // Trần an toàn cho tài khoản Admin (phạm vi = toàn hệ thống). Giảng viên
    // thật không bao giờ chạm tới con số này.
    take: 200,
  });

  const today = startOfToday();

  const rows: LecturerBoardRow[] = theses.map((thesis) => {
    let completed = 0;
    let overdue = 0;
    let lastActivity = thesis.updated_at;

    for (const m of thesis.milestones) {
      if (m.status === "COMPLETED") completed++;
      else if (m.deadline < today) overdue++;
      if (m.updated_at > lastActivity) lastActivity = m.updated_at;
    }

    const total = thesis.milestones.length;

    return {
      thesis_id: thesis.id,
      title: thesis.title,
      student_names: thesis.members.map((m) => m.student.user.full_name),
      total,
      completed,
      overdue,
      progress_percent: total === 0 ? 0 : Math.round((completed / total) * 100),
      last_activity_at: lastActivity.toISOString(),
    };
  });

  // BR UC 4.14: nhóm trễ hạn nhiều nhất và tiến độ thấp nhất phải nổi lên đầu —
  // dashboard cảnh báo mà phải cuộn tìm thì không còn là cảnh báo.
  rows.sort(
    (a, b) => b.overdue - a.overdue || a.progress_percent - b.progress_percent
  );

  return rows;
}

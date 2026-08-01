/**
 * NGHIỆP VỤ ĐỀ TÀI (Module 3 — UC 3.1 → 3.14)
 *
 * Tệp này giữ phần "luật chơi" của đề tài: hình dạng truy vấn dùng chung, các
 * ràng buộc nghiệp vụ có thể bị vi phạm từ nhiều endpoint khác nhau (quota
 * giảng viên, giới hạn một đề tài đang xử lý cho mỗi sinh viên) và bản dựng
 * lịch sử trạng thái.
 *
 * Tách khỏi `theses.routes.ts` vì cùng một ràng buộc được kiểm ở nhiều nơi:
 * quota giảng viên bị chạm bởi UC 3.1 (chọn GV), UC 3.9 (duyệt) và UC 3.12
 * (đổi GV). Cài ba lần là ba cơ hội để ba lần lệch nhau.
 */
import { Prisma, type ThesisStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { THESIS_STATUS_LABELS } from "../../domain/milestone-fsm";
import { thesisScopeFilter } from "../../domain/access";
import type { AuthUser } from "../../middleware/auth";
import { toThesisDTO } from "../serializers";

/* ==========================================================================
   HÌNH DẠNG TRUY VẤN DÙNG CHUNG
   ========================================================================== */

/**
 * Quan hệ mà `toThesisDTO` cần, khai báo MỘT lần.
 *
 * Đây là liều thuốc cho N+1: danh sách 100 đề tài vẫn chỉ là một truy vấn kèm
 * join, thay vì 100 lần hỏi tên giảng viên rồi 100 lần đếm mốc tiến độ.
 * `_count` được lọc `deleted_at: null` vì con số hiển thị cho người dùng phải
 * là số tài liệu họ còn thấy được, không phải số dòng còn sót trong bảng.
 */
export const thesisInclude = {
  lecturer: {
    select: { id: true, department: true, user: { select: { full_name: true } } },
  },
  members: {
    where: { left_at: null },
    orderBy: { joined_at: "asc" },
    select: {
      student: {
        select: { id: true, student_code: true, user: { select: { full_name: true } } },
      },
    },
  },
  _count: {
    select: {
      milestones: { where: { deleted_at: null } },
      documents: { where: { deleted_at: null } },
    },
  },
} satisfies Prisma.ThesisInclude;

/** Nạp lại đề tài kèm quan hệ rồi tuần tự hoá — dùng sau mọi thao tác ghi. */
export async function findThesisDTO(thesisId: number) {
  const thesis = await prisma.thesis.findFirst({
    where: { id: thesisId, deleted_at: null },
    include: thesisInclude,
  });
  if (!thesis) throw notFound("Đề tài không tồn tại hoặc đã bị xóa.");
  return toThesisDTO(thesis);
}

/* ==========================================================================
   PHẠM VI HIỂN THỊ
   ========================================================================== */

/**
 * Điều kiện `where` cơ sở cho mọi truy vấn danh sách.
 *
 * Phần cách ly dữ liệu (Tenant Isolation) đến từ `thesisScopeFilter` — nguồn sự
 * thật duy nhất, không cài lại ở đây. Phần thêm vào chỉ là quy tắc hiển thị của
 * UC 3.3: giảng viên không được thấy bản nháp của sinh viên.
 *
 * Loại trừ theo NGƯỜI TẠO chứ không loại trừ mọi bản ghi DRAFT: đề tài do chính
 * giảng viên đề xuất (nhánh giảng viên của UC 3.1) cũng nằm ở trạng thái DRAFT,
 * lọc thô sẽ khiến họ mất luôn đề tài của mình.
 */
export async function scopedThesisWhere(user: AuthUser): Promise<Prisma.ThesisWhereInput> {
  const scope = await thesisScopeFilter(user);
  const where: Prisma.ThesisWhereInput = { deleted_at: null, ...scope };

  if (user.role === "LECTURER") {
    where.OR = [{ status: { not: "DRAFT" } }, { created_by: user.id }];
  }

  return where;
}

/** Điều kiện tìm kiếm toàn văn "đủ dùng" cho UC 3.14. */
export function searchCondition(term: string): Prisma.ThesisWhereInput {
  const contains = { contains: term, mode: "insensitive" } as const;
  return {
    // Ngoài title/description/field, ô tìm kiếm ở giao diện còn hứa tìm theo
    // giảng viên, và UC 3.14 nhắc tên/mã sinh viên. Thiếu hai vế sau thì người
    // dùng gõ tên sinh viên sẽ nhận về danh sách rỗng dù dữ liệu vẫn còn đó.
    OR: [
      { title: contains },
      { description: contains },
      { field: contains },
      { lecturer: { user: { full_name: contains } } },
      { members: { some: { student: { user: { full_name: contains } } } } },
      { members: { some: { student: { student_code: contains } } } },
    ],
  };
}

/* ==========================================================================
   RÀNG BUỘC NGHIỆP VỤ
   ========================================================================== */

/**
 * UC 3.1 BR-1 — mỗi sinh viên chỉ có một đề tài đang xử lý.
 *
 * REJECTED và COMPLETED không nằm trong danh sách: cả hai đều là trạng thái
 * cuối, và UC 3.11 nói rõ sau khi bị từ chối sinh viên được tạo đề tài mới.
 */
const ACTIVE_THESIS_STATUSES: ThesisStatus[] = [
  "DRAFT",
  "PENDING",
  "REVISION_REQUIRED",
  "ONGOING",
];

export async function assertNoActiveThesis(
  studentId: number,
  subject: "self" | "other" = "self"
): Promise<void> {
  const existing = await prisma.thesisMember.findFirst({
    where: {
      student_id: studentId,
      left_at: null,
      thesis: { deleted_at: null, status: { in: ACTIVE_THESIS_STATUSES } },
    },
    select: { thesis: { select: { title: true, status: true } } },
  });
  if (!existing) return;

  const label = THESIS_STATUS_LABELS[existing.thesis.status];
  throw conflict(
    subject === "self"
      ? `Bạn đang có đề tài “${existing.thesis.title}” ở trạng thái ${label}. Mỗi sinh viên chỉ được có một đề tài đang xử lý.`
      : `Sinh viên này đang tham gia đề tài “${existing.thesis.title}” (${label}) nên không thể thêm vào đề tài khác.`
  );
}

interface CapacityOptions {
  /** Bỏ đề tài đang xét ra khỏi phép đếm khi nó vốn đã thuộc giảng viên này. */
  excludeThesisId?: number;
  /** Người gọi chính là giảng viên bị đếm — đổi câu chữ cho đúng ngôi. */
  self?: boolean;
}

/**
 * UC 3.9 / 3.12 BR — quota hướng dẫn.
 *
 * Chỉ đếm đề tài ONGOING: bản nháp và đề tài chờ duyệt chưa chiếm chỗ của ai,
 * đếm cả chúng sẽ khoá giảng viên chỉ vì có mấy sinh viên gửi đề xuất đầu cơ.
 */
export async function assertLecturerCapacity(
  lecturerId: number,
  opts: CapacityOptions = {}
): Promise<{ user_id: number; full_name: string }> {
  const lecturer = await prisma.lecturer.findUnique({
    where: { id: lecturerId },
    select: {
      max_students: true,
      user: { select: { id: true, full_name: true, status: true, deleted_at: true } },
    },
  });

  if (!lecturer || lecturer.user.deleted_at || lecturer.user.status !== "ACTIVE") {
    throw badRequest("Giảng viên hướng dẫn không tồn tại hoặc không còn hoạt động.");
  }

  const current = await prisma.thesis.count({
    where: {
      lecturer_id: lecturerId,
      status: "ONGOING",
      deleted_at: null,
      ...(opts.excludeThesisId !== undefined ? { id: { not: opts.excludeThesisId } } : {}),
    },
  });

  if (current >= lecturer.max_students) {
    throw conflict(
      opts.self
        ? `Bạn đang hướng dẫn ${current}/${lecturer.max_students} đề tài — đã đạt giới hạn cho phép.`
        : `Giảng viên ${lecturer.user.full_name} đã nhận đủ ${lecturer.max_students} đề tài hướng dẫn. Vui lòng chọn giảng viên khác.`
    );
  }

  return { user_id: lecturer.user.id, full_name: lecturer.user.full_name };
}

/* ==========================================================================
   LỊCH SỬ TRẠNG THÁI (UC 3.4 — tab "Lịch sử hoạt động")
   ========================================================================== */

/**
 * Các hành động được coi là sự kiện vòng đời đề tài.
 *
 * Danh sách tường minh thay vì `LIKE 'THESIS%'`: bảng `system_logs` là nơi mọi
 * module cùng ghi vào, một tiền tố mới trong tương lai không được phép lặng lẽ
 * chui vào dòng thời gian của đề tài.
 */
const HISTORY_ACTIONS = [
  "THESIS_CREATE",
  "THESIS_UPDATE",
  "THESIS_SUBMIT",
  "THESIS_APPROVE",
  "THESIS_REVISION",
  "THESIS_REJECT",
  "THESIS_COMPLETE",
  "THESIS_ASSIGN_LECTURER",
  "THESIS_DELETE",
] as const;

const HISTORY_EVENTS: Record<string, string> = {
  THESIS_CREATE: "Khởi tạo đề tài",
  THESIS_UPDATE: "Cập nhật thông tin đề tài",
  THESIS_SUBMIT: "Gửi đề tài cho giảng viên phê duyệt",
  THESIS_APPROVE: "Phê duyệt đề tài, chuyển sang Đang thực hiện",
  THESIS_REVISION: "Yêu cầu sinh viên chỉnh sửa đề tài",
  THESIS_REJECT: "Từ chối đề tài",
  THESIS_COMPLETE: "Đánh dấu đề tài hoàn thành",
  THESIS_ASSIGN_LECTURER: "Thay đổi giảng viên hướng dẫn",
  THESIS_DELETE: "Xóa đề tài",
};

interface HistoryRow {
  id: number;
  action: string;
  actor_name: string | null;
  details: unknown;
  created_at: Date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Câu tiếng Việt mô tả sự kiện, đủ để hiển thị thẳng lên dòng thời gian. */
function describeEvent(action: string, details: unknown): string {
  const base = HISTORY_EVENTS[action] ?? "Thay đổi trên đề tài";
  if (action !== "THESIS_UPDATE" || !isRecord(details)) return base;

  // Thao tác thành viên dùng chung mã hành động THESIS_UPDATE (danh mục
  // `AuditAction` không có mã riêng), nên phân biệt bằng chi tiết đã ghi kèm.
  switch (details.change) {
    case "member_add":
      return "Thêm sinh viên vào đề tài";
    case "member_remove":
      return "Gỡ sinh viên khỏi đề tài";
    default:
      return base;
  }
}

/**
 * Dòng thời gian trạng thái, đọc từ nhật ký hệ thống.
 *
 * Dùng SQL thô có tham số hoá thay vì bộ lọc JSON của Prisma: điều kiện là
 * `details ->> 'thesis_id'` (so sánh dạng văn bản) nên nó vẫn tìm ra cả những
 * dòng cũ lỡ ghi `thesis_id` dưới dạng chuỗi. `LIMIT` là hàng rào bộ nhớ — một
 * đề tài chạy nhiều năm có thể tích hàng nghìn dòng nhật ký.
 */
export async function thesisHistory(thesisId: number, limit = 200) {
  // `LIMIT` được nội suy chứ không truyền dạng tham số: PostgreSQL đòi `LIMIT`
  // là bigint, còn tham số số của Prisma có thể tới nơi dưới dạng double và bị
  // từ chối. An toàn vì giá trị đã bị ép về số nguyên trong khoảng cho phép.
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 500);

  const rows = await prisma.$queryRaw<HistoryRow[]>`
    SELECT l.id          AS id,
           l.action      AS action,
           u.full_name   AS actor_name,
           l.details     AS details,
           l.created_at  AS created_at
      FROM system_logs l
      LEFT JOIN users u ON u.id = l.user_id
     WHERE l.details ->> 'thesis_id' = ${String(thesisId)}
       AND l.action IN (${Prisma.join([...HISTORY_ACTIONS])})
     ORDER BY l.created_at DESC, l.id DESC
     LIMIT ${Prisma.raw(String(safeLimit))}
  `;

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    actor_name: row.actor_name ?? "Hệ thống",
    event: describeEvent(row.action, row.details),
    created_at: row.created_at.toISOString(),
    details: row.details ?? null,
  }));
}

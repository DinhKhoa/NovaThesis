/**
 * KIỂM SOÁT TRUY CẬP THEO DỮ LIỆU
 *
 * `middleware/auth.ts` chỉ trả lời "anh thuộc vai trò nào". Tệp này trả lời câu
 * hỏi thật sự khó: "anh có được đụng vào ĐỀ TÀI NÀY không". Toàn bộ module đọc
 * hoặc ghi dữ liệu gắn với đề tài đều phải đi qua đây.
 *
 * `Yêu cầu dự án.md` §2.1 gọi đây là Tenant Isolation và nêu đích danh rủi ro:
 * quên giới hạn phạm vi khi tìm kiếm vector sẽ làm rò rỉ nội dung luận văn của
 * sinh viên khác. Vì vậy `visibleThesisIds()` bên dưới là NGUỒN SỰ THẬT DUY
 * NHẤT cho phạm vi ấy — module AI không được tự dựng câu truy vấn riêng.
 */
import type { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { forbidden, notFound } from "../lib/errors";
import type { AuthUser } from "../middleware/auth";

export type Capability =
  | "view"
  /** Sửa nội dung đề tài (tiêu đề, mô tả, lĩnh vực). */
  | "edit"
  /** Nộp minh chứng, tạo mốc, tải tài liệu — công việc thường ngày của SV. */
  | "contribute"
  /** Duyệt / từ chối / yêu cầu sửa. */
  | "review"
  /** Xoá đề tài. */
  | "delete";

export interface ThesisAccess {
  thesis_id: number;
  status: string;
  lecturer_id: number | null;
  created_by: number;
  /** Người dùng là sinh viên thành viên của đề tài. */
  isMember: boolean;
  /** Người dùng là giảng viên hướng dẫn đề tài. */
  isSupervisor: boolean;
  isAdmin: boolean;
}

/* ==========================================================================
   PHẠM VI XEM
   ========================================================================== */

/**
 * Tập id đề tài mà người dùng được phép đọc.
 *
 * `null` nghĩa là "không giới hạn" (Admin). Trả về `null` thay vì nạp toàn bộ
 * id trong hệ thống để câu truy vấn phía sau bỏ hẳn mệnh đề `IN (...)` — với
 * vài nghìn đề tài, danh sách id nhồi vào SQL sẽ chậm hơn nhiều so với không lọc.
 */
export async function visibleThesisIds(user: AuthUser): Promise<number[] | null> {
  if (user.role === "ADMIN") return null;

  if (user.role === "LECTURER" && user.lecturer_id !== null) {
    const rows = await prisma.thesis.findMany({
      where: { lecturer_id: user.lecturer_id, deleted_at: null },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  if (user.role === "STUDENT" && user.student_id !== null) {
    const rows = await prisma.thesisMember.findMany({
      where: { student_id: user.student_id, left_at: null, thesis: { deleted_at: null } },
      select: { thesis_id: true },
    });
    return rows.map((r) => r.thesis_id);
  }

  return [];
}

/**
 * Điều kiện `where` của Prisma giới hạn theo phạm vi người dùng.
 * Dùng cho mọi truy vấn danh sách đề tài.
 */
export async function thesisScopeFilter(user: AuthUser) {
  const ids = await visibleThesisIds(user);
  return ids === null ? {} : { id: { in: ids } };
}

/* ==========================================================================
   KIỂM TRA TỪNG ĐỀ TÀI
   ========================================================================== */

export async function loadThesisAccess(
  user: AuthUser,
  thesisId: number
): Promise<ThesisAccess> {
  const thesis = await prisma.thesis.findFirst({
    where: { id: thesisId, deleted_at: null },
    select: {
      id: true,
      status: true,
      lecturer_id: true,
      created_by: true,
      members: {
        where: { left_at: null },
        select: { student_id: true },
      },
    },
  });

  if (!thesis) throw notFound("Đề tài không tồn tại hoặc đã bị xóa.");

  return {
    thesis_id: thesis.id,
    status: thesis.status,
    lecturer_id: thesis.lecturer_id,
    created_by: thesis.created_by,
    isMember:
      user.student_id !== null && thesis.members.some((m) => m.student_id === user.student_id),
    isSupervisor: user.lecturer_id !== null && thesis.lecturer_id === user.lecturer_id,
    isAdmin: user.role === "ADMIN",
  };
}

export function can(access: ThesisAccess, capability: Capability, role: UserRole): boolean {
  if (access.isAdmin) return true;

  switch (capability) {
    case "view":
      return access.isMember || access.isSupervisor;

    case "contribute":
      // Đề tài đã hoàn thành thì đóng băng (Business rule UC 3.13: "sinh viên
      // và giảng viên không thể thay đổi thông tin hay tiến độ nữa").
      if (access.status === "COMPLETED") return false;
      return access.isMember || access.isSupervisor;

    case "edit":
      // UC 3.5 — không cho sửa khi đang chờ duyệt / đang thực hiện / hoàn thành.
      if (!access.isMember && !access.isSupervisor) return false;
      if (role === "LECTURER" && access.isSupervisor) return access.status !== "COMPLETED";
      return access.status === "DRAFT" || access.status === "REVISION_REQUIRED";

    case "review":
      return access.isSupervisor;

    case "delete":
      // UC 3.6 — chỉ xoá được đề tài chưa từng gửi duyệt.
      return access.isMember && access.status === "DRAFT";

    default:
      return false;
  }
}

/** Kiểm tra rồi ném lỗi nếu không đủ quyền. Hầu hết handler dùng hàm này. */
export async function assertThesisAccess(
  user: AuthUser,
  thesisId: number,
  capability: Capability = "view"
): Promise<ThesisAccess> {
  const access = await loadThesisAccess(user, thesisId);
  if (!can(access, capability, user.role)) {
    throw forbidden(denialReason(access, capability));
  }
  return access;
}

function denialReason(access: ThesisAccess, capability: Capability): string {
  const outsider = !access.isMember && !access.isSupervisor;
  if (outsider) return "Bạn không thuộc đề tài này.";

  switch (capability) {
    case "edit":
      if (access.status === "PENDING") {
        return "Không thể chỉnh sửa khi đề tài đang chờ giảng viên duyệt.";
      }
      if (access.status === "ONGOING") {
        return "Đề tài đã được duyệt và đang thực hiện, không chỉnh sửa được nữa.";
      }
      if (access.status === "COMPLETED") return "Đề tài đã hoàn thành, hồ sơ được khóa.";
      return "Bạn không có quyền chỉnh sửa đề tài này.";
    case "review":
      return "Chỉ giảng viên hướng dẫn của đề tài mới được phê duyệt.";
    case "delete":
      return "Chỉ xóa được đề tài đang ở trạng thái Nháp.";
    case "contribute":
      if (access.status === "COMPLETED") return "Đề tài đã hoàn thành, không cập nhật được nữa.";
      return "Bạn không có quyền thao tác trên đề tài này.";
    default:
      return "Bạn không có quyền thực hiện thao tác này.";
  }
}

/* ==========================================================================
   PHẠM VI TÀI LIỆU (dùng cho RAG / Semantic Search)
   ========================================================================== */

/**
 * Tập id tài liệu người dùng được phép đọc, tính CẢ tài liệu được chia sẻ sang
 * (UC 5.10).
 *
 * Đây chính là điểm mà ghi chú bảo mật trong ERD cảnh báo: quên bảng
 * `document_shares` thì tính năng chia sẻ hỏng; quên `visibleThesisIds` thì rò
 * rỉ dữ liệu. Gom cả hai vào một hàm để không có chỗ nào cài đặt lại sai.
 *
 * @param thesisId Giới hạn thêm về một đề tài cụ thể (phiên chat gắn với đề tài).
 */
export async function accessibleDocumentIds(
  user: AuthUser,
  thesisId?: number | null
): Promise<number[] | null> {
  const scope = await visibleThesisIds(user);

  // Admin không giới hạn — trừ khi tự giới hạn vào một đề tài.
  if (scope === null && thesisId == null) return null;

  const allowedTheses =
    thesisId != null
      ? scope === null
        ? [thesisId]
        : scope.filter((id) => id === thesisId)
      : (scope ?? []);

  if (allowedTheses.length === 0) return [];

  const [owned, shared] = await Promise.all([
    prisma.document.findMany({
      where: { thesis_id: { in: allowedTheses }, deleted_at: null },
      select: { id: true },
    }),
    prisma.documentShare.findMany({
      where: { thesis_id: { in: allowedTheses }, document: { deleted_at: null } },
      select: { document_id: true },
    }),
  ]);

  // Hợp nhất bằng Set: hai vòng lặp lồng nhau để lọc trùng sẽ là O(N²), đúng
  // thứ `Yêu cầu dự án.md` §3.3 bảo phải tránh.
  const ids = new Set<number>(owned.map((d) => d.id));
  for (const s of shared) ids.add(s.document_id);
  return [...ids];
}

/** Kiểm tra quyền đọc một tài liệu cụ thể (kể cả qua chia sẻ). */
export async function assertDocumentAccess(
  user: AuthUser,
  documentId: number,
  capability: Capability = "view"
) {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, deleted_at: null },
    select: { id: true, thesis_id: true, uploaded_by: true, filename: true },
  });
  if (!doc) throw notFound("Tài liệu không tồn tại hoặc đã bị xóa.");

  try {
    const access = await assertThesisAccess(user, doc.thesis_id, capability);
    return { document: doc, access, viaShare: false as const };
  } catch (err) {
    // Chỉ quyền ĐỌC mới đi tiếp qua đường chia sẻ: UC 5.10 ghi rõ người nhận
    // chỉ đọc, không sửa và không xoá.
    if (capability !== "view") throw err;

    const share = await prisma.documentShare.findFirst({
      where: { document_id: documentId },
      select: { thesis_id: true },
    });
    if (!share) throw err;

    const scope = await visibleThesisIds(user);
    if (scope !== null && !scope.includes(share.thesis_id)) throw err;

    return { document: doc, access: null, viaShare: true as const };
  }
}

/**
 * QUYỀN THAO TÁC PHÍA GIAO DIỆN
 *
 * Đây là đối trọng của `backend/src/domain/access.ts` ở phía client, và là nơi
 * DUY NHẤT trả lời câu hỏi "vai trò này có được bấm nút ghi không". Rải
 * `user.role === "ADMIN"` khắp các trang là cách chắc chắn để bốn màn hình có
 * bốn định nghĩa khác nhau về cùng một quyền — đó chính là tình trạng trước đây
 * ở `documents/page.tsx` và `feedbacks/page.tsx`.
 *
 * Ở đây CHỈ xét theo vai trò. Câu hỏi phụ thuộc dữ liệu — "đây có phải đề tài
 * của tôi không", "tôi có phải người hướng dẫn không", "đề tài đã khoá chưa" —
 * do server trả lời qua `domain/access.ts`. Chép lại luật đó xuống client là
 * tạo ra một bản sao chắc chắn sẽ lệch.
 *
 * ⚠️ BẤT ĐỐI XỨNG CÓ CHỦ ĐÍCH — đừng "đồng bộ" hai bên:
 *
 *   Backend `domain/access.ts:120` (`can()`) vẫn trả `true` cho Admin ở MỌI
 *   capability. Đó là chủ ý: Admin phải xử lý được sự vụ qua API khi người dùng
 *   kẹt (gỡ mốc treo, xoá tài liệu vi phạm…).
 *
 *   Giao diện thì chặt hơn: Admin xem được mọi thứ nhưng KHÔNG thấy nút ghi
 *   nào. Lý do là ranh giới trách nhiệm — Admin quản trị hệ thống, không làm
 *   luận văn thay sinh viên; và một cú bấm nhầm của Admin trên đề tài người
 *   khác trông y hệt một thao tác hợp lệ, không ai truy ra được.
 *
 *   Vậy nên "UI ẩn nút mà API vẫn cho" là thiết kế, không phải lỗi.
 */

import type { User } from "./auth";

/**
 * Người xem ở chế độ chỉ đọc.
 *
 * Trả `true` cả khi chưa biết người dùng là ai: trong khoảnh khắc `initialize()`
 * chưa xong, mặc định phải là "không được ghi". Mặc định ngược lại sẽ nhấp nháy
 * một loạt nút mà người dùng không có quyền bấm.
 */
export function isReadOnlyViewer(user: User | null | undefined): boolean {
  return !canWrite(user);
}

/**
 * Vai trò này có được ghi vào dữ liệu nghiệp vụ không.
 *
 * Sinh viên và giảng viên: có (giảng viên cũng đề xuất được đề tài — xem
 * `theses.routes.ts` POST `/`, khi đó chính họ là người hướng dẫn).
 * Quản trị viên: không — xem ghi chú bất đối xứng ở đầu tệp.
 */
export function canWrite(user: User | null | undefined): boolean {
  return user?.role === "STUDENT" || user?.role === "LECTURER";
}

/**
 * Nhãn giải thích vì sao không thao tác được, dùng cho `title`/tooltip.
 * Một nút biến mất không lời giải thích khiến người dùng tưởng hệ thống hỏng.
 */
export function readOnlyReason(user: User | null | undefined): string | undefined {
  if (canWrite(user)) return undefined;
  if (user?.role === "ADMIN") {
    return "Quản trị viên xem ở chế độ chỉ đọc. Thao tác nghiệp vụ thuộc về sinh viên và giảng viên.";
  }
  return "Bạn không có quyền thao tác trên nội dung này.";
}

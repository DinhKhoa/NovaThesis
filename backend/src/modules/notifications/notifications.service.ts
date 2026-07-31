/**
 * MODULE 8 — THÔNG BÁO (tầng nghiệp vụ)
 *
 * Tầng HTTP ở `notifications.routes.ts` chỉ còn việc kiểm tra đầu vào và trả
 * JSON; hai thứ dễ cài sai nhất được gom về đây:
 *
 *   • Quyền sở hữu: thông báo là dữ liệu CÁ NHÂN, không phải dữ liệu đề tài.
 *     Vì vậy nó không đi qua `domain/access.ts` — không có "đề tài" nào để hỏi
 *     quyền cả. Điều kiện duy nhất luôn là `user_id = người đang đăng nhập`.
 *   • Hợp nhất tuỳ chọn (UC 8.7): bảng `notification_preferences` có thể thiếu
 *     dòng, và giao diện thì luôn cần đủ 4 công tắc.
 */
import type { Notification, NotificationType } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { forbidden, notFound } from "../../lib/errors";

/**
 * Thứ tự này là thứ tự hiển thị trên giao diện cài đặt. Cố định trong mã thay vì
 * để CSDL quyết định: `findMany` không đảm bảo thứ tự, và danh sách công tắc
 * nhảy vị trí sau mỗi lần lưu là lỗi giao diện khó chịu mà không ai báo cáo.
 */
export const NOTIFICATION_TYPES: NotificationType[] = [
  "MILESTONE",
  "THESIS",
  "FEEDBACK",
  "SYSTEM",
];

/**
 * Mặc định khi người dùng chưa từng chỉnh cài đặt.
 *
 * PHẢI trùng với `DEFAULT_PREF` trong `services/notifications.ts`. Lệch nhau thì
 * giao diện hiện một trạng thái mà bộ phát thông báo không tuân theo — người
 * dùng thấy công tắc "bật" nhưng chẳng nhận được gì.
 */
const DEFAULT_PREFERENCE = { in_app: true, email: true } as const;

/** Khớp `NotificationPreference` trong `frontend/src/lib/services.ts`. */
export interface PreferenceDTO {
  type: NotificationType;
  in_app: boolean;
  email: boolean;
}

/* ==========================================================================
   QUYỀN SỞ HỮU
   ========================================================================== */

/**
 * Nạp một thông báo và khẳng định nó thuộc về người đang đăng nhập.
 *
 * Admin KHÔNG được miễn trừ: hộp thư của người khác không phải dữ liệu vận hành,
 * và không có use case nào cho phép quản trị viên đọc hay xoá hộ.
 *
 * Phân biệt 404 và 403 đúng như exception flow của UC 8.6 yêu cầu (bản ghi đã bị
 * xoá trước đó → 404; thông báo của người khác → 403). Chấp nhận việc 403 gián
 * tiếp xác nhận id đó có tồn tại: thông báo không mang nội dung nào ở phần thân
 * phản hồi, nên rò rỉ ở đây chỉ là một số nguyên.
 */
export async function loadOwnNotification(userId: number, id: number): Promise<Notification> {
  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification) throw notFound("Thông báo không tồn tại hoặc đã bị xóa.");
  if (notification.user_id !== userId) {
    throw forbidden("Bạn chỉ thao tác được trên thông báo của chính mình.");
  }
  return notification;
}

/* ==========================================================================
   UC 8.7 — TUỲ CHỌN NHẬN THÔNG BÁO
   ========================================================================== */

/**
 * Đọc tuỳ chọn của người dùng, luôn trả về đủ 4 loại.
 *
 * Người dùng tạo trước khi `seedNotificationPreferences()` tồn tại — hoặc được
 * tạo bằng seed/script — sẽ không có dòng nào. Trả mảng rỗng thì giao diện cài
 * đặt trắng trơn, trong khi thực tế họ vẫn đang nhận đủ mọi thông báo. Điền mặc
 * định ở đây khiến màn hình cài đặt phản ánh đúng hành vi thật của hệ thống.
 *
 * Cố ý KHÔNG ép `SYSTEM.in_app = true` khi đọc: nếu trong CSDL còn sót dòng cũ
 * bị tắt, `services/notifications.ts` vẫn đọc đúng dòng đó và bỏ qua thông báo.
 * Hiển thị "bật" trong khi hệ thống đang tắt là nói dối người dùng. Ràng buộc
 * bắt buộc được cưỡng chế ở đường GHI (`savePreferences`), nơi nó thực sự có
 * hiệu lực.
 */
export async function readPreferences(userId: number): Promise<PreferenceDTO[]> {
  const rows = await prisma.notificationPreference.findMany({
    where: { user_id: userId },
    select: { type: true, in_app: true, email: true },
  });

  const byType = new Map(rows.map((r) => [r.type, r]));

  return NOTIFICATION_TYPES.map((type) => {
    const row = byType.get(type);
    return {
      type,
      in_app: row?.in_app ?? DEFAULT_PREFERENCE.in_app,
      email: row?.email ?? DEFAULT_PREFERENCE.email,
    };
  });
}

export interface PreferenceInput {
  type: NotificationType;
  in_app: boolean;
  email: boolean;
}

/** Kết quả lưu, kèm cờ cho biết có mục nào bị ép theo ràng buộc bắt buộc không. */
export interface SavePreferencesResult {
  preferences: PreferenceDTO[];
  /** Các loại mà người dùng xin tắt in-app nhưng hệ thống không cho phép. */
  forced: NotificationType[];
}

/**
 * Lưu tuỳ chọn (UC 8.7).
 *
 * Business rule: "Một số thông báo hệ thống bắt buộc (như thông báo bảo mật)
 * không cho phép tắt." Cưỡng chế bằng cách ÉP `in_app = true` cho `SYSTEM` thay
 * vì ném lỗi 4xx: người dùng gạt nhầm một công tắc không đáng bị chặn cả lần
 * lưu. Phản hồi trả về trạng thái sau khi ép, nên công tắc tự bật lại ngay trên
 * giao diện. Kênh email của `SYSTEM` vẫn tắt được — hộp thư ngoài hệ thống là
 * lựa chọn của họ.
 */
export async function savePreferences(
  userId: number,
  input: PreferenceInput[]
): Promise<SavePreferencesResult> {
  const forced: NotificationType[] = [];

  const rows = input.map((p) => {
    const mustKeepInApp = p.type === "SYSTEM" && !p.in_app;
    if (mustKeepInApp) forced.push(p.type);
    return { type: p.type, in_app: mustKeepInApp ? true : p.in_app, email: p.email };
  });

  // Một transaction cho toàn bộ payload: lưu được 2/4 công tắc rồi hỏng giữa
  // chừng sẽ để lại cấu hình lai mà người dùng không hề chọn, và giao diện
  // (đã optimistic update) thì hiển thị bản họ vừa bấm.
  await prisma.$transaction(
    rows.map((p) =>
      prisma.notificationPreference.upsert({
        where: { user_id_type: { user_id: userId, type: p.type } },
        create: { user_id: userId, type: p.type, in_app: p.in_app, email: p.email },
        update: { in_app: p.in_app, email: p.email },
      })
    )
  );

  // Đọc lại thay vì ghép trong bộ nhớ: payload có thể chỉ chứa một loại, mà
  // giao diện thì cần đủ 4 dòng để dựng lại danh sách công tắc.
  return { preferences: await readPreferences(userId), forced };
}

/**
 * COOKIE PHIÊN ĐĂNG NHẬP
 *
 * Refresh token đi trong cookie `httpOnly`, không đi qua thân phản hồi và không
 * bao giờ chạm tới JavaScript của trang.
 *
 * Trước đây cả access token lẫn refresh token được trả về trong thân phản hồi và
 * frontend lưu vào `localStorage`. Cách đó có một lỗ hổng không vá được bằng mã
 * nguồn của chính ứng dụng: mọi script chạy trên trang đều đọc được
 * `localStorage`. Một thư viện phụ thuộc bị chèn mã độc, một đoạn nhúng của bên
 * thứ ba, hay một lỗ XSS ở bất kỳ đâu trong ứng dụng đều đủ để lấy trọn phiên
 * đăng nhập — và refresh token là thứ tệ nhất để mất, vì nó đổi được thành access
 * token mới suốt 14 ngày.
 *
 * Với `httpOnly`, script không đọc được cookie. Đổi lại phải xử lý CSRF, xem
 * `assertSameOrigin()` bên dưới.
 *
 * Access token thì không lưu ở đâu cả: nó nằm trong một biến trong bộ nhớ của
 * trang và mất khi tải lại. Sau khi tải lại, frontend gọi `/auth/refresh` một
 * lần để lấy token mới — cookie đi kèm tự động.
 */
import type { CookieOptions, Request, Response } from "express";
import { env } from "../config/env";
import { forbidden } from "./errors";

export const REFRESH_COOKIE = "nova_rt";

/**
 * Đường dẫn của cookie.
 *
 * Giới hạn ở nhóm `/auth` thay vì `/`: cookie chỉ được gửi kèm hai endpoint thật
 * sự cần nó (`/auth/refresh`, `/auth/logout`). Mọi request khác — tải tài liệu,
 * gọi trợ lý AI, xuất báo cáo — không mang theo refresh token, nên một sự cố ghi
 * log hoặc một proxy đặt sai cấu hình cũng không lộ được nó.
 */
const COOKIE_PATH = "/api/v1/auth";

function baseOptions(): CookieOptions {
  return {
    httpOnly: true,
    // `secure` chỉ bật ở production: ở môi trường phát triển trang chạy trên
    // http://localhost và trình duyệt sẽ loại bỏ cookie `secure`.
    secure: env.isProd,
    /*
     * `lax` đúng cho hai kịch bản triển khai phổ biến: frontend và backend cùng
     * tên miền (khác cổng vẫn là same-site theo chuẩn), hoặc cùng tên miền đăng
     * ký. Nếu triển khai hai tên miền khác nhau hẳn, phải đổi sang `none` kèm
     * `secure`, và khi đó `assertSameOrigin()` trở thành hàng rào CSRF duy nhất
     * — đó là lý do nó không phải tuỳ chọn.
     */
    sameSite: env.cookieSameSite,
    path: COOKIE_PATH,
  };
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    ...baseOptions(),
    maxAge: env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

/**
 * Xoá cookie.
 *
 * `clearCookie` chỉ có hiệu lực khi các thuộc tính định danh (`path`, `domain`,
 * `sameSite`, `secure`) trùng khớp với lúc đặt. Sai một thuộc tính thì trình
 * duyệt giữ nguyên cookie cũ và người dùng bấm "Đăng xuất" mà phiên vẫn còn.
 */
export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, baseOptions());
}

export function readRefreshCookie(req: Request): string | null {
  const raw = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/**
 * Hàng rào CSRF cho các endpoint dựa vào cookie.
 *
 * Vì cookie được trình duyệt gửi tự động, một trang bất kỳ có thể khiến trình
 * duyệt của người dùng POST tới `/auth/refresh` hoặc `/auth/logout`. Kẻ tấn công
 * không đọc được phản hồi (CORS chặn), nhưng vẫn gây được hai thứ khó chịu: xoay
 * vòng refresh token khiến người dùng bị đăng xuất, hoặc đăng xuất họ trực tiếp.
 *
 * Trình duyệt LUÔN gửi header `Origin` cho request POST, kể cả POST từ form
 * cross-site. Vì vậy đối chiếu `Origin` với danh sách cho phép là hàng rào đủ
 * dùng, không cần thêm token CSRF và không cần lưu gì ở client.
 *
 * Request không có `Origin` (curl, ứng dụng di động, healthcheck) được cho qua —
 * đó không phải ngữ cảnh trình duyệt nên không có cookie tự động để lợi dụng.
 */
export function assertSameOrigin(req: Request): void {
  const origin = req.get("origin");
  if (!origin) return;
  if (env.corsOrigins.includes(origin)) return;

  throw forbidden("Yêu cầu đến từ nguồn không được phép.");
}

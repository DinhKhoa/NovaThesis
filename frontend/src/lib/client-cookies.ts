/**
 * TUỲ CHỌN NGƯỜI DÙNG — LƯU BẰNG COOKIE, KHÔNG LƯU BẰNG localStorage
 *
 * Hệ thống không dùng `localStorage` ở bất kỳ đâu. Với dữ liệu đăng nhập, lý do
 * là bảo mật (xem `backend/src/lib/cookies.ts`). Với các tuỳ chọn giao diện như
 * chế độ sáng/tối hay thanh điều hướng thu gọn, lý do khác và thực dụng hơn:
 *
 *   • Cookie ĐỌC ĐƯỢC TỪ SERVER. Root layout đọc cookie rồi gắn luôn class lên
 *     `<html>` ở lần render đầu, nên không có khoảnh khắc trang hiện giao diện
 *     sáng rồi mới nháy sang tối. Với `localStorage` thì buộc phải chèn một
 *     script chặn render để tránh nháy — chính cách `next-themes` làm.
 *   • Một nơi duy nhất cho mọi trạng thái bền, thay vì hai cơ chế song song.
 *
 * Đây là cookie tuỳ chọn giao diện, KHÔNG phải cookie phiên: cố ý không
 * `httpOnly` vì client cần đọc và ghi, và không chứa gì bí mật.
 */

/** Một năm — tuỳ chọn giao diện không có lý do gì phải hết hạn sớm hơn. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;

  for (const part of document.cookie.split(";")) {
    const raw = part.trim();
    if (!raw.startsWith(`${name}=`)) continue;
    return decodeURIComponent(raw.slice(name.length + 1));
  }
  return null;
}

export function writeCookie(name: string, value: string): void {
  if (typeof document === "undefined") return;

  /* `SameSite=Lax` chứ không phải `None`: cookie này chỉ phục vụ chính trang
     web, không cần đi kèm request cross-site. `Secure` chỉ bật khi trang chạy
     HTTPS — đặt vô điều kiện thì trình duyệt loại bỏ cookie trên
     http://localhost và tuỳ chọn không lưu được ở môi trường phát triển. */
  const secure = typeof location !== "undefined" && location.protocol === "https:";

  document.cookie =
    `${name}=${encodeURIComponent(value)}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax` +
    (secure ? "; secure" : "");
}

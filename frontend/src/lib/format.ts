/**
 * Định dạng hiển thị.
 *
 * API trả về thời gian dạng ISO 8601 UTC — đó là cách duy nhất đúng để truyền
 * dữ liệu. Việc chuyển sang giờ và ngôn ngữ của người đang xem thuộc về tầng
 * này, vì chỉ trình duyệt mới biết múi giờ đó.
 */

const VI = "vi-VN";
const TZ_OPTIONS: Intl.DateTimeFormatOptions = { timeZone: "Asia/Ho_Chi_Minh" };

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `2026-07-25` — dùng cho hạn nộp, ngày tạo trong bảng. */
export function formatDate(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  return new Intl.DateTimeFormat("sv-SE", { ...TZ_OPTIONS }).format(d);
}

/** `2026-07-25 14:30` — dùng khi giờ có ý nghĩa (nhật ký, bình luận). */
export function formatDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  return new Intl.DateTimeFormat("sv-SE", {
    ...TZ_OPTIONS,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(d)
    .replace(",", "");
}

/** `14:30` — dùng trong bong bóng chat, nơi ngày đã hiển thị ở chỗ khác. */
export function formatTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  return new Intl.DateTimeFormat(VI, {
    ...TZ_OPTIONS,
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/**
 * `Vừa xong`, `3 giờ trước`, `Hôm qua`, `12/07`.
 *
 * Ngưỡng chuyển sang ngày tuyệt đối đặt ở 7 ngày: quá mốc đó, "23 ngày trước"
 * bắt người đọc phải tự nhẩm ra ngày, mà đó chính là thứ họ đang cần biết.
 */
export function formatRelative(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";

  const diffMs = Date.now() - d.getTime();
  const minutes = Math.floor(diffMs / 60_000);

  if (minutes < 1) return "Vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "Hôm qua";
  if (days < 7) return `${days} ngày trước`;

  return new Intl.DateTimeFormat(VI, {
    ...TZ_OPTIONS,
    day: "2-digit",
    month: "2-digit",
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
  }).format(d);
}

/** Số ngày còn lại tới hạn, tính theo nửa đêm địa phương. */
export function daysUntil(value: string | Date | null | undefined): number {
  const d = toDate(value);
  if (!d) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** `1.240` — dấu phân cách nghìn kiểu Việt Nam. */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat(VI).format(value);
}

export function formatPercent(value: number, digits = 0): string {
  return `${value.toFixed(digits)}%`;
}

/** Giá trị cho `<input type="date">` — luôn phải là `YYYY-MM-DD`. */
export function toDateInputValue(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

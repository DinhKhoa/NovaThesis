/**
 * Lỗi có mã HTTP.
 *
 * Toàn bộ thông điệp đều là tiếng Việt hướng tới người dùng cuối, vì frontend
 * (`lib/api.ts`) hiển thị thẳng `message` lên giao diện. Chi tiết kỹ thuật đi
 * vào log, không đi vào phản hồi — trình bày stack trace cho người lạ là kiểu
 * lộ thông tin cổ điển (OWASP A05).
 */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly errors?: Record<string, string[]>;
  /** Ngữ cảnh chỉ để ghi log, không bao giờ gửi ra client. */
  readonly context?: Record<string, unknown>;
  /**
   * Dữ liệu có cấu trúc ĐƯỢC PHÉP gửi ra client, kèm trong thân phản hồi lỗi.
   *
   * Đối lập hẳn với `context`. Sinh ra vì một thông điệp tiếng Việt không đủ để
   * giao diện dựng đồng hồ đếm ngược: "thử lại sau 15 phút" là chữ, còn
   * `locked_until` mới là thứ đếm được. Chỉ đặt vào đây những gì người dùng vốn
   * đã được biết — đừng dùng nó làm cửa sau cho chi tiết kỹ thuật.
   */
  readonly public?: Record<string, unknown>;

  constructor(
    status: number,
    message: string,
    opts: {
      code?: string;
      errors?: Record<string, string[]>;
      context?: Record<string, unknown>;
      public?: Record<string, unknown>;
    } = {}
  ) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = opts.code ?? defaultCode(status);
    this.errors = opts.errors;
    this.context = opts.context;
    this.public = opts.public;
  }
}

function defaultCode(status: number): string {
  switch (status) {
    case 400:
      return "BAD_REQUEST";
    case 401:
      return "UNAUTHORIZED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 410:
      return "GONE";
    case 413:
      return "PAYLOAD_TOO_LARGE";
    case 422:
      return "UNPROCESSABLE";
    case 429:
      return "TOO_MANY_REQUESTS";
    default:
      return status >= 500 ? "INTERNAL_ERROR" : "ERROR";
  }
}

export const badRequest = (m: string, errors?: Record<string, string[]>) =>
  new HttpError(400, m, { errors });

export const unauthorized = (m = "Bạn cần đăng nhập để tiếp tục.") =>
  new HttpError(401, m);

export const forbidden = (m = "Bạn không có quyền thực hiện thao tác này.") =>
  new HttpError(403, m);

export const notFound = (m = "Không tìm thấy dữ liệu yêu cầu.") =>
  new HttpError(404, m);

export const conflict = (m: string) => new HttpError(409, m);

export const gone = (m: string) => new HttpError(410, m);

export const tooLarge = (m: string) => new HttpError(413, m);

export const unprocessable = (m: string, errors?: Record<string, string[]>) =>
  new HttpError(422, m, { errors });

/**
 * Hạn mức nghiệp vụ (ví dụ số lần tóm tắt lại mỗi ngày ở UC 6.2), khác với
 * rate limit ở tầng middleware. Tách riêng để thông điệp nói đúng lý do người
 * dùng bị chặn thay vì một câu chung chung về tốc độ thao tác.
 */
export const tooManyRequests = (m: string) => new HttpError(429, m);

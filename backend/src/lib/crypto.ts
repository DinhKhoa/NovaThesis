/**
 * Nguyên thuỷ mật mã: băm mật khẩu, token dùng một lần, JWT và signed URL.
 */
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { unauthorized } from "./errors";

/* ==========================================================================
   MẬT KHẨU
   ========================================================================== */

/**
 * Argon2id — thuật toán được khuyến nghị trong `Yêu cầu dự án.md` §2.1 và là
 * lựa chọn hiện hành của OWASP. Tham số theo mức "moderate" của OWASP: 19 MiB
 * bộ nhớ, 2 vòng lặp, song song 1.
 *
 * Chi phí bộ nhớ mới là thứ quan trọng: nó khiến việc bẻ khoá hàng loạt bằng
 * GPU đắt đỏ theo cách mà số vòng lặp đơn thuần không làm được.
 */
const ARGON_OPTS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return argonHash(plain, ARGON_OPTS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argonVerify(hash, plain, ARGON_OPTS);
  } catch {
    // Băm hỏng hoặc sai định dạng — coi như không khớp thay vì làm sập request.
    return false;
  }
}

/* ==========================================================================
   TOKEN DÙNG MỘT LẦN (xác minh email, đặt lại mật khẩu, refresh token)
   ========================================================================== */

/**
 * Sinh cặp (token thô gửi cho người dùng, băm lưu vào CSDL).
 *
 * CSDL chỉ giữ bản băm. Nếu ai đó đọc trộm được bảng `users`, họ vẫn không đặt
 * lại được mật khẩu của bất kỳ ai — đây chính là lý do cột được đặt tên
 * `reset_token_hash` chứ không phải `reset_token`.
 */
export function generateToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, hash: sha256(token) };
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** So sánh trong thời gian hằng số, tránh rò rỉ qua thời gian phản hồi. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/* ==========================================================================
   JWT
   ========================================================================== */

export interface AccessTokenPayload {
  sub: number;
  role: "ADMIN" | "LECTURER" | "STUDENT";
  email: string;
  /** Định danh phiên, khớp với `refresh_tokens.id`, để thu hồi được. */
  sid?: number;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
    issuer: "novathesis",
    audience: "novathesis-app",
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    // `jwt.verify` khai báo trả `string | JwtPayload`. Ta biết rõ hình dạng
    // payload vì chính `signAccessToken` ở trên tạo ra nó, và chữ ký đã được
    // xác minh trước khi tới dòng này.
    return jwt.verify(token, env.JWT_SECRET, {
      issuer: "novathesis",
      audience: "novathesis-app",
    }) as unknown as AccessTokenPayload;
  } catch (e) {
    if (e instanceof jwt.TokenExpiredError) {
      throw unauthorized("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
    }
    throw unauthorized("Phiên đăng nhập không hợp lệ.");
  }
}

/* ==========================================================================
   SIGNED URL CHO TỆP
   ========================================================================== */

/**
 * `Yêu cầu dự án.md` §2.1: "File luận văn lưu trữ ở private bucket, truy cập
 * bằng Signed URL".
 *
 * Thư mục `storage/` không hề được phục vụ tĩnh. Muốn tải tệp phải có một URL
 * mang chữ ký HMAC gắn với đúng id tệp và một mốc hết hạn, nên đường link bị
 * chuyển tiếp cho người khác sẽ chết sau vài phút thay vì sống mãi.
 */
export function signFileUrl(kind: string, id: number, ttlSeconds = env.FILE_URL_TTL_SECONDS): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = fileSignature(kind, id, exp);
  return `${env.API_PUBLIC_URL}/api/v1/files/${kind}/${id}?exp=${exp}&sig=${sig}`;
}

export function verifyFileSignature(
  kind: string,
  id: number,
  exp: number,
  sig: string
): boolean {
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  return safeEqual(fileSignature(kind, id, exp), sig);
}

function fileSignature(kind: string, id: number, exp: number): string {
  return crypto
    .createHmac("sha256", env.FILE_URL_SECRET)
    .update(`${kind}:${id}:${exp}`)
    .digest("hex");
}

  /**
 * Giới hạn tần suất.
 *
 * Ba mức khác nhau vì ba mối đe doạ khác nhau: dò mật khẩu ồ ạt trên
 * `/auth/login`, spam email trên `/auth/forgot-password` (UC 1.5 nêu đích danh
 * "1 lần / 5 phút"), và lạm dụng API AI vốn tốn tiền theo từng lượt gọi.
 */
import rateLimit, { type Options } from "express-rate-limit";
import type { Request } from "express";
import { env } from "../config/env";
import { clientIp } from "../lib/http";

function base(overrides: Partial<Options>) {
  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    // Đếm theo user khi đã đăng nhập, theo IP khi chưa. Chỉ đếm theo IP sẽ phạt
    // nhầm cả phòng máy trong trường vốn dùng chung một địa chỉ NAT.
    keyGenerator: (req: Request) => (req.user ? `u:${req.user.id}` : `ip:${clientIp(req)}`),
    handler: (_req, res) => {
      res.status(429).json({
        message: "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.",
        code: "TOO_MANY_REQUESTS",
        status: 429,
      });
    },
    ...overrides,
  });
}

/** Mức chung cho toàn bộ API. */
export const generalLimiter = base({ limit: env.RATE_LIMIT_MAX });

/** UC 1.1 — hàng rào đầu tiên trước khi bộ đếm `failed_login_attempts` vào việc. */
export const authLimiter = base({
  windowMs: 15 * 60_000,
  limit: env.AUTH_RATE_LIMIT_MAX,
  skipSuccessfulRequests: true,
});

/** UC 1.5 — chống spam email đặt lại mật khẩu. */
export const passwordResetLimiter = base({
  windowMs: 5 * 60_000,
  limit: 3,
});

/** Bảo vệ ngân sách gọi API của nhà cung cấp AI. */
export const aiLimiter = base({
  windowMs: 60_000,
  limit: 20,
});

/** Tải tệp lên: nặng I/O, và mỗi tệp kéo theo một job nhúng vector. */
export const uploadLimiter = base({
  windowMs: 60_000,
  limit: 30,
});

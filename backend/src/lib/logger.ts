import pino from "pino";
import { env } from "../config/env";

/**
 * Logger ứng dụng.
 *
 * `redact` không phải trang trí: request log đi qua đây mang cả header
 * Authorization và body đăng nhập. Ghi thẳng chúng ra đĩa nghĩa là mật khẩu
 * người dùng nằm trần trong tệp log.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']",
      "*.password",
      "*.new_password",
      "*.old_password",
      "*.password_hash",
      "*.token",
      "*.access_token",
      "*.refresh_token",
    ],
    censor: "[đã ẩn]",
  },
  transport: env.isProd
    ? undefined
    : {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
      },
});

export type Logger = typeof logger;

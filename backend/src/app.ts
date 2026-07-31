/**
 * Lắp ráp ứng dụng Express.
 *
 * Tách khỏi `server.ts` để kiểm thử tích hợp dựng được app mà không mở cổng.
 */
import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { generalLimiter } from "./middleware/rate-limit";
import { apiRouter } from "./modules";

export function createApp(): Express {
  const app = express();

  // Sau reverse proxy (nginx/Caddy), `req.ip` phải đọc từ X-Forwarded-For, nếu
  // không mọi request đều trông như đến từ 127.0.0.1 và rate limit theo IP mất
  // tác dụng hoàn toàn.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(
    helmet({
      // API trả JSON và tệp tải về, không phục vụ HTML — CSP mặc định của helmet
      // không có tác dụng ở đây nhưng vẫn bật để phòng endpoint HTML tương lai.
      contentSecurityPolicy: {
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      crossOriginResourcePolicy: { policy: "cross-origin" },
      // Tệp tải về được phục vụ kèm Content-Disposition; nosniff ngăn trình
      // duyệt tự đoán rồi thực thi một tệp .txt chứa HTML.
      noSniff: true,
      referrerPolicy: { policy: "no-referrer" },
    })
  );

  app.use(
    cors({
      // Allowlist tường minh, không dùng `*`. Xem ghi chú ở `config/env.ts`.
      origin(origin, callback) {
        // Không có Origin = curl, ứng dụng di động, healthcheck — không phải
        // ngữ cảnh trình duyệt nên CORS không áp dụng.
        if (!origin) return callback(null, true);
        if (env.corsOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`Origin ${origin} không nằm trong danh sách cho phép`));
      },
      credentials: true,
      exposedHeaders: ["Content-Disposition", "X-Total-Count"],
      maxAge: 86_400,
    })
  );

  app.use(compression());
  app.use(cookieParser());

  // Giới hạn 1 MB: mọi endpoint nhận tệp đều dùng multipart qua multer, nên
  // không có lý do chính đáng nào để một body JSON lớn hơn thế.
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));

  app.use(
    pinoHttp({
      logger,
      // Health check mỗi vài giây sẽ nhấn chìm log nếu ghi ở mức info.
      autoLogging: {
        ignore: (req) => req.url?.startsWith("/health") ?? false,
      },
      customLogLevel(_req, res, err) {
        if (err || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
    })
  );

  app.use("/api", generalLimiter);
  app.use("/api/v1", apiRouter);

  app.get("/", (_req, res) => {
    res.json({
      system: "NovaThesis API",
      version: "1.0.0",
      status: "online",
      docs: "/api/v1/health/diagnostics",
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

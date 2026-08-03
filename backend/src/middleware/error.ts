/**
 * Xử lý lỗi tập trung.
 */
import type { ErrorRequestHandler, RequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import multer from "multer";
import { HttpError } from "../lib/errors";
import { logger } from "../lib/logger";
import { env } from "../config/env";

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    message: `Không tìm thấy endpoint ${req.method} ${req.path}.`,
    code: "ROUTE_NOT_FOUND",
    status: 404,
  });
};

/**
 * Quy mọi ngoại lệ về một hình dạng JSON duy nhất mà `lib/api.ts` biết đọc:
 * `{ message, code, status, errors? }`.
 *
 * Nguyên tắc: lỗi 5xx KHÔNG bao giờ để lộ thông điệp gốc ra ngoài. Lỗi Prisma
 * chẳng hạn thường kèm nguyên câu SQL và tên cột — chính là bản đồ lược đồ CSDL
 * dâng tận tay kẻ tấn công (OWASP A05: Security Misconfiguration).
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const mapped = mapError(err);

  const logPayload = {
    err: mapped.status >= 500 ? err : undefined,
    status: mapped.status,
    code: mapped.code,
    method: req.method,
    path: req.originalUrl,
    user_id: req.user?.id,
    context: err instanceof HttpError ? err.context : undefined,
  };

  if (mapped.status >= 500) logger.error(logPayload, mapped.logMessage);
  else if (mapped.status >= 400) logger.debug(logPayload, mapped.logMessage);

  res.status(mapped.status).json({
    message: mapped.message,
    code: mapped.code,
    status: mapped.status,
    ...(mapped.errors ? { errors: mapped.errors } : {}),
    // Trải ở cấp gốc chứ không lồng trong `details`: `lib/api.ts` đã đọc thân
    // lỗi ở cấp này rồi, thêm một tầng nữa là thêm một chỗ để đọc trượt.
    ...(mapped.extra ?? {}),
    // Stack chỉ lộ ra ở môi trường phát triển.
    ...(env.isProd || mapped.status < 500
      ? {}
      : { debug: err instanceof Error ? err.stack : String(err) }),
  });
};

interface Mapped {
  status: number;
  code: string;
  message: string;
  errors?: Record<string, string[]>;
  /** Trường bổ sung được phép gửi ra client — xem `HttpError.public`. */
  extra?: Record<string, unknown>;
  logMessage: string;
}

function mapError(err: unknown): Mapped {
  if (err instanceof HttpError) {
    return {
      status: err.status,
      code: err.code,
      message: err.message,
      errors: err.errors,
      extra: err.public,
      logMessage: err.message,
    };
  }

  if (err instanceof ZodError) {
    const errors: Record<string, string[]> = {};
    for (const i of err.issues) (errors[i.path.join(".") || "_"] ??= []).push(i.message);
    return {
      status: 422,
      code: "VALIDATION_ERROR",
      message: err.issues[0]?.message ?? "Dữ liệu gửi lên không hợp lệ.",
      errors,
      logMessage: "Lỗi xác thực dữ liệu",
    };
  }

  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? `Tệp vượt quá dung lượng cho phép (${env.MAX_UPLOAD_MB} MB).`
        : err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE"
          ? "Số lượng tệp tải lên vượt quá giới hạn."
          : "Không xử lý được tệp tải lên.";
    return {
      status: 413,
      code: `UPLOAD_${err.code}`,
      message,
      logMessage: `Multer: ${err.code}`,
    };
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return mapPrisma(err);
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    return {
      status: 400,
      code: "DB_VALIDATION",
      message: "Dữ liệu gửi lên không phù hợp với cấu trúc dữ liệu.",
      logMessage: "Prisma validation error",
    };
  }

  return {
    status: 500,
    code: "INTERNAL_ERROR",
    message: "Lỗi máy chủ nội bộ. Vui lòng thử lại sau.",
    logMessage: err instanceof Error ? err.message : "Lỗi không xác định",
  };
}

function mapPrisma(err: Prisma.PrismaClientKnownRequestError): Mapped {
  const target = (err.meta?.target as string[] | string | undefined) ?? [];
  const field = Array.isArray(target) ? target.join(", ") : String(target);

  switch (err.code) {
    case "P2002":
      return {
        status: 409,
        code: "DUPLICATE",
        message: friendlyUnique(field),
        logMessage: `Vi phạm ràng buộc duy nhất: ${field}`,
      };
    case "P2003":
      return {
        status: 409,
        code: "FK_VIOLATION",
        message: "Dữ liệu liên quan không tồn tại hoặc đang được tham chiếu ở nơi khác.",
        logMessage: `Vi phạm khoá ngoại: ${field}`,
      };
    case "P2025":
      return {
        status: 404,
        code: "NOT_FOUND",
        message: "Không tìm thấy dữ liệu yêu cầu.",
        logMessage: "Bản ghi không tồn tại",
      };
    default:
      return {
        status: 500,
        code: "DB_ERROR",
        message: "Lỗi truy cập cơ sở dữ liệu. Vui lòng thử lại sau.",
        logMessage: `Prisma ${err.code}`,
      };
  }
}

/** Ánh xạ tên cột sang câu chữ mà người dùng hiểu được. */
function friendlyUnique(field: string): string {
  if (field.includes("email")) return "Email này đã được sử dụng.";
  if (field.includes("student_code")) return "Mã số sinh viên này đã tồn tại.";
  if (field.includes("config_key")) return "Khóa cấu hình này đã tồn tại.";
  if (field.includes("name")) return "Tên này đã tồn tại.";
  return "Dữ liệu đã tồn tại trong hệ thống.";
}

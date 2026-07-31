/**
 * Tiện ích tầng HTTP dùng chung cho mọi module.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { z } from "zod";

/**
 * Bọc handler async để lỗi bị từ chối (rejection) đi tới middleware xử lý lỗi.
 *
 * Express 4 không bắt promise bị reject: thiếu lớp bọc này, một `await` thất
 * bại sẽ treo request cho tới khi client tự bỏ cuộc, không có phản hồi và
 * không có log — đúng kiểu lỗi khó truy nhất.
 */
export function asyncHandler<T extends RequestHandler>(fn: T): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/* ==========================================================================
   PHÂN TRANG
   ========================================================================== */

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  /** Chặn trên ở 100: `?per_page=1000000` không được phép trở thành DoS. */
  per_page: z.coerce.number().int().min(1).max(100).default(20),
});

export interface Page {
  page: number;
  perPage: number;
  skip: number;
  take: number;
}

export function parsePage(query: unknown): Page {
  const { page, per_page } = paginationSchema.parse(query ?? {});
  return { page, perPage: per_page, skip: (page - 1) * per_page, take: per_page };
}

/** Hình dạng phản hồi phân trang mà frontend (`PaginatedResponse`) đang chờ. */
export function paginated<T>(data: T[], total: number, page: Page) {
  return {
    data,
    total,
    page: page.page,
    perPage: page.perPage,
    totalPages: Math.max(1, Math.ceil(total / page.perPage)),
  };
}

/* ==========================================================================
   PHẢN HỒI
   ========================================================================== */

export function noContent(res: Response): void {
  res.status(204).end();
}

/** Địa chỉ IP thật của client, tôn trọng `trust proxy` đã bật ở `app.ts`. */
export function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

export function userAgent(req: Request): string | undefined {
  const ua = req.get("user-agent");
  return ua ? ua.slice(0, 512) : undefined;
}

/**
 * Đặt header cho luồng SSE (UC 6.5 — trả lời dạng streaming).
 *
 * `X-Accel-Buffering: no` là thứ khiến streaming hoạt động thật khi có nginx
 * đứng trước: mặc định nginx gom đệm phản hồi và người dùng sẽ nhận nguyên
 * khối văn bản một lần, đúng thứ mà streaming sinh ra để tránh.
 */
export function initSSE(res: Response): void {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
}

export function sendSSE(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Không dùng: giữ chữ ký để TypeScript nhắc nếu ai đó quên `next`. */
export type Handler = (req: Request, res: Response, next: NextFunction) => unknown;

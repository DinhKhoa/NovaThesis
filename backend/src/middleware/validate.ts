/**
 * Xác thực đầu vào bằng Zod.
 *
 * `Yêu cầu dự án.md` §2.1 yêu cầu kiểm tra và làm sạch dữ liệu ở CẢ client lẫn
 * server. Kiểm tra phía client trong `auth-sheet.tsx` chỉ ngăn nhầm lẫn; hàng
 * rào thật nằm ở đây, vì bất kỳ ai cũng gọi thẳng được API bằng curl.
 *
 * Middleware ghi đè `req.body`/`req.query`/`req.params` bằng dữ liệu ĐÃ phân
 * tích, nên handler phía sau chỉ thấy giá trị đã có kiểu, đã cắt khoảng trắng
 * và đã bị loại bỏ những khoá lạ.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { z, ZodError, type ZodTypeAny } from "zod";
import { HttpError } from "../lib/errors";

type Source = "body" | "query" | "params";

function toFieldErrors(err: ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

function run(schema: ZodTypeAny, source: Source): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const errors = toFieldErrors(result.error);
      const first = Object.values(errors)[0]?.[0] ?? "Dữ liệu gửi lên không hợp lệ.";
      return next(new HttpError(422, first, { errors, code: "VALIDATION_ERROR" }));
    }
    // `req.query` trong Express 5 là getter chỉ đọc; gán qua defineProperty để
    // cùng một mã chạy được trên cả hai đời Express.
    Object.defineProperty(req, source, {
      value: result.data,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    next();
  };
}

export const validateBody = (schema: ZodTypeAny) => run(schema, "body");
export const validateQuery = (schema: ZodTypeAny) => run(schema, "query");
export const validateParams = (schema: ZodTypeAny) => run(schema, "params");

/* ==========================================================================
   LÀM SẠCH CHUỖI
   ========================================================================== */

/**
 * Loại bỏ ký tự điều khiển và cắt khoảng trắng thừa.
 *
 * Cố ý KHÔNG escape HTML: React đã escape khi render, và escape hai lần biến
 * `Đề tài "AI & IoT"` thành `Đề tài &quot;AI &amp; IoT&quot;` lưu thẳng vào
 * CSDL. Chống XSS là việc của tầng hiển thị, không phải tầng lưu trữ.
 */
export function cleanText(input: string): string {
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0) as number;
    // Giữ tab (9), xuống dòng (10) và CR (13): mô tả đề tài, nội dung bình
    // luận đều là văn bản nhiều dòng. Bỏ phần còn lại của dải C0 và DEL.
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) continue;
    if (code === 127) continue;
    out += ch;
  }
  return out.trim();
}

/** Chuỗi bắt buộc, đã làm sạch, có ràng buộc độ dài. */
export const text = (min: number, max: number, label = "Trường này") =>
  z
    .string({
      required_error: `${label} là bắt buộc.`,
      invalid_type_error: `${label} phải là chuỗi.`,
    })
    .transform(cleanText)
    .pipe(
      z
        .string()
        .min(min, `${label} phải có ít nhất ${min} ký tự.`)
        .max(max, `${label} tối đa ${max} ký tự.`)
    );

/** Chuỗi tuỳ chọn: chuỗi rỗng được quy về `undefined` thay vì lưu "" vào CSDL. */
export const optionalText = (max: number, label = "Trường này") =>
  z
    .string()
    .optional()
    .nullable()
    .transform((v) => {
      if (v === undefined || v === null) return undefined;
      const t = cleanText(v);
      return t.length ? t : undefined;
    })
    .pipe(z.string().max(max, `${label} tối đa ${max} ký tự.`).optional());

/**
 * Tham số id trên đường dẫn.
 *
 * `z.coerce.number()` biến chuỗi không phải số thành `NaN` TRƯỚC khi zod kiểm
 * tra, nên `.int()` sẽ nổ trước và trả về thông điệp mặc định tiếng Anh
 * ("Expected number, received nan") thẳng ra giao diện. Vì vậy mọi bậc trong
 * chuỗi kiểm tra đều phải có thông điệp tiếng Việt riêng.
 */
export const idParam = z.object({
  id: z.coerce
    .number({ invalid_type_error: "Mã định danh không hợp lệ." })
    .refine((v) => Number.isFinite(v), "Mã định danh không hợp lệ.")
    .refine((v) => Number.isInteger(v), "Mã định danh phải là số nguyên.")
    .refine((v) => v > 0, "Mã định danh không hợp lệ."),
});

/** Số nguyên dương tuỳ chọn trong query string, kèm thông điệp tiếng Việt. */
export const optionalId = (label = "Mã định danh") =>
  z.coerce
    .number({ invalid_type_error: `${label} không hợp lệ.` })
    .refine((v) => Number.isFinite(v) && Number.isInteger(v) && v > 0, `${label} không hợp lệ.`)
    .optional();

export const emailField = z
  .string({ required_error: "Vui lòng nhập email." })
  .transform((v) => v.trim().toLowerCase())
  .pipe(z.string().email("Email không hợp lệ.").max(255));

/**
 * Chính sách mật khẩu — khớp đúng thông báo lỗi mà `auth-sheet.tsx` hiển thị,
 * để người dùng không thấy hai luật khác nhau giữa client và server.
 */
export const passwordField = z
  .string({ required_error: "Vui lòng nhập mật khẩu." })
  .min(8, "Mật khẩu tối thiểu 8 ký tự.")
  .max(128, "Mật khẩu tối đa 128 ký tự.")
  .refine(
    (v) => /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(v),
    "Mật khẩu cần có chữ hoa, chữ thường và số."
  );

/* ==========================================================================
   NGÀY (không kèm giờ)

   Chuyển về đây từ `modules/milestones/milestones.service.ts`: kỳ nghiên cứu của
   đề tài cũng cần đúng cách đọc ngày này, và để `theses.routes.ts` phải import
   từ module Mốc tiến độ là dựng một phụ thuộc ngược chiều chỉ vì một hàm 20 dòng.
   ========================================================================== */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Quy một chuỗi ngày về nửa đêm UTC, hoặc `null` nếu không đọc được.
 *
 * `new Date("2026-02-31")` KHÔNG ném lỗi mà lặng lẽ trả về 03-03, nên phải đối
 * chiếu lại từng thành phần thay vì tin vào việc parse thành công.
 */
export function toUtcMidnight(raw: string): Date | null {
  const value = raw.trim();
  if (DATE_ONLY.test(value)) {
    const y = Number(value.slice(0, 4));
    const m = Number(value.slice(5, 7));
    const d = Number(value.slice(8, 10));
    const parsed = new Date(Date.UTC(y, m - 1, d));
    const sameDay =
      parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d;
    return sameDay ? parsed : null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  // Giờ-phút của một hạn chót không mang ý nghĩa nghiệp vụ (giao diện dùng
  // `input type="date"`); cắt bỏ để hai mốc cùng ngày luôn so sánh bằng nhau.
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

/** Ngày bắt buộc. Lỗi định dạng đi ra dưới dạng 422 như mọi input khác. */
export function dateField(label: string) {
  return z
    .string({
      required_error: `${label} là bắt buộc.`,
      invalid_type_error: `${label} phải là chuỗi ngày dạng YYYY-MM-DD.`,
    })
    .transform((value, ctx) => {
      const parsed = toUtcMidnight(value);
      if (!parsed) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} không hợp lệ. Định dạng đúng: YYYY-MM-DD.`,
        });
        return z.NEVER;
      }
      return parsed;
    });
}

/**
 * Ngày tuỳ chọn, nhận cả chuỗi rỗng.
 *
 * Ô lọc trên giao diện gửi `?from=` khi người dùng xoá giá trị. Dùng
 * `z.preprocess` để quy về `undefined` thì TypeScript mất luôn kiểu đầu ra (thành
 * `unknown`) và mọi chỗ dùng phải ép kiểu; xử lý trong `transform` giữ được
 * `Date | undefined` đúng nghĩa.
 */
export function optionalDateField(label: string) {
  return z
    .string({ invalid_type_error: `${label} phải là chuỗi ngày dạng YYYY-MM-DD.` })
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || value.trim() === "") return undefined;
      const parsed = toUtcMidnight(value);
      if (!parsed) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} không hợp lệ. Định dạng đúng: YYYY-MM-DD.`,
        });
        return z.NEVER;
      }
      return parsed;
    });
}

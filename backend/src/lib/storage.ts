/**
 * LƯU TRỮ TỆP RIÊNG TƯ
 *
 * `Yêu cầu dự án.md` §2.1: "File luận văn lưu trữ ở private bucket, truy cập
 * bằng Signed URL". Ở đây "bucket" là thư mục `storage/` và điều quan trọng
 * nhất là điều KHÔNG có: không hề có `express.static()` nào trỏ vào nó. Mọi
 * byte đi ra đều qua một handler đã kiểm tra quyền.
 *
 * Bố cục: `storage/<khoang>/<yyyy>/<mm>/<32-hex>.<ext>`
 * Tên tệp trên đĩa được sinh ngẫu nhiên, tên gốc chỉ nằm trong CSDL. Nhờ vậy
 * `../../etc/passwd` hay `bao_cao.pdf.exe` không bao giờ chạm tới hệ thống tệp,
 * và hai sinh viên nộp cùng tên `bao_cao.pdf` không ghi đè lên nhau.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { env } from "../config/env";
import { badRequest, notFound } from "./errors";
import { logger } from "./logger";

export type StorageArea =
  | "documents"
  | "evidence"
  | "feedback"
  | "avatars"
  | "exports"
  /** Ảnh thẻ giảng viên kèm đơn đăng ký — chỉ Admin xét duyệt được xem. */
  | "credentials";

export interface StoredFile {
  /** Đường dẫn tương đối lưu vào CSDL, ví dụ `documents/2026/07/ab12….pdf`. */
  relativePath: string;
  absolutePath: string;
  size: number;
}

function areaRoot(area: StorageArea): string {
  return path.join(env.storageRoot, area);
}

/**
 * Chặn path traversal.
 *
 * Đường dẫn trong CSDL đáng lẽ luôn an toàn vì do chính hệ thống sinh ra, nhưng
 * "đáng lẽ" là thứ khiến người ta mất dữ liệu. Kiểm tra lại ở mọi lần đọc/ghi
 * khiến một chỗ tiêm nhiễm ở nơi khác không leo thang thành đọc tuỳ ý ổ đĩa.
 */
export function resolveInsideStorage(relativePath: string): string {
  const absolute = path.resolve(env.storageRoot, relativePath);
  const root = path.resolve(env.storageRoot);
  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    throw badRequest("Đường dẫn tệp không hợp lệ.");
  }
  return absolute;
}

export async function ensureStorage(): Promise<void> {
  const areas: StorageArea[] = [
    "documents",
    "evidence",
    "feedback",
    "avatars",
    "exports",
    "credentials",
  ];
  await Promise.all(areas.map((a) => fsp.mkdir(areaRoot(a), { recursive: true })));
}

/** Chỉ giữ phần mở rộng đã lọc; bỏ hoàn toàn phần tên do người dùng đặt. */
function safeExtension(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : "";
}

function newRelativePath(area: StorageArea, originalName: string): string {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const name = crypto.randomBytes(16).toString("hex") + safeExtension(originalName);
  return path.join(area, yyyy, mm, name);
}

/**
 * Ghi buffer xuống đĩa.
 *
 * Dùng cho tệp nhỏ (ảnh đại diện, đính kèm bình luận) đã nằm sẵn trong RAM.
 * Tài liệu lớn phải dùng `saveStream` để không nạp cả tệp 50 MB vào bộ nhớ.
 */
export async function saveBuffer(
  area: StorageArea,
  originalName: string,
  data: Buffer
): Promise<StoredFile> {
  const relativePath = newRelativePath(area, originalName);
  const absolutePath = resolveInsideStorage(relativePath);
  await fsp.mkdir(path.dirname(absolutePath), { recursive: true });
  await fsp.writeFile(absolutePath, data, { mode: 0o600 });
  return { relativePath, absolutePath, size: data.byteLength };
}

/**
 * Ghi từ luồng đọc.
 *
 * `Yêu cầu dự án.md` §2.4 ("Resource Constrained Thinking") yêu cầu stream tệp
 * thay vì nạp trọn vào RAM: 20 sinh viên cùng nộp luận văn 50 MB mà đọc hết vào
 * bộ nhớ là 1 GB dung lượng heap chỉ để chép tệp.
 */
export async function saveStream(
  area: StorageArea,
  originalName: string,
  source: NodeJS.ReadableStream
): Promise<StoredFile> {
  const relativePath = newRelativePath(area, originalName);
  const absolutePath = resolveInsideStorage(relativePath);
  await fsp.mkdir(path.dirname(absolutePath), { recursive: true });

  const sink = fs.createWriteStream(absolutePath, { mode: 0o600 });
  try {
    await pipeline(source, sink);
  } catch (err) {
    // Tệp ghi dở là rác: dọn ngay thay vì để tích tụ trên đĩa.
    await fsp.rm(absolutePath, { force: true });
    throw err;
  }

  const stat = await fsp.stat(absolutePath);
  return { relativePath, absolutePath, size: stat.size };
}

export async function readFileBuffer(relativePath: string): Promise<Buffer> {
  const absolute = resolveInsideStorage(relativePath);
  try {
    return await fsp.readFile(absolute);
  } catch {
    throw notFound("Tệp không còn tồn tại trên máy chủ.");
  }
}

export function createReadStream(relativePath: string): fs.ReadStream {
  return fs.createReadStream(resolveInsideStorage(relativePath));
}

export async function fileExists(relativePath: string): Promise<boolean> {
  try {
    await fsp.access(resolveInsideStorage(relativePath));
    return true;
  } catch {
    return false;
  }
}

export async function statFile(relativePath: string): Promise<fs.Stats | null> {
  try {
    return await fsp.stat(resolveInsideStorage(relativePath));
  } catch {
    return null;
  }
}

/**
 * Xoá tệp.
 *
 * Cố ý không ném lỗi: xoá bản ghi trong CSDL mới là hành động người dùng quan
 * tâm. Một tệp mồ côi trên đĩa là rác cần dọn, không phải lý do để trả về 500
 * cho thao tác đã thành công về mặt nghiệp vụ.
 */
export async function deleteFile(relativePath: string | null | undefined): Promise<void> {
  if (!relativePath) return;
  try {
    await fsp.rm(resolveInsideStorage(relativePath), { force: true });
  } catch (err) {
    logger.warn({ err, relativePath }, "Không xóa được tệp trên đĩa");
  }
}

/* ==========================================================================
   KIỂM TRA LOẠI TỆP
   ========================================================================== */

export const DOCUMENT_MIME: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/msword": [".doc"],
  "text/plain": [".txt", ".md"],
};

export const EVIDENCE_MIME: Record<string, string[]> = {
  ...DOCUMENT_MIME,
  "application/zip": [".zip"],
  "application/x-zip-compressed": [".zip"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
};

export const ATTACHMENT_MIME: Record<string, string[]> = {
  ...DOCUMENT_MIME,
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
};

export const AVATAR_MIME: Record<string, string[]> = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
};

/**
 * Ảnh thẻ giảng viên trong đơn đăng ký.
 *
 * Cùng tập với ảnh đại diện chứ không dùng chung hằng số: đây là ảnh chụp giấy
 * tờ do người CHƯA có tài khoản gửi lên, nên tập định dạng của nó cần nới hay
 * siết được độc lập với ảnh đại diện.
 */
export const CREDENTIAL_MIME: Record<string, string[]> = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
};

/**
 * Kiểm tra CẢ mime type lẫn phần mở rộng.
 *
 * Trình duyệt gửi mime type là do client tự khai, nên riêng nó không đáng tin.
 * Đối chiếu chéo với đuôi tệp bắt được trường hợp `shell.php` được khai là
 * `application/pdf`.
 */
export function assertAllowedType(
  allowed: Record<string, string[]>,
  mimetype: string,
  originalName: string,
  label = "Định dạng tệp không được hỗ trợ."
): void {
  const exts = allowed[mimetype];
  const ext = path.extname(originalName).toLowerCase();
  if (!exts || !exts.includes(ext)) {
    throw badRequest(`${label} Cho phép: ${uniqueExtensions(allowed).join(", ")}.`);
  }
}

function uniqueExtensions(allowed: Record<string, string[]>): string[] {
  return [...new Set(Object.values(allowed).flat())].sort();
}

/** Định dạng dung lượng cho thông báo tới người dùng. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

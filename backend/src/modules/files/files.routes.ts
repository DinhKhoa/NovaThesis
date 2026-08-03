/**
 * TẢI TỆP
 *
 * Thư mục `storage/` không hề được phục vụ tĩnh. Đây là con đường duy nhất để
 * một byte đi ra ngoài, và nó chấp nhận hai loại chứng cứ uỷ quyền:
 *
 *   1. Bearer token + kiểm tra quyền trên đề tài — dùng cho fetch từ ứng dụng.
 *   2. Signed URL có hạn — dùng cho thẻ `<img>`, `<iframe>` preview và link tải
 *      trực tiếp, những nơi trình duyệt không gửi kèm header Authorization.
 *
 * Đó chính là mô hình "private bucket + Signed URL" mà `Yêu cầu dự án.md` §2.1
 * yêu cầu, cài đặt trên hệ thống tệp cục bộ.
 */
import { Router, type Request } from "express";
import path from "node:path";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/http";
import { optionalAuth } from "../../middleware/auth";
import { validateParams, validateQuery } from "../../middleware/validate";
import { verifyFileSignature } from "../../lib/crypto";
import { forbidden, notFound } from "../../lib/errors";
import { createReadStream, statFile } from "../../lib/storage";
import { assertDocumentAccess, assertThesisAccess } from "../../domain/access";
import { audit, AuditAction } from "../../lib/audit";

export const filesRouter = Router();

const paramsSchema = z.object({
  kind: z.enum(["document", "version", "evidence", "feedback", "avatar", "credential"]),
  id: z.coerce.number().int().positive(),
});

const querySchema = z.object({
  exp: z.coerce.number().int().optional(),
  sig: z.string().optional(),
  /** `?disposition=inline` để xem trước trong trình duyệt thay vì tải xuống. */
  disposition: z.enum(["inline", "attachment"]).default("attachment"),
});

interface ResolvedFile {
  relativePath: string;
  filename: string;
  mimeType: string;
}

filesRouter.get(
  "/:kind/:id",
  validateParams(paramsSchema),
  validateQuery(querySchema),
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { kind, id } = req.params as unknown as z.infer<typeof paramsSchema>;
    const { exp, sig, disposition } = req.query as unknown as z.infer<typeof querySchema>;

    const signed = exp !== undefined && sig !== undefined && verifyFileSignature(kind, id, exp, sig);

    // Chữ ký sai hoặc hết hạn mà không có phiên đăng nhập nào → dừng ngay,
    // trước cả khi chạm CSDL.
    if (!signed && !req.user) {
      throw forbidden("Liên kết tải tệp đã hết hạn hoặc không hợp lệ.");
    }

    const file = await resolveFile(kind, id);
    if (!file) throw notFound("Tệp không tồn tại.");

    // Signed URL đã tự nó là uỷ quyền. Nếu không có, phải kiểm tra quyền theo
    // đề tài như mọi endpoint khác.
    if (!signed) {
      await authorize(kind, id, req);
    }

    const stat = await statFile(file.relativePath);
    if (!stat) throw notFound("Tệp không còn tồn tại trên máy chủ.");

    if (kind === "document" || kind === "version") {
      audit({
        action: AuditAction.DOCUMENT_DOWNLOAD,
        req,
        details: { kind, id, filename: file.filename, via_signed_url: signed },
      });
    }

    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Length", stat.size);
    // `encodeURIComponent` cho tên tệp tiếng Việt: header HTTP là latin-1, tên
    // có dấu chưa mã hoá sẽ bị cắt cụt hoặc làm hỏng cả header.
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename="${asciiFallback(file.filename)}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`
    );
    // Tệp riêng tư: không để proxy trung gian lưu đệm.
    res.setHeader("Cache-Control", "private, max-age=0, no-store");

    createReadStream(file.relativePath).pipe(res);
  })
);

async function resolveFile(kind: string, id: number): Promise<ResolvedFile | null> {
  switch (kind) {
    case "document": {
      const doc = await prisma.document.findFirst({
        where: { id, deleted_at: null },
        select: { file_path: true, filename: true, mime_type: true },
      });
      return doc
        ? { relativePath: doc.file_path, filename: doc.filename, mimeType: doc.mime_type }
        : null;
    }
    case "version": {
      const v = await prisma.documentVersion.findUnique({
        where: { id },
        select: {
          file_path: true,
          mime_type: true,
          version_number: true,
          document: { select: { filename: true } },
        },
      });
      if (!v) return null;
      const ext = path.extname(v.document.filename);
      const base = path.basename(v.document.filename, ext);
      return {
        relativePath: v.file_path,
        filename: `${base}_v${v.version_number}${ext}`,
        mimeType: v.mime_type,
      };
    }
    case "evidence": {
      const m = await prisma.milestone.findFirst({
        where: { id, deleted_at: null },
        select: { evidence_file_url: true, evidence_filename: true },
      });
      if (!m?.evidence_file_url) return null;
      return {
        relativePath: m.evidence_file_url,
        filename: m.evidence_filename ?? "minh-chung",
        mimeType: guessMime(m.evidence_filename ?? ""),
      };
    }
    case "feedback": {
      const f = await prisma.feedback.findFirst({
        where: { id, deleted_at: null },
        select: { file_url: true, file_name: true },
      });
      if (!f?.file_url) return null;
      return {
        relativePath: f.file_url,
        filename: f.file_name ?? "dinh-kem",
        mimeType: guessMime(f.file_name ?? ""),
      };
    }
    case "avatar": {
      const u = await prisma.user.findUnique({
        where: { id },
        select: { avatar_url: true, full_name: true },
      });
      if (!u?.avatar_url) return null;
      return {
        relativePath: u.avatar_url,
        filename: `avatar-${id}${path.extname(u.avatar_url)}`,
        mimeType: guessMime(u.avatar_url),
      };
    }
    /* `id` ở đây là user_id chứ không phải `lecturers.id` — cùng khoá mà các
       endpoint duyệt đơn đang dùng (`/admin/lecturer-applications/:userId/...`),
       nên trang quản trị không phải mang theo hai loại định danh cho cùng một
       hàng. Cố ý KHÔNG lọc `deleted_at`: đơn bị từ chối thì tài khoản bị xoá
       mềm, mà Admin vẫn cần mở lại ảnh thẻ để giải trình quyết định đó. */
    case "credential": {
      const l = await prisma.lecturer.findUnique({
        where: { user_id: id },
        select: { credential_image_url: true },
      });
      if (!l?.credential_image_url) return null;
      return {
        relativePath: l.credential_image_url,
        filename: `the-giang-vien-${id}${path.extname(l.credential_image_url)}`,
        mimeType: guessMime(l.credential_image_url),
      };
    }
    default:
      return null;
  }
}

async function authorize(kind: string, id: number, req: Request): Promise<void> {
  const user = req.user;
  if (!user) throw forbidden("Bạn cần đăng nhập để tải tệp này.");

  switch (kind) {
    case "document":
      await assertDocumentAccess(user, id, "view");
      return;
    case "version": {
      const v = await prisma.documentVersion.findUnique({
        where: { id },
        select: { document_id: true },
      });
      if (!v) throw notFound("Tệp không tồn tại.");
      await assertDocumentAccess(user, v.document_id, "view");
      return;
    }
    case "evidence": {
      const m = await prisma.milestone.findFirst({
        where: { id, deleted_at: null },
        select: { thesis_id: true },
      });
      if (!m) throw notFound("Tệp không tồn tại.");
      await assertThesisAccess(user, m.thesis_id, "view");
      return;
    }
    case "feedback": {
      const f = await prisma.feedback.findFirst({
        where: { id, deleted_at: null },
        select: { milestone_id: true, document_id: true },
      });
      if (!f) throw notFound("Tệp không tồn tại.");
      if (f.milestone_id) {
        const m = await prisma.milestone.findUnique({
          where: { id: f.milestone_id },
          select: { thesis_id: true },
        });
        if (m) await assertThesisAccess(user, m.thesis_id, "view");
        return;
      }
      if (f.document_id) {
        await assertDocumentAccess(user, f.document_id, "view");
      }
      return;
    }
    case "avatar":
      // Ảnh đại diện hiển thị khắp nơi (bình luận, bảng người dùng, sidebar).
      // Mọi tài khoản đã đăng nhập đều xem được — đó là mục đích của nó.
      return;
    case "credential":
      // Ảnh giấy tờ tuỳ thân của người ngoài hệ thống. Chỉ Admin — người phải
      // nhìn nó để ra quyết định duyệt — được xem, kể cả khi đã đăng nhập bằng
      // tài khoản giảng viên.
      if (user.role !== "ADMIN") {
        throw forbidden("Chỉ quản trị viên mới xem được ảnh thẻ giảng viên.");
      }
      return;
    default:
      throw forbidden("Không xác định được loại tệp.");
  }
}

function asciiFallback(filename: string): string {
  return filename.normalize("NFD").replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'") || "download";
}

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".zip": "application/zip",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".csv": "text/csv; charset=utf-8",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function guessMime(filename: string): string {
  return MIME_BY_EXT[path.extname(filename).toLowerCase()] ?? "application/octet-stream";
}

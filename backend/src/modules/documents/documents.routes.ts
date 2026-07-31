/**
 * MODULE 5 — QUẢN LÝ TÀI LIỆU NGHIÊN CỨU
 *
 * Ba quyết định chi phối cả tệp này:
 *
 *   1. Phạm vi đọc luôn tính qua `accessibleDocumentIds()` / `assertDocumentAccess()`
 *      — tức là gồm cả tài liệu được chia sẻ tới (UC 5.10). Lọc tay theo
 *      `thesis_id` sẽ vừa làm hỏng chia sẻ vừa vi phạm Tenant Isolation.
 *   2. Tệp không bao giờ đi thẳng ra ngoài từ đây: `storage/` không được phục vụ
 *      tĩnh, endpoint chi tiết chỉ trả về Signed URL có hạn (`lib/crypto.ts`).
 *   3. Lập chỉ mục AI là việc của worker. Người dùng nhận 201 ngay khi tệp nằm
 *      trên đĩa; `documents.status_ai` là nơi họ theo dõi phần còn lại (UC 5.9).
 */
import { Router, type Request, type RequestHandler } from "express";
import multer from "multer";
import { z } from "zod";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { logger } from "../../lib/logger";
import { asyncHandler, noContent, paginated, paginationSchema, parsePage } from "../../lib/http";
import { badRequest, conflict, forbidden, HttpError, notFound } from "../../lib/errors";
import { audit, AuditAction } from "../../lib/audit";
import { signFileUrl } from "../../lib/crypto";
import { assertAllowedType, deleteFile, DOCUMENT_MIME, saveBuffer } from "../../lib/storage";
import { currentUser, requireAuth } from "../../middleware/auth";
import { aiLimiter, uploadLimiter } from "../../middleware/rate-limit";
import { cleanText, idParam, optionalText, text, validateBody, validateParams, validateQuery } from "../../middleware/validate";
import { assertDocumentAccess, assertThesisAccess } from "../../domain/access";
import { enqueueIndexing } from "../../workers/document-indexer";
import { deleteChunks } from "../../services/ai/vector.repository";
import { toDocumentDTO, toDocumentVersionDTO } from "../serializers";
import {
  addDocumentVersion,
  createDocumentWithFirstVersion,
  decodeUploadFilename,
  listDocuments,
  listTagsInScope,
  loadDocumentDetail,
  notifyShareRecipients,
  notifySupervisorAboutUpload,
  parseTagList,
  sanitizeFilename,
  SHARE_INCLUDE,
  toDocumentShareDTO,
  VERSION_INCLUDE,
  type StoredUpload,
} from "./documents.service";

export const documentsRouter = Router();

/* ==========================================================================
   NHẬN TỆP
   ========================================================================== */

/**
 * `memoryStorage` chứ không phải `diskStorage`.
 *
 * `diskStorage` tự đặt tên tệp trong thư mục đích, trong khi bố cục lưu trữ của
 * dự án (`storage/<khoang>/<yyyy>/<mm>/<32-hex>.<ext>`) do `lib/storage.ts`
 * quyết định — hai bên tranh nhau đặt tên thì tên ngẫu nhiên chống trùng và
 * chống path traversal mất tác dụng. Đổi lại, tệp nằm trong RAM tới 50 MB; giới
 * hạn `files: 1` cộng `uploadLimiter` là thứ chặn không cho con số đó nhân lên.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadBytes, files: 1 },
});

/**
 * Bọc middleware của multer để lỗi định dạng/dung lượng cũng vào nhật ký.
 *
 * Nếu gọi thẳng `upload.single()`, lỗi `LIMIT_FILE_SIZE` bị ném từ trong
 * middleware và handler không bao giờ chạy — sự cố tải lên sẽ biến mất khỏi
 * `system_logs`, đúng thứ mà UC 2.8 muốn thấy.
 */
function receiveFile(field: string): RequestHandler {
  const middleware = upload.single(field);
  return (req, res, next) => {
    middleware(req, res, (err: unknown) => {
      if (err) {
        audit({
          action: AuditAction.DOCUMENT_UPLOAD_ERROR,
          req,
          level: "ERROR",
          details: {
            reason: err instanceof multer.MulterError ? err.code : "UNKNOWN",
            max_bytes: env.maxUploadBytes,
          },
        });
        return next(err);
      }
      next();
    });
  };
}

/** Kiểm tra tệp gửi lên rồi ghi xuống đĩa; mọi lỗi đều để lại dấu vết kiểm toán. */
async function acceptDocumentFile(
  req: Request,
  context: Record<string, unknown>
): Promise<StoredUpload> {
  const file = req.file;
  if (!file) {
    audit({ action: AuditAction.DOCUMENT_UPLOAD_ERROR, req, level: "ERROR", details: { ...context, reason: "NO_FILE" } });
    throw badRequest("Vui lòng chọn tệp tài liệu để tải lên.");
  }

  const originalName = decodeUploadFilename(file.originalname);

  try {
    assertAllowedType(DOCUMENT_MIME, file.mimetype, originalName);
  } catch (err) {
    audit({
      action: AuditAction.DOCUMENT_UPLOAD_ERROR,
      req,
      level: "ERROR",
      details: { ...context, reason: "MIME_NOT_ALLOWED", filename: originalName, mime_type: file.mimetype },
    });
    throw err;
  }

  const stored = await saveBuffer("documents", originalName, file.buffer);
  return {
    relativePath: stored.relativePath,
    size: stored.size,
    mimeType: file.mimetype,
    originalName,
  };
}

/**
 * Ghi CSDL với cam kết dọn tệp nếu thất bại.
 *
 * UC 5.1 exception 6a đòi "rollback tiến trình". Tệp đã nằm trên đĩa trước khi
 * transaction chạy, nên không có bản ghi nào trỏ tới nó khi transaction cuộn lại
 * — thiếu bước này, mỗi lần ghi hỏng để lại một tệp mồ côi không ai tìm ra.
 */
async function withFileCleanup<T>(file: StoredUpload, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    await deleteFile(file.relativePath);
    throw err;
  }
}

/* ==========================================================================
   LƯỢC ĐỒ ĐẦU VÀO
   ========================================================================== */

/**
 * `invalid_type_error` chứ không phải `required_error`: `z.coerce` chạy
 * `Number(undefined)` → `NaN` trước khi zod kiểm tra, nên thiếu trường sẽ rơi
 * vào nhánh "sai kiểu" và người dùng nhận được câu "Expected number, received
 * nan" nếu chỉ đặt `required_error`.
 */
const thesisIdField = (label: string) =>
  z.coerce
    .number({ invalid_type_error: label })
    .int(label)
    .positive(label);

const listQuerySchema = paginationSchema.extend({
  thesis_id: thesisIdField("Mã đề tài không hợp lệ.").optional(),
  search: optionalText(200, "Từ khóa tìm kiếm"),
  tag: optionalText(30, "Thẻ"),
  status_ai: z.enum(["PENDING", "PROCESSING", "DONE", "ERROR"]).optional(),
});

const tagsQuerySchema = z.object({
  thesis_id: thesisIdField("Mã đề tài không hợp lệ.").optional(),
});

const uploadBodySchema = z.object({
  thesis_id: thesisIdField("Vui lòng chọn đề tài cho tài liệu."),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
});

/**
 * Ghi chú tóm tắt (UC 6.3) cố ý không dùng `optionalText`: helper đó quy chuỗi
 * rỗng về `undefined`, nên "xoá ghi chú" và "không gửi trường này" trở nên không
 * phân biệt được và người dùng sẽ không bao giờ xoá được ghi chú đã viết.
 */
const summaryNoteField = z
  .string({ invalid_type_error: "Ghi chú phải là chuỗi." })
  .max(4000, "Ghi chú tối đa 4000 ký tự.")
  .nullable()
  .transform((v) => (v === null ? null : cleanText(v) || null));

const updateBodySchema = z.object({
  filename: text(1, 255, "Tên tài liệu").optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
  summary_note: summaryNoteField.optional(),
});

const versionBodySchema = z.object({
  change_note: optionalText(500, "Ghi chú thay đổi"),
});

const shareBodySchema = z.object({
  thesis_id: thesisIdField("Vui lòng chọn đề tài muốn chia sẻ tới."),
  permission: z.string().max(20, "Giá trị quyền không hợp lệ.").optional(),
});

const shareParamsSchema = idParam.extend({
  thesis_id: thesisIdField("Mã đề tài không hợp lệ."),
});

/* ==========================================================================
   UC 5.2 / 5.8 — DANH SÁCH & TÌM KIẾM
   ========================================================================== */

documentsRouter.get(
  "/",
  requireAuth,
  validateQuery(listQuerySchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const query = req.query as unknown as z.infer<typeof listQuerySchema>;
    const page = parsePage(query);

    const { rows, total } = await listDocuments(
      user,
      {
        ...(query.thesis_id !== undefined ? { thesis_id: query.thesis_id } : {}),
        ...(query.search !== undefined ? { search: query.search } : {}),
        ...(query.tag !== undefined ? { tag: query.tag } : {}),
        ...(query.status_ai !== undefined ? { status_ai: query.status_ai } : {}),
      },
      page
    );

    res.json(paginated(rows.map(toDocumentDTO), total, page));
  })
);

/** UC 5.7 — nguồn gợi ý cho ô nhập thẻ và bộ lọc "Mọi thẻ". */
documentsRouter.get(
  "/tags",
  requireAuth,
  validateQuery(tagsQuerySchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { thesis_id } = req.query as unknown as z.infer<typeof tagsQuerySchema>;
    res.json(await listTagsInScope(user, thesis_id));
  })
);

/* ==========================================================================
   UC 5.1 — TẢI TÀI LIỆU LÊN
   ========================================================================== */

documentsRouter.post(
  "/",
  requireAuth,
  uploadLimiter,
  receiveFile("file"),
  validateBody(uploadBodySchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { thesis_id, tags } = req.body as z.infer<typeof uploadBodySchema>;

    // Kiểm tra quyền TRƯỚC khi soi tệp: người ngoài đề tài không đáng được biết
    // hệ thống chấp nhận những định dạng nào, và cũng không nên tốn I/O ghi đĩa.
    await assertThesisAccess(user, thesis_id, "contribute");

    const tagList = parseTagList(tags);
    const file = await acceptDocumentFile(req, { thesis_id });

    const document = await withFileCleanup(file, () =>
      createDocumentWithFirstVersion({
        thesisId: thesis_id,
        uploaderId: user.id,
        file,
        tags: tagList,
      })
    );

    // Cố ý KHÔNG await kết quả lập chỉ mục: UC 5.1 yêu cầu đưa vào hàng đợi bất
    // đồng bộ để không chặn trải nghiệm tải lên.
    enqueueIndexing(document.id);

    audit({
      action: AuditAction.DOCUMENT_UPLOAD,
      req,
      details: {
        document_id: document.id,
        thesis_id,
        filename: document.filename,
        file_size: document.file_size,
        mime_type: document.mime_type,
        tags: tagList,
      },
    });

    await notifySupervisorAboutUpload({
      thesisId: thesis_id,
      actorId: user.id,
      actorName: user.full_name,
      filename: document.filename,
      isNewVersion: false,
    });

    res.status(201).json(toDocumentDTO(document));
  })
);

/* ==========================================================================
   UC 5.3 / 5.4 — CHI TIẾT, XEM TRƯỚC & TẢI VỀ
   ========================================================================== */

documentsRouter.get(
  "/:id",
  requireAuth,
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;

    const { viaShare } = await assertDocumentAccess(user, id, "view");
    const document = await loadDocumentDetail(id);

    // Ký MỘT lần rồi dùng lại: gọi `signFileUrl` hai lần có thể rơi vào hai giây
    // khác nhau và trả về hai hạn dùng lệch nhau cho cùng một tệp.
    const signed = viaShare ? null : signFileUrl("document", document.id);

    res.json({
      ...toDocumentDTO(document),
      // UC 5.10 business rule: "File gốc bị cấm tải bởi người ngoài. Người nhận
      // chỉ đọc được mô tả, tóm tắt, tên tài liệu." Signed URL tự nó là uỷ quyền
      // nên đưa nó cho người xem qua chia sẻ chính là trao luôn tệp.
      download_url: signed,
      preview_url: signed ? `${signed}&disposition=inline` : null,
      shared_only: viaShare,
    });
  })
);

/* ==========================================================================
   UC 5.6 / 5.7 / 6.3 — SỬA METADATA
   ========================================================================== */

documentsRouter.patch(
  "/:id",
  requireAuth,
  validateParams(idParam),
  validateBody(updateBodySchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;
    const body = req.body as z.infer<typeof updateBodySchema>;

    if (body.filename === undefined && body.tags === undefined && body.summary_note === undefined) {
      throw badRequest("Không có thông tin nào cần cập nhật.");
    }

    await assertDocumentAccess(user, id, "contribute");

    // UC 5.6 business rule: "Không thể thay đổi file vật lý thông qua chỉnh
    // sửa" — vì vậy `file_path`, `file_size`, `mime_type` không có mặt ở đây.
    // Muốn đổi nội dung thì phải nộp phiên bản mới (POST /:id/versions).
    const data: {
      filename?: string;
      tags?: string[];
      summary_note?: string | null;
    } = {};
    if (body.filename !== undefined) data.filename = sanitizeFilename(body.filename);
    if (body.tags !== undefined) data.tags = parseTagList(body.tags);
    if (body.summary_note !== undefined) data.summary_note = body.summary_note;

    await prisma.document.update({ where: { id }, data });
    const document = await loadDocumentDetail(id);

    audit({
      action: AuditAction.DOCUMENT_UPDATE,
      req,
      details: {
        document_id: id,
        thesis_id: document.thesis_id,
        changed: Object.keys(data),
        filename: document.filename,
      },
    });

    res.json(toDocumentDTO(document));
  })
);

/* ==========================================================================
   UC 5.5 — XOÁ TÀI LIỆU
   ========================================================================== */

documentsRouter.delete(
  "/:id",
  requireAuth,
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;

    const { document, access } = await assertDocumentAccess(user, id, "contribute");

    // UC 5.5 business rule giao quyền xoá cho sinh viên của đề tài. Thu hẹp
    // thêm về người ĐÃ TẢI LÊN: trong nhóm nhiều thành viên, xoá tài liệu của
    // bạn cùng nhóm là mất mát không hoàn tác được. GVHD/Admin vẫn xoá được để
    // gỡ nội dung vi phạm.
    const isSupervisorOrAdmin = access?.isSupervisor === true || access?.isAdmin === true;
    if (document.uploaded_by !== user.id && !isSupervisorOrAdmin) {
      throw forbidden("Chỉ người đã tải lên hoặc giảng viên hướng dẫn mới được xóa tài liệu này.");
    }

    const detail = await loadDocumentDetail(id);
    const versions = await prisma.documentVersion.findMany({
      where: { document_id: id },
      select: { file_path: true },
    });

    // Xoá mềm: `documents.deleted_at` là thứ khiến tài liệu biến mất khỏi mọi
    // truy vấn (kể cả tìm kiếm vector), nhưng nhật ký kiểm toán và các trích dẫn
    // AI cũ vẫn truy ngược được.
    await prisma.document.update({ where: { id }, data: { deleted_at: new Date() } });

    // Dọn dẹp là việc "cố gắng hết sức": UC 5.5 exception 5a/6a nói rõ lỗi xoá
    // tệp hoặc vector chỉ cần ghi log, không được làm hỏng thao tác đã thành
    // công về mặt nghiệp vụ.
    await deleteChunks(id).catch((err: unknown) => {
      logger.error({ err, documentId: id }, "Không xóa được vector của tài liệu");
    });
    // Đường dẫn có thể trùng nhau giữa `documents` và bản hiện hành; `deleteFile`
    // dùng `force` nên gọi lại trên tệp đã mất không phải là lỗi.
    await Promise.all([
      deleteFile(detail.file_path),
      ...versions.map((v) => deleteFile(v.file_path)),
    ]);

    audit({
      action: AuditAction.DOCUMENT_DELETE,
      req,
      details: {
        document_id: id,
        thesis_id: detail.thesis_id,
        filename: detail.filename,
        versions_removed: versions.length,
      },
    });

    noContent(res);
  })
);

/* ==========================================================================
   UC 6.2 — LẬP CHỈ MỤC / TÓM TẮT LẠI
   ========================================================================== */

/**
 * UC 6.2 business rule: "Giới hạn số lần yêu cầu tóm tắt lại trong ngày để tránh
 * spam API." `aiLimiter` chỉ chặn theo phút; hạn mức ngày mới là thứ giữ hoá đơn
 * của nhà cung cấp AI khỏi tăng vọt vì một người bấm nút cả buổi.
 */
const DAILY_REINDEX_LIMIT = 10;

documentsRouter.post(
  "/:id/reindex",
  requireAuth,
  aiLimiter,
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;

    await assertDocumentAccess(user, id, "contribute");
    const current = await loadDocumentDetail(id);

    if (current.status_ai === "PROCESSING") {
      throw conflict("Tài liệu đang được xử lý. Vui lòng đợi tiến trình hiện tại kết thúc.");
    }

    const since = new Date();
    since.setHours(0, 0, 0, 0);
    // Lọc theo `details.trigger` để chỉ đếm đúng nút "Tóm tắt lại" của module
    // này: `AI_SUMMARIZE` là hành động dùng chung, đếm tất cả sẽ khoá nhầm
    // người dùng vì những thao tác AI khác.
    const usedToday = await prisma.systemLog.count({
      where: {
        user_id: user.id,
        action: AuditAction.AI_SUMMARIZE,
        created_at: { gte: since },
        details: { path: ["trigger"], equals: "manual_reindex" },
      },
    });
    if (usedToday >= DAILY_REINDEX_LIMIT) {
      // `lib/errors.ts` chưa có helper cho 429; dùng thẳng `HttpError` để mã
      // trạng thái đúng nghĩa thay vì gán bừa vào 403/409.
      throw new HttpError(
        429,
        `Bạn đã yêu cầu tóm tắt lại ${DAILY_REINDEX_LIMIT} lần hôm nay. Vui lòng thử lại vào ngày mai.`
      );
    }

    // Đặt lại bộ đếm trước khi xếp hàng: watchdog trong `document-indexer` dựa
    // vào `ai_attempts` để quyết định thử lại hay bỏ cuộc, giữ số cũ thì lần
    // nhúng lại này bị coi là lần thử thứ n và có thể bị chặn ngay.
    await prisma.document.update({
      where: { id },
      data: { status_ai: "PENDING", ai_attempts: 0, ai_error: null, ai_started_at: null },
    });

    enqueueIndexing(id, true);

    audit({
      action: AuditAction.AI_SUMMARIZE,
      req,
      details: { document_id: id, thesis_id: current.thesis_id, trigger: "manual_reindex" },
    });

    res.json(toDocumentDTO(await loadDocumentDetail(id)));
  })
);

/* ==========================================================================
   PHIÊN BẢN TÀI LIỆU (`Yêu cầu dự án.md` §3.1)
   ========================================================================== */

documentsRouter.get(
  "/:id/versions",
  requireAuth,
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;

    const { viaShare } = await assertDocumentAccess(user, id, "view");
    // Mỗi phiên bản là một tệp tải về được. UC 5.10 chỉ chia sẻ phần mô tả, nên
    // người xem qua chia sẻ không được cầm danh sách id tệp trong tay.
    if (viaShare) {
      throw forbidden("Tài liệu này được chia sẻ ở chế độ chỉ đọc, không xem được các phiên bản tệp.");
    }

    const versions = await prisma.documentVersion.findMany({
      where: { document_id: id },
      include: VERSION_INCLUDE,
      orderBy: { version_number: "desc" },
    });

    res.json(versions.map(toDocumentVersionDTO));
  })
);

documentsRouter.post(
  "/:id/versions",
  requireAuth,
  uploadLimiter,
  validateParams(idParam),
  receiveFile("file"),
  validateBody(versionBodySchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;
    const { change_note } = req.body as z.infer<typeof versionBodySchema>;

    const { document } = await assertDocumentAccess(user, id, "contribute");
    const file = await acceptDocumentFile(req, { document_id: id, thesis_id: document.thesis_id });

    const version = await withFileCleanup(file, () =>
      addDocumentVersion({
        documentId: id,
        uploaderId: user.id,
        file,
        ...(change_note !== undefined ? { changeNote: change_note } : {}),
      })
    );

    // Nội dung đã đổi thì chỉ mục cũ vô giá trị — `insertChunks` xoá đoạn cũ
    // trước khi ghi đoạn mới nên không có hai thế hệ vector cùng tồn tại.
    enqueueIndexing(id, true);

    audit({
      action: AuditAction.DOCUMENT_VERSION_UPLOAD,
      req,
      details: {
        document_id: id,
        thesis_id: document.thesis_id,
        version_number: version.version_number,
        file_size: version.file_size,
        mime_type: version.mime_type,
      },
    });

    await notifySupervisorAboutUpload({
      thesisId: document.thesis_id,
      actorId: user.id,
      actorName: user.full_name,
      filename: document.filename,
      isNewVersion: true,
    });

    res.status(201).json(toDocumentVersionDTO(version));
  })
);

/* ==========================================================================
   UC 5.10 — CHIA SẺ SANG ĐỀ TÀI KHÁC
   ========================================================================== */

documentsRouter.post(
  "/:id/share",
  requireAuth,
  validateParams(idParam),
  validateBody(shareBodySchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;
    const { thesis_id: targetThesisId, permission } = req.body as z.infer<typeof shareBodySchema>;

    // UC 5.10 chỉ có một mức quyền. Chấp nhận âm thầm một giá trị lạ rồi lưu
    // xuống cột `permission` sẽ tạo ảo giác là hệ thống có phân quyền ghi.
    if (permission !== undefined && permission.trim().toUpperCase() !== "READ") {
      throw badRequest("Chỉ chia sẻ được ở chế độ chỉ đọc (READ).");
    }

    // Người chia sẻ phải thực sự làm chủ tài liệu, và phải là người của đề tài
    // đích — nếu không, ai cũng có thể đẩy tài liệu vào không gian người lạ.
    const { document } = await assertDocumentAccess(user, id, "contribute");
    if (document.thesis_id === targetThesisId) {
      throw badRequest("Tài liệu đã thuộc đề tài này, không cần chia sẻ.");
    }
    await assertThesisAccess(user, targetThesisId, "view");

    const existing = await prisma.documentShare.findUnique({
      where: { document_id_thesis_id: { document_id: id, thesis_id: targetThesisId } },
      select: { id: true },
    });
    if (existing) throw conflict("Tài liệu đã được chia sẻ tới đề tài này.");

    const share = await prisma.documentShare.create({
      data: { document_id: id, thesis_id: targetThesisId, shared_by: user.id, permission: "READ" },
      include: SHARE_INCLUDE,
    });

    audit({
      action: AuditAction.DOCUMENT_SHARE,
      req,
      details: {
        document_id: id,
        source_thesis_id: document.thesis_id,
        target_thesis_id: targetThesisId,
        filename: document.filename,
      },
    });

    await notifyShareRecipients({
      targetThesisId,
      actorId: user.id,
      actorName: user.full_name,
      filename: document.filename,
    });

    res.status(201).json(toDocumentShareDTO(share));
  })
);

documentsRouter.get(
  "/:id/shares",
  requireAuth,
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;

    // Dùng "view" chứ không phải "contribute": đề tài đã hoàn thành bị đóng
    // băng cho mọi thao tác ghi (UC 3.13), nhưng vẫn phải tra được nó từng chia
    // sẻ tài liệu đi đâu. Chặn riêng người xem-qua-chia-sẻ: danh sách này lộ tên
    // các đề tài khác và họ không có việc gì phải biết ai cùng nhận.
    const { viaShare } = await assertDocumentAccess(user, id, "view");
    if (viaShare) {
      throw forbidden("Bạn chỉ được xem nội dung tài liệu này, không xem được danh sách chia sẻ.");
    }

    const shares = await prisma.documentShare.findMany({
      where: { document_id: id },
      include: SHARE_INCLUDE,
      orderBy: { created_at: "desc" },
    });

    res.json(shares.map(toDocumentShareDTO));
  })
);

documentsRouter.delete(
  "/:id/shares/:thesis_id",
  requireAuth,
  validateParams(shareParamsSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id, thesis_id: targetThesisId } = req.params as unknown as z.infer<typeof shareParamsSchema>;

    const { document } = await assertDocumentAccess(user, id, "contribute");

    const share = await prisma.documentShare.findUnique({
      where: { document_id_thesis_id: { document_id: id, thesis_id: targetThesisId } },
      select: { id: true },
    });
    if (!share) throw notFound("Tài liệu chưa được chia sẻ tới đề tài này.");

    await prisma.documentShare.delete({ where: { id: share.id } });

    audit({
      action: AuditAction.DOCUMENT_SHARE,
      req,
      details: {
        document_id: id,
        source_thesis_id: document.thesis_id,
        target_thesis_id: targetThesisId,
        revoked: true,
      },
    });

    noContent(res);
  })
);

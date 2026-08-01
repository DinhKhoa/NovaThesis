/**
 * MODULE 7 — TRAO ĐỔI & PHẢN HỒI (tầng HTTP)
 *
 * Bình luận dạng cây trên mốc tiến độ (UC 7.1) và tài liệu (UC 7.2), trả lời tối
 * đa 3 cấp (UC 7.3), sửa trong 15 phút (UC 7.4), xoá giữ thread (UC 7.5), đánh
 * dấu đã giải quyết (UC 7.6), đính kèm tệp (UC 7.7) và xem lại toàn bộ lịch sử
 * (UC 7.8).
 *
 * Điểm chung của mọi endpoint: quyền được quyết định bởi ĐỀ TÀI chứa đối tượng
 * được bình luận, không phải bởi vai trò. Sinh viên và giảng viên đều gõ được
 * vào cùng một ô nhập; thứ phân biệt họ chỉ là đề tài nào thuộc về ai — và câu
 * hỏi đó chỉ `domain/access.ts` được phép trả lời.
 */
import { Router, type RequestHandler } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, noContent, paginated, parsePage, paginationSchema } from "../../lib/http";
import { badRequest, forbidden, tooLarge } from "../../lib/errors";
import { audit, AuditAction } from "../../lib/audit";
import { ATTACHMENT_MIME, assertAllowedType, deleteFile, saveBuffer, type StoredFile } from "../../lib/storage";
import { currentUser, requireAuth, requireContributor } from "../../middleware/auth";
import { text, idParam, validateBody, validateParams, validateQuery } from "../../middleware/validate";
import { uploadLimiter } from "../../middleware/rate-limit";
import { assertThesisAccess } from "../../domain/access";
import { toFeedbackDTO } from "../serializers";
import {
  EDIT_WINDOW_MS,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_MB,
  MAX_DEPTH,
  THREAD_INCLUDE,
  buildListWhere,
  loadFeedback,
  notifyFeedbackParticipants,
  notifyResolveChange,
  resolveTarget,
} from "./feedbacks.service";

export const feedbacksRouter = Router();

/* ==========================================================================
   LƯỢC ĐỒ ĐẦU VÀO
   ========================================================================== */

/**
 * Mã định danh tuỳ chọn đến từ query string HOẶC từ multipart — cả hai đều
 * chuyển số thành chuỗi, và trường bỏ trống đến dưới dạng `""`. `z.coerce.number()`
 * trần biến `""` thành `0` rồi báo "phải là số dương", một thông điệp vô nghĩa
 * với người dùng đơn giản là không chọn gì cả.
 */
const optionalId = (label: string) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((v) => {
      if (v === undefined || v === null) return undefined;
      const raw = typeof v === "number" ? v : v.trim();
      if (raw === "") return undefined;
      return Number(raw);
    })
    .pipe(
      z
        .number({ invalid_type_error: `${label} không hợp lệ.` })
        .int(`${label} không hợp lệ.`)
        .positive(`${label} không hợp lệ.`)
        .optional()
    );

const listQuerySchema = paginationSchema
  .extend({
    thesis_id: optionalId("Mã đề tài"),
    target_type: z
      .enum(["MILESTONE", "DOCUMENT"], {
        errorMap: () => ({ message: "Loại đối tượng chỉ nhận MILESTONE hoặc DOCUMENT." }),
      })
      .optional(),
    milestone_id: optionalId("Mã mốc tiến độ"),
    document_id: optionalId("Mã tài liệu"),
    resolved: z
      .enum(["true", "false", "1", "0"], {
        errorMap: () => ({ message: "Bộ lọc trạng thái chỉ nhận true hoặc false." }),
      })
      .optional()
      .transform((v) => (v === undefined ? undefined : v === "true" || v === "1")),
  })
  .superRefine((v, ctx) => {
    // Bắt bộ lọc mâu thuẫn ngay từ cổng vào: nếu để lọt, câu truy vấn phía sau
    // sẽ trả về danh sách rỗng và người dùng tưởng đề tài chưa có phản hồi nào.
    if (v.milestone_id !== undefined && v.document_id !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["document_id"],
        message: "Chỉ lọc được theo mốc tiến độ hoặc theo tài liệu, không đồng thời cả hai.",
      });
    }
    if (v.target_type === "MILESTONE" && v.document_id !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["target_type"],
        message: "Đang lọc theo tài liệu thì loại đối tượng không thể là MILESTONE.",
      });
    }
    if (v.target_type === "DOCUMENT" && v.milestone_id !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["target_type"],
        message: "Đang lọc theo mốc tiến độ thì loại đối tượng không thể là DOCUMENT.",
      });
    }
  });

type ListQuery = z.infer<typeof listQuerySchema>;

const contentField = text(1, 5000, "Nội dung phản hồi");

const createSchema = z
  .object({
    milestone_id: optionalId("Mã mốc tiến độ"),
    document_id: optionalId("Mã tài liệu"),
    parent_id: optionalId("Mã bình luận cha"),
    content: contentField,
  })
  .superRefine((v, ctx) => {
    const targets = [v.milestone_id, v.document_id].filter((x) => x !== undefined).length;
    // Bình luận gốc buộc phải tự khai đối tượng; câu trả lời thì kế thừa từ cha
    // nên được phép không khai gì cả.
    if (v.parent_id === undefined && targets !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["milestone_id"],
        message: "Phản hồi phải gắn với đúng một mốc tiến độ hoặc một tài liệu.",
      });
    }
    if (targets > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["document_id"],
        message: "Một phản hồi chỉ gắn được với một mốc tiến độ HOẶC một tài liệu.",
      });
    }
  });

type CreateBody = z.infer<typeof createSchema>;

const updateSchema = z.object({ content: contentField });

const resolveSchema = z.object({
  is_resolved: z.boolean({
    required_error: "Thiếu trạng thái giải quyết.",
    invalid_type_error: "Trạng thái giải quyết phải là true hoặc false.",
  }),
});

/* ==========================================================================
   TỆP ĐÍNH KÈM (UC 7.7)
   ========================================================================== */

/**
 * `memoryStorage` là lựa chọn đúng ở đây và chỉ ở đây: trần 5 MB đủ nhỏ để giữ
 * trong RAM, và nhờ vậy tệp chỉ chạm đĩa SAU khi đã qua kiểm tra quyền — không
 * để lại rác khi người ngoài đề tài thử gửi bình luận.
 *
 * `files: 1` vì lược đồ chỉ có một cặp `file_url`/`file_name`. UC 7.7 nhắc tới
 * "tối đa 3 file"; hỗ trợ đúng như vậy sẽ cần một bảng đính kèm riêng, nên giới
 * hạn ở đây được siết xuống 1 một cách tường minh thay vì âm thầm bỏ mất tệp.
 */
const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 },
}).single("file");

/**
 * Bọc multer để dịch lỗi sang đúng ngưỡng của module này.
 *
 * Handler lỗi dùng chung ở `middleware/error.ts` báo theo `MAX_UPLOAD_MB` (50 MB
 * cho tài liệu luận văn), trong khi đính kèm bình luận chỉ được 5 MB. Không dịch
 * lại ở đây thì người dùng bị từ chối tệp 8 MB kèm câu "giới hạn 50 MB".
 */
const attachment: RequestHandler = (req, res, next) => {
  attachmentUpload(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return next(tooLarge(`Dung lượng tệp đính kèm vượt quá ${MAX_ATTACHMENT_MB}MB.`));
      }
      if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
        return next(badRequest("Mỗi phản hồi chỉ đính kèm được một tệp, gửi ở trường “file”."));
      }
      return next(badRequest("Không đọc được tệp đính kèm."));
    }
    if (err) return next(err);
    next();
  });
};

/* ==========================================================================
   UC 7.8 — LỊCH SỬ PHẢN HỒI
   ========================================================================== */

feedbacksRouter.get(
  "/",
  requireAuth,
  validateQuery(listQuerySchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const query = req.query as unknown as ListQuery;
    const page = parsePage(req.query);

    const where = await buildListWhere(user, query);

    // `$transaction` để trang dữ liệu và tổng số đếm trên cùng một ảnh chụp:
    // hai truy vấn rời nhau có thể lệch khi ai đó vừa gửi bình luận, và giao
    // diện sẽ hiện "21 phản hồi" trên một trang chỉ có 20 dòng.
    const [rows, total] = await prisma.$transaction([
      prisma.feedback.findMany({
        where,
        include: THREAD_INCLUDE,
        orderBy: { created_at: "desc" },
        skip: page.skip,
        take: page.take,
      }),
      prisma.feedback.count({ where }),
    ]);

    res.json(paginated(rows.map(toFeedbackDTO), total, page));
  })
);

/* ==========================================================================
   UC 7.1 / 7.2 / 7.3 / 7.7 — TẠO PHẢN HỒI HOẶC TRẢ LỜI
   ========================================================================== */

feedbacksRouter.post(
  "/",
  requireAuth,
  requireContributor,
  uploadLimiter,
  attachment,
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const body = req.body as CreateBody;
    const file = req.file;

    const parent = body.parent_id === undefined ? null : await loadFeedback(body.parent_id);

    // Trả lời KẾ THỪA đối tượng của cha. Giao diện khi bấm "Trả lời" chỉ biết
    // `parent_id`; bắt nó gửi kèm đối tượng đích là mở đường cho một reply trỏ
    // sang mốc khác — thread lai giữa hai ngữ cảnh mà CHECK "đúng một đối
    // tượng" của CSDL không hề bắt được.
    const target = parent ? parent.target : await resolveTarget(body.milestone_id, body.document_id);

    // Quyền `view` chứ không phải `contribute`: bình luận không sửa đổi nội dung
    // đề tài, và cả hai phía vẫn cần trao đổi được trên đề tài đã hoàn thành
    // (UC 7.8 — xem lại lịch sử). `assertThesisAccess` cũng chính là thứ giữ
    // đúng business rule "giảng viên chỉ phản hồi đề tài mình hướng dẫn".
    //
    // Đặt TRƯỚC các kiểm tra nghiệp vụ bên dưới là có chủ đích: nếu "Thread tối
    // đa 3 cấp." bật lên trước, người ngoài đề tài dò được sự tồn tại và độ sâu
    // của một bình luận không thuộc về họ chỉ bằng cách đoán `parent_id`.
    await assertThesisAccess(user, target.thesis_id, "view");

    if (parent) {
      if (parent.deleted_at !== null) {
        throw badRequest("Không thể trả lời một bình luận đã bị xóa.");
      }
      // BR UC 7.3 — `depth` chỉ nhận 0/1/2, bình luận ở cấp 3 là lá.
      if (parent.depth >= MAX_DEPTH) {
        throw badRequest("Thread tối đa 3 cấp.");
      }
      const declared = body.milestone_id ?? body.document_id;
      if (declared !== undefined) {
        const same =
          (body.milestone_id !== undefined && body.milestone_id === parent.target.milestone_id) ||
          (body.document_id !== undefined && body.document_id === parent.target.document_id);
        if (!same) {
          throw badRequest("Câu trả lời phải nằm trên cùng mốc tiến độ hoặc tài liệu với bình luận gốc.");
        }
      }
    }

    let stored: StoredFile | null = null;
    let fileName: string | null = null;
    if (file) {
      assertAllowedType(
        ATTACHMENT_MIME,
        file.mimetype,
        file.originalname,
        "Định dạng tệp đính kèm không được hỗ trợ."
      );
      stored = await saveBuffer("feedback", file.originalname, file.buffer);
      fileName = file.originalname.slice(0, 255);
    }

    const created = await prisma.feedback
      .create({
        data: {
          milestone_id: target.milestone_id,
          document_id: target.document_id,
          user_id: user.id,
          content: body.content,
          parent_id: parent?.id ?? null,
          depth: parent ? parent.depth + 1 : 0,
          file_url: stored?.relativePath ?? null,
          file_name: fileName,
        },
        include: THREAD_INCLUDE,
      })
      // Bản ghi hỏng thì tệp vừa ghi thành rác vĩnh viễn: không còn hàng nào
      // trỏ tới nó nên không ai dọn được nữa.
      .catch(async (err: unknown) => {
        await deleteFile(stored?.relativePath);
        throw err;
      });

    await notifyFeedbackParticipants({
      actor: user,
      target,
      content: body.content,
      parentAuthorUserId: parent?.user_id ?? null,
    });

    audit({
      action: AuditAction.FEEDBACK_CREATE,
      req,
      details: {
        feedback_id: created.id,
        thesis_id: target.thesis_id,
        target_type: target.kind,
        target_id: target.milestone_id ?? target.document_id,
        parent_id: parent?.id ?? null,
        depth: created.depth,
        has_attachment: stored !== null,
      },
    });

    res.status(201).json(toFeedbackDTO(created));
  })
);

/* ==========================================================================
   UC 7.4 — CHỈNH SỬA (CỬA SỔ 15 PHÚT)
   ========================================================================== */

feedbacksRouter.patch(
  "/:id",
  requireAuth,
  requireContributor,
  validateParams(idParam),
  validateBody(updateSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;
    const { content } = req.body as z.infer<typeof updateSchema>;

    const feedback = await loadFeedback(id);
    // Kiểm tra phạm vi đề tài trước cả quyền tác giả: người đã rời đề tài không
    // được biết bình luận đó có tồn tại hay không.
    await assertThesisAccess(user, feedback.target.thesis_id, "view");

    if (feedback.user_id !== user.id) {
      throw forbidden("Bạn chỉ được chỉnh sửa bình luận của chính mình.");
    }
    if (feedback.deleted_at !== null) {
      throw badRequest("Bình luận đã bị xóa, không chỉnh sửa được nữa.");
    }
    // BR UC 7.4 — mốc tính là `created_at`, không phải `edited_at`: nếu tính
    // theo lần sửa gần nhất thì cửa sổ 15 phút tự gia hạn vô hạn.
    if (Date.now() - feedback.created_at.getTime() > EDIT_WINDOW_MS) {
      throw forbidden("Chỉ được chỉnh sửa bình luận trong vòng 15 phút đầu.");
    }

    const updated = await prisma.feedback.update({
      where: { id },
      data: { content, edited_at: new Date() },
      include: THREAD_INCLUDE,
    });

    audit({
      action: AuditAction.FEEDBACK_UPDATE,
      req,
      details: { feedback_id: id, thesis_id: feedback.target.thesis_id },
    });

    res.json(toFeedbackDTO(updated));
  })
);

/* ==========================================================================
   UC 7.5 — XOÁ (CỨNG NẾU CHƯA CÓ TRẢ LỜI, MỀM NẾU ĐÃ CÓ)
   ========================================================================== */

feedbacksRouter.delete(
  "/:id",
  requireAuth,
  requireContributor,
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;

    const feedback = await loadFeedback(id);
    await assertThesisAccess(user, feedback.target.thesis_id, "view");

    if (feedback.user_id !== user.id && user.role !== "ADMIN") {
      throw forbidden("Bạn chỉ được xóa bình luận của chính mình.");
    }

    // Xoá lại thứ đã xoá là thao tác không lỗi: nút "Xóa" bị bấm hai lần không
    // đáng để hiện một hộp thoại đỏ.
    if (feedback.deleted_at !== null) return noContent(res);

    const soft = feedback.reply_count > 0;

    if (soft) {
      // BR UC 7.5 — xoá cứng một bình luận đang có nhánh trả lời sẽ kéo theo cả
      // nhánh đó (khoá ngoại `onDelete: Cascade`), làm mất luôn câu trả lời của
      // người khác. Serializer tự thay nội dung bằng "[Phản hồi này đã bị xóa]";
      // tệp đính kèm cũng ngừng phục vụ vì `/files/feedback/:id` chỉ nhận bản
      // ghi còn `deleted_at IS NULL`.
      await prisma.feedback.update({ where: { id }, data: { deleted_at: new Date() } });
    } else {
      await prisma.feedback.delete({ where: { id } });
      await deleteFile(feedback.file_url);
    }

    audit({
      action: AuditAction.FEEDBACK_DELETE,
      req,
      details: {
        feedback_id: id,
        thesis_id: feedback.target.thesis_id,
        mode: soft ? "SOFT" : "HARD",
        reply_count: feedback.reply_count,
        by_admin: user.role === "ADMIN" && feedback.user_id !== user.id,
      },
    });

    noContent(res);
  })
);

/* ==========================================================================
   UC 7.6 — ĐÁNH DẤU ĐÃ GIẢI QUYẾT
   ========================================================================== */

feedbacksRouter.post(
  "/:id/resolve",
  requireAuth,
  requireContributor,
  validateParams(idParam),
  validateBody(resolveSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;
    const { is_resolved } = req.body as z.infer<typeof resolveSchema>;

    const feedback = await loadFeedback(id);
    await assertThesisAccess(user, feedback.target.thesis_id, "view");

    // BR UC 7.6 — "Chỉ giảng viên tạo ra phản hồi gốc mới có quyền đánh dấu
    // resolve. Sinh viên không có quyền này." Kiểm tra đồng thời vai trò VÀ
    // quyền tác giả: giảng viên hướng dẫn cũng không đóng được thread do người
    // khác mở.
    const isAuthoringLecturer = user.role === "LECTURER" && feedback.user_id === user.id;
    if (!isAuthoringLecturer && user.role !== "ADMIN") {
      throw forbidden("Chỉ giảng viên đã tạo phản hồi gốc mới được đánh dấu đã giải quyết.");
    }

    if (feedback.parent_id !== null) {
      throw badRequest("Chỉ đánh dấu giải quyết được trên bình luận gốc của thread.");
    }
    if (feedback.deleted_at !== null) {
      throw badRequest("Bình luận đã bị xóa, không đổi trạng thái được nữa.");
    }

    const updated = await prisma.feedback.update({
      where: { id },
      data: {
        is_resolved,
        // Bỏ dấu thì xoá luôn người và thời điểm: giữ lại sẽ hiện "đã giải quyết
        // bởi …" trên một thread đang mở.
        resolved_by: is_resolved ? user.id : null,
        resolved_at: is_resolved ? new Date() : null,
      },
      include: THREAD_INCLUDE,
    });

    // Chỉ báo khi trạng thái thực sự đổi — bấm lại nút đang bật không phải sự kiện.
    if (feedback.is_resolved !== is_resolved) {
      await notifyResolveChange({ actor: user, target: feedback.target, isResolved: is_resolved });
    }

    audit({
      action: AuditAction.FEEDBACK_RESOLVE,
      req,
      details: {
        feedback_id: id,
        thesis_id: feedback.target.thesis_id,
        is_resolved,
      },
    });

    res.json(toFeedbackDTO(updated));
  })
);

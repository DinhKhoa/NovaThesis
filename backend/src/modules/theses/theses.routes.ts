/**
 * MODULE 3 — QUẢN LÝ ĐỀ TÀI (UC 3.1 → 3.14)
 *
 * Vòng đời đề tài đi qua một máy trạng thái tường minh
 * (`domain/milestone-fsm.ts`), không có chỗ nào gán thẳng `status` mà không hỏi
 * bảng chuyển tiếp. Nhờ đó ba luật khó nhất của module — "REJECTED là trạng
 * thái cuối" (UC 3.11), "COMPLETED thì đóng băng hồ sơ" (UC 3.13) và "không sửa
 * khi đang chờ duyệt" (UC 3.5) — chỉ tồn tại ở đúng một nơi.
 *
 * Phạm vi dữ liệu luôn đi qua `domain/access.ts`. Không endpoint nào ở đây tự
 * viết mệnh đề "chỉ lấy đề tài của tôi": đó là yêu cầu Tenant Isolation, và một
 * bản sao chép sai ở một endpoint là đủ để rò rỉ luận văn của người khác.
 */
import { Router } from "express";
import { z } from "zod";
import type { ThesisStatus, UserRole } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { asyncHandler, noContent, paginated, paginationSchema, parsePage } from "../../lib/http";
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors";
import { audit, AuditAction } from "../../lib/audit";
import {
  currentUser,
  requireAuth,
  requireContributor,
  requireRole,
} from "../../middleware/auth";
import {
  idParam,
  optionalText,
  text,
  validateBody,
  validateParams,
  validateQuery,
  optionalDateField,
} from "../../middleware/validate";
import { assertThesisAccess } from "../../domain/access";
import { checkThesisTransition } from "../../domain/milestone-fsm";
import { notify, notifyMany, thesisAudience } from "../../services/notifications";
import { toLecturerOptionDTO, toThesisDTO } from "../serializers";
import {
  assertLecturerCapacity,
  assertNoActiveThesis,
  findThesisDTO,
  scopedThesisWhere,
  searchCondition,
  thesisHistory,
  thesisInclude,
} from "./theses.service";

export const thesesRouter = Router();

// Toàn bộ module yêu cầu đăng nhập: không có đề tài nào là dữ liệu công khai.
thesesRouter.use(requireAuth);

/* ==========================================================================
   LƯỢC ĐỒ ĐẦU VÀO
   ========================================================================== */

const THESIS_STATUS_VALUES = [
  "DRAFT",
  "PENDING",
  "REVISION_REQUIRED",
  "ONGOING",
  "COMPLETED",
  "REJECTED",
] as const;

/**
 * Các ô lọc ở giao diện gửi `"ALL"` khi người dùng chọn "Mọi trạng thái".
 * Không quy về `undefined` ở đây thì server sẽ đi tìm đề tài có `status = "ALL"`
 * và trả về danh sách rỗng — lỗi trông hệt như "mất dữ liệu".
 */
const anyToUndefined = (value: unknown): unknown =>
  value === "" || value === "ALL" || value === null ? undefined : value;

const listQuerySchema = z
  .object({
    search: optionalText(200, "Từ khóa tìm kiếm"),
    status: z.preprocess(
      anyToUndefined,
      z
        .enum(THESIS_STATUS_VALUES, {
          // Thông điệp mặc định của zod là tiếng Anh và liệt kê nguyên enum —
          // `lib/api.ts` hiển thị thẳng chuỗi này lên giao diện người dùng.
          errorMap: () => ({ message: "Trạng thái lọc không hợp lệ." }),
        })
        .optional()
    ),
    field: z.preprocess(anyToUndefined, optionalText(100, "Lĩnh vực")),
    /* Lọc theo KỲ NGHIÊN CỨU: `from`/`to` áp lên `theses.start_date`, tức là
       "đề tài bắt đầu trong khoảng này". Một khoảng ngày tự do linh hoạt hơn
       một danh sách kỳ cố định, và không cần bảng tra nào. */
    from: optionalDateField("Ngày bắt đầu khoảng lọc"),
    to: optionalDateField("Ngày kết thúc khoảng lọc"),
  })
  .merge(paginationSchema);

const createSchema = z.object({
  title: text(10, 255, "Tên đề tài"),
  description: text(10, 10_000, "Mô tả đề tài"),
  field: text(2, 100, "Lĩnh vực nghiên cứu"),
  lecturer_id: z.coerce.number().int().positive("Giảng viên không hợp lệ.").optional(),
  /* Kỳ nghiên cứu, tuỳ chọn. Đặt được ngay lúc tạo hoặc bổ sung sau ở trang chi
     tiết — một bản nháp chưa cần biết mình chạy trong khoảng thời gian nào. */
  start_date: optionalDateField("Ngày bắt đầu kỳ nghiên cứu"),
  end_date: optionalDateField("Ngày kết thúc kỳ nghiên cứu"),
}).refine(
  (v) => v.start_date === undefined || v.end_date === undefined || v.end_date > v.start_date,
  { message: "Ngày kết thúc phải sau ngày bắt đầu.", path: ["end_date"] }
);

const updateSchema = z
  .object({
    title: text(10, 255, "Tên đề tài").optional(),
    description: text(10, 10_000, "Mô tả đề tài").optional(),
    field: text(2, 100, "Lĩnh vực nghiên cứu").optional(),
    lecturer_id: z.coerce.number().int().positive("Giảng viên không hợp lệ.").optional(),
    /* Kỳ nghiên cứu sửa được sau khi tạo: một bản nháp thường chưa biết mình
       chạy trong khoảng nào, và khoảng đó có thể lùi khi đề tài được duyệt muộn. */
    start_date: optionalDateField("Ngày bắt đầu kỳ nghiên cứu"),
    end_date: optionalDateField("Ngày kết thúc kỳ nghiên cứu"),
  })
  .refine(
    (v) => v.start_date === undefined || v.end_date === undefined || v.end_date > v.start_date,
    { message: "Ngày kết thúc phải sau ngày bắt đầu.", path: ["end_date"] }
  );

const approveSchema = z.object({ note: optionalText(2000, "Ghi chú phê duyệt") });

const revisionSchema = z.object({ note: text(5, 2000, "Nội dung yêu cầu chỉnh sửa") });

const rejectSchema = z.object({ reason: text(5, 2000, "Lý do từ chối") });

const completeSchema = z.object({
  /** UC 3.13 nhánh ngoại lệ 2a — giảng viên xác nhận bỏ qua cảnh báo mốc dở dang. */
  force: z.boolean().optional().default(false),
});

const assignLecturerSchema = z.object({
  lecturer_id: z.coerce.number().int().positive("Giảng viên không hợp lệ."),
  reason: optionalText(500, "Lý do thay đổi"),
});

const memberSchema = z.object({
  student_id: z.coerce.number().int().positive("Sinh viên không hợp lệ."),
});

const memberParams = idParam.extend({
  student_id: z.coerce.number().int().positive("Sinh viên không hợp lệ."),
});

/* ==========================================================================
   TIỆN ÍCH DÙNG CHUNG TRONG MODULE
   ========================================================================== */

/**
 * Nạp các cột cần cho quyết định nghiệp vụ.
 *
 * `ThesisAccess.status` là `string` nên không dùng thẳng cho máy trạng thái
 * được; đọc lại ở đây để `checkThesisTransition` nhận đúng kiểu `ThesisStatus`
 * thay vì phải ép kiểu — ép kiểu là chỗ mà một enum đổi tên sẽ đi lọt.
 */
async function loadThesis(id: number) {
  const thesis = await prisma.thesis.findFirst({
    where: { id, deleted_at: null },
    select: { id: true, title: true, status: true, lecturer_id: true, created_by: true },
  });
  if (!thesis) throw notFound("Đề tài không tồn tại hoặc đã bị xóa.");
  return thesis;
}

function assertTransition(from: ThesisStatus, to: ThesisStatus, role: UserRole): void {
  const check = checkThesisTransition(from, to, role);
  if (!check.allowed) throw conflict(check.reason);
}

const thesisLink = (id: number): string => `/theses/${id}`;

/* ==========================================================================
   DANH SÁCH & TRA CỨU
   ========================================================================== */

/** UC 3.2 / 3.3 / 3.14 — danh sách đề tài trong phạm vi người dùng. */
thesesRouter.get(
  "/",
  validateQuery(listQuerySchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const query = req.query as unknown as z.infer<typeof listQuerySchema>;
    const page = parsePage(req.query);

    const where = await scopedThesisWhere(user);
    if (query.status) where.status = query.status;
    if (query.field) where.field = query.field;
    if (query.from || query.to) {
      where.start_date = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      };
    }
    // Điều kiện tìm kiếm phải nằm trong `AND`: gán thẳng vào `where.OR` sẽ ghi
    // đè mệnh đề OR mà `scopedThesisWhere` dùng để giấu bản nháp của sinh viên.
    if (query.search) where.AND = [searchCondition(query.search)];

    const [rows, total] = await Promise.all([
      prisma.thesis.findMany({
        where,
        include: thesisInclude,
        orderBy: [{ updated_at: "desc" }, { id: "desc" }],
        skip: page.skip,
        take: page.take,
      }),
      prisma.thesis.count({ where }),
    ]);

    res.json(paginated(rows.map(toThesisDTO), total, page));
  })
);

/**
 * Danh sách lĩnh vực đang có, phục vụ ô lọc "Mọi lĩnh vực".
 *
 * Cũng bị giới hạn theo phạm vi người dùng: bộ lọc chỉ có ý nghĩa với những gì
 * người đó thật sự nhìn thấy, và trả về toàn bộ lĩnh vực trong hệ thống là để
 * lộ thông tin không cần thiết mà chẳng lọc thêm được dòng nào.
 */
thesesRouter.get(
  "/fields",
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const where = await scopedThesisWhere(user);

    const rows = await prisma.thesis.findMany({
      where,
      select: { field: true },
      distinct: ["field"],
      orderBy: { field: "asc" },
    });

    res.json(rows.map((r) => r.field));
  })
);

/**
 * UC 3.1 — danh sách giảng viên cho form tạo đề tài.
 *
 * `_count.theses` được lọc ngay trong truy vấn (`status: ONGOING`) thay vì đếm
 * lại ở tầng ứng dụng: đếm ở đây là một câu SQL, đếm ở kia là N câu.
 */
thesesRouter.get(
  "/lecturers",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.lecturer.findMany({
      where: { user: { deleted_at: null, status: "ACTIVE" } },
      select: {
        id: true,
        lecturer_code: true,
        department: true,
        max_students: true,
        user: { select: { full_name: true, email: true } },
        _count: { select: { theses: { where: { status: "ONGOING", deleted_at: null } } } },
      },
      orderBy: { user: { full_name: "asc" } },
    });

    res.json(rows.map(toLecturerOptionDTO));
  })
);

/**
 * UC 3.8 — hàng đợi chờ duyệt của giảng viên.
 *
 * Sắp theo `submitted_at` tăng dần (BR: ưu tiên đề tài gửi sớm nhất) và vẫn
 * phân trang: hàng đợi đầu kỳ của một giảng viên có thể dài bất ngờ.
 */
thesesRouter.get(
  "/pending",
  requireRole("LECTURER", "ADMIN"),
  validateQuery(paginationSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const page = parsePage(req.query);

    const where = await scopedThesisWhere(user);
    where.status = "PENDING";

    const [rows, total] = await Promise.all([
      prisma.thesis.findMany({
        where,
        include: thesisInclude,
        orderBy: [{ submitted_at: "asc" }, { created_at: "asc" }],
        skip: page.skip,
        take: page.take,
      }),
      prisma.thesis.count({ where }),
    ]);

    res.json(paginated(rows.map(toThesisDTO), total, page));
  })
);

/* ==========================================================================
   TẠO / XEM / SỬA / XOÁ
   ========================================================================== */

/** UC 3.1 — tạo đề tài (luôn ở trạng thái Nháp). */
thesesRouter.post(
  "/",
  requireContributor,
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const body = req.body as z.infer<typeof createSchema>;

    if (user.role === "STUDENT") {
      if (user.student_id === null) {
        throw badRequest("Tài khoản của bạn chưa có hồ sơ sinh viên. Vui lòng liên hệ quản trị viên.");
      }
      await assertNoActiveThesis(user.student_id);
    }

    // Giảng viên đề xuất đề tài thì chính họ là người hướng dẫn — để họ tự chọn
    // đồng nghiệp khác sẽ biến ô "GVHD" thành cách gán việc cho người vắng mặt.
    const lecturerId =
      user.role === "LECTURER" ? user.lecturer_id : (body.lecturer_id ?? null);

    // UC 3.1 ngoại lệ 5b. Bỏ qua khi giảng viên tự nhận đề tài của mình: quota
    // đếm số đề tài ĐANG thực hiện, còn đây mới chỉ là bản nháp chưa ràng buộc
    // ai, và cửa ải thật sự nằm ở bước phê duyệt (UC 3.9).
    if (lecturerId !== null && lecturerId !== user.lecturer_id) {
      await assertLecturerCapacity(lecturerId);
    }

    const created = await prisma.thesis.create({
      data: {
        title: body.title,
        description: body.description,
        field: body.field,
        status: "DRAFT",
        lecturer_id: lecturerId,
        ...(body.start_date !== undefined ? { start_date: body.start_date } : {}),
        ...(body.end_date !== undefined ? { end_date: body.end_date } : {}),
        created_by: user.id,
        // Sinh viên tạo thì đồng thời là chủ nhiệm. Tạo lồng trong cùng một
        // lệnh để không bao giờ tồn tại đề tài "mồ côi" nếu bước hai thất bại.
        ...(user.role === "STUDENT" && user.student_id !== null
          ? { members: { create: { student_id: user.student_id, role: "OWNER" } } }
          : {}),
      },
      select: { id: true },
    });

    audit({
      action: AuditAction.THESIS_CREATE,
      req,
      details: {
        thesis_id: created.id,
        title: body.title,
        field: body.field,
        lecturer_id: lecturerId,
      },
    });

    res.status(201).json(await findThesisDTO(created.id));
  })
);

/** UC 3.4 — chi tiết đề tài. */
thesesRouter.get(
  "/:id",
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;

    await assertThesisAccess(user, id, "view");
    res.json(await findThesisDTO(id));
  })
);

/** UC 3.5 — chỉnh sửa thông tin đề tài. */
thesesRouter.patch(
  "/:id",
  requireContributor,
  validateParams(idParam),
  validateBody(updateSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;
    const body = req.body as z.infer<typeof updateSchema>;

    // `can('edit')` đã cài BR của UC 3.5 (chặn PENDING / ONGOING / COMPLETED).
    await assertThesisAccess(user, id, "edit");
    const thesis = await loadThesis(id);

    const data: {
      title?: string;
      description?: string;
      field?: string;
      lecturer_id?: number;
      start_date?: Date;
      end_date?: Date;
    } = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.field !== undefined) data.field = body.field;
    if (body.start_date !== undefined) data.start_date = body.start_date;
    if (body.end_date !== undefined) data.end_date = body.end_date;

    if (body.lecturer_id !== undefined && body.lecturer_id !== thesis.lecturer_id) {
      // UC 3.12 dành việc đổi GVHD của đề tài đã gửi đi cho Admin, qua endpoint
      // riêng có ghi lý do và thông báo ba bên. Ở đây chỉ còn giai đoạn sinh
      // viên đang chọn giảng viên cho bản nháp của mình.
      const choosable = thesis.status === "DRAFT" || thesis.status === "REVISION_REQUIRED";
      if (!choosable && user.role !== "ADMIN") {
        throw forbidden(
          "Đổi giảng viên hướng dẫn cho đề tài đã gửi duyệt là thao tác của quản trị viên."
        );
      }
      await assertLecturerCapacity(body.lecturer_id, { excludeThesisId: id });
      data.lecturer_id = body.lecturer_id;
    }

    if (Object.keys(data).length === 0) {
      throw badRequest("Không có thông tin nào để cập nhật.");
    }

    await prisma.thesis.update({ where: { id }, data });

    audit({
      action: AuditAction.THESIS_UPDATE,
      req,
      details: { thesis_id: id, fields: Object.keys(data), title: data.title ?? thesis.title },
    });

    res.json(await findThesisDTO(id));
  })
);

/** UC 3.6 — xoá đề tài nháp (xoá mềm). */
thesesRouter.delete(
  "/:id",
  requireContributor,
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;

    // `can('delete')` chỉ cho phép với đề tài DRAFT của chính thành viên.
    await assertThesisAccess(user, id, "delete");
    const thesis = await loadThesis(id);

    // Xoá mềm: mốc tiến độ, tài liệu và nhật ký vẫn tham chiếu tới đề tài này,
    // xoá cứng sẽ kéo theo cả chuỗi `onDelete: Cascade` và mất luôn dấu vết.
    await prisma.thesis.update({ where: { id }, data: { deleted_at: new Date() } });

    audit({
      action: AuditAction.THESIS_DELETE,
      req,
      details: { thesis_id: id, title: thesis.title, status: thesis.status },
    });

    noContent(res);
  })
);

/* ==========================================================================
   MÁY TRẠNG THÁI (UC 3.7 → 3.13)
   ========================================================================== */

/** UC 3.7 — gửi đề tài để duyệt. */
thesesRouter.post(
  "/:id/submit",
  requireContributor,
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;

    await assertThesisAccess(user, id, "edit");
    const thesis = await loadThesis(id);

    if (thesis.lecturer_id === null) {
      throw badRequest("Vui lòng chọn giảng viên hướng dẫn trước khi gửi duyệt.");
    }
    assertTransition(thesis.status, "PENDING", user.role);

    await prisma.thesis.update({
      where: { id },
      data: {
        status: "PENDING",
        submitted_at: new Date(),
        // Yêu cầu chỉnh sửa cũ đã được xử lý xong; giữ lại sẽ khiến giao diện
        // tiếp tục hiển thị hộp cảnh báo đỏ cho một việc đã làm. Nội dung gốc
        // không mất — nó nằm trong nhật ký và hiện ở tab "Lịch sử".
        revision_note: null,
      },
    });

    const audience = await thesisAudience(id);
    if (audience.lecturerUserId !== null) {
      await notify({
        userId: audience.lecturerUserId,
        type: "THESIS",
        title: "Đề tài mới chờ phê duyệt",
        content: `${user.full_name} đã gửi đề tài “${thesis.title}” và đang chờ bạn phê duyệt.`,
        link: thesisLink(id),
      });
    }

    audit({
      action: AuditAction.THESIS_SUBMIT,
      req,
      details: { thesis_id: id, title: thesis.title, from: thesis.status },
    });

    res.json(await findThesisDTO(id));
  })
);

/** UC 3.9 — phê duyệt đề tài. */
thesesRouter.post(
  "/:id/approve",
  requireContributor,
  validateParams(idParam),
  validateBody(approveSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;
    const { note } = req.body as z.infer<typeof approveSchema>;

    await assertThesisAccess(user, id, "review");
    const thesis = await loadThesis(id);
    assertTransition(thesis.status, "ONGOING", user.role);

    if (thesis.lecturer_id === null) {
      throw badRequest("Đề tài chưa có giảng viên hướng dẫn nên chưa thể phê duyệt.");
    }
    // BR UC 3.9 — kiểm tra quota TRƯỚC khi đổi trạng thái. Đổi trước rồi đếm sau
    // là cách chắc chắn để vượt trần khi hai yêu cầu duyệt về cùng lúc.
    await assertLecturerCapacity(thesis.lecturer_id, {
      excludeThesisId: id,
      self: user.lecturer_id === thesis.lecturer_id,
    });

    await prisma.thesis.update({
      where: { id },
      data: { status: "ONGOING", revision_note: null },
    });

    const audience = await thesisAudience(id);
    await notifyMany(audience.studentUserIds, {
      type: "THESIS",
      title: "Đề tài đã được phê duyệt",
      content: note
        ? `Đề tài “${thesis.title}” đã được phê duyệt. Ghi chú của giảng viên: ${note}`
        : `Đề tài “${thesis.title}” đã được phê duyệt và chuyển sang trạng thái Đang thực hiện.`,
      link: thesisLink(id),
    });

    audit({
      action: AuditAction.THESIS_APPROVE,
      req,
      details: { thesis_id: id, title: thesis.title, lecturer_id: thesis.lecturer_id, note },
    });

    res.json(await findThesisDTO(id));
  })
);

/** UC 3.10 — yêu cầu sinh viên chỉnh sửa rồi gửi lại. */
thesesRouter.post(
  "/:id/request-revision",
  requireContributor,
  validateParams(idParam),
  validateBody(revisionSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;
    const { note } = req.body as z.infer<typeof revisionSchema>;

    await assertThesisAccess(user, id, "review");
    const thesis = await loadThesis(id);
    assertTransition(thesis.status, "REVISION_REQUIRED", user.role);

    await prisma.thesis.update({
      where: { id },
      data: { status: "REVISION_REQUIRED", revision_note: note },
    });

    const audience = await thesisAudience(id);
    await notifyMany(audience.studentUserIds, {
      type: "THESIS",
      title: "Giảng viên yêu cầu chỉnh sửa đề tài",
      content: `Đề tài “${thesis.title}” cần được chỉnh sửa. Nội dung yêu cầu: ${note}`,
      link: thesisLink(id),
    });

    audit({
      action: AuditAction.THESIS_REVISION,
      req,
      details: { thesis_id: id, title: thesis.title, note },
    });

    res.json(await findThesisDTO(id));
  })
);

/** UC 3.11 — từ chối đề tài (trạng thái cuối). */
thesesRouter.post(
  "/:id/reject",
  requireContributor,
  validateParams(idParam),
  validateBody(rejectSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;
    const { reason } = req.body as z.infer<typeof rejectSchema>;

    await assertThesisAccess(user, id, "review");
    const thesis = await loadThesis(id);
    // Bảng chuyển tiếp của REJECTED rỗng nên mọi cố gắng "mở lại" đều dừng ở
    // đây — không cần thêm một lần kiểm tra thủ công nào nữa.
    assertTransition(thesis.status, "REJECTED", user.role);

    await prisma.thesis.update({
      where: { id },
      data: { status: "REJECTED", rejection_reason: reason },
    });

    const audience = await thesisAudience(id);
    await notifyMany(audience.studentUserIds, {
      type: "THESIS",
      title: "Đề tài bị từ chối",
      content: `Đề tài “${thesis.title}” đã bị từ chối. Lý do: ${reason}. Bạn có thể tạo đề tài mới.`,
      link: thesisLink(id),
    });

    audit({
      action: AuditAction.THESIS_REJECT,
      req,
      details: { thesis_id: id, title: thesis.title, reason },
    });

    res.json(await findThesisDTO(id));
  })
);

/** UC 3.13 — đánh dấu hoàn thành. */
thesesRouter.post(
  "/:id/complete",
  requireContributor,
  validateParams(idParam),
  validateBody(completeSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;
    const { force } = req.body as z.infer<typeof completeSchema>;

    await assertThesisAccess(user, id, "review");
    const thesis = await loadThesis(id);
    assertTransition(thesis.status, "COMPLETED", user.role);

    // UC 3.13 ngoại lệ 2a — cảnh báo chứ không cấm: có đề tài kết thúc sớm hợp
    // lệ, nên giảng viên được quyền xác nhận bỏ qua bằng `force`.
    const unfinished = await prisma.milestone.count({
      where: { thesis_id: id, deleted_at: null, status: { not: "COMPLETED" } },
    });
    if (unfinished > 0 && !force) {
      throw conflict(
        `Đề tài còn ${unfinished} mốc tiến độ chưa hoàn thành. Gửi lại yêu cầu kèm xác nhận bỏ qua nếu vẫn muốn đánh dấu hoàn thành.`
      );
    }

    await prisma.thesis.update({
      where: { id },
      data: { status: "COMPLETED", completed_at: new Date() },
    });

    const audience = await thesisAudience(id);
    await notifyMany(audience.studentUserIds, {
      type: "THESIS",
      title: "Đề tài đã hoàn thành",
      content: `Đề tài “${thesis.title}” đã được giảng viên xác nhận hoàn thành. Hồ sơ được khóa để lưu trữ.`,
      link: thesisLink(id),
    });

    audit({
      action: AuditAction.THESIS_COMPLETE,
      req,
      details: { thesis_id: id, title: thesis.title, unfinished_milestones: unfinished, forced: force },
    });

    res.json(await findThesisDTO(id));
  })
);

/* ==========================================================================
   PHÂN CÔNG (UC 3.12) & THÀNH VIÊN
   ========================================================================== */

/** UC 3.12 — Admin gán / đổi giảng viên hướng dẫn. */
thesesRouter.patch(
  "/:id/lecturer",
  requireRole("ADMIN"),
  validateParams(idParam),
  validateBody(assignLecturerSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;
    const { lecturer_id, reason } = req.body as z.infer<typeof assignLecturerSchema>;

    await assertThesisAccess(user, id, "edit");
    const thesis = await loadThesis(id);

    if (thesis.lecturer_id === lecturer_id) {
      throw badRequest("Giảng viên này đã là người hướng dẫn hiện tại của đề tài.");
    }

    const incoming = await assertLecturerCapacity(lecturer_id, { excludeThesisId: id });

    const [previous, audience] = await Promise.all([
      thesis.lecturer_id === null
        ? Promise.resolve(null)
        : prisma.lecturer.findUnique({
            where: { id: thesis.lecturer_id },
            select: { user_id: true },
          }),
      thesisAudience(id),
    ]);

    await prisma.thesis.update({ where: { id }, data: { lecturer_id } });

    // Ba nhóm người nhận, hai nội dung khác nhau: người mới cần biết mình vừa
    // được giao việc, những người còn lại cần biết đầu mối đã đổi.
    await notify({
      userId: incoming.user_id,
      type: "THESIS",
      title: "Bạn được phân công hướng dẫn đề tài",
      content: `Quản trị viên đã phân công bạn hướng dẫn đề tài “${thesis.title}”.`,
      link: thesisLink(id),
    });

    const informed = previous ? [...audience.studentUserIds, previous.user_id] : audience.studentUserIds;
    await notifyMany(informed, {
      type: "THESIS",
      title: "Đề tài đã đổi giảng viên hướng dẫn",
      content: reason
        ? `Đề tài “${thesis.title}” chuyển sang giảng viên ${incoming.full_name}. Lý do: ${reason}`
        : `Đề tài “${thesis.title}” chuyển sang giảng viên ${incoming.full_name}.`,
      link: thesisLink(id),
    });

    audit({
      action: AuditAction.THESIS_ASSIGN_LECTURER,
      req,
      details: {
        thesis_id: id,
        title: thesis.title,
        from_lecturer_id: thesis.lecturer_id,
        to_lecturer_id: lecturer_id,
        reason,
      },
    });

    res.json(await findThesisDTO(id));
  })
);

/** Thêm sinh viên vào đề tài (đề tài nhóm, hoặc gán SV vào đề tài GV đề xuất). */
thesesRouter.post(
  "/:id/members",
  requireRole("ADMIN", "LECTURER"),
  validateParams(idParam),
  validateBody(memberSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;
    const { student_id } = req.body as z.infer<typeof memberSchema>;

    // `review` = giảng viên hướng dẫn của chính đề tài này (Admin luôn qua).
    await assertThesisAccess(user, id, "review");
    const thesis = await loadThesis(id);

    const student = await prisma.student.findUnique({
      where: { id: student_id },
      select: {
        id: true,
        user: { select: { id: true, full_name: true, status: true, deleted_at: true } },
      },
    });
    if (!student || student.user.deleted_at || student.user.status !== "ACTIVE") {
      throw badRequest("Sinh viên không tồn tại hoặc tài khoản không còn hoạt động.");
    }

    const existing = await prisma.thesisMember.findUnique({
      where: { thesis_id_student_id: { thesis_id: id, student_id } },
      select: { id: true, left_at: true },
    });
    if (existing && existing.left_at === null) {
      throw conflict("Sinh viên này đã là thành viên của đề tài.");
    }

    // BR UC 3.1 áp dụng cho cả đường "được thêm vào": một sinh viên không thể
    // đồng thời nằm trong hai đề tài đang chạy.
    await assertNoActiveThesis(student_id, "other");

    // Đề tài do giảng viên đề xuất chưa có ai; người đầu tiên vào là chủ nhiệm.
    const activeMembers = await prisma.thesisMember.count({
      where: { thesis_id: id, left_at: null },
    });
    const role = activeMembers === 0 ? "OWNER" : "MEMBER";

    if (existing) {
      // Quay lại đề tài cũ: hồi sinh bản ghi thay vì tạo dòng mới, vì ràng buộc
      // duy nhất (thesis_id, student_id) không cho phép hai dòng cùng cặp.
      await prisma.thesisMember.update({
        where: { id: existing.id },
        data: { left_at: null, joined_at: new Date(), role },
      });
    } else {
      await prisma.thesisMember.create({ data: { thesis_id: id, student_id, role } });
    }

    await notify({
      userId: student.user.id,
      type: "THESIS",
      title: "Bạn được thêm vào một đề tài",
      content: `Bạn vừa được thêm vào đề tài “${thesis.title}”.`,
      link: thesisLink(id),
    });

    audit({
      action: AuditAction.THESIS_UPDATE,
      req,
      details: { thesis_id: id, change: "member_add", student_id, role },
    });

    res.status(201).json(await findThesisDTO(id));
  })
);

/** Gỡ sinh viên khỏi đề tài. */
thesesRouter.delete(
  "/:id/members/:student_id",
  requireRole("ADMIN", "LECTURER"),
  validateParams(memberParams),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id, student_id } = req.params as unknown as z.infer<typeof memberParams>;

    await assertThesisAccess(user, id, "review");
    const thesis = await loadThesis(id);

    const member = await prisma.thesisMember.findUnique({
      where: { thesis_id_student_id: { thesis_id: id, student_id } },
      select: { id: true, left_at: true, student: { select: { user_id: true } } },
    });
    if (!member || member.left_at !== null) {
      throw notFound("Sinh viên không phải thành viên đang tham gia của đề tài này.");
    }

    // Đặt `left_at` thay vì xoá dòng: mốc tiến độ và tài liệu do sinh viên này
    // tạo vẫn còn, và câu hỏi "ai từng làm đề tài này" phải trả lời được.
    await prisma.thesisMember.update({
      where: { id: member.id },
      data: { left_at: new Date() },
    });

    await notify({
      userId: member.student.user_id,
      type: "THESIS",
      title: "Bạn đã rời khỏi một đề tài",
      content: `Bạn không còn là thành viên của đề tài “${thesis.title}”.`,
      link: thesisLink(id),
    });

    audit({
      action: AuditAction.THESIS_UPDATE,
      req,
      details: { thesis_id: id, change: "member_remove", student_id },
    });

    noContent(res);
  })
);

/* ==========================================================================
   LỊCH SỬ (UC 3.4 — tab "Lịch sử hoạt động")
   ========================================================================== */

thesesRouter.get(
  "/:id/history",
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;

    await assertThesisAccess(user, id, "view");
    res.json(await thesisHistory(id));
  })
);

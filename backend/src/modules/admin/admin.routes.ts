/**
 * MODULE 2 — QUẢN TRỊ HỆ THỐNG (UC 2.1 – 2.9)
 *
 * Toàn bộ router nằm sau `requireAuth + requireRole("ADMIN")` đặt ở cấp
 * `router.use()`. Gắn quyền một lần cho cả nhóm thay vì lặp lại trên từng
 * endpoint là có chủ đích: mọi endpoint thêm vào sau này được bảo vệ mặc định,
 * còn cách kia thì chỉ cần một lần quên là mở toang trang quản trị.
 *
 * Tầng này chỉ kiểm tra đầu vào bằng zod, gọi `admin.service.ts` rồi trả JSON
 * theo hợp đồng trong `serializers.ts`. Nhật ký kiểm toán được ghi ở đây vì đây
 * là nơi duy nhất có `req` — và vì UC 2.8 đòi hỏi biết AI làm gì với AI, chứ
 * không chỉ biết dữ liệu đã đổi.
 */
import { Router } from "express";
import { z } from "zod";
import { asyncHandler, noContent, paginated, paginationSchema, parsePage } from "../../lib/http";
import { badRequest } from "../../lib/errors";
import { logger } from "../../lib/logger";
import { audit, AuditAction } from "../../lib/audit";
import { currentUser, requireAuth, requireRole } from "../../middleware/auth";
import {
  emailField,
  idParam,
  optionalText,
  text,
  validateBody,
  validateParams,
  validateQuery,
} from "../../middleware/validate";
import { notify } from "../../services/notifications";
import { toAccountDTO, toConfigDTO, toSystemLogDTO } from "../serializers";
import {
  ROLE_LABELS,
  activateAcademicYear,
  applyConfigUpdates,
  buildStatistics,
  changeAccountRole,
  changeAccountStatus,
  createAcademicYear,
  createAccount,
  listAcademicYears,
  listAccounts,
  listConfigs,
  listLogActions,
  listLogs,
  softDeleteAccount,
  toAcademicYearDTO,
  updateAcademicYear,
  updateAccount,
} from "./admin.service";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole("ADMIN"));

/* ==========================================================================
   LƯỢC ĐỒ ĐẦU VÀO
   ========================================================================== */

const USER_ROLES = ["ADMIN", "LECTURER", "STUDENT"] as const;
const USER_STATUSES = ["ACTIVE", "SUSPENDED"] as const;
const LOG_LEVELS = ["INFO", "WARN", "ERROR"] as const;

/**
 * Các ô lọc ở giao diện gửi `"ALL"` khi người dùng chọn "Mọi vai trò". Không quy
 * về `undefined` ở đây thì server đi tìm `role = "ALL"` và trả danh sách rỗng —
 * lỗi trông hệt như mất dữ liệu.
 */
const anyToUndefined = (value: unknown): unknown =>
  value === "" || value === "ALL" || value === null ? undefined : value;

const enumFilter = <T extends readonly [string, ...string[]]>(values: T, message: string) =>
  z.preprocess(anyToUndefined, z.enum(values, { errorMap: () => ({ message }) }).optional());

const positiveId = (message: string) =>
  z.coerce.number({ invalid_type_error: message }).int(message).positive(message);

/**
 * Hạn mức hướng dẫn (UC 3.9). Cho phép 0 vì "giảng viên tạm không nhận sinh
 * viên" là tình huống có thật, khác hẳn với việc bỏ trống trường này.
 */
const maxStudentsField = z.coerce
  .number({ invalid_type_error: "Số sinh viên hướng dẫn tối đa phải là số." })
  .int("Số sinh viên hướng dẫn tối đa phải là số nguyên.")
  .min(0, "Số sinh viên hướng dẫn tối đa không được âm.")
  .max(100, "Số sinh viên hướng dẫn tối đa là 100.");

const listUsersSchema = z
  .object({
    search: optionalText(200, "Từ khóa tìm kiếm"),
    role: enumFilter(USER_ROLES, "Vai trò lọc không hợp lệ."),
    status: enumFilter(USER_STATUSES, "Trạng thái lọc không hợp lệ."),
  })
  .merge(paginationSchema);

const createUserSchema = z
  .object({
    email: emailField,
    full_name: text(2, 255, "Họ và tên"),
    role: z.enum(USER_ROLES, { errorMap: () => ({ message: "Vai trò không hợp lệ." }) }),
    student_code: optionalText(50, "Mã số sinh viên"),
    lecturer_code: optionalText(50, "Mã số giảng viên"),
    department: optionalText(100, "Khoa/Bộ môn"),
    max_students: maxStudentsField.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.role === "LECTURER") {
      if (!value.lecturer_code) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["lecturer_code"],
          message: "Mã số giảng viên là bắt buộc khi tạo tài khoản giảng viên.",
        });
      }
      if (!value.department) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["department"],
          message: "Khoa/Bộ môn là bắt buộc khi tạo tài khoản giảng viên.",
        });
      }
    }
    // Từ chối thay vì âm thầm bỏ qua: gửi MSSV kèm vai trò Giảng viên gần như
    // luôn là chọn nhầm vai trò, và mã số đó sẽ biến mất không dấu vết.
    if (value.role !== "STUDENT" && value.student_code) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["student_code"],
        message: "Chỉ tài khoản sinh viên mới có mã số sinh viên.",
      });
    }
    if (value.role !== "LECTURER" && (value.lecturer_code || value.department)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lecturer_code"],
        message: "Chỉ tài khoản giảng viên mới có mã số giảng viên và khoa/bộ môn.",
      });
    }
  });

/**
 * Trường bị khoá vĩnh viễn sau khi tạo (business rule UC 2.3 với mã số; UC 1.9
 * với email — nó là định danh đăng nhập).
 *
 * Khai báo tường minh thay vì để `z.object` lặng lẽ loại bỏ khoá lạ: im lặng bỏ
 * qua nghĩa là giao diện báo "lưu thành công" trong khi giá trị người dùng vừa
 * gõ không đi tới đâu cả.
 */
const lockedField = (message: string) => z.undefined({ invalid_type_error: message });

const updateUserSchema = z.object({
  full_name: text(2, 255, "Họ và tên").optional(),
  department: optionalText(100, "Khoa/Bộ môn"),
  max_students: maxStudentsField.optional(),

  email: lockedField("Email đăng nhập không thể thay đổi."),
  student_code: lockedField("Mã số sinh viên không thể thay đổi sau khi tạo tài khoản."),
  lecturer_code: lockedField("Mã số giảng viên không thể thay đổi sau khi tạo tài khoản."),
});

const changeStatusSchema = z.object({
  status: z.enum(USER_STATUSES, { errorMap: () => ({ message: "Trạng thái không hợp lệ." }) }),
});

const changeRoleSchema = z
  .object({
    role: z.enum(USER_ROLES, { errorMap: () => ({ message: "Vai trò không hợp lệ." }) }),
    student_code: optionalText(50, "Mã số sinh viên"),
    lecturer_code: optionalText(50, "Mã số giảng viên"),
    department: optionalText(100, "Khoa/Bộ môn"),
    max_students: maxStudentsField.optional(),
  })
  .superRefine((value, ctx) => {
    // Hồ sơ giảng viên được tạo mới trong lúc đổi vai trò, mà `lecturers` bắt
    // buộc có mã số và bộ môn — phải hỏi ngay ở đây, không thể suy ra được.
    if (value.role !== "LECTURER") return;
    if (!value.lecturer_code) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lecturer_code"],
        message: "Cần mã số giảng viên khi chuyển tài khoản sang vai trò Giảng viên.",
      });
    }
    if (!value.department) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["department"],
        message: "Cần khoa/bộ môn khi chuyển tài khoản sang vai trò Giảng viên.",
      });
    }
  });

const statisticsQuerySchema = z.object({
  academic_year_id: z.preprocess(anyToUndefined, positiveId("Năm học không hợp lệ.").optional()),
});

/** Chuỗi có phần giờ (`2026-07-30T08:00`) — dùng để biết có cần nới tới cuối ngày không. */
const HAS_TIME_PART = /\d[T ]\d/;

const logDateField = (label: string, endOfDay: boolean) =>
  z.preprocess(
    anyToUndefined,
    z
      .string({ invalid_type_error: `${label} không hợp lệ.` })
      .optional()
      .transform((value, ctx) => {
        if (value === undefined) return undefined;
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${label} không hợp lệ (định dạng YYYY-MM-DD).`,
          });
          return z.NEVER;
        }
        // `?to=2026-07-30` được hiểu là 00:00 ngày 30; để nguyên thì bộ lọc "đến
        // ngày" cắt mất chính ngày mà người dùng vừa chọn.
        if (endOfDay && !HAS_TIME_PART.test(value)) parsed.setUTCHours(23, 59, 59, 999);
        return parsed;
      })
  );

const listLogsSchema = z
  .object({
    search: optionalText(200, "Từ khóa tìm kiếm"),
    level: enumFilter(LOG_LEVELS, "Cấp độ log không hợp lệ."),
    action: z.preprocess(anyToUndefined, optionalText(255, "Hành động")),
    user_id: z.preprocess(anyToUndefined, positiveId("Người dùng không hợp lệ.").optional()),
    from: logDateField("Ngày bắt đầu", false),
    to: logDateField("Ngày kết thúc", true),
  })
  .merge(paginationSchema);

const updateConfigsSchema = z.object({
  configs: z
    .array(
      z.object({
        config_key: text(1, 100, "Khóa cấu hình"),
        // Kiểu dữ liệu thật được kiểm ở service theo `value_type` của từng khoá;
        // ở đây chỉ chặn độ dài cho khớp cột VARCHAR(1000).
        config_value: text(0, 1000, "Giá trị cấu hình"),
      })
    )
    .min(1, "Chưa có tham số nào để cập nhật.")
    .max(100, "Mỗi lần chỉ cập nhật tối đa 100 tham số."),
});

const dateField = (label: string) =>
  z.coerce.date({
    errorMap: () => ({ message: `${label} không hợp lệ (định dạng YYYY-MM-DD).` }),
  });

const createYearSchema = z.object({
  name: text(4, 50, "Tên năm học"),
  start_date: dateField("Ngày bắt đầu"),
  end_date: dateField("Ngày kết thúc"),
});

const updateYearSchema = z.object({
  name: text(4, 50, "Tên năm học").optional(),
  start_date: dateField("Ngày bắt đầu").optional(),
  end_date: dateField("Ngày kết thúc").optional(),
});

/* ==========================================================================
   TIỆN ÍCH
   ========================================================================== */

/**
 * Thông báo tới người bị tác động là việc phụ, giống ghi nhật ký: nó không được
 * phép làm hỏng một thao tác đã commit xuống CSDL.
 */
function notifyAccount(userId: number, title: string, content: string): void {
  void notify({ userId, type: "SYSTEM", title, content, force: true }).catch((err: unknown) =>
    logger.error({ err, userId }, "Không gửi được thông báo quản trị")
  );
}

/* ==========================================================================
   UC 2.1 — DANH SÁCH TÀI KHOẢN
   ========================================================================== */

adminRouter.get(
  "/users",
  validateQuery(listUsersSchema),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof listUsersSchema>;
    const page = parsePage(req.query);

    const { rows, total } = await listAccounts(query, page);

    res.json(paginated(rows.map(toAccountDTO), total, page));
  })
);

/* ==========================================================================
   UC 2.2 — TẠO TÀI KHOẢN
   ========================================================================== */

adminRouter.post(
  "/users",
  validateBody(createUserSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createUserSchema>;

    const account = await createAccount(body);

    audit({
      action: AuditAction.USER_CREATE,
      req,
      // Mật khẩu tạm không xuất hiện ở đây và cũng không có trong phản hồi: nó
      // chỉ đi một đường duy nhất là hộp thư của người dùng.
      details: { target_user_id: account.id, email: account.email, role: account.role },
    });

    res.status(201).json(toAccountDTO(account));
  })
);

/* ==========================================================================
   UC 2.3 — CHỈNH SỬA TÀI KHOẢN
   ========================================================================== */

adminRouter.patch(
  "/users/:id",
  validateParams(idParam),
  validateBody(updateUserSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParam>;
    const body = req.body as z.infer<typeof updateUserSchema>;

    const { account, changed } = await updateAccount(id, body);

    if (changed.length > 0) {
      audit({
        action: AuditAction.USER_UPDATE,
        req,
        details: { target_user_id: account.id, email: account.email, fields: changed },
      });
    }

    res.json(toAccountDTO(account));
  })
);

/* ==========================================================================
   UC 2.4 — VÔ HIỆU HOÁ / KHÔI PHỤC
   ========================================================================== */

adminRouter.patch(
  "/users/:id/status",
  validateParams(idParam),
  validateBody(changeStatusSchema),
  asyncHandler(async (req, res) => {
    const actor = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;
    const { status } = req.body as z.infer<typeof changeStatusSchema>;

    const result = await changeAccountStatus(actor.id, id, status);

    audit({
      action: AuditAction.USER_STATUS_CHANGE,
      req,
      // WARN: khoá và xoá tài khoản là hai thứ người kiểm toán tìm trước tiên,
      // để INFO thì chúng chìm nghỉm giữa hàng nghìn dòng đăng nhập.
      level: "WARN",
      details: {
        target_user_id: result.account.id,
        email: result.account.email,
        from: result.previous,
        to: status,
        revoked_sessions: result.revokedSessions,
      },
    });

    if (status === "ACTIVE") {
      // Chỉ báo khi mở khoá. Chiều ngược lại vô nghĩa: `notify()` không gửi email
      // cho tài khoản đang SUSPENDED, mà thông báo trong ứng dụng thì người bị
      // khoá cũng không đăng nhập vào để đọc được.
      notifyAccount(
        result.account.id,
        "Tài khoản đã được mở khóa",
        "Quản trị viên đã mở khóa tài khoản của bạn. Bạn có thể đăng nhập trở lại."
      );
    }

    res.json(toAccountDTO(result.account));
  })
);

/* ==========================================================================
   UC 2.5 — PHÂN QUYỀN VAI TRÒ
   ========================================================================== */

adminRouter.patch(
  "/users/:id/role",
  validateParams(idParam),
  validateBody(changeRoleSchema),
  asyncHandler(async (req, res) => {
    const actor = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;
    const body = req.body as z.infer<typeof changeRoleSchema>;

    const { account, previous } = await changeAccountRole(actor.id, id, body);

    audit({
      action: AuditAction.USER_ROLE_CHANGE,
      req,
      level: "WARN",
      // NFR của UC 2.5: "ghi log rõ ràng về việc ai đã thay đổi quyền của ai".
      // `user_id` của dòng log là người thao tác; `details` giữ phía bị tác động.
      details: {
        actor_email: actor.email,
        target_user_id: account.id,
        target_email: account.email,
        from: previous,
        to: account.role,
      },
    });

    notifyAccount(
      account.id,
      "Vai trò tài khoản đã thay đổi",
      `Quản trị viên đã chuyển vai trò tài khoản của bạn thành ${ROLE_LABELS[account.role]}. Một số chức năng bạn dùng trước đây có thể thay đổi.`
    );

    res.json(toAccountDTO(account));
  })
);

/* ==========================================================================
   XOÁ MỀM TÀI KHOẢN
   ========================================================================== */

adminRouter.delete(
  "/users/:id",
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    const actor = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;

    const { account, revokedSessions } = await softDeleteAccount(actor.id, id);

    audit({
      action: AuditAction.USER_DELETE,
      req,
      level: "WARN",
      details: {
        target_user_id: account.id,
        email: account.email,
        role: account.role,
        revoked_sessions: revokedSessions,
      },
    });

    noContent(res);
  })
);

/* ==========================================================================
   UC 2.6 — THỐNG KÊ TỔNG QUAN
   ========================================================================== */

adminRouter.get(
  "/statistics",
  validateQuery(statisticsQuerySchema),
  asyncHandler(async (req, res) => {
    const actor = currentUser(req);
    const { academic_year_id } = req.query as unknown as z.infer<typeof statisticsQuerySchema>;

    res.json(await buildStatistics(actor, academic_year_id));
  })
);

/* ==========================================================================
   UC 2.8 — NHẬT KÝ HỆ THỐNG
   ========================================================================== */

adminRouter.get(
  "/logs",
  validateQuery(listLogsSchema),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof listLogsSchema>;
    const page = parsePage(req.query);

    if (query.from && query.to && query.from > query.to) {
      throw badRequest("Khoảng thời gian không hợp lệ: ngày bắt đầu phải trước ngày kết thúc.");
    }

    const { rows, total } = await listLogs(query, page);

    // Không có endpoint POST/PATCH/DELETE nào cho `/logs`. NFR của UC 2.8 yêu cầu
    // nhật ký là read-only từ giao diện, và cách cưỡng chế đáng tin nhất là
    // không viết ra những endpoint đó.
    res.json(paginated(rows.map(toSystemLogDTO), total, page));
  })
);

adminRouter.get(
  "/logs/actions",
  asyncHandler(async (_req, res) => {
    res.json(await listLogActions());
  })
);

/* ==========================================================================
   UC 2.9 — CẤU HÌNH THAM SỐ
   ========================================================================== */

adminRouter.get(
  "/configs",
  asyncHandler(async (_req, res) => {
    const configs = await listConfigs();
    res.json(configs.map(toConfigDTO));
  })
);

adminRouter.put(
  "/configs",
  validateBody(updateConfigsSchema),
  asyncHandler(async (req, res) => {
    const actor = currentUser(req);
    const body = req.body as z.infer<typeof updateConfigsSchema>;

    const changes = await applyConfigUpdates(actor.id, body.configs);

    // Một dòng nhật ký cho mỗi khoá thay vì một dòng cho cả lô: đây đúng hình
    // dạng `{key, old, new}` mà trang xem chi tiết log đang dựng, và tra cứu
    // "ai đổi MAX_FILE_SIZE_MB" không phải bới trong mảng.
    for (const change of changes) {
      audit({ action: AuditAction.CONFIG_UPDATE, req, details: { ...change } });
    }

    const configs = await listConfigs();
    res.json(configs.map(toConfigDTO));
  })
);

/* ==========================================================================
   UC 2.7 — NĂM HỌC
   ========================================================================== */

adminRouter.get(
  "/academic-years",
  asyncHandler(async (_req, res) => {
    const years = await listAcademicYears();
    res.json(years.map(toAcademicYearDTO));
  })
);

adminRouter.post(
  "/academic-years",
  validateBody(createYearSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createYearSchema>;

    const year = await createAcademicYear(body);

    audit({
      action: AuditAction.ACADEMIC_YEAR_UPDATE,
      req,
      details: { operation: "create", academic_year_id: year.id, name: year.name },
    });

    res.status(201).json(toAcademicYearDTO(year));
  })
);

adminRouter.patch(
  "/academic-years/:id",
  validateParams(idParam),
  validateBody(updateYearSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParam>;
    const body = req.body as z.infer<typeof updateYearSchema>;

    const year = await updateAcademicYear(id, body);

    audit({
      action: AuditAction.ACADEMIC_YEAR_UPDATE,
      req,
      details: {
        operation: "update",
        academic_year_id: year.id,
        fields: Object.keys(body).filter((key) => body[key as keyof typeof body] !== undefined),
      },
    });

    res.json(toAcademicYearDTO(year));
  })
);

adminRouter.post(
  "/academic-years/:id/activate",
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParam>;

    const year = await activateAcademicYear(id);

    audit({
      action: AuditAction.ACADEMIC_YEAR_UPDATE,
      req,
      details: { operation: "activate", academic_year_id: year.id, name: year.name },
    });

    res.json(toAcademicYearDTO(year));
  })
);

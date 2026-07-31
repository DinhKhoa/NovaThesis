/**
 * MODULE 4 — MỐC TIẾN ĐỘ (UC 4.1 – 4.14)
 *
 * Ba nguyên tắc chi phối toàn bộ tệp này:
 *
 *   • Quyền trên dữ liệu luôn hỏi `domain/access`. Không handler nào tự viết
 *     điều kiện "sinh viên này có thuộc đề tài kia không" — đó là cách một chỗ
 *     sửa sai biến thành rò rỉ dữ liệu ở chỗ khác (§2.1 Tenant Isolation).
 *   • Trạng thái chỉ đổi qua `transitionMilestone`, tức là qua bảng FSM. Nút
 *     "Phê duyệt" và nút "Yêu cầu sửa" không phải hai luồng riêng: chúng là hai
 *     phép chuyển tiếp trong cùng một máy trạng thái.
 *   • Mọi thay đổi trạng thái / hạn chót / minh chứng đều để lại một dòng
 *     `MilestoneHistory` (UC 4.12). Bảng đó chỉ ghi thêm, không có endpoint nào
 *     sửa hay xoá nó.
 */
import { Router, type RequestHandler } from "express";
import multer from "multer";
import { z } from "zod";
import { MilestoneStatus, type Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { asyncHandler, noContent, paginated, parsePage } from "../../lib/http";
import { badRequest, conflict, forbidden, notFound, tooLarge } from "../../lib/errors";
import { audit, AuditAction } from "../../lib/audit";
import {
  assertAllowedType,
  deleteFile,
  EVIDENCE_MIME,
  formatBytes,
  saveBuffer,
} from "../../lib/storage";
import { currentUser, requireAuth, requireRole } from "../../middleware/auth";
import {
  idParam,
  optionalText,
  text,
  validateBody,
  validateParams,
  validateQuery,
} from "../../middleware/validate";
import { uploadLimiter } from "../../middleware/rate-limit";
import { assertThesisAccess, thesisScopeFilter } from "../../domain/access";
import { STATUS_LABELS } from "../../domain/milestone-fsm";
import { toMilestoneHistoryDTO } from "../serializers";
import {
  assertDeadlineWithinThesis,
  dateField,
  dateText,
  lecturerDashboard,
  loadMilestone,
  MILESTONE_INCLUDE,
  notifyAboutMilestone,
  startOfToday,
  statusSentence,
  studentDashboard,
  toMilestoneView,
  transitionMilestone,
  writeHistory,
  type HistoryEntry,
} from "./milestones.service";

export const milestonesRouter = Router();

/* ==========================================================================
   TẢI MINH CHỨNG (UC 4.9)
   ========================================================================== */

/** BR UC 4.9: "Tối đa 10MB/file" — nhỏ hơn hẳn trần chung 50 MB của tài liệu. */
const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;

const memoryUpload = multer({
  // Minh chứng nhỏ và cần kiểm tra định dạng TRƯỚC khi chạm đĩa, nên giữ trong
  // RAM; tài liệu luận văn 50 MB thì phải dùng stream (xem `lib/storage`).
  storage: multer.memoryStorage(),
  limits: { fileSize: EVIDENCE_MAX_BYTES, files: 1 },
}).single("file");

/**
 * Bọc multer để thông điệp quá dung lượng nói đúng con số của UC 4.9.
 *
 * Bộ xử lý lỗi chung chỉ biết trần toàn cục (`MAX_UPLOAD_MB`), nên nếu để nó trả
 * lời, sinh viên sẽ đọc được "tối đa 50 MB" ngay sau khi bị chặn ở 10 MB.
 */
const evidenceUpload: RequestHandler = (req, res, next) => {
  memoryUpload(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return next(
        tooLarge(`Tệp minh chứng vượt quá dung lượng cho phép (${formatBytes(EVIDENCE_MAX_BYTES)}).`)
      );
    }
    if (err) return next(err);
    next();
  });
};

/**
 * Khôi phục tên tệp tiếng Việt.
 *
 * busboy giải mã tên tệp trong multipart theo latin1, nên `báo_cáo.pdf` tới nơi
 * thành `bÃ¡o_cÃ¡o.pdf`. Chỉ giải mã lại khi chuỗi nằm trọn trong dải latin1 VÀ
 * cho ra UTF-8 hợp lệ — hai điều kiện này loại được trường hợp tên đã đúng sẵn,
 * vốn sẽ bị hỏng nếu giải mã thêm lần nữa.
 */
function decodeUploadName(raw: string): string {
  for (const ch of raw) {
    if ((ch.codePointAt(0) ?? 0) > 0xff) return raw;
  }
  const reencoded = Buffer.from(raw, "latin1").toString("utf8");
  // U+FFFD = ký tự thay thế, dấu hiệu chuỗi ban đầu vốn không phải UTF-8.
  return reencoded.includes("\uFFFD") ? raw : reencoded;
}

/* ==========================================================================
   DASHBOARD (UC 4.13 / 4.14) — đăng ký trước `/:id` cho dễ đọc
   ========================================================================== */

const dashboardQuery = z.object({
  thesis_id: z.coerce.number().int().positive().optional(),
});

/** UC 4.13 — tổng quan tiến độ của một đề tài + dòng thời gian hoạt động. */
milestonesRouter.get(
  "/dashboard/student",
  requireAuth,
  validateQuery(dashboardQuery),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { thesis_id } = req.query as unknown as z.infer<typeof dashboardQuery>;

    // Có chỉ định đề tài thì kiểm tra quyền tường minh để người dùng nhận được
    // 403/404 rõ ràng, thay vì một dashboard rỗng khó hiểu.
    if (thesis_id !== undefined) await assertThesisAccess(user, thesis_id, "view");

    res.json(await studentDashboard(user, thesis_id ?? null));
  })
);

/** UC 4.14 — bảng so sánh các nhóm do giảng viên hướng dẫn. */
milestonesRouter.get(
  "/dashboard/lecturer",
  requireAuth,
  requireRole("LECTURER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    res.json(await lecturerDashboard(user));
  })
);

/* ==========================================================================
   SẮP XẾP LẠI (Kanban / Gantt)
   ========================================================================== */

const reorderSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.coerce.number().int().positive("Mã mốc tiến độ không hợp lệ."),
        order_index: z.coerce.number().int().min(0).max(9999),
      })
    )
    .min(1, "Danh sách sắp xếp không được rỗng.")
    .max(200, "Chỉ sắp xếp tối đa 200 mốc trong một lần."),
});

/**
 * Đổi thứ tự hiển thị.
 *
 * Phải đăng ký TRƯỚC `PATCH /:id`: Express so khớp theo thứ tự khai báo, đặt sau
 * thì "reorder" sẽ rơi vào tham số `:id` và chết ở bước ép kiểu số.
 */
milestonesRouter.patch(
  "/reorder",
  requireAuth,
  validateBody(reorderSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { items } = req.body as z.infer<typeof reorderSchema>;

    const ids = items.map((i) => i.id);
    const rows = await prisma.milestone.findMany({
      where: { id: { in: ids }, deleted_at: null },
      select: { id: true, thesis_id: true },
    });

    // Lệch số lượng nghĩa là có id trùng lặp hoặc id không tồn tại; cả hai đều
    // khiến thứ tự cuối cùng không như người dùng thấy trên màn hình.
    if (rows.length !== ids.length) {
      throw notFound("Danh sách chứa mốc tiến độ không tồn tại hoặc bị trùng.");
    }

    // Vòng lặp chạy trên số ĐỀ TÀI riêng biệt (gần như luôn là 1), không phải
    // trên từng mốc — nên đây không phải N+1.
    const thesisIds = [...new Set(rows.map((r) => r.thesis_id))];
    for (const thesisId of thesisIds) {
      await assertThesisAccess(user, thesisId, "contribute");
    }

    await prisma.$transaction(
      items.map((item) =>
        prisma.milestone.update({
          where: { id: item.id },
          data: { order_index: item.order_index },
        })
      )
    );

    audit({
      action: AuditAction.MILESTONE_UPDATE,
      req,
      details: {
        // `thesis_id` là khoá mà dòng thời gian hoạt động lọc theo; giữ cả danh
        // sách đầy đủ cho trường hợp hiếm gặp sắp xếp chéo nhiều đề tài.
        thesis_id: thesisIds[0] ?? null,
        thesis_ids: thesisIds,
        change: "reorder",
        count: items.length,
      },
    });

    const updated = await prisma.milestone.findMany({
      where: { id: { in: ids } },
      orderBy: [{ order_index: "asc" }, { deadline: "asc" }],
      include: MILESTONE_INCLUDE,
    });

    res.json({ data: updated.map((m) => toMilestoneView(m, user.role)) });
  })
);

/* ==========================================================================
   DANH SÁCH & TẠO MỚI
   ========================================================================== */

const listQuery = z.object({
  thesis_id: z.coerce.number().int().positive().optional(),
  status: z.nativeEnum(MilestoneStatus).optional(),
  page: z.coerce.number().int().min(1).optional(),
  per_page: z.coerce.number().int().min(1).max(100).optional(),
});

/** UC 4.2 — danh sách mốc, mặc định trong toàn bộ phạm vi người dùng thấy được. */
milestonesRouter.get(
  "/",
  requireAuth,
  validateQuery(listQuery),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { thesis_id, status } = req.query as unknown as z.infer<typeof listQuery>;
    const page = parsePage(req.query);

    let where: Prisma.MilestoneWhereInput;
    if (thesis_id !== undefined) {
      await assertThesisAccess(user, thesis_id, "view");
      where = { deleted_at: null, thesis_id, ...(status ? { status } : {}) };
    } else {
      // Không chỉ định đề tài → giới hạn theo đúng phạm vi của người dùng.
      const scope = await thesisScopeFilter(user);
      where = {
        deleted_at: null,
        thesis: { deleted_at: null, ...scope },
        ...(status ? { status } : {}),
      };
    }

    const [rows, total] = await Promise.all([
      prisma.milestone.findMany({
        where,
        // `order_index` là thứ tự do người dùng sắp; `deadline` chỉ để phá hoà
        // khi hai mốc cùng vị trí, nếu không danh sách sẽ nhảy giữa các lần tải.
        orderBy: [{ order_index: "asc" }, { deadline: "asc" }],
        skip: page.skip,
        take: page.take,
        include: MILESTONE_INCLUDE,
      }),
      prisma.milestone.count({ where }),
    ]);

    res.json(paginated(rows.map((m) => toMilestoneView(m, user.role)), total, page));
  })
);

const createSchema = z.object({
  thesis_id: z.coerce.number().int().positive("Vui lòng chọn đề tài."),
  name: text(3, 255, "Tên mốc tiến độ"),
  description: optionalText(5000, "Mô tả"),
  deadline: dateField("Hạn chót"),
});

/** UC 4.1 — tạo mốc mới. */
milestonesRouter.post(
  "/",
  requireAuth,
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const body = req.body as z.infer<typeof createSchema>;

    await assertThesisAccess(user, body.thesis_id, "contribute");

    // Luồng phụ 4a của UC 4.1: hạn chót trong quá khứ là lỗi nhập liệu ngay lúc
    // tạo. Khi SỬA thì lại hợp lệ (UC 4.6 bước 5 xử lý mốc đã trễ), nên ràng
    // buộc này chỉ đặt ở đây.
    if (body.deadline < startOfToday()) {
      throw badRequest("Hạn chót không được nằm trong quá khứ.");
    }
    await assertDeadlineWithinThesis(body.thesis_id, body.deadline);

    // Mốc mới luôn xuống cuối hàng đợi công việc.
    const last = await prisma.milestone.aggregate({
      where: { thesis_id: body.thesis_id, deleted_at: null },
      _max: { order_index: true },
    });

    const milestone = await prisma.milestone.create({
      data: {
        thesis_id: body.thesis_id,
        name: body.name,
        description: body.description ?? null,
        deadline: body.deadline,
        order_index: (last._max.order_index ?? -1) + 1,
      },
      include: MILESTONE_INCLUDE,
    });

    audit({
      action: AuditAction.MILESTONE_CREATE,
      req,
      details: {
        thesis_id: milestone.thesis_id,
        milestone_id: milestone.id,
        name: milestone.name,
        deadline: dateText(milestone.deadline),
      },
    });

    await notifyAboutMilestone({
      thesisId: milestone.thesis_id,
      milestoneId: milestone.id,
      actor: user,
      // Mốc do sinh viên tạo thì giảng viên cần biết, và ngược lại — "bên còn
      // lại" diễn đạt đúng cả hai chiều mà không cần rẽ nhánh theo vai trò.
      audience: "counterpart",
      title: "Mốc tiến độ mới",
      content: `${user.full_name} đã thêm mốc “${milestone.name}” (hạn ${dateText(milestone.deadline)}) vào đề tài “${milestone.thesis.title}”.`,
    });

    res.status(201).json({ data: toMilestoneView(milestone, user.role) });
  })
);

/* ==========================================================================
   CHI TIẾT / SỬA / XOÁ
   ========================================================================== */

/** UC 4.3 — chi tiết một mốc. */
milestonesRouter.get(
  "/:id",
  requireAuth,
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;

    const milestone = await loadMilestone(id);
    await assertThesisAccess(user, milestone.thesis_id, "view");

    res.json({ data: toMilestoneView(milestone, user.role) });
  })
);

const updateSchema = z
  .object({
    name: text(3, 255, "Tên mốc tiến độ").optional(),
    description: optionalText(5000, "Mô tả"),
    deadline: dateField("Hạn chót").optional(),
  })
  .refine(
    (v) => v.name !== undefined || v.description !== undefined || v.deadline !== undefined,
    "Không có thay đổi nào được gửi lên."
  );

/** UC 4.4 / 4.6 — sửa thông tin và hạn chót. */
milestonesRouter.patch(
  "/:id",
  requireAuth,
  validateParams(idParam),
  validateBody(updateSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;
    const body = req.body as z.infer<typeof updateSchema>;

    const milestone = await loadMilestone(id);
    await assertThesisAccess(user, milestone.thesis_id, "contribute");

    // BR UC 4.4: mốc đã hoàn thành là hồ sơ đã chốt. Giảng viên/Admin vẫn sửa
    // được vì họ là người có thẩm quyền mở lại nó.
    if (milestone.status === "COMPLETED" && user.role === "STUDENT") {
      throw conflict(
        "Không thể sửa mốc tiến độ đã hoàn thành. Hãy đề nghị giảng viên mở lại mốc này."
      );
    }

    const history: HistoryEntry[] = [];
    const data: {
      name?: string;
      description?: string;
      deadline?: Date;
    } = {};

    if (body.name !== undefined && body.name !== milestone.name) {
      history.push({ field_name: "name", old_value: milestone.name, new_value: body.name });
      data.name = body.name;
    }

    if (body.description !== undefined && body.description !== milestone.description) {
      data.description = body.description;
    }

    if (body.deadline !== undefined && body.deadline.getTime() !== milestone.deadline.getTime()) {
      // Luồng phụ 4a của UC 4.6: sinh viên tự kéo dài hạn là bỏ qua khâu duyệt
      // của giảng viên. Rút ngắn hạn thì không cần xin phép ai.
      if (user.role === "STUDENT" && body.deadline > milestone.deadline) {
        throw forbidden(
          "Kéo dài hạn chót phải đi qua chức năng “Yêu cầu gia hạn” để giảng viên phê duyệt."
        );
      }
      await assertDeadlineWithinThesis(milestone.thesis_id, body.deadline);
      history.push({
        field_name: "deadline",
        old_value: dateText(milestone.deadline),
        new_value: dateText(body.deadline),
      });
      data.deadline = body.deadline;
    }

    if (Object.keys(data).length === 0) {
      // Không có gì đổi thật sự → không ghi lịch sử rỗng, chỉ trả lại bản hiện tại.
      res.json({ data: toMilestoneView(milestone, user.role) });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.milestone.update({
        where: { id },
        data,
        include: MILESTONE_INCLUDE,
      });
      if (history.length > 0) await writeHistory(tx, id, user.id, history);
      return row;
    });

    audit({
      action: AuditAction.MILESTONE_UPDATE,
      req,
      details: {
        thesis_id: updated.thesis_id,
        milestone_id: updated.id,
        name: updated.name,
        fields: Object.keys(data),
      },
    });

    res.json({ data: toMilestoneView(updated, user.role) });
  })
);

/** UC 4.5 — xoá mềm. */
milestonesRouter.delete(
  "/:id",
  requireAuth,
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;

    const milestone = await loadMilestone(id);
    await assertThesisAccess(user, milestone.thesis_id, "contribute");

    // BR UC 4.5: lộ trình là của sinh viên. Giảng viên không đồng ý với một mốc
    // thì dùng "Yêu cầu chỉnh sửa", không xoá công việc của người khác.
    if (user.role === "LECTURER") {
      throw forbidden(
        "Giảng viên không xóa được mốc tiến độ của sinh viên. Hãy dùng “Yêu cầu chỉnh sửa”."
      );
    }
    if (milestone.status === "COMPLETED" && user.role !== "ADMIN") {
      throw conflict("Không thể xóa mốc tiến độ đã được phê duyệt hoàn thành.");
    }

    await prisma.milestone.update({ where: { id }, data: { deleted_at: new Date() } });

    // Cố ý KHÔNG xoá tệp minh chứng: xoá mềm tồn tại để truy vết được, mà bản
    // ghi trỏ tới một tệp không còn trên đĩa thì không truy vết được gì.
    audit({
      action: AuditAction.MILESTONE_DELETE,
      req,
      details: {
        thesis_id: milestone.thesis_id,
        milestone_id: milestone.id,
        name: milestone.name,
        status: milestone.status,
      },
    });

    noContent(res);
  })
);

/* ==========================================================================
   MÁY TRẠNG THÁI (UC 4.8 / 4.10 / 4.11)
   ========================================================================== */

const statusSchema = z.object({
  status: z.nativeEnum(MilestoneStatus, {
    required_error: "Vui lòng chọn trạng thái.",
    invalid_type_error: "Trạng thái không hợp lệ.",
  }),
  note: optionalText(1000, "Ghi chú"),
});

/** UC 4.8 — cổng FSM chung cho kéo-thả Kanban và dropdown danh sách. */
milestonesRouter.patch(
  "/:id/status",
  requireAuth,
  validateParams(idParam),
  validateBody(statusSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;
    const body = req.body as z.infer<typeof statusSchema>;

    const milestone = await loadMilestone(id);
    await assertThesisAccess(user, milestone.thesis_id, "contribute");

    const from = milestone.status;
    const updated = await transitionMilestone({
      user,
      milestone,
      to: body.status,
      note: body.note,
    });

    audit({
      action: AuditAction.MILESTONE_STATUS_CHANGE,
      req,
      details: {
        thesis_id: updated.thesis_id,
        milestone_id: updated.id,
        name: updated.name,
        from,
        to: body.status,
      },
    });

    if (from !== body.status) {
      await notifyAboutMilestone({
        thesisId: updated.thesis_id,
        milestoneId: updated.id,
        actor: user,
        audience: "counterpart",
        title: `Mốc tiến độ: ${STATUS_LABELS[body.status]}`,
        content: statusSentence(updated.name, updated.thesis.title, body.status),
      });
    }

    res.json({ data: toMilestoneView(updated, user.role) });
  })
);

const approveSchema = z.object({ note: optionalText(2000, "Nhận xét") });

/** UC 4.10 — giảng viên phê duyệt hoàn thành. */
milestonesRouter.post(
  "/:id/approve",
  requireAuth,
  validateParams(idParam),
  validateBody(approveSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;
    const { note } = req.body as z.infer<typeof approveSchema>;

    const milestone = await loadMilestone(id);
    await assertThesisAccess(user, milestone.thesis_id, "review");

    // Không có nhánh "đặt thẳng COMPLETED": đi qua cùng bảng FSM nên quy tắc
    // "chỉ duyệt được mốc đang chờ" chỉ tồn tại ở một chỗ duy nhất.
    const updated = await transitionMilestone({ user, milestone, to: "COMPLETED", note });

    audit({
      action: AuditAction.MILESTONE_APPROVE,
      req,
      details: {
        thesis_id: updated.thesis_id,
        milestone_id: updated.id,
        name: updated.name,
        from: milestone.status,
        to: "COMPLETED",
      },
    });

    await notifyAboutMilestone({
      thesisId: updated.thesis_id,
      milestoneId: updated.id,
      actor: user,
      audience: "students",
      title: "Mốc tiến độ đã được phê duyệt",
      content: `${user.full_name} đã phê duyệt hoàn thành mốc “${updated.name}”.${note ? ` Nhận xét: ${note}` : ""}`,
    });

    res.json({ data: toMilestoneView(updated, user.role) });
  })
);

const revisionSchema = z.object({
  note: text(5, 2000, "Nội dung yêu cầu chỉnh sửa"),
});

/** UC 4.11 — giảng viên trả mốc về cho sinh viên sửa. */
milestonesRouter.post(
  "/:id/request-revision",
  requireAuth,
  validateParams(idParam),
  validateBody(revisionSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;
    const { note } = req.body as z.infer<typeof revisionSchema>;

    const milestone = await loadMilestone(id);
    await assertThesisAccess(user, milestone.thesis_id, "review");

    // BR UC 4.11: nhận xét là BẮT BUỘC — schema đã chặn chuỗi rỗng, nên tới đây
    // sinh viên chắc chắn có nội dung để biết đường sửa.
    const updated = await transitionMilestone({
      user,
      milestone,
      to: "REVISION_REQUIRED",
      note,
      descriptionRevision: note,
    });

    audit({
      action: AuditAction.MILESTONE_REVISION,
      req,
      details: {
        thesis_id: updated.thesis_id,
        milestone_id: updated.id,
        name: updated.name,
        from: milestone.status,
      },
    });

    await notifyAboutMilestone({
      thesisId: updated.thesis_id,
      milestoneId: updated.id,
      actor: user,
      audience: "students",
      // NFR UC 4.11 đòi "thông báo khẩn": mức khẩn nằm ở tiêu đề và ở việc gửi
      // cả hai kênh, không phải ở `force` — `force` bỏ qua tuỳ chọn của người
      // dùng (UC 8.7) và chỉ dành cho cảnh báo bảo mật.
      title: "Cần chỉnh sửa mốc tiến độ",
      content: `${user.full_name} yêu cầu chỉnh sửa mốc “${updated.name}”: ${note}`,
    });

    res.json({ data: toMilestoneView(updated, user.role) });
  })
);

/* ==========================================================================
   MINH CHỨNG (UC 4.9)
   ========================================================================== */

const evidenceSchema = z.object({
  // Multipart chỉ truyền chuỗi, nên "true"/"1" cũng phải hiểu được.
  auto_submit: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => v === true || v === "true" || v === "1"),
});

milestonesRouter.post(
  "/:id/evidence",
  requireAuth,
  uploadLimiter,
  validateParams(idParam),
  evidenceUpload,
  validateBody(evidenceSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;
    const { auto_submit } = req.body as z.infer<typeof evidenceSchema>;

    const file = req.file;
    if (!file) throw badRequest("Vui lòng chọn tệp minh chứng để tải lên.");

    const milestone = await loadMilestone(id);
    await assertThesisAccess(user, milestone.thesis_id, "contribute");

    // Pre-condition UC 4.9. Không có chốt này thì đường không-auto-submit vẫn
    // thay được minh chứng của một mốc đã duyệt — giảng viên duyệt tệp A rồi
    // hồ sơ lại đang giữ tệp B.
    if (milestone.status === "COMPLETED") {
      throw conflict(
        "Mốc tiến độ đã được phê duyệt hoàn thành. Hãy đề nghị giảng viên mở lại mốc trước khi nộp minh chứng mới."
      );
    }

    // Kiểm tra mime CHÉO với phần mở rộng: mime do trình duyệt khai, tự nó không
    // đáng tin (xem `assertAllowedType`).
    const originalName = decodeUploadName(file.originalname).slice(0, 255);
    assertAllowedType(EVIDENCE_MIME, file.mimetype, originalName);

    const previousPath = milestone.evidence_file_url;
    const stored = await saveBuffer("evidence", originalName, file.buffer);

    let updated;
    if (auto_submit) {
      // Gộp minh chứng và chuyển trạng thái vào MỘT giao dịch: nếu FSM từ chối,
      // không có gì được ghi và tệp vừa lưu được dọn ở nhánh catch bên dưới.
      try {
        updated = await transitionMilestone({
          user,
          milestone,
          to: "PENDING_APPROVAL",
          evidence: { file_url: stored.relativePath, filename: originalName },
        });
      } catch (err) {
        await deleteFile(stored.relativePath);
        throw err;
      }
    } else {
      updated = await prisma.$transaction(async (tx) => {
        const row = await tx.milestone.update({
          where: { id },
          data: { evidence_file_url: stored.relativePath, evidence_filename: originalName },
          include: MILESTONE_INCLUDE,
        });
        await writeHistory(tx, id, user.id, [
          {
            field_name: "evidence",
            old_value: milestone.evidence_filename,
            new_value: originalName,
          },
        ]);
        return row;
      });
    }

    // Bản ghi đã trỏ sang tệp mới → tệp cũ thành rác. Xoá sau khi commit để một
    // giao dịch thất bại không lấy mất minh chứng đang có hiệu lực.
    if (previousPath && previousPath !== stored.relativePath) {
      await deleteFile(previousPath);
    }

    audit({
      action: AuditAction.MILESTONE_UPDATE,
      req,
      details: {
        thesis_id: updated.thesis_id,
        milestone_id: updated.id,
        name: updated.name,
        change: "evidence",
        filename: originalName,
        size: stored.size,
        auto_submit,
      },
    });

    await notifyAboutMilestone({
      thesisId: updated.thesis_id,
      milestoneId: updated.id,
      actor: user,
      audience: "counterpart",
      title: auto_submit ? "Mốc tiến độ chờ phê duyệt" : "Minh chứng mới được nộp",
      content: `${user.full_name} đã nộp minh chứng “${originalName}” cho mốc “${updated.name}”.`,
    });

    res.status(201).json({ data: toMilestoneView(updated, user.role) });
  })
);

/* ==========================================================================
   GIA HẠN (UC 4.7)
   ========================================================================== */

const extensionSchema = z.object({
  new_deadline: dateField("Hạn chót đề xuất"),
  reason: text(5, 2000, "Lý do xin gia hạn"),
});

milestonesRouter.post(
  "/:id/extension",
  requireAuth,
  validateParams(idParam),
  validateBody(extensionSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;
    const body = req.body as z.infer<typeof extensionSchema>;

    const milestone = await loadMilestone(id);
    await assertThesisAccess(user, milestone.thesis_id, "contribute");

    if (milestone.status === "COMPLETED") {
      throw conflict("Mốc tiến độ đã hoàn thành, không cần gia hạn nữa.");
    }
    // Yêu cầu thứ hai khi giảng viên chưa trả lời sẽ âm thầm thay đổi đúng thứ
    // họ đang xem — chặn ở đây thay vì để hai bên nhìn hai nội dung khác nhau.
    if (milestone.extension_status === "PENDING") {
      throw conflict("Đã có yêu cầu gia hạn đang chờ giảng viên xử lý.");
    }
    if (body.new_deadline <= milestone.deadline) {
      throw badRequest(
        `Hạn chót đề xuất phải muộn hơn hạn hiện tại (${dateText(milestone.deadline)}).`
      );
    }
    await assertDeadlineWithinThesis(milestone.thesis_id, body.new_deadline, "Hạn chót đề xuất");

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.milestone.update({
        where: { id },
        data: {
          extension_requested: true,
          extension_reason: body.reason,
          extension_new_deadline: body.new_deadline,
          extension_status: "PENDING",
        },
        include: MILESTONE_INCLUDE,
      });
      await writeHistory(tx, id, user.id, [
        {
          field_name: "extension_status",
          old_value: milestone.extension_status,
          new_value: "PENDING",
          note: `Đề xuất dời hạn sang ${dateText(body.new_deadline)}: ${body.reason}`,
        },
      ]);
      return row;
    });

    audit({
      action: AuditAction.MILESTONE_EXTENSION_REQUEST,
      req,
      details: {
        thesis_id: updated.thesis_id,
        milestone_id: updated.id,
        name: updated.name,
        old_deadline: dateText(milestone.deadline),
        new_deadline: dateText(body.new_deadline),
      },
    });

    // `notify()` gửi cả in-app lẫn email theo tuỳ chọn của người nhận — đúng NFR
    // "thông báo + email cho giảng viên" của UC 4.7, và vẫn tôn trọng UC 8.7.
    await notifyAboutMilestone({
      thesisId: updated.thesis_id,
      milestoneId: updated.id,
      actor: user,
      audience: "lecturer",
      title: "Yêu cầu gia hạn mốc tiến độ",
      content: `${user.full_name} xin gia hạn mốc “${updated.name}” từ ${dateText(milestone.deadline)} sang ${dateText(body.new_deadline)}. Lý do: ${body.reason}`,
    });

    res.json({ data: toMilestoneView(updated, user.role) });
  })
);

const extensionReviewSchema = z
  .object({
    approve: z.boolean({ required_error: "Vui lòng chọn đồng ý hoặc từ chối." }),
    note: optionalText(2000, "Ghi chú"),
  })
  // Luồng phụ 6a của UC 4.7: từ chối thì phải nói rõ vì sao, nếu không sinh viên
  // không biết nên nộp lại hay xin lại hạn khác.
  .refine((v) => v.approve || (v.note !== undefined && v.note.length > 0), {
    message: "Vui lòng nhập lý do từ chối gia hạn.",
    path: ["note"],
  });

milestonesRouter.post(
  "/:id/extension/review",
  requireAuth,
  validateParams(idParam),
  validateBody(extensionReviewSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;
    const body = req.body as z.infer<typeof extensionReviewSchema>;

    const milestone = await loadMilestone(id);
    await assertThesisAccess(user, milestone.thesis_id, "review");

    if (milestone.extension_status !== "PENDING" || milestone.extension_new_deadline === null) {
      throw conflict("Mốc tiến độ này không có yêu cầu gia hạn nào đang chờ xử lý.");
    }

    const proposed = milestone.extension_new_deadline;
    const history: HistoryEntry[] = [];

    if (body.approve) {
      history.push({
        field_name: "deadline",
        old_value: dateText(milestone.deadline),
        new_value: dateText(proposed),
        note: body.note ?? "Chấp thuận yêu cầu gia hạn.",
      });
    } else {
      history.push({
        field_name: "extension_status",
        old_value: "PENDING",
        new_value: "REJECTED",
        note: body.note ?? null,
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.milestone.update({
        where: { id },
        data: body.approve
          ? { deadline: proposed, extension_status: "APPROVED" }
          : { extension_status: "REJECTED" },
        include: MILESTONE_INCLUDE,
      });
      await writeHistory(tx, id, user.id, history);
      return row;
    });

    audit({
      action: AuditAction.MILESTONE_EXTENSION_REVIEW,
      req,
      details: {
        thesis_id: updated.thesis_id,
        milestone_id: updated.id,
        name: updated.name,
        approved: body.approve,
        new_deadline: dateText(proposed),
      },
    });

    await notifyAboutMilestone({
      thesisId: updated.thesis_id,
      milestoneId: updated.id,
      actor: user,
      audience: "students",
      title: body.approve ? "Yêu cầu gia hạn được chấp thuận" : "Yêu cầu gia hạn bị từ chối",
      content: body.approve
        ? `Mốc “${updated.name}” đã được dời hạn sang ${dateText(proposed)}.${body.note ? ` Ghi chú: ${body.note}` : ""}`
        : `Yêu cầu gia hạn mốc “${updated.name}” không được chấp thuận. Lý do: ${body.note ?? "Không có"}`,
    });

    res.json({ data: toMilestoneView(updated, user.role) });
  })
);

/* ==========================================================================
   LỊCH SỬ (UC 4.12)
   ========================================================================== */

milestonesRouter.get(
  "/:id/history",
  requireAuth,
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;

    const milestone = await loadMilestone(id);
    await assertThesisAccess(user, milestone.thesis_id, "view");

    const rows = await prisma.milestoneHistory.findMany({
      where: { milestone_id: id },
      orderBy: { created_at: "desc" },
      // Trần cứng: dòng thời gian là để đọc, không phải để tải về toàn bộ.
      take: 200,
      include: { actor: { select: { full_name: true } } },
    });

    res.json({ data: rows.map(toMilestoneHistoryDTO) });
  })
);

/**
 * MODULE 8 — THÔNG BÁO (tầng HTTP)
 *
 * Xem danh sách (UC 8.3), đánh dấu đã đọc từng cái (UC 8.4) hoặc tất cả
 * (UC 8.5), xoá (UC 8.6) và cài đặt kênh nhận theo từng loại sự kiện (UC 8.7).
 *
 * Việc SINH ra thông báo không nằm ở đây: `services/notifications.ts` là đường
 * duy nhất, còn UC 8.1/8.2/8.8 được kích hoạt từ các module nghiệp vụ và từ
 * `jobs/scheduler.ts`. Module này chỉ phục vụ hộp thư của chính người đang đăng
 * nhập — kể cả ADMIN cũng không đọc được hộp thư người khác qua các endpoint
 * dưới đây (xem `loadOwnNotification`).
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, noContent, paginated, parsePage, paginationSchema } from "../../lib/http";
import { audit, AuditAction } from "../../lib/audit";
import { currentUser, requireAuth } from "../../middleware/auth";
import { idParam, validateBody, validateParams, validateQuery } from "../../middleware/validate";
import { toNotificationDTO } from "../serializers";
import {
  NOTIFICATION_TYPES,
  loadOwnNotification,
  readPreferences,
  savePreferences,
} from "./notifications.service";

export const notificationsRouter = Router();

/**
 * Mọi thao tác ghi ở module này ghi nhật ký dưới hành động `USER_UPDATE` kèm
 * `details.scope`. Danh mục trong `lib/audit.ts` chưa có nhóm `NOTIFICATION_*`,
 * và tệp đó dùng chung cho toàn hệ thống nên không sửa từ đây; `scope` giữ cho
 * bộ lọc nhật ký ở trang quản trị vẫn tách được các sự kiện này.
 */

/* ==========================================================================
   LƯỢC ĐỒ ĐẦU VÀO
   ========================================================================== */

const typeField = z.enum(["MILESTONE", "THESIS", "FEEDBACK", "SYSTEM"], {
  errorMap: () => ({
    message: "Loại thông báo chỉ nhận MILESTONE, THESIS, FEEDBACK hoặc SYSTEM.",
  }),
});

const listQuerySchema = paginationSchema.extend({
  filter: z
    .enum(["ALL", "UNREAD"], {
      errorMap: () => ({ message: "Bộ lọc chỉ nhận ALL hoặc UNREAD." }),
    })
    .default("ALL"),
  type: typeField.optional(),
});

type ListQuery = z.infer<typeof listQuerySchema>;

const preferencesSchema = z.object({
  preferences: z
    .array(
      z.object({
        type: typeField,
        in_app: z.boolean({
          required_error: "Thiếu tùy chọn thông báo trong ứng dụng.",
          invalid_type_error: "Tùy chọn thông báo trong ứng dụng phải là true hoặc false.",
        }),
        email: z.boolean({
          required_error: "Thiếu tùy chọn thông báo qua email.",
          invalid_type_error: "Tùy chọn thông báo qua email phải là true hoặc false.",
        }),
      }),
      { required_error: "Thiếu danh sách cài đặt thông báo." }
    )
    .min(1, "Cần ít nhất một mục cài đặt thông báo.")
    .max(NOTIFICATION_TYPES.length, `Chỉ có ${NOTIFICATION_TYPES.length} loại thông báo.`)
    .superRefine((list, ctx) => {
      // Gửi trùng loại thì lệnh upsert sau ghi đè lệnh trước và người dùng nhận
      // về một cấu hình họ không chọn, không kèm bất kỳ dấu hiệu nào. Chặn ngay
      // ở cổng vào rẻ hơn nhiều so với đi truy vết sau này.
      const seen = new Set<string>();
      for (let i = 0; i < list.length; i += 1) {
        const item = list[i];
        if (!item) continue;
        if (seen.has(item.type)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [i, "type"],
            message: `Loại thông báo “${item.type}” xuất hiện nhiều lần trong danh sách.`,
          });
        }
        seen.add(item.type);
      }
    }),
});

type PreferencesBody = z.infer<typeof preferencesSchema>;

/* ==========================================================================
   UC 8.3 — XEM DANH SÁCH THÔNG BÁO
   ========================================================================== */

notificationsRouter.get(
  "/",
  requireAuth,
  validateQuery(listQuerySchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { filter, type } = req.query as unknown as ListQuery;
    const page = parsePage(req.query);

    // `user_id` là điều kiện KHÔNG BAO GIỜ vắng mặt — nó nằm ngay ở dòng đầu để
    // một lần sửa bộ lọc về sau không vô tình đẩy nó ra ngoài nhánh điều kiện.
    const where = {
      user_id: user.id,
      ...(filter === "UNREAD" ? { is_read: false } : {}),
      ...(type ? { type } : {}),
    };

    // Ba truy vấn trên cùng một ảnh chụp: nếu đếm rời nhau, một thông báo vừa
    // tới giữa hai lệnh sẽ khiến chuông hiện 5 còn danh sách chỉ có 4 dòng chưa
    // đọc — kiểu sai lệch mà người dùng nhìn thấy ngay.
    const [rows, total, unreadCount] = await prisma.$transaction([
      prisma.notification.findMany({
        where,
        // BR UC 8.3 — mới nhất lên đầu. Kèm `id` làm khoá phụ vì job nhắc hạn
        // (UC 8.8) chèn hàng loạt trong cùng một mili giây: chỉ sắp theo
        // `created_at` thì thứ tự giữa các trang không ổn định, và cùng một
        // thông báo có thể hiện hai lần khi cuộn vô hạn.
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        skip: page.skip,
        take: page.take,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { user_id: user.id, is_read: false } }),
    ]);

    // `unread_count` cố ý BỎ QUA `filter` và `type`: nó là con số trên chuông ở
    // Topbar, phải khớp với `GET /unread-count`. Đếm theo bộ lọc hiện hành sẽ
    // khiến chuông đổi số mỗi khi người dùng bấm sang tab khác.
    res.json({ ...paginated(rows.map(toNotificationDTO), total, page), unread_count: unreadCount });
  })
);

/**
 * Đếm nhanh cho chuông ở Topbar.
 *
 * Tách riêng khỏi `GET /` vì thanh điều hướng hiển thị trên MỌI trang: bắt nó
 * tải cả một trang thông báo chỉ để lấy một số nguyên là lãng phí băng thông và
 * cả thời gian truy vấn.
 */
notificationsRouter.get(
  "/unread-count",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const count = await prisma.notification.count({
      where: { user_id: user.id, is_read: false },
    });
    res.json({ count });
  })
);

/* ==========================================================================
   UC 8.5 — ĐÁNH DẤU TẤT CẢ ĐÃ ĐỌC
   ========================================================================== */

/**
 * Khai báo TRƯỚC `PATCH /:id/read`: hai mẫu đường dẫn này không đụng nhau (một
 * đoạn so với hai đoạn), nhưng đặt tuyến tĩnh lên trước tuyến tham số là thói
 * quen giữ cho việc bổ sung `PATCH /:id` sau này không âm thầm nuốt mất nó.
 */
notificationsRouter.patch(
  "/read-all",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);

    // Đúng MỘT câu UPDATE, như NFR của UC 8.5 đòi hỏi. Nạp danh sách rồi cập
    // nhật từng dòng sẽ là N+1 và giữ khoá lâu hơn hẳn.
    const result = await prisma.notification.updateMany({
      where: { user_id: user.id, is_read: false },
      data: { is_read: true, read_at: new Date() },
    });

    audit({
      action: AuditAction.USER_UPDATE,
      req,
      details: { scope: "NOTIFICATION_READ_ALL", updated: result.count },
    });

    res.json({ updated: result.count });
  })
);

/* ==========================================================================
   UC 8.4 — ĐÁNH DẤU MỘT THÔNG BÁO ĐÃ ĐỌC
   ========================================================================== */

notificationsRouter.patch(
  "/:id/read",
  requireAuth,
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;

    const notification = await loadOwnNotification(user.id, id);

    // BR UC 8.4 — "Đã đọc" không hoàn tác được, nên gọi lại trên thông báo đã
    // đọc là thao tác vô hại, không phải lỗi. Giao diện cập nhật lạc quan
    // (optimistic) rồi mới gọi API; trả 409 ở đây chỉ khiến nó cuộn ngược trạng
    // thái đúng thành trạng thái sai. Cũng không ghi đè `read_at` — thời điểm
    // đọc lần đầu mới là dữ liệu có ý nghĩa.
    if (notification.is_read) {
      res.json(toNotificationDTO(notification));
      return;
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { is_read: true, read_at: new Date() },
    });

    audit({
      action: AuditAction.USER_UPDATE,
      req,
      details: { scope: "NOTIFICATION_READ", notification_id: id, type: updated.type },
    });

    res.json(toNotificationDTO(updated));
  })
);

/* ==========================================================================
   UC 8.6 — XOÁ THÔNG BÁO
   ========================================================================== */

notificationsRouter.delete(
  "/:id",
  requireAuth,
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;

    const notification = await loadOwnNotification(user.id, id);

    // Xoá CỨNG theo đúng business rule "không có chức năng khôi phục". Bảng này
    // không có cột `deleted_at`, và thêm xoá mềm ở tầng ứng dụng sẽ phá luôn
    // ràng buộc `@@unique([user_id, dedupe_key])`: một thông báo nhắc hạn bị ẩn
    // vẫn chiếm chỗ khoá chống trùng, khiến lần nhắc sau không bao giờ tới.
    await prisma.notification.delete({ where: { id } });

    audit({
      action: AuditAction.USER_UPDATE,
      req,
      details: {
        scope: "NOTIFICATION_DELETE",
        notification_id: id,
        type: notification.type,
        was_unread: !notification.is_read,
      },
    });

    noContent(res);
  })
);

/* ==========================================================================
   UC 8.7 — CÀI ĐẶT LOẠI THÔNG BÁO MUỐN NHẬN
   ========================================================================== */

notificationsRouter.get(
  "/preferences",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    res.json(await readPreferences(user.id));
  })
);

notificationsRouter.put(
  "/preferences",
  requireAuth,
  validateBody(preferencesSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { preferences } = req.body as PreferencesBody;

    const result = await savePreferences(user.id, preferences);

    audit({
      action: AuditAction.USER_UPDATE,
      req,
      details: {
        scope: "NOTIFICATION_PREFERENCES",
        preferences: result.preferences,
        // Ghi lại khi hệ thống ép bật lại kênh in-app bắt buộc: nếu người dùng
        // báo "tôi đã tắt mà vẫn nhận", dòng log này trả lời ngay.
        forced_in_app: result.forced,
      },
    });

    res.json(result.preferences);
  })
);

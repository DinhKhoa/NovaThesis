/**
 * DỊCH VỤ THÔNG BÁO (Module 8)
 *
 * Một điểm vào duy nhất cho mọi thông báo trong hệ thống. Việc gộp lại là có
 * chủ đích: tuỳ chọn nhận thông báo của UC 8.7 chỉ thực sự có hiệu lực khi
 * KHÔNG có nơi nào chèn thẳng vào bảng `notifications` mà bỏ qua bước kiểm tra.
 */
import type { NotificationType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { enqueueMail, mailTemplates } from "../lib/mailer";

export interface NotifyInput {
  userId: number;
  type: NotificationType;
  title: string;
  content: string;
  /** Đường dẫn tương đối trong ứng dụng, ví dụ `/milestones?id=12`. */
  link?: string | null;
  /**
   * Khoá chống trùng. Cùng một khoá cho cùng một người chỉ tạo được một thông
   * báo — job nhắc deadline chạy lại sẽ không nhân bản hộp thư người dùng.
   */
  dedupeKey?: string | null;
  /** Bỏ qua tuỳ chọn của người dùng. Chỉ dùng cho thông báo bảo mật bắt buộc. */
  force?: boolean;
}

/** Mặc định khi người dùng chưa từng chỉnh cài đặt: bật cả hai kênh. */
const DEFAULT_PREF = { in_app: true, email: true };

async function resolvePreference(userId: number, type: NotificationType, force = false) {
  if (force) return DEFAULT_PREF;
  const pref = await prisma.notificationPreference.findUnique({
    where: { user_id_type: { user_id: userId, type } },
    select: { in_app: true, email: true },
  });
  return pref ?? DEFAULT_PREF;
}

/**
 * Tạo một thông báo.
 *
 * Trả về `null` khi người dùng đã tắt kênh in-app hoặc khi thông báo trùng khoá
 * chống trùng.
 */
export async function notify(input: NotifyInput) {
  const pref = await resolvePreference(input.userId, input.type, input.force);

  let created = null;
  if (pref.in_app) {
    try {
      created = await prisma.notification.create({
        data: {
          user_id: input.userId,
          type: input.type,
          title: input.title.slice(0, 255),
          content: input.content,
          link: input.link ?? null,
          dedupe_key: input.dedupeKey ?? null,
        },
      });
    } catch (err) {
      // Xung đột `@@unique([user_id, dedupe_key])` là kết quả mong đợi khi cron
      // chạy lại, không phải lỗi.
      const code = (err as { code?: string }).code;
      if (code !== "P2002") {
        logger.error({ err, userId: input.userId }, "Không tạo được thông báo");
        return null;
      }
      return null;
    }
  }

  if (pref.email) {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true, status: true, deleted_at: true },
    });
    // Không gửi email cho tài khoản đã khoá hoặc đã xoá.
    if (user && !user.deleted_at && user.status === "ACTIVE") {
      enqueueMail({
        to: user.email,
        ...mailTemplates.notification(input.title, input.content, input.link),
      });
    }
  }

  return created;
}

/** Gửi cùng một thông báo cho nhiều người (ví dụ tất cả thành viên đề tài). */
export async function notifyMany(userIds: number[], input: Omit<NotifyInput, "userId">) {
  const unique = [...new Set(userIds)];
  await Promise.all(
    unique.map((userId) =>
      notify({ ...input, userId, dedupeKey: input.dedupeKey ? `${input.dedupeKey}:${userId}` : null })
    )
  );
}

/* ==========================================================================
   NGƯỜI NHẬN THEO ĐỀ TÀI
   ========================================================================== */

export interface ThesisAudience {
  studentUserIds: number[];
  lecturerUserId: number | null;
  all: number[];
}

/**
 * Lấy danh sách người liên quan tới một đề tài.
 *
 * Dùng một truy vấn với `include` lồng nhau thay vì lặp qua từng thành viên rồi
 * hỏi CSDL — đó chính là lỗi N+1 mà `Yêu cầu dự án.md` §3.3 gọi là "sát thủ
 * hiệu năng".
 */
export async function thesisAudience(thesisId: number): Promise<ThesisAudience> {
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: {
      members: {
        where: { left_at: null },
        select: { student: { select: { user_id: true } } },
      },
      lecturer: { select: { user_id: true } },
    },
  });

  const studentUserIds = thesis?.members.map((m) => m.student.user_id) ?? [];
  const lecturerUserId = thesis?.lecturer?.user_id ?? null;

  return {
    studentUserIds,
    lecturerUserId,
    all: lecturerUserId ? [...studentUserIds, lecturerUserId] : studentUserIds,
  };
}

/** Đảm bảo người dùng mới có đủ 4 dòng tuỳ chọn (UC 8.7). */
export async function seedNotificationPreferences(userId: number): Promise<void> {
  const types: NotificationType[] = ["MILESTONE", "THESIS", "FEEDBACK", "SYSTEM"];
  await prisma.notificationPreference.createMany({
    data: types.map((type) => ({ user_id: userId, type, in_app: true, email: true })),
    skipDuplicates: true,
  });
}

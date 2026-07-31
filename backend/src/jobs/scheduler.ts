/**
 * LẬP LỊCH TÁC VỤ NỀN (UC 8.8 — Nhắc nhở deadline)
 *
 * Hai lịch:
 *   • Nhắc deadline milestone theo các mốc 7 / 3 / 1 ngày và khi đã quá hạn.
 *   • Watchdog quét tác vụ lập chỉ mục bị treo.
 */
import cron, { type ScheduledTask } from "node-cron";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { audit, AuditAction } from "../lib/audit";
import { notify } from "../services/notifications";
import { sweepStuckJobs } from "../workers/document-indexer";

const tasks: ScheduledTask[] = [];

/** Số ngày còn lại, tính theo nửa đêm địa phương để không lệch theo giờ nhập liệu. */
function daysUntil(deadline: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(deadline);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/**
 * Quét mốc sắp đến hạn và gửi nhắc.
 *
 * Business rule UC 8.8: chỉ nhắc mốc CHƯA hoàn thành, gửi ở các ngưỡng 7/3/1
 * ngày, và giới hạn số lần gửi khi quá hạn để tránh spam.
 *
 * Chống trùng dựa vào `notifications.dedupe_key` chứ không phải một bảng "đã
 * gửi" riêng: cron chạy lại trong ngày (hoặc server khởi động lại đúng 07:00)
 * sẽ đụng ràng buộc UNIQUE và im lặng bỏ qua.
 */
export async function runDeadlineReminders(): Promise<{ scanned: number; sent: number }> {
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + Math.max(...env.reminderDays, 7));
  horizon.setHours(23, 59, 59, 999);

  // Một truy vấn kèm quan hệ lồng nhau, không phải N+1: mỗi mốc cần biết đề tài,
  // sinh viên và giảng viên của nó.
  const milestones = await prisma.milestone.findMany({
    where: {
      deleted_at: null,
      status: { not: "COMPLETED" },
      deadline: { lte: horizon },
      thesis: { deleted_at: null, status: { in: ["ONGOING", "PENDING", "REVISION_REQUIRED"] } },
    },
    select: {
      id: true,
      name: true,
      deadline: true,
      status: true,
      thesis: {
        select: {
          id: true,
          title: true,
          members: { where: { left_at: null }, select: { student: { select: { user_id: true } } } },
          lecturer: { select: { user_id: true } },
        },
      },
    },
    take: 2000,
  });

  let sent = 0;

  for (const m of milestones) {
    const days = daysUntil(m.deadline);
    const deadlineText = m.deadline.toISOString().slice(0, 10);

    let threshold: string | null = null;
    let title = "";
    let content = "";

    if (days < 0) {
      // Quá hạn: chỉ nhắc ở các mốc 1, 3, 7, 14 ngày trễ. Nhắc mỗi ngày sẽ biến
      // hộp thư thành thứ người dùng học cách phớt lờ.
      const overdue = Math.abs(days);
      if (![1, 3, 7, 14].includes(overdue)) continue;
      threshold = `overdue-${overdue}`;
      title = "Mốc tiến độ đã quá hạn";
      content = `Mốc “${m.name}” của đề tài “${m.thesis.title}” đã quá hạn ${overdue} ngày (hạn ${deadlineText}). Hãy cập nhật trạng thái hoặc xin gia hạn với giảng viên hướng dẫn.`;
    } else if (env.reminderDays.includes(days)) {
      threshold = `due-${days}`;
      title = days === 0 ? "Mốc tiến độ đến hạn hôm nay" : "Nhắc nhở: mốc tiến độ sắp đến hạn";
      content =
        days === 0
          ? `Mốc “${m.name}” của đề tài “${m.thesis.title}” đến hạn hôm nay (${deadlineText}).`
          : `Mốc “${m.name}” của đề tài “${m.thesis.title}” còn ${days} ngày nữa là đến hạn (${deadlineText}).`;
    }

    if (!threshold) continue;

    const recipients = m.thesis.members.map((x) => x.student.user_id);
    // Giảng viên chỉ được báo khi mốc đã quá hạn: nhắc trước hạn là việc của
    // sinh viên, còn quá hạn thì mới cần người hướng dẫn biết.
    if (days < 0 && m.thesis.lecturer) recipients.push(m.thesis.lecturer.user_id);

    for (const userId of recipients) {
      const created = await notify({
        userId,
        type: "MILESTONE",
        title,
        content,
        link: `/milestones?milestone=${m.id}`,
        dedupeKey: `milestone:${m.id}:${threshold}`,
      });
      if (created) sent++;
    }
  }

  audit({
    action: AuditAction.SCHEDULER_RUN,
    details: { job: "deadline-reminders", scanned: milestones.length, sent },
  });

  return { scanned: milestones.length, sent };
}

export function startScheduler(): void {
  if (env.isTest) return;

  if (!cron.validate(env.REMINDER_CRON)) {
    logger.error({ cron: env.REMINDER_CRON }, "REMINDER_CRON không hợp lệ — bỏ qua lịch nhắc hạn");
  } else {
    tasks.push(
      cron.schedule(
        env.REMINDER_CRON,
        () => {
          runDeadlineReminders()
            .then(({ scanned, sent }) =>
              logger.info({ scanned, sent }, "Đã chạy tác vụ nhắc deadline")
            )
            .catch((err) => logger.error({ err }, "Tác vụ nhắc deadline thất bại"));
        },
        { timezone: "Asia/Ho_Chi_Minh" }
      )
    );
    logger.info({ cron: env.REMINDER_CRON }, "Đã bật lịch nhắc deadline (giờ Việt Nam)");
  }

  // Watchdog chạy theo `setInterval` chứ không phải cron: chu kỳ tính bằng giây,
  // mà cron chỉ phân giải tới phút.
  const watchdog = setInterval(() => {
    sweepStuckJobs().catch((err) => logger.error({ err }, "Watchdog quét lỗi"));
  }, env.WATCHDOG_INTERVAL_MS);
  // Không giữ tiến trình sống chỉ vì cái interval này.
  watchdog.unref();
}

export function stopScheduler(): void {
  for (const task of tasks) task.stop();
  tasks.length = 0;
}

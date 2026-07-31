/**
 * GỬI EMAIL (Nodemailer) — UC 1.2, 1.4, 1.5, 8.2
 *
 * Business rule UC 8.2 yêu cầu email phải đi qua hàng đợi để không chặn luồng
 * xử lý chính. Ở đây hàng đợi là một mảng trong tiến trình cùng một worker chạy
 * nối tiếp: đủ cho quy mô một khoa, và không kéo theo Redis + BullMQ chỉ để gửi
 * vài trăm email mỗi ngày (KISS, `Yêu cầu dự án.md` §3.3).
 *
 * Đánh đổi được ghi rõ: email đang chờ trong hàng đợi sẽ mất nếu tiến trình
 * chết. Với email nhắc deadline, cron chạy lại vào hôm sau; với email xác minh,
 * người dùng bấm "gửi lại".
 */
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env";
import { logger } from "./logger";

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    // Mailpit trong docker-compose không có chứng chỉ hợp lệ; ở production
    // SMTP_SECURE=true và điều kiện này tự động thắt lại.
    tls: env.isProd ? undefined : { rejectUnauthorized: false },
  });
  return transporter;
}

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

const queue: MailMessage[] = [];
let draining = false;

/** Đưa email vào hàng đợi. Trả về ngay, không chờ SMTP. */
export function enqueueMail(message: MailMessage): void {
  queue.push(message);
  void drain();
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (queue.length) {
      const msg = queue.shift();
      if (!msg) break;
      try {
        await getTransporter().sendMail({
          from: env.MAIL_FROM,
          to: msg.to,
          subject: msg.subject,
          html: msg.html,
          text: msg.text ?? stripHtml(msg.html),
        });
        logger.debug({ to: msg.to, subject: msg.subject }, "Đã gửi email");
      } catch (err) {
        // Không thử lại: SMTP hỏng thì thử lại ngay cũng hỏng, và vòng lặp thử
        // lại sẽ chặn toàn bộ hàng đợi phía sau.
        logger.error({ err, to: msg.to, subject: msg.subject }, "Gửi email thất bại");
      }
    }
  } finally {
    draining = false;
  }
}

export function pendingMailCount(): number {
  return queue.length;
}

/** Kiểm tra kết nối SMTP — dùng cho endpoint chẩn đoán. */
export async function verifyMailer(): Promise<boolean> {
  try {
    await getTransporter().verify();
    return true;
  } catch {
    return false;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ==========================================================================
   MẪU EMAIL
   ========================================================================== */

/**
 * Escape HTML cho nội dung do người dùng nhập.
 *
 * Tên đề tài đi thẳng vào email nhắc deadline. Một đề tài đặt tên
 * `<img src=x onerror=...>` không được phép trở thành mã chạy trong hộp thư của
 * giảng viên.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Khung email dùng chung.
 *
 * CSS nội tuyến và bố cục bằng bảng vì Outlook vẫn dựng HTML bằng engine của
 * Word: flexbox, grid và thẻ `<style>` phần lớn bị bỏ qua ở đó.
 */
function layout(title: string, body: string, cta?: { label: string; url: string }): string {
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:24px 12px;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;">
    <tr><td style="padding:20px 24px;border-bottom:1px solid #eef0f3;">
      <span style="font-size:15px;font-weight:600;letter-spacing:-0.01em;">NovaThesis</span>
      <span style="font-size:12px;color:#6b7280;display:block;margin-top:2px;">Trường Đại học Kinh tế – Đại học Đà Nẵng</span>
    </td></tr>
    <tr><td style="padding:24px;">
      <h1 style="margin:0 0 12px;font-size:17px;font-weight:600;">${escapeHtml(title)}</h1>
      <div style="font-size:14px;line-height:1.65;color:#374151;">${body}</div>
      ${
        cta
          ? `<div style="margin-top:22px;">
               <a href="${cta.url}" style="display:inline-block;background:#1f6feb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 18px;border-radius:8px;">${escapeHtml(cta.label)}</a>
             </div>
             <p style="margin:14px 0 0;font-size:12px;color:#6b7280;word-break:break-all;">
               Nếu nút không bấm được, sao chép liên kết này vào trình duyệt:<br>${cta.url}
             </p>`
          : ""
      }
    </td></tr>
    <tr><td style="padding:14px 24px;border-top:1px solid #eef0f3;font-size:11.5px;color:#9ca3af;">
      Email tự động từ hệ thống NovaThesis — vui lòng không trả lời thư này.
    </td></tr>
  </table>
</body></html>`;
}

export const mailTemplates = {
  verifyEmail(fullName: string, token: string): Omit<MailMessage, "to"> {
    const url = `${env.APP_PUBLIC_URL}/verify-email?token=${encodeURIComponent(token)}`;
    return {
      subject: "Xác minh tài khoản NovaThesis",
      html: layout(
        "Xác minh địa chỉ email",
        `<p>Chào ${escapeHtml(fullName)},</p>
         <p>Tài khoản của bạn đã được tạo. Bấm nút bên dưới để kích hoạt và bắt đầu sử dụng hệ thống.</p>
         <p>Liên kết có hiệu lực trong <strong>24 giờ</strong>.</p>`,
        { label: "Kích hoạt tài khoản", url }
      ),
    };
  },

  resetPassword(fullName: string, token: string): Omit<MailMessage, "to"> {
    const url = `${env.APP_PUBLIC_URL}/reset-password?token=${encodeURIComponent(token)}`;
    return {
      subject: "Đặt lại mật khẩu NovaThesis",
      html: layout(
        "Đặt lại mật khẩu",
        `<p>Chào ${escapeHtml(fullName)},</p>
         <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản này. Liên kết chỉ dùng được <strong>một lần</strong> và hết hạn sau <strong>24 giờ</strong>.</p>
         <p style="color:#6b7280;">Nếu không phải bạn yêu cầu, hãy bỏ qua email này — mật khẩu hiện tại vẫn giữ nguyên.</p>`,
        { label: "Đặt lại mật khẩu", url }
      ),
    };
  },

  accountCreated(fullName: string, email: string, tempPassword: string): Omit<MailMessage, "to"> {
    return {
      subject: "Tài khoản NovaThesis của bạn đã được tạo",
      html: layout(
        "Thông tin đăng nhập",
        `<p>Chào ${escapeHtml(fullName)},</p>
         <p>Quản trị viên đã tạo tài khoản cho bạn trên hệ thống NovaThesis.</p>
         <table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0;font-size:14px;">
           <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Email</td><td style="font-weight:500;">${escapeHtml(email)}</td></tr>
           <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Mật khẩu tạm</td><td style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:600;">${escapeHtml(tempPassword)}</td></tr>
         </table>
         <p><strong>Hãy đổi mật khẩu ngay sau lần đăng nhập đầu tiên.</strong></p>`,
        { label: "Đăng nhập", url: `${env.APP_PUBLIC_URL}/?auth=login` }
      ),
    };
  },

  notification(title: string, content: string, link?: string | null): Omit<MailMessage, "to"> {
    return {
      subject: `[NovaThesis] ${title}`,
      html: layout(
        title,
        `<p>${escapeHtml(content)}</p>`,
        link ? { label: "Xem chi tiết", url: `${env.APP_PUBLIC_URL}${link}` } : undefined
      ),
    };
  },
};

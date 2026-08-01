/**
 * NHẬT KÝ HỆ THỐNG (UC 2.8)
 *
 * Business rule của UC 2.8 liệt kê những gì bắt buộc phải ghi: đăng nhập
 * (thành công/thất bại), đổi quyền, tạo/xoá/vô hiệu hoá dữ liệu quan trọng, và
 * lỗi hệ thống nghiêm trọng. Bảng này chỉ ghi thêm (append-only) — không có
 * endpoint nào sửa hay xoá nó.
 */
import type { Request } from "express";
import type { LogLevel } from "@prisma/client";
import { prisma } from "./prisma";
import { logger } from "./logger";
import { clientIp, userAgent } from "./http";

/** Danh mục hành động. Chuỗi tự do sẽ nhanh chóng phân mảnh thành rác. */
export const AuditAction = {
  AUTH_LOGIN: "AUTH_LOGIN",
  AUTH_LOGIN_FAILED: "AUTH_LOGIN_FAILED",
  AUTH_LOGOUT: "AUTH_LOGOUT",
  AUTH_REGISTER: "AUTH_REGISTER",
  AUTH_VERIFY_EMAIL: "AUTH_VERIFY_EMAIL",
  AUTH_PASSWORD_RESET_REQUEST: "AUTH_PASSWORD_RESET_REQUEST",
  AUTH_PASSWORD_RESET: "AUTH_PASSWORD_RESET",
  AUTH_PASSWORD_CHANGE: "AUTH_PASSWORD_CHANGE",
  AUTH_ACCOUNT_LOCKED: "AUTH_ACCOUNT_LOCKED",

  USER_CREATE: "USER_CREATE",
  USER_UPDATE: "USER_UPDATE",
  USER_ROLE_CHANGE: "USER_ROLE_CHANGE",
  USER_STATUS_CHANGE: "USER_STATUS_CHANGE",
  USER_DELETE: "USER_DELETE",

  THESIS_CREATE: "THESIS_CREATE",
  THESIS_UPDATE: "THESIS_UPDATE",
  THESIS_SUBMIT: "THESIS_SUBMIT",
  THESIS_APPROVE: "THESIS_APPROVE",
  THESIS_REVISION: "THESIS_REVISION",
  THESIS_REJECT: "THESIS_REJECT",
  THESIS_COMPLETE: "THESIS_COMPLETE",
  THESIS_ASSIGN_LECTURER: "THESIS_ASSIGN_LECTURER",
  THESIS_DELETE: "THESIS_DELETE",

  MILESTONE_CREATE: "MILESTONE_CREATE",
  MILESTONE_UPDATE: "MILESTONE_UPDATE",
  MILESTONE_STATUS_CHANGE: "MILESTONE_STATUS_CHANGE",
  MILESTONE_APPROVE: "MILESTONE_APPROVE",
  MILESTONE_REVISION: "MILESTONE_REVISION",
  MILESTONE_EXTENSION_REQUEST: "MILESTONE_EXTENSION_REQUEST",
  MILESTONE_EXTENSION_REVIEW: "MILESTONE_EXTENSION_REVIEW",
  MILESTONE_DELETE: "MILESTONE_DELETE",

  DOCUMENT_UPLOAD: "DOCUMENT_UPLOAD",
  DOCUMENT_VERSION_UPLOAD: "DOCUMENT_VERSION_UPLOAD",
  DOCUMENT_UPDATE: "DOCUMENT_UPDATE",
  DOCUMENT_DOWNLOAD: "DOCUMENT_DOWNLOAD",
  DOCUMENT_SHARE: "DOCUMENT_SHARE",
  DOCUMENT_DELETE: "DOCUMENT_DELETE",
  DOCUMENT_UPLOAD_ERROR: "DOCUMENT_UPLOAD_ERROR",
  DOCUMENT_INDEX_DONE: "DOCUMENT_INDEX_DONE",
  DOCUMENT_INDEX_ERROR: "DOCUMENT_INDEX_ERROR",

  AI_CHAT: "AI_CHAT",
  AI_SEMANTIC_SEARCH: "AI_SEMANTIC_SEARCH",
  AI_SUMMARIZE: "AI_SUMMARIZE",
  AI_SUGGEST: "AI_SUGGEST",
  AI_PLAGIARISM: "AI_PLAGIARISM",
  AI_PROVIDER_ERROR: "AI_PROVIDER_ERROR",

  FEEDBACK_CREATE: "FEEDBACK_CREATE",
  FEEDBACK_UPDATE: "FEEDBACK_UPDATE",
  FEEDBACK_RESOLVE: "FEEDBACK_RESOLVE",
  FEEDBACK_DELETE: "FEEDBACK_DELETE",

  CONFIG_UPDATE: "CONFIG_UPDATE",
  REPORT_EXPORT: "REPORT_EXPORT",

  WORKER_TIMEOUT: "WORKER_TIMEOUT",
  SCHEDULER_RUN: "SCHEDULER_RUN",
} as const;

export type AuditActionName = (typeof AuditAction)[keyof typeof AuditAction];

interface AuditInput {
  action: AuditActionName;
  userId?: number | null;
  level?: LogLevel;
  details?: Record<string, unknown>;
  req?: Request;
  ip?: string;
  userAgent?: string;
}

/**
 * Ghi một dòng nhật ký.
 *
 * Cố ý KHÔNG await ở phía gọi và cố ý nuốt lỗi: ghi log là việc phụ. Nếu bảng
 * log gặp sự cố mà kéo theo cả thao tác duyệt đề tài thất bại thì tính năng
 * kiểm toán đã trở thành nguồn gây lỗi thay vì công cụ chẩn đoán.
 */
export function audit(input: AuditInput): void {
  const ip = input.ip ?? (input.req ? clientIp(input.req) : undefined);
  const ua = input.userAgent ?? (input.req ? userAgent(input.req) : undefined);
  const userId = input.userId ?? input.req?.user?.id ?? null;

  void prisma.systemLog
    .create({
      data: {
        user_id: userId,
        level: input.level ?? "INFO",
        action: input.action,
        ip_address: ip?.slice(0, 45),
        user_agent: ua,
        details: (input.details ?? {}) as object,
      },
    })
    .catch((err) => logger.error({ err, action: input.action }, "Không ghi được nhật ký hệ thống"));
}

/**
 * MODULE 1 — NGHIỆP VỤ XÁC THỰC & TÀI KHOẢN
 *
 * Tầng route chỉ còn việc kiểm tra đầu vào và định dạng phản hồi; toàn bộ quy
 * tắc nghiệp vụ nhạy cảm nằm ở đây vì chúng đi kèm nhau: bộ đếm đăng nhập sai
 * (UC 1.1 BR-1), vòng đời token xác minh / đặt lại mật khẩu (UC 1.4 – 1.6) và
 * việc thu hồi phiên đều thao tác trên cùng vài cột của bảng `users`. Tách rời
 * ra nhiều nơi là cách chắc chắn để một luồng quên đặt lại `locked_until`.
 *
 * Nguyên tắc xuyên suốt: KHÔNG endpoint nào được tiết lộ "email này có tồn tại
 * hay không" — không qua thông điệp lỗi, không qua mã trạng thái, và cũng không
 * qua thời gian phản hồi.
 */
import crypto from "node:crypto";
import type { Request } from "express";
import type { Prisma, UserRole } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { HttpError, badRequest, conflict, forbidden, gone, unauthorized } from "../../lib/errors";
import { clientIp, userAgent } from "../../lib/http";
import { audit, AuditAction } from "../../lib/audit";
import {
  generateToken,
  hashPassword,
  sha256,
  signAccessToken,
  verifyAccessToken,
  verifyPassword,
} from "../../lib/crypto";
import { enqueueMail, mailTemplates } from "../../lib/mailer";
import { AVATAR_MIME, assertAllowedType, deleteFile, saveBuffer } from "../../lib/storage";
import { seedNotificationPreferences } from "../../services/notifications";

/* ==========================================================================
   HẰNG SỐ
   ========================================================================== */

/**
 * Một thông điệp duy nhất cho mọi lý do đăng nhập hỏng (sai mật khẩu, email
 * không tồn tại). Phân biệt hai trường hợp chính là công cụ liệt kê tài khoản.
 */
const GENERIC_LOGIN_ERROR = "Email hoặc mật khẩu không chính xác.";

const DAY_MS = 24 * 60 * 60 * 1000;

/** UC 1.4 / UC 1.5 đều quy định hiệu lực liên kết là 24 giờ. */
const VERIFICATION_TTL_MS = DAY_MS;
const RESET_TTL_MS = DAY_MS;

/** UC 1.5 NFR — "1 lần / 5 phút". Chặn theo tài khoản, xem ghi chú ở hàm dùng nó. */
const RESET_COOLDOWN_MS = 5 * 60 * 1000;

/* ==========================================================================
   HỒ SƠ NGƯỜI DÙNG
   ========================================================================== */

/**
 * Quan hệ cần cho `toUserDTO`. Khai báo một lần rồi dùng lại ở mọi truy vấn trả
 * hồ sơ, nhờ vậy `/me`, `/login` và `/profile` không thể lệch hình dạng nhau.
 *
 * `members` giới hạn `take: 1` vì serializer chỉ đọc đề tài đang hoạt động;
 * nạp cả lịch sử thành viên chỉ để lấy phần tử đầu là lãng phí.
 */
export const PROFILE_INCLUDE = {
  student: {
    select: {
      id: true,
      student_code: true,
      members: {
        where: { left_at: null },
        orderBy: { joined_at: "desc" },
        take: 1,
        select: { thesis_id: true },
      },
    },
  },
  lecturer: {
    select: { id: true, lecturer_code: true, department: true, max_students: true },
  },
} satisfies Prisma.UserInclude;

export type ProfileUser = Prisma.UserGetPayload<{ include: typeof PROFILE_INCLUDE }>;

export function loadProfile(userId: number): Promise<ProfileUser | null> {
  return prisma.user.findFirst({ where: { id: userId, deleted_at: null }, include: PROFILE_INCLUDE });
}

/**
 * Ảnh đại diện được lưu trong private bucket nên `users.avatar_url` là đường dẫn
 * nội bộ (`avatars/2026/07/<hex>.png`), không phải URL. Giao diện lại gán thẳng
 * giá trị này vào `<img src>`, nên hợp đồng JSON phải trả về URL đầy đủ trỏ tới
 * endpoint tải tệp đã kiểm soát quyền.
 */
export function avatarEndpoint(userId: number): string {
  return `${env.API_PUBLIC_URL}/api/v1/files/avatar/${userId}`;
}

export function publicAvatarUrl(userId: number, storedPath: string | null): string | null {
  return storedPath ? avatarEndpoint(userId) : null;
}

/* ==========================================================================
   PHIÊN ĐĂNG NHẬP
   ========================================================================== */

export interface IssuedSession {
  access_token: string;
  refresh_token: string;
}

interface SessionSubject {
  id: number;
  email: string;
  role: UserRole;
}

/**
 * Tạo cặp access + refresh token.
 *
 * `sid` được nhúng vào JWT để sau này biết access token đang cầm thuộc phiên
 * nào — không có nó thì "đăng xuất phiên hiện tại" và "thu hồi các phiên khác
 * khi đổi mật khẩu" đều không cài được.
 */
export async function issueSession(user: SessionSubject, req: Request): Promise<IssuedSession> {
  const { token, hash } = generateToken();

  const session = await prisma.refreshToken.create({
    data: {
      user_id: user.id,
      token_hash: hash,
      expires_at: new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * DAY_MS),
      user_agent: userAgent(req) ?? null,
      ip_address: clientIp(req).slice(0, 45),
    },
    select: { id: true },
  });

  return {
    access_token: signAccessToken({
      sub: user.id,
      role: user.role,
      email: user.email,
      sid: session.id,
    }),
    refresh_token: token,
  };
}

/**
 * Đọc `sid` từ access token đang gửi kèm request.
 *
 * `req.user` (middleware auth) cố ý không mang theo thông tin phiên vì nó được
 * nạp lại từ CSDL. Ở đây cần chính con số trong token, nên phải giải mã lại —
 * token đã được middleware xác thực trước đó, bước này chỉ đọc thêm một trường.
 */
export function currentSessionId(req: Request): number | null {
  const header = req.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) return null;
  try {
    return verifyAccessToken(token.trim()).sid ?? null;
  } catch {
    return null;
  }
}

export async function revokeAllSessions(userId: number, exceptSessionId?: number | null): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: {
      user_id: userId,
      revoked_at: null,
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
    },
    data: { revoked_at: new Date() },
  });
}

/* ==========================================================================
   UC 1.2 — ĐĂNG KÝ
   ========================================================================== */

export interface RegisterInput {
  email: string;
  password: string;
  full_name: string;
}

/**
 * Chỉ tạo được tài khoản SINH VIÊN (business rule UC 1.2: tài khoản giảng viên
 * do Admin tạo thủ công). Vai trò cố định trong mã nguồn thay vì nhận từ body —
 * một trường `role` mở ra ngoài là con đường tự phong quyền quản trị.
 */
export async function registerStudent(input: RegisterInput, req: Request): Promise<number> {
  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw conflict("Email này đã được sử dụng.");

  const password_hash = await hashPassword(input.password);
  const { token, hash } = generateToken();

  const user = await prisma.user.create({
    data: {
      email: input.email,
      password_hash,
      full_name: input.full_name,
      role: "STUDENT",
      status: "PENDING_VERIFICATION",
      verification_token_hash: hash,
      verification_expires_at: new Date(Date.now() + VERIFICATION_TTL_MS),
      // MSSV để trống: form đăng ký không hỏi, sinh viên bổ sung ở trang Hồ sơ.
      student: { create: {} },
    },
    select: { id: true, email: true, full_name: true },
  });

  await seedNotificationPreferences(user.id);

  enqueueMail({ to: user.email, ...mailTemplates.verifyEmail(user.full_name, token) });

  audit({
    action: AuditAction.AUTH_REGISTER,
    userId: user.id,
    req,
    details: { email: user.email, role: "STUDENT" },
  });

  return user.id;
}

/* ==========================================================================
   UC 1.1 — ĐĂNG NHẬP
   ========================================================================== */

/**
 * Băm giả để so khi email không tồn tại.
 *
 * Argon2 tốn hàng chục mili giây; trả lời ngay lập tức khi không tìm thấy email
 * biến thời gian phản hồi thành máy dò tài khoản chính xác hơn cả thông điệp
 * lỗi. Băm một lần rồi dùng lại cho cả vòng đời tiến trình.
 */
let dummyHash: Promise<string> | null = null;
function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(crypto.randomBytes(24).toString("hex"));
  return dummyHash;
}

export interface LoginResult extends IssuedSession {
  user: ProfileUser;
}

export async function login(email: string, password: string, req: Request): Promise<LoginResult> {
  const found = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      full_name: true,
      role: true,
      status: true,
      password_hash: true,
      failed_login_attempts: true,
      locked_until: true,
      deleted_at: true,
    },
  });

  // Tài khoản đã xoá mềm được đối xử y hệt tài khoản không tồn tại.
  const account = found && !found.deleted_at ? found : null;

  // Kiểm tra khoá TRƯỚC khi so mật khẩu: trong thời gian khoá, gõ đúng cũng
  // không được vào — nếu không, quy tắc khoá 15 phút chỉ là hình thức.
  if (account?.locked_until && account.locked_until > new Date()) {
    const minutes = Math.max(
      1,
      Math.ceil((account.locked_until.getTime() - Date.now()) / 60_000)
    );
    throw accountLocked(
      `Tài khoản bị khóa tạm thời do nhập sai quá nhiều lần. Vui lòng thử lại sau ${minutes} phút.`,
      account.locked_until
    );
  }

  const ok = await verifyPassword(account?.password_hash ?? (await dummyPasswordHash()), password);

  if (!account || !ok) {
    throw await recordFailedLogin(account, email, req);
  }

  // Chỉ xét trạng thái SAU khi mật khẩu đã đúng: báo "chưa xác minh email" cho
  // người gõ sai mật khẩu là xác nhận email đó có thật.
  if (account.status === "PENDING_VERIFICATION") {
    throw forbidden(
      "Tài khoản chưa xác minh email. Vui lòng kiểm tra hộp thư để kích hoạt tài khoản trước khi đăng nhập."
    );
  }
  if (account.status === "SUSPENDED") {
    throw forbidden("Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.");
  }

  const user = await prisma.user.update({
    where: { id: account.id },
    data: { failed_login_attempts: 0, locked_until: null, last_login_at: new Date() },
    include: PROFILE_INCLUDE,
  });

  const session = await issueSession(user, req);

  audit({
    action: AuditAction.AUTH_LOGIN,
    userId: user.id,
    req,
    details: { email: user.email, role: user.role },
  });

  return { user, ...session };
}

/**
 * Ghi nhận một lần đăng nhập hỏng và trả về lỗi cần ném.
 *
 * Trả về thay vì tự ném để nơi gọi giữ được luồng tuyến tính, và để TypeScript
 * thấy rõ mọi nhánh đều kết thúc bằng một lỗi cụ thể.
 */
async function recordFailedLogin(
  account: { id: number; failed_login_attempts: number } | null,
  email: string,
  req: Request
): Promise<HttpError> {
  if (!account) {
    // Vẫn ghi nhật ký dù không có tài khoản: chuỗi thử liên tiếp vào nhiều email
    // khác nhau là dấu hiệu dò tài khoản, nhìn theo từng user sẽ không thấy.
    audit({
      action: AuditAction.AUTH_LOGIN_FAILED,
      level: "WARN",
      req,
      details: { email, attempts: 0 },
    });
    return unauthorized(GENERIC_LOGIN_ERROR);
  }

  const attempts = account.failed_login_attempts + 1;
  const shouldLock = attempts >= env.MAX_LOGIN_ATTEMPTS;
  const lockedUntil = shouldLock ? new Date(Date.now() + env.LOCKOUT_MINUTES * 60_000) : null;

  await prisma.user.update({
    where: { id: account.id },
    // Bộ đếm về 0 ngay khi khoá: hết thời gian khoá, người dùng thật được thử
    // lại đủ MAX_LOGIN_ATTEMPTS lần thay vì bị khoá lại sau đúng một lần gõ sai.
    data: { failed_login_attempts: shouldLock ? 0 : attempts, locked_until: lockedUntil },
  });

  audit({
    action: AuditAction.AUTH_LOGIN_FAILED,
    level: "WARN",
    userId: account.id,
    req,
    details: { email, attempts },
  });

  if (lockedUntil) {
    audit({
      action: AuditAction.AUTH_ACCOUNT_LOCKED,
      level: "WARN",
      userId: account.id,
      req,
      details: { email, minutes: env.LOCKOUT_MINUTES, locked_until: lockedUntil.toISOString() },
    });
    return accountLocked(
      `Tài khoản bị khóa tạm thời ${env.LOCKOUT_MINUTES} phút do nhập sai quá nhiều lần.`,
      lockedUntil
    );
  }

  return unauthorized(GENERIC_LOGIN_ERROR);
}

/**
 * Lỗi "tài khoản đang bị khóa".
 *
 * Mã 429 dùng chung với `authLimiter` (chặn theo IP), nên phải có `code` riêng:
 * giao diện cần phân biệt "tài khoản của bạn bị khóa, còn 12 phút 30 giây" với
 * "thiết bị này gửi quá nhiều yêu cầu". Hai câu dẫn tới hai hành động khác nhau.
 *
 * `locked_until` đi kèm vì một câu chữ như "thử lại sau 15 phút" không đếm ngược
 * được: người dùng F5 xong không biết còn bao lâu, và số phút in ra lúc nhận lỗi
 * thì đứng yên trong khi thời gian vẫn chạy.
 */
function accountLocked(message: string, lockedUntil: Date): HttpError {
  return new HttpError(429, message, {
    code: "ACCOUNT_LOCKED",
    public: {
      locked_until: lockedUntil.toISOString(),
      retry_after_seconds: Math.max(
        1,
        Math.ceil((lockedUntil.getTime() - Date.now()) / 1000)
      ),
    },
  });
}

/* ==========================================================================
   XOAY VÒNG & THU HỒI PHIÊN
   ========================================================================== */

/**
 * Đổi refresh token lấy cặp token mới, thu hồi cái cũ.
 *
 * Refresh token chỉ dùng được một lần. Nếu một token ĐÃ thu hồi lại được gửi
 * lên, khả năng cao nó đã bị sao chép: token gốc nằm ở hai nơi. Phản ứng đúng
 * là huỷ toàn bộ phiên của tài khoản đó, buộc đăng nhập lại — thà phiền một
 * người dùng còn hơn để kẻ trộm giữ quyền truy cập vô thời hạn.
 */
export async function rotateSession(rawToken: string, req: Request): Promise<IssuedSession> {
  const existing = await prisma.refreshToken.findUnique({
    where: { token_hash: sha256(rawToken) },
    select: {
      id: true,
      user_id: true,
      expires_at: true,
      revoked_at: true,
      user: { select: { id: true, email: true, role: true, status: true, deleted_at: true } },
    },
  });

  if (!existing) throw unauthorized("Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.");

  if (existing.revoked_at) {
    await revokeAllSessions(existing.user_id);
    // Không có mã hành động riêng cho "phát hiện dùng lại token" trong danh mục
    // dùng chung; AUTH_LOGOUT mô tả đúng hệ quả (mọi phiên bị đóng), lý do nằm
    // ở `details`.
    audit({
      action: AuditAction.AUTH_LOGOUT,
      level: "WARN",
      userId: existing.user_id,
      req,
      details: { reason: "refresh_token_reuse" },
    });
    throw unauthorized("Phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại.");
  }

  if (existing.expires_at <= new Date()) {
    throw unauthorized("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
  }

  const owner = existing.user;
  if (owner.deleted_at) throw unauthorized("Tài khoản không còn tồn tại.");
  if (owner.status !== "ACTIVE") {
    throw forbidden("Tài khoản chưa được kích hoạt hoặc đã bị khóa.");
  }

  // Thu hồi trước rồi mới cấp mới: nếu tiến trình chết giữa chừng, hệ thống ở
  // trạng thái "phải đăng nhập lại" chứ không phải "hai token cùng sống".
  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revoked_at: new Date() },
  });

  return issueSession(owner, req);
}

/** UC 1.3 — đóng phiên hiện tại (và phiên ứng với refresh token nếu client gửi kèm). */
export async function logout(
  userId: number,
  sessionId: number | null,
  rawRefreshToken?: string
): Promise<void> {
  const targets: Prisma.RefreshTokenWhereInput[] = [];
  if (sessionId !== null) targets.push({ id: sessionId });
  if (rawRefreshToken) targets.push({ token_hash: sha256(rawRefreshToken) });
  if (targets.length === 0) return;

  // `user_id` trong điều kiện là bắt buộc: không ai được thu hồi phiên của
  // người khác kể cả khi đoán trúng id phiên.
  await prisma.refreshToken.updateMany({
    where: { user_id: userId, revoked_at: null, OR: targets },
    data: { revoked_at: new Date() },
  });
}

/* ==========================================================================
   UC 1.9 — CHỈNH SỬA HỒ SƠ
   ========================================================================== */

export interface ProfileInput {
  full_name?: string;
  student_code?: string;
  lecturer_code?: string;
  department?: string;
}

export interface ProfileUpdateResult {
  profile: ProfileUser;
  changed: string[];
}

/**
 * Cập nhật hồ sơ.
 *
 * Hai ràng buộc nghiệp vụ được cưỡng chế ở đây:
 *   • Email không nằm trong danh sách trường cho phép sửa (business rule UC 1.9)
 *     — nó là định danh đăng nhập, đổi được nghĩa là chiếm được tài khoản khác.
 *   • Mã SV/GV chỉ điền được khi đang trống (business rule UC 2.3: "không cho
 *     phép thay đổi mã số sau khi đã tạo"). Gửi lại đúng giá trị cũ vẫn hợp lệ
 *     vì form hồ sơ luôn submit cả trường này.
 */
export async function updateProfile(
  userId: number,
  input: ProfileInput
): Promise<ProfileUpdateResult> {
  const current = await loadProfile(userId);
  if (!current) throw unauthorized("Tài khoản không còn tồn tại.");

  const data: Prisma.UserUpdateInput = {};
  const changed: string[] = [];

  if (input.full_name !== undefined && input.full_name !== current.full_name) {
    data.full_name = input.full_name;
    changed.push("full_name");
  }

  if (input.student_code !== undefined) {
    if (!current.student) {
      throw badRequest("Chỉ tài khoản sinh viên mới có mã số sinh viên.");
    }
    if (current.student.student_code === null) {
      data.student = { update: { student_code: input.student_code } };
      changed.push("student_code");
    } else if (current.student.student_code !== input.student_code) {
      throw conflict(
        "Mã số sinh viên đã được thiết lập và không thể tự thay đổi. Vui lòng liên hệ quản trị viên."
      );
    }
  }

  const lecturerUpdate: Prisma.LecturerUpdateWithoutUserInput = {};

  if (input.lecturer_code !== undefined) {
    if (!current.lecturer) {
      throw badRequest("Chỉ tài khoản giảng viên mới có mã số giảng viên.");
    }
    if (input.lecturer_code !== current.lecturer.lecturer_code) {
      throw conflict(
        "Mã số giảng viên đã được thiết lập và không thể tự thay đổi. Vui lòng liên hệ quản trị viên."
      );
    }
  }

  if (input.department !== undefined) {
    if (!current.lecturer) {
      throw badRequest("Chỉ tài khoản giảng viên mới có thông tin khoa/bộ môn.");
    }
    if (input.department !== current.lecturer.department) {
      lecturerUpdate.department = input.department;
      changed.push("department");
    }
  }

  if (Object.keys(lecturerUpdate).length > 0) {
    data.lecturer = { update: lecturerUpdate };
  }

  // Không có gì đổi thì không ghi: một `update` rỗng vẫn đẩy `updated_at` lên
  // và tạo ra dòng nhật ký vô nghĩa.
  if (changed.length === 0) return { profile: current, changed };

  const profile = await prisma.user.update({
    where: { id: userId },
    data,
    include: PROFILE_INCLUDE,
  });

  return { profile, changed };
}

/* ==========================================================================
   UC 1.10 — ẢNH ĐẠI DIỆN
   ========================================================================== */

export interface UploadedAvatar {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

/**
 * Lưu ảnh mới rồi mới xoá ảnh cũ.
 *
 * Thứ tự này quan trọng: xoá trước mà ghi hỏng thì người dùng mất luôn ảnh đang
 * dùng. Ngược lại, nếu cập nhật CSDL hỏng thì tệp vừa ghi bị dọn ngay để không
 * tích tụ rác trên đĩa.
 */
export async function replaceAvatar(
  userId: number,
  previousPath: string | null,
  file: UploadedAvatar
): Promise<string> {
  assertAllowedType(
    AVATAR_MIME,
    file.mimetype,
    file.originalname,
    "Chỉ hỗ trợ định dạng JPG hoặc PNG."
  );

  const stored = await saveBuffer("avatars", file.originalname, file.buffer);

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { avatar_url: stored.relativePath },
    });
  } catch (err) {
    await deleteFile(stored.relativePath);
    throw err;
  }

  if (previousPath && previousPath !== stored.relativePath) {
    await deleteFile(previousPath);
  }

  return stored.relativePath;
}

/* ==========================================================================
   UC 1.7 — ĐỔI MẬT KHẨU
   ========================================================================== */

export async function changePassword(
  userId: number,
  oldPassword: string,
  newPassword: string,
  keepSessionId: number | null
): Promise<void> {
  const account = await prisma.user.findFirst({
    where: { id: userId, deleted_at: null },
    select: { password_hash: true },
  });
  if (!account) throw unauthorized("Tài khoản không còn tồn tại.");

  if (!(await verifyPassword(account.password_hash, oldPassword))) {
    throw badRequest("Mật khẩu hiện tại không chính xác.");
  }
  if (await verifyPassword(account.password_hash, newPassword)) {
    throw badRequest("Mật khẩu mới phải khác mật khẩu hiện tại.");
  }

  const password_hash = await hashPassword(newPassword);

  // Một giao dịch: đổi mật khẩu mà không thu hồi được phiên cũ thì kẻ đã chiếm
  // được phiên vẫn ở trong hệ thống — đúng thứ thao tác này sinh ra để ngăn.
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { password_hash } }),
    prisma.refreshToken.updateMany({
      where: {
        user_id: userId,
        revoked_at: null,
        ...(keepSessionId ? { id: { not: keepSessionId } } : {}),
      },
      data: { revoked_at: new Date() },
    }),
  ]);
}

/* ==========================================================================
   UC 1.4 — XÁC MINH EMAIL
   ========================================================================== */

/**
 * Token thô không bao giờ nằm trong CSDL, nên tra cứu bằng băm của nó. Hệ quả:
 * liên kết đã dùng (băm bị xoá) và liên kết bịa ra là cùng một trường hợp — cả
 * hai đều trả 410, và đó cũng là điều frontend đang chờ.
 */
export async function verifyEmail(token: string): Promise<number> {
  const user = await prisma.user.findFirst({
    where: { verification_token_hash: sha256(token), deleted_at: null },
    select: { id: true, status: true, verification_expires_at: true },
  });

  if (!user) {
    throw gone(
      "Liên kết xác minh không hợp lệ hoặc đã được sử dụng. Vui lòng yêu cầu gửi lại email xác minh."
    );
  }

  if (!user.verification_expires_at || user.verification_expires_at <= new Date()) {
    throw gone("Liên kết xác minh đã hết hạn. Vui lòng yêu cầu gửi lại email xác minh.");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      // Tài khoản bị đình chỉ không được tự hồi sinh chỉ vì bấm liên kết xác
      // minh cũ còn sót trong hộp thư.
      status: user.status === "PENDING_VERIFICATION" ? "ACTIVE" : user.status,
      email_verified_at: new Date(),
      verification_token_hash: null,
      verification_expires_at: null,
    },
  });

  return user.id;
}

/** Trả về id tài khoản nếu đã gửi lại email; `null` khi không có gì để gửi. */
export async function resendVerification(email: string): Promise<number | null> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, full_name: true, status: true, deleted_at: true },
  });

  // Không phàn nàn khi email lạ hoặc tài khoản đã kích hoạt: phản hồi phải
  // giống hệt nhau ở mọi trường hợp (xem thông điệp chung ở tầng route).
  if (!user || user.deleted_at || user.status !== "PENDING_VERIFICATION") return null;

  const { token, hash } = generateToken();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      verification_token_hash: hash,
      verification_expires_at: new Date(Date.now() + VERIFICATION_TTL_MS),
    },
  });

  enqueueMail({ to: user.email, ...mailTemplates.verifyEmail(user.full_name, token) });
  return user.id;
}

/* ==========================================================================
   UC 1.5 / 1.6 — QUÊN & ĐẶT LẠI MẬT KHẨU
   ========================================================================== */

/** Trả về id tài khoản nếu đã gửi email đặt lại; `null` khi không gửi gì. */
export async function requestPasswordReset(email: string): Promise<number | null> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      full_name: true,
      status: true,
      deleted_at: true,
      reset_requested_at: true,
    },
  });

  if (!user || user.deleted_at) return null;
  // Tài khoản bị đình chỉ không được tự mở lại đường vào bằng liên kết reset.
  if (user.status === "SUSPENDED") return null;

  // Giới hạn tần suất theo IP đã có ở middleware, nhưng nó không bảo vệ được
  // nạn nhân bị nhiều IP cùng dội email. Chốt chặn thứ hai đặt theo tài khoản,
  // đúng con số "1 lần / 5 phút" mà UC 1.5 nêu.
  if (user.reset_requested_at && Date.now() - user.reset_requested_at.getTime() < RESET_COOLDOWN_MS) {
    return null;
  }

  const { token, hash } = generateToken();
  const now = new Date();

  await prisma.user.update({
    where: { id: user.id },
    data: {
      reset_token_hash: hash,
      reset_token_expires_at: new Date(now.getTime() + RESET_TTL_MS),
      reset_requested_at: now,
    },
  });

  enqueueMail({ to: user.email, ...mailTemplates.resetPassword(user.full_name, token) });
  return user.id;
}

/**
 * Đặt lại mật khẩu bằng liên kết email (UC 1.6).
 *
 * Ném 400 chứ không phải 410 khi liên kết hỏng: trang `reset-password` của
 * frontend bắt riêng mã 400 để hiện "Liên kết đã hết hạn. Vui lòng yêu cầu lại."
 */
export async function resetPassword(token: string, password: string): Promise<number> {
  const user = await prisma.user.findFirst({
    where: { reset_token_hash: sha256(token), deleted_at: null },
    select: { id: true, reset_token_expires_at: true },
  });

  if (!user || !user.reset_token_expires_at || user.reset_token_expires_at <= new Date()) {
    throw badRequest(
      "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu liên kết mới."
    );
  }

  const password_hash = await hashPassword(password);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        password_hash,
        // Xoá băm ngay trong cùng giao dịch — đó là toàn bộ cơ chế "dùng một lần".
        reset_token_hash: null,
        reset_token_expires_at: null,
        // Người vừa chứng minh quyền sở hữu hộp thư không đáng bị giữ lại hình
        // phạt khoá do những lần gõ sai trước đó.
        failed_login_attempts: 0,
        locked_until: null,
      },
    }),
    prisma.refreshToken.updateMany({
      where: { user_id: user.id, revoked_at: null },
      data: { revoked_at: new Date() },
    }),
  ]);

  return user.id;
}

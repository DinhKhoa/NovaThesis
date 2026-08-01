/**
 * MODULE 2 — NGHIỆP VỤ QUẢN TRỊ (UC 2.1 – 2.9)
 *
 * Tầng route chỉ kiểm tra đầu vào và định dạng phản hồi; mọi quy tắc nghiệp vụ
 * nằm ở đây vì chúng dính chặt vào nhau: đổi vai trò phải kéo theo hồ sơ
 * Student/Lecturer, vô hiệu hoá phải kéo theo thu hồi phiên, và cả hai đều phải
 * xảy ra trọn vẹn hoặc không xảy ra.
 *
 * Một nguyên tắc chạy suốt tệp này: Admin có toàn quyền nhưng KHÔNG có quyền tự
 * cắt chân mình. Tự khoá, tự xoá, tự hạ vai trò đều bị chặn — không phải vì
 * người dùng ngốc, mà vì đó là cách duy nhất để bảo đảm hệ thống luôn còn ít
 * nhất một Admin đăng nhập được (UC 2.5 luồng ngoại lệ 6a).
 */
import crypto from "node:crypto";
import {
  Prisma,
  type AcademicYear,
  type ConfigValueType,
  type ThesisStatus,
  type UserRole,
  type UserStatus,
} from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { badRequest, conflict, notFound, unprocessable } from "../../lib/errors";
import { hashPassword } from "../../lib/crypto";
import type { Page } from "../../lib/http";
import { enqueueMail, mailTemplates } from "../../lib/mailer";
import { seedNotificationPreferences } from "../../services/notifications";
import { thesisScopeFilter } from "../../domain/access";
import { THESIS_STATUS_LABELS } from "../../domain/milestone-fsm";
import type { AuthUser } from "../../middleware/auth";

/* ==========================================================================
   HẰNG SỐ
   ========================================================================== */

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Quản trị viên",
  LECTURER: "Giảng viên",
  STUDENT: "Sinh viên",
};

/** Hạn mức mặc định khớp `lecturers.max_students` trong schema. */
const DEFAULT_MAX_STUDENTS = 5;

const TEMP_PASSWORD_LENGTH = 12;

/** Số tuần trên biểu đồ tần suất dùng AI của `admin/statistics/page.tsx`. */
const USAGE_WEEKS = 12;

/**
 * Thứ tự cột trên biểu đồ phân bố trạng thái đề tài. Khai báo tường minh thay vì
 * `Object.keys`: thứ tự khoá của một object là chi tiết cài đặt, còn thứ tự cột
 * trên biểu đồ là thứ người dùng nhìn thấy và không được nhảy giữa các lần tải.
 */
const THESIS_STATUS_ORDER = [
  "DRAFT",
  "PENDING",
  "REVISION_REQUIRED",
  "ONGOING",
  "COMPLETED",
  "REJECTED",
] as const satisfies readonly ThesisStatus[];

/* ==========================================================================
   TÀI KHOẢN — TRUY VẤN DÙNG CHUNG
   ========================================================================== */

/**
 * Quan hệ tối thiểu mà `toAccountDTO` cần. Khai báo một lần rồi dùng lại ở mọi
 * endpoint trả về tài khoản, nhờ vậy danh sách và các thao tác sửa/khoá/xoá
 * không thể lệch hình dạng JSON của nhau.
 */
export const ACCOUNT_INCLUDE = {
  student: { select: { id: true, student_code: true } },
  lecturer: { select: { id: true, lecturer_code: true, department: true, max_students: true } },
} satisfies Prisma.UserInclude;

export type AccountRecord = Prisma.UserGetPayload<{ include: typeof ACCOUNT_INCLUDE }>;

/** Nạp một tài khoản còn sống. Tài khoản đã xoá mềm coi như không tồn tại. */
export async function loadAccount(userId: number): Promise<AccountRecord> {
  const account = await prisma.user.findFirst({
    where: { id: userId, deleted_at: null },
    include: ACCOUNT_INCLUDE,
  });
  if (!account) throw notFound("Không tìm thấy tài khoản này.");
  return account;
}

/**
 * Dịch lỗi trùng khoá của Postgres thành thông điệp tiếng Việt.
 *
 * Vẫn cần dù đã kiểm tra trùng trước khi ghi: giữa lần kiểm tra và lần chèn có
 * một khe thời gian, và hai Admin cùng tạo một mã số trong khe đó là chuyện có
 * thật. Ràng buộc UNIQUE của CSDL mới là trọng tài cuối cùng.
 */
function rethrowUnique(err: unknown): never {
  const known = err as { code?: string; meta?: { target?: unknown } };
  if (known.code === "P2002") {
    const target = Array.isArray(known.meta?.target)
      ? known.meta.target.join(",")
      : String(known.meta?.target ?? "");
    if (target.includes("email")) throw conflict("Email này đã được sử dụng.");
    if (target.includes("student_code")) throw conflict("Mã số sinh viên này đã được sử dụng.");
    if (target.includes("lecturer_code")) throw conflict("Mã số giảng viên này đã được sử dụng.");
    if (target.includes("name")) throw conflict("Tên năm học này đã tồn tại.");
    throw conflict("Dữ liệu bị trùng với một bản ghi đã có trong hệ thống.");
  }
  throw err;
}

/* ==========================================================================
   UC 2.1 — DANH SÁCH TÀI KHOẢN
   ========================================================================== */

export interface ListAccountsQuery {
  search?: string | undefined;
  role?: UserRole | undefined;
  status?: UserStatus | undefined;
}

export async function listAccounts(
  query: ListAccountsQuery,
  page: Page
): Promise<{ rows: AccountRecord[]; total: number }> {
  // Tài khoản đã xoá mềm biến mất khỏi mọi danh sách quản trị; dữ liệu vẫn nằm
  // trong CSDL để các đề tài, mốc và bình luận cũ không mất tác giả.
  const where: Prisma.UserWhereInput = { deleted_at: null };

  if (query.role) where.role = query.role;
  if (query.status) where.status = query.status;

  if (query.search) {
    const search = query.search;
    // Giao diện chỉ có MỘT ô tìm kiếm cho cả bốn trường (`admin/users/page.tsx`),
    // nên tách thành nhiều tham số lọc ở đây sẽ không ai gọi tới.
    where.OR = [
      { full_name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { student: { student_code: { contains: search, mode: "insensitive" } } },
      { lecturer: { lecturer_code: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: ACCOUNT_INCLUDE,
      // `id` là tiêu chí phụ để hai tài khoản tạo cùng mili giây không đổi chỗ
      // giữa các trang — nguyên nhân kinh điển của "bản ghi nhảy trang".
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      skip: page.skip,
      take: page.take,
    }),
    prisma.user.count({ where }),
  ]);

  return { rows, total };
}

/* ==========================================================================
   UC 2.2 — TẠO TÀI KHOẢN
   ========================================================================== */

/**
 * Bảng chữ cái đã loại `0/O`, `1/l/I`.
 *
 * Mật khẩu tạm được người dùng ĐỌC TỪ EMAIL rồi gõ tay. Một ký tự nhập nhằng
 * biến thành một yêu cầu hỗ trợ, và entropy mất đi không đáng kể so với việc đó.
 */
const PASSWORD_POOLS = [
  "abcdefghijkmnopqrstuvwxyz",
  "ABCDEFGHJKLMNPQRSTUVWXYZ",
  "23456789",
] as const;

/**
 * Sinh mật khẩu tạm thoả chính sách của `passwordField` (có hoa, thường, số).
 *
 * `crypto.randomInt` chứ không phải `Math.random`: mật khẩu này là thứ duy nhất
 * bảo vệ tài khoản cho tới lần đăng nhập đầu tiên. Lấy mỗi nhóm một ký tự trước
 * rồi xáo lại — nếu không xáo, ba ký tự đầu luôn theo đúng thứ tự thường-hoa-số
 * và người đoán chỉ còn phải dò phần đuôi.
 */
export function generateTempPassword(): string {
  const all = PASSWORD_POOLS.join("");
  const chars: string[] = PASSWORD_POOLS.map((pool) => pool.charAt(crypto.randomInt(0, pool.length)));

  while (chars.length < TEMP_PASSWORD_LENGTH) {
    chars.push(all.charAt(crypto.randomInt(0, all.length)));
  }

  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    const a = chars[i];
    const b = chars[j];
    if (a === undefined || b === undefined) continue;
    chars[i] = b;
    chars[j] = a;
  }

  return chars.join("");
}

export interface CreateAccountInput {
  email: string;
  full_name: string;
  role: UserRole;
  student_code?: string | undefined;
  lecturer_code?: string | undefined;
  department?: string | undefined;
  max_students?: number | undefined;
}

interface LecturerProfileInput {
  lecturer_code?: string | undefined;
  department?: string | undefined;
  max_students?: number | undefined;
}

/**
 * Ràng buộc "giảng viên phải có mã số và bộ môn" được cưỡng chế ở tầng nghiệp vụ
 * chứ không chỉ ở zod: cả tạo mới (UC 2.2) lẫn đổi vai trò (UC 2.5) đều đi qua
 * đây, nên chỉ cần một chỗ để không bao giờ tạo ra hồ sơ giảng viên khuyết.
 */
function lecturerProfile(input: LecturerProfileInput): {
  lecturer_code: string;
  department: string;
  max_students: number;
} {
  const code = input.lecturer_code;
  const department = input.department;

  if (!code || !department) {
    const errors: Record<string, string[]> = {};
    if (!code) errors.lecturer_code = ["Mã số giảng viên là bắt buộc."];
    if (!department) errors.department = ["Khoa/Bộ môn là bắt buộc."];
    throw unprocessable("Vui lòng nhập đủ thông tin giảng viên.", errors);
  }

  return {
    lecturer_code: code,
    department,
    max_students: input.max_students ?? DEFAULT_MAX_STUDENTS,
  };
}

/**
 * Tạo tài khoản kèm hồ sơ tương ứng và gửi mật khẩu tạm qua email.
 *
 * `status = ACTIVE` và `email_verified_at = now` vì địa chỉ email do chính Admin
 * nhập từ danh sách của nhà trường — bắt người dùng xác minh một hộp thư mà nhà
 * trường vừa cấp cho họ là thêm một bước hỏng vô ích.
 *
 * Mật khẩu thô KHÔNG bao giờ rời khỏi hàm này ngoài đường hàng đợi email; hàm
 * trả về bản ghi tài khoản, không trả mật khẩu, để tầng route không có gì để lỡ
 * tay ghi vào phản hồi hay nhật ký.
 */
export async function createAccount(input: CreateAccountInput): Promise<AccountRecord> {
  const [existingEmail, duplicateStudent, duplicateLecturer] = await Promise.all([
    prisma.user.findUnique({ where: { email: input.email }, select: { id: true, deleted_at: true } }),
    input.student_code
      ? prisma.student.findUnique({ where: { student_code: input.student_code }, select: { id: true } })
      : Promise.resolve(null),
    input.lecturer_code
      ? prisma.lecturer.findUnique({ where: { lecturer_code: input.lecturer_code }, select: { id: true } })
      : Promise.resolve(null),
  ]);

  if (existingEmail) {
    // Email của tài khoản đã xoá mềm vẫn bị giữ chỗ bởi ràng buộc UNIQUE. Nói
    // thẳng điều đó, nếu không Admin sẽ ngồi đoán vì sao một email "chưa từng
    // dùng" lại báo trùng.
    throw conflict(
      existingEmail.deleted_at
        ? "Email này thuộc về một tài khoản đã bị xóa. Vui lòng dùng email khác."
        : "Email này đã được sử dụng."
    );
  }
  if (duplicateStudent) throw conflict("Mã số sinh viên này đã được sử dụng.");
  if (duplicateLecturer) throw conflict("Mã số giảng viên này đã được sử dụng.");

  const tempPassword = generateTempPassword();
  const password_hash = await hashPassword(tempPassword);

  const data: Prisma.UserCreateInput = {
    email: input.email,
    password_hash,
    full_name: input.full_name,
    role: input.role,
    status: "ACTIVE",
    email_verified_at: new Date(),
  };

  if (input.role === "STUDENT") {
    data.student = { create: { student_code: input.student_code ?? null } };
  }
  if (input.role === "LECTURER") {
    data.lecturer = { create: lecturerProfile(input) };
  }

  const account = await prisma.user
    .create({ data, include: ACCOUNT_INCLUDE })
    .catch(rethrowUnique);

  await seedNotificationPreferences(account.id);

  enqueueMail({
    to: account.email,
    ...mailTemplates.accountCreated(account.full_name, account.email, tempPassword),
  });

  return account;
}

/* ==========================================================================
   UC 2.3 — CHỈNH SỬA TÀI KHOẢN
   ========================================================================== */

export interface UpdateAccountInput {
  full_name?: string | undefined;
  department?: string | undefined;
  max_students?: number | undefined;
}

/**
 * Cập nhật thông tin cơ bản.
 *
 * Mã số (MSSV/MSGV) và email cố ý KHÔNG có mặt trong `UpdateAccountInput`:
 * business rule UC 2.3 khoá mã số để giữ toàn vẹn dữ liệu liên kết, còn email là
 * định danh đăng nhập. Tầng route từ chối tường minh nếu client vẫn gửi lên, để
 * người dùng nhận được lời từ chối thay vì im lặng mất dữ liệu.
 */
export async function updateAccount(
  userId: number,
  input: UpdateAccountInput
): Promise<{ account: AccountRecord; changed: string[] }> {
  const account = await loadAccount(userId);

  const data: Prisma.UserUpdateInput = {};
  const changed: string[] = [];

  if (input.full_name !== undefined && input.full_name !== account.full_name) {
    data.full_name = input.full_name;
    changed.push("full_name");
  }

  const lecturerUpdate: Prisma.LecturerUpdateWithoutUserInput = {};

  if (input.department !== undefined || input.max_students !== undefined) {
    if (!account.lecturer) {
      throw badRequest("Chỉ tài khoản giảng viên mới có khoa/bộ môn và hạn mức hướng dẫn.");
    }
    if (input.department !== undefined && input.department !== account.lecturer.department) {
      lecturerUpdate.department = input.department;
      changed.push("department");
    }
    if (input.max_students !== undefined && input.max_students !== account.lecturer.max_students) {
      lecturerUpdate.max_students = input.max_students;
      changed.push("max_students");
    }
  }

  if (Object.keys(lecturerUpdate).length > 0) data.lecturer = { update: lecturerUpdate };

  // Không có gì đổi thì không ghi: một `update` rỗng vẫn đẩy `updated_at` lên và
  // sinh ra một dòng nhật ký kiểm toán vô nghĩa.
  if (changed.length === 0) return { account, changed };

  const updated = await prisma.user
    .update({ where: { id: userId }, data, include: ACCOUNT_INCLUDE })
    .catch(rethrowUnique);

  return { account: updated, changed };
}

/* ==========================================================================
   UC 2.4 — VÔ HIỆU HOÁ / KHÔI PHỤC
   ========================================================================== */

export interface StatusChangeResult {
  account: AccountRecord;
  previous: UserStatus;
  revokedSessions: number;
}

/**
 * Đổi trạng thái tài khoản.
 *
 * Business rule UC 2.4: "tài khoản bị vô hiệu hoá sẽ lập tức bị buộc đăng xuất
 * khỏi tất cả các phiên hiện tại". Access token là JWT nên không thu hồi được;
 * điều khiến quy tắc này thành hiện thực là hai thứ đi cùng nhau — thu hồi toàn
 * bộ refresh token ở đây, và việc `middleware/auth.ts` đọc lại `status` từ CSDL
 * ở mỗi request nên access token còn hạn cũng không dùng được nữa.
 *
 * Cả hai thao tác nằm trong một giao dịch: đổi trạng thái mà không thu hồi được
 * phiên là kết cục tệ nhất — Admin tin rằng đã khoá, người kia vẫn đang dùng.
 */
export async function changeAccountStatus(
  actorId: number,
  userId: number,
  status: UserStatus
): Promise<StatusChangeResult> {
  const account = await loadAccount(userId);

  // UC 2.4 luồng ngoại lệ 4a. Đây cũng chính là điều bảo đảm hệ thống luôn còn
  // ít nhất một Admin dùng được: người đang thao tác không tự loại mình ra.
  if (account.id === actorId && status === "SUSPENDED") {
    throw badRequest("Không thể vô hiệu hóa tài khoản đang sử dụng.");
  }
  if (account.status === status) {
    throw conflict(
      status === "SUSPENDED" ? "Tài khoản này đã bị khóa từ trước." : "Tài khoản này đang hoạt động."
    );
  }

  const previous = account.status;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: { status },
      include: ACCOUNT_INCLUDE,
    });

    let revokedSessions = 0;
    if (status === "SUSPENDED") {
      const revoked = await tx.refreshToken.updateMany({
        where: { user_id: userId, revoked_at: null },
        data: { revoked_at: new Date() },
      });
      revokedSessions = revoked.count;
    }

    return { account: updated, previous, revokedSessions };
  });
}

/* ==========================================================================
   UC 2.5 — PHÂN QUYỀN VAI TRÒ
   ========================================================================== */

export interface ChangeRoleInput {
  role: UserRole;
  student_code?: string | undefined;
  lecturer_code?: string | undefined;
  department?: string | undefined;
  max_students?: number | undefined;
}

/**
 * Đổi vai trò, kèm tạo/gỡ hồ sơ Student hoặc Lecturer trong CÙNG một giao dịch.
 *
 * Hai lối thoát hiểm được đặt trước khi chạm dữ liệu:
 *
 *   • Không cho tự đổi vai trò của chính mình. Ngoài chuyện tránh thao tác nhầm,
 *     đây là thứ khiến luồng ngoại lệ 6a của UC 2.5 ("phải còn ít nhất 1 Admin")
 *     không bao giờ xảy ra: người thao tác chắc chắn là Admin và chắc chắn không
 *     phải mục tiêu, nên sau thao tác vẫn còn ít nhất một Admin.
 *
 *   • Không cho đổi vai trò khi hồ sơ cũ đang gắn với đề tài. Xoá `students` sẽ
 *     CASCADE mất luôn `thesis_members`, còn xoá `lecturers` sẽ SET NULL giảng
 *     viên hướng dẫn của mọi đề tài họ phụ trách — mất dữ liệu âm thầm sau một
 *     thao tác nhìn có vẻ vô hại.
 */
export async function changeAccountRole(
  actorId: number,
  userId: number,
  input: ChangeRoleInput
): Promise<{ account: AccountRecord; previous: UserRole }> {
  const account = await loadAccount(userId);

  if (account.id === actorId) {
    throw badRequest("Không thể tự thay đổi vai trò của chính mình. Hãy nhờ một quản trị viên khác.");
  }
  if (account.role === input.role) {
    throw conflict(`Tài khoản này đã có vai trò ${ROLE_LABELS[input.role]}.`);
  }

  const [supervising, joined] = await Promise.all([
    account.lecturer
      ? prisma.thesis.count({ where: { lecturer_id: account.lecturer.id, deleted_at: null } })
      : Promise.resolve(0),
    account.student
      ? prisma.thesisMember.count({
          where: { student_id: account.student.id, left_at: null, thesis: { deleted_at: null } },
        })
      : Promise.resolve(0),
  ]);

  if (supervising > 0) {
    throw conflict(
      `Giảng viên này đang hướng dẫn ${supervising} đề tài. Hãy chuyển giao các đề tài đó trước khi đổi vai trò.`
    );
  }
  if (joined > 0) {
    throw conflict(
      `Sinh viên này đang tham gia ${joined} đề tài. Hãy gỡ khỏi đề tài trước khi đổi vai trò.`
    );
  }

  const previous = account.role;

  const updated = await prisma
    .$transaction(async (tx) => {
      if (account.student && input.role !== "STUDENT") {
        await tx.student.delete({ where: { id: account.student.id } });
      }
      if (account.lecturer && input.role !== "LECTURER") {
        await tx.lecturer.delete({ where: { id: account.lecturer.id } });
      }
      if (input.role === "STUDENT" && !account.student) {
        await tx.student.create({
          data: { user_id: userId, student_code: input.student_code ?? null },
        });
      }
      if (input.role === "LECTURER" && !account.lecturer) {
        await tx.lecturer.create({ data: { user_id: userId, ...lecturerProfile(input) } });
      }

      // Không thu hồi phiên: `middleware/auth.ts` đọc vai trò từ CSDL ở mỗi
      // request, nên quyền mới có hiệu lực ngay ở request kế tiếp mà không cần
      // bắt người dùng đăng nhập lại.
      return tx.user.update({
        where: { id: userId },
        data: { role: input.role },
        include: ACCOUNT_INCLUDE,
      });
    })
    .catch(rethrowUnique);

  return { account: updated, previous };
}

/* ==========================================================================
   XOÁ MỀM TÀI KHOẢN
   ========================================================================== */

/**
 * Xoá mềm.
 *
 * UC 2.4 nói rõ "Admin không thể xóa vĩnh viễn tài khoản": đề tài, mốc tiến độ
 * và bình luận đều trỏ về `users.id`, xoá cứng sẽ để lại một vệt dữ liệu mồ côi
 * hoặc kéo theo CASCADE cả lịch sử hướng dẫn. Ở đây chỉ đặt `deleted_at` và
 * đóng mọi phiên — tài khoản biến mất khỏi giao diện, dữ liệu vẫn nguyên vẹn.
 */
export async function softDeleteAccount(
  actorId: number,
  userId: number
): Promise<{ account: AccountRecord; revokedSessions: number }> {
  const account = await loadAccount(userId);

  if (account.id === actorId) {
    throw badRequest("Không thể xóa tài khoản đang sử dụng.");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: { deleted_at: new Date() },
      include: ACCOUNT_INCLUDE,
    });

    const revoked = await tx.refreshToken.updateMany({
      where: { user_id: userId, revoked_at: null },
      data: { revoked_at: new Date() },
    });

    return { account: updated, revokedSessions: revoked.count };
  });
}

/* ==========================================================================
   UC 2.6 — THỐNG KÊ TỔNG QUAN
   ========================================================================== */

/**
 * Mốc đầu của `USAGE_WEEKS` tuần gần nhất, tính theo Thứ Hai UTC.
 *
 * Phải khớp `date_trunc('week', …)` của Postgres (vốn lấy Thứ Hai làm mốc), nếu
 * không các cột đếm được ở CSDL sẽ rơi vào những ô mà JavaScript không sinh ra
 * và biểu đồ sẽ toàn số 0.
 */
function weekStarts(count: number): Date[] {
  const today = new Date();
  const monday = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  );
  // getUTCDay(): 0 = Chủ nhật. Công thức đưa Chủ nhật về 6 để lùi đúng về Thứ Hai.
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));

  const weeks: Date[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(monday);
    start.setUTCDate(start.getUTCDate() - i * 7);
    weeks.push(start);
  }
  return weeks;
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Histogram lượt hỏi AI theo tuần.
 *
 * Dùng SQL thô vì Prisma không có `date_trunc`, và phương án thay thế — tải toàn
 * bộ tin nhắn 12 tuần về rồi gom nhóm trong JavaScript — chính là kiểu truy vấn
 * mà `Yêu cầu dự án.md` §2.4 bảo phải tránh. Truy vấn chỉ trả về số đếm, không
 * mang một chữ nội dung nào ra khỏi CSDL, và bộ lọc năm học đi qua tham số chứ
 * không nối chuỗi.
 */
async function weeklyAIUsage(since: Date, academicYearId?: number): Promise<Map<string, number>> {
  const yearFilter =
    academicYearId !== undefined
      ? Prisma.sql`AND s.thesis_id IN (SELECT id FROM theses WHERE academic_year_id = ${academicYearId})`
      : Prisma.empty;

  const rows = await prisma.$queryRaw<{ week: string; count: number }[]>(Prisma.sql`
    SELECT to_char(date_trunc('week', m.created_at), 'YYYY-MM-DD') AS week,
           COUNT(*)::int AS count
      FROM ai_chat_messages m
      JOIN ai_chat_sessions s ON s.id = m.session_id
     WHERE m.created_at >= ${since}
       ${yearFilter}
     GROUP BY 1
  `);

  return new Map(rows.map((row) => [row.week, row.count]));
}

/**
 * Số liệu cho `admin/statistics/page.tsx`.
 *
 * Toàn bộ truy vấn chạy song song trong một `Promise.all` và mỗi nhóm chỉ tốn
 * một `groupBy` thay vì một `count` cho mỗi trạng thái — NFR của UC 2.6 là dưới
 * 3 giây, và cách chắc chắn nhất để phá vỡ nó là đếm từng trạng thái một.
 *
 * Phạm vi đề tài lấy từ `thesisScopeFilter` chứ không tự viết điều kiện: với
 * Admin nó trả về `{}` (không giới hạn), nhưng đi qua nguồn sự thật duy nhất
 * nghĩa là endpoint này không thể trở thành lỗ rò nếu sau này được mở cho vai
 * trò khác.
 */
export async function buildStatistics(user: AuthUser, academicYearId?: number) {
  const scope = await thesisScopeFilter(user);

  const thesisWhere: Prisma.ThesisWhereInput = {
    deleted_at: null,
    ...scope,
    ...(academicYearId !== undefined ? { academic_year_id: academicYearId } : {}),
  };

  // Phiên chat có thể không gắn đề tài (sinh viên chưa được duyệt đề tài vẫn hỏi
  // trợ lý được), nên chỉ ràng buộc quan hệ khi thực sự lọc theo năm học.
  const sessionWhere: Prisma.AIChatSessionWhereInput =
    academicYearId !== undefined ? { thesis: { academic_year_id: academicYearId } } : {};

  const weeks = weekStarts(USAGE_WEEKS);
  const since = weeks[0] ?? new Date();
  const now = new Date();

  const [
    userGroups,
    thesisGroups,
    milestoneGroups,
    overdueMilestones,
    documentGroups,
    totalMessages,
    totalSessions,
    weeklyUsage,
  ] = await Promise.all([
    prisma.user.groupBy({
      by: ["role", "status"],
      where: { deleted_at: null },
      _count: { _all: true },
    }),
    prisma.thesis.groupBy({ by: ["status"], where: thesisWhere, _count: { _all: true } }),
    prisma.milestone.groupBy({
      by: ["status"],
      where: { deleted_at: null, thesis: thesisWhere },
      _count: { _all: true },
    }),
    prisma.milestone.count({
      where: {
        deleted_at: null,
        thesis: thesisWhere,
        status: { not: "COMPLETED" },
        deadline: { lt: now },
      },
    }),
    prisma.document.groupBy({
      by: ["status_ai"],
      where: { deleted_at: null, thesis: thesisWhere },
      _count: { _all: true },
    }),
    // Đếm cả phiên đã xoá mềm: xoá phiên là thao tác dọn giao diện của người
    // dùng, còn thống kê mức sử dụng phải phản ánh số lượt gọi AI có thật (đúng
    // lý do schema chọn xoá mềm cho bảng này).
    prisma.aIChatMessage.count({ where: { session: sessionWhere } }),
    prisma.aIChatSession.count({ where: sessionWhere }),
    weeklyAIUsage(since, academicYearId),
  ]);

  const users = { total: 0, students: 0, lecturers: 0, admins: 0, active: 0, suspended: 0 };
  for (const group of userGroups) {
    const count = group._count._all;
    users.total += count;
    if (group.role === "STUDENT") users.students += count;
    else if (group.role === "LECTURER") users.lecturers += count;
    else users.admins += count;
    if (group.status === "ACTIVE") users.active += count;
    else if (group.status === "SUSPENDED") users.suspended += count;
  }

  const thesisCounts = new Map<ThesisStatus, number>();
  let thesisTotal = 0;
  for (const group of thesisGroups) {
    thesisCounts.set(group.status, group._count._all);
    thesisTotal += group._count._all;
  }

  const milestoneCounts = new Map<string, number>();
  let milestoneTotal = 0;
  for (const group of milestoneGroups) {
    milestoneCounts.set(group.status, group._count._all);
    milestoneTotal += group._count._all;
  }

  const documentCounts = new Map<string, number>();
  let documentTotal = 0;
  for (const group of documentGroups) {
    documentCounts.set(group.status_ai, group._count._all);
    documentTotal += group._count._all;
  }

  return {
    users,
    theses: {
      total: thesisTotal,
      // Trả về đủ 6 trạng thái kể cả khi đếm bằng 0: biểu đồ giữ nguyên số thanh
      // giữa các lần tải thay vì co giãn theo dữ liệu.
      by_status: THESIS_STATUS_ORDER.map((status) => {
        const count = thesisCounts.get(status) ?? 0;
        return {
          status,
          label: THESIS_STATUS_LABELS[status],
          count,
          percent: thesisTotal > 0 ? Math.round((count / thesisTotal) * 100) : 0,
        };
      }),
    },
    milestones: {
      total: milestoneTotal,
      completed: milestoneCounts.get("COMPLETED") ?? 0,
      overdue: overdueMilestones,
    },
    ai: { total_messages: totalMessages, total_sessions: totalSessions },
    documents: {
      total: documentTotal,
      indexed: documentCounts.get("DONE") ?? 0,
      failed: documentCounts.get("ERROR") ?? 0,
    },
    ai_usage_weekly: weeks.map((week) => {
      const key = isoDate(week);
      return { week: key, count: weeklyUsage.get(key) ?? 0 };
    }),
  };
}

/* ==========================================================================
   TRANG TỔNG QUAN CỦA QUẢN TRỊ VIÊN

   Trước đây `/dashboard` đưa Admin vào đúng bảng điều khiển của GIẢNG VIÊN
   (`lecturerView = isLecturer(user) || role === "ADMIN"`). Admin không có
   `lecturer_id` nên danh sách luôn rỗng, và màn hình đầu tiên sau khi đăng nhập
   là dòng "Chưa hướng dẫn đề tài nào" kèm hai nút dẫn tới trang Admin không có
   quyền vào.

   Điểm khác biệt so với trang Thống kê: nơi này trả lời "hôm nay tôi phải làm
   gì", còn trang Thống kê trả lời "hệ thống đang chạy thế nào". Một trang tổng
   quan chỉ có số liệu tĩnh thì đọc xong vẫn không biết làm gì tiếp.
   ========================================================================== */

/** Ngưỡng coi một đề tài là "để quên trong hàng đợi duyệt". */
const STALE_PENDING_DAYS = 7;

/** Số dòng nhật ký lỗi gần nhất hiển thị trên trang tổng quan. */
const RECENT_ERROR_LIMIT = 5;

export async function buildAdminOverview(user: AuthUser) {
  const now = new Date();
  const stalePendingBefore = new Date(now.getTime() - STALE_PENDING_DAYS * 86_400_000);

  const [
    statistics,
    pendingVerification,
    stalePendingTheses,
    documentsAiError,
    overdueMilestones,
    unassignedTheses,
    storage,
    recentErrors,
  ] = await Promise.all([
    // Dùng lại thay vì viết truy vấn thứ hai: hai bản cài đặt song song chắc
    // chắn sẽ có lúc trả hai con số khác nhau cho cùng một câu hỏi.
    buildStatistics(user),

    prisma.user.count({ where: { deleted_at: null, status: "PENDING_VERIFICATION" } }),

    prisma.thesis.count({
      where: {
        deleted_at: null,
        status: "PENDING",
        // `submitted_at` chứ không phải `created_at`: một bản nháp nằm hai tháng
        // rồi mới gửi duyệt hôm qua thì không phải là hồ sơ bị bỏ quên.
        submitted_at: { lt: stalePendingBefore },
      },
    }),

    prisma.document.count({ where: { deleted_at: null, status_ai: "ERROR" } }),

    prisma.milestone.count({
      where: {
        deleted_at: null,
        thesis: { deleted_at: null },
        status: { not: "COMPLETED" },
        deadline: { lt: now },
      },
    }),

    // Đề tài đã duyệt nhưng chưa có người hướng dẫn — sinh viên đang chờ mà
    // không có ai chịu trách nhiệm.
    prisma.thesis.count({
      where: { deleted_at: null, lecturer_id: null, status: { in: ["PENDING", "ONGOING"] } },
    }),

    prisma.document.aggregate({
      where: { deleted_at: null },
      _sum: { file_size: true },
      _count: { _all: true },
    }),

    prisma.systemLog.findMany({
      where: { level: "ERROR" },
      orderBy: { created_at: "desc" },
      take: RECENT_ERROR_LIMIT,
      select: {
        id: true,
        action: true,
        created_at: true,
        details: true,
        user: { select: { full_name: true, email: true } },
      },
    }),
  ]);

  return {
    users: statistics.users,
    theses: statistics.theses,
    milestones: statistics.milestones,
    documents: {
      ...statistics.documents,
      total_bytes: Number(storage._sum.file_size ?? 0),
    },
    ai: statistics.ai,
    ai_usage_weekly: statistics.ai_usage_weekly,

    /* Mỗi mục là một việc CÓ THỂ BẤM VÀO. `href` do server đặt để giao diện
       không phải tự ghép đường dẫn kèm bộ lọc — hai nơi ghép sẽ có lúc lệch, và
       người dùng bấm vào một danh sách không khớp con số vừa đọc. */
    actions_required: [
      {
        key: "pending_verification",
        label: "Tài khoản chờ xác minh email",
        count: pendingVerification,
        href: "/admin/users?status=PENDING_VERIFICATION",
      },
      {
        key: "stale_pending_theses",
        label: `Đề tài chờ duyệt quá ${STALE_PENDING_DAYS} ngày`,
        count: stalePendingTheses,
        href: "/theses?status=PENDING",
      },
      {
        key: "unassigned_theses",
        label: "Đề tài chưa có giảng viên hướng dẫn",
        count: unassignedTheses,
        href: "/theses?status=PENDING",
      },
      {
        key: "documents_ai_error",
        label: "Tài liệu lỗi lập chỉ mục",
        count: documentsAiError,
        href: "/documents?status_ai=ERROR",
      },
      {
        key: "overdue_milestones",
        label: "Mốc tiến độ quá hạn toàn hệ thống",
        count: overdueMilestones,
        href: "/milestones",
      },
    ],

    recent_errors: recentErrors.map((log) => ({
      id: log.id,
      action: log.action,
      created_at: log.created_at,
      actor: log.user?.full_name ?? null,
      // `details` là JSONB tự do; chỉ lấy trường `message` nếu có, phần còn lại
      // thuộc về trang Nhật ký chứ không phải một dòng tóm tắt.
      message:
        log.details !== null && typeof log.details === "object" && !Array.isArray(log.details)
          ? ((log.details as Record<string, unknown>).message as string | undefined) ?? null
          : null,
    })),
  };
}

/* ==========================================================================
   UC 2.8 — NHẬT KÝ HỆ THỐNG (chỉ đọc)
   ========================================================================== */

export interface ListLogsQuery {
  search?: string | undefined;
  level?: "INFO" | "WARN" | "ERROR" | undefined;
  action?: string | undefined;
  user_id?: number | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
}

export async function listLogs(query: ListLogsQuery, page: Page) {
  const where: Prisma.SystemLogWhereInput = {};

  if (query.level) where.level = query.level;
  if (query.action) where.action = query.action;
  if (query.user_id !== undefined) where.user_id = query.user_id;

  if (query.from || query.to) {
    where.created_at = {
      ...(query.from ? { gte: query.from } : {}),
      ...(query.to ? { lte: query.to } : {}),
    };
  }

  if (query.search) {
    const search = query.search;
    where.OR = [
      { action: { contains: search, mode: "insensitive" } },
      { ip_address: { contains: search, mode: "insensitive" } },
      { user: { email: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.systemLog.findMany({
      where,
      include: { user: { select: { email: true } } },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      skip: page.skip,
      take: page.take,
    }),
    prisma.systemLog.count({ where }),
  ]);

  return { rows, total };
}

/** Danh sách hành động ĐANG CÓ trong nhật ký — dropdown lọc không nên hiện những
 *  mã chưa từng xuất hiện, người dùng chọn vào chỉ nhận danh sách rỗng. */
export async function listLogActions(): Promise<string[]> {
  const rows = await prisma.systemLog.findMany({
    distinct: ["action"],
    select: { action: true },
    orderBy: { action: "asc" },
  });
  return rows.map((row) => row.action);
}

/* ==========================================================================
   UC 2.9 — CẤU HÌNH THAM SỐ
   ========================================================================== */

export function listConfigs() {
  return prisma.systemConfig.findMany({
    include: { updater: { select: { full_name: true } } },
    // Sắp theo nhóm rồi theo khoá: giao diện dựng các thẻ theo `category`, thứ
    // tự ổn định giúp ô nhập không nhảy chỗ sau mỗi lần lưu.
    orderBy: [{ category: "asc" }, { config_key: "asc" }],
  });
}

/**
 * Kiểm tra giá trị theo `value_type` đã khai báo.
 *
 * NFR của UC 2.9: "tham số phải được validate chặt chẽ kiểu dữ liệu". Đây là
 * chốt chặn duy nhất — cột `config_value` là VARCHAR nên CSDL sẽ vui vẻ nhận
 * `MAX_FILE_SIZE_MB = "năm mươi"` và mọi thứ chỉ hỏng vào lúc có người tải tệp.
 */
function validateConfigValue(type: ConfigValueType, raw: string): string | null {
  switch (type) {
    case "INT": {
      // Kiểm tra dạng chuỗi trước: `Number("")` là 0 và `Number("50 ")` là 50,
      // cả hai đều lọt nếu chỉ dựa vào `Number.isInteger`.
      if (!/^-?\d+$/.test(raw.trim())) return "Giá trị phải là số nguyên.";
      if (!Number.isSafeInteger(Number(raw.trim()))) return "Giá trị số vượt quá phạm vi cho phép.";
      return null;
    }
    case "BOOLEAN":
      return raw === "true" || raw === "false" ? null : 'Giá trị phải là "true" hoặc "false".';
    case "JSON":
      try {
        JSON.parse(raw);
        return null;
      } catch {
        return "Giá trị phải là chuỗi JSON hợp lệ.";
      }
    case "STRING":
      return null;
    default:
      return null;
  }
}

export interface ConfigChange {
  key: string;
  old: string;
  new: string;
}

/**
 * Cập nhật hàng loạt trong một giao dịch.
 *
 * Tất-cả-hoặc-không: giao diện gửi lên cả biểu mẫu, nên chấp nhận một nửa thay
 * đổi sẽ để hệ thống ở trạng thái mà không ai chủ ý cấu hình. Vì vậy mọi giá trị
 * được kiểm tra trước, gom lỗi theo từng khoá rồi mới ghi.
 */
export async function applyConfigUpdates(
  actorId: number,
  items: { config_key: string; config_value: string }[]
): Promise<ConfigChange[]> {
  const rows = await prisma.systemConfig.findMany({
    where: { config_key: { in: items.map((item) => item.config_key) } },
  });
  const current = new Map(rows.map((row) => [row.config_key, row]));

  const errors: Record<string, string[]> = {};
  const changes: ConfigChange[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const key = item.config_key;

    if (seen.has(key)) {
      errors[key] = ["Khóa cấu hình bị lặp lại trong cùng một yêu cầu."];
      continue;
    }
    seen.add(key);

    const config = current.get(key);
    if (!config) {
      errors[key] = ["Khóa cấu hình không tồn tại trong hệ thống."];
      continue;
    }

    // Ghi chú ở schema: bảng này KHÔNG dùng để lưu khoá bí mật, giá trị thật đọc
    // từ biến môi trường. Cho ghi đè qua API sẽ tạo ra hai nguồn sự thật và một
    // trong hai luôn sai.
    if (config.is_secret) {
      errors[key] = ["Tham số bí mật chỉ được cấu hình bằng biến môi trường của máy chủ."];
      continue;
    }

    const invalid = validateConfigValue(config.value_type, item.config_value);
    if (invalid) {
      errors[key] = [invalid];
      continue;
    }

    if (config.config_value === item.config_value) continue;
    changes.push({ key, old: config.config_value, new: item.config_value });
  }

  if (Object.keys(errors).length > 0) {
    throw unprocessable("Một số tham số cấu hình không hợp lệ.", errors);
  }

  if (changes.length > 0) {
    await prisma.$transaction(
      changes.map((change) =>
        prisma.systemConfig.update({
          where: { config_key: change.key },
          data: { config_value: change.new, updated_by: actorId },
        })
      )
    );
  }

  return changes;
}

/* ==========================================================================
   UC 2.7 — NĂM HỌC
   ========================================================================== */

type AcademicYearRecord = AcademicYear & { _count?: { theses: number } };

/**
 * Hình dạng JSON cho năm học.
 *
 * Không nằm trong `modules/serializers.ts` vì tệp đó là hợp đồng dùng chung của
 * nhiều module, còn năm học hiện chỉ xuất hiện ở đây. `start_date`/`end_date` là
 * cột DATE nên trả về "YYYY-MM-DD" — thêm phần giờ vào sẽ khiến `<input
 * type="date">` của trình duyệt bỏ trắng.
 */
export function toAcademicYearDTO(year: AcademicYearRecord) {
  return {
    id: year.id,
    name: year.name,
    start_date: isoDate(year.start_date),
    end_date: isoDate(year.end_date),
    is_active: year.is_active,
    thesis_count: year._count?.theses ?? 0,
    created_at: year.created_at.toISOString(),
    updated_at: year.updated_at.toISOString(),
  };
}

export function listAcademicYears() {
  return prisma.academicYear.findMany({
    orderBy: [{ start_date: "desc" }],
    include: { _count: { select: { theses: true } } },
  });
}

function assertDateRange(start: Date, end: Date): void {
  if (end.getTime() <= start.getTime()) {
    throw unprocessable("Ngày kết thúc phải sau ngày bắt đầu.", {
      end_date: ["Ngày kết thúc phải sau ngày bắt đầu."],
    });
  }
}

export async function createAcademicYear(input: {
  name: string;
  start_date: Date;
  end_date: Date;
}): Promise<AcademicYearRecord> {
  assertDateRange(input.start_date, input.end_date);

  // `is_active` cố ý không nhận từ body: kích hoạt là thao tác riêng có giao
  // dịch hạ cờ năm cũ. Cho phép đặt ở đây sẽ đâm thẳng vào unique partial index
  // `uniq_academic_year_active` và trả về lỗi CSDL khó hiểu.
  return prisma.academicYear.create({ data: input }).catch(rethrowUnique);
}

export async function updateAcademicYear(
  id: number,
  input: { name?: string | undefined; start_date?: Date | undefined; end_date?: Date | undefined }
): Promise<AcademicYearRecord> {
  const existing = await prisma.academicYear.findUnique({ where: { id } });
  if (!existing) throw notFound("Không tìm thấy năm học này.");

  assertDateRange(input.start_date ?? existing.start_date, input.end_date ?? existing.end_date);

  return prisma.academicYear
    .update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.start_date !== undefined ? { start_date: input.start_date } : {}),
        ...(input.end_date !== undefined ? { end_date: input.end_date } : {}),
      },
      include: { _count: { select: { theses: true } } },
    })
    .catch(rethrowUnique);
}

/**
 * Kích hoạt một năm học.
 *
 * Hạ cờ tất cả rồi mới dựng cờ của năm được chọn, trong một giao dịch. Thứ tự và
 * tính nguyên tử đều bắt buộc: migration `..._vector_and_search_indexes` tạo
 * unique partial index trên `is_active = true`, nên chỉ cần hai năm cùng bật
 * trong một khoảnh khắc là CSDL từ chối cả thao tác.
 */
export async function activateAcademicYear(id: number): Promise<AcademicYearRecord> {
  const existing = await prisma.academicYear.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw notFound("Không tìm thấy năm học này.");

  return prisma.$transaction(async (tx) => {
    await tx.academicYear.updateMany({
      where: { is_active: true, id: { not: id } },
      data: { is_active: false },
    });
    return tx.academicYear.update({
      where: { id },
      data: { is_active: true },
      include: { _count: { select: { theses: true } } },
    });
  });
}

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
  student: { select: { id: true } },
  lecturer: { select: { id: true } },
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
}/**
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
  const [existingEmail] = await Promise.all([
    prisma.user.findUnique({ where: { email: input.email }, select: { id: true, deleted_at: true } }),
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
    data.student = { create: {} };
  }
  if (input.role === "LECTURER") {
    data.lecturer = { create: {} };
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
          data: { user_id: userId },
        });
      }
      if (input.role === "LECTURER" && !account.lecturer) {
        await tx.lecturer.create({ data: { user_id: userId } });
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
   DUYỆT ĐƠN ĐĂNG KÝ GIẢNG VIÊN
   ========================================================================== */

/**
 * Hồ sơ giảng viên kèm đủ trường của lá đơn.
 *
 * `ACCOUNT_INCLUDE` chỉ lấy `lecturer.id` vì bảng người dùng không hiển thị gì
 * hơn; trang duyệt đơn thì cần nhìn thấy toàn bộ những gì người ta đã khai.
 */
const APPLICATION_INCLUDE = {
  lecturer: {
    select: {
      lecturer_code: true,
      department: true,
      institution: true,
      phone: true,
      credential_image_url: true,
      application_note: true,
    },
  },
} satisfies Prisma.UserInclude;

export type ApplicationRecord = Prisma.UserGetPayload<{ include: typeof APPLICATION_INCLUDE }>;

/**
 * Điều kiện nhận biết "đây là một lá đơn", dùng chung cho cả liệt kê lẫn duyệt.
 *
 * `credential_image_url IS NOT NULL` là thứ phân biệt hồ sơ nộp đơn với hồ sơ do
 * Admin tạo tay — chỉ luồng nộp đơn mới ghi ảnh thẻ. Nhờ vậy giảng viên do Admin
 * tạo không bao giờ lọt vào danh sách chờ duyệt.
 */
const APPLICATION_FILTER: Prisma.UserWhereInput = {
  role: "LECTURER",
  lecturer: { credential_image_url: { not: null } },
};

export interface ListApplicationsQuery {
  /** `pending` — còn chờ xử lý; `all` — cả những đơn đã duyệt và đã từ chối. */
  status?: "pending" | "all" | undefined;
}

export async function listLecturerApplications(
  query: ListApplicationsQuery,
  page: Page
): Promise<{ rows: ApplicationRecord[]; total: number }> {
  const where: Prisma.UserWhereInput = { ...APPLICATION_FILTER };

  if (query.status === "all") {
    // Cố ý KHÔNG lọc `deleted_at`: đơn bị từ chối được xoá mềm, mà "mọi đơn" mà
    // giấu đi đúng những đơn đã bị loại thì không còn là lịch sử nữa.
  } else {
    where.status = "PENDING_VERIFICATION";
    where.deleted_at = null;
  }

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: APPLICATION_INCLUDE,
      // Đơn cũ nhất lên đầu: hàng đợi xét duyệt là hàng đợi, để người nộp trước
      // chờ lâu hơn người nộp sau là hỏng đúng thứ danh sách này sinh ra.
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
      skip: page.skip,
      take: page.take,
    }),
    prisma.user.count({ where }),
  ]);

  return { rows, total };
}

/**
 * Nạp một lá đơn CÒN CHỜ XỬ LÝ.
 *
 * Cả duyệt lẫn từ chối đều đi qua đây, nên hai thao tác không thể lệch nhau về
 * điều kiện hợp lệ. Thông điệp lỗi tách bạch từng nguyên nhân: Admin mở hai tab
 * rồi bấm duyệt hai lần là chuyện thường, và "đơn này đã được xử lý" hữu ích hơn
 * nhiều so với một câu 404 chung chung.
 */
async function loadPendingApplication(userId: number): Promise<ApplicationRecord> {
  const found = await prisma.user.findFirst({
    where: { id: userId, ...APPLICATION_FILTER },
    include: APPLICATION_INCLUDE,
  });

  if (!found) throw notFound("Không tìm thấy đơn đăng ký giảng viên này.");
  if (found.deleted_at) throw conflict("Đơn đăng ký này đã bị từ chối trước đó.");
  if (found.status !== "PENDING_VERIFICATION") {
    throw conflict("Đơn đăng ký này đã được duyệt trước đó.");
  }

  return found;
}

/**
 * Duyệt đơn: mở khoá tài khoản và cấp mật khẩu tạm.
 *
 * Đây là nơi mật khẩu THẬT đầu tiên của tài khoản ra đời — trước bước này
 * `password_hash` là băm của 32 byte ngẫu nhiên không ai biết (xem
 * `registerLecturerApplication`). Dùng lại đúng `generateTempPassword` của UC
 * 2.2 nên hai đường tạo giảng viên cho ra cùng một chất lượng mật khẩu.
 *
 * `email_verified_at` được đặt luôn: mật khẩu tạm chỉ đi tới đúng hộp thư đã
 * khai, nên đăng nhập được lần đầu tự nó đã chứng minh quyền sở hữu email. Bắt
 * người vừa được duyệt bấm thêm một liên kết xác minh là thêm một bước hỏng vô
 * ích cho cùng một kết luận.
 *
 * Mật khẩu thô không rời khỏi hàm này ngoài đường hàng đợi email; hàm trả về bản
 * ghi tài khoản để tầng route không có gì để lỡ tay ghi vào phản hồi hay nhật ký.
 */
export async function approveLecturerApplication(userId: number): Promise<ApplicationRecord> {
  const application = await loadPendingApplication(userId);

  const tempPassword = generateTempPassword();
  const password_hash = await hashPassword(tempPassword);

  const updated = await prisma.user.update({
    where: { id: application.id },
    data: {
      status: "ACTIVE",
      password_hash,
      email_verified_at: new Date(),
      // Đơn từng bị từ chối rồi được duyệt lại thì ghi chú cũ phải mất đi, nếu
      // không hồ sơ sẽ mang theo một lý do loại không còn đúng nữa.
      lecturer: { update: { application_note: null } },
    },
    include: APPLICATION_INCLUDE,
  });

  await seedNotificationPreferences(updated.id);

  enqueueMail({
    to: updated.email,
    ...mailTemplates.lecturerApproved(updated.full_name, updated.email, tempPassword),
  });

  return updated;
}

/**
 * Từ chối đơn: xoá mềm tài khoản và giữ lại lý do.
 *
 * Xoá mềm chứ không xoá hẳn, vì hai lý do đi cùng nhau: ràng buộc UNIQUE trên
 * `email` vẫn giữ chỗ nên cùng một người không nộp lại được bằng cách bấm gửi
 * thêm lần nữa, và ảnh thẻ cùng lý do từ chối vẫn còn để Admin giải trình được
 * quyết định của mình về sau.
 */
export async function rejectLecturerApplication(
  userId: number,
  reason?: string
): Promise<ApplicationRecord> {
  const application = await loadPendingApplication(userId);

  const updated = await prisma.user.update({
    where: { id: application.id },
    data: {
      deleted_at: new Date(),
      lecturer: { update: { application_note: reason ?? null } },
    },
    include: APPLICATION_INCLUDE,
  });

  enqueueMail({
    to: updated.email,
    ...mailTemplates.lecturerRejected(updated.full_name, reason),
  });

  return updated;
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
 * mang một chữ nội dung nào ra khỏi CSDL, và mốc thời gian đi qua tham số chứ
 * không nối chuỗi.
 */
async function weeklyAIUsage(since: Date): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<{ week: string; count: number }[]>(Prisma.sql`
    SELECT to_char(date_trunc('week', m.created_at), 'YYYY-MM-DD') AS week,
           COUNT(*)::int AS count
      FROM ai_chat_messages m
      JOIN ai_chat_sessions s ON s.id = m.session_id
     WHERE m.created_at >= ${since}
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
export async function buildStatistics(user: AuthUser) {
  const scope = await thesisScopeFilter(user);

  const thesisWhere: Prisma.ThesisWhereInput = { deleted_at: null, ...scope };

  /* Phiên chat có thể không gắn đề tài (sinh viên chưa được duyệt đề tài vẫn hỏi
     trợ lý được), nên hiện không lọc gì. Giữ biến để chỗ cắm cho bộ lọc khoảng
     thời gian nếu sau này thống kê cần phân kỳ. */
  const sessionWhere: Prisma.AIChatSessionWhereInput = {};

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
    weeklyAIUsage(since),
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

/** Số dòng nhật ký lỗi gần nhất hiển thị trên trang tổng quan. */
const RECENT_ERROR_LIMIT = 5;

/**
 * Trang tổng quan của Admin.
 *
 * `actions_required` chỉ chứa việc mà ADMIN mới làm được.
 *
 * Trước đây danh sách này còn có "đề tài chờ duyệt quá hạn", "đề tài chưa có
 * giảng viên hướng dẫn" và "mốc tiến độ quá hạn toàn hệ thống". Cả ba đã bị bỏ
 * vì cùng một lý do: chúng là việc của GIẢNG VIÊN và SINH VIÊN. Admin bấm vào
 * chỉ đến được một danh sách chỉ đọc (xem `lib/permissions.ts`) và không có nút
 * nào để xử lý — một danh sách việc mà người đọc không hành động được thì không
 * phải danh sách việc, nó chỉ dạy người ta bỏ qua cả khối.
 */
export async function buildAdminOverview(user: AuthUser) {
  const [
    statistics,
    pendingStudents,
    pendingLecturerApplications,
    documentsAiError,
    storage,
    recentErrors,
  ] = await Promise.all([
    // Dùng lại thay vì viết truy vấn thứ hai: hai bản cài đặt song song chắc
    // chắn sẽ có lúc trả hai con số khác nhau cho cùng một câu hỏi.
    buildStatistics(user),

    /* Tách làm hai vì `PENDING_VERIFICATION` mang hai nghĩa khác hẳn nhau, và
       hai nghĩa đó dẫn tới hai hành động khác hẳn nhau.

       Với sinh viên, nó là "chưa bấm link trong hộp thư" — Admin không làm gì
       được ngoài việc biết, cùng lắm là nhắc gửi lại email. Với giảng viên, nó
       là "đơn đang chờ CHÍNH ADMIN xét giấy tờ" — một việc tồn đọng thật, và để
       nó chìm chung vào một con số là cách chắc chắn nhất để một lá đơn nằm đó
       hàng tuần. */
    prisma.user.count({
      where: { deleted_at: null, status: "PENDING_VERIFICATION", role: "STUDENT" },
    }),

    prisma.user.count({
      where: {
        deleted_at: null,
        status: "PENDING_VERIFICATION",
        role: "LECTURER",
        // Cùng điều kiện nhận diện đơn với `listLecturerApplications`, nên con
        // số ở đây không thể lệch với danh sách mà nó dẫn tới.
        lecturer: { credential_image_url: { not: null } },
      },
    }),

    prisma.document.count({ where: { deleted_at: null, status_ai: "ERROR" } }),

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
        key: "pending_lecturer_applications",
        label: "Yêu cầu đăng ký giảng viên chờ duyệt",
        count: pendingLecturerApplications,
        /* Trỏ tới trang DUYỆT ĐƠN, không phải `/admin/users?role=LECTURER`.
           Bảng người dùng hiện đúng những tài khoản đó nhưng không có nút duyệt
           hay từ chối, cũng không xem được ảnh thẻ — dẫn Admin tới đó là dẫn vào
           một ngõ cụt ngay từ dòng đầu của danh sách việc cần làm. */
        href: "/admin/lecturer-applications",
      },
      {
        key: "pending_verification",
        label: "Tài khoản sinh viên chờ xác minh email",
        count: pendingStudents,
        href: "/admin/users?status=PENDING_VERIFICATION&role=STUDENT",
      },
      {
        key: "documents_ai_error",
        label: "Tài liệu lỗi lập chỉ mục",
        count: documentsAiError,
        href: "/documents?status_ai=ERROR",
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

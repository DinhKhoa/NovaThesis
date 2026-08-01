/**
 * Xác thực và phân quyền (RBAC).
 *
 * `Yêu cầu dự án.md` §2.1 yêu cầu RBAC chặt chẽ giữa Admin / Giảng viên / Sinh
 * viên. Middleware ở đây chỉ trả lời câu hỏi "anh là ai và thuộc nhóm nào";
 * câu hỏi khó hơn — "anh có được đụng vào ĐỀ TÀI NÀY không" — nằm ở
 * `src/domain/access.ts`, vì nó phụ thuộc dữ liệu chứ không phải vai trò.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { verifyAccessToken } from "../lib/crypto";
import { forbidden, unauthorized } from "../lib/errors";

export interface AuthUser {
  id: number;
  email: string;
  full_name: string;
  role: UserRole;
  status: "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED";
  avatar_url: string | null;
  student_id: number | null;
  lecturer_id: number | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function bearer(req: Request): string | null {
  const header = req.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}

/**
 * Nạp người dùng từ token.
 *
 * Cố ý truy vấn CSDL mỗi request thay vì tin vào payload JWT. JWT không thu hồi
 * được: nếu Admin vô hiệu hoá một tài khoản (UC 2.4), token đã phát vẫn hợp lệ
 * cho tới khi hết hạn. Đọc lại `status` từ CSDL là cách duy nhất để "buộc đăng
 * xuất khỏi mọi phiên" có hiệu lực tức thì như business rule của UC 2.4 đòi hỏi.
 */
async function loadUser(token: string): Promise<AuthUser> {
  const payload = verifyAccessToken(token);

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      email: true,
      full_name: true,
      role: true,
      status: true,
      avatar_url: true,
      deleted_at: true,
      student: { select: { id: true } },
      lecturer: { select: { id: true } },
    },
  });

  if (!user || user.deleted_at) throw unauthorized("Tài khoản không còn tồn tại.");
  if (user.status === "SUSPENDED") {
    throw forbidden("Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.");
  }
  if (user.status === "PENDING_VERIFICATION") {
    throw forbidden("Tài khoản chưa xác minh email.");
  }

  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    status: user.status,
    avatar_url: user.avatar_url,
    student_id: user.student?.id ?? null,
    lecturer_id: user.lecturer?.id ?? null,
  };
}

/** Bắt buộc đăng nhập. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = bearer(req);
  if (!token) return next(unauthorized());
  loadUser(token)
    .then((user) => {
      req.user = user;
      next();
    })
    .catch(next);
};

/**
 * Nạp người dùng nếu có token, nhưng không chặn khi thiếu.
 * Dùng cho endpoint tải tệp bằng signed URL: chữ ký đã là bằng chứng uỷ quyền.
 */
export const optionalAuth: RequestHandler = (req, _res, next) => {
  const token = bearer(req);
  if (!token) return next();
  loadUser(token)
    .then((user) => {
      req.user = user;
      next();
    })
    .catch(() => next());
};

/**
 * Handler kèm danh sách vai trò nó cho phép.
 *
 * Danh sách được đính vào chính hàm để `tests/rbac.test.ts` duyệt stack của
 * Express và kiểm tra được từng route, kể cả route mới thêm sau này. Không có nó
 * thì test chỉ so sánh được tên hàm — mà tên hàm không nói lên vai trò nào.
 */
export type RoleGuard = RequestHandler & { readonly roles: readonly UserRole[] };

/** Giới hạn theo vai trò. Dùng SAU `requireAuth`. */
export function requireRole(...roles: UserRole[]): RoleGuard {
  /* Hàm có TÊN, không dùng arrow vô danh: `router.stack[i].name` là thứ duy nhất
     hiện ra khi soi middleware, và một stack toàn `<anonymous>` thì không chẩn
     đoán được gì. */
  const handler = function requireRole(req: Request, _res: Response, next: NextFunction) {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(forbidden("Vai trò của bạn không được phép truy cập chức năng này."));
    }
    next();
  };

  return Object.assign(handler, { roles: Object.freeze([...roles]) }) as RoleGuard;
}

/**
 * Vai trò được phép GHI vào dữ liệu nghiệp vụ: sinh viên và giảng viên.
 *
 * Quản trị viên bị loại khỏi đây có chủ đích. Ranh giới là "hành chính" so với
 * "nội dung":
 *
 *   • Hành chính — gán giảng viên hướng dẫn (UC 3.12), thêm/gỡ thành viên đề
 *     tài: đây là việc của Admin, và các route đó khai `requireRole("ADMIN")`
 *     tường minh.
 *   • Nội dung — tạo/sửa đề tài, nộp minh chứng, đổi trạng thái mốc, tải tài
 *     liệu, viết phản hồi: Admin KHÔNG làm thay sinh viên và giảng viên. Một
 *     thao tác như vậy trông y hệt thao tác hợp lệ của chủ đề tài, nên nhìn vào
 *     dữ liệu sau đó không ai truy ra được là Admin đã can thiệp.
 *
 * `domain/access.ts` một mình không chặn được việc này: `can()` trả `true` cho
 * Admin ở mọi capability, vì Admin thật sự cần `edit`/`review` cho nhóm hành
 * chính ở trên. Nên hàng rào phải nằm ở tầng vai trò, ngay tại từng route.
 *
 * Đối xứng với `canWrite()` trong `frontend/src/lib/permissions.ts`.
 */
export const requireContributor = requireRole("STUDENT", "LECTURER");

/** Trả về người dùng đã xác thực, hoặc ném lỗi. Giúp handler khỏi phải `!`. */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

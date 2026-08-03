/**
 * MODULE 1 — XÁC THỰC & TÀI KHOẢN (UC 1.1 – 1.10)
 *
 * Tầng này chỉ làm ba việc: kiểm tra đầu vào bằng zod, gọi nghiệp vụ ở
 * `auth.service.ts`, rồi trả JSON theo đúng hợp đồng trong `serializers.ts`.
 *
 * Ba endpoint cố ý trả về CÙNG MỘT phản hồi bất kể email có tồn tại hay không
 * (`/forgot-password`, `/resend-verification`) hoặc cùng một thông điệp lỗi bất
 * kể sai ở đâu (`/login`). Đó không phải sự cẩu thả trong diễn đạt mà là yêu
 * cầu chống liệt kê tài khoản của UC 1.5 luồng 4a.
 */
import { Router, type RequestHandler } from "express";
import multer from "multer";
import { z } from "zod";
import { asyncHandler, noContent } from "../../lib/http";
import { badRequest, tooLarge, unauthorized } from "../../lib/errors";
import {
  assertSameOrigin,
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from "../../lib/cookies";
import { logger } from "../../lib/logger";
import { audit, AuditAction } from "../../lib/audit";
import { currentUser, requireAuth } from "../../middleware/auth";
import {
  emailField,
  optionalText,
  passwordField,
  text,
  validateBody,
} from "../../middleware/validate";
import { authLimiter, passwordResetLimiter } from "../../middleware/rate-limit";
import { notify } from "../../services/notifications";
import { toUserDTO } from "../serializers";
import {
  CREDENTIAL_MAX_BYTES,
  avatarEndpoint,
  changePassword,
  currentSessionId,
  loadProfile,
  login,
  logout,
  publicAvatarUrl,
  registerLecturerApplication,
  registerStudent,
  replaceAvatar,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  rotateSession,
  updateProfile,
  verifyEmail,
  type ProfileUser,
} from "./auth.service";

export const authRouter = Router();

/* ==========================================================================
   LƯỢC ĐỒ ĐẦU VÀO
   ========================================================================== */

const registerSchema = z.object({
  email: emailField,
  password: passwordField,
  full_name: text(2, 255, "Họ và tên"),
});

/**
 * Số điện thoại Việt Nam.
 *
 * Nhận cả `0xxxxxxxxx` lẫn `+84xxxxxxxxx` và bỏ qua khoảng trắng, dấu chấm, dấu
 * gạch mà người ta hay gõ khi chép số từ danh bạ. Chuẩn hoá về dạng `0…` trước
 * khi lưu, để hai lần nhập cùng một số không thành hai giá trị khác nhau trong
 * CSDL.
 */
const phoneField = z
  .string({ required_error: "Vui lòng nhập số điện thoại." })
  .transform((v) => v.replace(/[\s.\-()]/g, ""))
  .transform((v) => (v.startsWith("+84") ? `0${v.slice(3)}` : v))
  .pipe(
    z
      .string()
      .regex(/^0\d{9}$/, "Số điện thoại không hợp lệ. Ví dụ: 0912345678.")
  );

const lecturerApplicationSchema = z.object({
  full_name: text(2, 255, "Họ và tên"),
  email: emailField,
  phone: phoneField,
  staff_id: text(2, 50, "Mã số giảng viên"),
  institution: text(2, 255, "Trường công tác"),
  department: text(2, 100, "Khoa/Bộ môn"),
  // `password` cố ý vắng mặt: người nộp đơn không đặt mật khẩu, hệ thống sinh
  // mật khẩu tạm ở bước Admin duyệt. Zod loại bỏ khoá lạ nên client có gửi kèm
  // cũng không đi tới đâu.
});

/**
 * Mật khẩu khi ĐĂNG NHẬP không áp chính sách độ mạnh: tài khoản tạo từ trước
 * có thể không thoả luật hiện hành, và trả về "mật khẩu cần chữ hoa" cho một
 * lần gõ sai là tiết lộ luôn cấu trúc mật khẩu hợp lệ.
 */
const loginSchema = z.object({
  email: emailField,
  password: z
    .string({ required_error: "Vui lòng nhập mật khẩu." })
    .min(1, "Vui lòng nhập mật khẩu.")
    .max(128, "Mật khẩu tối đa 128 ký tự."),
});

/** Token dùng một lần do `generateToken()` sinh: 43 ký tự base64url. */
const tokenField = z
  .string({ required_error: "Liên kết không hợp lệ." })
  .transform((v) => v.trim())
  .pipe(
    z
      .string()
      .min(16, "Liên kết không hợp lệ hoặc đã hết hạn.")
      .max(512, "Liên kết không hợp lệ hoặc đã hết hạn.")
  );


const profileSchema = z.object({
  full_name: text(2, 255, "Họ và tên").optional(),
  student_code: optionalText(50, "Mã số sinh viên"),
  lecturer_code: optionalText(50, "Mã số giảng viên"),
  department: optionalText(100, "Khoa/Bộ môn"),
  // `email` cố ý vắng mặt: zod loại bỏ khoá lạ, nên client có gửi kèm cũng
  // không đổi được email đăng nhập (business rule UC 1.9).
});

const changePasswordSchema = z.object({
  old_password: z
    .string({ required_error: "Vui lòng nhập mật khẩu hiện tại." })
    .min(1, "Vui lòng nhập mật khẩu hiện tại.")
    .max(128),
  new_password: passwordField,
});

const emailOnlySchema = z.object({ email: emailField });
const verifyEmailSchema = z.object({ token: tokenField });
const resetPasswordSchema = z.object({ token: tokenField, password: passwordField });

/* ==========================================================================
   TIỆN ÍCH
   ========================================================================== */

/**
 * Hồ sơ trả ra luôn đi kèm URL ảnh đại diện đầy đủ. Giá trị trong CSDL là đường
 * dẫn trong private bucket, dán thẳng vào `<img src>` sẽ hỏng.
 */
function profileDTO(user: ProfileUser) {
  return toUserDTO({ ...user, avatar_url: publicAvatarUrl(user.id, user.avatar_url) });
}

/**
 * Thông báo bảo mật (đổi/đặt lại mật khẩu) là việc phụ, giống ghi nhật ký: nó
 * không được phép làm hỏng một thao tác đã commit xuống CSDL.
 */
function notifySecurity(userId: number, title: string, content: string): void {
  void notify({ userId, type: "SYSTEM", title, content, force: true }).catch((err: unknown) =>
    logger.error({ err, userId }, "Không gửi được thông báo bảo mật")
  );
}

/* ==========================================================================
   UC 1.2 — ĐĂNG KÝ
   ========================================================================== */

authRouter.post(
  "/register",
  // `authLimiter` bỏ qua request thành công, nên nó chỉ đếm những lần hỏng —
  // vừa đủ để chặn kịch bản dò email bằng cách nhìn mã 409.
  authLimiter,
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof registerSchema>;
    await registerStudent(body, req);

    res.status(201).json({
      message: "Đăng ký thành công. Vui lòng kiểm tra email để xác minh tài khoản.",
    });
  })
);

/* ==========================================================================
   ĐƠN ĐĂNG KÝ TÀI KHOẢN GIẢNG VIÊN
   ========================================================================== */

const credentialUpload = multer({
  // Cùng lý do như ảnh đại diện: 5MB nằm gọn trong RAM, và `registerLecturer
  // Application` kiểm tra định dạng trước khi gọi `saveBuffer`, nên tệp bị từ
  // chối không bao giờ chạm hệ thống tệp.
  storage: multer.memoryStorage(),
  limits: { fileSize: CREDENTIAL_MAX_BYTES, files: 1 },
});

/** Bọc multer để thông điệp vượt dung lượng nói đúng giới hạn của ảnh thẻ. */
const receiveCredential: RequestHandler = (req, res, next) => {
  credentialUpload.single("credential_image")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return next(tooLarge("Ảnh thẻ vượt quá 5MB. Vui lòng chọn ảnh khác nhỏ hơn."));
    }
    next(err);
  });
};

/**
 * Endpoint CÔNG KHAI: người chưa có tài khoản tự nộp đơn xin làm giảng viên.
 *
 * Dùng `passwordResetLimiter` chứ không phải `authLimiter`. `authLimiter` bỏ qua
 * request thành công, mà ở đây chính request THÀNH CÔNG mới là thứ tốn kém: mỗi
 * lần là một tệp 5MB ghi xuống đĩa cộng một loạt email gửi cho toàn bộ Admin.
 * Ba lần / 5 phút / một IP là quá đủ cho việc điền một lá đơn.
 *
 * Multer chạy TRƯỚC `validateBody`: với `multipart/form-data` thì `req.body`
 * chưa tồn tại cho tới khi multer phân tích xong phần thân request.
 */
authRouter.post(
  "/register-lecturer",
  passwordResetLimiter,
  receiveCredential,
  validateBody(lecturerApplicationSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof lecturerApplicationSchema>;
    const file = req.file;
    if (!file) throw badRequest("Vui lòng tải lên ảnh thẻ giảng viên.");

    await registerLecturerApplication(body, file, req);

    res.status(201).json({ message: "Yêu cầu đã được gửi thành công." });
  })
);

/* ==========================================================================
   UC 1.1 — ĐĂNG NHẬP
   ========================================================================== */

authRouter.post(
  "/login",
  authLimiter,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof loginSchema>;
    const result = await login(body.email, body.password, req);

    /* Refresh token đi trong cookie `httpOnly`, KHÔNG đi trong thân phản hồi.
       Trả nó ra body nghĩa là JavaScript của trang đọc được, và mọi script chạy
       trên trang cũng vậy — xem ghi chú đầu `lib/cookies.ts`. */
    setRefreshCookie(res, result.refresh_token);

    res.json({
      access_token: result.access_token,
      user: profileDTO(result.user),
    });
  })
);

/**
 * Xoay vòng phiên.
 *
 * Không nhận tham số nào: refresh token đọc từ cookie. Frontend chỉ cần gọi
 * endpoint này với `credentials: "include"`.
 */
authRouter.post(
  "/refresh",
  authLimiter,
  asyncHandler(async (req, res) => {
    assertSameOrigin(req);

    const token = readRefreshCookie(req);
    if (!token) {
      // Xoá cookie rác nếu có, để lần tải trang sau không thử lại vô ích.
      clearRefreshCookie(res);
      throw unauthorized("Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.");
    }

    try {
      const session = await rotateSession(token, req);
      setRefreshCookie(res, session.refresh_token);
      res.json({ access_token: session.access_token });
    } catch (err) {
      // Token hỏng, hết hạn hoặc đã bị thu hồi: dọn cookie luôn. Giữ lại sẽ
      // khiến mọi lần tải trang sau đó đều gọi refresh rồi thất bại.
      clearRefreshCookie(res);
      throw err;
    }
  })
);

/* ==========================================================================
   UC 1.3 — ĐĂNG XUẤT
   ========================================================================== */

authRouter.post(
  "/logout",
  requireAuth,
  asyncHandler(async (req, res) => {
    assertSameOrigin(req);

    const user = currentUser(req);
    const token = readRefreshCookie(req);

    await logout(user.id, currentSessionId(req), token ?? undefined);
    clearRefreshCookie(res);

    audit({ action: AuditAction.AUTH_LOGOUT, req, details: { email: user.email } });

    noContent(res);
  })
);

/* ==========================================================================
   UC 1.8 / 1.9 — HỒ SƠ CÁ NHÂN
   ========================================================================== */

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const profile = await loadProfile(user.id);
    // `requireAuth` vừa đọc tài khoản này từ CSDL nên nhánh null chỉ xảy ra khi
    // tài khoản bị xoá giữa hai truy vấn.
    if (!profile) throw badRequest("Không thể tải thông tin hồ sơ.");

    res.json(profileDTO(profile));
  })
);

authRouter.patch(
  "/profile",
  requireAuth,
  validateBody(profileSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const body = req.body as z.infer<typeof profileSchema>;

    const { profile, changed } = await updateProfile(user.id, body);

    if (changed.length > 0) {
      audit({ action: AuditAction.USER_UPDATE, req, details: { fields: changed, self: true } });
    }

    res.json(profileDTO(profile));
  })
);

/* ==========================================================================
   UC 1.10 — ẢNH ĐẠI DIỆN
   ========================================================================== */

/** Business rule UC 1.10: tối đa 2MB, chỉ JPG/PNG. */
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

const avatarUpload = multer({
  // Ảnh 2MB nằm gọn trong RAM; `saveBuffer` ghi xuống đĩa sau khi đã kiểm tra
  // định dạng, nhờ vậy tệp bị từ chối không bao giờ chạm hệ thống tệp.
  storage: multer.memoryStorage(),
  limits: { fileSize: AVATAR_MAX_BYTES, files: 1 },
});

/**
 * Bọc multer để thông điệp vượt dung lượng nói đúng giới hạn của ảnh đại diện.
 * Bộ xử lý lỗi chung chỉ biết `MAX_UPLOAD_MB` (50MB) của tài liệu luận văn.
 */
const receiveAvatar: RequestHandler = (req, res, next) => {
  avatarUpload.single("avatar")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return next(tooLarge("Dung lượng ảnh vượt quá 2MB. Vui lòng chọn ảnh khác nhỏ hơn."));
    }
    next(err);
  });
};

authRouter.post(
  "/avatar",
  requireAuth,
  receiveAvatar,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const file = req.file;
    if (!file) throw badRequest("Vui lòng chọn ảnh đại diện để tải lên.");

    await replaceAvatar(user.id, user.avatar_url, file);

    audit({ action: AuditAction.USER_UPDATE, req, details: { fields: ["avatar_url"], self: true } });

    res.json({ avatar_url: avatarEndpoint(user.id) });
  })
);

/* ==========================================================================
   UC 1.7 — ĐỔI MẬT KHẨU
   ========================================================================== */

authRouter.post(
  "/change-password",
  requireAuth,
  validateBody(changePasswordSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const body = req.body as z.infer<typeof changePasswordSchema>;

    // Giữ lại đúng phiên đang thao tác; mọi phiên khác bị đóng vì mật khẩu cũ
    // có thể đã lọt ra ngoài — đó là lý do người ta đổi mật khẩu.
    await changePassword(user.id, body.old_password, body.new_password, currentSessionId(req));

    audit({ action: AuditAction.AUTH_PASSWORD_CHANGE, req, details: { email: user.email } });
    notifySecurity(
      user.id,
      "Mật khẩu đã được thay đổi",
      "Mật khẩu tài khoản của bạn vừa được thay đổi. Nếu không phải bạn thực hiện, hãy liên hệ quản trị viên ngay."
    );

    noContent(res);
  })
);

/* ==========================================================================
   UC 1.4 — XÁC MINH EMAIL
   ========================================================================== */

authRouter.post(
  "/verify-email",
  validateBody(verifyEmailSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof verifyEmailSchema>;
    const userId = await verifyEmail(body.token);

    audit({ action: AuditAction.AUTH_VERIFY_EMAIL, userId, req });

    res.json({ message: "Xác minh email thành công. Bạn có thể đăng nhập ngay." });
  })
);

authRouter.post(
  "/resend-verification",
  // Cùng bộ đếm với quên mật khẩu: cả hai đều là nút "gửi email cho người khác"
  // đặt công khai ngoài internet.
  passwordResetLimiter,
  validateBody(emailOnlySchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof emailOnlySchema>;
    const userId = await resendVerification(body.email);

    if (userId !== null) {
      audit({ action: AuditAction.AUTH_VERIFY_EMAIL, userId, req, details: { resend: true } });
    }

    // Một thông điệp duy nhất cho cả hai kết cục: có gửi hay không là thông tin
    // chỉ chủ hộp thư mới được biết.
    res.json({
      message:
        "Nếu tài khoản tồn tại và chưa được kích hoạt, chúng tôi đã gửi lại email xác minh. Vui lòng kiểm tra hộp thư.",
    });
  })
);

/* ==========================================================================
   UC 1.5 / 1.6 — QUÊN & ĐẶT LẠI MẬT KHẨU
   ========================================================================== */

authRouter.post(
  "/forgot-password",
  passwordResetLimiter,
  validateBody(emailOnlySchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof emailOnlySchema>;
    const userId = await requestPasswordReset(body.email);

    if (userId !== null) {
      audit({
        action: AuditAction.AUTH_PASSWORD_RESET_REQUEST,
        userId,
        req,
        details: { email: body.email },
      });
    }

    res.json({
      message:
        "Nếu email hợp lệ, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu. Vui lòng kiểm tra hộp thư.",
    });
  })
);

authRouter.post(
  "/reset-password",
  // Liên kết reset là một bí mật 256 bit; giới hạn tần suất khiến việc dò nó
  // bất khả thi trên thực tế thay vì chỉ bất khả thi trên lý thuyết.
  authLimiter,
  validateBody(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof resetPasswordSchema>;
    const userId = await resetPassword(body.token, body.password);

    audit({ action: AuditAction.AUTH_PASSWORD_RESET, userId, req });
    notifySecurity(
      userId,
      "Mật khẩu đã được đặt lại",
      "Mật khẩu tài khoản của bạn vừa được đặt lại qua liên kết email. Mọi phiên đăng nhập cũ đã bị đóng."
    );

    noContent(res);
  })
);

"use client";

import React from "react";
import Link from "next/link";
import {
	CheckCircle,
	EnvelopeSimple,
	Eye,
	EyeSlash,
	Lock,
	User,
	WarningOctagon,
} from "@phosphor-icons/react";
import { Button, Checkbox, Input, Sheet } from "@/components/ui";
import { useAuthStore } from "@/lib/auth";
import { isApiError } from "@/lib/api";

/* ==========================================================================
   AUTH SHEET
   Signing in is a detour, not a destination. As full pages, /login and
   /register threw away whatever the visitor was reading and made switching
   between the two a round trip through the server. A side panel keeps the
   page behind it intact and turns that switch into a state change.
   ========================================================================== */

export type AuthMode = "login" | "register";

/* ==========================================================================
   KHÓA TÀI KHOẢN (UC 1.1 BR-1)

   Bộ đếm số lần sai nằm ở SERVER (`users.failed_login_attempts`), khóa bằng
   `users.locked_until`. Trước đây phía này giữ một bộ đếm riêng trong React
   state kèm câu "thử lại sau 15 phút" viết cứng, dẫn tới hai vấn đề: F5 là mất
   sạch trạng thái khóa trên giao diện, và con số 15 phút đứng yên trong khi
   thời gian thật vẫn chạy.

   Giờ nguồn sự thật duy nhất là `locked_until` do server trả về trong lỗi 429
   (`code: "ACCOUNT_LOCKED"`). Ta chỉ ghi nó xuống `localStorage` theo email để
   sống qua lần tải trang, và đếm ngược từ đó.
   ========================================================================== */

const LOCK_KEY_PREFIX = "nova.lock.";

const lockKey = (email: string) => `${LOCK_KEY_PREFIX}${email.trim().toLowerCase()}`;

/** Thời điểm hết khóa đã lưu, hoặc `null` nếu chưa khóa / đã hết hạn. */
function readLock(email: string): number | null {
  if (typeof window === "undefined" || !email.trim()) return null;
  const raw = window.localStorage.getItem(lockKey(email));
  if (!raw) return null;

  const until = Number(raw);
  // Giá trị hỏng hoặc đã qua thì dọn luôn, đừng để rác tích lại trong
  // localStorage của người dùng.
  if (!Number.isFinite(until) || until <= Date.now()) {
    window.localStorage.removeItem(lockKey(email));
    return null;
  }
  return until;
}

function writeLock(email: string, until: number): void {
  if (typeof window === "undefined" || !email.trim()) return;
  window.localStorage.setItem(lockKey(email), String(until));
}

function clearLock(email: string): void {
  if (typeof window === "undefined" || !email.trim()) return;
  window.localStorage.removeItem(lockKey(email));
}

/** "14:59" — mm:ss, vì "còn 1 phút" ở giây thứ 89 là nói dối. */
function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/** Đồng hồ đếm ngược tới thời điểm hết khóa. */
function LockCountdown({
  until,
  onExpire,
}: {
  until: number;
  onExpire: () => void;
}) {
  /* Giữ MỐC THỜI GIAN hiện tại chứ không giữ "số giây còn lại": `until` là thời
     điểm tuyệt đối, nên khi nó đổi thì phần hiển thị tự đúng ngay, không cần một
     lần setState nữa chỉ để đồng bộ lại bộ đếm. */
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current >= until) onExpire();
    };
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [until, onExpire]);

  return (
    <p className="text-[11.5px] text-center text-tertiary">
      Mở khóa sau{" "}
      <span className="tnum font-semibold text-danger">
        {formatCountdown(until - now)}
      </span>
    </p>
  );
}

interface FieldErrors {
	full_name?: string;
	email?: string;
	password?: string;
	confirm_password?: string;
	general?: string;
}

const emailShape = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateLogin(email: string, password: string): FieldErrors {
	const e: FieldErrors = {};
	if (!email.trim()) e.email = "Vui lòng nhập email";
	else if (!emailShape.test(email)) e.email = "Email không hợp lệ";
	if (!password) e.password = "Vui lòng nhập mật khẩu";
	else if (password.length < 6) e.password = "Mật khẩu tối thiểu 6 ký tự";
	return e;
}

function validateRegister(d: {
	full_name: string;
	email: string;
	password: string;
	confirm_password: string;
}): FieldErrors {
	const e: FieldErrors = {};
	if (!d.full_name.trim()) e.full_name = "Vui lòng nhập họ và tên";

	if (!d.email.trim()) e.email = "Vui lòng nhập email";
	else if (!emailShape.test(d.email)) e.email = "Email không hợp lệ";

	if (!d.password) e.password = "Vui lòng nhập mật khẩu";
	else if (d.password.length < 8) e.password = "Mật khẩu tối thiểu 8 ký tự";
	else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(d.password))
		e.password = "Mật khẩu cần có chữ hoa, chữ thường và số";

	if (!d.confirm_password) e.confirm_password = "Vui lòng xác nhận mật khẩu";
	else if (d.password !== d.confirm_password)
		e.confirm_password = "Mật khẩu xác nhận không khớp";

	return e;
}

function ErrorBanner({ children }: { children: React.ReactNode }) {
	return (
		<div
			className="flex items-start gap-2 px-3 py-2.5 rounded-[8px] text-[12.5px]"
			style={{
				background: "var(--danger-bg)",
				border: "1px solid var(--danger-border)",
				color: "var(--danger)",
			}}
			role="alert">
			<WarningOctagon size={15} weight="fill" className="flex-shrink-0 mt-px" />
			<span>{children}</span>
		</div>
	);
}

export function AuthSheet({
	open,
	mode,
	onModeChange,
	onClose,
}: {
	open: boolean;
	mode: AuthMode;
	onModeChange: (m: AuthMode) => void;
	onClose: () => void;
}) {
	const { login, register, loading } = useAuthStore();

	const [form, setForm] = React.useState({
		full_name: "",
		email: "",
		password: "",
		confirm_password: "",
	});
	const [showPassword, setShowPassword] = React.useState(false);
	const [remember, setRemember] = React.useState(true);
	const [errors, setErrors] = React.useState<FieldErrors>({});
	const [registered, setRegistered] = React.useState<string | null>(null);

	/* Khóa được tra theo email đang gõ, nên đổi email là đổi luôn trạng thái
	   khóa — tài khoản A bị khóa không được chặn người ta đăng nhập tài khoản B
	   trên cùng máy. Suy ra lúc render thay vì đồng bộ bằng effect: cách kia
	   thêm một lượt render và một khoảnh khắc nút hiện ra rồi mới bị vô hiệu. */
	const [lockNonce, setLockNonce] = React.useState(0);
	const lockedUntil = React.useMemo(
		() => readLock(form.email),
		// `lockNonce` là tín hiệu đọc lại sau khi ghi hoặc xoá khóa.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[form.email, lockNonce],
	);
	const locked = lockedUntil !== null;

	const releaseLock = React.useCallback(() => {
		clearLock(form.email);
		setLockNonce((n) => n + 1);
		setErrors({});
	}, [form.email]);

	/* Switching modes clears the previous form's complaints. The email carries
     over on purpose — someone who just failed to sign in and is now
     registering has already typed it once. */
	const switchMode = (next: AuthMode) => {
		setErrors({});
		setRegistered(null);
		onModeChange(next);
	};

	const set =
		(field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
			setForm((p) => ({ ...p, [field]: e.target.value }));
			if (errors[field]) setErrors((p) => ({ ...p, [field]: undefined }));
		};

	const submitLogin = async () => {
		if (locked) return;

		const invalid = validateLogin(form.email, form.password);
		if (Object.keys(invalid).length) return setErrors(invalid);
		setErrors({});

		try {
			await login({ email: form.email, password: form.password });
			clearLock(form.email);
			window.location.href = "/dashboard";
		} catch (err) {
			if (!isApiError(err)) {
				setErrors({ general: "Không kết nối được máy chủ. Vui lòng thử lại." });
				return;
			}

			/* 429 mang HAI ý nghĩa khác nhau và dẫn tới hai hành động khác nhau,
			   nên phải tách bằng `code` chứ không bằng mã trạng thái. */
			if (err.status === 429 && err.code === "ACCOUNT_LOCKED") {
				const until = err.locked_until
					? Date.parse(err.locked_until)
					: Date.now() + (err.retry_after_seconds ?? 0) * 1000;

				if (Number.isFinite(until) && until > Date.now()) {
					writeLock(form.email, until);
					setLockNonce((n) => n + 1);
				}
				setErrors({ general: err.message });
				return;
			}

			if (err.status === 429) {
				setErrors({
					general:
						"Thiết bị này đã gửi quá nhiều yêu cầu đăng nhập. Vui lòng đợi ít phút rồi thử lại.",
				});
				return;
			}

			if (err.status === 401) {
				// Deliberately not saying which field was wrong — naming it would
				// let an attacker enumerate which emails exist.
				setErrors({ general: "Email hoặc mật khẩu không chính xác." });
				return;
			}

			if (err.status === 403) {
				setErrors({ general: err.message });
				return;
			}

			setErrors({ general: err.message });
		}
	};

	const submitRegister = async () => {
		const invalid = validateRegister(form);
		if (Object.keys(invalid).length) return setErrors(invalid);
		setErrors({});

		try {
			await register({
				email: form.email,
				password: form.password,
				full_name: form.full_name,
			});
			setRegistered(form.email);
		} catch (err) {
			if (isApiError(err)) {
				if (err.status === 409)
					setErrors({ email: "Email này đã được sử dụng" });
				else setErrors({ general: err.message });
			} else {
				setErrors({ general: "Không kết nối được máy chủ. Vui lòng thử lại." });
			}
		}
	};

	const onSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (mode === "login") submitLogin();
		else submitRegister();
	};

	const isLogin = mode === "login";

	return (
		<Sheet
			open={open}
			onClose={onClose}
			title={isLogin ? "Đăng nhập" : "Đăng ký tài khoản"}
			description="Dùng email do nhà trường cấp."
			footer={
				registered ? undefined : (
					<p className="text-[12.5px] text-tertiary text-center">
						{isLogin ? "Chưa có tài khoản?" : "Đã có tài khoản?"}{" "}
						<button
							type="button"
							onClick={() => switchMode(isLogin ? "register" : "login")}
							className="text-accent font-medium hover:underline">
							{isLogin ? "Đăng ký" : "Đăng nhập"}
						</button>
					</p>
				)
			}>
			{registered ? (
				/* Registration ends in "go check your email", which is a stopping
           point, not another form — so the panel switches to it wholesale. */
				<div className="text-center py-6">
					<div
						className="w-12 h-12 rounded-[12px] flex items-center justify-center mx-auto mb-4"
						style={{
							background: "var(--success-bg)",
							color: "var(--success)",
						}}>
						<CheckCircle size={26} weight="duotone" />
					</div>
					<h3 className="text-[16px] font-semibold mb-2">Đã tạo tài khoản</h3>
					<p className="text-[13px] text-tertiary leading-relaxed mb-5">
						Chúng tôi đã gửi email xác minh đến{" "}
						<span className="font-medium text-primary">{registered}</span>. Mở
						email đó để kích hoạt tài khoản. Nếu không thấy, kiểm tra cả thư mục
						spam.
					</p>
					<Button variant="secondary" onClick={() => switchMode("login")}>
						Quay lại đăng nhập
					</Button>
				</div>
			) : (
				<>
					<form
						onSubmit={onSubmit}
						className="flex flex-col gap-3.5"
						noValidate>
						{errors.general && <ErrorBanner>{errors.general}</ErrorBanner>}

						{!isLogin && (
							<Input
								label="Họ và tên"
								placeholder="Nguyễn Văn A"
								value={form.full_name}
								onChange={set("full_name")}
								error={errors.full_name}
								icon={<User size={14} />}
								autoComplete="name"
								required
							/>
						)}

						<Input
							label="Email"
							type="email"
							placeholder="example@email.com"
							value={form.email}
							onChange={set("email")}
							error={errors.email}
							icon={<EnvelopeSimple size={14} />}
							autoComplete="email"
							required
						/>

						<Input
							label="Mật khẩu"
							type={showPassword ? "text" : "password"}
							placeholder={isLogin ? "••••••••" : "Tối thiểu 8 ký tự"}
							value={form.password}
							onChange={set("password")}
							error={errors.password}
							icon={<Lock size={14} />}
							autoComplete={isLogin ? "current-password" : "new-password"}
							helperText={isLogin ? undefined : "Gồm chữ hoa, chữ thường và số"}
							required
							suffix={
								<button
									type="button"
									onClick={() => setShowPassword((v) => !v)}
									tabIndex={-1}
									aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
									className="hover:text-primary transition-colors">
									{showPassword ? <EyeSlash size={14} /> : <Eye size={14} />}
								</button>
							}
						/>

						{!isLogin && (
							<Input
								label="Xác nhận mật khẩu"
								type="password"
								placeholder="Nhập lại mật khẩu"
								value={form.confirm_password}
								onChange={set("confirm_password")}
								error={errors.confirm_password}
								icon={<Lock size={14} />}
								autoComplete="new-password"
								required
							/>
						)}

						{isLogin && (
							<div className="flex items-center justify-between">
								<Checkbox
									label="Ghi nhớ đăng nhập"
									checked={remember}
									onChange={(e) => setRemember(e.target.checked)}
								/>
								{/* Stays a page: it is reached from an email link and ends in
                    one, so it outlives this panel. */}
								<Link
									href="/forgot-password"
									className="text-[12.5px] text-accent hover:underline">
									Quên mật khẩu?
								</Link>
							</div>
						)}

						<Button
							type="submit"
							variant="primary"
							size="lg"
							loading={loading}
							disabled={isLogin && locked}
							className="w-full mt-1">
							{isLogin ? "Đăng nhập" : "Đăng ký"}
						</Button>

						{isLogin && lockedUntil !== null && (
							<LockCountdown until={lockedUntil} onExpire={releaseLock} />
						)}
					</form>
				</>
			)}
		</Sheet>
	);
}

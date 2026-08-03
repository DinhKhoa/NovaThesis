"use client";

import React from "react";
import {
	ArrowLeft,
	ArrowRight,
	Buildings,
	CheckCircle,
	EnvelopeSimple,
	IdentificationCard,
	ImageSquare,
	Phone,
	Trash,
	User,
	WarningOctagon,
} from "@phosphor-icons/react";
import { Button, Input, Sheet } from "@/components/ui";
import { isApiError } from "@/lib/api";
import { lecturerApplicationApi } from "@/lib/services";

/* ==========================================================================
   ĐƠN ĐĂNG KÝ TÀI KHOẢN GIẢNG VIÊN

   Tách khỏi `auth-sheet.tsx` thay vì thêm một chế độ thứ ba vào đó. Hai thứ
   trông giống nhau nhưng khác hẳn về bản chất: đăng nhập/đăng ký kết thúc bằng
   một phiên làm việc, còn lá đơn này kết thúc bằng việc CHỜ một người khác đọc.
   Nhồi chung sẽ kéo theo trạng thái khóa tài khoản, bộ đếm đăng nhập sai và
   chuyển đổi hai chiều login↔register vào một luồng chẳng dùng đến gì trong số
   đó.
   ========================================================================== */

/** Khớp `CREDENTIAL_MAX_BYTES` ở backend. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Khớp `CREDENTIAL_MIME` trong `backend/src/lib/storage.ts`. */
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

const emailShape = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Cùng luật với `phoneField` ở backend: bỏ ký tự phân cách, quy `+84` về `0`.
   Kiểm ở đây chỉ để người dùng biết ngay lúc gõ; hàng rào thật nằm ở server. */
function normalizePhone(raw: string): string {
	const stripped = raw.replace(/[\s.\-()]/g, "");
	return stripped.startsWith("+84") ? `0${stripped.slice(3)}` : stripped;
}

interface FieldErrors {
	full_name?: string;
	email?: string;
	phone?: string;
	institution?: string;
	department?: string;
	credential_image?: string;
	general?: string;
}

type Form = {
	full_name: string;
	email: string;
	phone: string;
	institution: string;
	department: string;
};

const EMPTY_FORM: Form = {
	full_name: "",
	email: "",
	phone: "",
	institution: "",
	department: "",
};

function validateStep1(d: Form): FieldErrors {
	const e: FieldErrors = {};
	if (!d.full_name.trim()) e.full_name = "Vui lòng nhập họ và tên";
	else if (d.full_name.trim().length < 2) e.full_name = "Họ và tên quá ngắn";

	if (!d.email.trim()) e.email = "Vui lòng nhập email";
	else if (!emailShape.test(d.email)) e.email = "Email không hợp lệ";

	if (!d.phone.trim()) e.phone = "Vui lòng nhập số điện thoại";
	else if (!/^0\d{9}$/.test(normalizePhone(d.phone)))
		e.phone = "Số điện thoại không hợp lệ. Ví dụ: 0912345678";

	return e;
}

function validateStep2(d: Form, file: File | null): FieldErrors {
	const e: FieldErrors = {};
	if (!d.institution.trim()) e.institution = "Vui lòng nhập trường công tác";
	if (!d.department.trim()) e.department = "Vui lòng nhập khoa hoặc bộ môn";
	if (!file) e.credential_image = "Vui lòng tải lên ảnh thẻ giảng viên";
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

/* ==========================================================================
   CHỈ BÁO BƯỚC
   ========================================================================== */

function StepIndicator({ step }: { step: 1 | 2 }) {
	const steps = [
		{ n: 1 as const, label: "Thông tin cơ bản" },
		{ n: 2 as const, label: "Xác minh" },
	];

	return (
		<ol className="flex items-center gap-2 mb-1" aria-label="Tiến trình đăng ký">
			{steps.map((s, i) => {
				const done = step > s.n;
				const active = step === s.n;
				return (
					<React.Fragment key={s.n}>
						<li
							className="flex items-center gap-1.5"
							aria-current={active ? "step" : undefined}>
							<span
								className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10.5px] font-semibold flex-shrink-0"
								style={{
									background:
										done || active ? "var(--accent)" : "var(--bg-subtle)",
									color: done || active ? "#fff" : "var(--text-muted)",
									border:
										done || active
											? "none"
											: "1px solid var(--border-primary)",
								}}
								aria-hidden="true">
								{done ? "✓" : s.n}
							</span>
							<span
								className="text-[11.5px] font-medium"
								style={{
									color: active ? "var(--accent)" : "var(--text-tertiary)",
								}}>
								{s.label}
							</span>
						</li>
						{i === 0 && (
							<span
								className="flex-1 h-px"
								style={{ background: "var(--border-primary)" }}
								aria-hidden="true"
							/>
						)}
					</React.Fragment>
				);
			})}
		</ol>
	);
}

/* ==========================================================================
   VÙNG TẢI ẢNH THẺ
   ========================================================================== */

function CredentialUpload({
	file,
	previewUrl,
	error,
	onPick,
	onClear,
}: {
	file: File | null;
	previewUrl: string | null;
	error?: string;
	onPick: (f: File) => void;
	onClear: () => void;
}) {
	const inputRef = React.useRef<HTMLInputElement>(null);
	const [dragging, setDragging] = React.useState(false);

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault();
		setDragging(false);
		const dropped = e.dataTransfer.files?.[0];
		if (dropped) onPick(dropped);
	};

	return (
		<div className="flex flex-col">
			<span className="field-label">
				Ảnh thẻ giảng viên
				<span className="text-danger ml-0.5" aria-hidden="true">
					*
				</span>
			</span>

			{/* Ô `file` thật bị ẩn nhưng vẫn nằm trong cây DOM và vẫn nhận focus:
			    thay nó bằng một `<div onClick>` là cắt luôn đường dùng bàn phím. */}
			<input
				ref={inputRef}
				type="file"
				accept={ACCEPTED_TYPES.join(",")}
				className="sr-only"
				aria-label="Chọn ảnh thẻ giảng viên"
				aria-invalid={error ? true : undefined}
				onChange={(e) => {
					const picked = e.target.files?.[0];
					if (picked) onPick(picked);
					// Đặt lại để chọn LẠI đúng tệp vừa bị từ chối vẫn kích hoạt
					// `change` — nếu không, người dùng nén ảnh rồi chọn lại cùng tên
					// sẽ không thấy gì xảy ra.
					e.target.value = "";
				}}
			/>

			{file && previewUrl ? (
				<div
					className="rounded-[10px] overflow-hidden"
					style={{ border: "1px solid var(--border-primary)" }}>
					{/* `<img>` thường chứ không phải `next/image`: nguồn là một blob
					    URL chỉ tồn tại trong phiên này, không có gì để tối ưu hoá
					    trước và cũng không đi qua trình tối ưu ảnh được. */}
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img
						src={previewUrl}
						alt="Xem trước ảnh thẻ giảng viên"
						className="w-full max-h-44 object-contain"
						style={{ background: "var(--bg-subtle)" }}
					/>
					<div
						className="flex items-center gap-2 px-2.5 py-2"
						style={{ borderTop: "1px solid var(--border-secondary)" }}>
						<ImageSquare
							size={14}
							className="text-tertiary flex-shrink-0"
							aria-hidden="true"
						/>
						<span className="text-[12px] text-tertiary truncate flex-1 min-w-0">
							{file.name}
						</span>
						<button
							type="button"
							onClick={onClear}
							className="text-muted hover:text-danger transition-colors flex-shrink-0"
							aria-label="Bỏ ảnh đã chọn">
							<Trash size={14} />
						</button>
					</div>
				</div>
			) : (
				<button
					type="button"
					onClick={() => inputRef.current?.click()}
					onDragOver={(e) => {
						e.preventDefault();
						setDragging(true);
					}}
					onDragLeave={() => setDragging(false)}
					onDrop={handleDrop}
					className="flex flex-col items-center justify-center gap-1.5 px-4 py-6 rounded-[10px] transition-colors w-full"
					style={{
						border: `1px dashed ${
							error
								? "var(--danger-border)"
								: dragging
									? "var(--accent)"
									: "var(--border-primary)"
						}`,
						background: dragging ? "var(--accent-subtle)" : "var(--bg-subtle)",
					}}>
					<ImageSquare
						size={20}
						weight="duotone"
						className="text-tertiary"
						aria-hidden="true"
					/>
					<span className="text-[12.5px] font-medium">
						Kéo ảnh vào đây hoặc bấm để chọn
					</span>
					<span className="text-[11.5px] text-tertiary">
						JPG, PNG hoặc WEBP · tối đa 5MB
					</span>
				</button>
			)}

			{error ? (
				<p className="text-[11.5px] text-danger mt-1">{error}</p>
			) : (
				<p className="text-[11.5px] text-tertiary mt-1">
					Ảnh chụp thẻ giảng viên hoặc quyết định công tác, đủ rõ để đọc được
					họ tên và đơn vị.
				</p>
			)}
		</div>
	);
}

/* ==========================================================================
   SHEET
   ========================================================================== */

export function LecturerApplySheet({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
	const [step, setStep] = React.useState<1 | 2>(1);
	const [form, setForm] = React.useState<Form>(EMPTY_FORM);
	const [file, setFile] = React.useState<File | null>(null);
	const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
	const [errors, setErrors] = React.useState<FieldErrors>({});
	const [submitting, setSubmitting] = React.useState(false);
	const [submitted, setSubmitted] = React.useState(false);

	/* Blob URL giữ nguyên tệp trong bộ nhớ cho tới khi bị thu hồi. Gắn việc thu
	   hồi vào chính vòng đời của URL — chọn ảnh khác, bỏ ảnh, hay rời trang giữa
	   chừng đều đi qua đây. */
	React.useEffect(() => {
		if (!previewUrl) return;
		return () => URL.revokeObjectURL(previewUrl);
	}, [previewUrl]);

	const set =
		(field: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => {
			setForm((p) => ({ ...p, [field]: e.target.value }));
			if (errors[field]) setErrors((p) => ({ ...p, [field]: undefined }));
		};

	const pickFile = (picked: File) => {
		if (!ACCEPTED_TYPES.includes(picked.type)) {
			setErrors((p) => ({
				...p,
				credential_image: "Chỉ nhận ảnh JPG, PNG hoặc WEBP",
			}));
			return;
		}
		if (picked.size > MAX_IMAGE_BYTES) {
			setErrors((p) => ({
				...p,
				credential_image: `Ảnh nặng ${(picked.size / 1024 / 1024).toFixed(1)}MB, vượt giới hạn 5MB`,
			}));
			return;
		}

		setFile(picked);
		setPreviewUrl(URL.createObjectURL(picked));
		setErrors((p) => ({ ...p, credential_image: undefined }));
	};

	const clearFile = () => {
		setFile(null);
		setPreviewUrl(null);
	};

	const goNext = () => {
		const invalid = validateStep1(form);
		if (Object.keys(invalid).length) return setErrors(invalid);
		setErrors({});
		setStep(2);
	};

	const goBack = () => {
		// Giữ nguyên những gì đã gõ ở bước 2: quay lại sửa một chữ trong email
		// không phải là lý do để mất mã số và ảnh vừa chọn.
		setErrors({});
		setStep(1);
	};

	const submit = async () => {
		const invalid = validateStep2(form, file);
		if (Object.keys(invalid).length) return setErrors(invalid);
		if (!file) return;

		setErrors({});
		setSubmitting(true);
		try {
			await lecturerApplicationApi.submit({
				full_name: form.full_name.trim(),
				email: form.email.trim(),
				phone: normalizePhone(form.phone),
				institution: form.institution.trim(),
				department: form.department.trim(),
				credential_image: file,
			});
			setSubmitted(true);
		} catch (err) {
			if (!isApiError(err)) {
				setErrors({ general: "Không kết nối được máy chủ. Vui lòng thử lại." });
				return;
			}

			if (err.errors) {
				const mapped: FieldErrors = {};
				for (const [key, messages] of Object.entries(err.errors)) {
					const first = messages[0];
					if (first) mapped[key as keyof FieldErrors] = first;
				}
				setErrors(mapped);
				if (mapped.full_name || mapped.email || mapped.phone) setStep(1);
				return;
			}

			if (err.status === 409) {
				setErrors({ email: err.message });
				setStep(1);
				return;
			}

			setErrors({ general: err.message });
		} finally {
			setSubmitting(false);
		}
	};

	/* Đóng bảng là kết thúc lá đơn: mở lại phải là một tờ giấy trắng, không phải
	   nửa lá đơn cũ của người dùng trước trên máy dùng chung. */
	const closeAndReset = () => {
		onClose();
		setStep(1);
		setForm(EMPTY_FORM);
		clearFile();
		setErrors({});
		setSubmitted(false);
	};

	return (
		<Sheet
			open={open}
			onClose={closeAndReset}
			title="Đăng ký tài khoản giảng viên"
			description={
				submitted ? undefined : "Quản trị viên sẽ xét duyệt trước khi cấp tài khoản."
			}
			footer={
				submitted ? undefined : (
					<div className="flex items-center gap-2">
						{step === 2 && (
							<Button
								variant="ghost"
								icon={<ArrowLeft size={14} />}
								onClick={goBack}
								disabled={submitting}>
								Quay lại
							</Button>
						)}
						<span className="flex-1" />
						{step === 1 ? (
							<Button
								variant="primary"
								iconRight={<ArrowRight size={14} />}
								onClick={goNext}>
								Tiếp tục
							</Button>
						) : (
							<Button
								variant="primary"
								loading={submitting}
								onClick={() => void submit()}>
								Gửi yêu cầu
							</Button>
						)}
					</div>
				)
			}>
			{submitted ? (
				<div className="text-center py-6">
					<div
						className="w-12 h-12 rounded-[12px] flex items-center justify-center mx-auto mb-4"
						style={{ background: "var(--success-bg)", color: "var(--success)" }}>
						<CheckCircle size={26} weight="duotone" />
					</div>
					<h3 className="text-[16px] font-semibold mb-2">Đã gửi yêu cầu</h3>
					<p className="text-[13px] text-tertiary leading-relaxed mb-5">
						Yêu cầu của bạn đã được gửi. Chúng tôi sẽ liên hệ qua email{" "}
						<span className="font-medium text-primary">{form.email.trim()}</span>{" "}
						sau khi xét duyệt.
					</p>
					<Button variant="secondary" onClick={closeAndReset}>
						Đóng
					</Button>
				</div>
			) : (
				<form
					onSubmit={(e) => {
						e.preventDefault();
						if (step === 1) goNext();
						else void submit();
					}}
					className="flex flex-col gap-3.5"
					noValidate>
					<StepIndicator step={step} />

					{errors.general && <ErrorBanner>{errors.general}</ErrorBanner>}

					{step === 1 ? (
						<>
							<Input
								label="Họ và tên"
								placeholder="TS. Nguyễn Văn A"
								value={form.full_name}
								onChange={set("full_name")}
								error={errors.full_name}
								icon={<User size={14} />}
								autoComplete="name"
								required
							/>

							<Input
								label="Email"
								type="email"
								placeholder="giangvien@truong.edu.vn"
								value={form.email}
								onChange={set("email")}
								error={errors.email}
								icon={<EnvelopeSimple size={14} />}
								autoComplete="email"
								helperText="Thông tin đăng nhập sẽ được gửi tới địa chỉ này."
								required
							/>

							<Input
								label="Số điện thoại"
								type="tel"
								placeholder="0912345678"
								value={form.phone}
								onChange={set("phone")}
								error={errors.phone}
								icon={<Phone size={14} />}
								autoComplete="tel"
								required
							/>
						</>
					) : (
						<>
							<Input
								label="Trường công tác"
								placeholder="Trường Đại học Kinh tế – Đại học Đà Nẵng"
								value={form.institution}
								onChange={set("institution")}
								error={errors.institution}
								icon={<Buildings size={14} />}
								autoComplete="organization"
								required
							/>

							<Input
								label="Khoa / Bộ môn"
								placeholder="Khoa Thống kê – Tin học"
								value={form.department}
								onChange={set("department")}
								error={errors.department}
								icon={<Buildings size={14} />}
								required
							/>

							<CredentialUpload
								file={file}
								previewUrl={previewUrl}
								error={errors.credential_image}
								onPick={pickFile}
								onClear={clearFile}
							/>
						</>
					)}
				</form>
			)}
		</Sheet>
	);
}

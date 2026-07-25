"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  GraduationCap,
  EnvelopeSimple,
  Lock,
  User,
  Eye,
  EyeSlash,
  ArrowRight,
  CheckCircle,
} from "@phosphor-icons/react";
import { Button, Input } from "@/components/ui";
import { useAuthStore } from "@/lib/auth";
import { isApiError } from "@/lib/api";

/* ========================================
   VALIDATION (UC 1.2)
   ======================================== */

interface FormErrors {
  full_name?: string;
  email?: string;
  password?: string;
  confirm_password?: string;
  general?: string;
}

function validateForm(data: {
  full_name: string;
  email: string;
  password: string;
  confirm_password: string;
}): FormErrors {
  const errors: FormErrors = {};

  if (!data.full_name.trim()) errors.full_name = "Vui lòng nhập họ và tên";

  if (!data.email.trim()) errors.email = "Vui lòng nhập email";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
    errors.email = "Email không hợp lệ";

  if (!data.password) errors.password = "Vui lòng nhập mật khẩu";
  else if (data.password.length < 8)
    errors.password = "Mật khẩu tối thiểu 8 ký tự";
  else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(data.password))
    errors.password = "Mật khẩu cần có chữ hoa, chữ thường và số";

  if (!data.confirm_password)
    errors.confirm_password = "Vui lòng xác nhận mật khẩu";
  else if (data.password !== data.confirm_password)
    errors.confirm_password = "Mật khẩu xác nhận không khớp";

  return errors;
}

/* ========================================
   REGISTER PAGE
   ======================================== */

export default function RegisterPage() {
  const router = useRouter();
  const { register, loading } = useAuthStore();

  const [formData, setFormData] = React.useState({
    full_name: "",
    email: "",
    password: "",
    confirm_password: "",
  });
  const [showPassword, setShowPassword] = React.useState(false);
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [success, setSuccess] = React.useState(false);

  const handleChange = (field: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationErrors = validateForm(formData);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});

    try {
      await register({
        email: formData.email,
        password: formData.password,
        full_name: formData.full_name,
      });
      setSuccess(true);
    } catch (error) {
      if (isApiError(error)) {
        if (error.status === 409) {
          setErrors({ email: "Email này đã được sử dụng" });
        } else if (error.errors) {
          setErrors(error.errors as unknown as FormErrors);
        } else {
          setErrors({ general: error.message });
        }
      } else {
        setErrors({ general: "Không thể kết nối đến server" });
      }
    }
  };

  if (success) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6 bg-[var(--bg-primary)]"
      >
        <div className="text-center max-w-sm page-enter">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20"
          >
            <CheckCircle size={32} weight="duotone" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-white mb-2">Đăng ký thành công!</h2>
          <p
            className="text-[14px] mb-6 text-zinc-400"
          >
            Chúng tôi đã gửi email xác minh đến{" "}
            <span className="font-medium text-white">
              {formData.email}
            </span>
            . Vui lòng kiểm tra hộp thư để kích hoạt tài khoản.
          </p>
          <Button
            variant="primary"
            onClick={() => router.push("/login")}
            iconRight={<ArrowRight size={16} />}
          >
            Đến trang đăng nhập
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex bg-[var(--bg-primary)]"
    >
      {/* Left Branding */}
      <div
        className="hidden lg:flex lg:w-[45%] flex-col justify-between p-10 relative overflow-hidden bg-[var(--bg-secondary)] border-r border-white/10"
      >
        <div
          className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-emerald-500/5 blur-3xl"
        />

        <div className="flex items-center gap-3 relative z-10">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--accent)] text-black font-bold shadow-lg shadow-[var(--accent)]/20"
          >
            <GraduationCap size={22} weight="bold" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white">
            NovaThesis
          </span>
        </div>

        <div className="relative z-10 max-w-md">
          <h1 className="text-3xl font-bold tracking-tight leading-snug text-white mb-4">
            Bắt đầu hành trình
            <br />
            <span className="text-[var(--accent)]">nghiên cứu</span> của bạn
          </h1>
          <p
            className="text-[15px] leading-relaxed text-zinc-400"
          >
            Tạo tài khoản để truy cập đầy đủ các công cụ quản lý luận văn,
            theo dõi tiến độ và nhận hỗ trợ từ AI.
          </p>
        </div>

        <div className="relative z-10">
          <p className="text-[12px] font-mono uppercase tracking-widest text-zinc-500">
            Hệ thống dành riêng cho sinh viên và giảng viên
          </p>
        </div>
      </div>

      {/* Right Register form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center bg-[var(--accent)] text-black font-bold"
            >
              <GraduationCap size={20} weight="bold" />
            </div>
            <span className="text-lg font-bold tracking-tight text-white">
              NovaThesis
            </span>
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-white mb-1">
            Đăng ký tài khoản
          </h2>
          <p
            className="text-[14px] text-zinc-400 mb-6"
          >
            Nhập thông tin cá nhân để tạo tài khoản mới
          </p>

          {errors.general && (
            <div
              className="flex items-center gap-2 px-4 py-3 rounded-xl mb-4 text-[13px] bg-red-500/10 border border-red-500/20 text-red-400"
            >
              {errors.general}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="Họ và tên"
              placeholder="Nguyễn Văn A"
              value={formData.full_name}
              onChange={handleChange("full_name")}
              error={errors.full_name}
              icon={<User size={18} />}
              autoComplete="name"
              autoFocus
            />

            <Input
              label="Email"
              type="email"
              placeholder="your@email.edu.vn"
              value={formData.email}
              onChange={handleChange("email")}
              error={errors.email}
              icon={<EnvelopeSimple size={18} />}
              autoComplete="email"
            />

            <div className="relative">
              <Input
                label="Mật khẩu"
                type={showPassword ? "text" : "password"}
                placeholder="Tối thiểu 8 ký tự"
                value={formData.password}
                onChange={handleChange("password")}
                error={errors.password}
                icon={<Lock size={18} />}
                autoComplete="new-password"
                helperText="Gồm chữ hoa, chữ thường và số"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-[38px] p-1 text-zinc-400 hover:text-white"
                tabIndex={-1}
              >
                {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <Input
              label="Xác nhận mật khẩu"
              type="password"
              placeholder="Nhập lại mật khẩu"
              value={formData.confirm_password}
              onChange={handleChange("confirm_password")}
              error={errors.confirm_password}
              icon={<Lock size={18} />}
              autoComplete="new-password"
            />

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              className="w-full mt-2"
              iconRight={!loading ? <ArrowRight size={18} /> : undefined}
            >
              Đăng ký
            </Button>
          </form>

          <p
            className="text-[13px] text-center mt-6 text-zinc-400"
          >
            Đã có tài khoản?{" "}
            <Link
              href="/login"
              className="font-medium text-[var(--accent)] hover:underline"
            >
              Đăng nhập
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

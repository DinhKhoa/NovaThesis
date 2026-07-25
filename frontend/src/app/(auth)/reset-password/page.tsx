"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  GraduationCap,
  Lock,
  Eye,
  EyeSlash,
  CheckCircle,
  ArrowRight,
} from "@phosphor-icons/react";
import { Button, Input } from "@/components/ui";
import { api, isApiError } from "@/lib/api";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [errors, setErrors] = React.useState<{ password?: string; confirm?: string; general?: string }>({});
  const [loading, setLoading] = React.useState(false);
  const [success, setSuccess] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const newErrors: typeof errors = {};
    if (!password) newErrors.password = "Vui lòng nhập mật khẩu mới";
    else if (password.length < 8) newErrors.password = "Mật khẩu tối thiểu 8 ký tự";
    else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password))
      newErrors.password = "Mật khẩu cần có chữ hoa, chữ thường và số";
    if (password !== confirmPassword) newErrors.confirm = "Mật khẩu xác nhận không khớp";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    if (!token) {
      setErrors({ general: "Liên kết không hợp lệ hoặc đã hết hạn" });
      return;
    }

    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      setSuccess(true);
    } catch (err) {
      if (isApiError(err)) {
        if (err.status === 400) {
          setErrors({ general: "Liên kết đã hết hạn. Vui lòng yêu cầu lại." });
        } else {
          setErrors({ general: err.message });
        }
      } else {
        setErrors({ general: "Không thể kết nối server" });
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="text-center max-w-sm page-enter">
        <div
          className="w-12 h-12 rounded-[12px] flex items-center justify-center mx-auto mb-4"
          style={{ background: "var(--success-bg)", color: "var(--success)" }}
        >
          <CheckCircle size={32} weight="duotone" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Đặt lại thành công!</h2>
        <p className="text-[14px] mb-6" style={{ color: "var(--fg-tertiary)" }}>
          Mật khẩu đã được thay đổi. Bạn có thể đăng nhập bằng mật khẩu mới.
        </p>
        <Button
          variant="primary"
          onClick={() => router.push("/login")}
          iconRight={<ArrowRight size={16} />}
        >
          Đăng nhập ngay
        </Button>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="text-center max-w-sm">
        <h2 className="text-xl font-semibold mb-2">Liên kết không hợp lệ</h2>
        <p className="text-[14px] mb-6" style={{ color: "var(--fg-tertiary)" }}>
          Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.
        </p>
        <Link href="/forgot-password">
          <Button variant="secondary">Yêu cầu liên kết mới</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <div className="flex items-center gap-3 mb-8">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
        >
          <GraduationCap size={20} weight="bold" />
        </div>
        <span className="text-lg font-semibold tracking-tight">
          NovaThesis
        </span>
      </div>

      <h2 className="text-xl font-semibold tracking-tight mb-1">
        Đặt lại mật khẩu
      </h2>
      <p className="text-[14px] mb-6" style={{ color: "var(--fg-tertiary)" }}>
        Nhập mật khẩu mới cho tài khoản của bạn
      </p>

      {errors.general && (
        <div
          className="flex items-center gap-2 px-3 py-2.5 rounded-lg mb-4 text-[13px]"
          style={{
            background: "var(--danger-bg)",
            border: "1px solid rgba(248,113,113,0.2)",
            color: "var(--danger)",
          }}
        >
          {errors.general}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="relative">
          <Input
            label="Mật khẩu mới"
            type={showPassword ? "text" : "password"}
            placeholder="Tối thiểu 8 ký tự"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            icon={<Lock size={15} />}
            autoComplete="new-password"
            helperText="Gồm chữ hoa, chữ thường và số"
            autoFocus
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-[34px] p-1"
            style={{ color: "var(--fg-muted)", background: "none", border: "none", cursor: "pointer" }}
            tabIndex={-1}
          >
            {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
          </button>
        </div>

        <Input
          label="Xác nhận mật khẩu"
          type="password"
          placeholder="Nhập lại mật khẩu mới"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={errors.confirm}
          icon={<Lock size={15} />}
          autoComplete="new-password"
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={loading}
          className="w-full mt-1"
        >
          Đặt lại mật khẩu
        </Button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div
      className="min-h-dvh flex items-center justify-center p-6"
      style={{ background: "var(--bg-primary)" }}
    >
      <Suspense fallback={<div className="text-[14px] text-tertiary">Đang tải...</div>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}

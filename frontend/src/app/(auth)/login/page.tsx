"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  GraduationCap,
  EnvelopeSimple,
  Lock,
  Eye,
  EyeSlash,
  ArrowRight,
} from "@phosphor-icons/react";
import { Button, Input } from "@/components/ui";
import { useAuthStore } from "@/lib/auth";
import { isApiError } from "@/lib/api";

/* ========================================
   INPUT VALIDATION
   ======================================== */

function validateEmail(email: string): string | null {
  if (!email.trim()) return "Vui lòng nhập email";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Email không hợp lệ";
  return null;
}

function validatePassword(password: string): string | null {
  if (!password) return "Vui lòng nhập mật khẩu";
  if (password.length < 6) return "Mật khẩu tối thiểu 6 ký tự";
  return null;
}

/* ========================================
   LOGIN PAGE
   ======================================== */

export default function LoginPage() {
  const router = useRouter();
  const { login, loading } = useAuthStore();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [errors, setErrors] = React.useState<{ email?: string; password?: string; general?: string }>({});
  const [attempts, setAttempts] = React.useState(0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side validation
    const emailErr = validateEmail(email);
    const passErr = validatePassword(password);

    if (emailErr || passErr) {
      setErrors({ email: emailErr || undefined, password: passErr || undefined });
      return;
    }

    setErrors({});

    // Rate limit check (UC 1.1: 5 attempts max)
    if (attempts >= 5) {
      setErrors({
        general: "Bạn đã nhập sai quá 5 lần. Vui lòng thử lại sau 15 phút.",
      });
      return;
    }

    try {
      await login({ email, password });
      window.location.href = "/dashboard";
    } catch (error) {
      setAttempts((prev) => prev + 1);
      if (isApiError(error)) {
        if (error.status === 401) {
          setErrors({ general: "Email hoặc mật khẩu không chính xác" });
        } else if (error.status === 403) {
          setErrors({ general: "Tài khoản đã bị khóa. Liên hệ quản trị viên." });
        } else {
          setErrors({ general: error.message });
        }
      } else {
        setErrors({ general: "Không thể kết nối đến server. Vui lòng thử lại." });
      }
    }
  };

  return (
    <div
      className="min-h-screen flex"
      style={{ background: "var(--bg-primary)" }}
    >
      {/* Left: Branding panel */}
      <div
        className="hidden lg:flex lg:w-[45%] flex-col justify-between p-10 relative overflow-hidden"
        style={{
          background: "var(--bg-secondary)",
          borderRight: "1px solid var(--border-primary)",
        }}
      >
        {/* Subtle gradient accent */}
        <div
          className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full opacity-[0.03] blur-3xl"
          style={{ background: "var(--accent)" }}
        />
        <div
          className="absolute -bottom-24 -right-24 w-[400px] h-[400px] rounded-full opacity-[0.02] blur-3xl"
          style={{ background: "var(--accent)" }}
        />

        {/* Logo */}
        <div className="flex items-center gap-3 relative z-10">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: "var(--accent)",
              color: "var(--accent-fg)",
            }}
          >
            <GraduationCap size={22} weight="bold" />
          </div>
          <span className="text-xl font-semibold tracking-tight">
            NovaThesis
          </span>
        </div>

        {/* Tagline */}
        <div className="relative z-10 max-w-md">
          <h1
            className="text-3xl font-semibold tracking-tight leading-snug mb-4"
            style={{ color: "var(--fg-primary)" }}
          >
            Quản lý luận văn
            <br />
            <span style={{ color: "var(--accent)" }}>thông minh</span> cùng AI
          </h1>
          <p
            className="text-[15px] leading-relaxed"
            style={{ color: "var(--fg-tertiary)" }}
          >
            Hệ thống hỗ trợ sinh viên và giảng viên theo dõi tiến độ nghiên cứu,
            quản lý tài liệu, và tận dụng AI để nâng cao chất lượng luận văn.
          </p>
        </div>

        {/* Footer stats */}
        <div className="relative z-10 flex items-center gap-8">
          {[
            { value: "92", label: "Use Cases" },
            { value: "AI", label: "RAG Powered" },
            { value: "Real-time", label: "Sync" },
          ].map((item) => (
            <div key={item.label}>
              <p
                className="text-lg font-semibold font-mono"
                style={{ color: "var(--accent)" }}
              >
                {item.value}
              </p>
              <p
                className="text-[11px] uppercase tracking-wider"
                style={{ color: "var(--fg-muted)" }}
              >
                {item.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Login form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{
                background: "var(--accent)",
                color: "var(--accent-fg)",
              }}
            >
              <GraduationCap size={20} weight="bold" />
            </div>
            <span className="text-lg font-semibold tracking-tight">
              NovaThesis
            </span>
          </div>

          <h2 className="text-xl font-semibold tracking-tight mb-1">
            Đăng nhập
          </h2>
          <p
            className="text-[14px] mb-6"
            style={{ color: "var(--fg-tertiary)" }}
          >
            Nhập thông tin tài khoản để tiếp tục
          </p>

          {/* General error */}
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
            <Input
              label="Email"
              type="email"
              placeholder="your@email.edu.vn"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={errors.email}
              icon={<EnvelopeSimple size={18} />}
              autoComplete="email"
              autoFocus
            />

            <div className="relative">
              <Input
                label="Mật khẩu"
                type={showPassword ? "text" : "password"}
                placeholder="Nhập mật khẩu"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={errors.password}
                icon={<Lock size={18} />}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-[34px] p-1"
                style={{
                  color: "var(--fg-muted)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
                tabIndex={-1}
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <div className="flex items-center justify-end">
              <Link
                href="/forgot-password"
                className="text-[13px] transition-colors"
                style={{ color: "var(--accent)" }}
              >
                Quên mật khẩu?
              </Link>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              className="w-full mt-1"
              iconRight={!loading ? <ArrowRight size={18} /> : undefined}
            >
              Đăng nhập
            </Button>
          </form>

          <p
            className="text-[13px] text-center mt-6"
            style={{ color: "var(--fg-tertiary)" }}
          >
            Chưa có tài khoản?{" "}
            <Link
              href="/register"
              className="font-medium transition-colors"
              style={{ color: "var(--accent)" }}
            >
              Đăng ký ngay
            </Link>
          </p>

          {/* Rate limit indicator */}
          {attempts > 0 && attempts < 5 && (
            <p
              className="text-[11px] text-center mt-3"
              style={{ color: "var(--fg-muted)" }}
            >
              {5 - attempts} lần thử còn lại
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

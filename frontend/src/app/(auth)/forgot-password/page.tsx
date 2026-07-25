"use client";

import React from "react";
import Link from "next/link";
import {
  GraduationCap,
  EnvelopeSimple,
  ArrowLeft,
  PaperPlaneTilt,
} from "@phosphor-icons/react";
import { Button, Input } from "@/components/ui";
import { api, isApiError } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Vui lòng nhập email");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Email không hợp lệ");
      return;
    }

    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch (err) {
      if (isApiError(err)) {
        setError(err.message);
      } else {
        setError("Không thể kết nối server");
      }
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div
        className="min-h-dvh flex items-center justify-center p-6"
        style={{ background: "var(--bg-primary)" }}
      >
        <div className="text-center max-w-sm page-enter">
          <div
            className="w-12 h-12 rounded-[12px] flex items-center justify-center mx-auto mb-4"
            style={{
              background: "var(--info-bg)",
              color: "var(--info)",
            }}
          >
            <PaperPlaneTilt size={32} weight="duotone" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Kiểm tra email</h2>
          <p
            className="text-[14px] mb-6"
            style={{ color: "var(--fg-tertiary)" }}
          >
            Nếu tài khoản với email{" "}
            <span className="font-medium" style={{ color: "var(--fg-primary)" }}>
              {email}
            </span>{" "}
            tồn tại, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu.
          </p>
          <Link href="/login">
            <Button
              variant="secondary"
              icon={<ArrowLeft size={16} />}
            >
              Quay lại đăng nhập
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-dvh flex items-center justify-center p-6"
      style={{ background: "var(--bg-primary)" }}
    >
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8">
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
          Quên mật khẩu
        </h2>
        <p
          className="text-[14px] mb-6"
          style={{ color: "var(--fg-tertiary)" }}
        >
          Nhập email đã đăng ký để nhận liên kết đặt lại mật khẩu
        </p>

        {error && (
          <div
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg mb-4 text-[13px]"
            style={{
              background: "var(--danger-bg)",
              border: "1px solid rgba(248,113,113,0.2)",
              color: "var(--danger)",
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Email"
            type="email"
            placeholder="your@email.edu.vn"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            icon={<EnvelopeSimple size={15} />}
            autoComplete="email"
            autoFocus
          />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={loading}
            className="w-full"
          >
            Gửi liên kết đặt lại
          </Button>
        </form>

        <p className="text-center mt-6">
          <Link
            href="/login"
            className="text-[13px] inline-flex items-center gap-1 transition-colors"
            style={{ color: "var(--fg-tertiary)" }}
          >
            <ArrowLeft size={14} />
            Quay lại đăng nhập
          </Link>
        </p>
      </div>
    </div>
  );
}

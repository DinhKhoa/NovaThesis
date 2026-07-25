"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  GraduationCap,
  CheckCircle,
  XCircle,
  Clock,
  ArrowRight,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui";
import { api, isApiError } from "@/lib/api";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = React.useState<"loading" | "success" | "expired" | "error">("loading");
  const [errorMessage, setErrorMessage] = React.useState("");

  React.useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMessage("Mã xác minh không hợp lệ.");
      return;
    }

    const verify = async () => {
      try {
        await api.post("/auth/verify-email", { token });
        setStatus("success");
      } catch (err) {
        if (isApiError(err)) {
          if (err.status === 400 || err.status === 410) {
            setStatus("expired");
          } else {
            setStatus("error");
            setErrorMessage(err.message);
          }
        } else {
          setStatus("error");
          setErrorMessage("Không thể kết nối máy chủ");
        }
      }
    };

    verify();
  }, [token]);

  return (
    <div className="w-full max-w-sm text-center page-enter">
      <div className="flex items-center justify-center gap-3 mb-8">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
        >
          <GraduationCap size={22} weight="bold" />
        </div>
        <span className="text-xl font-semibold tracking-tight">
          NovaThesis
        </span>
      </div>

      {status === "loading" && (
        <div className="flex flex-col items-center gap-3">
          <svg
            className="animate-spin"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="var(--fg-muted)"
              strokeWidth="3"
              strokeDasharray="60 30"
              strokeLinecap="round"
            />
          </svg>
          <p className="text-[14px]" style={{ color: "var(--fg-secondary)" }}>
            Đang xác minh email của bạn...
          </p>
        </div>
      )}

      {status === "success" && (
        <div>
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: "var(--success-bg)", color: "var(--success)" }}
          >
            <CheckCircle size={32} weight="duotone" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Xác minh thành công!</h2>
          <p className="text-[14px] mb-6" style={{ color: "var(--fg-tertiary)" }}>
            Tài khoản của bạn đã được kích hoạt. Vui lòng đăng nhập để tiếp tục.
          </p>
          <Link href="/login">
            <Button variant="primary" iconRight={<ArrowRight size={16} />}>
              Đăng nhập ngay
            </Button>
          </Link>
        </div>
      )}

      {status === "expired" && (
        <div>
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: "var(--warning-bg)", color: "var(--warning)" }}
          >
            <Clock size={32} weight="duotone" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Liên kết đã hết hạn</h2>
          <p className="text-[14px] mb-6" style={{ color: "var(--fg-tertiary)" }}>
            Mã xác minh email đã hết hạn. Bạn có thể yêu cầu gửi lại liên kết mới.
          </p>
          <Link href="/login">
            <Button variant="secondary">Quay lại đăng nhập</Button>
          </Link>
        </div>
      )}

      {status === "error" && (
        <div>
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: "var(--danger-bg)", color: "var(--danger)" }}
          >
            <XCircle size={32} weight="duotone" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Xác minh thất bại</h2>
          <p className="text-[14px] mb-6" style={{ color: "var(--fg-tertiary)" }}>
            {errorMessage || "Có lỗi xảy ra trong quá trình xác minh."}
          </p>
          <Link href="/login">
            <Button variant="secondary">Quay lại đăng nhập</Button>
          </Link>
        </div>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: "var(--bg-primary)" }}
    >
      <Suspense fallback={<div className="text-[14px] text-tertiary">Đang xác minh...</div>}>
        <VerifyEmailContent />
      </Suspense>
    </div>
  );
}

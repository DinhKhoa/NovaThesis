"use client";

import React from "react";
import { Sidebar, Topbar } from "@/components/layout";
import { ToastContainer } from "@/components/ui";
import { useAuthStore } from "@/lib/auth";
import { useToastStore } from "@/lib/toast";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, initialized, initialize } = useAuthStore();
  const { toasts, dismissToast } = useToastStore();

  React.useEffect(() => {
    initialize();
  }, [initialize]);

  if (!initialized) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]"
      >
        <div className="flex flex-col items-center gap-3">
          <svg
            className="animate-spin text-[var(--accent)]"
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
              strokeDasharray="60 30"
              strokeLinecap="round"
            />
          </svg>
          <span
            className="text-[13px] font-mono text-zinc-500 uppercase tracking-widest"
          >
            Initializing High-End Environment...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-[var(--bg-primary)]">
      <Sidebar />

      <div className="flex-1 flex flex-col transition-all duration-300 ml-[17rem]">
        <Topbar />

        <main className="flex-1 px-8 pb-12">
          <div className="mx-auto page-enter max-w-7xl">
            {children}
          </div>
        </main>
      </div>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

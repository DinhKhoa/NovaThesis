"use client";

import React, { ViewTransition } from "react";
import { Sidebar, Topbar } from "@/components/layout";
import { Spinner, ToastContainer, useStoredFlag } from "@/components/ui";
import { useAuthStore } from "@/lib/auth";
import { useToastStore } from "@/lib/toast";

const COLLAPSE_KEY = "nova.sidebar.collapsed";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { initialized, initialize } = useAuthStore();
  const { toasts, dismissToast } = useToastStore();

  // Resolves to the stored preference only after hydration, so the server and
  // first client render agree on the sidebar width.
  const [collapsed, setCollapsed] = useStoredFlag(COLLAPSE_KEY);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    initialize();
  }, [initialize]);

  const toggleCollapsed = React.useCallback(
    () => setCollapsed(!collapsed),
    [collapsed, setCollapsed]
  );

  if (!initialized) {
    return (
      <div className="min-h-dvh flex items-center justify-center surface-canvas">
        <span className="flex items-center gap-2 text-[13px] text-tertiary">
          <Spinner size={16} />
          Đang tải…
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-dvh surface-canvas">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      {/* The sidebar is fixed, so the content column carries a matching inset.
          Only applied from `lg` up — below that the sidebar is a drawer. */}
      <div
        className={`flex flex-col min-h-dvh transition-[padding-left] duration-200 ${
          collapsed
            ? "lg:pl-[var(--sidebar-width-collapsed)]"
            : "lg:pl-[var(--sidebar-width)]"
        }`}
      >
        <Topbar onOpenMobileNav={() => setMobileOpen(true)} />

        <main className="flex-1 min-w-0 p-3 sm:p-4 lg:p-5">
          {/*
            Only the page body transitions. The sidebar and topbar are anchored
            with their own view-transition-names (see `components/layout`), so
            the chrome stays put and the user keeps a fixed spatial reference
            while the content underneath it swaps.

            `page-enter` is gone from here: it fired once on layout mount and
            never again, because the layout persists across navigations. The
            transition below is the thing that actually runs on every route
            change.
          */}
          <ViewTransition default="page">
            <div className="mx-auto max-w-[1400px]">{children}</div>
          </ViewTransition>
        </main>
      </div>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

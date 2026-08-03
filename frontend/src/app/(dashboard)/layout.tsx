"use client";

import React, { ViewTransition } from "react";
import { AIChatDrawer, Sidebar, Topbar } from "@/components/layout";
import { ToastContainer, useStoredFlag } from "@/components/ui";
import { RequireAuth } from "@/lib/guards";
import { useToastStore } from "@/lib/toast";

const COLLAPSE_KEY = "nova_sidebar_collapsed";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { toasts, dismissToast } = useToastStore();

  return (
    <>
      {/*
        `RequireAuth` gánh cả việc gọi `initialize()` lẫn việc chặn khi chưa
        đăng nhập, nên layout không còn tự làm hai việc đó nữa. Quan trọng hơn:
        khi chưa xác thực xong, `children` KHÔNG được render — trước đây phần
        khung vẫn dựng lên và các trang con vẫn kịp gọi API.
      */}
      <RequireAuth>
        <DashboardShell>{children}</DashboardShell>
      </RequireAuth>

      {/* Nằm ngoài hàng rào: thông báo "không có quyền truy cập" do
          `RequireRole` phát ra phải hiện được ngay cả khi nội dung bị chặn. */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  // Resolves to the stored preference only after hydration, so the server and
  // first client render agree on the sidebar width.
  const [collapsed, setCollapsed] = useStoredFlag(COLLAPSE_KEY);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const toggleCollapsed = React.useCallback(
    () => setCollapsed(!collapsed),
    [collapsed, setCollapsed]
  );

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

      {/*
        Ngăn kéo trợ lý AI. Gắn ở đây để nó sống sót qua mọi lần chuyển trang —
        đặt trong từng trang thì cuộc trò chuyện đang dở sẽ mất mỗi lần người
        dùng đi mở tài liệu để đối chiếu.

        Không có state hay effect nào thêm vào layout: ngăn kéo tự đọc
        `useAIPanelStore` và tự bắt phím tắt Ctrl+J.
      */}
      <AIChatDrawer />
    </div>
  );
}

"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House,
  GraduationCap,
  Kanban,
  Files,
  Robot,
  ChatCircleDots,
  Bell,
  Gear,
  ChartBar,
  Users,
  CaretLeft,
  CaretRight,
  SignOut,
  Notebook,
  ClipboardText,
  Sparkle,
} from "@phosphor-icons/react";
import { useAuthStore } from "@/lib/auth";
import { Avatar, Dropdown, DropdownItem, DropdownSeparator } from "@/components/ui";

/* ========================================
   NAVIGATION ITEMS
   ======================================== */

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  roles?: ("ADMIN" | "LECTURER" | "STUDENT")[];
}

const navItems: NavItem[] = [
  { label: "Tổng quan", href: "/dashboard", icon: <House size={18} weight="duotone" /> },
  {
    label: "Đề tài",
    href: "/theses",
    icon: <GraduationCap size={18} weight="duotone" />,
    roles: ["STUDENT", "LECTURER"],
  },
  {
    label: "Tiến độ",
    href: "/milestones",
    icon: <Kanban size={18} weight="duotone" />,
    roles: ["STUDENT", "LECTURER"],
  },
  {
    label: "Tài liệu",
    href: "/documents",
    icon: <Files size={18} weight="duotone" />,
    roles: ["STUDENT", "LECTURER"],
  },
  {
    label: "Trợ lý AI",
    href: "/ai-chat",
    icon: <Robot size={18} weight="duotone" />,
    roles: ["STUDENT", "LECTURER"],
  },
  {
    label: "Phản hồi",
    href: "/feedbacks",
    icon: <ChatCircleDots size={18} weight="duotone" />,
    roles: ["STUDENT", "LECTURER"],
  },
  {
    label: "Thông báo",
    href: "/notifications",
    icon: <Bell size={18} weight="duotone" />,
  },
  {
    label: "Báo cáo",
    href: "/reports",
    icon: <ClipboardText size={18} weight="duotone" />,
  },
  // Admin-only
  {
    label: "Quản lý Users",
    href: "/admin/users",
    icon: <Users size={18} weight="duotone" />,
    roles: ["ADMIN"],
  },
  {
    label: "Nhật ký Logs",
    href: "/admin/logs",
    icon: <Notebook size={18} weight="duotone" />,
    roles: ["ADMIN"],
  },
  {
    label: "Thống kê System",
    href: "/admin/statistics",
    icon: <ChartBar size={18} weight="duotone" />,
    roles: ["ADMIN"],
  },
  {
    label: "Cấu hình",
    href: "/admin/settings",
    icon: <Gear size={18} weight="duotone" />,
    roles: ["ADMIN"],
  },
];

/* ========================================
   SIDEBAR COMPONENT (HIGH-END FLOATING GLASS)
   ======================================== */

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const [collapsed, setCollapsed] = React.useState(false);

  const filteredItems = navItems.filter((item) => {
    if (!item.roles) return true;
    if (!user) return true;
    return item.roles.includes(user.role);
  });

  return (
    <aside
      className="fixed left-4 top-4 bottom-4 flex flex-col z-40 transition-all duration-400 double-bezel-shell"
      style={{
        width: collapsed ? "4.5rem" : "15.5rem",
      }}
    >
      <div className="double-bezel-core flex flex-col h-full p-2 overflow-hidden bg-[var(--bg-secondary)]/90 backdrop-blur-3xl">
        {/* Logo */}
        <div className="flex items-center gap-3 h-14 px-3 flex-shrink-0 border-b border-white/10 mb-2">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-[var(--accent)]/20"
            style={{
              background: "var(--accent)",
              color: "var(--accent-fg)",
            }}
          >
            <GraduationCap size={20} weight="bold" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="font-semibold text-[15px] tracking-tight text-white flex items-center gap-1.5">
                NovaThesis
                <Sparkle size={12} weight="fill" className="text-[var(--accent)]" />
              </span>
              <span className="text-[10px] uppercase tracking-widest text-[var(--accent)]/80 font-mono">
                Academic AI
              </span>
            </div>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto py-2 px-1">
          <div className="flex flex-col gap-1">
            {filteredItems.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + "/");

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all group relative ${
                    collapsed ? "justify-center" : ""
                  }`}
                  style={{
                    background: isActive
                      ? "rgba(52, 211, 153, 0.12)"
                      : "transparent",
                    color: isActive ? "#34d399" : "var(--fg-secondary)",
                    border: isActive ? "1px solid rgba(52, 211, 153, 0.2)" : "1px solid transparent",
                  }}
                >
                  <span className="flex-shrink-0 transition-transform group-hover:scale-110">{item.icon}</span>
                  {!collapsed && <span>{item.label}</span>}

                  {collapsed && (
                    <span
                      className="absolute left-full ml-3 px-3 py-1.5 text-[12px] font-medium rounded-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 bg-[#121215] border border-white/10 shadow-2xl text-white"
                    >
                      {item.label}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Collapse toggle button */}
        <div className="px-1 py-1">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-[12px] text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
            aria-label={collapsed ? "Mở rộng" : "Thu gọn"}
          >
            {collapsed ? (
              <CaretRight size={16} />
            ) : (
              <>
                <CaretLeft size={14} />
                <span>Thu gọn Menu</span>
              </>
            )}
          </button>
        </div>

        {/* User profile dropdown */}
        <div className="flex-shrink-0 pt-2 border-t border-white/10">
          <Dropdown
            align="left"
            trigger={
              <button
                className={`w-full flex items-center gap-3 p-2 rounded-xl transition-all hover:bg-white/5 ${
                  collapsed ? "justify-center" : ""
                }`}
              >
                <Avatar
                  name={user?.full_name || "Admin Nova"}
                  src={user?.avatar_url}
                  size="sm"
                />
                {!collapsed && (
                  <div className="flex flex-col items-start overflow-hidden text-left">
                    <span className="text-[13px] font-medium truncate w-full text-white">
                      {user?.full_name || "Admin Nova"}
                    </span>
                    <span className="text-[10px] font-mono truncate w-full text-zinc-500">
                      {user?.role || "ADMIN"}
                    </span>
                  </div>
                )}
              </button>
            }
          >
            <DropdownItem
              onClick={() => {
                window.location.href = "/profile";
              }}
              icon={<Gear size={16} />}
            >
              Hồ sơ cá nhân
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem onClick={logout} danger icon={<SignOut size={16} />}>
              Đăng xuất
            </DropdownItem>
          </Dropdown>
        </div>
      </div>
    </aside>
  );
}

/* ========================================
   TOPBAR COMPONENT (HIGH-END FLOATING ISLAND)
   ======================================== */

export function Topbar() {
  const { user } = useAuthStore();

  return (
    <header className="sticky top-4 z-30 mx-6 mb-6">
      <div className="nav-floating-island flex items-center justify-between px-6 py-3 border border-white/10 shadow-2xl">
        <div id="topbar-title" className="text-sm font-medium tracking-tight text-white" />

        <div className="flex items-center gap-4">
          <Link
            href="/notifications"
            className="relative p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-all"
            aria-label="Thông báo"
          >
            <Bell size={18} />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
          </Link>

          <Link href="/profile" className="flex items-center gap-2.5 pl-2 border-l border-white/10">
            <span className="text-[13px] font-medium text-zinc-300 hidden md:block">
              {user?.full_name || "Admin Nova"}
            </span>
            <Avatar name={user?.full_name || "Admin Nova"} src={user?.avatar_url} size="sm" />
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ========================================
   PAGE HEADER COMPONENT
   ======================================== */

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20 mb-2">
          <Sparkle size={12} weight="fill" /> NovaThesis Intelligence Platform
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
        {description && (
          <p className="text-[13px] mt-1 text-zinc-400">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-3 flex-shrink-0">{actions}</div>}
    </div>
  );
}

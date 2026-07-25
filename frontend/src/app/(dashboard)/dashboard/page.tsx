"use client";

import React from "react";
import {
  GraduationCap,
  Kanban,
  Files,
  Clock,
  TrendUp,
  Warning,
  CheckCircle,
  ArrowRight,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/layout";
import { Card, Badge, Button } from "@/components/ui";
import { useAuthStore } from "@/lib/auth";

/* ========================================
   MOCK DATA (will be replaced by API calls)
   ======================================== */

const statsCards = [
  {
    label: "Đề tài đang thực hiện",
    value: "1",
    icon: <GraduationCap size={20} weight="duotone" />,
    color: "var(--accent)",
    bg: "var(--accent-subtle)",
  },
  {
    label: "Milestone hoàn thành",
    value: "4/12",
    icon: <CheckCircle size={20} weight="duotone" />,
    color: "var(--success)",
    bg: "var(--success-bg)",
  },
  {
    label: "Tài liệu đã tải lên",
    value: "8",
    icon: <Files size={20} weight="duotone" />,
    color: "var(--info)",
    bg: "var(--info-bg)",
  },
  {
    label: "Sắp đến hạn",
    value: "2",
    icon: <Warning size={20} weight="duotone" />,
    color: "var(--warning)",
    bg: "var(--warning-bg)",
  },
];

const upcomingMilestones = [
  {
    id: 1,
    name: "Nộp báo cáo đề cương",
    deadline: "2026-07-25",
    status: "ONGOING",
    thesis: "Hệ thống quản lý luận văn tích hợp AI",
  },
  {
    id: 2,
    name: "Hoàn thiện ERD & Database",
    deadline: "2026-07-28",
    status: "NOT_STARTED",
    thesis: "Hệ thống quản lý luận văn tích hợp AI",
  },
  {
    id: 3,
    name: "Demo prototype UI",
    deadline: "2026-08-01",
    status: "ONGOING",
    thesis: "Hệ thống quản lý luận văn tích hợp AI",
  },
];

const recentActivities = [
  {
    id: 1,
    action: "đã cập nhật trạng thái milestone",
    target: "Nộp báo cáo đề cương",
    time: "2 giờ trước",
    actor: "Bạn",
  },
  {
    id: 2,
    action: "đã tải lên tài liệu",
    target: "tham_khao_AI_RAG.pdf",
    time: "5 giờ trước",
    actor: "Bạn",
  },
  {
    id: 3,
    action: "đã phản hồi milestone",
    target: "Thiết kế database",
    time: "1 ngày trước",
    actor: "TS. Nguyễn Văn A",
  },
  {
    id: 4,
    action: "đã phê duyệt đề tài",
    target: "Hệ thống quản lý luận văn tích hợp AI",
    time: "3 ngày trước",
    actor: "TS. Nguyễn Văn A",
  },
];

const statusMap: Record<string, { label: string; variant: "success" | "warning" | "danger" | "info" | "neutral" }> = {
  COMPLETED: { label: "Hoàn thành", variant: "success" },
  ONGOING: { label: "Đang làm", variant: "info" },
  NOT_STARTED: { label: "Chưa bắt đầu", variant: "neutral" },
  PENDING_APPROVAL: { label: "Chờ duyệt", variant: "warning" },
  REVISION_REQUIRED: { label: "Cần sửa", variant: "danger" },
};

/* ========================================
   PROGRESS BAR COMPONENT
   ======================================== */

function ProgressBar({ value, max }: { value: number; max: number }) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex-1 h-2 rounded-full overflow-hidden"
        style={{ background: "var(--bg-hover)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${percent}%`,
            background:
              percent === 100
                ? "var(--success)"
                : percent >= 60
                  ? "var(--accent)"
                  : percent >= 30
                    ? "var(--warning)"
                    : "var(--danger)",
          }}
        />
      </div>
      <span
        className="text-[12px] font-mono font-medium min-w-[36px] text-right"
        style={{ color: "var(--fg-secondary)" }}
      >
        {percent}%
      </span>
    </div>
  );
}

/* ========================================
   DASHBOARD PAGE
   ======================================== */

export default function DashboardPage() {
  const { user } = useAuthStore();

  const greeting = React.useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Chào buổi sáng";
    if (hour < 18) return "Chào buổi chiều";
    return "Chào buổi tối";
  }, []);

  return (
    <div>
      <PageHeader
        title={`${greeting}, ${user?.full_name || "bạn"}`}
        description="Tổng quan tiến độ luận văn và hoạt động gần đây."
      />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statsCards.map((stat) => (
          <Card key={stat.label} className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span
                className="text-[12px] font-medium uppercase tracking-wide"
                style={{ color: "var(--fg-tertiary)" }}
              >
                {stat.label}
              </span>
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: stat.bg, color: stat.color }}
              >
                {stat.icon}
              </div>
            </div>
            <p className="text-2xl font-semibold tracking-tight">
              {stat.value}
            </p>
          </Card>
        ))}
      </div>

      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Progress & Milestones */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Thesis Progress Card */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TrendUp
                  size={18}
                  weight="duotone"
                  style={{ color: "var(--accent)" }}
                />
                <h2 className="text-[15px] font-semibold">
                  Tiến độ đề tài
                </h2>
              </div>
              <Badge variant="info" dot>
                Đang thực hiện
              </Badge>
            </div>
            <p
              className="text-[13px] mb-3"
              style={{ color: "var(--fg-secondary)" }}
            >
              Hệ thống quản lý luận văn tích hợp AI
            </p>
            <ProgressBar value={4} max={12} />
          </Card>

          {/* Upcoming Milestones */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Kanban
                  size={18}
                  weight="duotone"
                  style={{ color: "var(--accent)" }}
                />
                <h2 className="text-[15px] font-semibold">
                  Milestone sắp đến hạn
                </h2>
              </div>
              <Button variant="ghost" size="sm" iconRight={<ArrowRight size={14} />}>
                Xem tất cả
              </Button>
            </div>

            <div className="flex flex-col">
              {upcomingMilestones.map((ms, i) => {
                const statusInfo = statusMap[ms.status] || statusMap.NOT_STARTED;
                const deadline = new Date(ms.deadline);
                const daysLeft = Math.ceil(
                  (deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                );

                return (
                  <div
                    key={ms.id}
                    className="flex items-center justify-between py-3 group cursor-pointer"
                    style={{
                      borderBottom:
                        i < upcomingMilestones.length - 1
                          ? "1px solid var(--border-secondary)"
                          : "none",
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium truncate group-hover:text-[var(--accent)] transition-colors">
                        {ms.name}
                      </p>
                      <div
                        className="flex items-center gap-2 mt-1 text-[12px]"
                        style={{ color: "var(--fg-tertiary)" }}
                      >
                        <Clock size={12} />
                        <span>
                          {daysLeft > 0
                            ? `Còn ${daysLeft} ngày`
                            : daysLeft === 0
                              ? "Hôm nay"
                              : `Trễ ${Math.abs(daysLeft)} ngày`}
                        </span>
                      </div>
                    </div>
                    <Badge variant={statusInfo.variant}>
                      {statusInfo.label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Right: Activity Feed */}
        <div className="lg:col-span-1">
          <Card className="p-5">
            <h2 className="text-[15px] font-semibold mb-4">
              Hoạt động gần đây
            </h2>

            <div className="flex flex-col">
              {recentActivities.map((activity, i) => (
                <div
                  key={activity.id}
                  className="flex gap-3 py-3"
                  style={{
                    borderBottom:
                      i < recentActivities.length - 1
                        ? "1px solid var(--border-secondary)"
                        : "none",
                  }}
                >
                  {/* Timeline dot */}
                  <div className="flex flex-col items-center flex-shrink-0 pt-1">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ background: "var(--accent)" }}
                    />
                    {i < recentActivities.length - 1 && (
                      <div
                        className="w-px flex-1 mt-1"
                        style={{ background: "var(--border-primary)" }}
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-snug">
                      <span className="font-medium">{activity.actor}</span>{" "}
                      <span style={{ color: "var(--fg-secondary)" }}>
                        {activity.action}
                      </span>{" "}
                      <span
                        className="font-medium"
                        style={{ color: "var(--accent)" }}
                      >
                        {activity.target}
                      </span>
                    </p>
                    <span
                      className="text-[11px] mt-0.5 block"
                      style={{ color: "var(--fg-muted)" }}
                    >
                      {activity.time}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

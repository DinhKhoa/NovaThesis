"use client";

import React from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle,
  Clock,
  FileArrowUp,
  Files,
  GraduationCap,
  Kanban,
  Robot,
  Warning,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/layout";
import {
  Badge,
  Button,
  Panel,
  ProgressBar,
  StatTile,
  EmptyState,
  useMounted,
} from "@/components/ui";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth";

/* ==========================================================================
   MOCK DATA (replaced by API calls)
   ========================================================================== */

const thesis = {
  id: 1,
  title: "Hệ thống quản lý luận văn tích hợp AI",
  supervisor: "TS. Nguyễn Văn A",
  status: "ONGOING" as const,
  milestonesDone: 4,
  milestonesTotal: 12,
  documents: 8,
};

const upcomingMilestones = [
  { id: 1, name: "Nộp báo cáo đề cương", deadline: "2026-07-25", status: "ONGOING" },
  { id: 2, name: "Hoàn thiện ERD & cơ sở dữ liệu", deadline: "2026-07-28", status: "NOT_STARTED" },
  { id: 3, name: "Demo bản mẫu giao diện", deadline: "2026-08-01", status: "ONGOING" },
  { id: 4, name: "Nộp bản thảo chương 1–2", deadline: "2026-07-20", status: "REVISION_REQUIRED" },
];

const recentActivities = [
  { id: 1, actor: "Bạn", action: "đã cập nhật mốc", target: "Nộp báo cáo đề cương", time: "2 giờ trước" },
  { id: 2, actor: "Bạn", action: "đã tải lên", target: "tham_khao_AI_RAG.pdf", time: "5 giờ trước" },
  { id: 3, actor: "TS. Nguyễn Văn A", action: "đã phản hồi mốc", target: "Thiết kế cơ sở dữ liệu", time: "1 ngày trước" },
  { id: 4, actor: "TS. Nguyễn Văn A", action: "đã phê duyệt đề tài", target: thesis.title, time: "3 ngày trước" },
];

type MilestoneStatus =
  | "COMPLETED"
  | "ONGOING"
  | "NOT_STARTED"
  | "PENDING_APPROVAL"
  | "REVISION_REQUIRED";

const STATUS: Record<
  MilestoneStatus,
  { label: string; variant: "success" | "warning" | "danger" | "info" | "neutral" }
> = {
  COMPLETED: { label: "Hoàn thành", variant: "success" },
  ONGOING: { label: "Đang làm", variant: "info" },
  NOT_STARTED: { label: "Chưa bắt đầu", variant: "neutral" },
  PENDING_APPROVAL: { label: "Chờ duyệt", variant: "warning" },
  REVISION_REQUIRED: { label: "Cần sửa", variant: "danger" },
};

/* Days are computed against local midnight so "hôm nay" doesn't flip at an
   arbitrary hour depending on when the deadline was recorded. */
function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function DeadlineLabel({ days }: { days: number }) {
  if (days < 0)
    return (
      <span className="text-danger font-medium">Trễ {Math.abs(days)} ngày</span>
    );
  if (days === 0) return <span className="text-danger font-medium">Hôm nay</span>;
  if (days <= 3) return <span className="text-warning font-medium">Còn {days} ngày</span>;
  return <span className="text-tertiary">Còn {days} ngày</span>;
}

/* ==========================================================================
   PAGE
   ========================================================================== */

export default function DashboardPage() {
  const { user } = useAuthStore();
  const router = useRouter();

  /* Resolved only after hydration: the server's clock and the student's
     clock disagree, and a time-of-day greeting rendered on the server would
     mismatch at the boundary hours. */
  const mounted = useMounted();
  const greeting = React.useMemo(() => {
    if (!mounted) return "Xin chào";
    const h = new Date().getHours();
    return h < 12
      ? "Chào buổi sáng"
      : h < 18
        ? "Chào buổi chiều"
        : "Chào buổi tối";
  }, [mounted]);

  const sortedMilestones = React.useMemo(
    () =>
      [...upcomingMilestones].sort(
        (a, b) => daysUntil(a.deadline) - daysUntil(b.deadline)
      ),
    []
  );

  const overdue = sortedMilestones.filter((m) => daysUntil(m.deadline) < 0).length;
  const dueSoon = sortedMilestones.filter((m) => {
    const d = daysUntil(m.deadline);
    return d >= 0 && d <= 7;
  }).length;

  const firstName = user?.full_name?.trim().split(/\s+/).slice(-1)[0];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={`${greeting}${firstName ? `, ${firstName}` : ""}`}
        description="Những việc cần chú ý trong tuần này."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<FileArrowUp size={15} />}
              onClick={() => (window.location.href = "/documents")}
            >
              Tải tài liệu
            </Button>
            <Button
              variant="primary"
              icon={<Robot size={15} />}
              onClick={() => (window.location.href = "/ai-chat")}
            >
              Hỏi trợ lý AI
            </Button>
          </>
        }
      />

      {/* Overdue is the one thing worth interrupting for, so it leads. */}
      {overdue > 0 && (
        <div
          className="flex items-start gap-2.5 px-3 py-2.5 rounded-[10px]"
          style={{
            background: "var(--danger-bg)",
            border: "1px solid var(--danger-border)",
          }}
          role="alert"
        >
          <Warning size={16} weight="fill" className="text-danger flex-shrink-0 mt-px" />
          <p className="text-[13px] text-secondary flex-1">
            <strong className="text-danger">
              {overdue} mốc đã quá hạn.
            </strong>{" "}
            Cập nhật trạng thái hoặc xin gia hạn với giảng viên hướng dẫn.
          </p>
          <Link
            href="/milestones"
            className="text-[12.5px] font-medium text-danger hover:underline whitespace-nowrap"
          >
            Xem ngay
          </Link>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Each tile is the entry point to the screen it summarises — a
            number you can't act on is just decoration. */}
        <StatTile
          label="Đề tài đang thực hiện"
          value="1"
          sublabel={thesis.supervisor}
          icon={<GraduationCap size={15} weight="duotone" />}
          tone="accent"
          onClick={() => router.push("/theses")}
        />
        <StatTile
          label="Mốc hoàn thành"
          value={`${thesis.milestonesDone}/${thesis.milestonesTotal}`}
          sublabel={`${Math.round((thesis.milestonesDone / thesis.milestonesTotal) * 100)}% tiến độ`}
          icon={<CheckCircle size={15} weight="duotone" />}
          tone="success"
          onClick={() => router.push("/milestones")}
        />
        <StatTile
          label="Tài liệu"
          value={thesis.documents}
          sublabel="đã lập chỉ mục"
          icon={<Files size={15} weight="duotone" />}
          tone="info"
          onClick={() => router.push("/documents")}
        />
        <StatTile
          label="Sắp đến hạn"
          value={dueSoon}
          sublabel="trong 7 ngày tới"
          icon={<Clock size={15} weight="duotone" />}
          tone={dueSoon > 0 ? "warning" : "neutral"}
          onClick={() => router.push("/milestones")}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 flex flex-col gap-4 min-w-0">
          {/* Thesis */}
          <Panel
            title="Đề tài của bạn"
            icon={<GraduationCap size={14} />}
            actions={
              <Link href={`/theses/${thesis.id}`} className="btn btn-ghost btn-sm">
                Chi tiết
                <ArrowRight size={13} />
              </Link>
            }
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <p className="text-[14px] font-medium leading-snug">
                  {thesis.title}
                </p>
                <p className="text-[12.5px] text-tertiary mt-0.5">
                  Hướng dẫn: {thesis.supervisor}
                </p>
              </div>
              <Badge variant="info" dot>
                Đang thực hiện
              </Badge>
            </div>
            <ProgressBar
              value={thesis.milestonesDone}
              max={thesis.milestonesTotal}
            />
          </Panel>

          {/* Milestones */}
          <Panel
            title="Mốc sắp đến hạn"
            icon={<Kanban size={14} />}
            bodyClassName=""
            actions={
              <Link href="/milestones" className="btn btn-ghost btn-sm">
                Tất cả
                <ArrowRight size={13} />
              </Link>
            }
          >
            {sortedMilestones.length === 0 ? (
              <EmptyState
                compact
                icon={<CheckCircle size={16} />}
                title="Không còn mốc nào đến hạn"
                description="Mọi việc trong tuần này đã hoàn tất."
              />
            ) : (
              <ul>
                {sortedMilestones.map((m, i) => {
                  const days = daysUntil(m.deadline);
                  const s = STATUS[m.status as MilestoneStatus];
                  return (
                    <li
                      key={m.id}
                      style={{
                        borderTop:
                          i > 0 ? "1px solid var(--border-secondary)" : undefined,
                        boxShadow:
                          days < 0 ? "inset 2px 0 0 0 var(--danger)" : undefined,
                      }}
                    >
                      <Link
                        href="/milestones"
                        className="row-hover flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--bg-hover)]"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium truncate">
                            {m.name}
                          </p>
                          <p className="text-[12px] mt-0.5 flex items-center gap-1.5">
                            <span className="text-muted tnum">{m.deadline}</span>
                            <span className="text-muted" aria-hidden="true">·</span>
                            <DeadlineLabel days={days} />
                          </p>
                        </div>
                        <Badge variant={s.variant}>{s.label}</Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>

        {/* Activity */}
        <Panel
          title="Hoạt động gần đây"
          icon={<Clock size={14} />}
          className="lg:col-span-1 h-fit"
        >
          <ol className="timeline-rail flex flex-col">
            {recentActivities.map((a, i) => (
              <li
                key={a.id}
                className="relative pb-3 last:pb-0"
                style={{ paddingTop: i === 0 ? 0 : undefined }}
              >
                <span
                  className={`timeline-node ${i === 0 ? "timeline-node-active" : ""}`}
                  aria-hidden="true"
                />
                <p className="text-[12.5px] leading-snug">
                  <span className="font-medium">{a.actor}</span>{" "}
                  <span className="text-tertiary">{a.action}</span>{" "}
                  <span className="text-secondary">{a.target}</span>
                </p>
                <span className="text-[11.5px] text-muted">{a.time}</span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </div>
  );
}

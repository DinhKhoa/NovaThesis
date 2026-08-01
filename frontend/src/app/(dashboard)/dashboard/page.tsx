"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ChartBar,
  CheckCircle,
  Clock,
  FileArrowUp,
  Files,
  GraduationCap,
  Kanban,
  Robot,
  Users,
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
  Skeleton,
  useMounted,
} from "@/components/ui";
import { useAuthStore, isLecturer } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { milestonesApi, type LecturerDashboardRow, type MilestoneStatus } from "@/lib/services";
import { daysUntil, formatDate, formatRelative } from "@/lib/format";
import { AdminDashboard } from "./admin-dashboard";

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

function DeadlineLabel({ days }: { days: number }) {
  if (days < 0)
    return <span className="text-danger font-medium">Trễ {Math.abs(days)} ngày</span>;
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

  /* Ba vai trò, ba bảng điều khiển. Trước đây chỉ có hai: Admin bị gộp vào nhánh
     giảng viên (`isLecturer(user) || role === "ADMIN"`) nên nhận một danh sách
     luôn rỗng, vì Admin không có `lecturer_id`. */
  const admin = user?.role === "ADMIN";
  const lecturerView = isLecturer(user);

  /* Resolved only after hydration: the server's clock and the student's clock
     disagree, and a time-of-day greeting rendered on the server would mismatch
     at the boundary hours. */
  const mounted = useMounted();
  const greeting = React.useMemo(() => {
    if (!mounted) return "Xin chào";
    const h = new Date().getHours();
    return h < 12 ? "Chào buổi sáng" : h < 18 ? "Chào buổi chiều" : "Chào buổi tối";
  }, [mounted]);

  const firstName = user?.full_name?.trim().split(/\s+/).slice(-1)[0];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={`${greeting}${firstName ? `, ${firstName}` : ""}`}
        description={
          admin
            ? "Tình trạng hệ thống và những việc đang chờ bạn xử lý."
            : lecturerView
              ? "Tiến độ của các đề tài bạn đang hướng dẫn."
              : "Những việc cần chú ý trong tuần này."
        }
        /* Nút theo vai trò. Trước đây Admin cũng thấy "Tải tài liệu" và "Hỏi trợ
           lý AI" — hai trang không có trong thanh điều hướng của Admin, và
           `/ai-chat` giờ đã bị chặn hẳn với vai trò này. */
        actions={
          admin ? (
            <>
              <Button
                variant="secondary"
                icon={<Users size={15} />}
                onClick={() => router.push("/admin/users")}
              >
                Quản lý người dùng
              </Button>
              <Button
                variant="primary"
                icon={<ChartBar size={15} />}
                onClick={() => router.push("/admin/statistics")}
              >
                Giám sát AI
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                icon={<FileArrowUp size={15} />}
                onClick={() => router.push("/documents")}
              >
                Tải tài liệu
              </Button>
              <Button
                variant="primary"
                icon={<Robot size={15} />}
                onClick={() => router.push("/ai-chat")}
              >
                Hỏi trợ lý AI
              </Button>
            </>
          )
        }
      />

      {admin ? (
        <AdminDashboard />
      ) : lecturerView ? (
        <LecturerDashboard />
      ) : (
        <StudentDashboard />
      )}
    </div>
  );
}

/* ==========================================================================
   SINH VIÊN (UC 4.13)
   ========================================================================== */

function StudentDashboard() {
  const router = useRouter();
  const { data, loading, error, refetch } = useAsync(() => milestonesApi.studentDashboard(), []);

  if (loading && !data) return <DashboardSkeleton />;

  if (error) {
    return (
      <EmptyState
        icon={<Warning size={16} />}
        title="Không tải được dữ liệu"
        description={error}
        action={
          <Button variant="secondary" size="sm" onClick={() => void refetch()}>
            Thử lại
          </Button>
        }
      />
    );
  }

  if (!data) return null;

  /* Chưa có đề tài là một trạng thái hợp lệ, không phải lỗi: sinh viên vừa
     đăng ký sẽ rơi vào đây, và thứ họ cần là một lối đi tiếp chứ không phải
     bốn ô số 0. */
  if (!data.thesis) {
    return (
      <EmptyState
        icon={<GraduationCap size={16} />}
        title="Bạn chưa có đề tài nào"
        description="Đề xuất một đề tài để bắt đầu theo dõi tiến độ, tải tài liệu và dùng trợ lý AI."
        action={
          <Button variant="primary" size="sm" onClick={() => router.push("/theses/new")}>
            Đề xuất đề tài
          </Button>
        }
      />
    );
  }

  const { thesis, upcoming, recent_activities } = data;

  return (
    <>
      {/* Overdue is the one thing worth interrupting for, so it leads. */}
      {data.overdue > 0 && (
        <div
          className="flex items-start gap-2.5 px-3 py-2.5 rounded-[10px]"
          style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}
          role="alert"
        >
          <Warning size={16} weight="fill" className="text-danger flex-shrink-0 mt-px" />
          <p className="text-[13px] text-secondary flex-1">
            <strong className="text-danger">{data.overdue} mốc đã quá hạn.</strong> Cập nhật
            trạng thái hoặc xin gia hạn với giảng viên hướng dẫn.
          </p>
          <Link
            href="/milestones"
            className="text-[12.5px] font-medium text-danger hover:underline whitespace-nowrap"
          >
            Xem ngay
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Each tile is the entry point to the screen it summarises — a number
            you can't act on is just decoration. */}
        <StatTile
          label="Đề tài đang thực hiện"
          value="1"
          sublabel={thesis.lecturer_name}
          icon={<GraduationCap size={15} weight="duotone" />}
          tone="accent"
          onClick={() => router.push(`/theses/${thesis.id}`)}
        />
        <StatTile
          label="Mốc hoàn thành"
          value={`${data.completed}/${data.total}`}
          sublabel={`${data.progress_percent}% tiến độ`}
          icon={<CheckCircle size={15} weight="duotone" />}
          tone="success"
          onClick={() => router.push("/milestones")}
        />
        <StatTile
          label="Tài liệu"
          value={data.document_count}
          sublabel="trong kho đề tài"
          icon={<Files size={15} weight="duotone" />}
          tone="info"
          onClick={() => router.push("/documents")}
        />
        <StatTile
          label="Sắp đến hạn"
          value={data.due_soon}
          sublabel="trong 7 ngày tới"
          icon={<Clock size={15} weight="duotone" />}
          tone={data.due_soon > 0 ? "warning" : "neutral"}
          onClick={() => router.push("/milestones")}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 flex flex-col gap-4 min-w-0">
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
                <p className="text-[14px] font-medium leading-snug">{thesis.title}</p>
                <p className="text-[12.5px] text-tertiary mt-0.5">
                  Hướng dẫn: {thesis.lecturer_name}
                </p>
              </div>
              <Badge variant={thesis.status === "ONGOING" ? "info" : "neutral"} dot>
                {thesis.status === "ONGOING" ? "Đang thực hiện" : thesis.status}
              </Badge>
            </div>
            <ProgressBar value={data.completed} max={Math.max(data.total, 1)} />
          </Panel>

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
            {upcoming.length === 0 ? (
              <EmptyState
                compact
                icon={<CheckCircle size={16} />}
                title="Không còn mốc nào đến hạn"
                description="Mọi việc trong tuần này đã hoàn tất."
              />
            ) : (
              <ul>
                {upcoming.map((m, i) => {
                  const days = daysUntil(m.deadline);
                  const s = STATUS[m.status];
                  return (
                    <li
                      key={m.id}
                      style={{
                        borderTop: i > 0 ? "1px solid var(--border-secondary)" : undefined,
                        boxShadow: days < 0 ? "inset 2px 0 0 0 var(--danger)" : undefined,
                      }}
                    >
                      <Link
                        href="/milestones"
                        className="row-hover flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--bg-hover)]"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium truncate">{m.name}</p>
                          <p className="text-[12px] mt-0.5 flex items-center gap-1.5">
                            <span className="text-muted tnum">{formatDate(m.deadline)}</span>
                            <span className="text-muted" aria-hidden="true">
                              ·
                            </span>
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

        <Panel title="Hoạt động gần đây" icon={<Clock size={14} />} className="lg:col-span-1 h-fit">
          {recent_activities.length === 0 ? (
            <p className="text-[12.5px] text-tertiary">Chưa có hoạt động nào được ghi nhận.</p>
          ) : (
            <ol className="timeline-rail flex flex-col">
              {recent_activities.map((a, i) => (
                <li key={a.id} className="relative pb-3 last:pb-0">
                  <span
                    className={`timeline-node ${i === 0 ? "timeline-node-active" : ""}`}
                    aria-hidden="true"
                  />
                  <p className="text-[12.5px] leading-snug">
                    <span className="font-medium">{a.actor}</span>{" "}
                    <span className="text-tertiary">{a.action}</span>{" "}
                    <span className="text-secondary">{a.target}</span>
                  </p>
                  <span className="text-[11.5px] text-muted">{formatRelative(a.created_at)}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </>
  );
}

/* ==========================================================================
   GIẢNG VIÊN (UC 4.14)
   ========================================================================== */

function LecturerDashboard() {
  const router = useRouter();
  const { data, loading, error, refetch } = useAsync(() => milestonesApi.lecturerDashboard(), []);

  if (loading && !data) return <DashboardSkeleton />;

  if (error) {
    return (
      <EmptyState
        icon={<Warning size={16} />}
        title="Không tải được dữ liệu"
        description={error}
        action={
          <Button variant="secondary" size="sm" onClick={() => void refetch()}>
            Thử lại
          </Button>
        }
      />
    );
  }

  const rows: LecturerDashboardRow[] = data ?? [];

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<GraduationCap size={16} />}
        title="Chưa hướng dẫn đề tài nào"
        description="Các đề tài sinh viên gửi duyệt sẽ xuất hiện ở đây sau khi bạn phê duyệt."
        action={
          <Button variant="secondary" size="sm" onClick={() => router.push("/theses")}>
            Xem đề tài chờ duyệt
          </Button>
        }
      />
    );
  }

  const totalOverdue = rows.reduce((sum, r) => sum + r.overdue, 0);
  const avgProgress = Math.round(
    rows.reduce((sum, r) => sum + r.progress_percent, 0) / Math.max(rows.length, 1)
  );

  return (
    <>
      {totalOverdue > 0 && (
        <div
          className="flex items-start gap-2.5 px-3 py-2.5 rounded-[10px]"
          style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}
          role="alert"
        >
          <Warning size={16} weight="fill" className="text-danger flex-shrink-0 mt-px" />
          <p className="text-[13px] text-secondary flex-1">
            <strong className="text-danger">{totalOverdue} mốc quá hạn</strong> trên{" "}
            {rows.filter((r) => r.overdue > 0).length} đề tài bạn đang hướng dẫn.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="Đề tài hướng dẫn"
          value={rows.length}
          icon={<GraduationCap size={15} weight="duotone" />}
          tone="accent"
          onClick={() => router.push("/theses")}
        />
        <StatTile
          label="Tiến độ trung bình"
          value={`${avgProgress}%`}
          sublabel="trên tất cả đề tài"
          icon={<CheckCircle size={15} weight="duotone" />}
          tone="success"
        />
        <StatTile
          label="Mốc quá hạn"
          value={totalOverdue}
          icon={<Warning size={15} weight="duotone" />}
          tone={totalOverdue > 0 ? "warning" : "neutral"}
          onClick={() => router.push("/milestones")}
        />
        <StatTile
          label="Chờ phê duyệt"
          value={rows.reduce((s, r) => s + (r.total - r.completed - r.overdue), 0)}
          sublabel="mốc đang thực hiện"
          icon={<Clock size={15} weight="duotone" />}
          tone="info"
          onClick={() => router.push("/milestones")}
        />
      </div>

      {/* Sắp xếp đã do server làm (quá hạn nhiều nhất, rồi tiến độ thấp nhất —
          business rule UC 4.14), nên thứ tự hiển thị chính là thứ tự cần chú ý. */}
      <Panel title="Đề tài đang hướng dẫn" icon={<Kanban size={14} />} bodyClassName="">
        <ul>
          {rows.map((r, i) => (
            <li
              key={r.thesis_id}
              style={{
                borderTop: i > 0 ? "1px solid var(--border-secondary)" : undefined,
                boxShadow: r.overdue > 0 ? "inset 2px 0 0 0 var(--danger)" : undefined,
              }}
            >
              <Link
                href={`/theses/${r.thesis_id}`}
                className="row-hover flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-hover)]"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium truncate">{r.title}</p>
                  <p className="text-[12px] text-tertiary truncate mt-0.5">
                    {r.student_names.length ? r.student_names.join(", ") : "Chưa có sinh viên"}
                    {r.last_activity_at ? ` · ${formatRelative(r.last_activity_at)}` : ""}
                  </p>
                </div>

                <div className="w-28 flex-shrink-0 hidden sm:block">
                  <ProgressBar value={r.completed} max={Math.max(r.total, 1)} showLabel={false} />
                  <span className="text-[11px] text-muted tnum">
                    {r.completed}/{r.total} mốc
                  </span>
                </div>

                {r.overdue > 0 ? (
                  <Badge variant="danger">{r.overdue} quá hạn</Badge>
                ) : (
                  <Badge variant="neutral">{r.progress_percent}%</Badge>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}

/* ==========================================================================
   TRẠNG THÁI TẢI
   ========================================================================== */

/* Khung xám giữ đúng chỗ của nội dung thật, nên khi dữ liệu về, bố cục không
   nhảy — quan trọng hơn với 4 ô số liệu hơn là một spinner ở giữa màn hình. */
function DashboardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[74px] rounded-[10px]" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 flex flex-col gap-4">
          <Skeleton className="h-32 rounded-[10px]" />
          <Skeleton className="h-56 rounded-[10px]" />
        </div>
        <Skeleton className="h-56 rounded-[10px]" />
      </div>
    </>
  );
}

"use client";

/**
 * TRANG TỔNG QUAN CỦA QUẢN TRỊ VIÊN
 *
 * Trước đây Admin đăng nhập xong rơi vào đúng bảng điều khiển của GIẢNG VIÊN
 * (`lecturerView = isLecturer(user) || role === "ADMIN"` ở `dashboard/page.tsx`).
 * Admin không có `lecturer_id` nên danh sách luôn rỗng: màn hình đầu tiên là
 * dòng "Chưa hướng dẫn đề tài nào" kèm hai nút dẫn tới trang Admin không có
 * quyền vào.
 *
 * Nguyên tắc của trang này: mở khối "Việc cần xử lý" LÊN TRƯỚC số liệu. Một
 * trang tổng quan chỉ có bốn con số thì đọc xong vẫn không biết làm gì tiếp; thứ
 * Admin cần khi vừa đăng nhập là danh sách việc đang chờ mình.
 *
 * Tách file riêng vì `dashboard/page.tsx` đã 485 dòng trước khi thêm nhánh này.
 */

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ChartBar,
  CheckCircle,
  Files,
  GraduationCap,
  Robot,
  Users,
  Warning,
} from "@phosphor-icons/react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Panel,
  Skeleton,
  StatTile,
} from "@/components/ui";
import { useAsync } from "@/lib/use-async";
import { adminApi, type AdminAction } from "@/lib/services";
import { formatNumber, formatRelative } from "@/lib/format";

/** Byte → đơn vị đọc được. Dung lượng lưu trữ là thứ Admin theo dõi thật. */
function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / 1_048_576;
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

/* Việc tồn đọng nhiều tới mức nào thì đáng báo động — dùng để tô màu, chứ không
   phải để ẩn bớt: một mục bằng 0 vẫn hiện, vì "không còn việc nào" là thông tin
   có giá trị chứ không phải khoảng trống cần dọn. */
function tone(action: AdminAction): "danger" | "warning" | "neutral" {
  if (action.count === 0) return "neutral";
  if (action.key === "documents_ai_error" || action.key === "unassigned_theses") return "danger";
  return "warning";
}

export function AdminDashboard() {
  const router = useRouter();
  const { data, loading, error, refetch } = useAsync(() => adminApi.overview(), []);

  if (loading && !data) {
    return (
      <>
        <Skeleton className="h-28 rounded-[10px]" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[74px] rounded-[10px]" />
          ))}
        </div>
        <Skeleton className="h-56 rounded-[10px]" />
      </>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={<Warning size={16} />}
        title="Không tải được số liệu tổng quan"
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

  const pending = data.actions_required.filter((a) => a.count > 0);
  const ongoing = data.theses.by_status.find((s) => s.status === "ONGOING")?.count ?? 0;

  return (
    <>
      {/* VIỆC CẦN XỬ LÝ — đặt trên cùng, trước mọi con số. */}
      <Panel
        title="Việc cần xử lý"
        icon={<Warning size={14} />}
        bodyClassName=""
        actions={
          pending.length > 0 ? (
            <Badge variant="warning">{pending.length} nhóm</Badge>
          ) : (
            <Badge variant="success" dot>
              Không còn tồn đọng
            </Badge>
          )
        }
      >
        {pending.length === 0 ? (
          <EmptyState
            compact
            icon={<CheckCircle size={16} />}
            title="Không có việc nào đang chờ"
            description="Tài khoản đã xác minh hết, đề tài không bị bỏ quên trong hàng đợi duyệt, tài liệu lập chỉ mục sạch."
          />
        ) : (
          <ul>
            {pending.map((a, i) => {
              const t = tone(a);
              return (
                <li
                  key={a.key}
                  style={{
                    borderTop: i > 0 ? "1px solid var(--border-secondary)" : undefined,
                    boxShadow: t === "danger" ? "inset 2px 0 0 0 var(--danger)" : undefined,
                  }}
                >
                  {/* Mỗi dòng dẫn tới danh sách ĐÃ LỌC. `href` do server đặt nên
                      con số và danh sách không thể lệch nhau. */}
                  <Link
                    href={a.href}
                    className="row-hover flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--bg-hover)]"
                  >
                    <span className="flex-1 text-[13px]">{a.label}</span>
                    <span
                      className="tnum text-[13px] font-semibold"
                      style={{
                        color: t === "danger" ? "var(--danger)" : "var(--warning)",
                      }}
                    >
                      {formatNumber(a.count)}
                    </span>
                    <ArrowRight size={13} className="text-muted flex-shrink-0" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {/* SỐ LIỆU TOÀN HỆ THỐNG */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="Người dùng"
          value={formatNumber(data.users.total)}
          sublabel={`${data.users.students} SV · ${data.users.lecturers} GV`}
          icon={<Users size={15} weight="duotone" />}
          tone="accent"
          onClick={() => router.push("/admin/users")}
        />
        <StatTile
          label="Đề tài đang thực hiện"
          value={formatNumber(ongoing)}
          sublabel={`trên tổng ${formatNumber(data.theses.total)}`}
          icon={<GraduationCap size={15} weight="duotone" />}
          tone="info"
          onClick={() => router.push("/theses")}
        />
        <StatTile
          label="Tài liệu"
          value={formatNumber(data.documents.total)}
          sublabel={`${formatBytes(data.documents.total_bytes)} · ${formatNumber(
            data.documents.indexed
          )} đã lập chỉ mục`}
          icon={<Files size={15} weight="duotone" />}
          tone={data.documents.failed > 0 ? "warning" : "neutral"}
          onClick={() => router.push("/documents")}
        />
        <StatTile
          label="Lượt hỏi trợ lý AI"
          value={formatNumber(data.ai.total_messages)}
          sublabel={`${formatNumber(data.ai.total_sessions)} hội thoại`}
          icon={<Robot size={15} weight="duotone" />}
          tone="accent"
          onClick={() => router.push("/admin/statistics")}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Phân bố trạng thái đề tài */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[14px] font-semibold flex items-center gap-2">
              <ChartBar size={16} style={{ color: "var(--accent)" }} />
              Đề tài theo trạng thái
            </h2>
            <Link
              href="/admin/statistics"
              className="text-[12px] text-accent hover:underline flex items-center gap-1"
            >
              Chi tiết
              <ArrowRight size={11} />
            </Link>
          </div>

          {data.theses.total === 0 ? (
            <EmptyState
              compact
              icon={<GraduationCap size={16} />}
              title="Chưa có đề tài nào"
              description="Số liệu xuất hiện khi sinh viên bắt đầu đề xuất đề tài."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {data.theses.by_status.map((s) => (
                <div key={s.status} className="flex flex-col gap-1">
                  <div className="flex justify-between text-[12.5px]">
                    <span className="text-secondary">{s.label}</span>
                    <span className="tnum text-primary font-medium">
                      {formatNumber(s.count)} · {s.percent}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden bg-[var(--bg-hover)]">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${s.percent}%`, background: "var(--accent)" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Lỗi hệ thống gần nhất.
            Nhật ký nói chuyện gì ĐÃ hỏng; đưa năm dòng lỗi mới nhất lên đây để
            Admin thấy nó mà không phải chủ động đi tìm. */}
        <Panel
          title="Lỗi hệ thống gần nhất"
          icon={<Warning size={14} />}
          bodyClassName=""
          actions={
            <Link href="/admin/logs?level=ERROR" className="btn btn-ghost btn-sm">
              Nhật ký
              <ArrowRight size={13} />
            </Link>
          }
        >
          {data.recent_errors.length === 0 ? (
            <EmptyState
              compact
              icon={<CheckCircle size={16} />}
              title="Không có lỗi nào được ghi nhận"
              description="Hệ thống chưa phát sinh lỗi mức ERROR."
            />
          ) : (
            <ul>
              {data.recent_errors.map((e, i) => (
                <li
                  key={e.id}
                  className="px-4 py-2.5"
                  style={{
                    borderTop: i > 0 ? "1px solid var(--border-secondary)" : undefined,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <code className="text-[11.5px] font-mono text-danger">{e.action}</code>
                    <span className="text-[11px] text-muted ml-auto">
                      {formatRelative(e.created_at)}
                    </span>
                  </div>
                  {e.message && (
                    <p className="text-[12px] text-tertiary mt-0.5 line-clamp-2">{e.message}</p>
                  )}
                  {e.actor && (
                    <span className="text-[11px] text-muted">Người thực hiện: {e.actor}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}

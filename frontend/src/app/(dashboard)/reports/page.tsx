"use client";

import React from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarBlank,
  ChartBar,
  FileCsv,
  FilePdf,
  FileXls,
  Robot,
  GraduationCap,
  Users,
  ChartPie,
  Warning,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/layout";
import { Badge, Button, Card, EmptyState, Select, Skeleton } from "@/components/ui";
import { isAdmin, isLecturer, useAuthStore } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { isApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { formatDate, formatNumber, formatPercent } from "@/lib/format";
import {
  reportsApi,
  thesesApi,
  type MilestoneStatus,
  type ReportOverview,
  type ThesisStatus,
} from "@/lib/services";

/* ==========================================================================
   BẢNG MÀU
   ========================================================================== */

/* Cùng bảng màu với trang Đề tài: một trạng thái phải có một màu duy nhất trên
   toàn ứng dụng, nếu không biểu đồ dạy người dùng một quy ước mà bảng danh sách
   lại phá vỡ. */
const THESIS_STATUS_COLOR: Record<ThesisStatus, string> = {
  DRAFT: "var(--fg-tertiary)",
  PENDING: "var(--warning)",
  REVISION_REQUIRED: "var(--danger)",
  ONGOING: "var(--accent)",
  COMPLETED: "var(--success)",
  REJECTED: "var(--danger)",
};

const MILESTONE_STATUS: Record<MilestoneStatus, { label: string; color: string }> = {
  NOT_STARTED: { label: "Chưa bắt đầu", color: "var(--fg-muted)" },
  ONGOING: { label: "Đang thực hiện", color: "var(--accent)" },
  PENDING_APPROVAL: { label: "Chờ phê duyệt", color: "var(--info)" },
  REVISION_REQUIRED: { label: "Cần chỉnh sửa", color: "var(--warning)" },
  COMPLETED: { label: "Hoàn thành", color: "var(--success)" },
};

/**
 * Backend (`reports.service.ts`) gửi kèm `label` tiếng Việt cho mỗi tính năng
 * AI, nhưng kiểu trong `services.ts` mới chỉ khai báo `feature/count/share`.
 * Nới kiểu ở đây với `label` tuỳ chọn để dùng được nhãn của server mà không
 * phải sửa lớp dịch vụ, đồng thời vẫn có đường lùi nếu server chưa gửi.
 */
type AiFeatureRow = ReportOverview["ai_by_feature"][number] & { label?: string };

const AI_FEATURE_FALLBACK: Record<string, string> = {
  chat: "Hỏi đáp trợ lý RAG (pgvector)",
  search: "Tìm kiếm ngữ nghĩa tài liệu",
  summarize: "Tóm tắt tài liệu tự động",
  suggest: "Gợi ý lộ trình milestone",
  plagiarism: "Kiểm tra trùng lặp & đạo văn",
};

/* ==========================================================================
   PAGE
   ========================================================================== */

export default function ReportsPage() {
  const { user } = useAuthStore();

  /* UC 9.2 pre-condition: chỉ Giảng viên và Admin được xuất danh sách đề tài.
     Bày nút cho sinh viên rồi để server trả 403 là bắt họ tự dò luật nghiệp vụ
     bằng cách va vào nó. */
  const canExportList = isLecturer(user) || isAdmin(user);

  const [exporting, setExporting] = React.useState<"csv" | "xlsx" | null>(null);

  const { data: overview, loading, error, refetch } = useAsync(() => reportsApi.overview(), []);

  const exportTheses = async (format: "csv" | "xlsx") => {
    setExporting(format);
    try {
      await reportsApi.download(
        `/reports/theses/export?format=${format}`,
        format === "csv" ? "Danh_sach_de_tai.csv" : "Danh_sach_de_tai.xlsx"
      );
      toast.success("Đã tải xuống danh sách đề tài.");
    } catch (err) {
      // Backend phân biệt "không có dữ liệu phù hợp để xuất" với "dữ liệu quá
      // lớn" (UC 9.2 luồng ngoại lệ 4a/5a) — hiển thị nguyên văn, vì mỗi câu chỉ
      // ra một cách xử lý khác nhau.
      toast.error(isApiError(err) ? err.message : "Không xuất được danh sách đề tài.");
    } finally {
      setExporting(null);
    }
  };

  /* `total_theses` được lọc theo vai trò ngay ở server, nên phải nói rõ con số
     đang đếm phạm vi nào — cùng một trang, ba người thấy ba con số khác nhau. */
  const scopeLabel = isAdmin(user)
    ? "Toàn hệ thống"
    : isLecturer(user)
      ? "Đề tài bạn hướng dẫn"
      : "Đề tài của bạn";

  const completedTheses =
    overview?.theses_by_status.find((s) => s.status === "COMPLETED")?.count ?? 0;

  const features: AiFeatureRow[] = overview?.ai_by_feature ?? [];

  return (
    <div>
      <PageHeader
        title="Báo cáo"
        description="Xuất dữ liệu tiến độ, danh sách đề tài và thống kê sử dụng AI."
        actions={
          canExportList ? (
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                icon={<FileCsv size={15} />}
                loading={exporting === "csv"}
                disabled={exporting !== null}
                onClick={() => void exportTheses("csv")}
              >
                Xuất CSV
              </Button>
              <Button
                variant="primary"
                icon={<FileXls size={15} />}
                loading={exporting === "xlsx"}
                disabled={exporting !== null}
                onClick={() => void exportTheses("xlsx")}
              >
                Xuất Excel (.xlsx)
              </Button>
            </div>
          ) : undefined
        }
      />

      {loading && !overview ? (
        <OverviewSkeleton />
      ) : error ? (
        <EmptyState
          icon={<Warning size={16} />}
          title="Không tải được số liệu báo cáo"
          description={error}
          action={
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
        />
      ) : overview ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] text-tertiary uppercase font-medium">Tổng Đề tài</span>
                <GraduationCap size={20} className="text-accent" />
              </div>
              <p className="text-2xl font-bold">{formatNumber(overview.total_theses)}</p>
              <span className="text-[11px] text-tertiary">{scopeLabel}</span>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] text-tertiary uppercase font-medium">Tỷ lệ Hoàn thành</span>
                <ChartPie size={20} className="text-success" />
              </div>
              <p className="text-2xl font-bold">{formatPercent(overview.completion_rate, 1)}</p>
              <span className="text-[11px] text-tertiary">
                {formatNumber(completedTheses)}/{formatNumber(overview.total_theses)} đề tài đã hoàn thành
              </span>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] text-tertiary uppercase font-medium">Lượt truy vấn AI</span>
                <Robot size={20} className="text-warning" />
              </div>
              <p className="text-2xl font-bold font-mono">{formatNumber(overview.ai_queries)}</p>
              {/* Con số này gộp cả 5 tính năng AI chứ không riêng RAG, nên nhãn
                  phải nói đúng thứ đang được đếm. */}
              <span className="text-[11px] text-accent">Tổng lượt dùng các tính năng AI</span>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] text-tertiary uppercase font-medium">Tổng Sinh viên</span>
                <Users size={20} className="text-info" />
              </div>
              <p className="text-2xl font-bold font-mono">{formatNumber(overview.total_students)}</p>
              <span className="text-[11px] text-tertiary">Đang tham gia đề tài</span>
            </Card>
          </div>

          {/* Status Breakdown & AI Analytics (UC 9.2, 9.3) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Thesis Status Distribution */}
            <Card className="p-6">
              <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
                <ChartBar size={20} style={{ color: "var(--accent)" }} />
                Thống kê Đề tài theo Trạng thái
              </h2>

              {overview.total_theses === 0 ? (
                <EmptyState
                  compact
                  icon={<GraduationCap size={18} />}
                  title="Chưa có đề tài nào để thống kê"
                  description={
                    canExportList
                      ? "Số liệu sẽ xuất hiện sau khi bạn duyệt đề tài đầu tiên."
                      : "Hãy đề xuất đề tài để bắt đầu theo dõi số liệu tiến độ."
                  }
                />
              ) : (
                <div className="flex flex-col gap-4">
                  {/* Server trả đủ 6 trạng thái kể cả khi bằng 0, có chủ đích: thứ
                      tự các thanh không đảo chỗ giữa hai lần tải. */}
                  {overview.theses_by_status.map((item) => (
                    <div key={item.status} className="flex flex-col gap-1.5">
                      <div className="flex justify-between text-[13px]">
                        <span className="text-secondary">
                          {item.label} ({item.status})
                        </span>
                        <span className="font-mono text-primary font-medium">
                          {formatNumber(item.count)} đề tài ({item.percent}%)
                        </span>
                      </div>
                      <div className="h-2.5 rounded-full overflow-hidden bg-[var(--bg-hover)]">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${item.percent}%`,
                            background: THESIS_STATUS_COLOR[item.status],
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* AI Usage Analytics */}
            <Card className="p-6">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <Robot size={20} style={{ color: "var(--accent)" }} />
                  Thống kê Tần suất Sử dụng AI & Vector Search
                </h2>
                {/* UC 9.3: dashboard AI đầy đủ là màn hình riêng của Admin. */}
                {isAdmin(user) && (
                  <Link
                    href="/admin/statistics"
                    className="text-[12.5px] font-medium text-accent hover:underline flex items-center gap-1 whitespace-nowrap flex-shrink-0"
                  >
                    Xem thống kê AI chi tiết
                    <ArrowRight size={12} />
                  </Link>
                )}
              </div>

              {overview.ai_queries === 0 ? (
                <EmptyState
                  compact
                  icon={<Robot size={18} />}
                  title="Chưa ghi nhận lượt dùng AI nào"
                  description={
                    isAdmin(user)
                      ? "Chưa ai trong hệ thống dùng trợ lý AI hoặc tìm kiếm ngữ nghĩa."
                      : "Hỏi trợ lý AI hoặc tìm kiếm ngữ nghĩa trong kho tài liệu để bắt đầu có số liệu."
                  }
                  /* Trợ lý AI là màn hình của sinh viên và giảng viên (xem
                     `navSections`), nên không mời Admin bấm vào một lối cụt. */
                  action={
                    isAdmin(user) ? undefined : (
                      <Link href="/ai-chat" className="btn btn-secondary btn-sm">
                        Mở trợ lý AI
                      </Link>
                    )
                  }
                />
              ) : (
                <div className="flex flex-col gap-3">
                  {features.map((f) => (
                    <div
                      key={f.feature}
                      className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-secondary)] flex items-center justify-between"
                    >
                      <div>
                        <span className="font-medium text-[13px] text-primary block">
                          {f.label ?? AI_FEATURE_FALLBACK[f.feature] ?? f.feature}
                        </span>
                        <span className="text-[11px] text-tertiary font-mono">
                          {formatNumber(f.count)} lượt truy vấn
                        </span>
                      </div>
                      <Badge variant="info">{f.share}%</Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      ) : null}

      <GanttSection />
    </div>
  );
}

/* ==========================================================================
   UC 9.4 — BIỂU ĐỒ GANTT
   ========================================================================== */

const DAY_MS = 86_400_000;

/**
 * Nhãn "07/2026" cho trục thời gian.
 *
 * Không dùng `formatDate` vì đây là mốc THÁNG chứ không phải một ngày cụ thể,
 * và `Intl` với vi-VN trả "tháng 07, 2026" — dài gấp ba bề ngang một vạch chia.
 * Đọc theo UTC: dữ liệu Gantt là ngày thuần (`YYYY-MM-DD`), quy về múi giờ địa
 * phương sẽ đẩy mốc đầu tháng lùi sang tháng trước.
 */
function monthLabel(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

interface MonthBand {
  key: string;
  label: string;
  left: number;
  width: number;
}

function buildMonthBands(startMs: number, endMs: number, span: number): MonthBand[] {
  const bands: MonthBand[] = [];
  const first = new Date(startMs);
  let cursor = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1);

  while (cursor <= endMs) {
    const next = new Date(cursor);
    const nextMonth = Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 1);
    // Tháng đầu tiên bắt đầu trước mốc `start`; kẹp về 0 để dải không tràn ra
    // ngoài khung và làm lệch mọi nhãn phía sau.
    const left = Math.max(0, ((cursor - startMs) / span) * 100);
    const right = Math.min(100, ((nextMonth - startMs) / span) * 100);

    bands.push({
      key: new Date(cursor).toISOString().slice(0, 7),
      label: monthLabel(cursor),
      left,
      width: Math.max(0, right - left),
    });

    cursor = nextMonth;
  }

  return bands;
}

function GanttSection() {
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [exportingPdf, setExportingPdf] = React.useState(false);

  const {
    data: thesesPage,
    loading: thesesLoading,
    error: thesesError,
    refetch: refetchTheses,
  } = useAsync(() => thesesApi.list({ per_page: 100 }), []);

  const theses = thesesPage?.data ?? [];

  /* Suy ra lựa chọn thay vì đồng bộ bằng `useEffect`: đề tài mặc định là đề tài
     đầu danh sách, và một effect chỉ để set state sau khi tải xong sẽ tạo thêm
     một lượt render trung gian với biểu đồ rỗng. */
  const activeId = selectedId ?? theses[0]?.id ?? null;

  const exportProgressPdf = async (thesisId: number) => {
    setExportingPdf(true);
    try {
      // UC 9.1 — áp dụng cho cả ba vai trò, phạm vi do `assertThesisAccess` ở
      // server quyết định, nên đề tài nào đã chọn được thì xuất được.
      await reportsApi.download(
        `/reports/progress/${thesisId}/pdf`,
        `Bao_cao_tien_do_${thesisId}.pdf`
      );
      toast.success("Đã tải xuống báo cáo tiến độ.");
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Không xuất được báo cáo tiến độ.");
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <Card className="p-6 mt-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <CalendarBlank size={20} style={{ color: "var(--accent)" }} />
          Biểu đồ Gantt tiến độ
        </h2>

        {theses.length > 0 && activeId !== null && (
          <div className="flex items-center gap-2">
            <Select
              value={String(activeId)}
              onChange={(e) => setSelectedId(Number(e.target.value))}
              className="w-auto max-w-[18rem]"
              aria-label="Chọn đề tài để xem biểu đồ Gantt"
              /* Server chặn `per_page` ở 100. Nói thẳng ra khi danh sách bị cắt,
                 vì một đề tài không có trong ô chọn trông hệt như một đề tài
                 không tồn tại. */
              helperText={
                thesesPage && thesesPage.total > theses.length
                  ? `Hiển thị ${theses.length}/${thesesPage.total} đề tài`
                  : undefined
              }
            >
              {theses.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </Select>
            <Button
              variant="secondary"
              icon={<FilePdf size={15} />}
              loading={exportingPdf}
              onClick={() => void exportProgressPdf(activeId)}
            >
              Xuất PDF
            </Button>
          </div>
        )}
      </div>

      {thesesLoading && !thesesPage ? (
        <Skeleton className="rounded-[12px]" height="200px" />
      ) : thesesError ? (
        <EmptyState
          icon={<Warning size={16} />}
          title="Không tải được danh sách đề tài"
          description={thesesError}
          action={
            <Button variant="secondary" size="sm" onClick={() => void refetchTheses()}>
              Thử lại
            </Button>
          }
        />
      ) : activeId === null ? (
        <EmptyState
          compact
          icon={<GraduationCap size={18} />}
          title="Chưa có đề tài nào để vẽ biểu đồ"
          description="Biểu đồ Gantt dựng từ các mốc tiến độ của một đề tài, nên cần có đề tài trước."
        />
      ) : (
        /* `key` buộc component dựng lại khi đổi đề tài, nên biểu đồ không giữ
           lại khung xương của đề tài cũ trong lúc đề tài mới đang tải. */
        <GanttChart key={activeId} thesisId={activeId} />
      )}
    </Card>
  );
}

function GanttChart({ thesisId }: { thesisId: number }) {
  const { data, loading, error, refetch } = useAsync(
    () => reportsApi.gantt(thesisId),
    [thesisId]
  );

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-2">
        {/* `Skeleton` đặt chiều cao bằng inline style, nên phải truyền qua prop
            `height`: class `h-…` sẽ bị chính inline style đó ghi đè. */}
        <Skeleton className="rounded-[6px]" height="16px" width="60%" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="rounded-[6px]" height="24px" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={<Warning size={16} />}
        title="Không tải được biểu đồ tiến độ"
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

  // UC 9.4 luồng 3a: đề tài chưa có mốc nào thì hiện lối đi tiếp, không hiện
  // một khung biểu đồ trống.
  if (data.tasks.length === 0) {
    return (
      <EmptyState
        compact
        icon={<CalendarBlank size={18} />}
        title="Đề tài chưa có mốc tiến độ nào"
        description="Tạo các mốc kèm hạn nộp trong trang Tiến độ, biểu đồ sẽ được dựng từ chính các mốc đó."
        action={
          <Link href="/milestones" className="btn btn-secondary btn-sm">
            Đi tới Tiến độ
          </Link>
        }
      />
    );
  }

  const startMs = Date.parse(data.thesis.start);
  const endMs = Date.parse(data.thesis.end);
  // Đề tài tạo và kết thúc trong cùng một ngày vẫn phải chia được: `span = 0`
  // sẽ cho ra `Infinity%` và thổi bay bố cục.
  const span = Math.max(endMs - startMs, DAY_MS);

  const bands = buildMonthBands(startMs, endMs, span);
  // Mỗi tháng cần khoảng 90px mới đọc được nhãn; hẹp hơn thì cuộn ngang trong
  // khung, chứ không để cả trang cuộn ngang.
  const minWidth = Math.max(560, bands.length * 90);

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <div style={{ minWidth: `${minWidth}px` }}>
          {/* Trục thời gian theo tháng */}
          <div
            className="flex items-end gap-3 pb-1.5 mb-2"
            style={{ borderBottom: "1px solid var(--border-secondary)" }}
          >
            <div className="w-44 flex-shrink-0" aria-hidden="true" />
            <div className="relative flex-1 h-4">
              {bands.map((b) => (
                <span
                  key={b.key}
                  className="absolute top-0 text-[11px] text-tertiary tnum truncate pl-1"
                  style={{
                    left: `${b.left}%`,
                    width: `${b.width}%`,
                    borderLeft: "1px solid var(--border-secondary)",
                  }}
                >
                  {b.label}
                </span>
              ))}
            </div>
          </div>

          <ul className="flex flex-col gap-1.5">
            {data.tasks.map((task) => {
              const taskStart = Date.parse(task.start);
              const taskEnd = Date.parse(task.end);
              const left = Math.min(100, Math.max(0, ((taskStart - startMs) / span) * 100));
              const width = Math.max(
                0,
                Math.min(100 - left, ((taskEnd - taskStart) / span) * 100)
              );

              // Business rule UC 9.4-2: mốc quá hạn chưa hoàn thành phải nổi bật,
              // nên màu "quá hạn" đè lên màu trạng thái.
              const meta = MILESTONE_STATUS[task.status];
              const color = task.overdue ? "var(--danger)" : meta.color;

              return (
                <li key={task.id} className="flex items-center gap-3">
                  <div className="w-44 flex-shrink-0 flex items-center gap-1.5 min-w-0">
                    <span className="text-[12.5px] text-secondary truncate" title={task.name}>
                      {task.name}
                    </span>
                    {task.overdue && (
                      <Badge variant="danger" className="flex-shrink-0">
                        Quá hạn
                      </Badge>
                    )}
                  </div>

                  <div
                    className="relative flex-1 h-6 rounded-[6px]"
                    style={{ background: "var(--bg-sunken)" }}
                  >
                    <div
                      className="absolute top-1 bottom-1 rounded-[4px] overflow-hidden"
                      style={{ left: `${left}%`, width: `${width}%`, minWidth: "6px" }}
                      // Ngày tháng chỉ hiện khi cần: nhồi cả khoảng thời gian vào
                      // mỗi thanh sẽ che mất chính hình dạng của biểu đồ.
                      title={`${task.name}\n${formatDate(task.start)} → ${formatDate(task.end)}\n${
                        task.overdue ? "Quá hạn" : meta.label
                      } · ${task.progress}%`}
                    >
                      <span
                        className="absolute inset-0 rounded-[4px]"
                        style={{ background: color, opacity: 0.24 }}
                      />
                      <span
                        className="absolute inset-y-0 left-0 rounded-[4px]"
                        style={{ width: `${task.progress}%`, background: color }}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {(Object.keys(MILESTONE_STATUS) as MilestoneStatus[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5 text-[11px] text-tertiary">
            <span
              className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0"
              style={{ background: MILESTONE_STATUS[s].color }}
              aria-hidden="true"
            />
            {MILESTONE_STATUS[s].label}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[11px] text-tertiary">
          <span
            className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0"
            style={{ background: "var(--danger)" }}
            aria-hidden="true"
          />
          Quá hạn
        </span>
      </div>
    </div>
  );
}

/* ==========================================================================
   TRẠNG THÁI TẢI
   ========================================================================== */

/* Khung xám giữ đúng chỗ của bốn ô KPI và hai biểu đồ, nên khi số liệu về, bố
   cục không nhảy — quan trọng hơn một spinner ở giữa màn hình. */
function OverviewSkeleton() {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="rounded-[12px]" height="108px" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="rounded-[12px]" height="284px" />
        <Skeleton className="rounded-[12px]" height="284px" />
      </div>
    </>
  );
}

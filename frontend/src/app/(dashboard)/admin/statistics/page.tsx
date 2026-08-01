"use client";

import React from "react";
import {
  GraduationCap,
  Heartbeat,
  Quotes,
  Robot,
  Sparkle,
  Stack,
  ThumbsDown,
  ThumbsUp,
  TrendUp,
  Users,
  Warning,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/layout";
import { Badge, Button, Card, EmptyState, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { useAsync, type AsyncState } from "@/lib/use-async";
import {
  adminApi,
  aiApi,
  type AdminStatistics,
  type AIStats,
  type ThesisStatus,
} from "@/lib/services";
import { formatDate, formatNumber, formatPercent, formatRelative } from "@/lib/format";

/* Mỗi trạng thái một màu cố định: backend luôn trả đủ 6 trạng thái kể cả khi
   đếm bằng 0, nên bảng màu phải phủ hết 6 chứ không rơi vào nhánh `else`. */
const THESIS_STATUS_COLOR: Record<ThesisStatus, string> = {
  DRAFT: "var(--fg-muted)",
  PENDING: "var(--warning)",
  REVISION_REQUIRED: "var(--info)",
  ONGOING: "var(--accent)",
  COMPLETED: "var(--success)",
  REJECTED: "var(--danger)",
};

/* `/ai/stats` trả khoá kỹ thuật (`chat`, `search`, …) chứ không kèm nhãn như
   `/reports/overview`. Dịch tại chỗ, và vẫn hiển thị nguyên khoá nếu backend bổ
   sung tính năng mới — thà đọc thấy "rerank" còn hơn thấy một dòng trống. */
const AI_FEATURE_LABELS: Record<string, string> = {
  chat: "Hỏi đáp RAG",
  search: "Tìm kiếm ngữ nghĩa",
  summarize: "Tóm tắt tài liệu",
  suggest: "Gợi ý mốc tiến độ",
  plagiarism: "Kiểm tra trùng lặp",
};

/**
 * Phản hồi của `/health/diagnostics`.
 *
 * `services.ts` chưa khai báo endpoint này nên trang gọi thẳng `api.get`. Kiểu
 * chỉ mô tả những trường thực sự được đọc — backend còn trả runtime/mail/ai
 * config, khai báo thừa ở đây chỉ tạo thêm chỗ để lệch với server.
 */
interface HealthDiagnostics {
  status: "NOMINAL" | "DEGRADED";
  warnings: string[];
  timestamp: string;
  runtime: {
    cpu_cores: number;
    cpu_percent: number;
    memory: {
      rss_mb: number;
      heap_used_mb: number;
      heap_total_mb: number;
      system_free_mb: number;
      system_total_mb: number;
    };
  };
  database: { connected: boolean; latency_ms: number };
  pgvector: { extension: boolean; hnsw_index: boolean; indexed_chunks: number };
  worker: { pending: number; running: number; failed: number; oldestPendingMs: number };
}

/**
 * Thanh ghi trạng thái hệ thống (`Yêu cầu dự án.md` §2.4).
 *
 * Đọc lại mỗi 15 giây và CHỈ khi tab đang hiển thị: một bảng chẩn đoán bỏ quên
 * trong tab nền sẽ tự tạo tải cho đúng máy chủ mà nó đang theo dõi. Quay lại tab
 * cũng kích hoạt một lần đọc, vì số đo của 15 phút trước không còn nói lên điều
 * gì về hiện tại.
 */
function useHealthDiagnostics(): AsyncState<HealthDiagnostics> {
  const state = useAsync(() => api.get<HealthDiagnostics>("/health/diagnostics"), []);
  const { refetch } = state;

  React.useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void refetch();
    };

    const timer = setInterval(tick, 15_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refetch]);

  return state;
}

/* ==========================================================================
   PAGE
   ========================================================================== */

export default function AdminStatisticsPage() {
  /* Hai endpoint cùng dành riêng cho Admin và cùng đọc một cơ sở dữ liệu: gọi
     song song rồi gộp về MỘT trạng thái tải, để trang chỉ có một nút "Thử lại"
     thay vì bắt Admin bấm lại từng khối khi mạng chập. */
  const { data, loading, error, refetch } = useAsync(async () => {
    const [statistics, ai] = await Promise.all([adminApi.statistics(), aiApi.stats()]);
    return { statistics, ai };
  }, []);

  const health = useHealthDiagnostics();
  const warnings = health.data?.warnings ?? [];

  return (
    <div>
      <PageHeader
        title="Vận hành hệ thống AI"
        description="Số liệu người dùng, đề tài, mức sử dụng AI và trạng thái vận hành của hệ thống."
      />

      {/* Cảnh báo vận hành đứng trước mọi con số: nếu hàng đợi đang ùn hoặc CSDL
          đang chậm thì chính các số liệu bên dưới cũng đang được đọc chậm. */}
      {warnings.length > 0 && (
        <div
          className="flex items-start gap-2.5 px-3 py-2.5 rounded-[10px] mb-6"
          style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)" }}
          role="alert"
        >
          <Warning size={16} weight="fill" className="text-warning flex-shrink-0 mt-px" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium">
              Hệ thống đang suy giảm — {warnings.length} cảnh báo
            </p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {warnings.map((w) => (
                <li key={w} className="text-[12.5px] text-secondary">
                  {w}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {error ? (
        <EmptyState
          icon={<Warning size={16} />}
          title="Không tải được số liệu thống kê"
          description={error}
          action={
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
        />
      ) : loading && !data ? (
        <StatisticsSkeleton />
      ) : data ? (
        <>
          <KpiCards statistics={data.statistics} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ThesisDistribution statistics={data.statistics} />
            <WeeklyAiUsage weekly={data.statistics.ai_usage_weekly} />
          </div>

          <AiDetailSection stats={data.ai} />
        </>
      ) : null}

      <SystemHealth state={health} />
    </div>
  );
}

/* ==========================================================================
   UC 2.6 — SỐ LIỆU TỔNG QUAN
   ========================================================================== */

function KpiCards({ statistics }: { statistics: AdminStatistics }) {
  const ongoing = statistics.theses.by_status.find((s) => s.status === "ONGOING")?.count ?? 0;

  const metrics = [
    {
      label: "Tổng số sinh viên",
      value: formatNumber(statistics.users.students),
      icon: <Users size={20} />,
      color: "var(--info)",
    },
    {
      label: "Tổng số giảng viên",
      value: formatNumber(statistics.users.lecturers),
      icon: <GraduationCap size={20} />,
      color: "var(--accent)",
    },
    {
      label: "Đề tài đang thực hiện",
      value: formatNumber(ongoing),
      icon: <TrendUp size={20} />,
      color: "var(--success)",
    },
    {
      label: "Lượt hỏi AI (RAG)",
      value: formatNumber(statistics.ai.total_messages),
      icon: <Robot size={20} />,
      color: "var(--warning)",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {metrics.map((m) => (
        <Card key={m.label} className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[12px] font-medium uppercase text-tertiary">{m.label}</span>
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "var(--bg-surface)", color: m.color }}
            >
              {m.icon}
            </div>
          </div>
          <p className="text-2xl font-semibold">{m.value}</p>
        </Card>
      ))}
    </div>
  );
}

function ThesisDistribution({ statistics }: { statistics: AdminStatistics }) {
  return (
    <Card className="p-5">
      <h2 className="text-[15px] font-semibold mb-4 flex items-center gap-2">
        <GraduationCap size={18} style={{ color: "var(--accent)" }} />
        Phân bố trạng thái đề tài
      </h2>

      {statistics.theses.total === 0 ? (
        <EmptyState
          compact
          icon={<GraduationCap size={16} />}
          title="Chưa có đề tài nào"
          description="Biểu đồ xuất hiện sau khi sinh viên gửi đề tài đầu tiên và giảng viên xét duyệt."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {statistics.theses.by_status.map((item) => (
            <div key={item.status} className="flex flex-col gap-1.5">
              <div className="flex justify-between text-[13px]">
                <span className="text-secondary">{item.label}</span>
                <span className="font-mono text-primary font-medium">
                  {formatNumber(item.count)} đề tài ({item.percent}%)
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden bg-[var(--bg-hover)]">
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
  );
}

function WeeklyAiUsage({ weekly }: { weekly: AdminStatistics["ai_usage_weekly"] }) {
  // Chuẩn hoá theo tuần cao nhất chứ không theo một trần cố định: mức sử dụng
  // của một khoa nhỏ và của cả trường chênh nhau hàng chục lần, cột phải đọc
  // được ở cả hai quy mô.
  const peak = weekly.reduce((max, w) => Math.max(max, w.count), 0);

  return (
    <Card className="p-5">
      <h2 className="text-[15px] font-semibold mb-4 flex items-center gap-2">
        <Robot size={18} style={{ color: "var(--accent)" }} />
        Tần suất sử dụng AI Assistant (12 tuần gần đây)
      </h2>

      {peak === 0 ? (
        <EmptyState
          compact
          icon={<Robot size={16} />}
          title="Chưa có lượt gọi AI nào"
          description="Biểu đồ bắt đầu có dữ liệu ngay khi sinh viên hoặc giảng viên hỏi trợ lý lần đầu."
        />
      ) : (
        <div className="flex items-end justify-between gap-2 h-48 pt-6">
          {weekly.map((w, idx) => (
            <div key={w.week} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
              <div
                className="w-full rounded-t-sm transition-all duration-300 hover:opacity-80"
                style={{
                  /* Tuần không có lượt nào vẫn giữ một vạch mỏng: cột cao 0px
                     biến mất khỏi trục và người đọc sẽ tưởng biểu đồ chỉ có 9
                     tuần thay vì 12. */
                  height: w.count === 0 ? "2px" : `${Math.max((w.count / peak) * 100, 2)}%`,
                  background: "var(--accent)",
                }}
                title={`Tuần từ ${formatDate(w.week)}: ${formatNumber(w.count)} lượt`}
              />
              <span className="text-[10px] text-tertiary">T{idx + 1}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ==========================================================================
   UC 9.3 — THỐNG KÊ AI CHI TIẾT
   ========================================================================== */

function AiDetailSection({ stats }: { stats: AIStats }) {
  const featureTotal = stats.by_feature.reduce((sum, f) => sum + f.count, 0);
  const topCited = stats.top_cited_documents.slice(0, 5);
  const rated = stats.rating.like + stats.rating.dislike;
  const satisfaction = rated > 0 ? Math.round((stats.rating.like / rated) * 100) : 0;

  return (
    <>
      <h2 className="eyebrow mt-6 mb-3">Vận hành trợ lý AI</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <h3 className="text-[15px] font-semibold mb-4 flex items-center gap-2">
            <Sparkle size={18} style={{ color: "var(--accent)" }} />
            Lượt gọi theo tính năng
          </h3>

          {featureTotal === 0 ? (
            <EmptyState
              compact
              icon={<Sparkle size={16} />}
              title="Chưa có lượt gọi AI nào"
              description="Mở trợ lý AI hoặc chạy tìm kiếm ngữ nghĩa để hệ thống bắt đầu ghi nhận."
            />
          ) : (
            <div className="flex flex-col gap-4">
              {stats.by_feature.map((f) => {
                // `share` từ backend là TỶ LỆ 0–1 (ai.service.ts nói rõ điều này),
                // nhân 100 ở tầng hiển thị chứ không dùng thẳng làm phần trăm.
                const percent = Math.round(f.share * 100);
                return (
                  <div key={f.feature} className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-[13px]">
                      <span className="text-secondary">
                        {AI_FEATURE_LABELS[f.feature] ?? f.feature}
                      </span>
                      <span className="font-mono text-primary font-medium">
                        {formatNumber(f.count)} lượt ({percent}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden bg-[var(--bg-hover)]">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${percent}%`, background: "var(--accent)" }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="text-[15px] font-semibold mb-4 flex items-center gap-2">
            <Quotes size={18} style={{ color: "var(--accent)" }} />
            Tài liệu được AI trích dẫn nhiều nhất
          </h3>

          {topCited.length === 0 ? (
            <EmptyState
              compact
              icon={<Quotes size={16} />}
              title="Chưa có trích dẫn nào"
              description="Tài liệu phải được lập chỉ mục xong thì trợ lý mới trích dẫn và tính vào bảng này."
            />
          ) : (
            <ul className="flex flex-col">
              {topCited.map((doc, i) => (
                <li
                  key={doc.document_id}
                  className="flex items-center gap-3 py-2"
                  style={{ borderTop: i > 0 ? "1px solid var(--border-secondary)" : undefined }}
                >
                  <span className="text-[11px] text-muted tnum w-4 flex-shrink-0">{i + 1}</span>
                  <span
                    className="text-[13px] text-secondary truncate flex-1 min-w-0"
                    title={doc.filename}
                  >
                    {doc.filename}
                  </span>
                  <span className="text-[13px] font-mono text-primary font-medium flex-shrink-0">
                    {formatNumber(doc.count)} lượt
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="text-[15px] font-semibold mb-4 flex items-center gap-2">
            <ThumbsUp size={18} style={{ color: "var(--accent)" }} />
            Mức độ hài lòng với câu trả lời
          </h3>

          {rated === 0 ? (
            <EmptyState
              compact
              icon={<ThumbsUp size={16} />}
              title="Chưa có lượt đánh giá nào"
              description="Người dùng bấm Thích / Không thích ngay dưới mỗi câu trả lời của trợ lý."
            />
          ) : (
            <>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-2xl font-semibold tnum">{satisfaction}%</span>
                <span className="text-[12.5px] text-tertiary">
                  hài lòng trên {formatNumber(rated)} lượt đánh giá
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden bg-[var(--bg-hover)] mb-4">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${satisfaction}%`, background: "var(--success)" }}
                />
              </div>
              <div className="flex items-center gap-6 text-[13px]">
                <span className="flex items-center gap-1.5 text-secondary">
                  <ThumbsUp size={15} style={{ color: "var(--success)" }} />
                  Thích
                  <span className="font-mono text-primary font-medium">
                    {formatNumber(stats.rating.like)}
                  </span>
                </span>
                <span className="flex items-center gap-1.5 text-secondary">
                  <ThumbsDown size={15} style={{ color: "var(--danger)" }} />
                  Không thích
                  <span className="font-mono text-primary font-medium">
                    {formatNumber(stats.rating.dislike)}
                  </span>
                </span>
              </div>
            </>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="text-[15px] font-semibold mb-4 flex items-center gap-2">
            <Stack size={18} style={{ color: "var(--accent)" }} />
            Model đang được sử dụng
          </h3>

          {stats.model_usage.length === 0 ? (
            <EmptyState
              compact
              icon={<Stack size={16} />}
              title="Chưa ghi nhận model nào"
              description="Tên model được lưu cùng từng câu trả lời, nên số liệu chỉ có sau lượt hỏi đầu tiên."
            />
          ) : (
            <ul className="flex flex-col">
              {stats.model_usage.map((m, i) => (
                <li
                  key={m.model_name}
                  className="flex items-center gap-3 py-2"
                  style={{ borderTop: i > 0 ? "1px solid var(--border-secondary)" : undefined }}
                >
                  <span
                    className="text-[13px] text-secondary truncate flex-1 min-w-0"
                    title={m.model_name}
                  >
                    {m.model_name}
                  </span>
                  <span className="text-[13px] font-mono text-primary font-medium flex-shrink-0">
                    {formatNumber(m.count)} lượt
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

/* ==========================================================================
   SỨC KHOẺ HỆ THỐNG (Yêu cầu dự án §2.4)
   ========================================================================== */

function SystemHealth({ state }: { state: AsyncState<HealthDiagnostics> }) {
  const { data, loading, error, refetch } = state;
  const memory = data?.runtime.memory;

  return (
    <Card className="p-5 mt-6">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-[15px] font-semibold flex items-center gap-2">
          <Heartbeat size={18} style={{ color: "var(--accent)" }} />
          Sức khoẻ hệ thống
        </h2>

        {data && (
          <div className="flex items-center gap-2">
            <Badge variant={data.status === "NOMINAL" ? "success" : "warning"} dot>
              {data.status}
            </Badge>
            {/* Không có mốc thời gian thì người xem không phân biệt được bảng
                đang cập nhật hay đã đứng im từ lúc mở trang. */}
            <span className="text-[11px] text-tertiary">
              Đọc lúc {formatRelative(data.timestamp)}
            </span>
          </div>
        )}
      </div>

      {error && !data ? (
        <EmptyState
          compact
          icon={<Warning size={16} />}
          title="Không đọc được trạng thái hệ thống"
          description={error}
          action={
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
        />
      ) : loading && !data ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[52px] rounded-[8px]" />
          ))}
        </div>
      ) : data && memory ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <HealthMetric
              label="CPU"
              value={formatPercent(data.runtime.cpu_percent, 1)}
              sublabel={`${data.runtime.cpu_cores} nhân`}
            />
            <HealthMetric
              label="RAM tiến trình"
              value={`${formatNumber(Math.round(memory.rss_mb))} MB`}
              sublabel={`Heap ${Math.round(memory.heap_used_mb)}/${Math.round(memory.heap_total_mb)} MB`}
            />
            {/* Ngưỡng 500ms lấy đúng theo `health.routes.ts`, để màu trên giao
                diện không nói khác với danh sách cảnh báo do server sinh ra. */}
            <HealthMetric
              label="Độ trễ CSDL"
              value={`${formatNumber(data.database.latency_ms)} ms`}
              sublabel={data.database.connected ? "Đã kết nối" : "Mất kết nối"}
              tone={
                !data.database.connected
                  ? "var(--danger)"
                  : data.database.latency_ms > 500
                  ? "var(--warning)"
                  : undefined
              }
            />
            <HealthMetric
              label="Đoạn đã vector hoá"
              value={formatNumber(data.pgvector.indexed_chunks)}
              sublabel={data.pgvector.hnsw_index ? "Chỉ mục HNSW sẵn sàng" : "Thiếu chỉ mục HNSW"}
              tone={data.pgvector.hnsw_index ? undefined : "var(--warning)"}
            />
            <HealthMetric
              label="Hàng đợi worker"
              value={formatNumber(data.worker.pending)}
              sublabel={`${data.worker.running} đang chạy`}
              tone={data.worker.pending > 20 ? "var(--warning)" : undefined}
            />
          </div>

          {data.warnings.length > 0 && (
            <ul
              className="flex flex-col gap-1.5 mt-4 pt-4"
              style={{ borderTop: "1px solid var(--border-secondary)" }}
            >
              {data.warnings.map((w) => (
                <li key={w} className="flex items-start gap-2 text-[12.5px] text-secondary">
                  <Warning size={14} weight="fill" className="text-warning flex-shrink-0 mt-px" />
                  {w}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </Card>
  );
}

function HealthMetric({
  label,
  value,
  sublabel,
  tone,
}: {
  label: string;
  value: string;
  sublabel: string;
  tone?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[11px] font-medium uppercase text-tertiary truncate">{label}</span>
      <span
        className="text-[17px] font-semibold tnum leading-tight"
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </span>
      <span className="text-[11.5px] text-muted truncate">{sublabel}</span>
    </div>
  );
}

/* ==========================================================================
   TRẠNG THÁI TẢI
   ========================================================================== */

/* Khung xám đứng đúng chỗ của KPI, hai biểu đồ và bốn thẻ AI, nên khi số liệu
   về thì bố cục không nhảy — chuyển động đó tốn của người đọc một nhịp định vị
   lại, còn spinner giữa màn hình thì không nói được gì về thứ sắp hiện ra. */
function StatisticsSkeleton() {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[104px] rounded-[12px]" />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-[268px] rounded-[12px]" />
        <Skeleton className="h-[268px] rounded-[12px]" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[210px] rounded-[12px]" />
        ))}
      </div>
    </>
  );
}

"use client";

import React from "react";
import {
  ChatCircleDots,
  Heartbeat,
  Quotes,
  Robot,
  Sparkle,
  Stack,
  ThumbsDown,
  ThumbsUp,
  Warning,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/layout";
import { Badge, Button, Card, EmptyState, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { useAsync, type AsyncState } from "@/lib/use-async";
import { adminApi, aiApi, type AdminStatistics, type AIStats } from "@/lib/services";
import { formatDate, formatNumber, formatPercent, formatRelative } from "@/lib/format";

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
        description="Mức sử dụng trợ lý AI và trạng thái vận hành của hệ thống."
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

      {/* Sức khoẻ hệ thống đứng TRƯỚC số liệu AI và nằm ngoài nhánh tải của
          `/admin/statistics`: nó đọc từ `/health/diagnostics` — một endpoint
          khác — nên vẫn phải hiện được đúng lúc endpoint thống kê hỏng. Đó cũng
          chính là lúc người ta cần nó nhất. */}
      <SystemHealth state={health} />

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
          <AiKpiCards statistics={data.statistics} stats={data.ai} health={health.data} />

          {/* Biểu đồ tuần chiếm trọn chiều ngang từ khi biểu đồ phân bố trạng
              thái đề tài rời khỏi trang: 12 cột trong nửa màn hình thì chênh
              lệch giữa hai tuần liền nhau nhỏ hơn bề rộng một cột. */}
          <WeeklyAiUsage weekly={data.statistics.ai_usage_weekly} />

          <AiDetailSection stats={data.ai} />
        </>
      ) : null}
    </div>
  );
}

/* ==========================================================================
   KPI — CHỈ VỀ AI VÀ VẬN HÀNH

   Bốn thẻ cũ đếm sinh viên, giảng viên và đề tài đang chạy. Không con số nào
   trong đó nói được điều gì về hệ thống AI, mà đây là trang "Vận hành hệ thống
   AI" — ba phần tư diện tích đầu màn hình dành cho thứ tiêu đề không hứa. Số
   người dùng và phân bố đề tài đã có ở trang Tổng quan; ở đây chúng chỉ làm
   loãng thứ Admin mở trang này để xem.
   ========================================================================== */

function AiKpiCards({
  statistics,
  stats,
  health,
}: {
  statistics: AdminStatistics;
  stats: AIStats;
  health: HealthDiagnostics | null;
}) {
  /* Tính năng được dùng nhiều nhất. `reduce` chứ không `sort`: chỉ cần phần tử
     lớn nhất, và sắp xếp một mảng thuộc về props là sửa dữ liệu của người khác. */
  const topFeature = stats.by_feature.reduce<AIStats["by_feature"][number] | null>(
    (best, f) => (best === null || f.count > best.count ? f : best),
    null
  );

  const metrics = [
    {
      label: "Tổng lượt trả lời AI",
      value: formatNumber(statistics.ai.total_messages),
      sublabel: "toàn thời gian",
      icon: <Robot size={20} />,
      color: "var(--accent)",
    },
    {
      label: "Tổng số hội thoại",
      value: formatNumber(statistics.ai.total_sessions),
      sublabel: "phiên đã tạo",
      icon: <ChatCircleDots size={20} />,
      color: "var(--info)",
    },
    {
      label: "Tính năng dùng nhiều nhất",
      value: topFeature
        ? (AI_FEATURE_LABELS[topFeature.feature] ?? topFeature.feature)
        : "—",
      sublabel: topFeature ? `${formatNumber(topFeature.count)} lượt` : "chưa có dữ liệu",
      icon: <Sparkle size={20} />,
      color: "var(--success)",
    },
    {
      label: "Trạng thái hệ thống",
      value: health?.status ?? "—",
      sublabel: health
        ? health.warnings.length > 0
          ? `${health.warnings.length} cảnh báo`
          : "không có cảnh báo"
        : "đang đọc…",
      icon: <Heartbeat size={20} />,
      // Màu bám theo chính trạng thái: một thẻ ghi DEGRADED bằng màu trung tính
      // thì không khác gì không ghi.
      color: health?.status === "DEGRADED" ? "var(--warning)" : "var(--success)",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {metrics.map((m) => (
        <Card key={m.label} className="p-4">
          <div className="flex items-center justify-between mb-3 gap-2">
            <span className="text-[12px] font-medium uppercase text-tertiary">{m.label}</span>
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--bg-surface)", color: m.color }}
            >
              {m.icon}
            </div>
          </div>
          {/* Nhãn tính năng dài hơn hẳn một con số, nên cỡ chữ co lại theo độ
              dài thay vì tràn ra khỏi thẻ. */}
          <p className={m.value.length > 12 ? "text-base font-semibold" : "text-2xl font-semibold"}>
            {m.value}
          </p>
          <span className="text-[11px] text-tertiary">{m.sublabel}</span>
        </Card>
      ))}
    </div>
  );
}

function WeeklyAiUsage({ weekly }: { weekly: AdminStatistics["ai_usage_weekly"] }) {
  // Chuẩn hoá theo tuần cao nhất chứ không theo một trần cố định: mức sử dụng
  // của một khoa nhỏ và của cả trường chênh nhau hàng chục lần, cột phải đọc
  // được ở cả hai quy mô.
  const peak = weekly.reduce((max, w) => Math.max(max, w.count), 0);

  return (
    <Card className="p-5 mb-6">
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
    <Card className="p-5 mb-6">
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

/* Khung xám đứng đúng chỗ của KPI, biểu đồ tuần và bốn thẻ AI, nên khi số liệu
   về thì bố cục không nhảy — chuyển động đó tốn của người đọc một nhịp định vị
   lại, còn spinner giữa màn hình thì không nói được gì về thứ sắp hiện ra. */
function StatisticsSkeleton() {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[118px] rounded-[12px]" />
        ))}
      </div>

      <Skeleton className="h-[268px] rounded-[12px] mb-6" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[210px] rounded-[12px]" />
        ))}
      </div>
    </>
  );
}

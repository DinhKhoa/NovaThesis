"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowUp,
  Check,
  CheckCircle,
  Clock,
  Copy,
  FileText,
  GraduationCap,
  ListChecks,
  MagnifyingGlass,
  Plus,
  Robot,
  Scales,
  Sparkle,
  Stop,
  ThumbsDown,
  ThumbsUp,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/layout";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Input,
  Panel,
  ProgressBar,
  Select,
  Skeleton,
  Tabs,
  Textarea,
} from "@/components/ui";
import { RequireRole } from "@/lib/guards";
import { toast } from "@/lib/toast";
import { isApiError } from "@/lib/api";
import { useAsync } from "@/lib/use-async";
import {
  aiApi,
  documentsApi,
  streamChat,
  thesesApi,
  type AISuggestion,
  type AIStatus,
  type AnswerMode,
  type ChatMessage,
  type ChatSession,
  type ChatSource,
  type Citation,
  type PlagiarismResult,
  type Thesis,
} from "@/lib/services";
import { formatDate, formatPercent, formatRelative, formatTime } from "@/lib/format";

/* ==========================================================================
   CẦU NỐI VỚI TẦNG DỊCH VỤ
   ========================================================================== */

/** Id tạm của tin nhắn đang nhận token. Số âm nên không thể trùng id thật. */
const STREAMING_MESSAGE_ID = -1;

/**
 * Mở tệp gốc của một nguồn trích dẫn (UC 6.6).
 *
 * Không dùng `documentsApi.downloadUrl()`: đường dẫn `/documents/:id/download-url`
 * không tồn tại ở backend. Liên kết đã ký nằm trong trường `download_url` của
 * chính bản ghi tài liệu, và nó là `null` khi người xem chỉ được chia sẻ phần mô
 * tả (business rule UC 5.10).
 *
 * Tab được mở TRƯỚC khi `await`: trình duyệt chỉ cho `window.open` chạy trong
 * cùng nhịp xử lý cú nhấp chuột, gọi sau khi request về sẽ bị chặn pop-up.
 */
async function openSourceDocument(documentId: number): Promise<void> {
  const tab = window.open("about:blank", "_blank");
  if (tab) tab.opener = null;

  try {
    const document = await documentsApi.get(documentId);
    if (!document.download_url) {
      tab?.close();
      toast.error("Tài liệu này được chia sẻ ở chế độ chỉ đọc, không mở được tệp gốc.");
      return;
    }
    if (tab) tab.location.href = document.download_url;
    else window.open(document.download_url, "_blank");
  } catch (err) {
    tab?.close();
    toast.error(isApiError(err) ? err.message : "Không mở được tài liệu nguồn.");
  }
}

/* ==========================================================================
   MESSAGE RENDERING
   ========================================================================== */

/* Lightweight inline formatting. A full markdown parser is overkill for what
   the model actually emits here, and pulling one in would ship ~40KB. */
function renderInline(text: string, keyPrefix: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={`${keyPrefix}-${i}`} className="font-semibold text-primary">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={`${keyPrefix}-${i}`}
          className="font-mono text-[12px] px-1 py-px rounded"
          style={{ background: "var(--bg-sunken)" }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={`${keyPrefix}-${i}`}>{part}</React.Fragment>;
  });
}

/**
 * Nhãn mở đầu khối kiến thức ngoài tài liệu.
 *
 * Phải khớp TỪNG KÝ TỰ với `GENERAL_KNOWLEDGE_MARKER` trong
 * `backend/src/services/ai/rag.ts`. Lệch một dấu cách thì khối cảnh báo không
 * được tách ra, và phần AI tự suy luận sẽ hiển thị y hệt phần có trích dẫn —
 * đúng thứ nguy hiểm nhất mà chế độ HYBRID phải tránh.
 */
const GENERAL_KNOWLEDGE_MARKER = "⚠ Ngoài tài liệu của bạn:";

function Paragraphs({
  text,
  streaming,
  keyPrefix,
}: {
  text: string;
  streaming?: boolean;
  keyPrefix: string;
}) {
  const paragraphs = text.split("\n\n");
  return (
    <>
      {paragraphs.map((p, i) => (
        <p key={`${keyPrefix}-${i}`}>
          {renderInline(p, `${keyPrefix}-${i}`)}
          {streaming && i === paragraphs.length - 1 && (
            <span className="stream-caret" aria-hidden="true" />
          )}
        </p>
      ))}
    </>
  );
}

function MessageBody({
  content,
  streaming,
}: {
  content: string;
  streaming?: boolean;
}) {
  /* Tách phần dựa-trên-tài-liệu khỏi phần kiến-thức-chung.

     Đây là lý do tồn tại của chế độ HYBRID. Cho phép trợ lý dùng kiến thức ngoài
     tài liệu mà không tách bạch hai phần thì tệ hơn hẳn chế độ STRICT: một câu
     model tự suy ra sẽ đọc y như một câu có nguồn, và người dùng không có cách
     nào phân biệt. Khối dưới đây có nền cảnh báo riêng và nói thẳng điều đó. */
  const markerAt = content.indexOf(GENERAL_KNOWLEDGE_MARKER);
  const grounded = markerAt === -1 ? content : content.slice(0, markerAt).trimEnd();
  const general =
    markerAt === -1
      ? null
      : content.slice(markerAt + GENERAL_KNOWLEDGE_MARKER.length).trimStart();

  return (
    <div className="text-[13.5px] leading-[1.65] text-secondary flex flex-col gap-2">
      {grounded && (
        <Paragraphs
          text={grounded}
          keyPrefix="g"
          streaming={streaming && general === null}
        />
      )}

      {general !== null && (
        <div
          className="mt-1 px-3 py-2.5 rounded-[10px] flex flex-col gap-2"
          style={{
            background: "var(--warning-bg)",
            border: "1px solid var(--warning-border)",
          }}
        >
          <span className="text-[11.5px] font-semibold text-warning flex items-center gap-1.5">
            <Warning size={13} weight="fill" />
            Ngoài tài liệu của bạn — không có nguồn trích dẫn
          </span>
          <Paragraphs text={general} keyPrefix="x" streaming={streaming} />
        </div>
      )}
    </div>
  );
}

/* Citations are the trust surface of a RAG answer — they sit directly under
   the text, numbered, with the matched snippet one click away. */
function Citations({ citations }: { citations: Citation[] }) {
  const [expanded, setExpanded] = React.useState<number | null>(null);

  return (
    <div className="mt-2.5">
      <div className="eyebrow mb-1.5">Nguồn trích dẫn</div>
      <ol className="flex flex-col gap-1">
        {citations.map((c, i) => {
          const open = expanded === i;
          return (
            <li key={`${c.chunk_id}-${i}`}>
              {/* Một hàng, hai đích đến: tên tài liệu mở tệp gốc để đối chiếu
                  nguyên văn, phần điểm số bung đoạn trích đã dùng. Nút lồng
                  trong nút là HTML không hợp lệ, nên hàng là <div> còn hai vùng
                  bấm là hai <button> — giao diện không đổi một pixel nào. */}
              <div
                className="row-hover w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover:bg-[var(--bg-hover)]"
                style={{ border: "1px solid var(--border-secondary)" }}
              >
                <button
                  onClick={() => void openSourceDocument(c.document_id)}
                  className="flex items-center gap-2 flex-1 min-w-0 text-left"
                  title={`Mở tài liệu ${c.doc_title}`}
                >
                  <span
                    className="w-4 h-4 rounded-[4px] flex items-center justify-center text-[10px] font-semibold flex-shrink-0 tnum"
                    style={{
                      background: "var(--accent-subtle)",
                      color: "var(--accent)",
                    }}
                  >
                    {i + 1}
                  </span>
                  <FileText size={13} className="text-tertiary flex-shrink-0" />
                  <span className="text-[12.5px] truncate flex-1 min-w-0">
                    {c.doc_title}
                  </span>
                </button>

                <button
                  onClick={() => setExpanded(open ? null : i)}
                  aria-expanded={open}
                  aria-label={open ? "Ẩn đoạn trích dẫn" : "Xem đoạn trích dẫn"}
                  className="flex items-center gap-2 flex-shrink-0"
                >
                  {c.page && (
                    <span className="text-[11.5px] text-muted tnum whitespace-nowrap">
                      tr. {c.page}
                    </span>
                  )}
                  <span
                    className="text-[11px] tnum whitespace-nowrap"
                    style={{ color: "var(--accent)" }}
                    title="Độ tương đồng ngữ nghĩa"
                  >
                    {(c.score * 100).toFixed(0)}%
                  </span>
                </button>
              </div>

              {open && c.snippet && (
                <blockquote
                  className="mt-1 ml-6 px-2.5 py-2 text-[12.5px] text-tertiary leading-relaxed rounded-md fade-in"
                  style={{
                    background: "var(--bg-subtle)",
                    borderLeft: "2px solid var(--accent)",
                  }}
                >
                  {c.snippet}
                </blockquote>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * Bộ chọn phạm vi đề tài — cấp cao nhất của mô hình "notebook".
 *
 * LUÔN hiển thị, kể cả khi chỉ có một đề tài. Trước đây nó tự ẩn trong trường
 * hợp đó, với lý do "một lựa chọn duy nhất không cho thêm thông tin gì". Lý do
 * ấy sai ở một chỗ quan trọng: người dùng không nhìn ô này để CHỌN, họ nhìn để
 * biết câu hỏi sắp tới sẽ được đối chiếu với kho tài liệu nào. Ẩn đi thì phạm vi
 * trở thành trạng thái vô hình.
 */
function ThesisScopeSelect({
  theses,
  value,
  onChange,
}: {
  theses: Thesis[];
  value: number | null;
  onChange: (id: number) => void;
}) {
  if (theses.length === 0) return null;

  const only = theses.length === 1 ? theses[0] : null;

  if (only) {
    return (
      <div
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-[8px] min-w-0"
        style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-secondary)" }}
        title={only.title}
      >
        <GraduationCap size={13} className="text-tertiary flex-shrink-0" />
        <span className="text-[12px] text-secondary truncate">{only.title}</span>
      </div>
    );
  }

  return (
    <Select
      value={value ?? ""}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label="Đề tài — phạm vi tài liệu của trợ lý"
    >
      {theses.map((t) => (
        <option key={t.id} value={t.id}>
          {t.title}
        </option>
      ))}
    </Select>
  );
}

/* ==========================================================================
   BẢNG NGUỒN (kiểu NotebookLM)
   ========================================================================== */

const SOURCE_STATUS: Record<
  AIStatus,
  { icon: React.ReactNode; label: string; usable: boolean }
> = {
  DONE: {
    icon: <CheckCircle size={12} weight="fill" className="text-success" />,
    label: "Đã lập chỉ mục",
    usable: true,
  },
  PENDING: {
    icon: <Clock size={12} className="text-warning" />,
    label: "Đang chờ lập chỉ mục",
    usable: false,
  },
  PROCESSING: {
    icon: <Clock size={12} className="text-warning" />,
    label: "Đang lập chỉ mục",
    usable: false,
  },
  ERROR: {
    icon: <Warning size={12} weight="fill" className="text-danger" />,
    label: "Lỗi xử lý — không dùng làm nguồn được",
    usable: false,
  },
};

/**
 * Danh sách tài liệu kèm ô tick, quyết định trợ lý được đọc những gì.
 *
 * Đây là phần thiếu lớn nhất so với NotebookLM trước đợt sửa này: mọi câu hỏi
 * đều truy xuất TOÀN BỘ tài liệu của đề tài, nên tải năm tài liệu thuộc năm chủ
 * đề lên rồi hỏi thì trợ lý trộn trích dẫn từ cả năm và không có cách nào biết
 * câu hỏi nhắm vào cái nào.
 */
function SourcePanel({
  sources,
  selectedIds,
  onToggle,
  onSelectAll,
  onClearAll,
  loading,
  error,
  onRetry,
  onUpload,
  disabled,
}: {
  sources: ChatSource[];
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onUpload: () => void;
  /** Khoá thao tác trong lúc trợ lý đang trả lời — đổi nguồn giữa chừng là vô nghĩa. */
  disabled: boolean;
}) {
  const usable = sources.filter((s) => SOURCE_STATUS[s.status_ai].usable);
  const allSelected = usable.length > 0 && usable.every((s) => selectedIds.has(s.id));

  return (
    <Card hoverable={false} className="p-2 flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="eyebrow">
          Nguồn{" "}
          <span className="tnum normal-case tracking-normal">
            {selectedIds.size}/{sources.length}
          </span>
        </span>
        {usable.length > 0 && (
          <button
            onClick={allSelected ? onClearAll : onSelectAll}
            disabled={disabled}
            className="text-[11px] text-accent hover:underline disabled:opacity-40 disabled:no-underline"
          >
            {allSelected ? "Bỏ chọn" : "Chọn tất cả"}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-px max-h-[18rem] overflow-y-auto">
        {loading && sources.length === 0 ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-9 rounded-md" />)
        ) : error ? (
          <EmptyState
            compact
            icon={<Warning size={15} />}
            title="Không tải được nguồn"
            description={error}
            action={
              <Button variant="secondary" size="sm" onClick={onRetry}>
                Thử lại
              </Button>
            }
          />
        ) : sources.length === 0 ? (
          <EmptyState
            compact
            icon={<FileText size={15} />}
            title="Chưa có tài liệu nào"
            description="Tải tài liệu lên để trợ lý có nguồn đối chiếu."
          />
        ) : (
          sources.map((s) => {
            const status = SOURCE_STATUS[s.status_ai];
            const checked = selectedIds.has(s.id);
            return (
              <label
                key={s.id}
                className={`flex items-start gap-2 px-1.5 py-1.5 rounded-md transition-colors ${
                  status.usable && !disabled
                    ? "cursor-pointer hover:bg-[var(--bg-hover)]"
                    : "cursor-not-allowed opacity-60"
                }`}
                title={s.summary ?? s.filename}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!status.usable || disabled}
                  onChange={() => onToggle(s.id)}
                  className="mt-0.5 flex-shrink-0"
                  aria-label={`Dùng “${s.filename}” làm nguồn`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] text-secondary truncate">
                    {s.filename}
                  </span>
                  {/* Trạng thái lập chỉ mục hiện NGAY TẠI ĐÂY. Trước đây phải
                      sang trang Tài liệu mới biết tệp nào đã xử lý xong, nên hỏi
                      về một tệp còn PENDING chỉ nhận lại "không tìm thấy" mà
                      không hiểu vì sao. */}
                  <span
                    className="flex items-center gap-1 text-[10.5px] text-muted"
                    title={s.ai_error ?? status.label}
                  >
                    {status.icon}
                    {status.label}
                    {s.page_count ? ` · ${s.page_count} trang` : ""}
                  </span>
                </span>
              </label>
            );
          })
        )}
      </div>

      <Button
        variant="ghost"
        size="sm"
        icon={<Plus size={13} />}
        onClick={onUpload}
        className="w-full"
      >
        Thêm tài liệu
      </Button>
    </Card>
  );
}

/** Chuyển giữa "chỉ tài liệu" và "tài liệu + kiến thức AI". */
function AnswerModeToggle({
  value,
  onChange,
  disabled,
}: {
  value: AnswerMode;
  onChange: (mode: AnswerMode) => void;
  disabled: boolean;
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5 p-0.5 rounded-[8px]"
      style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-secondary)" }}
      role="radiogroup"
      aria-label="Chế độ trả lời"
    >
      {(
        [
          {
            mode: "STRICT" as const,
            label: "Chỉ tài liệu",
            hint: "Không tìm thấy trong tài liệu thì trợ lý nói thẳng là không có.",
          },
          {
            mode: "HYBRID" as const,
            label: "Tài liệu + AI",
            hint: "Được bổ sung kiến thức chung, nhưng phần đó luôn tách riêng và có cảnh báo.",
          },
        ] as const
      ).map((opt) => {
        const active = value === opt.mode;
        return (
          <button
            key={opt.mode}
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(opt.mode)}
            title={opt.hint}
            className="px-2 py-1 rounded-[6px] text-[11.5px] transition-colors disabled:opacity-40"
            style={{
              background: active ? "var(--bg-surface)" : "transparent",
              color: active ? "var(--fg-primary)" : "var(--fg-tertiary)",
              fontWeight: active ? 600 : 400,
              boxShadow: active ? "var(--shadow-sm)" : undefined,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* ==========================================================================
   PAGE
   ========================================================================== */

/**
 * Trợ lý AI KHÔNG mở cho quản trị viên, dù các trang nghiệp vụ khác thì có (ở
 * chế độ chỉ đọc).
 *
 * Lý do là phạm vi truy xuất: `accessibleDocumentIds()` trả `null` — nghĩa là
 * KHÔNG giới hạn — cho vai trò ADMIN. Một câu hỏi của quản trị viên vì thế sẽ
 * kéo về đoạn trích từ luận văn của bất kỳ sinh viên nào trong hệ thống, và trả
 * ra nguyên văn. Đọc bảng danh sách là giám sát; đọc nội dung luận văn của người
 * khác qua trợ lý thì không.
 *
 * Đây là lớp chặn ở giao diện. Nếu về sau cần mở, phải sửa phạm vi ở backend
 * TRƯỚC (bắt buộc `thesis_id` cho ADMIN), không phải gỡ hàng rào này.
 */
export default function AIChatPage() {
  return (
    <RequireRole roles={["STUDENT", "LECTURER"]}>
      <AIChatWorkspace />
    </RequireRole>
  );
}

function AIChatWorkspace() {
  const searchParams = useSearchParams();
  const thesisParam = searchParams.get("thesis");

  const [tool, setTool] = React.useState("chat");

  /* Phạm vi đề tài dùng chung cho cả bốn tab: hỏi đáp và tìm kiếm giới hạn ngữ
     cảnh RAG theo đề tài, còn kiểm tra trùng lặp và gợi ý lộ trình BẮT BUỘC có
     thesis_id. Trang chi tiết đề tài mở sang đây kèm `?thesis=`. */
  const [pickedThesisId, setPickedThesisId] = React.useState<number | null>(
    thesisParam ? Number(thesisParam) : null
  );

  const { data: thesesPage } = useAsync(() => thesesApi.list({ per_page: 100 }), []);
  const theses = React.useMemo(() => thesesPage?.data ?? [], [thesesPage]);

  /* Đề tài đang áp dụng = lựa chọn của người dùng, nếu chưa chọn thì đề tài đầu
     tiên trong phạm vi. Tính ra chứ không đồng bộ bằng `useEffect`: một
     `setState` trong effect chỉ để chọn giá trị mặc định sẽ thêm một vòng render
     cho mỗi lần danh sách đề tài về, và mọi thứ phụ thuộc nó chạy hai lần. */
  const thesisId = pickedThesisId ?? theses[0]?.id ?? null;
  const activeThesis = theses.find((t) => t.id === thesisId) ?? null;

  /* ---- Phiên hội thoại (UC 6.7 / 6.8) ---- */

  const {
    data: sessionsData,
    loading: sessionsLoading,
    error: sessionsError,
    refetch: refetchSessions,
  } = useAsync(() => aiApi.sessions(thesisId ?? undefined), [thesisId]);

  const sessions = sessionsData ?? [];

  /* Hai state cho cùng một phiên, có chủ đích.

     `sessionId` là phiên khung chat đang nói chuyện; `historyOf` là phiên cần
     NẠP lịch sử từ server. Khi câu hỏi đầu tiên tạo ra một phiên mới, ta chỉ đặt
     `sessionId` — nếu đổi luôn `historyOf`, `useAsync` sẽ tải lại danh sách tin
     nhắn và ghi đè đúng câu trả lời đang chạy chữ. */
  const [sessionId, setSessionId] = React.useState<number | null>(null);
  const [historyOf, setHistoryOf] = React.useState<number | null>(null);

  const {
    data: messagesData,
    loading: messagesLoading,
    error: messagesError,
    refetch: refetchMessages,
    setData: setMessages,
  } = useAsync(() => aiApi.messages(historyOf ?? 0), [historyOf], {
    enabled: historyOf !== null,
  });

  const messages = React.useMemo(() => messagesData ?? [], [messagesData]);

  const [deleteTarget, setDeleteTarget] = React.useState<ChatSession | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const [prompt, setPrompt] = React.useState("");
  const [streaming, setStreaming] = React.useState(false);
  const [copiedId, setCopiedId] = React.useState<number | null>(null);

  /* ---- Nguồn và chế độ trả lời (kiểu NotebookLM) ---- */

  /**
   * Danh sách tài liệu có thể làm nguồn.
   *
   * Nạp theo ĐỀ TÀI chứ không theo phiên: bảng nguồn phải hiện ngay cả khi chưa
   * có phiên nào (người dùng chọn nguồn TRƯỚC rồi mới hỏi câu đầu tiên — đúng
   * thứ tự của NotebookLM). Khi đã có phiên, `sessionId` vào deps để lựa chọn đã
   * lưu của phiên đó được nạp lại.
   */
  const {
    data: sourceList,
    loading: sourcesLoading,
    error: sourcesError,
    refetch: refetchSources,
  } = useAsync(async () => {
    if (sessionId !== null) return aiApi.sources(sessionId);

    // Chưa có phiên: mượn danh sách tài liệu của đề tài, mặc định chọn hết.
    if (thesisId === null) return { uses_all: true, data: [] };
    const page = await documentsApi.list({ thesis_id: thesisId, per_page: 200 });
    return {
      uses_all: true,
      data: page.data.map((d) => ({
        id: d.id,
        filename: d.filename,
        status_ai: d.status_ai,
        ai_error: d.ai_error ?? null,
        page_count: d.page_count ?? null,
        summary: d.summary_ai ? d.summary_ai.slice(0, 240) : null,
        thesis_id: d.thesis_id,
        selected: true,
      })),
    };
  }, [sessionId, thesisId]);

  const sources: ChatSource[] = React.useMemo(() => sourceList?.data ?? [], [sourceList]);

  /**
   * Nguồn đang tick.
   *
   * `null` = chưa đụng tới, lấy theo những gì server trả về. Tách bạch "chưa
   * chọn gì" khỏi "đã bỏ chọn hết" là bắt buộc: hai trạng thái này có cùng số 0
   * nhưng ý nghĩa ngược nhau — một cái là dùng tất cả, cái kia là không dùng gì.
   */
  const [pickedSources, setPickedSources] = React.useState<Set<number> | null>(null);

  const selectedSourceIds = React.useMemo(() => {
    if (pickedSources) return pickedSources;
    return new Set(sources.filter((s) => s.selected).map((s) => s.id));
  }, [pickedSources, sources]);

  const [answerMode, setAnswerMode] = React.useState<AnswerMode>("HYBRID");

  /* Có tài liệu nhưng không tick cái nào — khác hẳn "kho tài liệu rỗng", và cần
     một cách xử lý khác hẳn: tick lại, chứ không phải đi tải thêm tệp. */
  const noSourceSelected = sources.length > 0 && selectedSourceIds.size === 0;

  /* Gợi ý câu hỏi dựng từ chính các nguồn đang chọn, thay cho bốn câu viết cứng
     giống nhau ở mọi đề tài. */
  const { data: suggestedPrompts } = useAsync(
    () => aiApi.suggestedPrompts({ thesis_id: thesisId, session_id: sessionId }),
    [thesisId, sessionId]
  );

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const composerRef = React.useRef<HTMLTextAreaElement>(null);
  const abortRef = React.useRef<(() => void) | null>(null);

  /* Follow the stream only while the user is already near the bottom —
     yanking the viewport away from something they scrolled up to read is
     the fastest way to make a chat UI feel hostile. */
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  React.useEffect(() => () => abortRef.current?.(), []);

  const stopStreaming = React.useCallback(() => {
    abortRef.current?.();
    abortRef.current = null;
    setStreaming(false);
    /* Server vẫn lưu phần chữ đã sinh với `finished_at` rỗng, nên đánh dấu
       `incomplete` ngay tại chỗ. Không tải lại tin nhắn ở đây: bản ghi đó được
       ghi SAU khi kết nối đứt, hỏi ngay lúc này sẽ trượt mất nó và xoá luôn
       phần trả lời người dùng vừa đọc. */
    setMessages((prev) =>
      (prev ?? []).map((m) =>
        m.streaming ? { ...m, streaming: false, incomplete: true } : m
      )
    );
  }, [setMessages]);

  /* Đổi phạm vi đề tài là đổi luôn kho tài liệu trợ lý được đọc, nên phiên đang
     mở — vốn thuộc đề tài cũ — phải đóng lại. Hỏi tiếp trong đó vẫn sẽ truy xuất
     tài liệu của đề tài trước, và người dùng không có cách nào nhận ra. */
  const changeThesis = React.useCallback(
    (id: number) => {
      setPickedThesisId(id);
      stopStreaming();
      setSessionId(null);
      setHistoryOf(null);
      setMessages([]);
      // Nguồn thuộc về đề tài cũ. Giữ lại tập đã tick sẽ lọc kho tài liệu mới
      // bằng những id không còn nằm trong đó — kết quả là phạm vi rỗng.
      setPickedSources(null);
    },
    [stopStreaming, setMessages]
  );

  const send = () => {
    const text = prompt.trim();
    if (!text || streaming) return;

    setPrompt("");
    if (composerRef.current) composerRef.current.style.height = "auto";
    setStreaming(true);

    /* Tập nguồn chỉ gửi kèm khi TẠO phiên mới. Phiên đã tồn tại thì server đọc
       nguồn từ CSDL — gửi thêm ở đây chỉ tạo cơ hội cho hai giá trị lệch nhau,
       và lịch sử hội thoại sẽ chứa những câu trả lời dựa trên phạm vi khác nhau
       mà không ghi lại điều đó ở đâu cả. */
    const sourcesForNewSession =
      sessionId === null && selectedSourceIds.size > 0 && selectedSourceIds.size < sources.length
        ? [...selectedSourceIds]
        : undefined;

    abortRef.current = streamChat(
      {
        session_id: sessionId ?? undefined,
        // Chỉ gửi thesis_id khi phiên còn chưa tồn tại: phiên đã tạo mang sẵn
        // phạm vi đề tài của nó, gửi thêm chỉ tạo cơ hội cho hai giá trị lệch nhau.
        thesis_id: sessionId === null ? (thesisId ?? undefined) : undefined,
        prompt: text,
        ...(sessionId === null ? { answer_mode: answerMode } : {}),
        ...(sourcesForNewSession ? { document_ids: sourcesForNewSession } : {}),
      },
      {
        onSession: ({ session_id, user_message }) => {
          setSessionId(session_id);
          setMessages((prev) => [
            ...(prev ?? []),
            user_message,
            {
              id: STREAMING_MESSAGE_ID,
              session_id,
              role: "ASSISTANT",
              content: "",
              created_at: new Date().toISOString(),
              streaming: true,
            },
          ]);
          // Phiên vừa tạo phải xuất hiện ngay ở thanh bên, kèm tiêu đề mà server
          // cắt ra từ chính câu hỏi.
          void refetchSessions();
        },

        onCitations: (citations) => {
          // Nguồn hiện TRƯỚC khi chữ chạy xong: người đọc mở được tài liệu gốc
          // trong lúc câu trả lời vẫn đang sinh.
          setMessages((prev) =>
            (prev ?? []).map((m) =>
              m.id === STREAMING_MESSAGE_ID ? { ...m, citations } : m
            )
          );
        },

        onDelta: (chunk) => {
          setMessages((prev) =>
            (prev ?? []).map((m) =>
              m.id === STREAMING_MESSAGE_ID
                ? { ...m, content: m.content + chunk, streaming: true }
                : m
            )
          );
        },

        onDone: (done) => {
          setMessages((prev) =>
            (prev ?? []).map((m) => {
              if (m.id !== STREAMING_MESSAGE_ID) return m;
              // Thay bằng bản ghi chính thức: id thật là điều kiện để nút đánh
              // giá bên dưới gọi được `/ai/messages/:id/rating`.
              return done.message
                ? { ...done.message, streaming: false }
                : { ...m, id: done.message_id, streaming: false };
            })
          );
          abortRef.current = null;
          setStreaming(false);
          // `updated_at` vừa đổi — thanh bên sắp theo cột đó.
          void refetchSessions();
        },

        onError: (message) => {
          toast.error(message);
          setMessages((prev) => {
            const list = prev ?? [];
            const pending = list.find((m) => m.id === STREAMING_MESSAGE_ID);
            // Hỏng trước khi có chữ nào thì bỏ hẳn bong bóng: một khung trống
            // không nói được gì mà toast chưa nói.
            if (!pending || !pending.content) {
              return list.filter((m) => m.id !== STREAMING_MESSAGE_ID);
            }
            return list.map((m) =>
              m.id === STREAMING_MESSAGE_ID
                ? { ...m, streaming: false, incomplete: true }
                : m
            );
          });
          abortRef.current = null;
          setStreaming(false);
        },
      }
    );
  };

  /* Đánh giá câu trả lời (UC 6.9). Cập nhật lạc quan rồi trả lại giá trị cũ nếu
     server từ chối — một cú bấm 👍 không đáng để chờ round-trip mới đổi màu. */
  const rate = async (message: ChatMessage, next: "LIKE" | "DISLIKE") => {
    // Luồng phụ 1a: bấm lại đúng biểu tượng đang chọn nghĩa là huỷ đánh giá.
    const value = message.rating === next ? null : next;
    const before = message.rating ?? null;

    setMessages((prev) =>
      (prev ?? []).map((m) => (m.id === message.id ? { ...m, rating: value } : m))
    );

    try {
      const updated = await aiApi.rate(message.id, value);
      setMessages((prev) =>
        (prev ?? []).map((m) => (m.id === updated.id ? updated : m))
      );
      toast.success(
        value === null
          ? "Đã bỏ đánh giá câu trả lời."
          : value === "LIKE"
            ? "Cảm ơn bạn. Phản hồi giúp cải thiện chất lượng trả lời."
            : "Đã ghi nhận. Chúng tôi sẽ xem lại câu trả lời này."
      );
    } catch (err) {
      setMessages((prev) =>
        (prev ?? []).map((m) => (m.id === message.id ? { ...m, rating: before } : m))
      );
      toast.error(isApiError(err) ? err.message : "Không lưu được đánh giá.");
    }
  };

  const copy = (id: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const selectSession = (id: number) => {
    if (id === sessionId) return;
    // Đổi phiên giữa lúc token đang về thì phần chữ còn lại sẽ chảy vào khung
    // của phiên khác — cắt luồng trước khi chuyển.
    if (streaming) stopStreaming();
    setSessionId(id);
    setHistoryOf(id);
    // Mỗi phiên có tập nguồn riêng; xoá lựa chọn cục bộ để `useAsync` nạp lại
    // đúng tập của phiên vừa mở.
    setPickedSources(null);

    const target = sessions.find((s) => s.id === id);
    if (target?.answer_mode) setAnswerMode(target.answer_mode);
  };

  /* Không gọi `aiApi.createSession` ở đây: backend tự tạo phiên khi nhận câu hỏi
     đầu tiên và đặt tiêu đề bằng chính câu hỏi đó. Tạo trước sẽ để lại một dãy
     phiên rỗng tên "Hội thoại mới" mỗi lần người dùng đổi ý. */
  const newSession = () => {
    if (streaming) stopStreaming();
    setSessionId(null);
    setHistoryOf(null);
    setMessages([]);
    setPickedSources(null);
    composerRef.current?.focus();
  };

  /* ---- Thao tác trên bảng nguồn ----------------------------------------- */

  /**
   * Lưu tập nguồn lên server.
   *
   * Chỉ gọi khi phiên đã tồn tại. Chưa có phiên thì lựa chọn còn nằm ở client và
   * sẽ đi kèm câu hỏi đầu tiên — tạo sẵn một phiên rỗng chỉ để lưu vài ô tick sẽ
   * để lại một dãy hội thoại trống mỗi lần người dùng đổi ý.
   */
  const persistSources = React.useCallback(
    (next: Set<number>) => {
      if (sessionId === null) return;

      // Tick hết = quay lại quy ước "dùng tất cả", nên gửi mảng rỗng. Gửi đủ
      // danh sách cũng chạy đúng, nhưng khi có tài liệu mới tải lên sau đó nó sẽ
      // KHÔNG tự nằm trong phạm vi — trái với thứ người dùng vừa chọn.
      const payload = next.size === sources.length ? [] : [...next];

      void aiApi.setSources(sessionId, payload).catch((err) => {
        toast.error(isApiError(err) ? err.message : "Không lưu được lựa chọn nguồn.");
        // Trả về trạng thái của server thay vì giữ một lựa chọn không được ghi
        // — nếu không, người dùng tưởng đã đổi phạm vi trong khi thật ra chưa.
        setPickedSources(null);
        void refetchSources();
      });
    },
    [sessionId, sources.length, refetchSources]
  );

  const toggleSource = (id: number) => {
    const next = new Set(selectedSourceIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPickedSources(next);
    persistSources(next);
  };

  const selectAllSources = () => {
    const next = new Set(
      sources.filter((s) => SOURCE_STATUS[s.status_ai].usable).map((s) => s.id)
    );
    setPickedSources(next);
    persistSources(next);
  };

  const clearAllSources = () => {
    const next = new Set<number>();
    setPickedSources(next);
    // Không gọi `persistSources`: mảng rỗng ở server nghĩa là "dùng tất cả",
    // ngược hẳn ý người dùng. Trạng thái "không dùng nguồn nào" chỉ tồn tại ở
    // client và khung chat sẽ nhắc tick lại trước khi gửi câu hỏi.
  };

  const changeAnswerMode = (mode: AnswerMode) => {
    setAnswerMode(mode);
    if (sessionId === null) return;
    void aiApi.setAnswerMode(sessionId, mode).catch((err) => {
      toast.error(isApiError(err) ? err.message : "Không đổi được chế độ trả lời.");
    });
  };

  const confirmDeleteSession = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await aiApi.deleteSession(deleteTarget.id);
      toast.success("Đã xóa hội thoại.");
      if (sessionId === deleteTarget.id) {
        setSessionId(null);
        setHistoryOf(null);
        setMessages([]);
      }
      setDeleteTarget(null);
      void refetchSessions();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Không xóa được hội thoại.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Trợ lý AI"
        description="Chọn đề tài, chọn nguồn, rồi hỏi. Mọi câu dựa trên tài liệu đều kèm trích dẫn."
      />

      <Tabs
        value={tool}
        onChange={setTool}
        items={[
          { key: "chat", label: "Hỏi đáp", icon: <Robot size={14} /> },
          {
            key: "semantic",
            label: "Tìm kiếm ngữ nghĩa",
            icon: <MagnifyingGlass size={14} />,
          },
          { key: "plagiarism", label: "Kiểm tra trùng lặp", icon: <Scales size={14} /> },
          { key: "roadmap", label: "Gợi ý lộ trình", icon: <ListChecks size={14} /> },
        ]}
      />

      {/* Thanh phạm vi — luôn hiển thị ở mọi kích thước màn hình.
          Đây là hai thứ quyết định câu trả lời sẽ ra sao: hỏi trong đề tài nào,
          và có được dùng kiến thức ngoài tài liệu hay không. Trước đây cả hai
          đều vô hình: bộ chọn đề tài nằm trong cột bị `hidden lg:flex` và tự ẩn
          khi chỉ có một đề tài, còn chế độ trả lời thì không tồn tại. */}
      {tool === "chat" && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0 max-w-[22rem] flex-1">
            <ThesisScopeSelect theses={theses} value={thesisId} onChange={changeThesis} />
          </div>
          <AnswerModeToggle
            value={answerMode}
            onChange={changeAnswerMode}
            disabled={streaming}
          />
        </div>
      )}

      {tool === "chat" && (
        /* Ba cột: NGUỒN → HỘI THOẠI → KHUNG CHAT.
           Trên màn hình nhỏ chúng xếp chồng theo đúng thứ tự đó, nên hai cột
           điều khiển không còn bị ẩn hoàn toàn như trước. */
        <div className="grid grid-cols-1 lg:grid-cols-[14rem_13rem_1fr] gap-3 items-start">
          <SourcePanel
            sources={sources}
            selectedIds={selectedSourceIds}
            onToggle={toggleSource}
            onSelectAll={selectAllSources}
            onClearAll={clearAllSources}
            loading={sourcesLoading}
            error={sourcesError}
            onRetry={() => void refetchSources()}
            onUpload={() =>
              window.open(
                thesisId ? `/documents?thesis=${thesisId}` : "/documents",
                "_self"
              )
            }
            disabled={streaming}
          />

          {/* Sessions */}
          <Card hoverable={false} className="p-2 flex flex-col gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<Plus size={14} />}
              onClick={newSession}
              className="w-full"
            >
              Hội thoại mới
            </Button>

            <div className="flex flex-col gap-px">
              {sessionsError ? (
                <EmptyState
                  compact
                  icon={<Warning size={15} />}
                  title="Không tải được hội thoại"
                  description={sessionsError}
                  action={
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void refetchSessions()}
                    >
                      Thử lại
                    </Button>
                  }
                />
              ) : sessionsLoading && sessions.length === 0 ? (
                [0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-9 rounded-md" />
                ))
              ) : sessions.length === 0 ? (
                <EmptyState
                  compact
                  title="Chưa có hội thoại nào"
                  description="Đặt câu hỏi đầu tiên ở khung bên phải để tạo phiên."
                />
              ) : (
                sessions.map((s) => {
                  const active = s.id === sessionId;
                  return (
                    <div
                      key={s.id}
                      className="group flex items-center gap-1 rounded-md pr-1 transition-colors hover:bg-[var(--bg-hover)]"
                      style={{ background: active ? "var(--bg-active)" : undefined }}
                    >
                      <button
                        onClick={() => selectSession(s.id)}
                        className={`flex-1 min-w-0 text-left px-2 py-1.5 text-[12.5px] truncate ${
                          active ? "text-primary font-medium" : "text-secondary"
                        }`}
                        title={s.title}
                      >
                        {s.title}
                        {/* `updated_at` chứ không phải `created_at`: phiên vừa
                            nhắn phải nổi lên đầu và nhãn thời gian phải giải
                            thích được thứ tự đó. */}
                        <span className="block text-[11px] text-muted font-normal">
                          {formatRelative(s.updated_at)}
                        </span>
                      </button>
                      <button
                        onClick={() => setDeleteTarget(s)}
                        aria-label={`Xóa hội thoại ${s.title}`}
                        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-muted hover:text-danger transition-all p-1"
                      >
                        <Trash size={13} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          {/* Thread */}
          <Card hoverable={false} className="flex flex-col overflow-hidden">
            {/* Fixed-height transcript so the composer stays anchored and only
                the messages scroll. */}
            <div
              ref={scrollRef}
              className="overflow-y-auto p-4 flex flex-col gap-5"
              style={{ height: "min(calc(100dvh - 17rem), 34rem)" }}
            >
              {/* `historyOf` trong điều kiện là có chủ đích: `useAsync` giữ lại
                  lỗi của lần tải trước, nên thiếu nó thì bấm "Hội thoại mới" sau
                  một lần lỗi sẽ vẫn thấy nguyên khung báo lỗi cũ. */}
              {messagesError && historyOf !== null ? (
                <EmptyState
                  icon={<Warning size={15} />}
                  title="Không tải được nội dung hội thoại"
                  description={messagesError}
                  action={
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void refetchMessages()}
                    >
                      Thử lại
                    </Button>
                  }
                />
              ) : messagesLoading ? (
                <>
                  <Skeleton className="h-10 rounded-[10px]" />
                  <Skeleton className="h-28 rounded-[10px]" />
                  <Skeleton className="h-10 rounded-[10px]" />
                </>
              ) : messages.length === 0 ? (
                <div className="m-auto w-full max-w-md">
                  <EmptyState
                    icon={<Sparkle size={15} />}
                    title="Hỏi bất cứ điều gì về đề tài của bạn"
                    description={
                      answerMode === "STRICT"
                        ? "Trợ lý chỉ trả lời dựa trên nguồn bạn đã chọn, và luôn dẫn nguồn."
                        : "Trợ lý ưu tiên nguồn bạn đã chọn. Phần nằm ngoài tài liệu sẽ được tách riêng và đánh dấu."
                    }
                  />
                  {/* Gợi ý dựng từ chính các nguồn đang chọn — thay cho bốn câu
                      viết cứng giống hệt nhau ở mọi đề tài, vốn hay hỏi về
                      những thứ tài liệu không hề nhắc tới. */}
                  <div className="flex flex-col gap-1.5 mt-1">
                    {(suggestedPrompts ?? []).map((p) => (
                      <button
                        key={p}
                        onClick={() => {
                          setPrompt(p);
                          composerRef.current?.focus();
                        }}
                        className="row-hover text-left px-3 py-2 rounded-lg text-[12.5px] text-secondary hover:bg-[var(--bg-hover)] hover:text-primary"
                        style={{ border: "1px solid var(--border-secondary)" }}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m) =>
                  m.role === "USER" ? (
                    <div key={m.id} className="flex justify-end">
                      <div
                        className="max-w-[85%] px-3 py-2 rounded-[10px] rounded-br-[3px] text-[13.5px] leading-relaxed"
                        style={{
                          background: "var(--accent)",
                          color: "var(--accent-fg)",
                        }}
                      >
                        {m.content}
                      </div>
                    </div>
                  ) : (
                    /* Assistant answers run full width with no bubble — they're
                       documents to read, not messages to glance at. */
                    <article key={m.id} className="flex gap-2.5 min-w-0">
                      <span
                        className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{
                          background: "var(--accent-subtle)",
                          color: "var(--accent)",
                        }}
                        aria-hidden="true"
                      >
                        <Robot size={14} weight="fill" />
                      </span>

                      <div className="min-w-0 flex-1">
                        {m.content ? (
                          <MessageBody content={m.content} streaming={m.streaming} />
                        ) : (
                          <p className="text-[13px] text-tertiary flex items-center gap-1.5">
                            Đang tìm trong tài liệu của bạn
                            <span className="stream-caret" aria-hidden="true" />
                          </p>
                        )}

                        {m.citations && m.citations.length > 0 && (
                          <Citations citations={m.citations} />
                        )}

                        {!m.streaming && m.content && (
                          <div className="flex items-center gap-0.5 mt-1.5 -ml-1">
                            <IconButton
                              label={copiedId === m.id ? "Đã sao chép" : "Sao chép"}
                              size="sm"
                              onClick={() => copy(m.id, m.content)}
                            >
                              {copiedId === m.id ? (
                                <Check size={13} className="text-success" />
                              ) : (
                                <Copy size={13} />
                              )}
                            </IconButton>

                            {/* Chỉ đánh giá được câu trả lời server đã lưu. Bản
                                bị bấm "Dừng" giữa chừng còn mang id tạm, gửi lên
                                sẽ nhận 404 — bày nút ra là bắt người dùng tự dò. */}
                            {m.id > 0 && (
                              <>
                                <IconButton
                                  label={
                                    m.rating === "LIKE"
                                      ? "Bỏ đánh giá"
                                      : "Câu trả lời hữu ích"
                                  }
                                  size="sm"
                                  onClick={() => void rate(m, "LIKE")}
                                  className={m.rating === "LIKE" ? "text-success" : ""}
                                >
                                  <ThumbsUp
                                    size={13}
                                    weight={m.rating === "LIKE" ? "fill" : "regular"}
                                  />
                                </IconButton>
                                <IconButton
                                  label={
                                    m.rating === "DISLIKE"
                                      ? "Bỏ đánh giá"
                                      : "Câu trả lời chưa đúng"
                                  }
                                  size="sm"
                                  onClick={() => void rate(m, "DISLIKE")}
                                  className={m.rating === "DISLIKE" ? "text-danger" : ""}
                                >
                                  <ThumbsDown
                                    size={13}
                                    weight={m.rating === "DISLIKE" ? "fill" : "regular"}
                                  />
                                </IconButton>
                              </>
                            )}

                            <span className="text-[11px] text-muted tnum ml-1">
                              {formatTime(m.created_at)}
                            </span>
                            {m.incomplete && (
                              <span className="text-[11px] text-muted ml-1">
                                · dừng giữa chừng
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </article>
                  )
                )
              )}
            </div>

            {/* Composer */}
            <div
              className="p-2.5 flex-shrink-0"
              style={{ borderTop: "1px solid var(--border-secondary)" }}
            >
              {/* Bỏ tick hết nguồn là một trạng thái hợp lệ nhưng vô dụng. Nói
                  ngay tại đây thay vì để người dùng gõ xong một câu hỏi rồi mới
                  nhận lại "không có tài liệu nào để đối chiếu". */}
              {noSourceSelected && (
                <div
                  className="flex items-center gap-2 px-2.5 py-2 mb-2 rounded-[8px] text-[12px]"
                  style={{
                    background: "var(--warning-bg)",
                    border: "1px solid var(--warning-border)",
                    color: "var(--warning)",
                  }}
                  role="status"
                >
                  <Warning size={13} weight="fill" className="flex-shrink-0" />
                  <span className="flex-1">Chưa chọn nguồn nào ở bảng bên trái.</span>
                  <button onClick={selectAllSources} className="font-medium hover:underline">
                    Chọn tất cả
                  </button>
                </div>
              )}

              <div
                className="flex items-end gap-2 p-1.5 rounded-[10px] transition-colors focus-within:border-[var(--accent)]"
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-primary)",
                }}
              >
                <textarea
                  ref={composerRef}
                  value={prompt}
                  onChange={(e) => {
                    setPrompt(e.target.value);
                    // Grow with the content up to ~6 lines, then scroll.
                    e.target.style.height = "auto";
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  rows={1}
                  // Trần của backend (`chatSchema`). Chặn tại chỗ để câu hỏi dài
                  // không bị server trả về sau khi người dùng đã gõ xong.
                  maxLength={2000}
                  placeholder="Hỏi về tài liệu, khái niệm hoặc cấu trúc luận văn…"
                  aria-label="Câu hỏi"
                  className="flex-1 bg-transparent border-0 outline-none resize-none text-[13.5px] leading-relaxed px-1.5 py-1 max-h-[140px] placeholder:text-[var(--fg-muted)]"
                />

                {streaming ? (
                  <IconButton label="Dừng trả lời" onClick={stopStreaming}>
                    <Stop size={15} weight="fill" />
                  </IconButton>
                ) : (
                  <button
                    onClick={send}
                    disabled={!prompt.trim() || noSourceSelected}
                    aria-label="Gửi câu hỏi"
                    className="btn btn-primary btn-icon flex-shrink-0"
                  >
                    <ArrowUp size={15} weight="bold" />
                  </button>
                )}
              </div>
              {sources.length > 0 && (
                <p className="text-[11px] text-muted mt-1.5 px-1">
                  Đang dùng{" "}
                  <span className="tnum">
                    {selectedSourceIds.size}/{sources.length}
                  </span>{" "}
                  nguồn.
                </p>
              )}
            </div>
          </Card>
        </div>
      )}

      {tool === "semantic" && (
        <SemanticSearch theses={theses} thesisId={thesisId} onThesisChange={changeThesis} />
      )}
      {tool === "plagiarism" && (
        <PlagiarismCheck
          theses={theses}
          thesis={activeThesis}
          onThesisChange={changeThesis}
        />
      )}
      {tool === "roadmap" && (
        <RoadmapSuggestions
          theses={theses}
          thesis={activeThesis}
          onThesisChange={changeThesis}
        />
      )}

      {/* UC 6.8 NFR: xoá lịch sử là thao tác không hoàn tác được nên phải hỏi
          lại — biểu tượng thùng rác chỉ hiện khi rê chuột, quá dễ bấm nhầm. */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Xóa hội thoại này?"
        confirmLabel="Xóa"
        loading={deleting}
        message={
          <>
            Toàn bộ câu hỏi và câu trả lời trong{" "}
            <strong className="text-primary">{deleteTarget?.title}</strong> sẽ không
            còn hiển thị. Thao tác này không hoàn tác được.
          </>
        }
        onConfirm={() => void confirmDeleteSession()}
      />
    </div>
  );
}

/* ==========================================================================
   SEMANTIC SEARCH (UC 6.4)
   ========================================================================== */

function SemanticSearch({
  theses,
  thesisId,
  onThesisChange,
}: {
  theses: Thesis[];
  thesisId: number | null;
  onThesisChange: (id: number) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [submitted, setSubmitted] = React.useState("");

  /* Đếm số lần bấm "Tìm". Không có nó, gửi lại đúng câu cũ sẽ không đổi
     dependency nào và `useAsync` đứng yên — người dùng bấm mà không thấy gì. */
  const [attempt, setAttempt] = React.useState(0);

  const { data, loading, error, refetch } = useAsync(
    () => aiApi.search(submitted, thesisId),
    [submitted, attempt, thesisId],
    // Backend yêu cầu tối thiểu 2 ký tự; dưới ngưỡng đó thì chưa gọi gì cả.
    { enabled: submitted.length >= 2 }
  );

  const results = data?.results ?? [];

  const run = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;
    setSubmitted(q);
    setAttempt((n) => n + 1);
  };

  return (
    <Panel
      title="Tìm kiếm ngữ nghĩa"
      icon={<MagnifyingGlass size={14} />}
      actions={
        <ThesisScopeSelect
          theses={theses}
          value={thesisId}
          onChange={onThesisChange}
        />
      }
    >
      <p className="text-[12.5px] text-tertiary mb-3 max-w-xl">
        Tìm theo ý nghĩa của câu thay vì từ khóa chính xác. Ví dụ: “các đoạn nói về
        đánh đổi giữa tốc độ và độ chính xác” sẽ khớp cả những trang không chứa đúng
        từ đó.
      </p>

      <form onSubmit={run} className="flex items-start gap-2 max-w-2xl mb-4">
        <Input
          placeholder="Mô tả điều bạn đang tìm…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          wrapperClassName="flex-1"
          aria-label="Nội dung tìm kiếm"
        />
        <Button
          type="submit"
          variant="primary"
          loading={loading}
          disabled={query.trim().length < 2}
        >
          Tìm
        </Button>
      </form>

      {error ? (
        <EmptyState
          icon={<Warning size={15} />}
          title="Không tìm kiếm được"
          description={error}
          action={
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
        />
      ) : loading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[76px] rounded-[10px]" />
          ))}
        </div>
      ) : !data ? null : (
        <>
          {/* Bằng chứng đây là tìm kiếm vector thật chứ không phải trang trí:
              phạm vi đã quét và thời gian máy chủ thực sự bỏ ra. */}
          <p className="text-[11.5px] text-muted tnum mb-2">
            Tìm trong {data.scope_documents} tài liệu · {data.took_ms}ms
          </p>

          {results.length === 0 ? (
            <EmptyState
              compact
              icon={<MagnifyingGlass size={15} />}
              title="Không có đoạn nào đủ tương đồng"
              description="Thử diễn đạt lại, hoặc kiểm tra tài liệu đã được lập chỉ mục chưa."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {results.map((r) => (
                <div
                  key={r.chunk_id}
                  className="p-3 rounded-[10px]"
                  style={{ border: "1px solid var(--border-primary)" }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <FileText size={14} className="text-tertiary flex-shrink-0" />
                    <button
                      onClick={() => void openSourceDocument(r.document_id)}
                      className="text-[13px] font-medium truncate flex-1 text-left"
                      title={`Mở tài liệu ${r.doc_title}`}
                    >
                      {r.doc_title}
                    </button>
                    {r.page !== null && (
                      <span className="text-[11.5px] text-muted tnum whitespace-nowrap">
                        tr. {r.page}
                      </span>
                    )}
                    <Badge variant="accent">{(r.score * 100).toFixed(0)}%</Badge>
                  </div>
                  <p className="text-[12.5px] text-secondary leading-relaxed">
                    {r.snippet}
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

/* ==========================================================================
   PLAGIARISM CHECK (UC 6.15)
   ========================================================================== */

/** Ngưỡng của backend (`plagiarismSchema`). Dưới mức này không gọi API. */
const PLAGIARISM_MIN_CHARS = 50;
const PLAGIARISM_MAX_CHARS = 20_000;

function PlagiarismCheck({
  theses,
  thesis,
  onThesisChange,
}: {
  theses: Thesis[];
  thesis: Thesis | null;
  onThesisChange: (id: number) => void;
}) {
  const [text, setText] = React.useState("");
  const [checking, setChecking] = React.useState(false);
  const [result, setResult] = React.useState<PlagiarismResult | null>(null);

  const trimmed = text.trim();
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
  const tooShort = trimmed.length < PLAGIARISM_MIN_CHARS;

  const run = async () => {
    if (!thesis || tooShort) return;
    setChecking(true);
    setResult(null);
    try {
      setResult(await aiApi.plagiarism(thesis.id, trimmed));
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Không kiểm tra được đoạn văn bản.");
    } finally {
      setChecking(false);
    }
  };

  /* A bare number tells a student nothing. Bands turn it into a verdict they
     can act on. */
  const verdict = !result
    ? null
    : result.similarity < 20
      ? { label: "Trong ngưỡng cho phép", tone: "success" as const }
      : result.similarity < 35
        ? { label: "Cần rà soát lại", tone: "warning" as const }
        : { label: "Vượt ngưỡng cho phép", tone: "danger" as const };

  return (
    <Panel
      title="Kiểm tra trùng lặp"
      icon={<Scales size={14} />}
      className="max-w-3xl"
      actions={
        <ThesisScopeSelect
          theses={theses}
          value={thesis?.id ?? null}
          onChange={onThesisChange}
        />
      }
    >
      {theses.length === 0 ? (
        <EmptyState
          compact
          icon={<Scales size={15} />}
          title="Chưa có đề tài nào"
          description="Kết quả kiểm tra được lưu theo đề tài. Hãy tạo hoặc tham gia một đề tài trước."
        />
      ) : (
        <>
          <Textarea
            label="Đoạn văn bản cần kiểm tra"
            rows={7}
            maxLength={PLAGIARISM_MAX_CHARS}
            placeholder="Dán một đoạn trong luận văn của bạn…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            helperText={
              tooShort
                ? `${wordCount} từ · cần tối thiểu ${PLAGIARISM_MIN_CHARS} ký tự (${trimmed.length}/${PLAGIARISM_MIN_CHARS})`
                : `${wordCount} từ`
            }
          />

          <Button
            variant="primary"
            className="mt-3"
            loading={checking}
            disabled={!thesis || tooShort}
            onClick={() => void run()}
          >
            Kiểm tra
          </Button>

          {checking ? (
            <Skeleton className="h-40 rounded-[10px] mt-4" />
          ) : (
            result &&
            verdict && (
              <div
                className="mt-4 p-3.5 rounded-[10px] fade-in"
                style={{ border: "1px solid var(--border-primary)" }}
              >
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-[26px] font-semibold tnum leading-none">
                    {formatPercent(result.similarity)}
                  </span>
                  <Badge variant={verdict.tone}>{verdict.label}</Badge>
                </div>
                <p className="text-[12.5px] text-tertiary mb-3">
                  Tỷ lệ trùng lặp so với kho tài liệu học thuật và các nguồn công khai.
                </p>

                <ProgressBar
                  value={result.similarity}
                  tone={verdict.tone}
                  showLabel={false}
                />

                <div className="eyebrow mt-3 mb-1.5">Nguồn trùng khớp</div>
                {result.matches.length === 0 ? (
                  <p className="text-[12.5px] text-tertiary">
                    Không có tài liệu nào trong phạm vi bạn được đọc trùng với đoạn này.
                  </p>
                ) : (
                  <ul className="flex flex-col">
                    {result.matches.map((m, i) => {
                      // Nguồn ngoài kho tài liệu không có id để mở; chỉ những
                      // nguồn có bản ghi thật mới bấm được.
                      const documentId = m.document_id;
                      return (
                        <li
                          key={`${m.source}-${i}`}
                          className="flex items-center justify-between gap-3 py-1.5 text-[12.5px]"
                          style={{
                            borderTop:
                              i > 0 ? "1px solid var(--border-secondary)" : undefined,
                          }}
                        >
                          {documentId !== null ? (
                            <button
                              onClick={() => void openSourceDocument(documentId)}
                              className="text-secondary truncate text-left"
                              title={`Mở tài liệu ${m.source}`}
                            >
                              {m.source}
                            </button>
                          ) : (
                            <span className="text-secondary truncate">{m.source}</span>
                          )}
                          <span className="tnum text-tertiary whitespace-nowrap">
                            {formatPercent(m.percent)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )
          )}
        </>
      )}
    </Panel>
  );
}

/* ==========================================================================
   GỢI Ý LỘ TRÌNH (UC 6.10 – 6.13)
   ========================================================================== */

/**
 * Hạn dự kiến nếu chấp nhận gợi ý ngay bây giờ.
 *
 * Mô hình chỉ đưa ra "sau bao nhiêu tuần" vì nó không biết hôm nay là ngày nào;
 * backend quy đổi sang ngày thật tại thời điểm bấm chấp nhận. Hiển thị đúng phép
 * quy đổi đó để người dùng thấy trước mốc mình sắp tạo.
 */
function deadlineFromWeeks(weeks: number): Date {
  return new Date(Date.now() + weeks * 7 * 86_400_000);
}

function RoadmapSuggestions({
  theses,
  thesis,
  onThesisChange,
}: {
  theses: Thesis[];
  thesis: Thesis | null;
  onThesisChange: (id: number) => void;
}) {
  const { data, loading, error, refetch } = useAsync(
    () => aiApi.suggestions(thesis?.id ?? 0),
    [thesis?.id],
    { enabled: thesis !== null }
  );

  const suggestions = data ?? [];

  const [creating, setCreating] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);

  /* Lưu những mục BỊ BỎ chọn, không phải những mục được chọn: mặc định cả lộ
     trình đều được giữ, nên trạng thái rỗng đã là đúng và không cần effect nào
     đồng bộ lại mỗi lần danh sách gợi ý đổi. */
  const [unchecked, setUnchecked] = React.useState<Set<string>>(new Set());

  const toggleItem = (key: string) => {
    setUnchecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /* Đề tài đã hoàn thành bị đóng băng (business rule UC 3.13) nên server từ chối
     mọi thao tác `contribute`. Ẩn nút thay vì để người dùng bấm rồi nhận 403 và
     tự suy ra luật nghiệp vụ.

     Nhánh `isAdmin` trước đây ở đây đã bỏ: cả trang này chỉ mở cho sinh viên và
     giảng viên (xem `RequireRole` ở `AIChatPage`), nên nó vĩnh viễn sai. */
  const canContribute = thesis !== null && thesis.status !== "COMPLETED";

  const createSuggestion = async () => {
    if (!thesis) return;
    setCreating(true);
    try {
      await aiApi.suggest(thesis.id);
      toast.success("Trợ lý đã đề xuất một lộ trình mới.");
      void refetch();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Không tạo được gợi ý lộ trình.");
    } finally {
      setCreating(false);
    }
  };

  const selectedIndexes = (s: AISuggestion) =>
    s.payload.map((_, i) => i).filter((i) => !unchecked.has(`${s.id}:${i}`));

  const accept = async (s: AISuggestion) => {
    const indexes = selectedIndexes(s);
    if (indexes.length === 0) return;
    setBusy(`accept:${s.id}`);
    try {
      const created = await aiApi.acceptSuggestion(s.id, indexes);
      toast.success(
        `Đã tạo ${created.length || indexes.length} mốc tiến độ từ gợi ý của trợ lý.`
      );
      void refetch();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Không tạo được mốc tiến độ.");
    } finally {
      setBusy(null);
    }
  };

  const regenerate = async (s: AISuggestion) => {
    setBusy(`regenerate:${s.id}`);
    try {
      await aiApi.regenerateSuggestion(s.id);
      toast.success("Trợ lý đã đề xuất một lộ trình khác.");
      void refetch();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Không tạo lại được gợi ý.");
    } finally {
      setBusy(null);
    }
  };

  const reject = async (s: AISuggestion) => {
    setBusy(`reject:${s.id}`);
    try {
      await aiApi.rejectSuggestion(s.id);
      toast.success("Đã bỏ qua gợi ý này.");
      void refetch();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Không bỏ qua được gợi ý.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel
      title="Gợi ý lộ trình"
      icon={<ListChecks size={14} />}
      actions={
        <>
          <ThesisScopeSelect
            theses={theses}
            value={thesis?.id ?? null}
            onChange={onThesisChange}
          />
          {canContribute && (
            <Button
              variant="primary"
              size="sm"
              icon={<Sparkle size={14} />}
              loading={creating}
              onClick={() => void createSuggestion()}
            >
              Nhận gợi ý
            </Button>
          )}
        </>
      }
    >
      <p className="text-[12.5px] text-tertiary mb-3 max-w-xl">
        Trợ lý đọc tên đề tài, mô tả và các mốc đã có để đề xuất những việc tiếp theo.
        Bỏ chọn phần chưa phù hợp rồi tạo phần còn lại thành mốc tiến độ thật.
      </p>

      {theses.length === 0 ? (
        <EmptyState
          compact
          icon={<ListChecks size={15} />}
          title="Chưa có đề tài nào"
          description="Lộ trình gắn với một đề tài cụ thể. Hãy tạo hoặc tham gia một đề tài trước."
        />
      ) : error ? (
        <EmptyState
          icon={<Warning size={15} />}
          title="Không tải được gợi ý"
          description={error}
          action={
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
        />
      ) : loading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 rounded-[10px]" />
          ))}
        </div>
      ) : suggestions.length === 0 ? (
        <EmptyState
          compact
          icon={<Sparkle size={15} />}
          title="Chưa có gợi ý nào đang chờ"
          description={
            canContribute
              ? "Bấm “Nhận gợi ý” để trợ lý dựng một lộ trình từ đề tài và các mốc hiện có."
              : "Đề tài đã hoàn thành nên không tạo thêm mốc tiến độ được nữa."
          }
        />
      ) : (
        <div className="flex flex-col gap-5">
          {suggestions.map((s) => {
            const chosen = selectedIndexes(s);
            return (
              <div key={s.id}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="eyebrow">Lần đề xuất {s.attempt}</span>
                  <span className="text-[11.5px] text-muted tnum">
                    {formatRelative(s.created_at)}
                  </span>
                  {s.model_name && <span className="chip">{s.model_name}</span>}
                </div>

                <ul className="flex flex-col">
                  {s.payload.map((item, i) => {
                    const key = `${s.id}:${i}`;
                    return (
                      <li
                        key={key}
                        className="flex items-start gap-2.5 py-2"
                        style={{
                          borderTop:
                            i > 0 ? "1px solid var(--border-secondary)" : undefined,
                        }}
                      >
                        <span className="mt-0.5 flex-shrink-0">
                          <Checkbox
                            checked={!unchecked.has(key)}
                            disabled={!canContribute}
                            onChange={() => toggleItem(key)}
                            aria-label={`Chọn nhiệm vụ ${item.name}`}
                          />
                        </span>

                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium leading-snug">
                            {item.name}
                          </p>
                          {item.description && (
                            <p className="text-[12px] text-tertiary leading-relaxed mt-0.5">
                              {item.description}
                            </p>
                          )}
                        </div>

                        <span
                          className="text-[11.5px] text-muted tnum whitespace-nowrap mt-0.5"
                          title={`Sau ${item.weeks_from_now} tuần kể từ khi chấp nhận`}
                        >
                          {formatDate(deadlineFromWeeks(item.weeks_from_now))}
                        </span>
                      </li>
                    );
                  })}
                </ul>

                {canContribute && (
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <Button
                      variant="primary"
                      size="sm"
                      loading={busy === `accept:${s.id}`}
                      disabled={chosen.length === 0 || busy !== null}
                      onClick={() => void accept(s)}
                    >
                      Tạo {chosen.length} mốc tiến độ
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={busy === `regenerate:${s.id}`}
                      disabled={busy !== null}
                      onClick={() => void regenerate(s)}
                    >
                      Tạo lại
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={busy === `reject:${s.id}`}
                      disabled={busy !== null}
                      onClick={() => void reject(s)}
                    >
                      Bỏ qua
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

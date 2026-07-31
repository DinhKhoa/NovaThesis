"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowUp,
  Check,
  Copy,
  FileText,
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
import { useAuthStore, isAdmin } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { isApiError } from "@/lib/api";
import { useAsync } from "@/lib/use-async";
import {
  aiApi,
  documentsApi,
  streamChat,
  thesesApi,
  type AISuggestion,
  type ChatMessage,
  type ChatSession,
  type Citation,
  type Milestone,
  type PlagiarismResult,
  type Thesis,
} from "@/lib/services";
import { formatDate, formatPercent, formatRelative, formatTime } from "@/lib/format";

/* ==========================================================================
   CẦU NỐI VỚI TẦNG DỊCH VỤ
   ========================================================================== */

/**
 * Gỡ lớp bọc `{ data: [...] }`.
 *
 * `ai.routes.ts` trả danh sách trong một phong bì (`GET /ai/sessions`,
 * `/ai/sessions/:id/messages`, `/ai/suggestions`, `/ai/suggestions/:id/accept`)
 * trong khi `services.ts` khai báo kiểu trả về là mảng trần. Sửa `services.ts`
 * nằm ngoài phạm vi trang này, mà tin vào kiểu khai báo thì lần tải đầu tiên đã
 * nổ "sessions.map is not a function" — nên chuẩn hoá ngay tại đây.
 */
function asList<T>(payload: T[] | { data: T[] } | null | undefined): T[] {
  if (Array.isArray(payload)) return payload;
  const inner = (payload as { data?: T[] } | null | undefined)?.data;
  return Array.isArray(inner) ? inner : [];
}

/**
 * Sự kiện `done` của backend còn kèm `message` — bản ghi chính thức đã có id
 * thật trong CSDL — và cờ `incomplete`, nhưng `ChatStreamHandlers` trong
 * `services.ts` mới khai báo ba trường. Mô tả phần còn lại ở đây thay vì chạm
 * vào tầng dịch vụ.
 */
interface ChatDonePayload {
  message_id: number;
  model_name: string;
  latency_ms: number;
  message?: ChatMessage;
  incomplete?: boolean;
}

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

const SUGGESTED_PROMPTS = [
  "Tóm tắt các tài liệu tôi đã tải lên trong đề tài này",
  "Đề cương luận văn của tôi còn thiếu phần nào?",
  "Tìm các đoạn nói về kiến trúc RAG trong tài liệu tham khảo",
  "Giải thích sự khác nhau giữa HNSW và IVFFlat",
];

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

function MessageBody({
  content,
  streaming,
}: {
  content: string;
  streaming?: boolean;
}) {
  const paragraphs = content.split("\n\n");
  return (
    <div className="text-[13.5px] leading-[1.65] text-secondary flex flex-col gap-2">
      {paragraphs.map((p, i) => (
        <p key={i}>
          {renderInline(p, `p${i}`)}
          {streaming && i === paragraphs.length - 1 && (
            <span className="stream-caret" aria-hidden="true" />
          )}
        </p>
      ))}
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

/* Bộ chọn phạm vi đề tài. Ẩn khi chỉ có đúng một đề tài: một danh sách thả
   xuống với duy nhất một lựa chọn không cho người dùng thêm thông tin nào. */
function ThesisScopeSelect({
  theses,
  value,
  onChange,
}: {
  theses: Thesis[];
  value: number | null;
  onChange: (id: number) => void;
}) {
  if (theses.length <= 1) return null;

  return (
    <Select
      value={value ?? ""}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-auto max-w-[15rem]"
      aria-label="Phạm vi đề tài"
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
   PAGE
   ========================================================================== */

export default function AIChatPage() {
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
  } = useAsync(
    async () => asList<ChatSession>(await aiApi.sessions(thesisId ?? undefined)),
    [thesisId]
  );

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
  } = useAsync(
    async () => asList<ChatMessage>(await aiApi.messages(historyOf ?? 0)),
    [historyOf],
    { enabled: historyOf !== null }
  );

  const messages = React.useMemo(() => messagesData ?? [], [messagesData]);

  const [deleteTarget, setDeleteTarget] = React.useState<ChatSession | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const [prompt, setPrompt] = React.useState("");
  const [streaming, setStreaming] = React.useState(false);
  const [copiedId, setCopiedId] = React.useState<number | null>(null);

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
    },
    [stopStreaming, setMessages]
  );

  const send = () => {
    const text = prompt.trim();
    if (!text || streaming) return;

    setPrompt("");
    if (composerRef.current) composerRef.current.style.height = "auto";
    setStreaming(true);

    abortRef.current = streamChat(
      {
        session_id: sessionId ?? undefined,
        // Chỉ gửi thesis_id khi phiên còn chưa tồn tại: phiên đã tạo mang sẵn
        // phạm vi đề tài của nó, gửi thêm chỉ tạo cơ hội cho hai giá trị lệch nhau.
        thesis_id: sessionId === null ? (thesisId ?? undefined) : undefined,
        prompt: text,
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

        onDone: (payload) => {
          const done = payload as ChatDonePayload;
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
  };

  /* Không gọi `aiApi.createSession` ở đây: backend tự tạo phiên khi nhận câu hỏi
     đầu tiên và đặt tiêu đề bằng chính câu hỏi đó. Tạo trước sẽ để lại một dãy
     phiên rỗng tên "Hội thoại mới" mỗi lần người dùng đổi ý. */
  const newSession = () => {
    if (streaming) stopStreaming();
    setSessionId(null);
    setHistoryOf(null);
    setMessages([]);
    composerRef.current?.focus();
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
        description="Hỏi đáp dựa trên tài liệu trong đề tài của bạn. Mọi câu trả lời đều kèm nguồn trích dẫn."
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

      {tool === "chat" && (
        <div className="grid grid-cols-1 lg:grid-cols-[15rem_1fr] gap-3 items-start">
          {/* Sessions */}
          <Card hoverable={false} className="p-2 hidden lg:flex flex-col gap-2">
            <ThesisScopeSelect
              theses={theses}
              value={thesisId}
              onChange={changeThesis}
            />

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
                    description="Trợ lý chỉ trả lời dựa trên tài liệu bạn đã tải lên, và luôn dẫn nguồn."
                  />
                  <div className="flex flex-col gap-1.5 mt-1">
                    {SUGGESTED_PROMPTS.map((p) => (
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
                    disabled={!prompt.trim()}
                    aria-label="Gửi câu hỏi"
                    className="btn btn-primary btn-icon flex-shrink-0"
                  >
                    <ArrowUp size={15} weight="bold" />
                  </button>
                )}
              </div>
              <p className="text-[11px] text-muted mt-1.5 px-1">
                <kbd className="kbd">Enter</kbd> để gửi ·{" "}
                <kbd className="kbd">Shift</kbd>+<kbd className="kbd">Enter</kbd> để
                xuống dòng. Câu trả lời chỉ dựa trên tài liệu bạn có quyền truy cập.
              </p>
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
  const { user } = useAuthStore();

  const { data, loading, error, refetch } = useAsync(
    async () => asList<AISuggestion>(await aiApi.suggestions(thesis?.id ?? 0)),
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
     tự suy ra luật nghiệp vụ. */
  const canContribute =
    thesis !== null && (isAdmin(user) || thesis.status !== "COMPLETED");

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
      const created = asList<Milestone>(await aiApi.acceptSuggestion(s.id, indexes));
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

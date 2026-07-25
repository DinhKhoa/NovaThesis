"use client";

import React from "react";
import {
  ArrowUp,
  Check,
  Copy,
  FileText,
  MagnifyingGlass,
  Plus,
  Robot,
  Scales,
  Sparkle,
  Stop,
  ThumbsDown,
  ThumbsUp,
  Trash,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/layout";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  Input,
  Panel,
  ProgressBar,
  Tabs,
  Textarea,
} from "@/components/ui";
import { toast } from "@/lib/toast";

/* ==========================================================================
   TYPES (ERD: ai_chat_sessions, ai_chat_messages)
   ========================================================================== */

export interface Citation {
  doc_title: string;
  page?: number;
  score: number;
  snippet?: string;
}

export interface ChatMessage {
  id: number;
  role: "USER" | "ASSISTANT";
  content: string;
  citations?: Citation[];
  rating?: "LIKE" | "DISLIKE" | null;
  created_at: string;
  /** True while tokens are still arriving. */
  streaming?: boolean;
}

export interface ChatSession {
  id: number;
  title: string;
  created_at: string;
}

const mockSessions: ChatSession[] = [
  { id: 1, title: "Chỉ mục HNSW trong pgvector", created_at: "Hôm nay" },
  { id: 2, title: "Gợi ý đề cương luận văn", created_at: "Hôm qua" },
  { id: 3, title: "Kiểm tra trích dẫn chương 2", created_at: "3 ngày trước" },
];

const initialMessages: ChatMessage[] = [
  {
    id: 2,
    role: "USER",
    content:
      "Giải thích cách pgvector tối ưu tìm kiếm vector bằng chỉ mục HNSW trong hệ thống NovaThesis?",
    created_at: "10:02",
  },
  {
    id: 3,
    role: "ASSISTANT",
    content:
      "**HNSW** (Hierarchical Navigable Small World) là thuật toán lập chỉ mục đồ thị đa tầng cho phép tìm kiếm láng giềng gần nhất gần đúng (ANN).\n\nVề tốc độ, nó giảm thời gian truy vấn trên vector 1536 chiều từ O(N) xuống xấp xỉ O(log N). Về độ chính xác, hệ thống đạt trên 98% độ tương đồng cosine trong các bài toán tìm kiếm ngữ nghĩa. Điểm đáng chú ý là chỉ mục chạy trực tiếp trong PostgreSQL, nên không cần triển khai thêm một vector database riêng.",
    citations: [
      {
        doc_title: "RAG_pgvector_Architecture_Paper.pdf",
        page: 12,
        score: 0.94,
        snippet:
          "HNSW xây dựng đồ thị phân tầng, mỗi tầng là một tập con thưa dần của tầng dưới, cho phép duyệt từ thô đến mịn…",
      },
      {
        doc_title: "Thesis_Requirements_Specification_v2.docx",
        page: 4,
        score: 0.88,
        snippet:
          "Phân hệ AI Chat hỗ trợ RAG trích xuất ngữ nghĩa từ bảng document_chunks với ngưỡng tương đồng 0.75…",
      },
    ],
    rating: "LIKE",
    created_at: "10:03",
  },
];

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
            <li key={i}>
              <button
                onClick={() => setExpanded(open ? null : i)}
                aria-expanded={open}
                className="row-hover w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover:bg-[var(--bg-hover)]"
                style={{ border: "1px solid var(--border-secondary)" }}
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

/* ==========================================================================
   PAGE
   ========================================================================== */

export default function AIChatPage() {
  const [tool, setTool] = React.useState("chat");

  const [sessions, setSessions] = React.useState<ChatSession[]>(mockSessions);
  const [activeSessionId, setActiveSessionId] = React.useState(1);
  const [messages, setMessages] = React.useState<ChatMessage[]>(initialMessages);

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

  const stopStreaming = () => {
    abortRef.current?.();
    abortRef.current = null;
    setStreaming(false);
    setMessages((prev) =>
      prev.map((m) => (m.streaming ? { ...m, streaming: false } : m))
    );
  };

  const send = () => {
    const text = prompt.trim();
    if (!text || streaming) return;

    const now = new Date().toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const userMsg: ChatMessage = {
      id: Date.now(),
      role: "USER",
      content: text,
      created_at: now,
    };
    const replyId = Date.now() + 1;

    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: replyId, role: "ASSISTANT", content: "", created_at: now, streaming: true },
    ]);
    setPrompt("");
    if (composerRef.current) composerRef.current.style.height = "auto";
    setStreaming(true);

    const full = `Dựa trên các tài liệu đã lập chỉ mục trong đề tài của bạn:\n\n${
      text.toLowerCase().includes("đề cương")
        ? "Cấu trúc đề cương 5 chương theo chuẩn học thuật gồm: mở đầu và đặt vấn đề, tổng quan nghiên cứu liên quan, phương pháp và thiết kế hệ thống, thực nghiệm cùng đánh giá kết quả, và cuối cùng là kết luận kèm hướng phát triển."
        : "Hệ thống đã thực hiện tìm kiếm vector qua pgvector, chọn ra các đoạn văn bản có độ tương đồng cao nhất và tổng hợp thành câu trả lời bên dưới. Bạn có thể mở từng nguồn trích dẫn để đối chiếu nguyên văn đoạn đã được sử dụng."
    }`;

    /* Chunked by word rather than by character: it reads like typing instead
       of a teleprinter, and it's several times fewer renders. */
    const words = full.split(" ");
    let i = 0;
    const timer = setInterval(() => {
      i += 2;
      const done = i >= words.length;
      const slice = words.slice(0, i).join(" ");

      setMessages((prev) =>
        prev.map((m) =>
          m.id === replyId
            ? {
                ...m,
                content: done ? full : slice,
                streaming: !done,
                citations: done
                  ? [
                      {
                        doc_title: "RAG_pgvector_Architecture_Paper.pdf",
                        page: 5,
                        score: 0.91,
                        snippet:
                          "Truy vấn được nhúng thành vector 1536 chiều rồi so khớp bằng toán tử khoảng cách cosine <=> trên chỉ mục HNSW…",
                      },
                    ]
                  : undefined,
              }
            : m
        )
      );

      if (done) {
        clearInterval(timer);
        abortRef.current = null;
        setStreaming(false);
      }
    }, 45);

    abortRef.current = () => clearInterval(timer);
  };

  const rate = (id: number, rating: "LIKE" | "DISLIKE") => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, rating } : m)));
    toast.success(
      rating === "LIKE"
        ? "Cảm ơn bạn. Phản hồi giúp cải thiện chất lượng trả lời."
        : "Đã ghi nhận. Chúng tôi sẽ xem lại câu trả lời này."
    );
  };

  const copy = (id: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const newSession = () => {
    const s: ChatSession = {
      id: Date.now(),
      title: "Hội thoại mới",
      created_at: "Vừa xong",
    };
    setSessions((prev) => [s, ...prev]);
    setActiveSessionId(s.id);
    setMessages([]);
    composerRef.current?.focus();
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
        ]}
      />

      {tool === "chat" && (
        <div className="grid grid-cols-1 lg:grid-cols-[15rem_1fr] gap-3 items-start">
          {/* Sessions */}
          <Card hoverable={false} className="p-2 hidden lg:flex flex-col gap-2">
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
              {sessions.map((s) => {
                const active = s.id === activeSessionId;
                return (
                  <div
                    key={s.id}
                    className="group flex items-center gap-1 rounded-md pr-1 transition-colors hover:bg-[var(--bg-hover)]"
                    style={{ background: active ? "var(--bg-active)" : undefined }}
                  >
                    <button
                      onClick={() => setActiveSessionId(s.id)}
                      className={`flex-1 min-w-0 text-left px-2 py-1.5 text-[12.5px] truncate ${
                        active ? "text-primary font-medium" : "text-secondary"
                      }`}
                      title={s.title}
                    >
                      {s.title}
                      <span className="block text-[11px] text-muted font-normal">
                        {s.created_at}
                      </span>
                    </button>
                    <button
                      onClick={() => {
                        setSessions((prev) => prev.filter((x) => x.id !== s.id));
                        toast.success("Đã xóa hội thoại.");
                      }}
                      aria-label={`Xóa hội thoại ${s.title}`}
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-muted hover:text-danger transition-all p-1"
                    >
                      <Trash size={13} />
                    </button>
                  </div>
                );
              })}
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
              {messages.length === 0 ? (
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
                            <IconButton
                              label="Câu trả lời hữu ích"
                              size="sm"
                              onClick={() => rate(m.id, "LIKE")}
                              className={m.rating === "LIKE" ? "text-success" : ""}
                            >
                              <ThumbsUp
                                size={13}
                                weight={m.rating === "LIKE" ? "fill" : "regular"}
                              />
                            </IconButton>
                            <IconButton
                              label="Câu trả lời chưa đúng"
                              size="sm"
                              onClick={() => rate(m.id, "DISLIKE")}
                              className={m.rating === "DISLIKE" ? "text-danger" : ""}
                            >
                              <ThumbsDown
                                size={13}
                                weight={m.rating === "DISLIKE" ? "fill" : "regular"}
                              />
                            </IconButton>
                            <span className="text-[11px] text-muted tnum ml-1">
                              {m.created_at}
                            </span>
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

      {tool === "semantic" && <SemanticSearch />}
      {tool === "plagiarism" && <PlagiarismCheck />}
    </div>
  );
}

/* ==========================================================================
   SEMANTIC SEARCH
   ========================================================================== */

function SemanticSearch() {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<
    { doc: string; snippet: string; score: number; page: number }[]
  >([]);
  const [searching, setSearching] = React.useState(false);
  const [searched, setSearched] = React.useState(false);

  const run = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setTimeout(() => {
      setResults([
        {
          doc: "RAG_pgvector_Architecture_Paper.pdf",
          page: 8,
          snippet:
            "…pgvector cho phép lưu trữ vector nhúng 1536 chiều và tính khoảng cách cosine trực tiếp bằng toán tử <=> ngay trong câu truy vấn SQL…",
          score: 0.95,
        },
        {
          doc: "Thesis_Requirements_Specification_v2.docx",
          page: 4,
          snippet:
            "…phân hệ AI Chat hỗ trợ RAG trích xuất ngữ nghĩa từ bảng document_chunks, giới hạn phạm vi theo quyền truy cập của người dùng…",
          score: 0.89,
        },
      ]);
      setSearching(false);
      setSearched(true);
    }, 700);
  };

  return (
    <Panel title="Tìm kiếm ngữ nghĩa" icon={<MagnifyingGlass size={14} />}>
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
        <Button type="submit" variant="primary" loading={searching}>
          Tìm
        </Button>
      </form>

      {searched && results.length === 0 && !searching ? (
        <EmptyState
          compact
          icon={<MagnifyingGlass size={15} />}
          title="Không có đoạn nào đủ tương đồng"
          description="Thử diễn đạt lại, hoặc kiểm tra tài liệu đã được lập chỉ mục chưa."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {results.map((r, i) => (
            <div
              key={i}
              className="p-3 rounded-[10px]"
              style={{ border: "1px solid var(--border-primary)" }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <FileText size={14} className="text-tertiary flex-shrink-0" />
                <span className="text-[13px] font-medium truncate flex-1">
                  {r.doc}
                </span>
                <span className="text-[11.5px] text-muted tnum whitespace-nowrap">
                  tr. {r.page}
                </span>
                <Badge variant="accent">{(r.score * 100).toFixed(0)}%</Badge>
              </div>
              <p className="text-[12.5px] text-secondary leading-relaxed">
                {r.snippet}
              </p>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ==========================================================================
   PLAGIARISM CHECK
   ========================================================================== */

function PlagiarismCheck() {
  const [text, setText] = React.useState("");
  const [checking, setChecking] = React.useState(false);
  const [result, setResult] = React.useState<{
    similarity: number;
    matches: { source: string; percent: number }[];
  } | null>(null);

  const run = () => {
    if (!text.trim()) {
      toast.error("Nhập đoạn văn bản cần kiểm tra.");
      return;
    }
    setChecking(true);
    setTimeout(() => {
      setResult({
        similarity: 12,
        matches: [
          { source: "RAG_pgvector_Architecture_Paper.pdf", percent: 8 },
          { source: "Nguồn công khai trên Internet", percent: 4 },
        ],
      });
      setChecking(false);
    }, 1200);
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

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <Panel title="Kiểm tra trùng lặp" icon={<Scales size={14} />} className="max-w-3xl">
      <Textarea
        label="Đoạn văn bản cần kiểm tra"
        rows={7}
        placeholder="Dán một đoạn trong luận văn của bạn…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        helperText={`${wordCount} từ`}
      />

      <Button variant="primary" className="mt-3" loading={checking} onClick={run}>
        Kiểm tra
      </Button>

      {result && verdict && (
        <div
          className="mt-4 p-3.5 rounded-[10px] fade-in"
          style={{ border: "1px solid var(--border-primary)" }}
        >
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-[26px] font-semibold tnum leading-none">
              {result.similarity}%
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
          <ul className="flex flex-col">
            {result.matches.map((m, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 py-1.5 text-[12.5px]"
                style={{
                  borderTop: i > 0 ? "1px solid var(--border-secondary)" : undefined,
                }}
              >
                <span className="text-secondary truncate">{m.source}</span>
                <span className="tnum text-tertiary whitespace-nowrap">
                  {m.percent}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

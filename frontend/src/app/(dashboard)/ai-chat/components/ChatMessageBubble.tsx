"use client";

import React from "react";
import {
  Check,
  Copy,
  FileText,
  Robot,
  ThumbsDown,
  ThumbsUp,
  Warning,
} from "@phosphor-icons/react";
import { IconButton } from "@/components/ui";
import type { ChatMessage, Citation } from "@/lib/services";
import { formatTime } from "@/lib/format";
import { openSourceDocument } from "../lib/open-source";

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
export const GENERAL_KNOWLEDGE_MARKER = "⚠ Ngoài tài liệu của bạn:";

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

export function MessageBody({
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
export function Citations({ citations }: { citations: Citation[] }) {
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

/* ==========================================================================
   MỘT LƯỢT TRONG HỘI THOẠI
   ========================================================================== */

export interface ChatMessageBubbleProps {
  message: ChatMessage;
  /** `true` khi vừa bấm sao chép chính tin nhắn này. */
  copied: boolean;
  onCopy: (id: number, text: string) => void;
  onRate: (message: ChatMessage, rating: "LIKE" | "DISLIKE") => void;
}

export function ChatMessageBubble({
  message: m,
  copied,
  onCopy,
  onRate,
}: ChatMessageBubbleProps) {
  if (m.role === "USER") {
    return (
      <div className="flex justify-end">
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
    );
  }

  /* Assistant answers run full width with no bubble — they're documents to
     read, not messages to glance at. */
  return (
    <article className="flex gap-2.5 min-w-0">
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

        {m.citations && m.citations.length > 0 && <Citations citations={m.citations} />}

        {!m.streaming && m.content && (
          <div className="flex items-center gap-0.5 mt-1.5 -ml-1">
            <IconButton
              label={copied ? "Đã sao chép" : "Sao chép"}
              size="sm"
              onClick={() => onCopy(m.id, m.content)}
            >
              {copied ? (
                <Check size={13} className="text-success" />
              ) : (
                <Copy size={13} />
              )}
            </IconButton>

            {/* Chỉ đánh giá được câu trả lời server đã lưu. Bản bị bấm "Dừng"
                giữa chừng còn mang id tạm, gửi lên sẽ nhận 404 — bày nút ra là
                bắt người dùng tự dò. */}
            {m.id > 0 && (
              <>
                <IconButton
                  label={m.rating === "LIKE" ? "Bỏ đánh giá" : "Câu trả lời hữu ích"}
                  size="sm"
                  onClick={() => onRate(m, "LIKE")}
                  className={m.rating === "LIKE" ? "text-success" : ""}
                >
                  <ThumbsUp size={13} weight={m.rating === "LIKE" ? "fill" : "regular"} />
                </IconButton>
                <IconButton
                  label={m.rating === "DISLIKE" ? "Bỏ đánh giá" : "Câu trả lời chưa đúng"}
                  size="sm"
                  onClick={() => onRate(m, "DISLIKE")}
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
              <span className="text-[11px] text-muted ml-1">· dừng giữa chừng</span>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

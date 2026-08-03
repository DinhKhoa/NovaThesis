"use client";

import React from "react";
import { Sparkle, Warning } from "@phosphor-icons/react";
import { Button, EmptyState, Skeleton } from "@/components/ui";
import type { AnswerMode, ChatMessage } from "@/lib/services";
import { ChatMessageBubble } from "./ChatMessageBubble";

export interface ChatTranscriptProps {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  /** Phiên đang được nạp lịch sử; `null` nghĩa là khung chat trắng. */
  historyOf: number | null;
  onRetry: () => void;
  answerMode: AnswerMode;
  suggestedPrompts: string[];
  onPickPrompt: (prompt: string) => void;
  copiedId: number | null;
  onCopy: (id: number, text: string) => void;
  onRate: (message: ChatMessage, rating: "LIKE" | "DISLIKE") => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** Chiều cao khung cuộn; trang đầy đủ và ngăn kéo có ràng buộc khác nhau. */
  heightStyle: React.CSSProperties;
}

/**
 * Khung cuộn chứa lượt hỏi–đáp.
 *
 * Chiều cao cố định để ô soạn luôn neo ở đáy và chỉ phần tin nhắn cuộn.
 */
export function ChatTranscript({
  messages,
  loading,
  error,
  historyOf,
  onRetry,
  answerMode,
  suggestedPrompts,
  onPickPrompt,
  copiedId,
  onCopy,
  onRate,
  scrollRef,
  heightStyle,
}: ChatTranscriptProps) {
  return (
    <div
      ref={scrollRef}
      className="overflow-y-auto p-4 flex flex-col gap-5"
      style={heightStyle}
    >
      {/* `historyOf` trong điều kiện là có chủ đích: `useAsync` giữ lại lỗi của
          lần tải trước, nên thiếu nó thì bấm "Hội thoại mới" sau một lần lỗi sẽ
          vẫn thấy nguyên khung báo lỗi cũ. */}
      {error && historyOf !== null ? (
        <EmptyState
          icon={<Warning size={15} />}
          title="Không tải được nội dung hội thoại"
          description={error}
          action={
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Thử lại
            </Button>
          }
        />
      ) : loading ? (
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
          {/* Gợi ý dựng từ chính các nguồn đang chọn — thay cho bốn câu viết
              cứng giống hệt nhau ở mọi đề tài, vốn hay hỏi về những thứ tài
              liệu không hề nhắc tới. */}
          <div className="flex flex-col gap-1.5 mt-1">
            {suggestedPrompts.map((p) => (
              <button
                key={p}
                onClick={() => onPickPrompt(p)}
                className="row-hover text-left px-3 py-2 rounded-lg text-[12.5px] text-secondary hover:bg-[var(--bg-hover)] hover:text-primary"
                style={{ border: "1px solid var(--border-secondary)" }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      ) : (
        messages.map((m) => (
          <ChatMessageBubble
            key={m.id}
            message={m}
            copied={copiedId === m.id}
            onCopy={onCopy}
            onRate={onRate}
          />
        ))
      )}
    </div>
  );
}

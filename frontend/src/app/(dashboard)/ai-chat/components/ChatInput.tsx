"use client";

import React from "react";
import { ArrowUp, Stop, Warning } from "@phosphor-icons/react";
import { IconButton } from "@/components/ui";

export interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  /** Có tài liệu nhưng người dùng bỏ tick hết — gửi câu hỏi lúc này là vô nghĩa. */
  noSourceSelected: boolean;
  onSelectAllSources: () => void;
  /** Số nguồn đang tick / tổng số nguồn, hiển thị dưới ô nhập. */
  selectedCount: number;
  totalCount: number;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  placeholder?: string;
}

/**
 * Ô soạn câu hỏi.
 *
 * Trần 2000 ký tự khớp `chatSchema` của backend: chặn tại chỗ để câu hỏi dài
 * không bị server trả về sau khi người dùng đã gõ xong.
 */
export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  noSourceSelected,
  onSelectAllSources,
  selectedCount,
  totalCount,
  textareaRef,
  placeholder = "Hỏi về tài liệu, khái niệm hoặc cấu trúc luận văn…",
}: ChatInputProps) {
  return (
    <div
      className="p-2.5 flex-shrink-0"
      style={{ borderTop: "1px solid var(--border-secondary)" }}
    >
      {/* Bỏ tick hết nguồn là một trạng thái hợp lệ nhưng vô dụng. Nói ngay tại
          đây thay vì để người dùng gõ xong một câu hỏi rồi mới nhận lại "không
          có tài liệu nào để đối chiếu". */}
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
          <button onClick={onSelectAllSources} className="font-medium hover:underline">
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
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            // Grow with the content up to ~6 lines, then scroll.
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder={placeholder}
          aria-label="Câu hỏi"
          className="flex-1 bg-transparent border-0 outline-none resize-none text-[13.5px] leading-relaxed px-1.5 py-1 max-h-[140px] placeholder:text-[var(--fg-muted)]"
        />

        {streaming ? (
          <IconButton label="Dừng trả lời" onClick={onStop}>
            <Stop size={15} weight="fill" />
          </IconButton>
        ) : (
          <button
            onClick={onSend}
            disabled={!value.trim() || noSourceSelected}
            aria-label="Gửi câu hỏi"
            className="btn btn-primary btn-icon flex-shrink-0"
          >
            <ArrowUp size={15} weight="bold" />
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted mt-1.5 px-1">
        <kbd className="kbd">Enter</kbd> để gửi · <kbd className="kbd">Shift</kbd>+
        <kbd className="kbd">Enter</kbd> để xuống dòng.{" "}
        {totalCount > 0 && (
          <>
            Đang dùng{" "}
            <span className="tnum">
              {selectedCount}/{totalCount}
            </span>{" "}
            nguồn.
          </>
        )}
      </p>
    </div>
  );
}

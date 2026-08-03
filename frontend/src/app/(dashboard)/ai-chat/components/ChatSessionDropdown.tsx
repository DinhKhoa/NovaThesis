"use client";

import React from "react";
import { CaretDown, ChatCircleDots, Check, Plus, Trash } from "@phosphor-icons/react";
import { Spinner } from "@/components/ui";
import type { ChatSession } from "@/lib/services";
import { formatRelative } from "@/lib/format";

/* ==========================================================================
   CHỌN HỘI THOẠI

   Trước đây đây là một CỘT riêng rộng 13rem nằm giữa bảng nguồn và khung chat.
   Lịch sử hội thoại là thứ người ta mở vài lần một buổi, còn khung chat là thứ
   họ nhìn suốt buổi — đổi một phần năm bề ngang màn hình lấy thứ nhất là một
   giao dịch tồi, và nó đẩy khung chat vào phần hẹp nhất của trang.

   Ở đây nó thu về một nút thả xuống đặt ngay trên khung chat: vẫn một cú bấm để
   tới, nhưng không chiếm chỗ trong lúc không dùng.

   Không dùng `<select>` gốc: mỗi dòng cần một nút xoá riêng, mà `<option>` thì
   không chứa được phần tử tương tác nào.
   ========================================================================== */

export interface ChatSessionDropdownProps {
  sessions: ChatSession[];
  activeId: number | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onSelect: (id: number) => void;
  onDelete: (session: ChatSession) => void;
  onNew: () => void;
}

/** Cắt tiêu đề dài để nút không giãn theo câu hỏi đầu tiên của phiên. */
function truncate(value: string, max = 40): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function ChatSessionDropdown({
  sessions,
  activeId,
  loading,
  error,
  onRetry,
  onSelect,
  onDelete,
  onNew,
}: ChatSessionDropdownProps) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const active = sessions.find((s) => s.id === activeId) ?? null;
  const label = active ? truncate(active.title) : "Hội thoại mới";

  /* Đóng khi bấm ra ngoài hoặc bấm Esc. Nghe trên `document` chứ không dùng
     `onBlur`: bấm vào nút xoá bên trong bảng cũng làm nút mở mất focus, và bảng
     sẽ đóng ngay trước khi cú bấm kịp tới đích. */
  React.useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2 w-full min-w-0 px-2.5 py-1.5 rounded-[8px] text-left transition-colors hover:bg-[var(--bg-hover)]"
        style={{ border: "1px solid var(--border-primary)" }}
      >
        <ChatCircleDots size={14} className="text-tertiary flex-shrink-0" aria-hidden="true" />
        <span className="flex-1 min-w-0 truncate text-[12.5px] font-medium">{label}</span>
        {loading && sessions.length === 0 ? (
          <Spinner size={12} />
        ) : (
          <>
            {sessions.length > 0 && (
              <span className="text-[11px] text-muted tnum flex-shrink-0">{sessions.length}</span>
            )}
            <CaretDown size={12} className="text-muted flex-shrink-0" aria-hidden="true" />
          </>
        )}
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Chọn hội thoại"
          className="absolute z-30 mt-1 w-full max-h-[18rem] overflow-y-auto rounded-[10px] p-1"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-primary)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          {/* Luôn đứng đầu bảng, kể cả khi chưa có phiên nào: đây là lối ra cho
              người đang đọc một hội thoại cũ và muốn bắt đầu lại. */}
          <button
            type="button"
            onClick={() => {
              onNew();
              setOpen(false);
            }}
            className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-[12.5px] text-accent transition-colors hover:bg-[var(--bg-hover)]"
          >
            <Plus size={13} className="flex-shrink-0" />
            Hội thoại mới
          </button>

          {error ? (
            <div className="px-2 py-2">
              <p className="text-[12px] text-danger mb-1.5">{error}</p>
              <button
                type="button"
                onClick={onRetry}
                className="text-[12px] text-accent hover:underline"
              >
                Thử lại
              </button>
            </div>
          ) : sessions.length === 0 ? (
            <p className="px-2 py-2 text-[12px] text-tertiary">
              Chưa có hội thoại nào. Đặt câu hỏi đầu tiên để tạo phiên.
            </p>
          ) : (
            <div
              className="mt-1 pt-1 flex flex-col gap-px"
              style={{ borderTop: "1px solid var(--border-secondary)" }}
            >
              {sessions.map((s) => {
                const isActive = s.id === activeId;
                return (
                  <div
                    key={s.id}
                    className="group flex items-center gap-1 rounded-md pr-1 transition-colors hover:bg-[var(--bg-hover)]"
                    style={{ background: isActive ? "var(--bg-active)" : undefined }}
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onClick={() => {
                        onSelect(s.id);
                        setOpen(false);
                      }}
                      className="flex items-start gap-1.5 flex-1 min-w-0 text-left px-2 py-1.5"
                      title={s.title}
                    >
                      <Check
                        size={12}
                        weight="bold"
                        className={`flex-shrink-0 mt-0.5 ${isActive ? "text-accent" : "opacity-0"}`}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block text-[12.5px] truncate ${
                            isActive ? "text-primary font-medium" : "text-secondary"
                          }`}
                        >
                          {truncate(s.title)}
                        </span>
                        {/* `updated_at` chứ không phải `created_at`: phiên vừa
                            nhắn nổi lên đầu và nhãn thời gian phải giải thích
                            được thứ tự đó. */}
                        <span className="block text-[11px] text-muted">
                          {formatRelative(s.updated_at)}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onDelete(s);
                        setOpen(false);
                      }}
                      aria-label={`Xóa hội thoại ${s.title}`}
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-muted hover:text-danger transition-all p-1 flex-shrink-0"
                    >
                      <Trash size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

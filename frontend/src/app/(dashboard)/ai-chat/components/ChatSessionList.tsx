"use client";

import React from "react";
import { Plus, Trash, Warning } from "@phosphor-icons/react";
import { Button, Card, EmptyState, Skeleton } from "@/components/ui";
import type { ChatSession } from "@/lib/services";
import { formatRelative } from "@/lib/format";

export interface ChatSessionListProps {
  sessions: ChatSession[];
  activeId: number | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onSelect: (id: number) => void;
  onDelete: (session: ChatSession) => void;
  onNew: () => void;
}

/** Thanh bên lịch sử hội thoại (UC 6.7 / 6.8). */
export function ChatSessionList({
  sessions,
  activeId,
  loading,
  error,
  onRetry,
  onSelect,
  onDelete,
  onNew,
}: ChatSessionListProps) {
  return (
    <Card hoverable={false} className="p-2 flex flex-col gap-2">
      <Button
        variant="secondary"
        size="sm"
        icon={<Plus size={14} />}
        onClick={onNew}
        className="w-full"
      >
        Hội thoại mới
      </Button>

      <div className="flex flex-col gap-px">
        {error ? (
          <EmptyState
            compact
            icon={<Warning size={15} />}
            title="Không tải được hội thoại"
            description={error}
            action={
              <Button variant="secondary" size="sm" onClick={onRetry}>
                Thử lại
              </Button>
            }
          />
        ) : loading && sessions.length === 0 ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-9 rounded-md" />)
        ) : sessions.length === 0 ? (
          <EmptyState
            compact
            title="Chưa có hội thoại nào"
            description="Đặt câu hỏi đầu tiên ở khung bên phải để tạo phiên."
          />
        ) : (
          sessions.map((s) => {
            const active = s.id === activeId;
            return (
              <div
                key={s.id}
                className="group flex items-center gap-1 rounded-md pr-1 transition-colors hover:bg-[var(--bg-hover)]"
                style={{ background: active ? "var(--bg-active)" : undefined }}
              >
                <button
                  onClick={() => onSelect(s.id)}
                  className={`flex-1 min-w-0 text-left px-2 py-1.5 text-[12.5px] truncate ${
                    active ? "text-primary font-medium" : "text-secondary"
                  }`}
                  title={s.title}
                >
                  {s.title}
                  {/* `updated_at` chứ không phải `created_at`: phiên vừa nhắn
                      phải nổi lên đầu và nhãn thời gian phải giải thích được
                      thứ tự đó. */}
                  <span className="block text-[11px] text-muted font-normal">
                    {formatRelative(s.updated_at)}
                  </span>
                </button>
                <button
                  onClick={() => onDelete(s)}
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
  );
}

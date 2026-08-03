"use client";

import React from "react";
import { FileText, FolderOpen, Plus, Warning } from "@phosphor-icons/react";
import { Button, Card, EmptyState, Skeleton, Spinner } from "@/components/ui";
import type { ChatSource } from "@/lib/services";
import { SOURCE_STATUS } from "../lib/source-status";

/**
 * Danh sách tài liệu kèm ô tick, quyết định trợ lý được đọc những gì.
 *
 * Đây là phần thiếu lớn nhất so với NotebookLM trước đợt sửa này: mọi câu hỏi
 * đều truy xuất TOÀN BỘ tài liệu của đề tài, nên tải năm tài liệu thuộc năm chủ
 * đề lên rồi hỏi thì trợ lý trộn trích dẫn từ cả năm và không có cách nào biết
 * câu hỏi nhắm vào cái nào.
 */
export interface ChatSourcePickerProps {
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
  /** Còn tệp đang lập chỉ mục; danh sách đang được hỏi lại mỗi 5 giây. */
  indexing?: boolean;
  /**
   * Đã chọn được đề tài nào chưa.
   *
   * Phân biệt "đề tài này chưa có tài liệu" với "chưa chọn đề tài nào" — hai
   * trạng thái cùng cho ra danh sách rỗng nhưng cần hai hành động khác hẳn nhau.
   * Trước đây cả hai đều hiện "Chưa có tài liệu nào", nên người mở `/ai-chat` mà
   * không kèm `?thesis=` được mời đi tải tệp lên trong khi thứ họ thiếu chỉ là
   * một lần chọn ở ô ngay phía trên.
   */
  hasThesis?: boolean;
  /** Chiều cao tối đa của danh sách; ngăn kéo bên phải chật hơn trang đầy đủ. */
  maxHeightClassName?: string;
}

export function ChatSourcePicker({
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
  indexing = false,
  hasThesis = true,
  maxHeightClassName = "max-h-[18rem]",
}: ChatSourcePickerProps) {
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

      <div className={`flex flex-col gap-px ${maxHeightClassName} overflow-y-auto`}>
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
        ) : !hasThesis ? (
          <EmptyState
            compact
            icon={<FolderOpen size={15} />}
            title="Chưa chọn đề tài"
            description="Chọn một đề tài ở ô phía trên để nạp kho tài liệu của nó."
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

      {/* Chỉ báo "đang xử lý" nằm ngay dưới danh sách, cạnh những ô tick đang bị
          khoá mà nó giải thích. Không có nó, tệp vừa tải lên trông như bị hỏng
          vĩnh viễn thay vì đang xếp hàng. */}
      {indexing && (
        <span className="flex items-center gap-1.5 px-1 text-[11px] text-tertiary">
          <Spinner size={11} />
          Đang xử lý tài liệu… danh sách tự cập nhật.
        </span>
      )}

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

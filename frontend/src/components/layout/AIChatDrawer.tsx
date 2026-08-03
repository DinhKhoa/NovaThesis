"use client";

/**
 * NGĂN KÉO TRỢ LÝ AI
 *
 * Trợ lý sống ở một trang riêng thì nó chỉ hữu ích với người đã quyết định đi
 * hỏi. Ngăn kéo này đưa nó tới chỗ câu hỏi thật sự nảy ra: đang đọc một tài
 * liệu, đang nhìn một mốc sắp tới hạn. Ngữ cảnh đi kèm nút bấm, nên người dùng
 * không phải chọn lại đề tài và tìm lại đúng tệp trước khi gõ được chữ đầu tiên.
 *
 * Ba điều đáng chú ý về cấu trúc:
 *
 *   • Nó dùng LẠI `useChat` và các mảnh trong `ai-chat/components/`. Đây là một
 *     giao diện thứ hai của cùng một trạng thái, không phải một khung chat thứ
 *     hai — cài đặt lại luồng SSE ở đây là cách chắc chắn để hai nơi trôi khỏi
 *     nhau.
 *   • Phần thân chỉ dựng sau lần mở đầu tiên (`hasOpened`). Ngăn kéo nằm ở
 *     layout nên nó có mặt trên mọi trang; dựng sẵn là ba request mỗi lần tải
 *     trang cho một khung phần lớn người dùng không mở.
 *   • Nó tự ẩn trên chính trang `/ai-chat`. Hai khung chat cạnh nhau, mỗi khung
 *     một phiên riêng, là cách nhanh nhất để người dùng gõ vào nhầm chỗ.
 */

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowSquareOut,
  CaretDown,
  CaretRight,
  FileText,
  Flag,
  Plus,
  Robot,
  X,
} from "@phosphor-icons/react";
import { IconButton } from "@/components/ui";
import { useAIPanelStore } from "@/lib/ai-panel";
import { useAuthStore } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { documentsApi, milestonesApi } from "@/lib/services";

import { ChatInput } from "@/app/(dashboard)/ai-chat/components/ChatInput";
import { ChatSourcePicker } from "@/app/(dashboard)/ai-chat/components/ChatSourcePicker";
import { ChatTranscript } from "@/app/(dashboard)/ai-chat/components/ChatTranscript";
import { useChat } from "@/app/(dashboard)/ai-chat/hooks/useChat";

/** Phím tắt. Cố ý KHÔNG dùng Ctrl+K — ô tìm kiếm của trình duyệt và của nhiều
 *  thư viện lệnh đã chiếm tổ hợp đó, và người dùng sẽ mất chỗ nào đó khác. */
const SHORTCUT_KEY = "j";

export function AIChatDrawer() {
  const isOpen = useAIPanelStore((s) => s.isOpen);
  const hasOpened = useAIPanelStore((s) => s.hasOpened);
  const context = useAIPanelStore((s) => s.context);
  const toggle = useAIPanelStore((s) => s.toggle);
  const close = useAIPanelStore((s) => s.close);

  const user = useAuthStore((s) => s.user);
  const pathname = usePathname();

  /* Ctrl+J bật/tắt ngăn kéo ở mọi trang.
     `preventDefault` là bắt buộc: Chrome và Firefox đều mở cửa sổ Tải xuống
     trên tổ hợp này. */
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === SHORTCUT_KEY) {
        e.preventDefault();
        toggle();
      }
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle, close]);

  /*
   * Trợ lý KHÔNG mở cho quản trị viên — cùng lý do đã chặn ở `ai-chat/page.tsx`:
   * `accessibleDocumentIds()` trả `null` (không giới hạn) cho ADMIN, nên một câu
   * hỏi của quản trị viên sẽ kéo về đoạn trích từ luận văn của bất kỳ ai.
   */
  if (!user || user.role === "ADMIN") return null;

  // Trang trợ lý đầy đủ đã có khung chat của nó.
  if (pathname?.startsWith("/ai-chat")) return null;

  return (
    <>
      {/* Nền mờ chỉ ở màn hình hẹp: trên desktop ngăn kéo là cột thứ ba, người
          dùng vẫn thao tác được với nội dung bên trái trong lúc nó mở. */}
      <div
        aria-hidden="true"
        onClick={close}
        className={`fixed inset-0 z-40 lg:hidden transition-opacity duration-200 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        style={{ background: "var(--overlay, rgba(0,0,0,.35))" }}
      />

      <aside
        aria-label="Trợ lý AI"
        aria-hidden={!isOpen}
        className="fixed top-0 right-0 z-50 h-dvh w-full max-w-[420px] flex flex-col transition-transform duration-200 ease-out"
        style={{
          background: "var(--bg-surface)",
          borderLeft: "1px solid var(--border-primary)",
          boxShadow: isOpen ? "var(--shadow-lg)" : "none",
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          // Ẩn khỏi thứ tự tab khi đóng: một ô nhập nằm ngoài màn hình vẫn nhận
          // được focus bằng phím Tab, và con trỏ biến mất khỏi tầm mắt.
          visibility: isOpen ? "visible" : "hidden",
        }}
      >
        {hasOpened && <DrawerBody context={context} onClose={close} />}
      </aside>
    </>
  );
}

/* ==========================================================================
   THÂN NGĂN KÉO
   ========================================================================== */

function DrawerBody({
  context,
  onClose,
}: {
  context: { type: "document" | "milestone" | null; entityId: number | null; thesisId: number | null };
  onClose: () => void;
}) {
  const [sourcesOpen, setSourcesOpen] = React.useState(false);

  const documentId = context.type === "document" ? context.entityId : null;
  const milestoneId = context.type === "milestone" ? context.entityId : null;

  /* Ghim tài liệu đang xem làm nguồn duy nhất của phiên mới. Đó chính là điều
     người dùng vừa yêu cầu khi bấm "Hỏi AI" ngay trên hàng của tệp đó. */
  const pinnedDocumentIds = React.useMemo(
    () => (documentId === null ? null : [documentId]),
    [documentId]
  );

  const chat = useChat({
    thesisId: context.thesisId,
    milestoneId,
    pinnedDocumentIds,
  });

  /* Nhãn ngữ cảnh. Gọi API riêng thay vì bắt nơi bấm nút truyền tên xuống: mỗi
     trang có một hình dạng dữ liệu khác nhau, và ba trang cùng phải nhớ truyền
     đúng một chuỗi là ba chỗ có thể quên. */
  const { data: contextLabel } = useAsync(async () => {
    if (documentId !== null) return (await documentsApi.get(documentId)).filename;
    if (milestoneId !== null) return (await milestonesApi.get(milestoneId)).name;
    return null;
  }, [documentId, milestoneId]);

  return (
    <>
      <header
        className="flex items-center gap-2 px-3 py-2.5 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border-secondary)" }}
      >
        <span
          className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
          aria-hidden="true"
        >
          <Robot size={14} weight="fill" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-tight">Trợ lý AI</p>
          {context.type !== null && (
            <span
              className="mt-0.5 inline-flex items-center gap-1 max-w-full px-1.5 py-px rounded-[5px] text-[10.5px]"
              style={{ background: "var(--bg-subtle)", color: "var(--fg-tertiary)" }}
              title={contextLabel ?? undefined}
            >
              {context.type === "document" ? <FileText size={10} /> : <Flag size={10} />}
              <span className="truncate">
                {contextLabel ??
                  (context.type === "document" ? "Tài liệu đang xem" : "Mốc tiến độ đang xem")}
              </span>
            </span>
          )}
        </div>

        <IconButton label="Hội thoại mới" size="sm" onClick={chat.newSession}>
          <Plus size={14} />
        </IconButton>

        <Link
          href="/ai-chat"
          onClick={onClose}
          title="Mở trang trợ lý đầy đủ"
          aria-label="Mở trang trợ lý đầy đủ"
          className="p-1.5 rounded-md text-muted hover:text-primary hover:bg-[var(--bg-hover)] transition-colors"
        >
          <ArrowSquareOut size={14} />
        </Link>

        <IconButton label="Đóng trợ lý" size="sm" onClick={onClose}>
          <X size={14} />
        </IconButton>
      </header>

      {/* Bảng nguồn thu gọn. Ngăn kéo hẹp nên nó không thể là một cột như ở
          trang đầy đủ, nhưng vẫn phải với tới được: "trợ lý đang đọc những gì"
          là câu hỏi người dùng đặt ra ngay khi câu trả lời có gì đó không ổn. */}
      <div style={{ borderBottom: "1px solid var(--border-secondary)" }} className="flex-shrink-0">
        <button
          onClick={() => setSourcesOpen((v) => !v)}
          aria-expanded={sourcesOpen}
          className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[11.5px] text-tertiary hover:text-primary transition-colors"
        >
          {sourcesOpen ? <CaretDown size={11} /> : <CaretRight size={11} />}
          Nguồn{" "}
          <span className="tnum">
            {chat.selectedSourceIds.size}/{chat.sources.length}
          </span>
        </button>

        {sourcesOpen && (
          <div className="px-2 pb-2">
            <ChatSourcePicker
              sources={chat.sources}
              selectedIds={chat.selectedSourceIds}
              onToggle={chat.toggleSource}
              onSelectAll={chat.selectAllSources}
              onClearAll={chat.clearAllSources}
              loading={chat.sourcesLoading}
              error={chat.sourcesError}
              onRetry={() => void chat.refetchSources()}
              onUpload={() => window.open("/documents", "_self")}
              disabled={chat.streaming}
              maxHeightClassName="max-h-[12rem]"
            />
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <ChatTranscript
          messages={chat.messages}
          loading={chat.messagesLoading}
          error={chat.messagesError}
          historyOf={chat.historyOf}
          onRetry={() => void chat.refetchMessages()}
          answerMode={chat.answerMode}
          suggestedPrompts={chat.suggestedPrompts}
          onPickPrompt={(p) => {
            chat.setPrompt(p);
            chat.composerRef.current?.focus();
          }}
          copiedId={chat.copiedId}
          onCopy={chat.copy}
          onRate={chat.rate}
          scrollRef={chat.scrollRef}
          heightStyle={{ flex: 1, minHeight: 0 }}
        />

        <ChatInput
          value={chat.prompt}
          onChange={chat.setPrompt}
          onSend={chat.send}
          onStop={chat.stopStreaming}
          streaming={chat.streaming}
          noSourceSelected={chat.noSourceSelected}
          onSelectAllSources={chat.selectAllSources}
          selectedCount={chat.selectedSourceIds.size}
          totalCount={chat.sources.length}
          textareaRef={chat.composerRef}
          placeholder={
            milestoneId !== null
              ? "Hỏi về mốc tiến độ này…"
              : documentId !== null
                ? "Hỏi về tài liệu này…"
                : "Hỏi bất cứ điều gì về đề tài của bạn…"
          }
        />
      </div>
    </>
  );
}

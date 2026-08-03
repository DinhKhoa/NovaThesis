"use client";

/**
 * TRỢ LÝ AI — KHUNG TRANG
 *
 * Tệp này chỉ còn phần bố cục: chọn công cụ, chọn phạm vi đề tài, rồi ghép các
 * mảnh lại. Toàn bộ trạng thái hội thoại nằm trong `hooks/useChat.ts`, còn từng
 * mảnh giao diện nằm trong `components/`.
 *
 * Lý do tách: ngăn kéo `AIChatDrawer` (mở được từ trang Tài liệu và trang Mốc
 * tiến độ) là một giao diện THỨ HAI của cùng trạng thái đó. Giữ tất cả trong một
 * tệp thì hoặc phải nhân đôi ~600 dòng logic luồng SSE, hoặc phải chấp nhận hai
 * khung chat hành xử khác nhau.
 */

import React from "react";
import { useSearchParams } from "next/navigation";
import { ListChecks, MagnifyingGlass, Plus, Robot, Scales } from "@phosphor-icons/react";
import { PageHeader } from "@/components/layout";
import { Button, Card, ConfirmDialog, Tabs } from "@/components/ui";
import { RequireRole } from "@/lib/guards";
import { useAsync } from "@/lib/use-async";
import { thesesApi } from "@/lib/services";

import { AnswerModeToggle } from "./components/AnswerModeToggle";
import { ChatInput } from "./components/ChatInput";
import { ChatSessionDropdown } from "./components/ChatSessionDropdown";
import { ChatSourcePicker } from "./components/ChatSourcePicker";
import { ChatTranscript } from "./components/ChatTranscript";
import { PlagiarismPanel } from "./components/PlagiarismPanel";
import { RoadmapPanel } from "./components/RoadmapPanel";
import { SemanticSearchPanel } from "./components/SemanticSearchPanel";
import { ThesisScopeSelect } from "./components/ThesisScopeSelect";
import { useChat } from "./hooks/useChat";

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

  const chat = useChat({ thesisId });

  /* Đổi phạm vi đề tài là đổi luôn kho tài liệu trợ lý được đọc, nên phiên đang
     mở — vốn thuộc đề tài cũ — phải đóng lại. Hỏi tiếp trong đó vẫn sẽ truy xuất
     tài liệu của đề tài trước, và người dùng không có cách nào nhận ra. */
  const changeThesis = React.useCallback(
    (id: number) => {
      setPickedThesisId(id);
      chat.resetSession();
    },
    [chat]
  );

  /**
   * Mở kho tài liệu ở TAB MỚI.
   *
   * Trước đây nút "Thêm tài liệu" gọi `window.open(…, "_self")`: người dùng bị
   * đá khỏi trợ lý, mất phiên đang mở và mọi ô tick vừa chọn, rồi phải tự tìm
   * đường quay lại. Mà tải tệp lên là việc DIỄN RA Ở NƠI KHÁC — trang này không
   * có form tải lên nào để chờ nó xong.
   *
   * Mở tab mới giữ nguyên trạng thái ở đây, và `useChat` hỏi lại danh sách nguồn
   * ngay khi tab này hiện lại (xem phần polling trong hook), nên tài liệu vừa
   * tải lên tự xuất hiện mà không cần bấm gì thêm.
   */
  const openDocuments = React.useCallback(() => {
    const url = thesisId ? `/documents?thesis=${thesisId}` : "/documents";
    window.open(url, "_blank", "noopener");
  }, [thesisId]);

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
          và có được dùng kiến thức ngoài tài liệu hay không. */}
      {tool === "chat" && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0 max-w-[22rem] flex-1">
            <ThesisScopeSelect theses={theses} value={thesisId} onChange={changeThesis} />
          </div>
          <AnswerModeToggle
            value={chat.answerMode}
            onChange={chat.changeAnswerMode}
            disabled={chat.streaming}
          />
        </div>
      )}

      {tool === "chat" && (
        /* HAI cột: NGUỒN → KHUNG CHAT.
           Lịch sử hội thoại từng là cột thứ ba nằm CHÍNH GIỮA, chắn phần màn
           hình đáng giá nhất bằng một danh sách mở vài lần mỗi buổi. Nó đã thu
           về nút thả xuống ngay trên khung chat, trả lại bề ngang cho thứ người
           ta thực sự nhìn suốt buổi. */
        <div className="grid grid-cols-1 lg:grid-cols-[16rem_1fr] gap-3 items-start">
          {/* `sticky` để bảng nguồn còn đó khi cuộn qua một hội thoại dài — bỏ
              tick một tài liệu không nên bắt người ta cuộn ngược lên đầu trang.
              Chỉ bật từ `lg` trở lên: ở màn hình hẹp hai khối xếp chồng, và một
              khối dính ở đó sẽ che mất khung chat bên dưới. */}
          <div className="lg:sticky lg:top-4">
            <ChatSourcePicker
              sources={chat.sources}
              selectedIds={chat.selectedSourceIds}
              onToggle={chat.toggleSource}
              onSelectAll={chat.selectAllSources}
              onClearAll={chat.clearAllSources}
              loading={chat.sourcesLoading}
              error={chat.sourcesError}
              onRetry={() => void chat.refetchSources()}
              onUpload={() => openDocuments()}
              indexing={chat.sourcesIndexing}
              hasThesis={thesisId !== null}
              disabled={chat.streaming}
              maxHeightClassName="max-h-[24rem]"
            />
          </div>

          <Card hoverable={false} className="flex flex-col overflow-hidden">
            {/* Thanh chọn phiên nằm TRONG cột chat, ngay trên khung hội thoại:
                đổi hội thoại là thao tác thuộc về khung chat, không phải một
                vùng điều hướng riêng. */}
            <div
              className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
              style={{ borderBottom: "1px solid var(--border-secondary)" }}
            >
              <ChatSessionDropdown
                sessions={chat.sessions}
                activeId={chat.sessionId}
                loading={chat.sessionsLoading}
                error={chat.sessionsError}
                onRetry={() => void chat.refetchSessions()}
                onSelect={chat.selectSession}
                onDelete={chat.setDeleteTarget}
                onNew={chat.newSession}
              />
              <Button
                variant="secondary"
                size="sm"
                icon={<Plus size={13} />}
                onClick={chat.newSession}
                className="flex-shrink-0"
              >
                Mới
              </Button>
            </div>

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
              // Thanh chọn phiên vừa thêm vào chiếm khoảng 2.5rem phía trên
              // khung này; không trừ đi thì cả thẻ tràn khỏi khung nhìn.
              heightStyle={{ height: "min(calc(100dvh - 20rem), 34rem)" }}
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
            />
          </Card>
        </div>
      )}

      {tool === "semantic" && (
        <SemanticSearchPanel
          theses={theses}
          thesisId={thesisId}
          onThesisChange={changeThesis}
        />
      )}
      {tool === "plagiarism" && (
        <PlagiarismPanel theses={theses} thesis={activeThesis} onThesisChange={changeThesis} />
      )}
      {tool === "roadmap" && (
        <RoadmapPanel theses={theses} thesis={activeThesis} onThesisChange={changeThesis} />
      )}

      {/* UC 6.8 NFR: xoá lịch sử là thao tác không hoàn tác được nên phải hỏi
          lại — biểu tượng thùng rác chỉ hiện khi rê chuột, quá dễ bấm nhầm. */}
      <ConfirmDialog
        open={!!chat.deleteTarget}
        onClose={() => chat.setDeleteTarget(null)}
        title="Xóa hội thoại này?"
        confirmLabel="Xóa"
        loading={chat.deleting}
        message={
          <>
            Toàn bộ câu hỏi và câu trả lời trong{" "}
            <strong className="text-primary">{chat.deleteTarget?.title}</strong> sẽ không
            còn hiển thị. Thao tác này không hoàn tác được.
          </>
        }
        onConfirm={() => void chat.confirmDeleteSession()}
      />
    </div>
  );
}

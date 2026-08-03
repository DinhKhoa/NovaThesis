"use client";

/**
 * NGĂN KÉO TRỢ LÝ AI — TRẠNG THÁI TOÀN CỤC
 *
 * Trợ lý chỉ hữu ích ở đúng lúc người dùng đang nhìn thứ họ muốn hỏi. Bắt họ mở
 * tab mới, chọn lại đề tài, tìm lại đúng tài liệu rồi mới gõ được câu hỏi là ba
 * bước đủ để phần lớn người dùng thôi hỏi.
 *
 * Store này giữ đúng hai thứ: ngăn kéo đang mở hay đóng, và nó đang nói về cái
 * gì. Mọi trạng thái hội thoại (phiên, tin nhắn, luồng SSE) nằm trong
 * `useChat` — trộn vào đây sẽ khiến mỗi ký tự của câu trả lời đang chạy chữ
 * render lại mọi thành phần có đọc store.
 *
 * Theo đúng khuôn của `lib/toast.ts`: một hook cho component, một object hàm
 * tiện dụng cho nơi gọi ngoài React (handler `onClick` không cần subscribe).
 */

import { create } from "zustand";

export type AIPanelContextType = "document" | "milestone" | null;

interface AIPanelContext {
  type: AIPanelContextType;
  /** Mã tài liệu hoặc mã mốc, tuỳ `type`. */
  entityId: number | null;
  /** Phạm vi RAG. Không có nó thì trợ lý không biết được đọc kho tài liệu nào. */
  thesisId: number | null;
}

interface AIPanelState {
  isOpen: boolean;
  /**
   * Ngăn kéo đã từng được mở trong lần tải trang này chưa.
   *
   * Ngăn kéo được gắn ở layout nên nó tồn tại trên MỌI trang sau đăng nhập.
   * Dựng phần thân ngay từ đầu sẽ bắn ba request (phiên, nguồn, gợi ý câu hỏi)
   * trên mỗi lần tải trang, cho một khung mà phần lớn người dùng không mở.
   * Cờ này là điều kiện để phần thân chỉ dựng khi thật sự cần — và vì nó không
   * bao giờ quay về `false`, đóng ngăn kéo lại KHÔNG làm mất cuộc trò chuyện
   * đang dở.
   */
  hasOpened: boolean;
  context: AIPanelContext;
  openWithDocument: (docId: number, thesisId: number) => void;
  openWithMilestone: (milestoneId: number, thesisId: number) => void;
  open: () => void;
  close: () => void;
  toggle: () => void;
  clearContext: () => void;
}

const EMPTY_CONTEXT: AIPanelContext = { type: null, entityId: null, thesisId: null };

export const useAIPanelStore = create<AIPanelState>((set) => ({
  isOpen: false,
  hasOpened: false,
  context: EMPTY_CONTEXT,

  openWithDocument: (entityId, thesisId) =>
    set({
      isOpen: true,
      hasOpened: true,
      context: { type: "document", entityId, thesisId },
    }),

  openWithMilestone: (entityId, thesisId) =>
    set({
      isOpen: true,
      hasOpened: true,
      context: { type: "milestone", entityId, thesisId },
    }),

  /* Mở bằng phím tắt: KHÔNG đụng tới ngữ cảnh. Người dùng bấm Ctrl+J để quay
     lại đúng cuộc trò chuyện họ vừa thu nhỏ, không phải để bắt đầu lại. */
  open: () => set({ isOpen: true, hasOpened: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen, hasOpened: true })),

  clearContext: () => set({ context: EMPTY_CONTEXT }),
}));

/* Helper gọi được từ ngoài React — dùng trong `onClick` mà không cần subscribe. */
export const aiPanel = {
  openWithDocument: (docId: number, thesisId: number) =>
    useAIPanelStore.getState().openWithDocument(docId, thesisId),
  openWithMilestone: (milestoneId: number, thesisId: number) =>
    useAIPanelStore.getState().openWithMilestone(milestoneId, thesisId),
  open: () => useAIPanelStore.getState().open(),
  close: () => useAIPanelStore.getState().close(),
  toggle: () => useAIPanelStore.getState().toggle(),
  clearContext: () => useAIPanelStore.getState().clearContext(),
};

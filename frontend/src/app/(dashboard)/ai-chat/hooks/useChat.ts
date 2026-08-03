"use client";

/**
 * TRẠNG THÁI CỦA MỘT KHUNG HỘI THOẠI
 *
 * Gom toàn bộ phần "động" của trợ lý vào một chỗ: phiên, lịch sử tin nhắn, luồng
 * SSE, bảng nguồn và chế độ trả lời. Trang `/ai-chat` và ngăn kéo `AIChatDrawer`
 * là HAI giao diện của cùng một trạng thái này — cài đặt hai lần là cách chắc
 * chắn để hai nơi trôi khỏi nhau (một nơi quên `refetchSessions`, nơi kia quên
 * cắt luồng khi đổi phiên).
 *
 * Không có logic mới ở đây so với bản trước khi tách: đây là đúng phần thân của
 * `AIChatWorkspace` cũ.
 */
import React from "react";
import { toast } from "@/lib/toast";
import { isApiError } from "@/lib/api";
import { useAsync } from "@/lib/use-async";
import {
  aiApi,
  documentsApi,
  streamChat,
  type AnswerMode,
  type ChatMessage,
  type ChatSession,
  type ChatSource,
} from "@/lib/services";
import { SOURCE_STATUS } from "../lib/source-status";

/** Id tạm của tin nhắn đang nhận token. Số âm nên không thể trùng id thật. */
export const STREAMING_MESSAGE_ID = -1;

export interface UseChatOptions {
  /** Phạm vi đề tài. `null` = chưa chọn được đề tài nào. */
  thesisId: number | null;
  /**
   * Mốc tiến độ mà câu hỏi đang nhắm tới.
   *
   * Chỉ gửi kèm khi TẠO phiên mới và không bao giờ được lưu vào CSDL — server
   * dùng nó trong đúng một request để nạp tên/yêu cầu/hạn chót của mốc vào
   * system prompt (xem `ai.routes.ts`).
   */
  milestoneId?: number | null;
  /**
   * Nguồn được chọn sẵn khi mở khung chat (ngăn kéo "Hỏi AI" từ trang Tài liệu).
   *
   * Chỉ có tác dụng khi CHƯA có phiên nào: phiên đã tồn tại mang sẵn tập nguồn
   * của nó, ghi đè ở client sẽ khiến giao diện và CSDL nói hai điều khác nhau.
   */
  pinnedDocumentIds?: number[] | null;
}

export function useChat({
  thesisId,
  milestoneId = null,
  pinnedDocumentIds = null,
}: UseChatOptions) {
  /* ---- Phiên hội thoại (UC 6.7 / 6.8) ---- */

  const {
    data: sessionsData,
    loading: sessionsLoading,
    error: sessionsError,
    refetch: refetchSessions,
  } = useAsync(() => aiApi.sessions(thesisId ?? undefined), [thesisId]);

  const sessions = React.useMemo(() => sessionsData ?? [], [sessionsData]);

  /* Hai state cho cùng một phiên, có chủ đích.

     `sessionId` là phiên khung chat đang nói chuyện; `historyOf` là phiên cần
     NẠP lịch sử từ server. Khi câu hỏi đầu tiên tạo ra một phiên mới, ta chỉ đặt
     `sessionId` — nếu đổi luôn `historyOf`, `useAsync` sẽ tải lại danh sách tin
     nhắn và ghi đè đúng câu trả lời đang chạy chữ. */
  const [sessionId, setSessionId] = React.useState<number | null>(null);
  const [historyOf, setHistoryOf] = React.useState<number | null>(null);

  const {
    data: messagesData,
    loading: messagesLoading,
    error: messagesError,
    refetch: refetchMessages,
    setData: setMessages,
  } = useAsync(() => aiApi.messages(historyOf ?? 0), [historyOf], {
    enabled: historyOf !== null,
  });

  const messages = React.useMemo(() => messagesData ?? [], [messagesData]);

  const [deleteTarget, setDeleteTarget] = React.useState<ChatSession | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const [prompt, setPrompt] = React.useState("");
  const [streaming, setStreaming] = React.useState(false);
  const [copiedId, setCopiedId] = React.useState<number | null>(null);

  /* ---- Nguồn và chế độ trả lời (kiểu NotebookLM) ---- */

  /**
   * Danh sách tài liệu có thể làm nguồn.
   *
   * Nạp theo ĐỀ TÀI chứ không theo phiên: bảng nguồn phải hiện ngay cả khi chưa
   * có phiên nào (người dùng chọn nguồn TRƯỚC rồi mới hỏi câu đầu tiên — đúng
   * thứ tự của NotebookLM). Khi đã có phiên, `sessionId` vào deps để lựa chọn đã
   * lưu của phiên đó được nạp lại.
   */
  const {
    data: sourceList,
    loading: sourcesLoading,
    error: sourcesError,
    refetch: refetchSources,
  } = useAsync(async () => {
    if (sessionId !== null) return aiApi.sources(sessionId);

    // Chưa có phiên: mượn danh sách tài liệu của đề tài, mặc định chọn hết.
    if (thesisId === null) return { uses_all: true, data: [] };
    const page = await documentsApi.list({ thesis_id: thesisId, per_page: 200 });
    return {
      uses_all: true,
      data: page.data.map((d) => ({
        id: d.id,
        filename: d.filename,
        status_ai: d.status_ai,
        ai_error: d.ai_error ?? null,
        page_count: d.page_count ?? null,
        summary: d.summary_ai ? d.summary_ai.slice(0, 240) : null,
        thesis_id: d.thesis_id,
        selected: true,
      })),
    };
  }, [sessionId, thesisId]);

  const sources: ChatSource[] = React.useMemo(() => sourceList?.data ?? [], [sourceList]);

  /* ---- Tài liệu đang được xử lý -----------------------------------------

     Lập chỉ mục chạy ở worker nền, mất từ vài giây tới vài phút tuỳ kích thước
     tệp. Trước đây bảng nguồn chụp lấy trạng thái đúng một lần lúc mở trang,
     nên người vừa tải tài liệu lên rồi mở trợ lý sẽ thấy MỌI tệp ở trạng thái
     "đang chờ lập chỉ mục", ô tick bị khoá, và không có gì cho biết phải chờ
     bao lâu hay khi nào nên tải lại trang. Hầu hết người dùng kết luận là hỏng.

     Ba tín hiệu, cùng một hàm `refetchSources`:
       • Hỏi lại mỗi 5 giây trong lúc CÒN tệp chưa xử lý xong — và chỉ trong lúc
         đó. Mọi tệp đã DONE hoặc ERROR thì dừng hẳn, không có vòng lặp nền nào
         chạy suốt buổi.
       • Chỉ hỏi khi tab đang hiển thị. Polling trong ba mươi tab bỏ quên là cách
         chắc chắn nhất để tự tạo tải cho chính máy chủ mình đang chờ.
       • Hỏi lại ngay khi quay lại tab. Người dùng mở trang Tài liệu ở tab khác,
         tải tệp lên rồi quay về — đúng khoảnh khắc danh sách cần mới lại. */
  const indexing = React.useMemo(
    () => sources.some((s) => s.status_ai === "PENDING" || s.status_ai === "PROCESSING"),
    [sources]
  );

  React.useEffect(() => {
    const poll = () => {
      if (document.visibilityState !== "visible") return;
      void refetchSources();
    };

    // Quay lại tab luôn kích hoạt một lần đọc, kể cả khi không còn tệp nào đang
    // xử lý: trong lúc đi vắng người dùng có thể vừa tải thêm tài liệu mới.
    document.addEventListener("visibilitychange", poll);

    if (!indexing) {
      return () => document.removeEventListener("visibilitychange", poll);
    }

    const timer = setInterval(poll, 5_000);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [indexing, refetchSources]);

  /**
   * Nguồn đang tick.
   *
   * `null` = chưa đụng tới, lấy theo những gì server trả về. Tách bạch "chưa
   * chọn gì" khỏi "đã bỏ chọn hết" là bắt buộc: hai trạng thái này có cùng số 0
   * nhưng ý nghĩa ngược nhau — một cái là dùng tất cả, cái kia là không dùng gì.
   */
  const [pickedSources, setPickedSources] = React.useState<Set<number> | null>(null);

  /**
   * Nguồn ghim sẵn (ngăn kéo "Hỏi AI" mở từ một tài liệu cụ thể).
   *
   * Chỉ áp khi chưa có phiên và người dùng chưa tự tick gì. Ghi đè lựa chọn thủ
   * công sẽ khiến ô tick nhảy về chỗ cũ ngay sau khi người dùng đổi nó.
   */
  const pinnedKey = pinnedDocumentIds?.join(",") ?? "";
  const pinnedSet = React.useMemo(() => {
    if (!pinnedDocumentIds || pinnedDocumentIds.length === 0) return null;
    return new Set(pinnedDocumentIds);
    // `pinnedKey` là dạng ổn định của mảng: mảng mới mỗi lần render sẽ làm memo vô dụng.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinnedKey]);

  const selectedSourceIds = React.useMemo(() => {
    if (pickedSources) return pickedSources;
    if (pinnedSet && sessionId === null) {
      // Giao với danh sách thật: id ghim đến từ một trang khác và có thể không
      // nằm trong phạm vi đề tài đang chọn.
      const available = new Set(sources.map((s) => s.id));
      const intersect = [...pinnedSet].filter((id) => available.has(id));
      if (intersect.length > 0) return new Set(intersect);
    }
    return new Set(sources.filter((s) => s.selected).map((s) => s.id));
  }, [pickedSources, pinnedSet, sessionId, sources]);

  const [answerMode, setAnswerMode] = React.useState<AnswerMode>("HYBRID");

  /* Có tài liệu nhưng không tick cái nào — khác hẳn "kho tài liệu rỗng", và cần
     một cách xử lý khác hẳn: tick lại, chứ không phải đi tải thêm tệp. */
  const noSourceSelected = sources.length > 0 && selectedSourceIds.size === 0;

  /* Gợi ý câu hỏi dựng từ chính các nguồn đang chọn, thay cho bốn câu viết cứng
     giống nhau ở mọi đề tài. */
  const { data: suggestedPrompts } = useAsync(
    () => aiApi.suggestedPrompts({ thesis_id: thesisId, session_id: sessionId }),
    [thesisId, sessionId]
  );

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

  const stopStreaming = React.useCallback(() => {
    abortRef.current?.();
    abortRef.current = null;
    setStreaming(false);
    /* Server vẫn lưu phần chữ đã sinh với `finished_at` rỗng, nên đánh dấu
       `incomplete` ngay tại chỗ. Không tải lại tin nhắn ở đây: bản ghi đó được
       ghi SAU khi kết nối đứt, hỏi ngay lúc này sẽ trượt mất nó và xoá luôn
       phần trả lời người dùng vừa đọc. */
    setMessages((prev) =>
      (prev ?? []).map((m) => (m.streaming ? { ...m, streaming: false, incomplete: true } : m))
    );
  }, [setMessages]);

  /**
   * Đóng phiên đang mở và trả khung chat về trạng thái trắng.
   *
   * Dùng khi đổi phạm vi đề tài: hỏi tiếp trong phiên cũ vẫn sẽ truy xuất tài
   * liệu của đề tài trước, và người dùng không có cách nào nhận ra.
   */
  const resetSession = React.useCallback(() => {
    stopStreaming();
    setSessionId(null);
    setHistoryOf(null);
    setMessages([]);
    // Nguồn thuộc về đề tài cũ. Giữ lại tập đã tick sẽ lọc kho tài liệu mới
    // bằng những id không còn nằm trong đó — kết quả là phạm vi rỗng.
    setPickedSources(null);
  }, [stopStreaming, setMessages]);

  const send = React.useCallback(() => {
    const text = prompt.trim();
    if (!text || streaming) return;

    setPrompt("");
    if (composerRef.current) composerRef.current.style.height = "auto";
    setStreaming(true);

    /* Tập nguồn chỉ gửi kèm khi TẠO phiên mới. Phiên đã tồn tại thì server đọc
       nguồn từ CSDL — gửi thêm ở đây chỉ tạo cơ hội cho hai giá trị lệch nhau,
       và lịch sử hội thoại sẽ chứa những câu trả lời dựa trên phạm vi khác nhau
       mà không ghi lại điều đó ở đâu cả. */
    const sourcesForNewSession =
      sessionId === null && selectedSourceIds.size > 0 && selectedSourceIds.size < sources.length
        ? [...selectedSourceIds]
        : undefined;

    abortRef.current = streamChat(
      {
        session_id: sessionId ?? undefined,
        // Chỉ gửi thesis_id khi phiên còn chưa tồn tại: phiên đã tạo mang sẵn
        // phạm vi đề tài của nó, gửi thêm chỉ tạo cơ hội cho hai giá trị lệch nhau.
        thesis_id: sessionId === null ? (thesisId ?? undefined) : undefined,
        prompt: text,
        ...(sessionId === null ? { answer_mode: answerMode } : {}),
        ...(sourcesForNewSession ? { document_ids: sourcesForNewSession } : {}),
        // Cùng lý do: ngữ cảnh mốc tiến độ chỉ có nghĩa ở câu hỏi mở đầu phiên.
        ...(sessionId === null && milestoneId ? { milestone_id: milestoneId } : {}),
      },
      {
        onSession: ({ session_id, user_message }) => {
          setSessionId(session_id);
          setMessages((prev) => [
            ...(prev ?? []),
            user_message,
            {
              id: STREAMING_MESSAGE_ID,
              session_id,
              role: "ASSISTANT",
              content: "",
              created_at: new Date().toISOString(),
              streaming: true,
            },
          ]);
          // Phiên vừa tạo phải xuất hiện ngay ở thanh bên, kèm tiêu đề mà server
          // cắt ra từ chính câu hỏi.
          void refetchSessions();
        },

        onCitations: (citations) => {
          // Nguồn hiện TRƯỚC khi chữ chạy xong: người đọc mở được tài liệu gốc
          // trong lúc câu trả lời vẫn đang sinh.
          setMessages((prev) =>
            (prev ?? []).map((m) => (m.id === STREAMING_MESSAGE_ID ? { ...m, citations } : m))
          );
        },

        onDelta: (chunk) => {
          setMessages((prev) =>
            (prev ?? []).map((m) =>
              m.id === STREAMING_MESSAGE_ID
                ? { ...m, content: m.content + chunk, streaming: true }
                : m
            )
          );
        },

        onDone: (done) => {
          setMessages((prev) =>
            (prev ?? []).map((m) => {
              if (m.id !== STREAMING_MESSAGE_ID) return m;
              // Thay bằng bản ghi chính thức: id thật là điều kiện để nút đánh
              // giá bên dưới gọi được `/ai/messages/:id/rating`.
              return done.message
                ? { ...done.message, streaming: false }
                : { ...m, id: done.message_id, streaming: false };
            })
          );
          abortRef.current = null;
          setStreaming(false);
          // `updated_at` vừa đổi — thanh bên sắp theo cột đó.
          void refetchSessions();
        },

        onError: (message) => {
          toast.error(message);
          setMessages((prev) => {
            const list = prev ?? [];
            const pending = list.find((m) => m.id === STREAMING_MESSAGE_ID);
            // Hỏng trước khi có chữ nào thì bỏ hẳn bong bóng: một khung trống
            // không nói được gì mà toast chưa nói.
            if (!pending || !pending.content) {
              return list.filter((m) => m.id !== STREAMING_MESSAGE_ID);
            }
            return list.map((m) =>
              m.id === STREAMING_MESSAGE_ID ? { ...m, streaming: false, incomplete: true } : m
            );
          });
          abortRef.current = null;
          setStreaming(false);
        },
      }
    );
  }, [
    prompt,
    streaming,
    sessionId,
    selectedSourceIds,
    sources.length,
    thesisId,
    answerMode,
    milestoneId,
    setMessages,
    refetchSessions,
  ]);

  /* Đánh giá câu trả lời (UC 6.9). Cập nhật lạc quan rồi trả lại giá trị cũ nếu
     server từ chối — một cú bấm 👍 không đáng để chờ round-trip mới đổi màu. */
  const rate = React.useCallback(
    async (message: ChatMessage, next: "LIKE" | "DISLIKE") => {
      // Luồng phụ 1a: bấm lại đúng biểu tượng đang chọn nghĩa là huỷ đánh giá.
      const value = message.rating === next ? null : next;
      const before = message.rating ?? null;

      setMessages((prev) =>
        (prev ?? []).map((m) => (m.id === message.id ? { ...m, rating: value } : m))
      );

      try {
        const updated = await aiApi.rate(message.id, value);
        setMessages((prev) => (prev ?? []).map((m) => (m.id === updated.id ? updated : m)));
        toast.success(
          value === null
            ? "Đã bỏ đánh giá câu trả lời."
            : value === "LIKE"
              ? "Cảm ơn bạn. Phản hồi giúp cải thiện chất lượng trả lời."
              : "Đã ghi nhận. Chúng tôi sẽ xem lại câu trả lời này."
        );
      } catch (err) {
        setMessages((prev) =>
          (prev ?? []).map((m) => (m.id === message.id ? { ...m, rating: before } : m))
        );
        toast.error(isApiError(err) ? err.message : "Không lưu được đánh giá.");
      }
    },
    [setMessages]
  );

  const copy = React.useCallback((id: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  }, []);

  const selectSession = React.useCallback(
    (id: number) => {
      if (id === sessionId) return;
      // Đổi phiên giữa lúc token đang về thì phần chữ còn lại sẽ chảy vào khung
      // của phiên khác — cắt luồng trước khi chuyển.
      if (streaming) stopStreaming();
      setSessionId(id);
      setHistoryOf(id);
      // Mỗi phiên có tập nguồn riêng; xoá lựa chọn cục bộ để `useAsync` nạp lại
      // đúng tập của phiên vừa mở.
      setPickedSources(null);

      const target = sessions.find((s) => s.id === id);
      if (target?.answer_mode) setAnswerMode(target.answer_mode);
    },
    [sessionId, streaming, stopStreaming, sessions]
  );

  /* Không gọi `aiApi.createSession` ở đây: backend tự tạo phiên khi nhận câu hỏi
     đầu tiên và đặt tiêu đề bằng chính câu hỏi đó. Tạo trước sẽ để lại một dãy
     phiên rỗng tên "Hội thoại mới" mỗi lần người dùng đổi ý. */
  const newSession = React.useCallback(() => {
    if (streaming) stopStreaming();
    setSessionId(null);
    setHistoryOf(null);
    setMessages([]);
    setPickedSources(null);
    composerRef.current?.focus();
  }, [streaming, stopStreaming, setMessages]);

  /* ---- Thao tác trên bảng nguồn ----------------------------------------- */

  /**
   * Lưu tập nguồn lên server.
   *
   * Chỉ gọi khi phiên đã tồn tại. Chưa có phiên thì lựa chọn còn nằm ở client và
   * sẽ đi kèm câu hỏi đầu tiên — tạo sẵn một phiên rỗng chỉ để lưu vài ô tick sẽ
   * để lại một dãy hội thoại trống mỗi lần người dùng đổi ý.
   */
  const persistSources = React.useCallback(
    (next: Set<number>) => {
      if (sessionId === null) return;

      // Tick hết = quay lại quy ước "dùng tất cả", nên gửi mảng rỗng. Gửi đủ
      // danh sách cũng chạy đúng, nhưng khi có tài liệu mới tải lên sau đó nó sẽ
      // KHÔNG tự nằm trong phạm vi — trái với thứ người dùng vừa chọn.
      const payload = next.size === sources.length ? [] : [...next];

      void aiApi.setSources(sessionId, payload).catch((err) => {
        toast.error(isApiError(err) ? err.message : "Không lưu được lựa chọn nguồn.");
        // Trả về trạng thái của server thay vì giữ một lựa chọn không được ghi
        // — nếu không, người dùng tưởng đã đổi phạm vi trong khi thật ra chưa.
        setPickedSources(null);
        void refetchSources();
      });
    },
    [sessionId, sources.length, refetchSources]
  );

  const toggleSource = React.useCallback(
    (id: number) => {
      const next = new Set(selectedSourceIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setPickedSources(next);
      persistSources(next);
    },
    [selectedSourceIds, persistSources]
  );

  const selectAllSources = React.useCallback(() => {
    const next = new Set(sources.filter((s) => SOURCE_STATUS[s.status_ai].usable).map((s) => s.id));
    setPickedSources(next);
    persistSources(next);
  }, [sources, persistSources]);

  const clearAllSources = React.useCallback(() => {
    setPickedSources(new Set<number>());
    // Không gọi `persistSources`: mảng rỗng ở server nghĩa là "dùng tất cả",
    // ngược hẳn ý người dùng. Trạng thái "không dùng nguồn nào" chỉ tồn tại ở
    // client và khung chat sẽ nhắc tick lại trước khi gửi câu hỏi.
  }, []);

  const changeAnswerMode = React.useCallback(
    (mode: AnswerMode) => {
      setAnswerMode(mode);
      if (sessionId === null) return;
      void aiApi.setAnswerMode(sessionId, mode).catch((err) => {
        toast.error(isApiError(err) ? err.message : "Không đổi được chế độ trả lời.");
      });
    },
    [sessionId]
  );

  const confirmDeleteSession = React.useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await aiApi.deleteSession(deleteTarget.id);
      toast.success("Đã xóa hội thoại.");
      if (sessionId === deleteTarget.id) {
        setSessionId(null);
        setHistoryOf(null);
        setMessages([]);
      }
      setDeleteTarget(null);
      void refetchSessions();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Không xóa được hội thoại.");
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, sessionId, setMessages, refetchSessions]);

  return {
    /* Phiên */
    sessions,
    sessionsLoading,
    sessionsError,
    refetchSessions,
    sessionId,
    historyOf,
    selectSession,
    newSession,
    resetSession,

    /* Tin nhắn */
    messages,
    messagesLoading,
    messagesError,
    refetchMessages,

    /* Soạn & gửi */
    prompt,
    setPrompt,
    streaming,
    send,
    stopStreaming,
    rate,
    copy,
    copiedId,

    /* Nguồn */
    sources,
    sourcesLoading,
    sourcesError,
    refetchSources,
    /** Còn tệp đang lập chỉ mục — bảng nguồn hiện chỉ báo "đang xử lý". */
    sourcesIndexing: indexing,
    selectedSourceIds,
    toggleSource,
    selectAllSources,
    clearAllSources,
    noSourceSelected,

    /* Chế độ trả lời & gợi ý */
    answerMode,
    changeAnswerMode,
    suggestedPrompts: suggestedPrompts ?? [],

    /* Xoá hội thoại */
    deleteTarget,
    setDeleteTarget,
    deleting,
    confirmDeleteSession,

    /* Ref cho khung cuộn và ô nhập */
    scrollRef,
    composerRef,
  };
}

export type ChatController = ReturnType<typeof useChat>;

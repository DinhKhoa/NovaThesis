/**
 * LỚP DỊCH VỤ API
 *
 * Một nơi duy nhất khai báo mọi endpoint và kiểu dữ liệu tương ứng. Các trang
 * gọi hàm ở đây thay vì tự ghép chuỗi URL — đường dẫn sai sẽ là lỗi biên dịch
 * chứ không phải một request 404 lúc chạy.
 *
 * Kiểu ở đây phản chiếu serializer của backend (`backend/src/modules/serializers.ts`).
 * Hai bên phải khớp; lệch nhau thì TypeScript ở trang gọi sẽ báo trước.
 */
import { api, getAccessToken } from "./api";

/* ==========================================================================
   KIỂU DÙNG CHUNG
   ========================================================================== */

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export type UserRole = "ADMIN" | "LECTURER" | "STUDENT";
export type UserStatus = "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED";

export type ThesisStatus =
  | "DRAFT"
  | "PENDING"
  | "REVISION_REQUIRED"
  | "ONGOING"
  | "COMPLETED"
  | "REJECTED";

export type MilestoneStatus =
  | "NOT_STARTED"
  | "ONGOING"
  | "PENDING_APPROVAL"
  | "REVISION_REQUIRED"
  | "COMPLETED";

export type AIStatus = "PENDING" | "PROCESSING" | "DONE" | "ERROR";
export type NotificationType = "MILESTONE" | "THESIS" | "FEEDBACK" | "SYSTEM";
export type LogLevel = "INFO" | "WARN" | "ERROR";

/* ==========================================================================
   ĐỀ TÀI
   ========================================================================== */

export interface Thesis {
  id: number;
  title: string;
  description: string;
  field: string;
  status: ThesisStatus;
  lecturer_id: number | null;
  lecturer_name: string;
  lecturer_department: string | null;
  student_names: string[];
  student_ids: number[];
  /** Kỳ nghiên cứu, dạng "YYYY-MM-DD". Thay cho `academic_year` cũ. */
  start_date: string | null;
  end_date: string | null;
  rejection_reason: string | null;
  revision_note: string | null;
  milestone_count: number;
  document_count: number;
  submitted_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LecturerOption {
  id: number;
  name: string;
  email: string;
  lecturer_code: string;
  department: string;
  max_students: number;
  current_students: number;
  available: boolean;
}

export interface ThesisHistoryEntry {
  id: number;
  action: string;
  actor_name: string;
  event: string;
  created_at: string;
  details?: Record<string, unknown> | null;
}

export const thesesApi = {
  list: (params?: Record<string, string | number>) =>
    api.get<Paginated<Thesis>>("/theses", params),
  fields: () => api.get<string[]>("/theses/fields"),
  lecturers: () => api.get<LecturerOption[]>("/theses/lecturers"),
  pending: () => api.get<Paginated<Thesis>>("/theses/pending"),
  get: (id: number) => api.get<Thesis>(`/theses/${id}`),
  create: (data: {
    title: string;
    description: string;
    field: string;
    lecturer_id?: number;
    /** Kỳ nghiên cứu, "YYYY-MM-DD". Tuỳ chọn — bản nháp chưa cần biết. */
    start_date?: string;
    end_date?: string;
  }) => api.post<Thesis>("/theses", data),
  update: (id: number, data: Partial<Pick<Thesis, "title" | "description" | "field">>) =>
    api.patch<Thesis>(`/theses/${id}`, data),
  remove: (id: number) => api.delete<void>(`/theses/${id}`),
  submit: (id: number) => api.post<Thesis>(`/theses/${id}/submit`),
  approve: (id: number) => api.post<Thesis>(`/theses/${id}/approve`),
  requestRevision: (id: number, note: string) =>
    api.post<Thesis>(`/theses/${id}/request-revision`, { note }),
  reject: (id: number, reason: string) => api.post<Thesis>(`/theses/${id}/reject`, { reason }),
  complete: (id: number, force = false) => api.post<Thesis>(`/theses/${id}/complete`, { force }),
  assignLecturer: (id: number, lecturer_id: number) =>
    api.patch<Thesis>(`/theses/${id}/lecturer`, { lecturer_id }),
  history: (id: number) => api.get<ThesisHistoryEntry[]>(`/theses/${id}/history`),
};

/* ==========================================================================
   MỐC TIẾN ĐỘ
   ========================================================================== */

export interface Milestone {
  id: number;
  thesis_id: number;
  thesis_title: string | null;
  name: string;
  description: string;
  deadline: string;
  status: MilestoneStatus;
  description_revision: string | null;
  evidence_file_url: string | null;
  evidence_filename: string | null;
  extension_requested: boolean;
  extension_reason: string | null;
  extension_new_deadline: string | null;
  extension_status: "PENDING" | "APPROVED" | "REJECTED" | null;
  order_index: number;
  approved_by: number | null;
  approved_by_name: string | null;
  approved_at: string | null;
  feedback_count: number;
  allowed_targets?: MilestoneStatus[];
  created_at: string;
  updated_at: string;
}

export interface MilestoneHistoryEntry {
  id: number;
  milestone_id: number;
  changed_by_name: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  note: string | null;
  created_at: string;
}

export interface StudentDashboard {
  thesis: Thesis | null;
  total: number;
  completed: number;
  in_progress: number;
  overdue: number;
  due_soon: number;
  progress_percent: number;
  document_count: number;
  upcoming: Milestone[];
  recent_activities: {
    id: number;
    actor: string;
    action: string;
    target: string;
    created_at: string;
  }[];
}

export interface LecturerDashboardRow {
  thesis_id: number;
  title: string;
  student_names: string[];
  total: number;
  completed: number;
  overdue: number;
  progress_percent: number;
  last_activity_at: string | null;
}

export const milestonesApi = {
  list: (params?: Record<string, string | number>) =>
    api.get<Paginated<Milestone>>("/milestones", params),
  get: (id: number) => api.get<Milestone>(`/milestones/${id}`),
  create: (data: {
    thesis_id: number;
    name: string;
    description?: string;
    deadline: string;
  }) => api.post<Milestone>("/milestones", data),
  update: (
    id: number,
    data: Partial<{ name: string; description: string; deadline: string }>
  ) => api.patch<Milestone>(`/milestones/${id}`, data),
  remove: (id: number) => api.delete<void>(`/milestones/${id}`),
  setStatus: (id: number, status: MilestoneStatus) =>
    api.patch<Milestone>(`/milestones/${id}/status`, { status }),
  uploadEvidence: (
    id: number,
    file: File,
    autoSubmit = true,
    onProgress?: (p: number) => void
  ) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("auto_submit", String(autoSubmit));
    return api.upload<Milestone>(`/milestones/${id}/evidence`, fd, onProgress);
  },
  requestExtension: (id: number, new_deadline: string, reason: string) =>
    api.post<Milestone>(`/milestones/${id}/extension`, { new_deadline, reason }),
  reviewExtension: (id: number, approve: boolean, note?: string) =>
    api.post<Milestone>(`/milestones/${id}/extension/review`, { approve, note }),
  approve: (id: number) => api.post<Milestone>(`/milestones/${id}/approve`),
  requestRevision: (id: number, note: string) =>
    api.post<Milestone>(`/milestones/${id}/request-revision`, { note }),
  history: (id: number) => api.get<MilestoneHistoryEntry[]>(`/milestones/${id}/history`),
  reorder: (items: { id: number; order_index: number }[]) =>
    api.patch<void>("/milestones/reorder", { items }),
  studentDashboard: () => api.get<StudentDashboard>("/milestones/dashboard/student"),
  lecturerDashboard: () => api.get<LecturerDashboardRow[]>("/milestones/dashboard/lecturer"),
};

/* ==========================================================================
   TÀI LIỆU
   ========================================================================== */

export interface ResearchDocument {
  id: number;
  thesis_id: number;
  thesis_title: string | null;
  filename: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  page_count: number | null;
  summary_ai: string | null;
  summary_note: string | null;
  status_ai: AIStatus;
  ai_error: string | null;
  ai_model: string | null;
  tags: string[];
  uploaded_by: number;
  uploaded_by_name: string | null;
  chunk_count: number;
  version_count: number;
  share_count: number;
  created_at: string;
  updated_at: string;
  /** URL đã ký, chỉ có ở GET /documents/:id. `null` khi người xem chỉ được chia sẻ mô tả. */
  download_url?: string | null;
  preview_url?: string | null;
  /** `true` khi quyền đọc đến từ chia sẻ (UC 5.10) — chỉ đọc, không tải tệp gốc. */
  shared_only?: boolean;
}

export interface DocumentVersion {
  id: number;
  document_id: number;
  version_number: number;
  file_size: number;
  uploaded_by_name: string | null;
  change_note: string | null;
  is_current: boolean;
  created_at: string;
}

export const documentsApi = {
  list: (params?: Record<string, string | number>) =>
    api.get<Paginated<ResearchDocument>>("/documents", params),
  tags: () => api.get<string[]>("/documents/tags"),
  get: (id: number) => api.get<ResearchDocument>(`/documents/${id}`),
  upload: (
    file: File,
    thesisId: number,
    tags: string,
    onProgress?: (p: number) => void
  ) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("thesis_id", String(thesisId));
    if (tags) fd.append("tags", tags);
    return api.upload<ResearchDocument>("/documents", fd, onProgress);
  },
  update: (
    id: number,
    data: Partial<{ filename: string; tags: string[]; summary_note: string }>
  ) => api.patch<ResearchDocument>(`/documents/${id}`, data),
  remove: (id: number) => api.delete<void>(`/documents/${id}`),
  reindex: (id: number) => api.post<ResearchDocument>(`/documents/${id}/reindex`),
  /**
   * Backend ký URL ngay trong bản ghi chi tiết chứ không có endpoint riêng:
   * một request lấy được cả metadata lẫn liên kết, và liên kết luôn khớp với
   * quyền vừa được kiểm tra ở chính request đó.
   */
  async downloadUrl(id: number): Promise<{ url: string | null }> {
    const doc = await api.get<ResearchDocument>(`/documents/${id}`);
    return { url: doc.download_url ?? null };
  },
  versions: (id: number) => api.get<DocumentVersion[]>(`/documents/${id}/versions`),
  uploadVersion: (id: number, file: File, changeNote: string, onProgress?: (p: number) => void) => {
    const fd = new FormData();
    fd.append("file", file);
    if (changeNote) fd.append("change_note", changeNote);
    return api.upload<DocumentVersion>(`/documents/${id}/versions`, fd, onProgress);
  },
  share: (id: number, thesis_id: number) =>
    api.post<{ id: number }>(`/documents/${id}/share`, { thesis_id }),
  shares: (id: number) =>
    api.get<{ id: number; thesis_id: number; thesis_title: string; created_at: string }[]>(
      `/documents/${id}/shares`
    ),
  unshare: (id: number, thesisId: number) =>
    api.delete<void>(`/documents/${id}/shares/${thesisId}`),
};

/* ==========================================================================
   TRỢ LÝ AI
   ========================================================================== */

export interface Citation {
  chunk_id: number;
  document_id: number;
  doc_title: string;
  page?: number;
  score: number;
  snippet?: string;
}

/**
 * Chế độ trả lời của trợ lý.
 *
 * `STRICT` — chỉ dùng tài liệu đã chọn. `HYBRID` — được bổ sung kiến thức chung
 * nhưng phải tách vào khối cảnh báo riêng. Xem `services/ai/rag.ts` phía backend.
 */
export type AnswerMode = "STRICT" | "HYBRID";

export interface ChatSession {
  id: number;
  thesis_id: number | null;
  title: string;
  message_count: number;
  answer_mode?: AnswerMode;
  created_at: string;
  updated_at: string;
}

/** Một tài liệu có thể dùng làm nguồn cho hội thoại (bảng nguồn kiểu NotebookLM). */
export interface ChatSource {
  id: number;
  filename: string;
  status_ai: AIStatus;
  ai_error: string | null;
  page_count: number | null;
  /** Tóm tắt đã cắt ngắn, dùng làm tooltip. */
  summary: string | null;
  thesis_id: number;
  selected: boolean;
}

export interface ChatSourceList {
  /** `true` khi phiên chưa chọn riêng nguồn nào — mặc định dùng tất cả. */
  uses_all: boolean;
  data: ChatSource[];
}

export interface ChatMessage {
  id: number;
  session_id: number;
  role: "USER" | "ASSISTANT";
  content: string;
  citations?: Citation[];
  rating?: "LIKE" | "DISLIKE" | null;
  model_name?: string | null;
  latency_ms?: number | null;
  incomplete?: boolean;
  /** Câu trả lời có khối kiến thức nằm ngoài tài liệu (chế độ HYBRID). */
  used_general_knowledge?: boolean;
  created_at: string;
  /** Chỉ tồn tại phía client trong lúc token đang về. */
  streaming?: boolean;
}

export interface SemanticSearchResult {
  chunk_id: number;
  document_id: number;
  doc_title: string;
  page: number | null;
  score: number;
  snippet: string;
}

export interface AISuggestion {
  id: number;
  thesis_id: number;
  payload: { name: string; description: string; weeks_from_now: number; order_index: number }[];
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  model_name: string | null;
  attempt: number;
  created_at: string;
}

export interface PlagiarismResult {
  id: number;
  similarity: number;
  matches: { source: string; document_id: number | null; percent: number }[];
}

export interface AIStats {
  total_messages: number;
  total_sessions: number;
  total_searches: number;
  total_summaries: number;
  total_plagiarism_checks: number;
  by_feature: { feature: string; count: number; share: number }[];
  daily: { date: string; count: number }[];
  top_cited_documents: { document_id: number; filename: string; count: number }[];
  rating: { like: number; dislike: number };
  model_usage: { model_name: string; count: number }[];
}

export const aiApi = {
  /* Backend bọc danh sách trong { data }. Bóc ngay tại đây để mọi trang gọi
     đều nhận đúng một hình dạng, thay vì mỗi trang tự viết một helper gỡ phong bì. */
  sessions: async (thesisId?: number): Promise<ChatSession[]> =>
    (await api.get<{ data: ChatSession[] }>("/ai/sessions", thesisId ? { thesis_id: thesisId } : undefined)).data,
  createSession: (data: { thesis_id?: number | null; title?: string }) =>
    api.post<ChatSession>("/ai/sessions", data),
  renameSession: (id: number, title: string) =>
    api.patch<ChatSession>(`/ai/sessions/${id}`, { title }),
  setAnswerMode: (id: number, answer_mode: AnswerMode) =>
    api.patch<ChatSession>(`/ai/sessions/${id}`, { answer_mode }),
  deleteSession: (id: number) => api.delete<void>(`/ai/sessions/${id}`),

  /* ---- Bảng nguồn (kiểu NotebookLM) ---- */
  sources: (sessionId: number) =>
    api.get<ChatSourceList>(`/ai/sessions/${sessionId}/sources`),
  /** Mảng rỗng = quay lại "dùng tất cả tài liệu trong phạm vi". */
  setSources: (sessionId: number, documentIds: number[]) =>
    api.put<{ uses_all: boolean; document_ids: number[] }>(
      `/ai/sessions/${sessionId}/sources`,
      { document_ids: documentIds }
    ),
  /** Câu hỏi mở đầu dựng từ chính các nguồn đang chọn. */
  suggestedPrompts: async (params: {
    thesis_id?: number | null;
    session_id?: number | null;
  }): Promise<string[]> => {
    const query: Record<string, number> = {};
    if (params.thesis_id) query.thesis_id = params.thesis_id;
    if (params.session_id) query.session_id = params.session_id;
    return (await api.get<{ data: string[] }>("/ai/suggested-prompts", query)).data;
  },

  messages: async (sessionId: number): Promise<ChatMessage[]> =>
    (await api.get<Paginated<ChatMessage>>(`/ai/sessions/${sessionId}/messages`, { per_page: 100 })).data,
  rate: (messageId: number, rating: "LIKE" | "DISLIKE" | null, note?: string) =>
    api.post<ChatMessage>(`/ai/messages/${messageId}/rating`, { rating, note }),
  search: (query: string, thesisId?: number | null, topK?: number) =>
    api.post<{ results: SemanticSearchResult[]; took_ms: number; scope_documents: number }>(
      "/ai/search",
      { query, thesis_id: thesisId ?? undefined, top_k: topK }
    ),
  suggestions: async (thesisId: number): Promise<AISuggestion[]> =>
    (await api.get<{ data: AISuggestion[] }>("/ai/suggestions", { thesis_id: thesisId })).data,
  suggest: (thesisId: number) => api.post<AISuggestion>("/ai/suggestions", { thesis_id: thesisId }),
  acceptSuggestion: async (id: number, indexes?: number[]): Promise<Milestone[]> =>
    (await api.post<{ data: Milestone[]; suggestion: AISuggestion }>(`/ai/suggestions/${id}/accept`, { indexes })).data,
  rejectSuggestion: (id: number) => api.post<AISuggestion>(`/ai/suggestions/${id}/reject`),
  regenerateSuggestion: (id: number) => api.post<AISuggestion>(`/ai/suggestions/${id}/regenerate`),
  plagiarism: (thesisId: number, text: string) =>
    api.post<PlagiarismResult>("/ai/plagiarism", { thesis_id: thesisId, text }),
  stats: () => api.get<AIStats & { generated_at: string }>("/ai/stats"),
};

/* ==========================================================================
   CHAT DẠNG LUỒNG (SSE)
   ========================================================================== */

export interface ChatStreamHandlers {
  onSession?: (data: {
    session_id: number;
    thesis_id: number | null;
    answer_mode: AnswerMode;
    /** Nguồn thực tế phiên đang dùng; mảng rỗng = tất cả tài liệu trong phạm vi. */
    source_document_ids: number[];
    user_message: ChatMessage;
  }) => void;
  onCitations?: (citations: Citation[], excludedBySelection: number) => void;
  onDelta?: (text: string) => void;
  onDone?: (data: {
    message_id: number;
    session_id: number;
    /** Bản ghi chính thức từ server — dùng nó thay cho nội dung đã ghép ở client. */
    message: ChatMessage;
    model_name: string | null;
    latency_ms: number;
    citations: number;
    incomplete: boolean;
  }) => void;
  onError?: (message: string) => void;
}

/**
 * Gửi câu hỏi và nhận trả lời theo luồng.
 *
 * Dùng `fetch` + `ReadableStream` chứ không dùng `EventSource`: EventSource chỉ
 * hỗ trợ GET và không gửi được header Authorization, nên câu hỏi sẽ phải nằm
 * trong query string — lộ trong log máy chủ và trong lịch sử trình duyệt.
 *
 * Trả về hàm huỷ, phục vụ nút "Dừng trả lời".
 */
export function streamChat(
  body: {
    session_id?: number | null;
    thesis_id?: number | null;
    prompt: string;
    /** Chỉ có tác dụng khi tạo phiên mới; phiên đã có thì server đọc từ CSDL. */
    answer_mode?: AnswerMode;
    document_ids?: number[];
  },
  handlers: ChatStreamHandlers
): () => void {
  const controller = new AbortController();
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

  (async () => {
    try {
      const response = await fetch(`${base}/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: "Không gửi được câu hỏi." }));
        handlers.onError?.(err.message ?? "Không gửi được câu hỏi.");
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        handlers.onError?.("Trình duyệt không hỗ trợ nhận dữ liệu theo luồng.");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Sự kiện SSE ngăn cách bằng dòng trống. Giữ lại phần đuôi chưa trọn
        // vẹn: gói mạng cắt ngang giữa một sự kiện JSON là chuyện bình thường.
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const raw of events) {
          let eventName = "message";
          let dataLine = "";
          for (const line of raw.split("\n")) {
            if (line.startsWith("event:")) eventName = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
          }
          if (!dataLine) continue;

          try {
            const payload = JSON.parse(dataLine);
            switch (eventName) {
              case "session":
                handlers.onSession?.(payload);
                break;
              case "citations":
                handlers.onCitations?.(
                  payload.citations ?? [],
                  payload.excluded_by_selection ?? 0
                );
                break;
              case "delta":
                handlers.onDelta?.(payload.text ?? "");
                break;
              case "done":
                handlers.onDone?.(payload);
                break;
              case "error":
                handlers.onError?.(payload.message ?? "Đã xảy ra lỗi.");
                break;
            }
          } catch {
            // Dòng keep-alive hoặc JSON hỏng — bỏ qua, không làm gãy luồng.
          }
        }
      }
    } catch (err) {
      // Người dùng bấm "Dừng" không phải lỗi.
      if ((err as Error)?.name === "AbortError") return;
      handlers.onError?.("Mất kết nối tới máy chủ.");
    }
  })();

  return () => controller.abort();
}

/* ==========================================================================
   PHẢN HỒI
   ========================================================================== */

export interface FeedbackItem {
  id: number;
  target_type: "MILESTONE" | "DOCUMENT";
  target_id: number | null;
  target_title: string;
  thesis_id: number | null;
  user_id: number;
  user_name: string;
  user_role: UserRole;
  user_avatar: string | null;
  content: string;
  is_deleted: boolean;
  parent_id: number | null;
  depth: number;
  file_url: string | null;
  file_name: string | null;
  is_resolved: boolean;
  resolved_by: number | null;
  resolved_by_name: string | null;
  resolved_at: string | null;
  edited_at: string | null;
  created_at: string;
  created_timestamp: number;
  replies: FeedbackItem[];
}

export const feedbacksApi = {
  list: (params?: Record<string, string | number | boolean>) =>
    api.get<Paginated<FeedbackItem>>("/feedbacks", params as Record<string, string | number>),
  create: (data: {
    milestone_id?: number;
    document_id?: number;
    content: string;
    parent_id?: number;
    file?: File | null;
  }) => {
    const fd = new FormData();
    if (data.milestone_id) fd.append("milestone_id", String(data.milestone_id));
    if (data.document_id) fd.append("document_id", String(data.document_id));
    fd.append("content", data.content);
    if (data.parent_id) fd.append("parent_id", String(data.parent_id));
    if (data.file) fd.append("file", data.file);
    return api.upload<FeedbackItem>("/feedbacks", fd);
  },
  update: (id: number, content: string) =>
    api.patch<FeedbackItem>(`/feedbacks/${id}`, { content }),
  remove: (id: number) => api.delete<void>(`/feedbacks/${id}`),
  resolve: (id: number, is_resolved: boolean) =>
    api.post<FeedbackItem>(`/feedbacks/${id}/resolve`, { is_resolved }),
};

/* ==========================================================================
   THÔNG BÁO
   ========================================================================== */

export interface NotificationItem {
  id: number;
  type: NotificationType;
  title: string;
  content: string;
  link: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface NotificationPreference {
  type: NotificationType;
  in_app: boolean;
  email: boolean;
}

export const notificationsApi = {
  list: (params?: Record<string, string | number>) =>
    api.get<Paginated<NotificationItem> & { unread_count: number }>("/notifications", params),
  unreadCount: () => api.get<{ count: number }>("/notifications/unread-count"),
  markRead: (id: number) => api.patch<NotificationItem>(`/notifications/${id}/read`),
  markAllRead: () => api.patch<{ updated: number }>("/notifications/read-all"),
  remove: (id: number) => api.delete<void>(`/notifications/${id}`),
  preferences: () => api.get<NotificationPreference[]>("/notifications/preferences"),
  savePreferences: (preferences: NotificationPreference[]) =>
    api.put<NotificationPreference[]>("/notifications/preferences", { preferences }),
};

/* ==========================================================================
   QUẢN TRỊ
   ========================================================================== */

/** Một việc cần xử lý trên trang tổng quan của quản trị viên. */
export interface AdminAction {
  key: string;
  label: string;
  count: number;
  /** Đường dẫn kèm bộ lọc, do server đặt để hai bên không ghép lệch nhau. */
  href: string;
}

export interface AdminOverview {
  users: {
    total: number;
    students: number;
    lecturers: number;
    admins: number;
    active: number;
    suspended: number;
  };
  theses: {
    total: number;
    by_status: { status: ThesisStatus; label: string; count: number; percent: number }[];
  };
  milestones: { total: number; completed: number; overdue: number };
  documents: { total: number; indexed: number; failed: number; total_bytes: number };
  ai: { total_messages: number; total_sessions: number };
  ai_usage_weekly: { week: string; count: number }[];
  actions_required: AdminAction[];
  recent_errors: {
    id: number;
    action: string;
    created_at: string;
    actor: string | null;
    message: string | null;
  }[];
}

export interface AccountUser {
  id: number;
  email: string;
  full_name: string;
  role: UserRole;
  status: UserStatus;
  avatar_url: string | null;
  code: string | null;
  department: string | null;
  max_students: number | null;
  email_verified: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface SystemLogEntry {
  id: number;
  user_id: number | null;
  user_email: string;
  level: LogLevel;
  action: string;
  ip_address: string | null;
  user_agent: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface SystemConfigItem {
  id: number;
  config_key: string;
  config_value: string;
  value_type: "STRING" | "INT" | "BOOLEAN" | "JSON";
  category: "AI" | "STORAGE" | "SECURITY" | "GENERAL";
  description: string | null;
  is_secret: boolean;
  updated_by_name: string | null;
  updated_at: string;
}

export interface AdminStatistics {
  users: {
    total: number;
    students: number;
    lecturers: number;
    admins: number;
    active: number;
    suspended: number;
  };
  theses: {
    total: number;
    by_status: { status: ThesisStatus; label: string; count: number; percent: number }[];
  };
  milestones: { total: number; completed: number; overdue: number };
  ai: { total_messages: number; total_sessions: number };
  documents: { total: number; indexed: number; failed: number };
  ai_usage_weekly: { week: string; count: number }[];
}

export const adminApi = {
  /** Trang tổng quan: số liệu + việc cần xử lý. Khác `/statistics` ở mục đích. */
  overview: () => api.get<AdminOverview>("/admin/overview"),
  users: (params?: Record<string, string | number>) =>
    api.get<Paginated<AccountUser>>("/admin/users", params),
  createUser: (data: {
    email: string;
    full_name: string;
    role: UserRole;
    student_code?: string;
    lecturer_code?: string;
    department?: string;
    max_students?: number;
  }) => api.post<AccountUser>("/admin/users", data),
  updateUser: (
    id: number,
    data: Partial<{ full_name: string; department: string; max_students: number }>
  ) => api.patch<AccountUser>(`/admin/users/${id}`, data),
  setUserStatus: (id: number, status: UserStatus) =>
    api.patch<AccountUser>(`/admin/users/${id}/status`, { status }),
  setUserRole: (id: number, role: UserRole, extra?: { lecturer_code?: string; department?: string }) =>
    api.patch<AccountUser>(`/admin/users/${id}/role`, { role, ...extra }),
  removeUser: (id: number) => api.delete<void>(`/admin/users/${id}`),
  statistics: () => api.get<AdminStatistics>("/admin/statistics"),
  logs: (params?: Record<string, string | number>) =>
    api.get<Paginated<SystemLogEntry>>("/admin/logs", params),
  logActions: () => api.get<string[]>("/admin/logs/actions"),
  configs: () => api.get<SystemConfigItem[]>("/admin/configs"),
  saveConfigs: (configs: { config_key: string; config_value: string }[]) =>
    api.put<SystemConfigItem[]>("/admin/configs", { configs }),
};

/* ==========================================================================
   BÁO CÁO
   ========================================================================== */

export interface ReportOverview {
  total_theses: number;
  completion_rate: number;
  ai_queries: number;
  total_students: number;
  theses_by_status: { status: ThesisStatus; label: string; count: number; percent: number }[];
  ai_by_feature: { feature: string; count: number; share: number }[];
}

export interface GanttData {
  thesis: { id: number; title: string; start: string; end: string };
  tasks: {
    id: number;
    name: string;
    start: string;
    end: string;
    status: MilestoneStatus;
    progress: number;
    overdue: boolean;
  }[];
}

export const reportsApi = {
  overview: () => api.get<ReportOverview>("/reports/overview"),
  gantt: (thesisId: number) => api.get<GanttData>("/reports/gantt", { thesis_id: thesisId }),

  /**
   * Tải tệp xuất ra.
   *
   * Không dùng `window.open`: cửa sổ mới không mang theo header Authorization,
   * nên server sẽ trả 401. Tải bằng fetch rồi tạo blob URL — cũng nhờ đó mà
   * bắt được lỗi và hiện toast thay vì mở một tab trắng.
   */
  async download(path: string, filename: string): Promise<void> {
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
    const res = await fetch(`${base}${path}`, {
      headers: getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {},
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ message: "Không tải được tệp." }));
      throw { message: body.message ?? "Không tải được tệp.", status: res.status };
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Thu hồi ngay: blob URL giữ nguyên tệp trong bộ nhớ cho tới khi bị huỷ.
    URL.revokeObjectURL(url);
  },
};

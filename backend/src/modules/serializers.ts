/**
 * SERIALIZER — HỢP ĐỒNG JSON VỚI FRONTEND
 *
 * Mọi endpoint đều trả dữ liệu qua các hàm ở đây. Gom một chỗ vì hình dạng JSON
 * là hợp đồng với 14 trang React đã viết sẵn: đổi tên một khoá ở đây là đổi ở
 * đúng một nơi, thay vì đi sửa rải rác trong 12 module rồi bỏ sót một chỗ.
 *
 * Hai quy ước:
 *   • Khoá dùng snake_case, khớp interface đã khai trong `frontend/src`.
 *   • Thời gian trả về dạng ISO 8601 UTC. Định dạng hiển thị là việc của tầng
 *     giao diện — nó biết múi giờ và ngôn ngữ của người đang xem, backend thì
 *     không.
 */
import type {
  AIChatMessage,
  AIChatSession,
  AISuggestion,
  Document,
  DocumentVersion,
  Feedback,
  Milestone,
  MilestoneHistory,
  Notification,
  SystemConfig,
  SystemLog,
  Thesis,
  User,
} from "@prisma/client";

/* ==========================================================================
   NGƯỜI DÙNG
   ========================================================================== */

type UserWithProfiles = User & {
  student?: { id: number; student_code: string | null; members?: { thesis_id: number }[] } | null;
  lecturer?: { id: number; lecturer_code: string; department: string; max_students: number } | null;
};

/**
 * Khớp `User` trong `frontend/src/lib/auth.ts`.
 *
 * `thesis_id` được tính từ quan hệ thành viên chứ không phải một cột: ERD gốc
 * để `students.thesis_id` đơn trị, còn ở đây một sinh viên có thể có lịch sử
 * nhiều đề tài (xem `thesis_members`). Frontend chỉ quan tâm đề tài đang hoạt
 * động, nên trả về đúng cái đó.
 */
export function toUserDTO(user: UserWithProfiles) {
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    status: user.status,
    avatar_url: user.avatar_url,
    email_verified: user.email_verified_at !== null,
    created_at: iso(user.created_at),
    last_login_at: iso(user.last_login_at),

    ...(user.student
      ? {
          student_id: user.student.id,
          student_code: user.student.student_code,
          thesis_id: user.student.members?.[0]?.thesis_id ?? null,
        }
      : {}),

    ...(user.lecturer
      ? {
          lecturer_id: user.lecturer.id,
          lecturer_code: user.lecturer.lecturer_code,
          department: user.lecturer.department,
          max_students: user.lecturer.max_students,
        }
      : {}),
  };
}

/** Dòng trong bảng quản trị người dùng (`admin/users/page.tsx`). */
export function toAccountDTO(user: UserWithProfiles) {
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    status: user.status,
    avatar_url: user.avatar_url,
    // Giao diện hiển thị một cột "Mã số" duy nhất cho cả hai vai trò.
    code: user.lecturer?.lecturer_code ?? user.student?.student_code ?? null,
    department: user.lecturer?.department ?? null,
    max_students: user.lecturer?.max_students ?? null,
    email_verified: user.email_verified_at !== null,
    last_login_at: iso(user.last_login_at),
    created_at: iso(user.created_at),
  };
}

/** Mục chọn giảng viên hướng dẫn trong form tạo đề tài. */
export function toLecturerOptionDTO(row: {
  id: number;
  lecturer_code: string;
  department: string;
  max_students: number;
  user: { full_name: string; email: string };
  _count?: { theses: number };
}) {
  const current = row._count?.theses ?? 0;
  return {
    id: row.id,
    name: row.user.full_name,
    email: row.user.email,
    lecturer_code: row.lecturer_code,
    department: row.department,
    max_students: row.max_students,
    current_students: current,
    // Giao diện dùng cờ này để làm mờ lựa chọn thay vì để sinh viên chọn xong
    // mới bị server từ chối.
    available: current < row.max_students,
  };
}

/* ==========================================================================
   ĐỀ TÀI
   ========================================================================== */

type ThesisWithRelations = Thesis & {
  lecturer?: { id: number; department: string; user: { full_name: string } } | null;
  members?: { student: { id: number; student_code: string | null; user: { full_name: string } } }[];
  _count?: { milestones?: number; documents?: number };
};

/** Khớp `Thesis` trong `frontend/src/app/(dashboard)/theses/page.tsx`. */
export function toThesisDTO(thesis: ThesisWithRelations) {
  const students = thesis.members?.map((m) => m.student) ?? [];
  return {
    id: thesis.id,
    title: thesis.title,
    description: thesis.description ?? "",
    field: thesis.field,
    status: thesis.status,
    lecturer_id: thesis.lecturer?.id ?? thesis.lecturer_id,
    lecturer_name: thesis.lecturer?.user.full_name ?? "Chưa phân công",
    lecturer_department: thesis.lecturer?.department ?? null,
    student_names: students.map((s) => s.user.full_name),
    student_ids: students.map((s) => s.id),
    /* KỲ NGHIÊN CỨU — thay cho `academic_year` cũ.
       Cột `@db.Date` nên trả "YYYY-MM-DD": thêm phần giờ vào sẽ khiến
       `<input type="date">` của trình duyệt bỏ trắng. */
    start_date: thesis.start_date ? thesis.start_date.toISOString().slice(0, 10) : null,
    end_date: thesis.end_date ? thesis.end_date.toISOString().slice(0, 10) : null,
    rejection_reason: thesis.rejection_reason,
    revision_note: thesis.revision_note,
    milestone_count: thesis._count?.milestones ?? 0,
    document_count: thesis._count?.documents ?? 0,
    submitted_at: iso(thesis.submitted_at),
    completed_at: iso(thesis.completed_at),
    created_at: iso(thesis.created_at),
    updated_at: iso(thesis.updated_at),
  };
}

/* ==========================================================================
   MỐC TIẾN ĐỘ
   ========================================================================== */

type MilestoneWithRelations = Milestone & {
  approver?: { full_name: string } | null;
  thesis?: { id: number; title: string } | null;
  _count?: { feedbacks?: number };
};

/** Khớp `Milestone` trong `frontend/src/app/(dashboard)/milestones/page.tsx`. */
export function toMilestoneDTO(m: MilestoneWithRelations) {
  return {
    id: m.id,
    thesis_id: m.thesis_id,
    thesis_title: m.thesis?.title ?? null,
    name: m.name,
    description: m.description ?? "",
    deadline: isoDate(m.deadline),
    status: m.status,
    description_revision: m.description_revision,
    evidence_file_url: m.evidence_file_url,
    evidence_filename: m.evidence_filename,
    extension_requested: m.extension_requested,
    extension_reason: m.extension_reason,
    extension_new_deadline: m.extension_new_deadline ? isoDate(m.extension_new_deadline) : null,
    extension_status: m.extension_status,
    order_index: m.order_index,
    approved_by: m.approved_by,
    approved_by_name: m.approver?.full_name ?? null,
    approved_at: iso(m.approved_at),
    feedback_count: m._count?.feedbacks ?? 0,
    created_at: iso(m.created_at),
    updated_at: iso(m.updated_at),
  };
}

export function toMilestoneHistoryDTO(h: MilestoneHistory & { actor?: { full_name: string } | null }) {
  return {
    id: h.id,
    milestone_id: h.milestone_id,
    changed_by: h.changed_by,
    changed_by_name: h.actor?.full_name ?? "Hệ thống",
    field_name: h.field_name,
    old_value: h.old_value,
    new_value: h.new_value,
    note: h.note,
    created_at: iso(h.created_at),
  };
}

/* ==========================================================================
   TÀI LIỆU
   ========================================================================== */

type DocumentWithRelations = Document & {
  uploader?: { id: number; full_name: string } | null;
  thesis?: { id: number; title: string } | null;
  _count?: { chunks?: number; versions?: number; shares?: number };
};

/**
 * Khớp `ResearchDocument` trong `frontend/src/app/(dashboard)/documents/page.tsx`.
 *
 * `tags` trả về MẢNG, không phải chuỗi phân cách phẩy như ERD gốc. Cột trong
 * CSDL là `text[]` (xem ghi chú ở schema), nên trả chuỗi ở đây chỉ để rồi
 * frontend `split(",")` là tự tạo thêm một chỗ hỏng.
 */
export function toDocumentDTO(d: DocumentWithRelations) {
  return {
    id: d.id,
    thesis_id: d.thesis_id,
    thesis_title: d.thesis?.title ?? null,
    filename: d.filename,
    file_path: d.file_path,
    file_size: d.file_size,
    mime_type: d.mime_type,
    page_count: d.page_count,
    summary_ai: d.summary_ai,
    summary_note: d.summary_note,
    status_ai: d.status_ai,
    ai_error: d.ai_error,
    ai_model: d.ai_model,
    tags: d.tags,
    uploaded_by: d.uploaded_by,
    uploaded_by_name: d.uploader?.full_name ?? null,
    chunk_count: d._count?.chunks ?? 0,
    version_count: d._count?.versions ?? 0,
    share_count: d._count?.shares ?? 0,
    created_at: iso(d.created_at),
    updated_at: iso(d.updated_at),
  };
}

export function toDocumentVersionDTO(
  v: DocumentVersion & { uploader?: { full_name: string } | null }
) {
  return {
    id: v.id,
    document_id: v.document_id,
    version_number: v.version_number,
    file_size: v.file_size,
    mime_type: v.mime_type,
    uploaded_by: v.uploaded_by,
    uploaded_by_name: v.uploader?.full_name ?? null,
    change_note: v.change_note,
    is_current: v.is_current,
    created_at: iso(v.created_at),
  };
}

/* ==========================================================================
   TRỢ LÝ AI
   ========================================================================== */

export function toChatSessionDTO(s: AIChatSession & { _count?: { messages?: number } }) {
  return {
    id: s.id,
    thesis_id: s.thesis_id,
    user_id: s.user_id,
    title: s.title,
    message_count: s._count?.messages ?? 0,
    created_at: iso(s.created_at),
    updated_at: iso(s.updated_at),
  };
}

/** Khớp `ChatMessage` trong `frontend/src/app/(dashboard)/ai-chat/page.tsx`. */
export function toChatMessageDTO(m: AIChatMessage) {
  return {
    id: m.id,
    session_id: m.session_id,
    role: m.role,
    content: m.content,
    citations: (m.citations as unknown[] | null) ?? undefined,
    rating: m.rating,
    feedback_note: m.feedback_note,
    model_name: m.model_name,
    tokens_used: m.tokens_used,
    latency_ms: m.latency_ms,
    // Câu trả lời bị bấm "Dừng" giữa chừng chưa có `finished_at` — giao diện
    // dùng cờ này để đánh dấu nội dung chưa hoàn chỉnh.
    incomplete: m.role === "ASSISTANT" && m.finished_at === null,
    created_at: iso(m.created_at),
  };
}

export function toSuggestionDTO(s: AISuggestion) {
  return {
    id: s.id,
    thesis_id: s.thesis_id,
    payload: s.payload,
    status: s.status,
    model_name: s.model_name,
    attempt: s.attempt,
    created_at: iso(s.created_at),
    updated_at: iso(s.updated_at),
  };
}

/* ==========================================================================
   PHẢN HỒI
   ========================================================================== */

type FeedbackWithRelations = Feedback & {
  author?: { id: number; full_name: string; role: string; avatar_url: string | null } | null;
  resolver?: { full_name: string } | null;
  milestone?: { id: number; name: string; thesis_id: number } | null;
  document?: { id: number; filename: string; thesis_id: number } | null;
  replies?: FeedbackWithRelations[];
};

/**
 * Khớp `FeedbackItem` trong `frontend/src/app/(dashboard)/feedbacks/page.tsx`.
 *
 * `target_type` / `target_title` được TÍNH RA từ hai cột khoá ngoại. Bảng không
 * còn cột đa hình `target_id` nữa (xem ghi chú ở schema), nhưng giao diện vẫn
 * cần một nhãn thống nhất để hiển thị và lọc.
 */
export function toFeedbackDTO(f: FeedbackWithRelations): Record<string, unknown> {
  const deleted = f.deleted_at !== null;
  return {
    id: f.id,
    target_type: f.milestone_id ? "MILESTONE" : "DOCUMENT",
    target_id: f.milestone_id ?? f.document_id,
    target_title: f.milestone?.name ?? f.document?.filename ?? "",
    thesis_id: f.milestone?.thesis_id ?? f.document?.thesis_id ?? null,
    user_id: f.user_id,
    user_name: f.author?.full_name ?? "Người dùng đã xóa",
    user_role: f.author?.role ?? "STUDENT",
    user_avatar: f.author?.avatar_url ?? null,
    // Xoá mềm giữ nguyên cây thread (UC 7.5); nội dung được thay bằng chỗ trống
    // ngay tại đây để không nơi nào lỡ trả về văn bản gốc đã xoá.
    content: deleted ? "[Phản hồi này đã bị xóa]" : f.content,
    is_deleted: deleted,
    parent_id: f.parent_id,
    depth: f.depth,
    file_url: deleted ? null : f.file_url,
    file_name: deleted ? null : f.file_name,
    is_resolved: f.is_resolved,
    resolved_by: f.resolved_by,
    resolved_by_name: f.resolver?.full_name ?? null,
    resolved_at: iso(f.resolved_at),
    edited_at: iso(f.edited_at),
    created_at: iso(f.created_at),
    created_timestamp: f.created_at.getTime(),
    replies: f.replies?.map(toFeedbackDTO) ?? [],
  };
}

/* ==========================================================================
   THÔNG BÁO & QUẢN TRỊ
   ========================================================================== */

export function toNotificationDTO(n: Notification) {
  return {
    id: n.id,
    user_id: n.user_id,
    type: n.type,
    title: n.title,
    content: n.content,
    link: n.link,
    is_read: n.is_read,
    read_at: iso(n.read_at),
    created_at: iso(n.created_at),
  };
}

export function toSystemLogDTO(log: SystemLog & { user?: { email: string } | null }) {
  return {
    id: log.id,
    user_id: log.user_id,
    user_email: log.user?.email ?? "system",
    level: log.level,
    action: log.action,
    ip_address: log.ip_address,
    user_agent: log.user_agent,
    details: log.details,
    created_at: iso(log.created_at),
  };
}

/**
 * Khớp `SystemConfig` trong `frontend/src/app/(dashboard)/admin/settings/page.tsx`.
 *
 * Giá trị của cấu hình đánh dấu `is_secret` bị che ngay tại tầng serializer.
 * Che ở giao diện là không đủ: giá trị vẫn đi qua mạng và nằm trong DevTools.
 */
export function toConfigDTO(c: SystemConfig & { updater?: { full_name: string } | null }) {
  return {
    id: c.id,
    config_key: c.config_key,
    config_value: c.is_secret ? "••••••••" : c.config_value,
    value_type: c.value_type,
    category: c.category,
    description: c.description,
    is_secret: c.is_secret,
    updated_by_name: c.updater?.full_name ?? null,
    updated_at: iso(c.updated_at),
  };
}

/* ==========================================================================
   TIỆN ÍCH
   ========================================================================== */

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

/** Chỉ ngày (YYYY-MM-DD) cho deadline — input `type="date"` của HTML cần đúng dạng này. */
function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

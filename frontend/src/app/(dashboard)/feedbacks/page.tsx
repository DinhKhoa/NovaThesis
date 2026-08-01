"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import {
  Paperclip,
  CheckCircle,
  ChatCircleDots,
  PaperPlaneTilt,
  PencilSimple,
  Trash,
  ArrowElbowDownRight,
  Warning,
  X,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/layout";
import {
  Card,
  Button,
  Input,
  Textarea,
  Badge,
  Avatar,
  ConfirmDialog,
  EmptyState,
  Select,
  Skeleton,
} from "@/components/ui";
import { useAuthStore, isLecturer } from "@/lib/auth";
import { isReadOnlyViewer } from "@/lib/permissions";
import { toast } from "@/lib/toast";
import { isApiError } from "@/lib/api";
import { useAsync } from "@/lib/use-async";
import {
  documentsApi,
  feedbacksApi,
  milestonesApi,
  reportsApi,
  thesesApi,
  type FeedbackItem,
  type UserRole,
} from "@/lib/services";
import { formatDateTime, formatFileSize } from "@/lib/format";

/* ==========================================================================
   HẰNG SỐ NGHIỆP VỤ — GIỮ ĐÚNG BẰNG BACKEND
   Ba con số dưới đây quyết định nút nào được hiện. Lệch với backend thì giao
   diện hoặc mời người dùng làm việc bất khả thi, hoặc chặn việc họ được phép
   làm — cả hai đều tệ hơn là chép lại đúng giá trị.
   ========================================================================== */

/** UC 7.4 BR — 15 phút kể từ `created_at` (feedbacks.service.ts: EDIT_WINDOW_MS). */
const EDIT_WINDOW_MS = 15 * 60 * 1000;

/** UC 7.3 BR — `depth` chỉ nhận 0/1/2, nên bình luận ở cấp 3 là lá (MAX_DEPTH). */
const MAX_DEPTH = 2;

/** UC 7.7 BR — 5MB mỗi tệp (MAX_ATTACHMENT_BYTES). */
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/** Đúng tập định dạng `ATTACHMENT_MIME` của backend chấp nhận. */
const ATTACHMENT_ACCEPT = ".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg";

const TARGET_LABEL: Record<FeedbackItem["target_type"], string> = {
  MILESTONE: "mốc tiến độ",
  DOCUMENT: "tài liệu",
};

const ROLE_META: Record<
  UserRole,
  { label: string; variant: "info" | "success" | "neutral" }
> = {
  LECTURER: { label: "Giảng viên", variant: "info" },
  STUDENT: { label: "Sinh viên", variant: "success" },
  ADMIN: { label: "Quản trị viên", variant: "neutral" },
};

export default function FeedbacksPage() {
  const { user } = useAuthStore();
  const searchParams = useSearchParams();
  const thesisParam = searchParams.get("thesis");

  const [pickedThesisId, setThesisId] = React.useState<number | null>(
    thesisParam ? Number(thesisParam) : null
  );
  const [filterType, setFilterType] = React.useState<"ALL" | "MILESTONE" | "DOCUMENT">("ALL");
  const [filterResolved, setFilterResolved] = React.useState<"ALL" | "OPEN" | "RESOLVED">("ALL");
  const [page, setPage] = React.useState(1);

  // Reply state
  const [replyingId, setReplyingId] = React.useState<number | null>(null);
  const [replyText, setReplyText] = React.useState("");
  const [replySending, setReplySending] = React.useState(false);

  // Edit state (15 min rule UC 7.4)
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [editText, setEditText] = React.useState("");
  const [editSaving, setEditSaving] = React.useState(false);

  /* The 15-minute edit window has to actually expire while the page is open.
     Reading Date.now() during render never re-evaluates, so a stale "Sửa"
     button would keep offering an edit the server will reject. */
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // New root comment form
  const [newCommentText, setNewCommentText] = React.useState("");
  const [attachedFile, setAttachedFile] = React.useState<File | null>(null);
  const [posting, setPosting] = React.useState(false);

  const [resolvingId, setResolvingId] = React.useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<FeedbackItem | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  /* ---- Phạm vi đề tài ---------------------------------------------------
     Bình luận không có `thesis_id` của riêng nó; phạm vi đi qua mốc tiến độ
     hoặc tài liệu. Giảng viên hướng dẫn nhiều đề tài nên phải chọn được một
     đề tài, và ô soạn thảo cũng cần biết đề tài nào để nạp danh sách đối
     tượng có thể bình luận lên. */
  const {
    data: theses,
    loading: thesesLoading,
    error: thesesError,
    refetch: refetchTheses,
  } = useAsync(() => thesesApi.list({ per_page: 100 }), []);
  const thesisOptions = theses?.data ?? [];

  /* Suy ra lúc render thay vì đồng bộ bằng useEffect — xem ghi chú cùng loại
     ở milestones/page.tsx. */
  const thesisId = pickedThesisId ?? thesisOptions[0]?.id ?? null;

  /* Đổi bộ lọc mà giữ nguyên số trang sẽ rơi vào một trang không còn tồn tại
     và người dùng thấy danh sách rỗng dù dữ liệu vẫn còn. Chỉnh state ngay
     trong thân render là mẫu React khuyến nghị cho "state phụ thuộc state". */
  const filterKey = `${thesisId}|${filterType}|${filterResolved}`;
  const [appliedFilterKey, setAppliedFilterKey] = React.useState(filterKey);
  if (appliedFilterKey !== filterKey) {
    setAppliedFilterKey(filterKey);
    setPage(1);
  }

  const { data, loading, error, refetch, setData } = useAsync(
    () =>
      feedbacksApi.list({
        page,
        per_page: 20,
        ...(thesisId ? { thesis_id: thesisId } : {}),
        ...(filterType !== "ALL" ? { target_type: filterType } : {}),
        ...(filterResolved !== "ALL" ? { resolved: filterResolved === "RESOLVED" } : {}),
      }),
    [thesisId, filterType, filterResolved, page],
    { enabled: thesisId !== null }
  );

  const feedbacks = data?.data ?? [];

  /* ---- Đối tượng được bình luận (UC 7.1 / 7.2) --------------------------
     Backend bắt buộc bình luận gốc gắn với ĐÚNG MỘT mốc tiến độ hoặc một tài
     liệu. Nạp cả hai danh sách của đề tài đang chọn và gộp thành một ô chọn
     có nhóm — người dùng không cần biết đó là hai bảng khác nhau. */
  const { data: milestones, loading: milestonesLoading } = useAsync(
    () => milestonesApi.list({ thesis_id: thesisId ?? 0, per_page: 100 }),
    [thesisId],
    { enabled: thesisId !== null }
  );
  const { data: documents, loading: documentsLoading } = useAsync(
    () => documentsApi.list({ thesis_id: thesisId ?? 0, per_page: 100 }),
    [thesisId],
    { enabled: thesisId !== null }
  );

  const milestoneOptions = milestones?.data ?? [];
  const documentOptions = documents?.data ?? [];
  const targetsLoading = milestonesLoading || documentsLoading;
  const targetCount = milestoneOptions.length + documentOptions.length;

  /* Khoá `"MILESTONE:12"` gộp loại và mã vào một giá trị `<option>`: một ô
     chọn chỉ trả về một chuỗi, mà backend cần biết đây là mốc hay tài liệu. */
  const [targetKey, setTargetKey] = React.useState("");

  /* Đổi đề tài là danh sách đối tượng đổi theo, nên lựa chọn cũ có thể không
     còn tồn tại. Kiểm tra ngay lúc render thay vì dọn bằng effect: giữa lúc
     đề tài đã đổi và lúc effect chạy, ô chọn sẽ trỏ vào một mốc thuộc đề tài
     khác — và nút Gửi vẫn sáng. */
  const targetValue =
    milestoneOptions.some((m) => `MILESTONE:${m.id}` === targetKey) ||
    documentOptions.some((d) => `DOCUMENT:${d.id}` === targetKey)
      ? targetKey
      : "";

  /* ---- Quyền trên từng bình luận ----------------------------------------
     Tính tại chỗ theo đúng luật của backend. Bày nút rồi để server trả 403 là
     bắt người dùng học luật nghiệp vụ bằng cách va vào nó. */
  /* Quản trị viên đọc được mọi trao đổi nhưng không tham gia — xem
     `lib/permissions.ts`. Trước đây `isAdmin(user)` ở đây CẤP THÊM quyền xoá và
     đóng thread; giờ đảo lại. */
  const readOnly = isReadOnlyViewer(user);

  const canEdit = (f: FeedbackItem) =>
    !readOnly &&
    !f.is_deleted &&
    f.user_id === user?.id &&
    now - f.created_timestamp < EDIT_WINDOW_MS;

  const canDelete = (f: FeedbackItem) =>
    !readOnly && !f.is_deleted && f.user_id === user?.id;

  // UC 7.6 BR — chỉ giảng viên ĐÃ TẠO bình luận gốc mới đóng được thread.
  // Giảng viên hướng dẫn cũng không đóng thread do người khác mở.
  const canResolve = (f: FeedbackItem) =>
    !readOnly &&
    !f.is_deleted &&
    f.parent_id === null &&
    isLecturer(user) &&
    f.user_id === user?.id;

  /* ---- Thao tác ghi ----------------------------------------------------- */

  const reloadFromFirstPage = async () => {
    // Bình luận mới nhất nằm ở đầu danh sách (server sắp giảm dần theo thời
    // gian tạo). Đổi `page` đã tự kích hoạt tải lại nên không gọi refetch nữa.
    if (page !== 1) setPage(1);
    else await refetch();
  };

  const pickAttachment = (file: File | null) => {
    if (!file) {
      setAttachedFile(null);
      return;
    }
    // Chặn ngay tại chỗ: để người dùng chờ tải xong 20MB rồi mới báo vượt hạn
    // mức là lãng phí thời gian của họ và băng thông của máy chủ.
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error(
        `Dung lượng tệp đính kèm vượt quá 5MB (tệp của bạn ${formatFileSize(file.size)}).`
      );
      return;
    }
    setAttachedFile(file);
  };

  // Post Root Comment (UC 7.1, 7.2, 7.7)
  const handlePostRootComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = newCommentText.trim();
    if (!content || !targetValue) return;

    const [kind, rawId] = targetValue.split(":");
    const targetId = Number(rawId);

    setPosting(true);
    try {
      await feedbacksApi.create({
        ...(kind === "MILESTONE" ? { milestone_id: targetId } : { document_id: targetId }),
        content,
        file: attachedFile,
      });
      toast.success("Đã đăng phản hồi mới!");
      setNewCommentText("");
      setAttachedFile(null);
      await reloadFromFirstPage();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Không gửi được phản hồi.");
    } finally {
      setPosting(false);
    }
  };

  // Post Reply (UC 7.3) — câu trả lời KẾ THỪA đối tượng của bình luận cha,
  // nên chỉ gửi `parent_id`; khai thêm đối tượng là mở đường cho thread lai.
  const handlePostReply = async (parentId: number) => {
    const content = replyText.trim();
    if (!content) return;

    setReplySending(true);
    try {
      await feedbacksApi.create({ content, parent_id: parentId });
      toast.success("Đã gửi phản hồi thành công!");
      setReplyingId(null);
      setReplyText("");
      await refetch();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Không gửi được câu trả lời.");
    } finally {
      setReplySending(false);
    }
  };

  // Edit Comment (15 min rule UC 7.4)
  const handleSaveEdit = async (id: number) => {
    const content = editText.trim();
    if (!content) return;

    setEditSaving(true);
    try {
      await feedbacksApi.update(id, content);
      toast.success("Đã cập nhật nội dung phản hồi.");
      setEditingId(null);
      await refetch();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Không cập nhật được phản hồi.");
    } finally {
      setEditSaving(false);
    }
  };

  // Delete Comment (UC 7.5) — server tự chọn xoá cứng hay xoá mềm tuỳ bình
  // luận đã có trả lời hay chưa, nên phải tải lại chứ không đoán kết quả.
  const handleDeleteComment = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await feedbacksApi.remove(deleteTarget.id);
      toast.success("Đã xóa phản hồi.");
      setDeleteTarget(null);
      await refetch();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Xóa thất bại.");
    } finally {
      setDeleting(false);
    }
  };

  // Resolve Comment (UC 7.6)
  const handleToggleResolve = async (f: FeedbackItem) => {
    setResolvingId(f.id);
    try {
      const updated = await feedbacksApi.resolve(f.id, !f.is_resolved);
      setData((prev) =>
        prev
          ? { ...prev, data: prev.data.map((x) => (x.id === updated.id ? updated : x)) }
          : prev
      );
      toast.success(
        updated.is_resolved
          ? "Đã đánh dấu phản hồi là đã giải quyết."
          : "Đã mở lại luồng phản hồi."
      );
      // Đang lọc theo trạng thái thì bình luận vừa đổi không còn khớp bộ lọc —
      // giữ nó lại sẽ mâu thuẫn với chính điều kiện người dùng đang chọn.
      if (filterResolved !== "ALL") await refetch();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Không đổi được trạng thái.");
    } finally {
      setResolvingId(null);
    }
  };

  /* `/files/*` đòi Bearer token, mà thẻ `<a>` không gửi được header nào — link
     trực tiếp sẽ nhận 403. Tải qua fetch rồi dựng blob; `reportsApi.download`
     đã làm đúng việc đó nên không viết lại lần nữa. */
  const handleDownload = async (f: FeedbackItem) => {
    try {
      await reportsApi.download(`/files/feedback/${f.id}`, f.file_name ?? "dinh-kem");
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Không tải được tệp đính kèm.");
    }
  };

  /* ---- Mảnh giao diện dùng lại ------------------------------------------
     Cố tình là HÀM trả về JSX chứ không phải component: một component khai báo
     bên trong render sẽ là kiểu mới sau mỗi lần render, khiến React tháo và
     dựng lại cả nhánh — ô nhập trả lời sẽ mất con trỏ sau từng ký tự. */

  const renderEditor = (id: number, rows: number) => (
    <div className="my-2">
      <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={rows} />
      <div className="flex justify-end gap-2 mt-2">
        <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
          Hủy
        </Button>
        <Button
          variant="primary"
          size="sm"
          loading={editSaving}
          disabled={!editText.trim()}
          onClick={() => void handleSaveEdit(id)}
        >
          Lưu
        </Button>
      </div>
    </div>
  );

  const renderAttachment = (f: FeedbackItem) =>
    f.file_name ? (
      <button
        type="button"
        onClick={() => void handleDownload(f)}
        className="flex items-center gap-2 text-[12px] text-accent bg-[var(--accent-subtle)] p-2 rounded-lg w-fit my-2"
      >
        <Paperclip size={14} />
        <span>{f.file_name}</span>
      </button>
    ) : null;

  const renderReplyBox = (parentId: number, className: string) => (
    <div className={className}>
      <Input
        placeholder="Nhập câu trả lời..."
        value={replyText}
        onChange={(e) => setReplyText(e.target.value)}
        className="flex-1"
        autoFocus
      />
      <Button
        variant="primary"
        size="sm"
        loading={replySending}
        disabled={!replyText.trim()}
        onClick={() => void handlePostReply(parentId)}
      >
        Gửi Reply
      </Button>
    </div>
  );

  const startReply = (id: number) => {
    setReplyingId(replyingId === id ? null : id);
    setReplyText("");
  };

  const startEdit = (f: FeedbackItem) => {
    setEditingId(f.id);
    setEditText(f.content);
  };

  /* Trả lời lồng tối đa hai cấp dưới bình luận gốc; đệ quy ở đây là cách duy
     nhất hiển thị đủ cây mà backend trả về. */
  const renderReply = (r: FeedbackItem): React.ReactNode => (
    <div
      key={r.id}
      className={`bg-[var(--bg-secondary)] p-3 rounded-xl border border-[var(--border-secondary)] ${
        r.is_deleted ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold text-[13px]">{r.user_name}</span>
        <span className="text-[11px] text-tertiary tnum">
          {formatDateTime(r.created_at)}
          {r.edited_at && " • đã chỉnh sửa"}
        </span>
      </div>

      {editingId === r.id ? (
        renderEditor(r.id, 2)
      ) : (
        <p className={`text-[13px] text-secondary ${r.is_deleted ? "italic" : ""}`}>{r.content}</p>
      )}

      {renderAttachment(r)}

      {!r.is_deleted && (
        <div className="flex items-center gap-4 text-[12px] text-tertiary mt-2">
          {/* Thread tối đa 3 cấp: ở cấp cuối thì ẩn hẳn nút thay vì để người
              dùng gõ xong mới nhận lỗi từ server. */}
          {r.depth < MAX_DEPTH && !readOnly && (
            <button
              className="hover:text-accent flex items-center gap-1 font-medium"
              onClick={() => startReply(r.id)}
            >
              <ArrowElbowDownRight size={14} /> Trả lời
            </button>
          )}

          {canEdit(r) && (
            <button
              className="hover:text-primary flex items-center gap-1"
              onClick={() => startEdit(r)}
            >
              <PencilSimple size={14} /> Sửa (15ph)
            </button>
          )}

          {canDelete(r) && (
            <button
              className="hover:text-danger flex items-center gap-1"
              onClick={() => setDeleteTarget(r)}
            >
              <Trash size={14} /> Xóa
            </button>
          )}
        </div>
      )}

      {r.replies.length > 0 && (
        <div className="ml-3 mt-3 pl-3 border-l-2 border-[var(--border-primary)] flex flex-col gap-3">
          {r.replies.map((child) => renderReply(child))}
        </div>
      )}

      {replyingId === r.id && renderReplyBox(r.id, "mt-3 flex gap-2")}
    </div>
  );

  const hasFilter = filterType !== "ALL" || filterResolved !== "ALL";
  const listError = thesesError ?? error;

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        title="Phản hồi"
        description="Nhận xét của giảng viên hướng dẫn theo từng mốc tiến độ và tài liệu."
        actions={
          /* Chỉ hiện khi thật sự có gì để chọn — một ô chọn với duy nhất một
             lựa chọn chỉ là tiếng ồn. */
          thesisOptions.length > 1 ? (
            <Select
              value={thesisId ?? ""}
              onChange={(e) => setThesisId(Number(e.target.value))}
              className="w-auto max-w-[16rem]"
              aria-label="Chọn đề tài"
            >
              {thesisOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </Select>
          ) : undefined
        }
      />

      {/* Post New Comment Box (UC 7.1, 7.2, 7.7).
          Ẩn với người xem chỉ đọc: bày ô soạn thảo rồi để server từ chối lúc
          gửi là mời người ta gõ xong một đoạn nhận xét để rồi mất trắng. */}
      {thesisId !== null && !readOnly && (
        <Card className="p-5 mb-6">
          <form onSubmit={(e) => void handlePostRootComment(e)}>
            <Textarea
              placeholder="Viết nhận xét hoặc phản hồi cho Giảng viên / Sinh viên..."
              rows={3}
              value={newCommentText}
              onChange={(e) => setNewCommentText(e.target.value)}
            />

            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-2">
                {/* Bình luận gốc BẮT BUỘC gắn với đúng một mốc tiến độ hoặc một
                    tài liệu (CHECK `feedbacks_exactly_one_target`). Không có ô
                    này thì mọi lần gửi đều bị backend từ chối. */}
                <Select
                  className="text-[12px] py-1.5 w-56"
                  value={targetValue}
                  onChange={(e) => setTargetKey(e.target.value)}
                  disabled={targetsLoading || targetCount === 0}
                  aria-label="Chọn đối tượng được phản hồi"
                >
                  <option value="">
                    {targetsLoading
                      ? "Đang tải đối tượng…"
                      : targetCount === 0
                        ? "Đề tài chưa có mốc hoặc tài liệu"
                        : "Phản hồi về…"}
                  </option>

                  {milestoneOptions.length > 0 && (
                    <optgroup label="Mốc tiến độ">
                      {milestoneOptions.map((m) => (
                        <option key={`m-${m.id}`} value={`MILESTONE:${m.id}`}>
                          {m.name}
                        </option>
                      ))}
                    </optgroup>
                  )}

                  {documentOptions.length > 0 && (
                    <optgroup label="Tài liệu">
                      {documentOptions.map((d) => (
                        <option key={`d-${d.id}`} value={`DOCUMENT:${d.id}`}>
                          {d.filename}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </Select>

                <label className="btn-ghost text-tertiary hover:text-accent p-2 rounded-lg cursor-pointer inline-flex items-center gap-1.5 text-[13px]">
                  <Paperclip size={18} />
                  <span>{attachedFile?.name || "Đính kèm file"}</span>
                  <input
                    type="file"
                    className="hidden"
                    accept={ATTACHMENT_ACCEPT}
                    onChange={(e) => {
                      pickAttachment(e.target.files?.[0] ?? null);
                      // Cho phép chọn lại đúng tệp vừa bị từ chối sau khi sửa.
                      e.target.value = "";
                    }}
                  />
                </label>

                {attachedFile && (
                  <button
                    type="button"
                    className="btn-ghost text-tertiary hover:text-danger p-1 rounded-lg"
                    aria-label="Gỡ tệp đính kèm"
                    onClick={() => setAttachedFile(null)}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <Button
                variant="primary"
                type="submit"
                icon={<PaperPlaneTilt size={15} />}
                loading={posting}
                disabled={!newCommentText.trim() || !targetValue}
              >
                Gửi nhận xét
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Filter Bar */}
      <div className="flex items-center justify-between mb-4 text-[13px]">
        <span className="text-tertiary">
          Lịch sử phản hồi{data ? ` (${data.total})` : ""}
        </span>

        <div className="flex items-center gap-3">
          <select
            className="input-base text-[12px] py-1.5 w-36"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as typeof filterType)}
            aria-label="Lọc theo loại đối tượng"
          >
            <option value="ALL">Tất cả loại</option>
            <option value="MILESTONE">Milestone</option>
            <option value="DOCUMENT">Tài liệu</option>
          </select>

          <select
            className="input-base text-[12px] py-1.5 w-36"
            value={filterResolved}
            onChange={(e) => setFilterResolved(e.target.value as typeof filterResolved)}
            aria-label="Lọc theo trạng thái giải quyết"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="OPEN">Chưa Resolve</option>
            <option value="RESOLVED">Đã Resolve</option>
          </select>
        </div>
      </div>

      {/* Feedbacks Thread Tree */}
      {listError ? (
        <EmptyState
          icon={<Warning size={16} />}
          title="Không tải được phản hồi"
          description={listError}
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void (thesesError ? refetchTheses() : refetch())}
            >
              Thử lại
            </Button>
          }
        />
      ) : thesesLoading || (loading && !data) ? (
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36 rounded-[10px]" height="9rem" />
          ))}
        </div>
      ) : thesisId === null ? (
        <EmptyState
          icon={<ChatCircleDots size={16} />}
          title="Chưa có đề tài nào"
          description="Phản hồi luôn gắn với mốc tiến độ hoặc tài liệu của một đề tài. Hãy tạo hoặc tham gia một đề tài trước."
        />
      ) : feedbacks.length === 0 ? (
        <EmptyState
          icon={<ChatCircleDots size={16} />}
          title={hasFilter ? "Không có phản hồi nào khớp bộ lọc" : "Chưa có phản hồi nào cho đề tài này"}
          description={
            hasFilter
              ? "Bỏ bớt điều kiện lọc để xem lại toàn bộ lịch sử trao đổi."
              : "Chọn một mốc tiến độ hoặc tài liệu ở ô phía trên rồi gửi nhận xét đầu tiên."
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {feedbacks.map((f) => (
            <Card
              key={f.id}
              className={`p-5 ${f.is_deleted ? "opacity-60" : f.is_resolved ? "opacity-75" : ""}`}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-3">
                  <Avatar name={f.user_name} src={f.user_avatar} size="sm" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[14px]">{f.user_name}</span>
                      <Badge variant={ROLE_META[f.user_role].variant}>
                        {ROLE_META[f.user_role].label}
                      </Badge>
                    </div>
                    <span className="text-[11px] text-tertiary">
                      trên {TARGET_LABEL[f.target_type]}:{" "}
                      <strong className="text-secondary">{f.target_title}</strong> •{" "}
                      {formatDateTime(f.created_at)}
                      {f.edited_at && " • đã chỉnh sửa"}
                    </span>
                  </div>
                </div>

                {/* GV Resolve Toggle */}
                {canResolve(f) ? (
                  <Button
                    variant={f.is_resolved ? "secondary" : "ghost"}
                    size="sm"
                    loading={resolvingId === f.id}
                    icon={
                      <CheckCircle size={16} className={f.is_resolved ? "text-success" : ""} />
                    }
                    onClick={() => void handleToggleResolve(f)}
                  >
                    {f.is_resolved ? "Resolved" : "Resolve"}
                  </Button>
                ) : (
                  /* Người không có quyền đóng thread vẫn cần biết nó đã đóng —
                     nếu không, "Đã giải quyết" chỉ còn là một thẻ mờ đi. */
                  f.is_resolved && (
                    <Badge variant="success">
                      {f.resolved_by_name ? `Đã giải quyết · ${f.resolved_by_name}` : "Đã giải quyết"}
                    </Badge>
                  )
                )}
              </div>

              {/* Content Body */}
              {editingId === f.id ? (
                renderEditor(f.id, 3)
              ) : (
                <p
                  className={`text-[14px] text-secondary leading-relaxed my-2 ${
                    f.is_deleted ? "italic" : ""
                  }`}
                >
                  {f.content}
                </p>
              )}

              {/* File Attachment */}
              {renderAttachment(f)}

              {/* Actions Bar */}
              {!f.is_deleted && (
                <div className="flex items-center gap-4 text-[12px] text-tertiary pt-2 border-t border-[var(--border-secondary)] mt-3">
                  {!readOnly && (
                    <button
                      className="hover:text-accent flex items-center gap-1 font-medium"
                      onClick={() => startReply(f.id)}
                    >
                      <ArrowElbowDownRight size={14} /> Trả lời
                    </button>
                  )}

                  {/* Edit window: 15 minutes after posting */}
                  {canEdit(f) && (
                    <button
                      className="hover:text-primary flex items-center gap-1"
                      onClick={() => startEdit(f)}
                    >
                      <PencilSimple size={14} /> Sửa (15ph)
                    </button>
                  )}

                  {canDelete(f) && (
                    <button
                      className="hover:text-danger flex items-center gap-1"
                      onClick={() => setDeleteTarget(f)}
                    >
                      <Trash size={14} /> Xóa
                    </button>
                  )}
                </div>
              )}

              {/* Sub-threads (Level 2 & 3 replies) */}
              {f.replies.length > 0 && (
                <div className="ml-6 mt-4 pl-4 border-l-2 border-[var(--border-primary)] flex flex-col gap-3">
                  {f.replies.map((r) => renderReply(r))}
                </div>
              )}

              {/* Inline Reply Input */}
              {replyingId === f.id && renderReplyBox(f.id, "ml-6 mt-3 flex gap-2")}
            </Card>
          ))}
        </div>
      )}

      {/* Phân trang phía server: cây thread nặng hơn một dòng bảng nhiều lần,
          nên danh sách được cắt trang ngay từ máy chủ. */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-[12.5px]">
          <span className="text-tertiary tnum">
            Trang {data.page}/{data.totalPages} · {data.total} phản hồi
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Trước
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= data.totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Sau
            </Button>
          </div>
        </div>
      )}

      {/* UC 7.5 bước 2 — xoá là thao tác không hoàn tác được, và nút Xóa nằm
          ngay cạnh nút Trả lời. */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Xóa phản hồi?"
        confirmLabel="Xóa"
        loading={deleting}
        message={
          deleteTarget && deleteTarget.replies.length > 0
            ? "Phản hồi này đã có câu trả lời nên nội dung sẽ được thay bằng “[Phản hồi này đã bị xóa]” để giữ nguyên mạch trao đổi."
            : "Phản hồi sẽ bị xóa vĩnh viễn khỏi hệ thống."
        }
        onConfirm={() => void handleDeleteComment()}
      />
    </div>
  );
}

"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowClockwise,
  ArrowLeft,
  ChatCircleDots,
  CheckCircle,
  Clock,
  Files,
  GraduationCap,
  ListBullets,
  PaperPlaneTilt,
  PencilSimple,
  Robot,
  Trash,
  UserPlus,
  UsersThree,
  Warning,
  XCircle,
} from "@phosphor-icons/react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Input,
  Modal,
  Skeleton,
  Textarea,
} from "@/components/ui";
import { useAuthStore, isLecturer, isStudent } from "@/lib/auth";
import { isReadOnlyViewer } from "@/lib/permissions";
import { toast } from "@/lib/toast";
import { isApiError } from "@/lib/api";
import { useAsync } from "@/lib/use-async";
import { thesesApi, type Thesis, type ThesisMember } from "@/lib/services";
import { formatDateTime, formatDate, formatPeriod } from "@/lib/format";
import { statusMap } from "../page";

export default function ThesisDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const id = Number(params.id);

  const [activeTab, setActiveTab] = React.useState<"info" | "history">("info");
  const [processing, setProcessing] = React.useState(false);

  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectionReason, setRejectionReason] = React.useState("");
  const [revisionOpen, setRevisionOpen] = React.useState(false);
  const [revisionNote, setRevisionNote] = React.useState("");

  const [editOpen, setEditOpen] = React.useState(false);
  const [editTitle, setEditTitle] = React.useState("");
  const [editDesc, setEditDesc] = React.useState("");
  const [editField, setEditField] = React.useState("");
  const [editStart, setEditStart] = React.useState("");
  const [editEnd, setEditEnd] = React.useState("");

  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const {
    data: thesis,
    loading,
    error,
    refetch,
    setData,
  } = useAsync(() => thesesApi.get(id), [id], { enabled: Number.isFinite(id) });

  const { data: history, refetch: refetchHistory } = useAsync(
    () => thesesApi.history(id),
    [id],
    { enabled: Number.isFinite(id) && activeTab === "history" }
  );

  /* Mọi thao tác đổi trạng thái đều đi qua đây: server trả về bản ghi mới, ta
     ghi đè state bằng chính nó thay vì tự đoán kết quả. Cập nhật lạc quan ở
     đây sẽ nói dối người dùng mỗi khi FSM phía server từ chối. */
  const run = React.useCallback(
    async (action: () => Promise<Thesis>, successMessage: string) => {
      setProcessing(true);
      try {
        const updated = await action();
        setData(updated);
        void refetchHistory();
        toast.success(successMessage);
        return true;
      } catch (err) {
        toast.error(isApiError(err) ? err.message : "Thao tác thất bại");
        return false;
      } finally {
        setProcessing(false);
      }
    },
    [setData, refetchHistory]
  );

  if (loading && !thesis) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-40 rounded-md" />
        <Skeleton className="h-44 rounded-[10px]" />
        <Skeleton className="h-64 rounded-[10px]" />
      </div>
    );
  }

  if (error || !thesis) {
    return (
      <EmptyState
        icon={<Warning size={16} />}
        title="Không mở được đề tài"
        description={error ?? "Đề tài không tồn tại hoặc bạn không có quyền xem."}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              Thử lại
            </Button>
            <Button variant="ghost" size="sm" onClick={() => router.push("/theses")}>
              Về danh sách
            </Button>
          </div>
        }
      />
    );
  }

  const statusInfo = statusMap[thesis.status];
  const supervisor = isLecturer(user) && thesis.lecturer_id !== null;
  const owner = isStudent(user);

  /* Nút chỉ hiện khi thao tác thực sự khả thi: bày một nút "Sửa" rồi trả về
     403 khi bấm là để người dùng tự phát hiện luật nghiệp vụ bằng cách va vào
     nó. Điều kiện dưới đây phản chiếu `can()` ở `backend/src/domain/access.ts`,
     TRỪ nhánh Admin: quản trị viên xem ở chế độ chỉ đọc (xem `lib/permissions.ts`
     để hiểu vì sao giao diện cố ý chặt hơn API). */
  const readOnly = isReadOnlyViewer(user);

  const canEdit =
    !readOnly &&
    ((owner && (thesis.status === "DRAFT" || thesis.status === "REVISION_REQUIRED")) ||
      (supervisor && thesis.status !== "COMPLETED"));
  const canDelete = !readOnly && owner && thesis.status === "DRAFT";
  const canSubmit =
    !readOnly &&
    owner &&
    (thesis.status === "DRAFT" || thesis.status === "REVISION_REQUIRED");
  const canReview = !readOnly && supervisor && thesis.status === "PENDING";
  const canComplete = !readOnly && supervisor && thesis.status === "ONGOING";

  /* Sửa danh sách thành viên KHÔNG dùng chung điều kiện với `canEdit`.
     `canEdit` khoá sinh viên lại ngay khi đề tài rời khỏi DRAFT — đúng cho nội
     dung đề cương, nhưng sai cho danh sách nhóm: người ta hay rủ thêm bạn sau
     khi đề tài đã được duyệt và bắt đầu chạy. Điều kiện ở đây phản chiếu
     `assertCanManageMembers` của backend: chủ nhiệm hoặc GVHD, và đề tài chưa
     chốt. */
  const canManageMembers =
    !readOnly &&
    thesis.status !== "COMPLETED" &&
    thesis.status !== "REJECTED" &&
    (owner || supervisor);

  return (
    <div>
      <div className="mb-4">
        <button
          onClick={() => router.push("/theses")}
          className="btn-ghost text-tertiary hover:text-primary text-[13px] inline-flex items-center gap-1.5 p-0"
        >
          <ArrowLeft size={16} />
          Quay lại danh sách
        </button>
      </div>

      <Card className="p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant={statusInfo.variant} dot={thesis.status === "PENDING"}>
              {statusInfo.label}
            </Badge>
            <span className="text-[12px] text-tertiary">Lĩnh vực: {thesis.field}</span>
            {(thesis.start_date || thesis.end_date) && (
              <span className="text-[12px] text-tertiary">
                Kỳ nghiên cứu: {formatPeriod(thesis.start_date, thesis.end_date)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {canSubmit && (
              <Button
                variant="primary"
                size="sm"
                icon={<PaperPlaneTilt size={16} />}
                loading={processing}
                onClick={() => void run(() => thesesApi.submit(thesis.id), "Đã gửi đề tài cho giảng viên duyệt.")}
              >
                Gửi duyệt
              </Button>
            )}

            {canReview && (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  icon={<CheckCircle size={16} />}
                  loading={processing}
                  onClick={() => void run(() => thesesApi.approve(thesis.id), "Đã phê duyệt đề tài.")}
                >
                  Phê duyệt
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<ArrowClockwise size={16} />}
                  onClick={() => setRevisionOpen(true)}
                >
                  Yêu cầu sửa
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  icon={<XCircle size={16} />}
                  onClick={() => setRejectOpen(true)}
                >
                  Từ chối
                </Button>
              </>
            )}

            {canComplete && (
              <Button
                variant="primary"
                size="sm"
                icon={<CheckCircle size={16} />}
                loading={processing}
                onClick={async () => {
                  const ok = await run(
                    () => thesesApi.complete(thesis.id),
                    "Đã đánh dấu đề tài hoàn thành."
                  );
                  // Server chặn khi còn mốc dang dở và trả 409 kèm số lượng.
                  // Hỏi lại rồi mới ép, thay vì âm thầm bỏ qua kiểm tra.
                  if (!ok && confirm("Vẫn còn mốc chưa hoàn thành. Bạn có chắc muốn kết thúc đề tài?")) {
                    void run(
                      () => thesesApi.complete(thesis.id, true),
                      "Đã đánh dấu đề tài hoàn thành."
                    );
                  }
                }}
              >
                Đánh dấu hoàn thành
              </Button>
            )}

            {canEdit && (
              <Button
                variant="secondary"
                size="sm"
                icon={<PencilSimple size={16} />}
                onClick={() => {
                  setEditTitle(thesis.title);
                  setEditDesc(thesis.description);
                  setEditField(thesis.field);
                  setEditStart(thesis.start_date ?? "");
                  setEditEnd(thesis.end_date ?? "");
                  setEditOpen(true);
                }}
              >
                Sửa
              </Button>
            )}

            {canDelete && (
              <Button
                variant="danger"
                size="sm"
                icon={<Trash size={16} />}
                onClick={() => setDeleteOpen(true)}
              >
                Xóa
              </Button>
            )}
          </div>
        </div>

        <h1 className="text-xl font-bold tracking-tight mb-3 leading-snug">{thesis.title}</h1>

        <div className="flex flex-wrap items-center gap-6 text-[13px] text-secondary border-t border-[var(--border-secondary)] pt-4 mt-4">
          <span className="flex items-center gap-2">
            <GraduationCap size={18} className="text-accent" />
            GVHD:{" "}
            <strong className="text-primary font-medium">{thesis.lecturer_name}</strong>
          </span>

          <span className="flex items-center gap-2">
            <UsersThree size={18} className="text-accent" />
            Sinh viên:{" "}
            <strong className="text-primary font-medium">
              {thesis.student_names.length ? thesis.student_names.join(", ") : "Chưa gán sinh viên"}
            </strong>
          </span>

          <span className="flex items-center gap-2 text-tertiary tnum">
            <Clock size={16} />
            Cập nhật: {formatDateTime(thesis.updated_at)}
          </span>
        </div>
      </Card>

      <div className="flex items-center gap-2 border-b border-[var(--border-primary)] mb-6">
        {(
          [
            ["info", "Thông tin chi tiết"],
            ["history", "Lịch sử hoạt động"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={`px-4 py-2.5 text-[14px] font-medium border-b-2 transition-colors ${
              activeTab === key
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-tertiary hover:text-primary"
            }`}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "info" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 p-6">
            <h2 className="text-base font-semibold mb-3">Mô tả / Đề cương nghiên cứu</h2>
            <p className="text-[14px] leading-relaxed text-secondary whitespace-pre-line mb-6">
              {thesis.description || "Chưa có mô tả."}
            </p>

            {/* Hai loại phản hồi khác nhau nên hiện khác nhau: "cần sửa rồi gửi
                lại" (UC 3.10) là việc còn làm tiếp được, "từ chối" (UC 3.11) là
                trạng thái cuối. */}
            {thesis.status === "REVISION_REQUIRED" && thesis.revision_note && (
              <div
                className="p-4 rounded-xl mb-4"
                style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)" }}
              >
                <h3 className="text-[14px] font-semibold text-warning flex items-center gap-2 mb-1">
                  <ArrowClockwise size={18} />
                  Giảng viên yêu cầu chỉnh sửa
                </h3>
                <p className="text-[13px] text-secondary">{thesis.revision_note}</p>
              </div>
            )}

            {thesis.rejection_reason && (
              <div
                className="p-4 rounded-xl mb-4"
                style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}
              >
                <h3 className="text-[14px] font-semibold text-danger flex items-center gap-2 mb-1">
                  <XCircle size={18} />
                  Lý do từ chối
                </h3>
                <p className="text-[13px] text-secondary">{thesis.rejection_reason}</p>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-[var(--border-secondary)]">
              {[
                ["Mốc tiến độ", thesis.milestone_count],
                ["Tài liệu", thesis.document_count],
                ["Ngày tạo", formatDate(thesis.created_at)],
                ["Hoàn thành", thesis.completed_at ? formatDate(thesis.completed_at) : "—"],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <p className="eyebrow mb-0.5">{label}</p>
                  <p className="text-[13px] font-medium tnum">{value}</p>
                </div>
              ))}
            </div>
          </Card>

          <div className="flex flex-col gap-4">
            <MemberPanel
              thesis={thesis}
              canManage={canManageMembers}
              onChanged={setData}
              onRefetch={() => void refetch()}
            />

            <Card className="p-5">
              <h3 className="text-[14px] font-semibold mb-3">Không gian làm việc</h3>
              <div className="flex flex-col gap-2">
                <Button
                  variant="secondary"
                  className="justify-start"
                  icon={<ListBullets size={15} />}
                  onClick={() => router.push(`/milestones?thesis=${thesis.id}`)}
                >
                  Quản lý mốc tiến độ
                </Button>
                <Button
                  variant="secondary"
                  className="justify-start"
                  icon={<Files size={15} />}
                  onClick={() => router.push(`/documents?thesis=${thesis.id}`)}
                >
                  Kho tài liệu &amp; RAG
                </Button>
                <Button
                  variant="secondary"
                  className="justify-start"
                  icon={<Robot size={15} />}
                  onClick={() => router.push(`/ai-chat?thesis=${thesis.id}`)}
                >
                  Hỏi đáp trợ lý AI
                </Button>
                <Button
                  variant="secondary"
                  className="justify-start"
                  icon={<ChatCircleDots size={15} />}
                  onClick={() => router.push(`/feedbacks?thesis=${thesis.id}`)}
                >
                  Phản hồi giảng viên
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}

      {activeTab === "history" && (
        <Card className="p-6 max-w-3xl">
          <h2 className="text-base font-semibold mb-4">Lịch sử thay đổi đề tài</h2>
          {!history ? (
            <div className="flex flex-col gap-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 rounded-md" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <p className="text-[13px] text-tertiary">Chưa có hoạt động nào được ghi nhận.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="flex gap-4 items-start border-l-2 border-[var(--accent)] pl-4 py-1"
                >
                  <div>
                    <p className="text-[14px] font-medium text-primary">{item.event}</p>
                    <span className="text-[12px] text-tertiary tnum">
                      {item.actor_name} • {formatDateTime(item.created_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ---------------- Yêu cầu chỉnh sửa (UC 3.10) ---------------- */}
      <Modal
        open={revisionOpen}
        onClose={() => setRevisionOpen(false)}
        title="Yêu cầu sinh viên chỉnh sửa đề tài"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRevisionOpen(false)}>
              Hủy
            </Button>
            <Button
              variant="primary"
              loading={processing}
              onClick={async () => {
                if (!revisionNote.trim()) return toast.error("Vui lòng nhập nội dung cần sửa.");
                const ok = await run(
                  () => thesesApi.requestRevision(thesis.id, revisionNote.trim()),
                  "Đã gửi yêu cầu chỉnh sửa cho sinh viên."
                );
                if (ok) {
                  setRevisionOpen(false);
                  setRevisionNote("");
                }
              }}
            >
              Gửi yêu cầu
            </Button>
          </>
        }
      >
        <Textarea
          label="Nội dung cần chỉnh sửa *"
          rows={4}
          placeholder="Nêu rõ những điểm sinh viên cần bổ sung hoặc thu hẹp phạm vi…"
          value={revisionNote}
          onChange={(e) => setRevisionNote(e.target.value)}
          helperText="Đề tài sẽ quay về cho sinh viên sửa và gửi lại."
        />
      </Modal>

      {/* ---------------- Từ chối (UC 3.11) ---------------- */}
      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Từ chối đề tài"
        description="Từ chối là trạng thái cuối — đề tài này sẽ không thể kích hoạt lại."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>
              Hủy
            </Button>
            <Button
              variant="danger"
              loading={processing}
              onClick={async () => {
                if (!rejectionReason.trim()) return toast.error("Vui lòng nhập lý do từ chối.");
                const ok = await run(
                  () => thesesApi.reject(thesis.id, rejectionReason.trim()),
                  "Đã từ chối đề tài."
                );
                if (ok) {
                  setRejectOpen(false);
                  setRejectionReason("");
                }
              }}
            >
              Xác nhận từ chối
            </Button>
          </>
        }
      >
        <Textarea
          label="Lý do từ chối *"
          rows={4}
          placeholder="Nêu lý do cụ thể để sinh viên hiểu vì sao đề tài không được chấp nhận…"
          value={rejectionReason}
          onChange={(e) => setRejectionReason(e.target.value)}
        />
      </Modal>

      {/* ---------------- Sửa ---------------- */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Chỉnh sửa thông tin đề tài"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Hủy
            </Button>
            <Button
              variant="primary"
              loading={processing}
              onClick={async () => {
                const ok = await run(
                  () =>
                    thesesApi.update(thesis.id, {
                      title: editTitle,
                      description: editDesc,
                      field: editField,
                      ...(editStart ? { start_date: editStart } : {}),
                      ...(editEnd ? { end_date: editEnd } : {}),
                    }),
                  "Đã cập nhật đề tài."
                );
                if (ok) setEditOpen(false);
              }}
            >
              Cập nhật
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input label="Tiêu đề" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
          <Input
            label="Lĩnh vực"
            value={editField}
            onChange={(e) => setEditField(e.target.value)}
          />
          {/* Kỳ nghiên cứu. Hạn chót mọi mốc tiến độ phải nằm trong khoảng này
              (`assertDeadlineWithinThesis` ở backend), nên thu hẹp khoảng sau khi
              đã có mốc sẽ bị server từ chối kèm lý do cụ thể. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Kỳ nghiên cứu — từ ngày"
              type="date"
              value={editStart}
              onChange={(e) => setEditStart(e.target.value)}
              helperText="Bỏ trống nếu chưa xác định"
            />
            <Input
              label="đến ngày"
              type="date"
              value={editEnd}
              min={editStart || undefined}
              onChange={(e) => setEditEnd(e.target.value)}
            />
          </div>
          <Textarea
            label="Mô tả"
            rows={6}
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
          />
        </div>
      </Modal>

      {/* ---------------- Xóa ---------------- */}
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Xóa đề tài?"
        confirmLabel="Xóa đề tài"
        onConfirm={async () => {
          try {
            await thesesApi.remove(thesis.id);
            toast.success("Đã xóa đề tài.");
            router.push("/theses");
          } catch (err) {
            toast.error(isApiError(err) ? err.message : "Xóa đề tài thất bại");
          }
        }}
        message={
          <>
            Đề tài <strong className="text-primary">{thesis.title}</strong> sẽ bị ẩn khỏi hệ thống
            cùng toàn bộ mốc tiến độ và tài liệu của nó. Chỉ xóa được đề tài đang ở trạng thái Nháp.
          </>
        }
      />
    </div>
  );
}

/* ==========================================================================
   THÀNH VIÊN ĐỀ TÀI

   Lược đồ đã hỗ trợ đề tài nhóm từ đầu (`thesis_members` là quan hệ nhiều-nhiều
   có vai trò), nhưng trang này trước đó chỉ in `student_names.join(", ")` — một
   dòng chữ chết. Muốn thêm bạn cùng nhóm phải nhờ giảng viên gọi API, và không
   có màn hình nào cho việc đó.

   Ràng buộc còn lại nằm ở backend chứ không ở đây: mỗi sinh viên chỉ được tham
   gia MỘT đề tài đang chạy (BR UC 3.1). Đó là giới hạn trên mỗi sinh viên, không
   phải giới hạn số thành viên — một đề tài nhận bao nhiêu người cũng được.
   ========================================================================== */

function MemberPanel({
  thesis,
  canManage,
  onChanged,
  onRefetch,
}: {
  thesis: Thesis;
  canManage: boolean;
  onChanged: (next: Thesis) => void;
  onRefetch: () => void;
}) {
  const [addOpen, setAddOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [emailError, setEmailError] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [removing, setRemoving] = React.useState<ThesisMember | null>(null);
  const [busy, setBusy] = React.useState(false);

  const members = thesis.members;

  const closeAdd = () => {
    setAddOpen(false);
    setEmail("");
    setEmailError(null);
  };

  const handleAdd = async () => {
    const value = email.trim();
    if (!value) {
      setEmailError("Vui lòng nhập email của sinh viên");
      return;
    }

    setAdding(true);
    setEmailError(null);
    try {
      // Server trả về bản ghi đề tài mới nên ghi đè thẳng: đoán trước danh sách
      // sau khi thêm sẽ sai ngay ở trường hợp người đầu tiên vào (họ thành chủ
      // nhiệm, không phải thành viên thường).
      onChanged(await thesesApi.addMember(thesis.id, value));
      toast.success("Đã thêm thành viên vào đề tài.");
      closeAdd();
    } catch (err) {
      // Lỗi ở đây gần như luôn nói về CHÍNH ô email (không tìm thấy, đã là thành
      // viên, đang bận đề tài khác), nên hiện ngay dưới ô thay vì trong một toast
      // biến mất sau năm giây.
      setEmailError(isApiError(err) ? err.message : "Không thêm được thành viên.");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async () => {
    if (!removing?.user_id) return;

    setBusy(true);
    try {
      await thesesApi.removeMember(thesis.id, removing.user_id);
      toast.success(`Đã gỡ ${removing.full_name} khỏi đề tài.`);
      setRemoving(null);
      // `remove` trả 204 nên không có bản ghi mới để ghi đè — phải hỏi lại.
      onRefetch();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Không gỡ được thành viên.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card className="p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-[14px] font-semibold">Thành viên đề tài</h3>
          {canManage && (
            <Button
              variant="ghost"
              size="sm"
              icon={<UserPlus size={14} />}
              onClick={() => setAddOpen(true)}
            >
              Thêm
            </Button>
          )}
        </div>

        {members.length === 0 ? (
          <p className="text-[13px] text-tertiary">
            Chưa có sinh viên nào tham gia đề tài này.
          </p>
        ) : (
          <ul className="flex flex-col">
            {members.map((m, i) => (
              <li
                key={m.student_id}
                className="flex items-center gap-2.5 py-2"
                style={{ borderTop: i > 0 ? "1px solid var(--border-secondary)" : undefined }}
              >
                <Avatar name={m.full_name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium truncate">{m.full_name}</p>
                  {m.role === "OWNER" && (
                    <span className="text-[11.5px] text-tertiary">Chủ nhiệm</span>
                  )}
                </div>
                {/* Chủ nhiệm không có nút gỡ: backend từ chối thao tác đó, và bày
                    một nút chắc chắn trả về lỗi là bắt người dùng tự dò luật bằng
                    cách va vào nó. */}
                {canManage && m.role !== "OWNER" && m.user_id !== null && (
                  <button
                    onClick={() => setRemoving(m)}
                    aria-label={`Gỡ ${m.full_name} khỏi đề tài`}
                    className="text-muted hover:text-danger transition-colors p-1 flex-shrink-0"
                  >
                    <Trash size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={addOpen}
        onClose={closeAdd}
        title="Thêm thành viên"
        description="Sinh viên phải đã có tài khoản trên hệ thống."
        footer={
          <>
            <Button variant="ghost" onClick={closeAdd}>
              Hủy
            </Button>
            <Button variant="primary" loading={adding} onClick={() => void handleAdd()}>
              Thêm vào đề tài
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleAdd();
          }}
        >
          <Input
            label="Email sinh viên"
            type="email"
            placeholder="sinhvien@novathesis.edu.vn"
            value={email}
            error={emailError ?? undefined}
            onChange={(e) => {
              setEmail(e.target.value);
              if (emailError) setEmailError(null);
            }}
            helperText="Mỗi sinh viên chỉ tham gia được một đề tài đang thực hiện."
            autoFocus
          />
        </form>
      </Modal>

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Gỡ thành viên khỏi đề tài?"
        confirmLabel="Gỡ khỏi đề tài"
        loading={busy}
        onConfirm={() => void handleRemove()}
        message={
          <>
            <strong className="text-primary">{removing?.full_name}</strong> sẽ không còn truy cập
            được đề tài này. Mốc tiến độ, tài liệu và bình luận họ đã tạo vẫn được giữ nguyên.
          </>
        }
      />
    </>
  );
}

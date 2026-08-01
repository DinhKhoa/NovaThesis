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
  Warning,
  XCircle,
} from "@phosphor-icons/react";
import {
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
import { thesesApi, type Thesis } from "@/lib/services";
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
            <UserPlus size={18} className="text-accent" />
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

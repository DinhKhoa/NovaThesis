"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  GraduationCap,
  Clock,
  CheckCircle,
  XCircle,
  PencilSimple,
  Trash,
  UserPlus,
  ArrowClockwise,
  ListBullets,
  Files,
  ChatCircleDots,
  Robot,
} from "@phosphor-icons/react";
import {
  Card,
  Button,
  Badge,
  Modal,
  Textarea,
  Input,
  
} from "@/components/ui";
import { useAuthStore, isLecturer, isStudent } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { mockTheses, statusMap, Thesis } from "../page";

export default function ThesisDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const id = Number(params.id);

  const [thesis, setThesis] = React.useState<Thesis | null>(() => {
    return mockTheses.find((t) => t.id === id) || mockTheses[0];
  });

  const [activeTab, setActiveTab] = React.useState<"info" | "history">("info");

  // Approval Modals State (UC 3.6, 3.7)
  const [rejectModalOpen, setRejectModalOpen] = React.useState(false);
  const [rejectionReason, setRejectionReason] = React.useState("");
  const [processing, setProcessing] = React.useState(false);

  // Edit State (UC 3.4)
  const [editModalOpen, setEditModalOpen] = React.useState(false);
  const [editTitle, setEditTitle] = React.useState(thesis?.title || "");
  const [editDesc, setEditDesc] = React.useState(thesis?.description || "");

  // Delete State (UC 3.5)
  const [deleteModalOpen, setDeleteModalOpen] = React.useState(false);

  if (!thesis) {
    return <div className="p-8 text-center text-tertiary">Đề tài không tồn tại</div>;
  }

  const statusInfo = statusMap[thesis.status];

  // GV Approve Handler (UC 3.6)
  const handleApprove = async () => {
    setProcessing(true);
    try {
      setThesis((prev) => (prev ? { ...prev, status: "ONGOING" } : null));
      toast.success("Đã phê duyệt đề tài thành công!");
    } catch {
      toast.error("Phê duyệt thất bại");
    } finally {
      setProcessing(false);
    }
  };

  // GV Reject Handler (UC 3.7)
  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      toast.error("Vui lòng nhập lý do từ chối");
      return;
    }
    setProcessing(true);
    try {
      setThesis((prev) =>
        prev
          ? {
              ...prev,
              status: "REJECTED",
              rejection_reason: rejectionReason,
            }
          : null
      );
      toast.warning("Đã từ chối đề tài và gửi nhận xét cho sinh viên");
      setRejectModalOpen(false);
    } catch {
      toast.error("Từ chối thất bại");
    } finally {
      setProcessing(false);
    }
  };

  // SV Resubmit Handler (UC 3.8)
  const handleResubmit = async () => {
    setProcessing(true);
    try {
      setThesis((prev) => (prev ? { ...prev, status: "PENDING", rejection_reason: undefined } : null));
      toast.success("Đã gửi lại đề tài để Giảng viên phê duyệt!");
    } catch {
      toast.error("Thao tác thất bại");
    } finally {
      setProcessing(false);
    }
  };

  // Save Edit Handler (UC 3.4)
  const handleSaveEdit = async () => {
    setProcessing(true);
    try {
      setThesis((prev) => (prev ? { ...prev, title: editTitle, description: editDesc } : null));
      toast.success("Đã cập nhật thông tin đề tài!");
      setEditModalOpen(false);
    } catch {
      toast.error("Cập nhật thất bại");
    } finally {
      setProcessing(false);
    }
  };

  // Delete Handler (UC 3.5)
  const handleDelete = async () => {
    try {
      toast.success("Đã xóa đề tài thành công!");
      router.push("/theses");
    } catch {
      toast.error("Xóa đề tài thất bại");
    }
  };

  return (
    <div>
      <div className="mb-4">
        <button
          onClick={() => router.back()}
          className="btn-ghost text-tertiary hover:text-primary text-[13px] inline-flex items-center gap-1.5 p-0"
        >
          <ArrowLeft size={16} />
          Quay lại danh sách
        </button>
      </div>

      {/* Header Banner */}
      <Card className="p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <Badge variant={statusInfo.variant} dot>
              {statusInfo.label}
            </Badge>
            <span className="text-[12px] text-tertiary font-mono">
              Lĩnh vực: {thesis.field}
            </span>
          </div>

          {/* Action Buttons based on Role & Status */}
          <div className="flex items-center gap-2">
            {/* Lecturer approval buttons */}
            {isLecturer(user) && thesis.status === "PENDING" && (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  icon={<CheckCircle size={16} />}
                  onClick={handleApprove}
                  loading={processing}
                >
                  Phê duyệt
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  icon={<XCircle size={16} />}
                  onClick={() => setRejectModalOpen(true)}
                >
                  Từ chối
                </Button>
              </>
            )}

            {/* Student Resubmit */}
            {isStudent(user) && thesis.status === "REJECTED" && (
              <Button
                variant="primary"
                size="sm"
                icon={<ArrowClockwise size={16} />}
                onClick={handleResubmit}
                loading={processing}
              >
                Gửi lại để duyệt
              </Button>
            )}

            {/* Edit / Delete for Owner */}
            <Button
              variant="secondary"
              size="sm"
              icon={<PencilSimple size={16} />}
              onClick={() => {
                setEditTitle(thesis.title);
                setEditDesc(thesis.description);
                setEditModalOpen(true);
              }}
            >
              Sửa
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={<Trash size={16} />}
              onClick={() => setDeleteModalOpen(true)}
            >
              Xóa
            </Button>
          </div>
        </div>

        <h1 className="text-xl font-bold tracking-tight mb-3 leading-snug">
          {thesis.title}
        </h1>

        <div className="flex flex-wrap items-center gap-6 text-[13px] text-secondary border-t border-[var(--border-secondary)] pt-4 mt-4">
          <span className="flex items-center gap-2">
            <GraduationCap size={18} className="text-accent" />
            GVHD: <strong className="text-primary font-medium">{thesis.lecturer_name}</strong>
          </span>

          <span className="flex items-center gap-2">
            <UserPlus size={18} className="text-accent" />
            Sinh viên thực hiện:{" "}
            <strong className="text-primary font-medium">
              {thesis.student_names?.join(", ") || "Chưa gán sinh viên"}
            </strong>
          </span>

          <span className="flex items-center gap-2 text-tertiary font-mono">
            <Clock size={16} />
            Cập nhật: {thesis.updated_at}
          </span>
        </div>
      </Card>

      {/* Tabs Bar */}
      <div className="flex items-center gap-2 border-b border-[var(--border-primary)] mb-6">
        <button
          className={`px-4 py-2.5 text-[14px] font-medium border-b-2 transition-colors ${
            activeTab === "info"
              ? "border-[var(--accent)] text-[var(--accent)]"
              : "border-transparent text-tertiary hover:text-primary"
          }`}
          onClick={() => setActiveTab("info")}
        >
          Thông tin chi tiết
        </button>
        <button
          className={`px-4 py-2.5 text-[14px] font-medium border-b-2 transition-colors ${
            activeTab === "history"
              ? "border-[var(--accent)] text-[var(--accent)]"
              : "border-transparent text-tertiary hover:text-primary"
          }`}
          onClick={() => setActiveTab("history")}
        >
          Lịch sử hoạt động
        </button>
      </div>

      {/* Tab Content: Info */}
      {activeTab === "info" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 p-6">
            <h2 className="text-base font-semibold mb-3">Mô tả / Đề cương nghiên cứu</h2>
            <p className="text-[14px] leading-relaxed text-secondary whitespace-pre-line mb-6">
              {thesis.description}
            </p>

            {/* Rejection Alert Box */}
            {thesis.rejection_reason && (
              <div className="p-4 rounded-xl mb-6 bg-[var(--danger-bg)] border border-[rgba(248,113,113,0.3)]">
                <h3 className="text-[14px] font-semibold text-[var(--danger)] flex items-center gap-2 mb-1">
                  <XCircle size={18} />
                  Lý do giảng viên yêu cầu chỉnh sửa:
                </h3>
                <p className="text-[13px] text-secondary">{thesis.rejection_reason}</p>
              </div>
            )}
          </Card>

          {/* Sidebar Quick Shortcuts */}
          <div className="flex flex-col gap-4">
            <Card className="p-5">
              <h3 className="text-[14px] font-semibold mb-3">Không gian làm việc</h3>
              <div className="flex flex-col gap-2">
                <Button variant="secondary" className="justify-start" icon={<ListBullets size={15} />} onClick={() => router.push("/milestones")}>
                  Quản lý Milestone
                </Button>
                <Button variant="secondary" className="justify-start" icon={<Files size={15} />} onClick={() => router.push("/documents")}>
                  Kho tài liệu & RAG
                </Button>
                <Button variant="secondary" className="justify-start" icon={<Robot size={15} />} onClick={() => router.push("/ai-chat")}>
                  Hỏi đáp Trợ lý AI
                </Button>
                <Button variant="secondary" className="justify-start" icon={<ChatCircleDots size={15} />} onClick={() => router.push("/feedbacks")}>
                  Phản hồi GVHD
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Tab Content: History Timeline */}
      {activeTab === "history" && (
        <Card className="p-6 max-w-3xl">
          <h2 className="text-base font-semibold mb-4">Lịch sử thay đổi trạng thái đề tài</h2>

          <div className="flex flex-col gap-4">
            {[
              { time: "2026-07-15 10:30", actor: "TS. Nguyễn Văn A", event: "Đã duyệt đề tài chuyển sang Đang thực hiện" },
              { time: "2026-07-10 14:20", actor: "Lê Văn C", event: "Đã cập nhật mô tả đề cương theo yêu cầu" },
              { time: "2026-07-01 09:00", actor: "Lê Văn C", event: "Khởi tạo và gửi đề xuất đề tài" },
            ].map((item, idx) => (
              <div key={idx} className="flex gap-4 items-start border-l-2 border-[var(--accent)] pl-4 py-1">
                <div>
                  <p className="text-[14px] font-medium text-primary">{item.event}</p>
                  <span className="text-[12px] text-tertiary">
                    {item.actor} • {item.time}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Reject Modal */}
      <Modal
        open={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        title="Từ chối / Yêu cầu chỉnh sửa đề tài"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejectModalOpen(false)}>
              Hủy
            </Button>
            <Button variant="danger" loading={processing} onClick={handleReject}>
              Gửi từ chối
            </Button>
          </>
        }
      >
        <Textarea
          label="Lý do từ chối / Hướng dẫn chỉnh sửa *"
          rows={4}
          placeholder="Nhập lý do cụ thể để sinh viên biết hướng chỉnh sửa..."
          value={rejectionReason}
          onChange={(e) => setRejectionReason(e.target.value)}
        />
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Chỉnh sửa thông tin đề tài"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditModalOpen(false)}>
              Hủy
            </Button>
            <Button variant="primary" loading={processing} onClick={handleSaveEdit}>
              Cập nhật
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input label="Tiêu đề" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
          <Textarea label="Mô tả" rows={5} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Xác nhận xóa đề tài"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteModalOpen(false)}>
              Hủy
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              Xóa đề tài
            </Button>
          </>
        }
      >
        <p className="text-[14px] text-secondary">
          Bạn có chắc chắn muốn xóa đề tài <strong className="text-primary">{thesis.title}</strong>? Đề tài sẽ bị chuyển trạng thái xóa (soft delete).
        </p>
      </Modal>
    </div>
  );
}

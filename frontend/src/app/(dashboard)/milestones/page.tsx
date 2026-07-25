"use client";

import React from "react";
import { createPortal } from "react-dom";
import {
  Plus,
  Clock,
  CheckCircle,
  XCircle,
  UploadSimple,
  CalendarCheck,
  FilePdf,
  DotsSixVertical,
  Prohibit,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/layout";
import {
  Card,
  Button,
  Badge,
  Modal,
  Input,
  Textarea,
  Dropdown,
  DropdownItem,
  Select,
  Table,
  useMounted,
} from "@/components/ui";
import { useAuthStore, isLecturer } from "@/lib/auth";
import { toast } from "@/lib/toast";
import {
  checkTransition,
  STATUS_LABELS,
  TRANSITION_TOASTS,
} from "@/lib/milestone-fsm";
import { useBoardDrag } from "@/lib/use-board-drag";

/* ========================================
   TYPES (ERD Milestones Table)
   ======================================== */

export type MilestoneStatus =
  | "NOT_STARTED"
  | "ONGOING"
  | "PENDING_APPROVAL"
  | "COMPLETED"
  | "REVISION_REQUIRED";

export interface Milestone {
  id: number;
  thesis_id: number;
  name: string;
  description: string;
  deadline: string;
  status: MilestoneStatus;
  description_revision?: string;
  evidence_file_url?: string | null;
  evidence_filename?: string | null;
  extension_requested?: boolean;
  extension_reason?: string;
  extension_new_deadline?: string;
  created_at: string;
}

const mockMilestones: Milestone[] = [
  {
    id: 1,
    thesis_id: 1,
    name: "Nộp Báo cáo Đề cương Luận văn",
    description: "Xây dựng đề cương chi tiết, tổng quan tài liệu nghiên cứu và lịch trình thực hiện.",
    deadline: "2026-07-25",
    status: "ONGOING",
    created_at: "2026-02-15",
  },
  {
    id: 2,
    thesis_id: 1,
    name: "Thiết kế Kiến trúc Hệ thống & ERD Database",
    description: "Đặc tả sơ đồ thực thể ERD 13 bảng và thiết kế UI wireframe.",
    deadline: "2026-07-20",
    status: "PENDING_APPROVAL",
    evidence_file_url: "/uploads/erd_spec_v2.pdf",
    evidence_filename: "erd_spec_v2.pdf",
    created_at: "2026-02-20",
  },
  {
    id: 3,
    thesis_id: 1,
    name: "Cài đặt Module AI & Vector Search (pgvector)",
    description: "Tích hợp pgvector, chunking tài liệu PDF và kết nối OpenAI embedding API.",
    deadline: "2026-08-05",
    status: "NOT_STARTED",
    created_at: "2026-03-01",
  },
  {
    id: 4,
    thesis_id: 1,
    name: "Hoàn thiện Frontend Dashboard & Flow 92 Use Cases",
    description: "Xây dựng giao diện Next.js 15 Tailwind v4 chuẩn UX.",
    deadline: "2026-07-15",
    status: "COMPLETED",
    evidence_file_url: "/uploads/frontend_demo_v1.zip",
    evidence_filename: "frontend_demo_v1.zip",
    created_at: "2026-02-10",
  },
  {
    id: 5,
    thesis_id: 1,
    name: "Thử nghiệm Đánh giá Lỗi Security & Input Validation",
    description: "Kiểm tra chống SQL Injection, rate limit, bcrypt password hashing.",
    deadline: "2026-08-15",
    status: "REVISION_REQUIRED",
    description_revision: "Cần bổ sung thêm phần kiểm tra JWT Refresh Token.",
    created_at: "2026-03-10",
  },
];

const statusColumns: { key: MilestoneStatus; label: string; variant: "neutral" | "info" | "warning" | "success" | "danger" }[] = [
  { key: "NOT_STARTED", label: STATUS_LABELS.NOT_STARTED, variant: "neutral" },
  { key: "ONGOING", label: STATUS_LABELS.ONGOING, variant: "info" },
  { key: "PENDING_APPROVAL", label: STATUS_LABELS.PENDING_APPROVAL, variant: "warning" },
  { key: "REVISION_REQUIRED", label: STATUS_LABELS.REVISION_REQUIRED, variant: "danger" },
  { key: "COMPLETED", label: STATUS_LABELS.COMPLETED, variant: "success" },
];

/* Left-to-right order, which is also the order the keyboard arrows walk. */
const COLUMN_ORDER = statusColumns.map((c) => c.key) as readonly MilestoneStatus[];

export default function MilestonesPage() {
  const { user } = useAuthStore();
  const [milestones, setMilestones] = React.useState<Milestone[]>(mockMilestones);
  const [viewMode, setViewMode] = React.useState<"kanban" | "list">("kanban");

  // Create Milestone Modal (UC 4.1)
  const [createModalOpen, setCreateModalOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [desc, setDesc] = React.useState("");
  const [deadline, setDeadline] = React.useState("");

  // Upload Evidence Modal (UC 4.9)
  const [uploadModalOpen, setUploadModalOpen] = React.useState(false);
  const [selectedMilestone, setSelectedMilestone] = React.useState<Milestone | null>(null);
  const [uploading, setUploading] = React.useState(false);

  // Extend Deadline Modal (UC 4.7)
  const [extendModalOpen, setExtendModalOpen] = React.useState(false);
  const [extendReason, setExtendReason] = React.useState("");
  const [newDeadline, setNewDeadline] = React.useState("");

  // GV Revision Request Modal (UC 4.11)
  const [revisionModalOpen, setRevisionModalOpen] = React.useState(false);
  const [revisionComment, setRevisionComment] = React.useState("");

  // Export PDF Progress (UC 4.15)
  const [exportingPdf, setExportingPdf] = React.useState(false);

  // Handlers
  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !deadline) {
      toast.error("Vui lòng điền tên mốc và hạn chót");
      return;
    }
    const created: Milestone = {
      id: Date.now(),
      thesis_id: 1,
      name,
      description: desc,
      deadline,
      status: "NOT_STARTED",
      created_at: new Date().toISOString().split("T")[0],
    };
    setMilestones((prev) => [...prev, created]);
    toast.success("Đã tạo milestone mới!");
    setCreateModalOpen(false);
    setName("");
    setDesc("");
    setDeadline("");
  };

  // Status change (UC 4.8). Every path into this — drag, keyboard, menu —
  // goes through the FSM first, so the board can never produce a state the
  // server would reject.
  const handleStatusChange = React.useCallback(
    (id: number, next: MilestoneStatus) => {
      setMilestones((prev) =>
        prev.map((m) => (m.id === id ? { ...m, status: next } : m))
      );
      toast.success(TRANSITION_TOASTS[next] ?? "Đã cập nhật trạng thái.");
    },
    []
  );

  /* The board reads the transition table rather than owning any rules of its
     own, so drag, keyboard and the row menu all agree on what is legal. */
  const canDrop = React.useCallback(
    (id: string, from: MilestoneStatus, to: MilestoneStatus) => {
      const m = milestones.find((x) => String(x.id) === id);
      if (!m) return { allowed: false };
      return checkTransition(from, to, user?.role, m);
    },
    [milestones, user?.role]
  );

  const board = useBoardDrag<MilestoneStatus>({
    columns: COLUMN_ORDER,
    canDrop,
    onDrop: (id, _from, to) => handleStatusChange(Number(id), to),
    onReject: (reason) => toast.error(reason),
  });

  const mounted = useMounted();

  // Approve Milestone (UC 4.10)
  const handleApprove = (id: number) => {
    setMilestones((prev) =>
      prev.map((m) => (m.id === id ? { ...m, status: "COMPLETED" } : m))
    );
    toast.success("Giảng viên đã phê duyệt hoàn thành milestone!");
  };

  // Request Revision (UC 4.11)
  const handleRequestRevision = () => {
    if (!selectedMilestone || !revisionComment.trim()) {
      toast.error("Vui lòng nhập nhận xét yêu cầu sửa đổi");
      return;
    }
    setMilestones((prev) =>
      prev.map((m) =>
        m.id === selectedMilestone.id ? { ...m, status: "REVISION_REQUIRED" } : m
      )
    );
    toast.warning("Đã yêu cầu sinh viên chỉnh sửa!");
    setRevisionModalOpen(false);
    setRevisionComment("");
  };

  // Request Extension (UC 4.7)
  const handleRequestExtension = () => {
    if (!selectedMilestone || !extendReason || !newDeadline) {
      toast.error("Vui lòng điền đầy đủ thông tin gia hạn");
      return;
    }
    setMilestones((prev) =>
      prev.map((m) =>
        m.id === selectedMilestone.id
          ? {
              ...m,
              extension_requested: true,
              extension_reason: extendReason,
              extension_new_deadline: newDeadline,
            }
          : m
      )
    );
    toast.success("Đã gửi yêu cầu xin gia hạn deadline tới Giảng viên!");
    setExtendModalOpen(false);
  };

  // Export PDF (UC 4.15)
  const handleExportPdf = () => {
    setExportingPdf(true);
    setTimeout(() => {
      toast.success("Đã xuất và tải xuống file Báo_cáo_tiến_độ_NovaThesis.pdf!");
      setExportingPdf(false);
    }, 1500);
  };

  return (
    <div>
      <PageHeader
        title="Tiến độ"
        description="Các mốc công việc của đề tài, hạn nộp và trạng thái phê duyệt."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              icon={<FilePdf size={15} />}
              loading={exportingPdf}
              onClick={handleExportPdf}
            >
              Xuất PDF
            </Button>
            <Button
              variant="primary"
              icon={<Plus size={15} />}
              onClick={() => setCreateModalOpen(true)}
            >
              Thêm Milestone
            </Button>
          </div>
        }
      />

      {/* Board View / List View Switch */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-1 bg-[var(--bg-secondary)] p-1 rounded-lg border border-[var(--border-primary)]">
          <button
            className={`px-3 py-1.5 text-[13px] font-medium rounded-md transition-colors ${
              viewMode === "kanban"
                ? "bg-[var(--bg-tertiary)] text-primary shadow-sm"
                : "text-tertiary hover:text-primary"
            }`}
            onClick={() => setViewMode("kanban")}
          >
            Kanban Board
          </button>
          <button
            className={`px-3 py-1.5 text-[13px] font-medium rounded-md transition-colors ${
              viewMode === "list"
                ? "bg-[var(--bg-tertiary)] text-primary shadow-sm"
                : "text-tertiary hover:text-primary"
            }`}
            onClick={() => setViewMode("list")}
          >
            Danh sách
          </button>
        </div>
      </div>

      {/* KANBAN BOARD VIEW (UC 4.2, 4.8) */}
      {viewMode === "kanban" && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3 overflow-x-auto pb-4">
          {statusColumns.map((col) => {
            const items = milestones.filter((m) => m.status === col.key);
            const state = board.columnState(col.key);

            return (
              <div key={col.key} className="flex flex-col gap-2 min-w-[240px]">
                {/* Column Header */}
                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-primary)]">
                  <span className="text-[12.5px] font-semibold text-secondary">{col.label}</span>
                  <Badge variant={col.variant}>{items.length}</Badge>
                </div>

                {/* Drop zone. The whole column is the target, not the gaps
                    between cards — position within a status carries no meaning
                    here, so asking the user to aim at a 4px gap would be
                    precision for its own sake. */}
                <div
                  ref={board.registerColumn(col.key)}
                  data-drop={state}
                  aria-dropeffect={state === "valid" ? "move" : undefined}
                  className="drop-zone flex flex-col gap-2 min-h-[22rem] rounded-lg p-1"
                >
                  {items.map((m) => (
                    <Card
                      key={m.id}
                      hoverable={false}
                      data-dragging={
                        board.activeItemId === String(m.id) ? "true" : undefined
                      }
                      className="board-card p-3 flex flex-col justify-between"
                      onPointerDown={(e: React.PointerEvent) =>
                        board.startPointerDrag(e, String(m.id), m.status)
                      }
                      onKeyDown={(e: React.KeyboardEvent) =>
                        board.handleKeyDown(e, String(m.id), m.status)
                      }
                      tabIndex={0}
                      aria-roledescription="Thẻ mốc tiến độ, có thể kéo thả"
                      aria-grabbed={board.activeItemId === String(m.id)}
                      aria-label={`${m.name} — ${STATUS_LABELS[m.status]}. Nhấn Space để di chuyển.`}
                    >
                      <div>
                        <div className="flex items-start gap-1.5 mb-1.5">
                          {/* `touch-action: none` lives on the grip alone, so
                              the board still scrolls under a finger everywhere
                              else on the card. */}
                          <span
                            className="drag-grip -ml-1 mt-px flex-shrink-0"
                            aria-hidden="true"
                          >
                            <DotsSixVertical size={14} weight="bold" />
                          </span>
                          <h3 className="text-[13px] font-semibold leading-snug">
                            {m.name}
                          </h3>
                        </div>
                        <p className="text-[12px] text-tertiary line-clamp-2 mb-2.5 leading-relaxed">
                          {m.description}
                        </p>
                      </div>

                      <div>
                        {/* Evidence Tag */}
                        {m.evidence_filename && (
                          <div className="flex items-center gap-1.5 text-[11px] text-accent mb-2 bg-[var(--accent-subtle)] p-1.5 rounded-md">
                            <UploadSimple size={14} />
                            <span className="truncate">{m.evidence_filename}</span>
                          </div>
                        )}

                        {/* Extension Tag */}
                        {m.extension_requested && (
                          <div className="flex items-center gap-1.5 text-[11px] text-warning mb-2 bg-[var(--warning-bg)] p-1.5 rounded-md">
                            <Clock size={14} />
                            <span>Xin gia hạn → {m.extension_new_deadline}</span>
                          </div>
                        )}

                        <div className="flex items-center justify-between text-[11px] text-tertiary pt-2 border-t border-[var(--border-secondary)]">
                          <span className="flex items-center gap-1 font-mono">
                            <Clock size={14} /> {m.deadline}
                          </span>

                          <Dropdown
                            align="right"
                            trigger={
                              <button className="btn-ghost p-1 rounded hover:text-primary text-[12px]">
                                Thao tác
                              </button>
                            }
                          >
                            {/* Student Action: Upload evidence */}
                            <DropdownItem
                              icon={<UploadSimple size={16} />}
                              onClick={() => {
                                setSelectedMilestone(m);
                                setUploadModalOpen(true);
                              }}
                            >
                              Nộp minh chứng
                            </DropdownItem>

                            {/* Student Action: Extend deadline */}
                            <DropdownItem
                              icon={<CalendarCheck size={16} />}
                              onClick={() => {
                                setSelectedMilestone(m);
                                setExtendModalOpen(true);
                              }}
                            >
                              Xin gia hạn
                            </DropdownItem>

                            {/* GV Actions: Approve / Reject (UC 4.10, 4.11) */}
                            {isLecturer(user) && (
                              <>
                                <DropdownItem
                                  icon={<CheckCircle size={16} />}
                                  onClick={() => handleApprove(m.id)}
                                >
                                  Duyệt thành công
                                </DropdownItem>
                                <DropdownItem
                                  danger
                                  icon={<XCircle size={16} />}
                                  onClick={() => {
                                    setSelectedMilestone(m);
                                    setRevisionModalOpen(true);
                                  }}
                                >
                                  Yêu cầu sửa
                                </DropdownItem>
                              </>
                            )}
                          </Dropdown>
                        </div>
                      </div>
                    </Card>
                  ))}

                  {items.length === 0 && (
                    <p className="text-[12px] text-muted text-center py-6 select-none">
                      {state === "valid" ? "Thả vào đây" : "Trống"}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* LIST VIEW
          The toggle for this already existed but rendered nothing. It matters
          more now: a board you can only operate by dragging is unusable on a
          narrow screen and awkward with assistive tech, so this is the same
          workflow reachable through a plain control. Both paths call the same
          FSM, so neither can produce a state the other would refuse. */}
      {viewMode === "list" && (
        <Card hoverable={false} className="overflow-hidden">
          <Table
            data={milestones}
            keyExtractor={(m) => String(m.id)}
            pageSize={20}
            rowAccent={(m) =>
              m.status === "REVISION_REQUIRED"
                ? "danger"
                : m.status === "COMPLETED"
                  ? "success"
                  : undefined
            }
            columns={[
              {
                key: "name",
                header: "Mốc tiến độ",
                sortValue: (m) => m.name,
                render: (m) => (
                  <div className="min-w-0 py-0.5">
                    <p className="text-[13px] font-medium truncate max-w-[28rem]">
                      {m.name}
                    </p>
                    <p className="text-[12px] text-tertiary truncate max-w-[34rem]">
                      {m.description}
                    </p>
                  </div>
                ),
              },
              {
                key: "evidence",
                header: "Minh chứng",
                width: "1%",
                hideOnMobile: true,
                render: (m) =>
                  m.evidence_filename ? (
                    <span className="chip max-w-[12rem] truncate">
                      {m.evidence_filename}
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  ),
              },
              {
                key: "deadline",
                header: "Hạn nộp",
                width: "1%",
                hideOnMobile: true,
                sortValue: (m) => m.deadline,
                render: (m) => (
                  <span className="text-[12.5px] text-tertiary tnum whitespace-nowrap">
                    {m.deadline}
                  </span>
                ),
              },
              {
                key: "status",
                header: "Trạng thái",
                width: "1%",
                sortValue: (m) => m.status,
                render: (m) => {
                  /* Only the transitions the FSM would actually accept are
                     offered, so the control cannot present a dead end. */
                  const targets = COLUMN_ORDER.filter(
                    (t) =>
                      t === m.status ||
                      checkTransition(m.status, t, user?.role, m).allowed
                  );
                  return (
                    <Select
                      value={m.status}
                      aria-label={`Trạng thái của ${m.name}`}
                      className="w-auto"
                      disabled={targets.length <= 1}
                      onChange={(e) =>
                        handleStatusChange(m.id, e.target.value as MilestoneStatus)
                      }
                    >
                      {targets.map((t) => (
                        <option key={t} value={t}>
                          {STATUS_LABELS[t]}
                        </option>
                      ))}
                    </Select>
                  );
                },
              },
            ]}
          />
        </Card>
      )}

      {/* Live region: the only feedback a keyboard or screen-reader user gets
          while a card is in flight, since they cannot see the highlight. */}
      <div className="sr-only" role="status" aria-live="polite">
        {board.activeItemId && board.activeTarget
          ? board.rejection
            ? `Không thể thả vào ${STATUS_LABELS[board.activeTarget]}. ${board.rejection}`
            : `Đang ở ${STATUS_LABELS[board.activeTarget]}. Nhấn Space để thả.`
          : ""}
      </div>

      {/* Floating card that follows the pointer. Portalled to <body> so no
          ancestor transform can re-anchor it, and pointer-events disabled so
          it never becomes its own hit target. */}
      {mounted && board.drag
        ? createPortal(
            <div
              className="drag-ghost"
              style={{
                left: board.drag.x - board.drag.dx,
                top: board.drag.y - board.drag.dy,
                width: board.drag.w,
              }}
            >
              <div className="card p-3">
                <p className="text-[13px] font-semibold leading-snug">
                  {milestones.find((m) => String(m.id) === board.drag!.itemId)?.name}
                </p>
              </div>
              {board.rejection && (
                <p className="drag-reason">
                  <Prohibit size={12} weight="bold" />
                  {board.rejection}
                </p>
              )}
            </div>,
            document.body
          )
        : null}

      {/* Modal: Create Milestone */}
      <Modal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Tạo Milestone mốc tiến độ mới"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateModalOpen(false)}>
              Hủy
            </Button>
            <Button variant="primary" onClick={handleCreate}>
              Khởi tạo Milestone
            </Button>
          </>
        }
      >
        <form className="flex flex-col gap-4">
          <Input
            label="Tên mốc tiến độ *"
            placeholder="Ví dụ: Báo cáo Đề cương / Demo sản phẩm v1"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label="Hạn chót hoàn thành (Deadline) *"
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
          <Textarea
            label="Mô tả công việc & Yêu cầu sản phẩm nộp"
            rows={4}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
        </form>
      </Modal>

      {/* Modal: Upload Evidence File */}
      <Modal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        title={`Nộp minh chứng cho: ${selectedMilestone?.name}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setUploadModalOpen(false)}>
              Hủy
            </Button>
            <Button
              variant="primary"
              loading={uploading}
              onClick={() => {
                setUploading(true);
                setTimeout(() => {
                  setMilestones((prev) =>
                    prev.map((m) =>
                      m.id === selectedMilestone?.id
                        ? {
                            ...m,
                            status: "PENDING_APPROVAL",
                            evidence_filename: "bao_cao_minh_chung.pdf",
                          }
                        : m
                    )
                  );
                  toast.success("Đã tải lên minh chứng và chuyển sang trạng thái Chờ phê duyệt!");
                  setUploading(false);
                  setUploadModalOpen(false);
                }, 1000);
              }}
            >
              Tải lên & Nộp bài
            </Button>
          </>
        }
      >
        <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-[var(--border-primary)] rounded-xl bg-[var(--bg-secondary)] text-center cursor-pointer hover:border-[var(--accent)] transition-colors">
          <UploadSimple size={36} className="text-accent mb-2" />
          <p className="text-[14px] font-medium text-primary">Kéo thả file báo cáo vào đây hoặc click để duyệt</p>
          <p className="text-[12px] text-tertiary mt-1">Hỗ trợ PDF, DOCX, ZIP (Tối đa 10MB)</p>
        </div>
      </Modal>

      {/* Modal: Extend Deadline Request */}
      <Modal
        open={extendModalOpen}
        onClose={() => setExtendModalOpen(false)}
        title="Yêu cầu Xin Gia hạn Deadline"
        footer={
          <>
            <Button variant="ghost" onClick={() => setExtendModalOpen(false)}>
              Hủy
            </Button>
            <Button variant="primary" onClick={handleRequestExtension}>
              Gửi Yêu cầu Gia hạn
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Hạn chót đề xuất mới *"
            type="date"
            value={newDeadline}
            onChange={(e) => setNewDeadline(e.target.value)}
          />
          <Textarea
            label="Lý do xin gia hạn (Bắt buộc) *"
            rows={4}
            placeholder="Nêu rõ khó khăn kỹ thuật hoặc lý do công quan..."
            value={extendReason}
            onChange={(e) => setExtendReason(e.target.value)}
          />
        </div>
      </Modal>

      {/* Modal: GV Revision Request */}
      <Modal
        open={revisionModalOpen}
        onClose={() => setRevisionModalOpen(false)}
        title="Yêu cầu Sinh viên Chỉnh sửa Milestone"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRevisionModalOpen(false)}>
              Hủy
            </Button>
            <Button variant="danger" onClick={handleRequestRevision}>
              Gửi Yêu cầu Chỉnh sửa
            </Button>
          </>
        }
      >
        <Textarea
          label="Nhận xét & Yêu cầu chỉnh sửa cụ thể *"
          rows={5}
          placeholder="Chỉ ra các điểm chưa đạt trong minh chứng..."
          value={revisionComment}
          onChange={(e) => setRevisionComment(e.target.value)}
        />
      </Modal>
    </div>
  );
}

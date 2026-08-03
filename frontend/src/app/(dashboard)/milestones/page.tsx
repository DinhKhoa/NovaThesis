"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import {
  CalendarCheck,
  CheckCircle,
  Clock,
  ClockCounterClockwise,
  DotsSixVertical,
  FilePdf,
  Plus,
  Prohibit,
  Robot,
  Sparkle,
  Trash,
  UploadSimple,
  Warning,
  XCircle,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/layout";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dropdown,
  DropdownItem,
  DropdownSeparator,
  EmptyState,
  Input,
  Modal,
  SegmentedControl,
  Select,
  Skeleton,
  Table,
  Textarea,
  useMounted,
} from "@/components/ui";
import { useAuthStore, isLecturer } from "@/lib/auth";
import { isReadOnlyViewer } from "@/lib/permissions";
import { toast } from "@/lib/toast";
import { aiPanel } from "@/lib/ai-panel";
import { isApiError } from "@/lib/api";
import { useAsync, useSelection } from "@/lib/use-async";
import { checkTransition, STATUS_LABELS, TRANSITION_TOASTS } from "@/lib/milestone-fsm";
import { useBoardDrag } from "@/lib/use-board-drag";
import {
  aiApi,
  feedbacksApi,
  milestonesApi,
  reportsApi,
  thesesApi,
  type Milestone,
  type MilestoneHistoryEntry,
  type MilestoneStatus,
} from "@/lib/services";
import { daysUntil, formatDate, formatDateTime, toDateInputValue } from "@/lib/format";

const statusColumns: {
  key: MilestoneStatus;
  label: string;
  variant: "neutral" | "info" | "warning" | "success" | "danger";
}[] = [
  { key: "NOT_STARTED", label: STATUS_LABELS.NOT_STARTED, variant: "neutral" },
  { key: "ONGOING", label: STATUS_LABELS.ONGOING, variant: "info" },
  { key: "PENDING_APPROVAL", label: STATUS_LABELS.PENDING_APPROVAL, variant: "warning" },
  { key: "REVISION_REQUIRED", label: STATUS_LABELS.REVISION_REQUIRED, variant: "danger" },
  { key: "COMPLETED", label: STATUS_LABELS.COMPLETED, variant: "success" },
];

const COLUMN_ORDER = statusColumns.map((c) => c.key) as readonly MilestoneStatus[];

export default function MilestonesPage() {
  const { user } = useAuthStore();
  const searchParams = useSearchParams();
  const thesisParam = searchParams.get("thesis");

  const [viewMode, setViewMode] = React.useState<"kanban" | "list">("kanban");
  const [pickedThesisId, setThesisId] = React.useState<number | null>(
    thesisParam ? Number(thesisParam) : null
  );

  /* Danh sách đề tài để chọn phạm vi. Giảng viên hướng dẫn nhiều đề tài cùng
     lúc; gộp hết mốc của mọi đề tài vào một bảng Kanban thì cột nào cũng đầy
     và không còn đọc được. */
  const { data: theses } = useAsync(() => thesesApi.list({ per_page: 100 }), []);
  const thesisOptions = theses?.data ?? [];

  /* Suy ra lúc render thay vì đồng bộ bằng useEffect: cách kia tốn thêm một
     lượt render và một khoảnh khắc bảng Kanban hiện rỗng trước khi tự chọn. */
  const thesisId = pickedThesisId ?? thesisOptions[0]?.id ?? null;

  const { data, loading, error, refetch, setData } = useAsync(
    () => milestonesApi.list({ per_page: 100, ...(thesisId ? { thesis_id: thesisId } : {}) }),
    [thesisId],
    { enabled: thesisId !== null }
  );

  const milestones = React.useMemo(
    () => [...(data?.data ?? [])].sort((a, b) => a.order_index - b.order_index),
    [data]
  );

  /* ---- Modal state ---- */
  const [createOpen, setCreateOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Milestone | null>(null);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [extendOpen, setExtendOpen] = React.useState(false);
  const [revisionOpen, setRevisionOpen] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [aiReviewOpen, setAiReviewOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<Milestone | null>(null);
  const [exportingPdf, setExportingPdf] = React.useState(false);

  const replaceMilestone = React.useCallback(
    (updated: Milestone) => {
      setData((prev) =>
        prev ? { ...prev, data: prev.data.map((m) => (m.id === updated.id ? updated : m)) } : prev
      );
    },
    [setData]
  );

  /* ---- Đổi trạng thái (UC 4.8) ------------------------------------------
     Server là trọng tài cuối cùng. Ta cập nhật lạc quan để bảng phản hồi tức
     thì, nhưng nếu FSM phía server từ chối thì trả lại đúng bản ghi cũ — chứ
     không giữ một trạng thái mà cơ sở dữ liệu không hề có. */
  const handleStatusChange = React.useCallback(
    async (id: number, next: MilestoneStatus) => {
      const before = milestones.find((m) => m.id === id);
      if (!before || before.status === next) return;

      setData((prev) =>
        prev
          ? { ...prev, data: prev.data.map((m) => (m.id === id ? { ...m, status: next } : m)) }
          : prev
      );

      try {
        const updated = await milestonesApi.setStatus(id, next);
        replaceMilestone(updated);
        toast.success(TRANSITION_TOASTS[next] ?? "Đã cập nhật trạng thái.");
      } catch (err) {
        replaceMilestone(before);
        toast.error(isApiError(err) ? err.message : "Không đổi được trạng thái.");
      }
    },
    [milestones, setData, replaceMilestone]
  );

  /* Quản trị viên xem tiến độ ở chế độ chỉ đọc — xem `lib/permissions.ts`. */
  const readOnly = isReadOnlyViewer(user);

  const canDrop = React.useCallback(
    (id: string, from: MilestoneStatus, to: MilestoneStatus) => {
      if (readOnly) {
        return {
          allowed: false as const,
          reason: "Quản trị viên xem ở chế độ chỉ đọc, không đổi được trạng thái mốc.",
        };
      }
      const m = milestones.find((x) => String(x.id) === id);
      if (!m) return { allowed: false as const, reason: "Không tìm thấy mốc." };
      return checkTransition(from, to, user?.role, m);
    },
    [milestones, user?.role, readOnly]
  );

  const board = useBoardDrag<MilestoneStatus>({
    columns: COLUMN_ORDER,
    canDrop,
    onDrop: (id, _from, to) => void handleStatusChange(Number(id), to),
    onReject: (reason) => toast.error(reason),
  });

  const mounted = useMounted();

  const handleExportPdf = async () => {
    if (!thesisId) return;
    setExportingPdf(true);
    try {
      await reportsApi.download(
        `/reports/progress/${thesisId}/pdf`,
        `Bao_cao_tien_do_${thesisId}.pdf`
      );
      toast.success("Đã tải báo cáo tiến độ.");
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Không xuất được báo cáo.");
    } finally {
      setExportingPdf(false);
    }
  };

  const overdue = milestones.filter(
    (m) => m.status !== "COMPLETED" && daysUntil(m.deadline) < 0
  ).length;

  return (
    <div>
      <PageHeader
        title="Tiến độ"
        description="Các mốc công việc của đề tài, hạn nộp và trạng thái phê duyệt."
        meta={overdue > 0 ? <Badge variant="danger">{overdue} mốc quá hạn</Badge> : undefined}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              icon={<FilePdf size={15} />}
              loading={exportingPdf}
              disabled={!thesisId}
              onClick={() => void handleExportPdf()}
            >
              Xuất PDF
            </Button>
            {!readOnly && (
              <Button
                variant="primary"
                icon={<Plus size={15} />}
                disabled={!thesisId}
                onClick={() => setCreateOpen(true)}
              >
                Thêm mốc
              </Button>
            )}
          </div>
        }
      />

      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <SegmentedControl
          value={viewMode}
          onChange={setViewMode}
          options={[
            { value: "kanban", label: "Dạng bảng" },
            { value: "list", label: "Danh sách" },
          ]}
        />

        {thesisOptions.length > 1 && (
          <Select
            value={thesisId ?? ""}
            onChange={(e) => setThesisId(Number(e.target.value))}
            className="w-auto max-w-sm"
            aria-label="Chọn đề tài"
          >
            {thesisOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </Select>
        )}
      </div>

      {error ? (
        <EmptyState
          icon={<Warning size={16} />}
          title="Không tải được mốc tiến độ"
          description={error}
          action={
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
        />
      ) : loading && !data ? (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {COLUMN_ORDER.map((c) => (
            <Skeleton key={c} className="h-72 rounded-lg" />
          ))}
        </div>
      ) : thesisId === null ? (
        <EmptyState
          icon={<CalendarCheck size={16} />}
          title="Chưa có đề tài nào"
          description="Mốc tiến độ thuộc về một đề tài. Hãy tạo hoặc tham gia một đề tài trước."
        />
      ) : viewMode === "kanban" ? (
        <div className="flex gap-3 overflow-x-auto pb-4 items-start">
          {statusColumns.map((col) => {
            const items = milestones.filter((m) => m.status === col.key);
            const state = board.columnState(col.key);

            return (
              <div key={col.key} className="flex flex-col gap-2 w-[280px] min-w-[280px] flex-shrink-0">
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
                  {items.map((m) => {
                    const late = m.status !== "COMPLETED" && daysUntil(m.deadline) < 0;
                    return (
                      <Card
                        key={m.id}
                        hoverable={false}
                        data-dragging={board.activeItemId === String(m.id) ? "true" : undefined}
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
                            <span className="drag-grip -ml-1 mt-px flex-shrink-0" aria-hidden="true">
                              <DotsSixVertical size={14} weight="bold" />
                            </span>
                            <h3 className="text-[13px] font-semibold leading-snug">{m.name}</h3>
                          </div>
                          {m.description && (
                            <p className="text-[12px] text-tertiary line-clamp-2 mb-2.5 leading-relaxed">
                              {m.description}
                            </p>
                          )}
                        </div>

                        <div>
                          {m.status === "REVISION_REQUIRED" && m.description_revision && (
                            <div className="text-[11px] text-danger mb-2 bg-[var(--danger-bg)] p-1.5 rounded-md line-clamp-2">
                              {m.description_revision}
                            </div>
                          )}

                          {m.evidence_filename && (
                            <div className="flex items-center gap-1.5 text-[11px] text-accent mb-2 bg-[var(--accent-subtle)] p-1.5 rounded-md">
                              <UploadSimple size={14} />
                              <span className="truncate">{m.evidence_filename}</span>
                            </div>
                          )}

                          {m.extension_requested && m.extension_status === "PENDING" && (
                            <div className="flex items-center gap-1.5 text-[11px] text-warning mb-2 bg-[var(--warning-bg)] p-1.5 rounded-md">
                              <Clock size={14} />
                              <span>Xin gia hạn → {formatDate(m.extension_new_deadline)}</span>
                            </div>
                          )}

                          <div className="flex items-center justify-between text-[11px] text-tertiary pt-2 border-t border-[var(--border-secondary)]">
                            <span
                              className={`flex items-center gap-1 tnum ${late ? "text-danger font-medium" : ""}`}
                            >
                              <Clock size={14} /> {formatDate(m.deadline)}
                            </span>

                            <MilestoneActions
                              milestone={m}
                              isLecturer={isLecturer(user)}
                              readOnly={readOnly}
                              onUpload={() => {
                                setSelected(m);
                                setUploadOpen(true);
                              }}
                              onExtend={() => {
                                setSelected(m);
                                setExtendOpen(true);
                              }}
                              onRevision={() => {
                                setSelected(m);
                                setRevisionOpen(true);
                              }}
                              onHistory={() => {
                                setSelected(m);
                                setHistoryOpen(true);
                              }}
                              onApprove={() => void handleStatusChange(m.id, "COMPLETED")}
                              onDelete={() => setDeleteTarget(m)}
                              onAskAi={() => aiPanel.openWithMilestone(m.id, m.thesis_id)}
                              onAiReview={() => {
                                setSelected(m);
                                setAiReviewOpen(true);
                              }}
                              onReviewExtension={async (approve) => {
                                try {
                                  const updated = await milestonesApi.reviewExtension(m.id, approve);
                                  replaceMilestone(updated);
                                  toast.success(
                                    approve ? "Đã duyệt gia hạn." : "Đã từ chối yêu cầu gia hạn."
                                  );
                                } catch (err) {
                                  toast.error(
                                    isApiError(err) ? err.message : "Thao tác thất bại."
                                  );
                                }
                              }}
                            />
                          </div>
                        </div>
                      </Card>
                    );
                  })}

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
      ) : (
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
            emptyState={
              <EmptyState
                compact
                icon={<CalendarCheck size={16} />}
                title="Chưa có mốc tiến độ nào"
                description="Tạo mốc đầu tiên, hoặc để trợ lý AI đề xuất một lộ trình."
              />
            }
            columns={[
              {
                key: "name",
                header: "Mốc tiến độ",
                sortValue: (m) => m.order_index,
                render: (m) => (
                  <div className="min-w-0 py-0.5">
                    <p className="text-[13px] font-medium truncate max-w-[28rem]">{m.name}</p>
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
                    <span className="chip max-w-[12rem] truncate">{m.evidence_filename}</span>
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
                render: (m) => {
                  const late = m.status !== "COMPLETED" && daysUntil(m.deadline) < 0;
                  return (
                    <span
                      className={`text-[12.5px] tnum whitespace-nowrap ${late ? "text-danger font-medium" : "text-tertiary"}`}
                    >
                      {formatDate(m.deadline)}
                    </span>
                  );
                },
              },
              {
                key: "status",
                header: "Trạng thái",
                width: "1%",
                sortValue: (m) => m.status,
                render: (m) => {
                  /* Server đã trả sẵn `allowed_targets` tính từ chính bảng FSM
                     của nó, nên danh sách này không thể lệch khỏi thứ server
                     chấp nhận. Tính lại ở client là tạo ra nguồn sự thật thứ hai. */
                  const targets = m.allowed_targets ?? [];
                  return (
                    <Select
                      value={m.status}
                      aria-label={`Trạng thái của ${m.name}`}
                      className="w-auto"
                      disabled={targets.length === 0}
                      onChange={(e) =>
                        void handleStatusChange(m.id, e.target.value as MilestoneStatus)
                      }
                    >
                      {statusColumns.map((col) => (
                        <option
                          key={col.key}
                          value={col.key}
                          disabled={col.key !== m.status && !targets.includes(col.key)}
                        >
                          {col.label}
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

      <CreateMilestoneModal
        open={createOpen}
        thesisId={thesisId}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          void refetch();
        }}
      />

      {/* `key` đổi mỗi lần mở/đóng nên React dựng lại modal với state sạch.
          Đây là cách React khuyến nghị để "reset state theo prop", thay cho một
          useEffect gọi ba lần setState — vốn tốn thêm một lượt render và để lộ
          giá trị cũ trong khoảnh khắc đầu tiên modal xuất hiện. */}
      <EvidenceModal
        key={`evidence-${uploadOpen}-${selected?.id ?? 0}`}
        open={uploadOpen}
        milestone={selected}
        onClose={() => setUploadOpen(false)}
        onDone={(updated) => {
          replaceMilestone(updated);
          setUploadOpen(false);
        }}
      />

      <ExtensionModal
        key={`extension-${extendOpen}-${selected?.id ?? 0}`}
        open={extendOpen}
        milestone={selected}
        onClose={() => setExtendOpen(false)}
        onDone={(updated) => {
          replaceMilestone(updated);
          setExtendOpen(false);
        }}
      />

      <RevisionModal
        key={`revision-${revisionOpen}-${selected?.id ?? 0}`}
        open={revisionOpen}
        milestone={selected}
        onClose={() => setRevisionOpen(false)}
        onDone={(updated) => {
          replaceMilestone(updated);
          setRevisionOpen(false);
        }}
      />

      <HistoryModal
        open={historyOpen}
        milestone={selected}
        onClose={() => setHistoryOpen(false)}
      />

      {/* `key` gắn với mốc đang chọn: modal giữ state cục bộ (nội dung đã sửa),
          và mở mốc thứ hai mà không dựng lại sẽ hiện nguyên bản nháp của mốc
          trước. Cùng lý do đã dùng cho ba modal phía trên. */}
      <AIReviewModal
        key={`ai-review-${aiReviewOpen}-${selected?.id ?? 0}`}
        open={aiReviewOpen}
        milestone={selected}
        onClose={() => setAiReviewOpen(false)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Xóa mốc tiến độ?"
        confirmLabel="Xóa"
        message={
          <>
            Mốc <strong className="text-primary">{deleteTarget?.name}</strong> sẽ bị ẩn khỏi bảng
            tiến độ. Lịch sử thay đổi vẫn được giữ để kiểm toán.
          </>
        }
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await milestonesApi.remove(deleteTarget.id);
            toast.success("Đã xóa mốc tiến độ.");
            setDeleteTarget(null);
            void refetch();
          } catch (err) {
            toast.error(isApiError(err) ? err.message : "Xóa thất bại");
          }
        }}
      />
    </div>
  );
}

/* ==========================================================================
   THAO TÁC TRÊN THẺ
   ========================================================================== */

function MilestoneActions({
  milestone,
  isLecturer,
  readOnly = false,
  onUpload,
  onExtend,
  onRevision,
  onHistory,
  onApprove,
  onDelete,
  onReviewExtension,
  onAskAi,
  onAiReview,
}: {
  milestone: Milestone;
  isLecturer: boolean;
  /** Quản trị viên: chỉ còn xem được lịch sử thay đổi. */
  readOnly?: boolean;
  onUpload: () => void;
  onExtend: () => void;
  onRevision: () => void;
  onHistory: () => void;
  onApprove: () => void;
  onDelete: () => void;
  onReviewExtension: (approve: boolean) => void;
  onAskAi: () => void;
  onAiReview: () => void;
}) {
  const pendingExtension = milestone.extension_requested && milestone.extension_status === "PENDING";

  /* Chỉ còn đúng một mục thì cả cụm "Thao tác" là thừa — đổi thẳng thành nút
     mở lịch sử, người dùng bớt được một cú bấm. */
  if (readOnly) {
    return (
      <button
        className="btn-ghost p-1 rounded hover:text-primary text-[12px] flex items-center gap-1"
        onClick={onHistory}
      >
        <ClockCounterClockwise size={14} /> Lịch sử
      </button>
    );
  }

  return (
    <Dropdown
      align="right"
      trigger={
        <button className="btn-ghost p-1 rounded hover:text-primary text-[12px]">Thao tác</button>
      }
    >
      {/* Hỏi trợ lý NGAY TẠI MỐC. Ngăn kéo mở ra đã biết mốc này yêu cầu gì,
          hạn khi nào, và đọc sẵn minh chứng đã nộp làm nguồn — nên câu hỏi đầu
          tiên không phải là "mốc nào?" mà đã là câu hỏi thật. */}
      <DropdownItem
        icon={<Robot size={16} />}
        onClick={onAskAi}
      >
        Hỏi AI về mốc này
      </DropdownItem>
      <DropdownSeparator />

      {!isLecturer && (
        <>
          <DropdownItem icon={<UploadSimple size={16} />} onClick={onUpload}>
            Nộp minh chứng
          </DropdownItem>
          <DropdownItem icon={<CalendarCheck size={16} />} onClick={onExtend}>
            Xin gia hạn
          </DropdownItem>
        </>
      )}

      {isLecturer && (
        <>
          {pendingExtension && (
            <>
              <DropdownItem
                icon={<CheckCircle size={16} />}
                onClick={() => onReviewExtension(true)}
              >
                Duyệt gia hạn → {formatDate(milestone.extension_new_deadline)}
              </DropdownItem>
              <DropdownItem danger icon={<XCircle size={16} />} onClick={() => onReviewExtension(false)}>
                Từ chối gia hạn
              </DropdownItem>
              <DropdownSeparator />
            </>
          )}
          {/* Bản nháp nhận xét của trợ lý. Chỉ có nghĩa khi đã có minh chứng
              để đọc — mốc chưa nộp gì thì không có gì để đối chiếu. */}
          {milestone.evidence_filename && (
            <>
              <DropdownItem icon={<Sparkle size={16} />} onClick={onAiReview}>
                Nhận xét sơ bộ của AI
              </DropdownItem>
              <DropdownSeparator />
            </>
          )}

          {milestone.status === "PENDING_APPROVAL" && (
            <>
              <DropdownItem icon={<CheckCircle size={16} />} onClick={onApprove}>
                Duyệt hoàn thành
              </DropdownItem>
              <DropdownItem danger icon={<XCircle size={16} />} onClick={onRevision}>
                Yêu cầu sửa
              </DropdownItem>
              <DropdownSeparator />
            </>
          )}
        </>
      )}

      <DropdownItem icon={<ClockCounterClockwise size={16} />} onClick={onHistory}>
        Lịch sử thay đổi
      </DropdownItem>
      <DropdownSeparator />
      <DropdownItem danger icon={<Trash size={16} />} onClick={onDelete}>
        Xóa mốc
      </DropdownItem>
    </Dropdown>
  );
}

/* ==========================================================================
   MODAL
   ========================================================================== */

function CreateMilestoneModal({
  open,
  thesisId,
  onClose,
  onCreated,
}: {
  open: boolean;
  thesisId: number | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [deadline, setDeadline] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const submit = async () => {
    if (!thesisId) return;
    if (!name.trim() || !deadline) {
      toast.error("Vui lòng nhập tên mốc và hạn chót.");
      return;
    }
    setSaving(true);
    try {
      await milestonesApi.create({
        thesis_id: thesisId,
        name: name.trim(),
        description: description.trim() || undefined,
        deadline,
      });
      toast.success("Đã tạo mốc tiến độ.");
      setName("");
      setDescription("");
      setDeadline("");
      onCreated();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Không tạo được mốc.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Tạo mốc tiến độ mới"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Hủy
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void submit()}>
            Tạo mốc
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          label="Tên mốc tiến độ *"
          placeholder="Ví dụ: Nộp báo cáo đề cương"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          label="Hạn chót *"
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          min={toDateInputValue(new Date())}
        />
        <Textarea
          label="Mô tả công việc & sản phẩm cần nộp"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
    </Modal>
  );
}

function EvidenceModal({
  open,
  milestone,
  onClose,
  onDone,
}: {
  open: boolean;
  milestone: Milestone | null;
  onClose: () => void;
  onDone: (m: Milestone) => void;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [progress, setProgress] = React.useState(0);
  const [uploading, setUploading] = React.useState(false);

  const submit = async () => {
    if (!milestone || !file) {
      toast.error("Vui lòng chọn tệp minh chứng.");
      return;
    }
    setUploading(true);
    try {
      const updated = await milestonesApi.uploadEvidence(milestone.id, file, true, setProgress);
      toast.success("Đã nộp minh chứng và gửi duyệt.");
      onDone(updated);
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Tải lên thất bại.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Nộp minh chứng: ${milestone?.name ?? ""}`}
      description="Sau khi nộp, mốc sẽ chuyển sang trạng thái Chờ phê duyệt."
      footer={
        <>
          {/* Hỏi trợ lý TRƯỚC KHI nộp, không phải sau. Đây là thời điểm duy nhất
              sinh viên còn sửa được bài: sau khi bấm gửi duyệt, mốc đã sang tay
              giảng viên. Ngăn kéo mở ra đã biết mốc này yêu cầu gì và đọc sẵn
              minh chứng của những lần nộp trước. */}
          {milestone && (
            <Button
              variant="ghost"
              icon={<Robot size={15} />}
              onClick={() => aiPanel.openWithMilestone(milestone.id, milestone.thesis_id)}
            >
              Hỏi AI về mốc này
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Hủy
          </Button>
          <Button variant="primary" loading={uploading} disabled={!file} onClick={() => void submit()}>
            Tải lên &amp; gửi duyệt
          </Button>
        </>
      }
    >
      <label
        className="flex flex-col items-center justify-center gap-1.5 py-8 px-4 rounded-[10px] text-center cursor-pointer transition-colors hover:border-[var(--accent)]"
        style={{ border: "1px dashed var(--border-strong)", background: "var(--bg-subtle)" }}
      >
        <UploadSimple size={22} className="text-tertiary" />
        <span className="text-[13px] font-medium">
          {file ? file.name : "Kéo thả tệp vào đây hoặc bấm để chọn"}
        </span>
        <span className="text-[12px] text-tertiary">PDF, DOCX, ZIP hoặc ảnh · tối đa 10 MB</span>
        <input
          type="file"
          className="sr-only"
          accept=".pdf,.doc,.docx,.zip,.png,.jpg,.jpeg,.txt"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>

      {uploading && (
        <div className="mt-3">
          <div className="h-1 rounded-full overflow-hidden bg-[var(--bg-hover)]">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${progress}%`, background: "var(--accent)" }}
            />
          </div>
          <p className="text-[11.5px] text-tertiary mt-1 tnum">{progress}%</p>
        </div>
      )}
    </Modal>
  );
}

function ExtensionModal({
  open,
  milestone,
  onClose,
  onDone,
}: {
  open: boolean;
  milestone: Milestone | null;
  onClose: () => void;
  onDone: (m: Milestone) => void;
}) {
  const [newDeadline, setNewDeadline] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const submit = async () => {
    if (!milestone) return;
    if (!newDeadline || !reason.trim()) {
      toast.error("Vui lòng nhập hạn mới và lý do xin gia hạn.");
      return;
    }
    setSaving(true);
    try {
      const updated = await milestonesApi.requestExtension(
        milestone.id,
        newDeadline,
        reason.trim()
      );
      toast.success("Đã gửi yêu cầu gia hạn tới giảng viên.");
      onDone(updated);
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Gửi yêu cầu thất bại.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Xin gia hạn deadline"
      description={milestone ? `Hạn hiện tại: ${formatDate(milestone.deadline)}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Hủy
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void submit()}>
            Gửi yêu cầu
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
          min={milestone ? toDateInputValue(milestone.deadline) : undefined}
        />
        <Textarea
          label="Lý do xin gia hạn *"
          rows={4}
          placeholder="Nêu rõ khó khăn kỹ thuật hoặc lý do khách quan…"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          helperText="Giảng viên sẽ nhận được thông báo và email ngay lập tức."
        />
      </div>
    </Modal>
  );
}

function RevisionModal({
  open,
  milestone,
  onClose,
  onDone,
}: {
  open: boolean;
  milestone: Milestone | null;
  onClose: () => void;
  onDone: (m: Milestone) => void;
}) {
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const submit = async () => {
    if (!milestone) return;
    if (!note.trim()) {
      toast.error("Vui lòng nhập nhận xét để sinh viên biết cần sửa gì.");
      return;
    }
    setSaving(true);
    try {
      const updated = await milestonesApi.requestRevision(milestone.id, note.trim());
      toast.warning("Đã gửi yêu cầu chỉnh sửa cho sinh viên.");
      onDone(updated);
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Thao tác thất bại.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Yêu cầu sinh viên chỉnh sửa"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Hủy
          </Button>
          <Button variant="danger" loading={saving} onClick={() => void submit()}>
            Gửi yêu cầu
          </Button>
        </>
      }
    >
      <Textarea
        label="Nhận xét & yêu cầu cụ thể *"
        rows={5}
        placeholder="Chỉ ra các điểm chưa đạt trong minh chứng…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
    </Modal>
  );
}

/* ==========================================================================
   NHẬN XÉT SƠ BỘ CỦA AI

   Bản nháp do trợ lý sinh khi sinh viên gửi mốc đi duyệt (xem
   `backend/src/lib/milestone-review.ts`). Nó KHÔNG phải một phản hồi đã gửi:
   sinh viên không thấy nó ở đâu cả cho tới khi giảng viên bấm "Chép sang phản
   hồi" — và lúc đó thứ được gửi mang tên giảng viên, sau khi họ đã đọc và sửa.

   Đó là ranh giới quan trọng nhất của tính năng này. Đăng thẳng nhận xét của mô
   hình lên luồng trao đổi là để một bản đánh giá không ai chịu trách nhiệm đi
   thẳng tới người học.
   ========================================================================== */

function AIReviewModal({
  open,
  milestone,
  onClose,
}: {
  open: boolean;
  milestone: Milestone | null;
  onClose: () => void;
}) {
  const { data, loading, error, refetch } = useAsync(
    () => milestonesApi.aiReview(milestone?.id ?? 0),
    [milestone?.id, open],
    { enabled: open && !!milestone }
  );

  /* Nội dung soạn thảo được, khởi tạo từ bản nháp. `useSelection` cho phép
     "lấy giá trị tải về cho tới khi người dùng tự sửa" mà không cần một effect
     đồng bộ — đúng mẫu đã dùng ở các trang khác. */
  const [edited, setEdited] = useSelection<string>(data?.content ?? null);

  const [generating, setGenerating] = React.useState(false);
  const [sending, setSending] = React.useState(false);

  const regenerate = async () => {
    if (!milestone) return;
    setGenerating(true);
    try {
      await aiApi.milestoneReview(milestone.id);
      setEdited(null); // Bản nháp mới thay chỗ bản đang sửa.
      await refetch();
      toast.success("Trợ lý đã viết lại bản nháp nhận xét.");
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Không tạo được bản nháp nhận xét.");
    } finally {
      setGenerating(false);
    }
  };

  const copyToFeedback = async () => {
    const content = (edited ?? data?.content ?? "").trim();
    if (!milestone || !content) return;
    setSending(true);
    try {
      await feedbacksApi.create({ milestone_id: milestone.id, content });
      toast.success("Đã gửi nhận xét cho sinh viên dưới tên bạn.");
      onClose();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Không gửi được phản hồi.");
    } finally {
      setSending(false);
    }
  };

  const content = edited ?? data?.content ?? "";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nhận xét sơ bộ của AI"
      description={milestone?.name}
      width="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Đóng
          </Button>
          <Button
            variant="secondary"
            icon={<Sparkle size={15} />}
            loading={generating}
            disabled={!milestone}
            onClick={() => void regenerate()}
          >
            {data ? "Viết lại" : "Tạo bản nháp"}
          </Button>
          <Button
            variant="primary"
            loading={sending}
            disabled={!content.trim()}
            onClick={() => void copyToFeedback()}
          >
            Chép sang phản hồi
          </Button>
        </>
      }
    >
      {loading ? (
        <Skeleton className="h-48 rounded-md" />
      ) : error ? (
        <EmptyState
          icon={<Warning size={15} />}
          title="Không tải được bản nháp"
          description={error}
          action={
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
        />
      ) : !data ? (
        <EmptyState
          compact
          icon={<Sparkle size={15} />}
          title="Chưa có bản nháp nào"
          description="Trợ lý tự viết bản nháp khi sinh viên gửi mốc đi duyệt. Bấm “Tạo bản nháp” để chạy ngay bây giờ."
        />
      ) : (
        <>
          <p className="text-[12.5px] text-tertiary mb-2">
            Bản nháp do trợ lý đọc minh chứng và đối chiếu với yêu cầu của mốc.{" "}
            <strong className="text-secondary">Sinh viên chưa nhìn thấy nội dung này.</strong> Sửa
            lại theo ý bạn rồi bấm “Chép sang phản hồi” để gửi đi dưới tên bạn.
          </p>

          <Textarea
            label="Nội dung nhận xét"
            rows={12}
            value={content}
            onChange={(e) => setEdited(e.target.value)}
          />

          <p className="text-[11.5px] text-muted tnum mt-1.5">
            Trợ lý viết lúc {formatDateTime(data.created_at)}
          </p>
        </>
      )}
    </Modal>
  );
}

function HistoryModal({
  open,
  milestone,
  onClose,
}: {
  open: boolean;
  milestone: Milestone | null;
  onClose: () => void;
}) {
  const { data, loading } = useAsync(
    () => milestonesApi.history(milestone?.id ?? 0),
    [milestone?.id, open],
    { enabled: open && !!milestone }
  );

  const entries: MilestoneHistoryEntry[] = data ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Lịch sử thay đổi"
      description={milestone?.name}
      width="max-w-lg"
      footer={
        <Button variant="ghost" onClick={onClose}>
          Đóng
        </Button>
      }
    >
      {loading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 rounded-md" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className="text-[13px] text-tertiary">Chưa có thay đổi nào được ghi nhận.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {entries.map((h) => (
            <li key={h.id} className="border-l-2 border-[var(--accent)] pl-3">
              <p className="text-[13px]">
                <span className="font-medium">{h.changed_by_name}</span>{" "}
                <span className="text-tertiary">
                  đổi {h.field_name === "status" ? "trạng thái" : h.field_name}
                </span>{" "}
                {h.old_value && (
                  <>
                    từ{" "}
                    <span className="chip">
                      {STATUS_LABELS[h.old_value as MilestoneStatus] ?? h.old_value}
                    </span>{" "}
                  </>
                )}
                {h.new_value && (
                  <>
                    thành{" "}
                    <span className="chip">
                      {STATUS_LABELS[h.new_value as MilestoneStatus] ?? h.new_value}
                    </span>
                  </>
                )}
              </p>
              {h.note && <p className="text-[12px] text-tertiary mt-0.5">{h.note}</p>}
              <span className="text-[11.5px] text-muted tnum">{formatDateTime(h.created_at)}</span>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}

"use client";

import React from "react";
import {
  CheckCircle,
  IdentificationCard,
  Image as ImageIcon,
  Warning,
  XCircle,
} from "@phosphor-icons/react";
import { PageHeader, Toolbar } from "@/components/layout";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  Select,
  Table,
  Textarea,
} from "@/components/ui";
import { toast } from "@/lib/toast";
import { isApiError } from "@/lib/api";
import { useAsync } from "@/lib/use-async";
import { adminApi, type LecturerApplication } from "@/lib/services";
import { formatDate, formatRelative } from "@/lib/format";

/* ==========================================================================
   DUYỆT ĐƠN ĐĂNG KÝ GIẢNG VIÊN

   Khác trang Người dùng ở chỗ nó KHÔNG quản lý tài khoản đang có, mà xử lý một
   hàng đợi: mỗi dòng là một quyết định chưa được đưa ra. Vì vậy mặc định chỉ
   hiện đơn còn chờ, và cả hai nút hành động đều đi qua một bước xác nhận —
   duyệt nhầm là cấp quyền giảng viên cho người lạ, từ chối nhầm là gửi đi một
   email không rút lại được.
   ========================================================================== */

const PER_PAGE = 20;

type StatusFilter = "pending" | "all";

/** Trạng thái của một lá đơn, suy ra từ tài khoản đứng sau nó. */
function applicationState(
  app: LecturerApplication
): { label: string; variant: "warning" | "success" | "danger" } {
  if (app.status === "PENDING_VERIFICATION") {
    /* Đơn bị từ chối vẫn giữ nguyên `status` và chỉ được đánh dấu xoá mềm; API
       không trả `deleted_at` ra ngoài, nên `application_note` — thứ chỉ được
       ghi đúng lúc từ chối — là dấu hiệu phân biệt. */
    return app.application_note !== null
      ? { label: "Đã từ chối", variant: "danger" }
      : { label: "Chờ duyệt", variant: "warning" };
  }
  return { label: "Đã duyệt", variant: "success" };
}

export default function LecturerApplicationsPage() {
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("pending");
  const [page, setPage] = React.useState(1);

  /* Đổi bộ lọc thì quay về trang 1 — chỉnh ngay trong lúc render như
     `admin/users/page.tsx`, để useAsync không bắn đi một request với số trang cũ
     mà kết quả chắc chắn bị vứt bỏ. */
  const [prevFilter, setPrevFilter] = React.useState(statusFilter);
  if (prevFilter !== statusFilter) {
    setPrevFilter(statusFilter);
    setPage(1);
  }

  const { data, loading, error, refetch } = useAsync(
    () => adminApi.lecturerApplications({ page, per_page: PER_PAGE, status: statusFilter }),
    [page, statusFilter]
  );

  const applications = data?.data ?? [];

  const [selected, setSelected] = React.useState<LecturerApplication | null>(null);
  const [imageOpen, setImageOpen] = React.useState(false);
  const [approveOpen, setApproveOpen] = React.useState(false);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const handleApprove = async () => {
    if (!selected) return;

    setBusy(true);
    try {
      const result = await adminApi.approveLecturerApplication(selected.user_id);
      toast.success(
        `Đã duyệt ${result.application.full_name}. Mật khẩu tạm đã được gửi tới ${result.application.email}.`
      );
      setApproveOpen(false);
      // Luôn tải lại thay vì sửa dòng tại chỗ: ở bộ lọc "Chờ duyệt", dòng vừa xử
      // lý không còn thuộc danh sách nữa, và giữ nó lại là một bảng tự mâu thuẫn.
      void refetch();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Không duyệt được đơn đăng ký.");
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!selected) return;

    setBusy(true);
    try {
      const reason = rejectReason.trim();
      const result = await adminApi.rejectLecturerApplication(
        selected.user_id,
        reason || undefined
      );
      toast.success(`Đã từ chối đơn của ${result.application.full_name}.`);
      setRejectOpen(false);
      setRejectReason("");
      void refetch();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Không từ chối được đơn đăng ký.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Yêu cầu giảng viên"
        description="Đơn xin phê duyệt tài khoản giảng viên."
      />

      <Card hoverable={false} className="overflow-hidden">
        <Toolbar>
          <div className="sm:ml-auto">
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="w-auto"
              aria-label="Lọc đơn đăng ký"
            >
              <option value="pending">Đang chờ duyệt</option>
              <option value="all">Tất cả đơn</option>
            </Select>
          </div>
        </Toolbar>

        {error ? (
          <EmptyState
            icon={<Warning size={16} />}
            title="Không tải được danh sách đơn đăng ký"
            description={error}
            action={
              <Button variant="secondary" size="sm" onClick={() => void refetch()}>
                Thử lại
              </Button>
            }
          />
        ) : (
          <Table
            data={applications}
            loading={loading}
            keyExtractor={(a) => String(a.user_id)}
            pageSize={PER_PAGE}
            emptyState={
              <EmptyState
                compact
                icon={<IdentificationCard size={15} />}
                title="Không có đơn nào"
                description={
                  statusFilter === "pending"
                    ? "Mọi yêu cầu đăng ký giảng viên đều đã được xử lý."
                    : "Chưa có ai gửi yêu cầu đăng ký tài khoản giảng viên."
                }
              />
            }
            columns={[
              {
                key: "full_name",
                header: "Người nộp đơn",
                sortValue: (a) => a.full_name,
                render: (a) => (
                  <div className="min-w-0 py-0.5">
                    <p className="text-[13px] font-medium leading-tight truncate">
                      {a.full_name}
                    </p>
                    <p className="text-[12px] text-tertiary truncate">{a.email}</p>
                  </div>
                ),
              },
              {
                key: "phone",
                header: "Điện thoại",
                width: "1%",
                hideOnMobile: true,
                render: (a) => (
                  <span className="text-[12.5px] text-tertiary tnum whitespace-nowrap">
                    {a.phone ?? "—"}
                  </span>
                ),
              },
              {
                key: "institution",
                header: "Trường công tác",
                sortValue: (a) => a.institution ?? "",
                render: (a) => (
                  <div className="min-w-0">
                    <p className="text-[12.5px] truncate">{a.institution ?? "—"}</p>
                    <p className="text-[12px] text-tertiary truncate">
                      {a.department ?? "—"}
                    </p>
                  </div>
                ),
              },
              {
                key: "applied_at",
                header: "Ngày gửi",
                width: "1%",
                hideOnMobile: true,
                sortValue: (a) => a.applied_at,
                render: (a) => (
                  <span
                    className="text-[12.5px] text-tertiary tnum whitespace-nowrap"
                    title={formatDate(a.applied_at)}
                  >
                    {formatRelative(a.applied_at)}
                  </span>
                ),
              },
              {
                key: "state",
                header: "Trạng thái",
                width: "1%",
                render: (a) => {
                  const state = applicationState(a);
                  return (
                    <Badge variant={state.variant} dot={state.variant === "warning"}>
                      {state.label}
                    </Badge>
                  );
                },
              },
              {
                key: "actions",
                header: "",
                width: "1%",
                align: "right",
                render: (a) => {
                  const pending = applicationState(a).label === "Chờ duyệt";
                  return (
                    <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<ImageIcon size={14} />}
                        disabled={!a.credential_image_url}
                        onClick={() => {
                          setSelected(a);
                          setImageOpen(true);
                        }}
                      >
                        Xem thẻ
                      </Button>
                      {pending && (
                        <>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => {
                              setSelected(a);
                              setApproveOpen(true);
                            }}
                          >
                            Duyệt
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => {
                              setSelected(a);
                              setRejectReason("");
                              setRejectOpen(true);
                            }}
                          >
                            Từ chối
                          </Button>
                        </>
                      )}
                    </div>
                  );
                },
              },
            ]}
          />
        )}
      </Card>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-[12.5px]">
          <span className="text-tertiary tnum">
            Trang {data.page}/{data.totalPages} · {data.total} đơn
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

      {/* Ảnh thẻ + toàn bộ thông tin đã khai, cạnh nhau: quyết định duyệt là so
          những gì người ta gõ với những gì trên giấy tờ. */}
      <Modal
        open={imageOpen}
        onClose={() => setImageOpen(false)}
        title="Ảnh thẻ giảng viên"
        description={selected ? `${selected.full_name} · ${selected.email}` : undefined}
        footer={
          <Button variant="secondary" onClick={() => setImageOpen(false)}>
            Đóng
          </Button>
        }
      >
        {selected?.credential_image_url ? (
          <div className="flex flex-col gap-3">
            {/* Nguồn là URL đã ký, có hạn, trỏ tới endpoint tải tệp có kiểm soát
                quyền — không phải tệp tĩnh, nên `next/image` không xử lý được. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selected.credential_image_url}
              alt={`Ảnh thẻ giảng viên của ${selected.full_name}`}
              className="w-full max-h-[60vh] object-contain rounded-[10px]"
              style={{
                background: "var(--bg-subtle)",
                border: "1px solid var(--border-primary)",
              }}
            />
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12.5px]">
              <dt className="text-tertiary">Trường công tác</dt>
              <dd>{selected.institution ?? "—"}</dd>
              <dt className="text-tertiary">Khoa / Bộ môn</dt>
              <dd>{selected.department ?? "—"}</dd>
              <dt className="text-tertiary">Điện thoại</dt>
              <dd className="tnum">{selected.phone ?? "—"}</dd>
              <dt className="text-tertiary">Ngày gửi</dt>
              <dd className="tnum">{formatDate(selected.applied_at)}</dd>
              {selected.application_note && (
                <>
                  <dt className="text-tertiary">Lý do từ chối</dt>
                  <dd>{selected.application_note}</dd>
                </>
              )}
            </dl>
          </div>
        ) : (
          <p className="text-[13px] text-tertiary">
            Đơn này không còn ảnh thẻ đính kèm.
          </p>
        )}
      </Modal>

      <Modal
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        title="Xác nhận duyệt tài khoản giảng viên"
        footer={
          <>
            <Button variant="ghost" onClick={() => setApproveOpen(false)}>
              Hủy
            </Button>
            <Button
              variant="primary"
              loading={busy}
              icon={<CheckCircle size={15} />}
              onClick={() => void handleApprove()}
            >
              Duyệt tài khoản
            </Button>
          </>
        }
      >
        <p className="text-[14px] text-secondary">
          Cấp tài khoản giảng viên cho{" "}
          <strong className="text-primary">{selected?.full_name}</strong> (
          {selected?.email})?
        </p>
        {/* Hệ quả phải nằm trong câu hỏi: sau khi bấm, một mật khẩu rời khỏi hệ
            thống và không rút lại được. */}
        <p className="text-[13px] text-tertiary mt-2 leading-relaxed">
          Hệ thống sẽ sinh một mật khẩu tạm, kích hoạt tài khoản và gửi thông tin
          đăng nhập tới email trên. Người này sẽ có toàn quyền của vai trò Giảng
          viên ngay sau đó.
        </p>
      </Modal>

      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Từ chối đơn đăng ký"
        description={selected ? `${selected.full_name} · ${selected.email}` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>
              Hủy
            </Button>
            <Button
              variant="danger"
              loading={busy}
              icon={<XCircle size={15} />}
              onClick={() => void handleReject()}
            >
              Từ chối đơn
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-[14px] text-secondary">
            Tài khoản sẽ bị xóa khỏi hệ thống và người nộp đơn nhận được email
            thông báo.
          </p>
          <Textarea
            label="Lý do từ chối"
            placeholder="Ví dụ: Ảnh thẻ không đọc được thông tin đơn vị công tác."
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            helperText="Không bắt buộc. Nếu điền, nội dung này sẽ xuất hiện trong email gửi người nộp đơn."
            maxLength={500}
          />
          <p className="text-[12.5px] text-tertiary leading-relaxed">
            Email đã dùng trong đơn này sẽ không đăng ký lại được. Nếu muốn người
            đó nộp lại, hãy hướng dẫn họ liên hệ trực tiếp với quản trị viên.
          </p>
        </div>
      </Modal>
    </div>
  );
}

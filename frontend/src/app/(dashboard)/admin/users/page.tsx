"use client";

import React from "react";
import {
  Users,
  UserPlus,
  UserSwitch,
  MagnifyingGlass,
  Lock,
  LockOpen,
  Trash,
  DotsThreeVertical,
  Warning,
} from "@phosphor-icons/react";
import { PageHeader, Toolbar } from "@/components/layout";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Dropdown,
  DropdownItem,
  DropdownSeparator,
  EmptyState,
  Input,
  Modal,
  Select,
  Table,
} from "@/components/ui";
import { toast } from "@/lib/toast";
import { isApiError } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";
import { useAsync, useDebounced } from "@/lib/use-async";
import { adminApi, type AccountUser, type UserRole, type UserStatus } from "@/lib/services";
import { formatDate, formatRelative } from "@/lib/format";

const PER_PAGE = 20;

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Quản trị viên",
  LECTURER: "Giảng viên",
  STUDENT: "Sinh viên",
};

const ROLE_BADGES: Record<UserRole, { label: string; variant: "warning" | "info" | "success" }> = {
  ADMIN: { label: "Admin", variant: "warning" },
  LECTURER: { label: "Giảng viên", variant: "info" },
  STUDENT: { label: "Sinh viên", variant: "success" },
};

/* Backend trả về ba trạng thái chứ không phải hai. Thiếu PENDING_VERIFICATION ở
   đây thì tài khoản chưa xác minh sẽ bị gán nhãn "Bị khóa" — Admin sẽ đi mở khóa
   một tài khoản vốn không hề bị khóa. */
const STATUS_BADGES: Record<
  UserStatus,
  { label: string; variant: "success" | "danger" | "warning" }
> = {
  ACTIVE: { label: "Hoạt động", variant: "success" },
  SUSPENDED: { label: "Bị khóa", variant: "danger" },
  PENDING_VERIFICATION: { label: "Chờ xác minh", variant: "warning" },
};

const CREATABLE_ROLES: UserRole[] = ["STUDENT", "LECTURER"];
const ASSIGNABLE_ROLES: UserRole[] = ["STUDENT", "LECTURER", "ADMIN"];

const EMPTY_DRAFT = {
  role: "LECTURER" as UserRole,
  full_name: "",
  email: "",
  student_code: "",
  lecturer_code: "",
  department: "Khoa Công Nghệ Thông Tin",
  max_students: 5,
};

export default function AdminUsersPage() {
  const { user } = useAuthStore();

  const [search, setSearch] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState("ALL");
  const [statusFilter, setStatusFilter] = React.useState("ALL");
  const [page, setPage] = React.useState(1);

  // UC 5.8 NFR: 300ms cho mọi ô tìm kiếm. Lọc và phân trang đều nằm ở server nên
  // mỗi phím gõ là một truy vấn thật — không hoãn lại là tự tạo tải cho mình.
  const debouncedSearch = useDebounced(search, 300);

  /* Đổi bộ lọc thì phải quay về trang 1, nếu không Admin lọc lúc đang ở trang 4
     sẽ nhận một danh sách rỗng và tưởng là không có kết quả.

     Chỉnh state ngay trong lúc render thay vì trong useEffect (cùng cách `Sheet`
     trong design system đang làm): effect chạy SAU khi đã render và sau khi
     useAsync đã bắn đi một request với số trang cũ — một truy vấn thừa mà kết
     quả chắc chắn bị vứt bỏ. */
  const filterKey = `${debouncedSearch}|${roleFilter}|${statusFilter}`;
  const [prevFilterKey, setPrevFilterKey] = React.useState(filterKey);
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  const { data, loading, error, refetch, setData } = useAsync(
    () =>
      adminApi.users({
        page,
        per_page: PER_PAGE,
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        ...(roleFilter !== "ALL" ? { role: roleFilter } : {}),
        ...(statusFilter !== "ALL" ? { status: statusFilter } : {}),
      }),
    [page, debouncedSearch, roleFilter, statusFilter]
  );

  const users = data?.data ?? [];
  const hasFilters = Boolean(debouncedSearch) || roleFilter !== "ALL" || statusFilter !== "ALL";

  /* Ghi đè bản ghi tại chỗ bằng đúng dữ liệu server vừa trả về, thay vì tải lại
     cả trang: refetch dựng lại skeleton và cuốn mất dòng Admin vừa thao tác, nên
     họ không thấy được kết quả của chính hành động mình vừa làm. */
  const replaceRow = React.useCallback(
    (row: AccountUser) => {
      setData((prev) =>
        prev ? { ...prev, data: prev.data.map((u) => (u.id === row.id ? row : u)) } : prev
      );
    },
    [setData]
  );

  /* Modal tạo tài khoản (UC 2.2) */
  const [createModalOpen, setCreateModalOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(EMPTY_DRAFT);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
  const [creating, setCreating] = React.useState(false);

  /* Modal xác nhận (UC 2.4, 2.5) */
  const [selectedUser, setSelectedUser] = React.useState<AccountUser | null>(null);
  const [lockModalOpen, setLockModalOpen] = React.useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = React.useState(false);
  const [roleModalOpen, setRoleModalOpen] = React.useState(false);
  const [roleDraft, setRoleDraft] = React.useState({
    role: "STUDENT" as UserRole,
    lecturer_code: "",
    department: "",
  });
  const [busy, setBusy] = React.useState(false);

  const closeCreateModal = () => {
    setCreateModalOpen(false);
    setDraft(EMPTY_DRAFT);
    setFieldErrors({});
  };

  /* UC 2.2 — tạo tài khoản. Mật khẩu do backend sinh ngẫu nhiên và chỉ đi một
     đường duy nhất là hộp thư người dùng; phản hồi không chứa nó nên ở đây không
     có gì để lỡ tay hiển thị. */
  const handleCreate = async () => {
    const isLecturerDraft = draft.role === "LECTURER";
    if (
      !draft.full_name.trim() ||
      !draft.email.trim() ||
      (isLecturerDraft && (!draft.lecturer_code.trim() || !draft.department.trim()))
    ) {
      toast.error("Vui lòng điền đầy đủ các trường bắt buộc");
      return;
    }

    setCreating(true);
    setFieldErrors({});
    try {
      /* Chỉ gửi những trường thuộc về vai trò đang chọn. Backend từ chối thẳng
         MSSV kèm vai trò Giảng viên (và ngược lại) thay vì bỏ qua, nên gửi kèm
         phần thừa sẽ làm hỏng cả lần tạo. */
      const created = await adminApi.createUser({
        email: draft.email.trim(),
        full_name: draft.full_name.trim(),
        role: draft.role,
        ...(draft.role === "STUDENT" && draft.student_code.trim()
          ? { student_code: draft.student_code.trim() }
          : {}),
        ...(isLecturerDraft
          ? {
              lecturer_code: draft.lecturer_code.trim(),
              department: draft.department.trim(),
              max_students: draft.max_students,
            }
          : {}),
      });

      toast.success(
        `Đã tạo tài khoản ${created.full_name}. Đã gửi thông tin đăng nhập tới ${created.email}.`
      );
      closeCreateModal();
      void refetch();
    } catch (err) {
      // Backend gắn lỗi theo từng trường (422): đưa về đúng ô để Admin không
      // phải dò xem "Mã số này đã được sử dụng" là mã của ai.
      if (isApiError(err) && err.errors) setFieldErrors(err.errors);
      toast.error(isApiError(err) ? err.message : "Không tạo được tài khoản.");
    } finally {
      setCreating(false);
    }
  };

  /* UC 2.4 — khóa / mở khóa */
  const handleToggleLock = async () => {
    if (!selectedUser) return;
    const nextStatus: UserStatus = selectedUser.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";

    setBusy(true);
    try {
      const updated = await adminApi.setUserStatus(selectedUser.id, nextStatus);
      toast.success(
        nextStatus === "SUSPENDED"
          ? `Đã khóa tài khoản ${updated.full_name}. Mọi phiên đăng nhập đã bị thu hồi.`
          : `Đã mở khóa tài khoản ${updated.full_name}.`
      );
      setLockModalOpen(false);
      // Đang lọc theo trạng thái thì dòng vừa đổi không còn thuộc bộ lọc nữa —
      // giữ nó lại sẽ là một danh sách tự mâu thuẫn.
      if (statusFilter !== "ALL") void refetch();
      else replaceRow(updated);
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Không đổi được trạng thái tài khoản.");
    } finally {
      setBusy(false);
    }
  };

  /* UC 2.5 — đổi vai trò */
  const openRoleModal = (u: AccountUser) => {
    setSelectedUser(u);
    setRoleDraft({
      // Chọn sẵn một vai trò KHÁC vai trò hiện tại: backend từ chối khi trùng,
      // nên để mặc định trùng là bày sẵn một thao tác chắc chắn thất bại.
      role: ASSIGNABLE_ROLES.find((r) => r !== u.role) ?? "STUDENT",
      lecturer_code: "",
      department: u.department ?? "",
    });
    setRoleModalOpen(true);
  };

  const handleChangeRole = async () => {
    if (!selectedUser) return;
    if (
      roleDraft.role === "LECTURER" &&
      (!roleDraft.lecturer_code.trim() || !roleDraft.department.trim())
    ) {
      toast.error("Cần mã số giảng viên và khoa/bộ môn khi chuyển sang vai trò Giảng viên.");
      return;
    }

    setBusy(true);
    try {
      const updated = await adminApi.setUserRole(
        selectedUser.id,
        roleDraft.role,
        roleDraft.role === "LECTURER"
          ? {
              lecturer_code: roleDraft.lecturer_code.trim(),
              department: roleDraft.department.trim(),
            }
          : undefined
      );
      toast.success(
        `Đã chuyển ${updated.full_name} sang vai trò ${ROLE_LABELS[updated.role]}.`
      );
      setRoleModalOpen(false);
      if (roleFilter !== "ALL") void refetch();
      else replaceRow(updated);
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Không đổi được vai trò tài khoản.");
    } finally {
      setBusy(false);
    }
  };

  /* Xóa mềm */
  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    setBusy(true);
    try {
      await adminApi.removeUser(selectedUser.id);
      toast.success(`Đã xóa tài khoản ${selectedUser.full_name}.`);
      setDeleteModalOpen(false);
      setData((prev) =>
        prev
          ? {
              ...prev,
              data: prev.data.filter((u) => u.id !== selectedUser.id),
              total: Math.max(0, prev.total - 1),
            }
          : prev
      );
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Không xóa được tài khoản.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Người dùng"
        description="Tài khoản sinh viên, giảng viên và quản trị viên."
        actions={
          <Button
            variant="primary"
            icon={<UserPlus size={15} />}
            onClick={() => setCreateModalOpen(true)}
          >
            Thêm tài khoản
          </Button>
        }
      />

      <Card hoverable={false} className="overflow-hidden">
        <Toolbar>
          <div className="flex-1 min-w-0 max-w-sm">
            <Input
              placeholder="Tìm theo tên, email hoặc mã số…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={<MagnifyingGlass size={14} />}
              aria-label="Tìm người dùng"
            />
          </div>

          <div className="flex items-center gap-2 sm:ml-auto">
            <Select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-auto"
              aria-label="Lọc theo vai trò"
            >
              <option value="ALL">Mọi vai trò</option>
              <option value="STUDENT">Sinh viên</option>
              <option value="LECTURER">Giảng viên</option>
              <option value="ADMIN">Quản trị viên</option>
            </Select>

            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-auto"
              aria-label="Lọc theo trạng thái"
            >
              <option value="ALL">Mọi trạng thái</option>
              <option value="ACTIVE">Hoạt động</option>
              <option value="SUSPENDED">Bị khóa</option>
            </Select>
          </div>
        </Toolbar>

        {error ? (
          <EmptyState
            icon={<Warning size={16} />}
            title="Không tải được danh sách người dùng"
            description={error}
            action={
              <Button variant="secondary" size="sm" onClick={() => void refetch()}>
                Thử lại
              </Button>
            }
          />
        ) : (
          <Table
            data={users}
            loading={loading}
            keyExtractor={(u) => String(u.id)}
            pageSize={PER_PAGE}
            rowAccent={(u) => (u.status === "SUSPENDED" ? "danger" : undefined)}
            emptyState={
              <EmptyState
                compact
                icon={<Users size={15} />}
                title="Không tìm thấy tài khoản"
                description={
                  hasFilters
                    ? "Thử từ khóa khác hoặc bỏ bớt điều kiện lọc."
                    : "Bấm “Thêm tài khoản” để cấp tài khoản đầu tiên cho sinh viên hoặc giảng viên."
                }
              />
            }
            columns={[
              {
                key: "full_name",
                header: "Người dùng",
                sortValue: (u) => u.full_name,
                render: (u) => (
                  <div className="flex items-center gap-2.5 min-w-0 py-0.5">
                    <Avatar name={u.full_name} src={u.avatar_url} size="sm" />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium leading-tight truncate">
                        {u.full_name}
                      </p>
                      <p className="text-[12px] text-tertiary truncate">{u.email}</p>
                    </div>
                  </div>
                ),
              },
              {
                key: "code",
                header: "Mã số",
                width: "1%",
                hideOnMobile: true,
                sortValue: (u) => u.code ?? "",
                render: (u) => (
                  <span className="font-mono text-[12.5px] text-secondary">
                    {u.code || "—"}
                  </span>
                ),
              },
              {
                key: "role",
                header: "Vai trò",
                width: "1%",
                sortValue: (u) => u.role,
                render: (u) => (
                  <Badge variant={ROLE_BADGES[u.role].variant}>
                    {ROLE_BADGES[u.role].label}
                  </Badge>
                ),
              },
              {
                key: "status",
                header: "Trạng thái",
                width: "1%",
                sortValue: (u) => u.status,
                render: (u) => (
                  <Badge
                    variant={STATUS_BADGES[u.status].variant}
                    dot={u.status !== "ACTIVE"}
                  >
                    {STATUS_BADGES[u.status].label}
                  </Badge>
                ),
              },
              {
                key: "last_login_at",
                header: "Đăng nhập gần nhất",
                width: "1%",
                hideOnMobile: true,
                // UC 2.1: Admin cần nhìn ra tài khoản nào đã ngừng hoạt động.
                // Sắp xếp theo mốc thời gian thật, không theo chuỗi đã định dạng —
                // "3 giờ trước" và "Hôm qua" không so sánh được với nhau.
                sortValue: (u) => (u.last_login_at ? Date.parse(u.last_login_at) : 0),
                render: (u) => (
                  <span className="text-[12.5px] text-tertiary tnum whitespace-nowrap">
                    {u.last_login_at ? formatRelative(u.last_login_at) : "Chưa đăng nhập"}
                  </span>
                ),
              },
              {
                key: "created_at",
                header: "Ngày tạo",
                width: "1%",
                hideOnMobile: true,
                sortValue: (u) => u.created_at,
                render: (u) => (
                  <span className="text-[12.5px] text-tertiary tnum whitespace-nowrap">
                    {formatDate(u.created_at)}
                  </span>
                ),
              },
              {
                key: "actions",
                header: "",
                width: "1%",
                align: "right",
                render: (u) => {
                  /* Khóa, đổi vai trò và xóa chính mình đều bị backend chặn
                     (UC 2.4 4a, UC 2.5) — và đó cũng là thứ bảo đảm hệ thống luôn
                     còn ít nhất một Admin dùng được. Bày ba mục ra rồi để server
                     trả lỗi là bắt Admin tự dò luật bằng cách va vào nó. */
                  if (u.id === user?.id) return null;

                  return (
                    <Dropdown
                      align="right"
                      trigger={
                        <span
                          className="row-actions btn-icon btn-icon-sm"
                          role="button"
                          aria-label={`Thao tác với ${u.full_name}`}
                        >
                          <DotsThreeVertical size={15} />
                        </span>
                      }
                    >
                      <DropdownItem
                        onClick={() => {
                          setSelectedUser(u);
                          setLockModalOpen(true);
                        }}
                        icon={
                          u.status === "ACTIVE" ? (
                            <Lock size={14} />
                          ) : (
                            <LockOpen size={14} />
                          )
                        }
                      >
                        {u.status === "ACTIVE" ? "Khóa tài khoản" : "Mở khóa"}
                      </DropdownItem>
                      <DropdownItem
                        onClick={() => openRoleModal(u)}
                        icon={<UserSwitch size={14} />}
                      >
                        Đổi vai trò
                      </DropdownItem>
                      <DropdownSeparator />
                      <DropdownItem
                        danger
                        onClick={() => {
                          setSelectedUser(u);
                          setDeleteModalOpen(true);
                        }}
                        icon={<Trash size={14} />}
                      >
                        Xóa tài khoản
                      </DropdownItem>
                    </Dropdown>
                  );
                },
              },
            ]}
          />
        )}
      </Card>

      {/* Phân trang phía server. Bảng chỉ phân trang trên mảng đã tải, nên khi
          tổng vượt một trang thì phải điều khiển bằng tham số truy vấn. */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-[12.5px]">
          <span className="text-tertiary tnum">
            Trang {data.page}/{data.totalPages} · {data.total} tài khoản
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

      {/* Modal: Create Account */}
      <Modal
        open={createModalOpen}
        onClose={closeCreateModal}
        title="Thêm tài khoản người dùng"
        description="Hệ thống sinh mật khẩu ngẫu nhiên và gửi tới email người dùng."
        footer={
          <>
            <Button variant="ghost" onClick={closeCreateModal}>
              Hủy
            </Button>
            <Button variant="primary" loading={creating} onClick={() => void handleCreate()}>
              Tạo tài khoản
            </Button>
          </>
        }
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreate();
          }}
        >
          <Select
            label="Vai trò *"
            value={draft.role}
            onChange={(e) => {
              setDraft((p) => ({ ...p, role: e.target.value as UserRole }));
              // Xóa luôn lỗi của những trường vừa biến mất khỏi form: màu đỏ
              // đọng lại từ vai trò trước đó không còn nói về thứ gì đang hiện.
              setFieldErrors({});
            }}
          >
            {CREATABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>

          <Input
            label="Họ và tên *"
            placeholder={draft.role === "LECTURER" ? "TS. Nguyễn Văn A" : "Lê Văn C"}
            value={draft.full_name}
            error={fieldErrors.full_name?.[0]}
            onChange={(e) => setDraft((p) => ({ ...p, full_name: e.target.value }))}
          />

          <Input
            label="Email *"
            type="email"
            placeholder={
              draft.role === "LECTURER"
                ? "lecturer@novathesis.edu.vn"
                : "student@novathesis.edu.vn"
            }
            value={draft.email}
            error={fieldErrors.email?.[0]}
            onChange={(e) => setDraft((p) => ({ ...p, email: e.target.value }))}
          />

          {draft.role === "LECTURER" ? (
            <>
              <Input
                label="Mã số giảng viên (MSGV) *"
                placeholder="GV003"
                value={draft.lecturer_code}
                error={fieldErrors.lecturer_code?.[0]}
                onChange={(e) => setDraft((p) => ({ ...p, lecturer_code: e.target.value }))}
              />

              <Input
                label="Bộ môn / Khoa *"
                value={draft.department}
                error={fieldErrors.department?.[0]}
                onChange={(e) => setDraft((p) => ({ ...p, department: e.target.value }))}
              />

              <Input
                label="Số sinh viên hướng dẫn tối đa"
                type="number"
                min={0}
                max={100}
                value={draft.max_students}
                error={fieldErrors.max_students?.[0]}
                onChange={(e) => {
                  // 0 là giá trị có nghĩa — "giảng viên tạm không nhận sinh viên"
                  // khác hẳn với bỏ trống, nên không được gộp về giá trị mặc định.
                  const n = Number.parseInt(e.target.value, 10);
                  setDraft((p) => ({ ...p, max_students: Number.isNaN(n) ? 0 : n }));
                }}
              />
            </>
          ) : (
            <Input
              label="Mã số sinh viên (MSSV)"
              placeholder="20110001"
              value={draft.student_code}
              error={fieldErrors.student_code?.[0]}
              helperText="Có thể bỏ trống. Mã số không sửa được sau khi tạo tài khoản."
              onChange={(e) => setDraft((p) => ({ ...p, student_code: e.target.value }))}
            />
          )}
        </form>
      </Modal>

      {/* Modal: Confirm Lock / Unlock */}
      <Modal
        open={lockModalOpen}
        onClose={() => setLockModalOpen(false)}
        title={selectedUser?.status === "ACTIVE" ? "Xác nhận khóa tài khoản" : "Xác nhận mở khóa tài khoản"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setLockModalOpen(false)}>
              Hủy
            </Button>
            <Button
              variant={selectedUser?.status === "ACTIVE" ? "danger" : "primary"}
              loading={busy}
              onClick={() => void handleToggleLock()}
            >
              {selectedUser?.status === "ACTIVE" ? "Khóa tài khoản" : "Mở khóa"}
            </Button>
          </>
        }
      >
        <p className="text-[14px] text-secondary">
          Bạn có chắc chắn muốn {selectedUser?.status === "ACTIVE" ? "khóa" : "mở khóa"} tài khoản{" "}
          <strong className="text-primary">{selectedUser?.full_name}</strong> ({selectedUser?.email}) không?
        </p>
        {/* Business rule UC 2.4: khóa tài khoản thu hồi mọi phiên ngay lập tức.
            Hệ quả này phải nằm trong câu hỏi, không phải trong tài liệu. */}
        <p className="text-[13px] text-tertiary mt-2 leading-relaxed">
          {selectedUser?.status === "ACTIVE"
            ? "Người dùng sẽ bị đăng xuất khỏi mọi thiết bị ngay lập tức và không đăng nhập lại được cho tới khi tài khoản được mở khóa."
            : "Người dùng có thể đăng nhập trở lại ngay và sẽ nhận được thông báo tài khoản đã mở khóa."}
        </p>
      </Modal>

      {/* Modal: Change Role (UC 2.5) */}
      <Modal
        open={roleModalOpen}
        onClose={() => setRoleModalOpen(false)}
        title="Đổi vai trò tài khoản"
        description={selectedUser ? `${selectedUser.full_name} · ${ROLE_LABELS[selectedUser.role]}` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRoleModalOpen(false)}>
              Hủy
            </Button>
            <Button variant="primary" loading={busy} onClick={() => void handleChangeRole()}>
              Cập nhật vai trò
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Select
            label="Vai trò mới *"
            value={roleDraft.role}
            onChange={(e) =>
              setRoleDraft((p) => ({ ...p, role: e.target.value as UserRole }))
            }
          >
            {/* Vai trò hiện tại bị loại khỏi danh sách: backend trả lỗi khi trùng,
                và "đổi sang chính vai trò đang có" không phải một lựa chọn thật. */}
            {ASSIGNABLE_ROLES.filter((r) => r !== selectedUser?.role).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>

          {/* Hồ sơ giảng viên được tạo mới ngay trong lúc đổi vai trò, mà bảng
              `lecturers` bắt buộc có mã số và bộ môn — không suy ra được, phải hỏi. */}
          {roleDraft.role === "LECTURER" && (
            <>
              <Input
                label="Mã số giảng viên (MSGV) *"
                placeholder="GV003"
                value={roleDraft.lecturer_code}
                onChange={(e) =>
                  setRoleDraft((p) => ({ ...p, lecturer_code: e.target.value }))
                }
              />
              <Input
                label="Bộ môn / Khoa *"
                placeholder="Khoa Công Nghệ Thông Tin"
                value={roleDraft.department}
                onChange={(e) => setRoleDraft((p) => ({ ...p, department: e.target.value }))}
              />
            </>
          )}

          <p className="text-[13px] text-tertiary leading-relaxed">
            Vai trò quyết định người dùng thấy và làm được những gì. Hồ sơ{" "}
            {selectedUser ? ROLE_LABELS[selectedUser.role].toLowerCase() : "hiện tại"} sẽ bị gỡ bỏ,
            và không thể đổi vai trò khi người dùng còn đang gắn với đề tài nào.
          </p>
        </div>
      </Modal>

      {/* Modal: Confirm Soft Delete */}
      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Xác nhận xóa tài khoản"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteModalOpen(false)}>
              Hủy
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void handleDeleteUser()}>
              Xóa tài khoản
            </Button>
          </>
        }
      >
        <p className="text-[14px] text-secondary">
          Tài khoản của <strong className="text-primary">{selectedUser?.full_name}</strong> sẽ bị xóa khỏi danh sách (soft-delete). Bạn có chắc chắn không?
        </p>
        <p className="text-[13px] text-tertiary mt-2 leading-relaxed">
          Người dùng bị đăng xuất khỏi mọi thiết bị ngay lập tức. Đề tài, mốc tiến độ và bình luận
          của họ vẫn được giữ nguyên, nhưng email này sẽ không dùng lại được để tạo tài khoản mới.
        </p>
      </Modal>
    </div>
  );
}

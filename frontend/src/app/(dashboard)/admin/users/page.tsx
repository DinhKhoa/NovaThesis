"use client";

import React from "react";
import {
  Users,
  UserPlus,
  MagnifyingGlass,
  Lock,
  LockOpen,
  Trash,
  DotsThreeVertical,
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

/* ========================================
   TYPES (ERD Users, Students, Lecturers)
   ======================================== */

type UserRole = "ADMIN" | "LECTURER" | "STUDENT";
type UserStatus = "ACTIVE" | "SUSPENDED";

interface AccountUser {
  id: number;
  email: string;
  role: UserRole;
  status: UserStatus;
  full_name: string;
  code?: string; // lecturer_code
  created_at: string;
}

/* Mock Initial Data */
const mockUsers: AccountUser[] = [
  {
    id: 1,
    email: "admin@novathesis.edu.vn",
    role: "ADMIN",
    status: "ACTIVE",
    full_name: "Quản Trị Viên Hệ Thống",
    created_at: "2026-01-01",
  },
  {
    id: 2,
    email: "nguyen.vana@novathesis.edu.vn",
    role: "LECTURER",
    status: "ACTIVE",
    full_name: "TS. Nguyễn Văn A",
    code: "GV001",
    created_at: "2026-01-15",
  },
  {
    id: 3,
    email: "tran.thib@novathesis.edu.vn",
    role: "LECTURER",
    status: "ACTIVE",
    full_name: "PGS.TS. Trần Thị B",
    code: "GV002",
    created_at: "2026-01-16",
  },
  {
    id: 4,
    email: "le.vanc@student.edu.vn",
    role: "STUDENT",
    status: "ACTIVE",
    full_name: "Lê Văn C",
    code: "20110001",
    created_at: "2026-02-01",
  },
  {
    id: 5,
    email: "pham.thid@student.edu.vn",
    role: "STUDENT",
    status: "SUSPENDED",
    full_name: "Phạm Thị D",
    code: "20110002",
    created_at: "2026-02-02",
  },
];

export default function AdminUsersPage() {
  const [users, setUsers] = React.useState<AccountUser[]>(mockUsers);
  const [search, setSearch] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState<string>("ALL");
  const [statusFilter, setStatusFilter] = React.useState<string>("ALL");

  // Modal State for Creating Lecturer (UC 2.3)
  const [createModalOpen, setCreateModalOpen] = React.useState(false);
  const [newLecturer, setNewLecturer] = React.useState({
    full_name: "",
    lecturer_code: "",
    email: "",
    department: "Khoa Công Nghệ Thông Tin",
    max_students: 5,
  });
  const [creating, setCreating] = React.useState(false);

  // Confirmation Modals (UC 2.4, 2.5)
  const [selectedUser, setSelectedUser] = React.useState<AccountUser | null>(null);
  const [lockModalOpen, setLockModalOpen] = React.useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = React.useState(false);

  // Filter Logic
  const filteredUsers = React.useMemo(() => {
    return users.filter((u) => {
      const matchSearch =
        u.full_name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        (u.code && u.code.toLowerCase().includes(search.toLowerCase()));

      const matchRole = roleFilter === "ALL" || u.role === roleFilter;
      const matchStatus = statusFilter === "ALL" || u.status === statusFilter;

      return matchSearch && matchRole && matchStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  // Create Lecturer Handler (UC 2.3)
  const handleCreateLecturer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLecturer.full_name || !newLecturer.email || !newLecturer.lecturer_code) {
      toast.error("Vui lòng điền đầy đủ các trường bắt buộc");
      return;
    }

    setCreating(true);
    try {
      // API Call: api.post("/admin/users/lecturer", newLecturer)
      const created: AccountUser = {
        id: Date.now(),
        email: newLecturer.email,
        role: "LECTURER",
        status: "ACTIVE",
        full_name: newLecturer.full_name,
        code: newLecturer.lecturer_code,
        created_at: new Date().toISOString().split("T")[0],
      };

      setUsers((prev) => [created, ...prev]);
      toast.success(`Đã tạo tài khoản giảng viên ${newLecturer.full_name}`);
      setCreateModalOpen(false);
      setNewLecturer({
        full_name: "",
        lecturer_code: "",
        email: "",
        department: "Khoa Công Nghệ Thông Tin",
        max_students: 5,
      });
    } catch {
      toast.error("Tạo tài khoản thất bại");
    } finally {
      setCreating(false);
    }
  };

  // Toggle Lock/Unlock Handler (UC 2.4)
  const handleToggleLock = async () => {
    if (!selectedUser) return;
    const newStatus: UserStatus = selectedUser.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";

    try {
      // API Call: api.patch(`/admin/users/${selectedUser.id}/status`, { status: newStatus })
      setUsers((prev) =>
        prev.map((u) => (u.id === selectedUser.id ? { ...u, status: newStatus } : u))
      );
      toast.success(
        newStatus === "SUSPENDED"
          ? `Đã khóa tài khoản ${selectedUser.full_name}`
          : `Đã mở khóa tài khoản ${selectedUser.full_name}`
      );
      setLockModalOpen(false);
    } catch {
      toast.error("Thao tác thất bại");
    }
  };

  // Delete User Handler (UC 2.5)
  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    try {
      // API Call: api.delete(`/admin/users/${selectedUser.id}`)
      setUsers((prev) => prev.filter((u) => u.id !== selectedUser.id));
      toast.success(`Đã xóa tài khoản ${selectedUser.full_name}`);
      setDeleteModalOpen(false);
    } catch {
      toast.error("Xóa tài khoản thất bại");
    }
  };

  const roleBadges: Record<UserRole, { label: string; variant: "warning" | "info" | "success" }> = {
    ADMIN: { label: "Admin", variant: "warning" },
    LECTURER: { label: "Giảng viên", variant: "info" },
    STUDENT: { label: "Sinh viên", variant: "success" },
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
            Thêm giảng viên
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

        <Table
          data={filteredUsers}
          keyExtractor={(u) => String(u.id)}
          pageSize={20}
          rowAccent={(u) => (u.status === "SUSPENDED" ? "danger" : undefined)}
          emptyState={
            <EmptyState
              compact
              icon={<Users size={15} />}
              title="Không tìm thấy tài khoản"
              description="Thử từ khóa khác hoặc bỏ bớt điều kiện lọc."
            />
          }
          columns={[
            {
              key: "full_name",
              header: "Người dùng",
              sortValue: (u) => u.full_name,
              render: (u) => (
                <div className="flex items-center gap-2.5 min-w-0 py-0.5">
                  <Avatar name={u.full_name} size="sm" />
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
                <Badge variant={roleBadges[u.role].variant}>
                  {roleBadges[u.role].label}
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
                  variant={u.status === "ACTIVE" ? "success" : "danger"}
                  dot={u.status !== "ACTIVE"}
                >
                  {u.status === "ACTIVE" ? "Hoạt động" : "Bị khóa"}
                </Badge>
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
                  {u.created_at}
                </span>
              ),
            },
            {
              key: "actions",
              header: "",
              width: "1%",
              align: "right",
              render: (u) => (
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
              ),
            },
          ]}
        />
      </Card>

      {/* Modal: Create Lecturer */}
      <Modal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Thêm tài khoản Giảng viên"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateModalOpen(false)}>
              Hủy
            </Button>
            <Button variant="primary" loading={creating} onClick={handleCreateLecturer}>
              Tạo tài khoản
            </Button>
          </>
        }
      >
        <form className="flex flex-col gap-4">
          <Input
            label="Họ và tên giảng viên *"
            placeholder="TS. Nguyễn Văn A"
            value={newLecturer.full_name}
            onChange={(e) => setNewLecturer((p) => ({ ...p, full_name: e.target.value }))}
          />

          <Input
            label="Mã số giảng viên (MSGV) *"
            placeholder="GV003"
            value={newLecturer.lecturer_code}
            onChange={(e) => setNewLecturer((p) => ({ ...p, lecturer_code: e.target.value }))}
          />

          <Input
            label="Email *"
            type="email"
            placeholder="lecturer@novathesis.edu.vn"
            value={newLecturer.email}
            onChange={(e) => setNewLecturer((p) => ({ ...p, email: e.target.value }))}
          />

          <Input
            label="Bộ môn / Khoa"
            value={newLecturer.department}
            onChange={(e) => setNewLecturer((p) => ({ ...p, department: e.target.value }))}
          />

          <Input
            label="Số sinh viên hướng dẫn tối đa"
            type="number"
            value={newLecturer.max_students}
            onChange={(e) => setNewLecturer((p) => ({ ...p, max_students: parseInt(e.target.value) || 5 }))}
          />
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
              onClick={handleToggleLock}
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
            <Button variant="danger" onClick={handleDeleteUser}>
              Xóa tài khoản
            </Button>
          </>
        }
      >
        <p className="text-[14px] text-secondary">
          Tài khoản của <strong className="text-primary">{selectedUser?.full_name}</strong> sẽ bị xóa khỏi danh sách (soft-delete). Bạn có chắc chắn không?
        </p>
      </Modal>
    </div>
  );
}

"use client";

import React from "react";
import {
  Users,
  UserPlus,
  MagnifyingGlass,
  Funnel,
  Lock,
  LockOpen,
  Trash,
  DotsThreeVertical,
  Plus,
  ShieldCheck,
  GraduationCap,
  User,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/layout";
import {
  Card,
  Button,
  Input,
  Badge,
  Modal,
  Dropdown,
  DropdownItem,
  DropdownSeparator,
  Avatar,
} from "@/components/ui";
import { api, isApiError } from "@/lib/api";
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
        title="Quản lý tài khoản"
        description="Danh sách toàn bộ người dùng trong hệ thống (Sinh viên, Giảng viên, Admin)."
        actions={
          <Button
            variant="primary"
            icon={<UserPlus size={18} />}
            onClick={() => setCreateModalOpen(true)}
          >
            Thêm Giảng viên
          </Button>
        }
      />

      {/* Filter & Search Bar (UC 2.2) */}
      <Card className="p-4 mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="w-full md:w-80">
          <Input
            placeholder="Tìm kiếm theo tên, email, mã số..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            icon={<MagnifyingGlass size={18} />}
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* Role Filter */}
          <select
            className="input-base text-[13px] py-2 w-full md:w-36"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="ALL">Tất cả vai trò</option>
            <option value="STUDENT">Sinh viên</option>
            <option value="LECTURER">Giảng viên</option>
            <option value="ADMIN">Admin</option>
          </select>

          {/* Status Filter */}
          <select
            className="input-base text-[13px] py-2 w-full md:w-36"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="ACTIVE">Hoạt động</option>
            <option value="SUSPENDED">Bị khóa</option>
          </select>
        </div>
      </Card>

      {/* Users Data Table (UC 2.2) */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-primary)", background: "var(--bg-secondary)" }}>
                <th className="py-3 px-4 text-[12px] font-semibold text-tertiary uppercase tracking-wider">Người dùng</th>
                <th className="py-3 px-4 text-[12px] font-semibold text-tertiary uppercase tracking-wider">Mã số</th>
                <th className="py-3 px-4 text-[12px] font-semibold text-tertiary uppercase tracking-wider">Vai trò</th>
                <th className="py-3 px-4 text-[12px] font-semibold text-tertiary uppercase tracking-wider">Trạng thái</th>
                <th className="py-3 px-4 text-[12px] font-semibold text-tertiary uppercase tracking-wider">Ngày tạo</th>
                <th className="py-3 px-4 text-[12px] font-semibold text-tertiary uppercase tracking-wider text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-muted text-[14px]">
                    Không tìm thấy tài khoản phù hợp
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr
                    key={u.id}
                    className="transition-colors hover:bg-[var(--bg-hover)]"
                    style={{ borderBottom: "1px solid var(--border-secondary)" }}
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={u.full_name} size="sm" />
                        <div>
                          <p className="text-[14px] font-medium leading-tight">{u.full_name}</p>
                          <p className="text-[12px] text-tertiary">{u.email}</p>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4 font-mono text-[13px] text-secondary">
                      {u.code || "—"}
                    </td>

                    <td className="py-3 px-4">
                      <Badge variant={roleBadges[u.role].variant}>
                        {roleBadges[u.role].label}
                      </Badge>
                    </td>

                    <td className="py-3 px-4">
                      <Badge variant={u.status === "ACTIVE" ? "success" : "danger"} dot>
                        {u.status === "ACTIVE" ? "Hoạt động" : "Bị khóa"}
                      </Badge>
                    </td>

                    <td className="py-3 px-4 text-[13px] text-tertiary">
                      {u.created_at}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <Dropdown
                        align="right"
                        trigger={
                          <button className="btn-ghost p-1.5 rounded-lg text-tertiary hover:text-primary">
                            <DotsThreeVertical size={18} />
                          </button>
                        }
                      >
                        <DropdownItem
                          onClick={() => {
                            setSelectedUser(u);
                            setLockModalOpen(true);
                          }}
                          icon={u.status === "ACTIVE" ? <Lock size={16} /> : <LockOpen size={16} />}
                        >
                          {u.status === "ACTIVE" ? "Khóa tài khoản" : "Mở khóa tài khoản"}
                        </DropdownItem>
                        <DropdownSeparator />
                        <DropdownItem
                          danger
                          onClick={() => {
                            setSelectedUser(u);
                            setDeleteModalOpen(true);
                          }}
                          icon={<Trash size={16} />}
                        >
                          Xóa tài khoản
                        </DropdownItem>
                      </Dropdown>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal: Create Lecturer (UC 2.3) */}
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

      {/* Modal: Confirm Lock / Unlock (UC 2.4) */}
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

      {/* Modal: Confirm Soft Delete (UC 2.5) */}
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

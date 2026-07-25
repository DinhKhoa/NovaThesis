"use client";

import React from "react";
import {
  User,
  Camera,
  Lock,
  FloppyDisk,
  IdentificationCard,
  Building,
  EnvelopeSimple,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/layout";
import {
  Card,
  Button,
  Input,
  Avatar,
  Badge,
  Modal,
} from "@/components/ui";
import { useAuthStore } from "@/lib/auth";
import { api, isApiError } from "@/lib/api";
import { toast } from "@/lib/toast";

export default function ProfilePage() {
  const { user, updateProfile } = useAuthStore();

  // Profile Edit State
  const [fullName, setFullName] = React.useState(user?.full_name || "");
  const [lecturerCode, setLecturerCode] = React.useState(user?.lecturer_code || "");
  const [department, setDepartment] = React.useState(user?.department || "");
  const [saving, setSaving] = React.useState(false);

  // Avatar Upload State
  const [uploadingAvatar, setUploadingAvatar] = React.useState(false);
  const avatarInputRef = React.useRef<HTMLInputElement>(null);

  // Change Password Modal State
  const [passwordModalOpen, setPasswordModalOpen] = React.useState(false);
  const [oldPassword, setOldPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [passwordError, setPasswordError] = React.useState("");
  const [changingPassword, setChangingPassword] = React.useState(false);

  /* Seed the form from the loaded profile without an effect: when the source
     record changes identity, drop the draft and re-read from it. Edits made
     since then are preserved, because only a new `user.id` resets. */
  const [seededFor, setSeededFor] = React.useState<number | null>(null);
  if (user && seededFor !== user.id) {
    setSeededFor(user.id);
    setFullName(user.full_name || "");
    setLecturerCode(user.lecturer_code || "");
    setDepartment(user.department || "");
  }

  // Handle Profile Update (UC 1.9)
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error("Họ và tên không được để trống");
      return;
    }

    setSaving(true);
    try {
      await updateProfile({
        full_name: fullName,
        ...(user?.role === "LECTURER" ? { lecturer_code: lecturerCode, department } : {}),
      });
      toast.success("Cập nhật hồ sơ thành công!");
    } catch (err) {
      if (isApiError(err)) {
        toast.error(err.message);
      } else {
        toast.error("Không thể cập nhật hồ sơ");
      }
    } finally {
      setSaving(false);
    }
  };

  // Handle Avatar Upload (UC 1.10)
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Dung lượng ảnh tối đa 5MB");
      return;
    }

    const formData = new FormData();
    formData.append("avatar", file);

    setUploadingAvatar(true);
    try {
      const res = await api.upload<{ avatar_url: string }>("/auth/avatar", formData);
      await updateProfile({ avatar_url: res.avatar_url });
      toast.success("Cập nhật ảnh đại diện thành công!");
    } catch (err) {
      if (isApiError(err)) {
        toast.error(err.message);
      } else {
        toast.error("Tải ảnh thất bại");
      }
    } finally {
      setUploadingAvatar(false);
    }
  };

  // Handle Change Password (UC 1.7)
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");

    if (!oldPassword) {
      setPasswordError("Vui lòng nhập mật khẩu hiện tại");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("Mật khẩu mới tối thiểu 8 ký tự");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Mật khẩu xác nhận không khớp");
      return;
    }

    setChangingPassword(true);
    try {
      await api.post("/auth/change-password", {
        old_password: oldPassword,
        new_password: newPassword,
      });
      toast.success("Đổi mật khẩu thành công!");
      setPasswordModalOpen(false);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      if (isApiError(err)) {
        setPasswordError(err.message);
      } else {
        setPasswordError("Đổi mật khẩu thất bại");
      }
    } finally {
      setChangingPassword(false);
    }
  };

  const roleLabels: Record<string, { label: string; variant: "success" | "info" | "warning" }> = {
    ADMIN: { label: "Quản trị viên", variant: "warning" },
    LECTURER: { label: "Giảng viên", variant: "info" },
    STUDENT: { label: "Sinh viên", variant: "success" },
  };

  const userRole = user?.role ? roleLabels[user.role] : { label: "Người dùng", variant: "info" as const };

  return (
    <div>
      <PageHeader
        title="Hồ sơ"
        description="Thông tin cá nhân, ảnh đại diện và mật khẩu."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Avatar & Role Summary Card */}
        <Card className="p-6 flex flex-col items-center text-center">
          <div className="relative mb-4 group cursor-pointer" onClick={() => avatarInputRef.current?.click()}>
            <Avatar src={user?.avatar_url} name={user?.full_name} size="lg" className="w-24 h-24 text-2xl" />
            <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
              <Camera size={24} />
            </div>
            {uploadingAvatar && (
              <div className="absolute inset-0 rounded-full bg-black/70 flex items-center justify-center text-white">
                <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="60 30" />
                </svg>
              </div>
            )}
          </div>
          <input
            type="file"
            ref={avatarInputRef}
            onChange={handleAvatarChange}
            accept="image/*"
            className="hidden"
          />

          <h2 className="text-lg font-semibold mb-1">{user?.full_name || "Người dùng"}</h2>
          <p className="text-[13px] mb-3" style={{ color: "var(--fg-tertiary)" }}>
            {user?.email}
          </p>

          <Badge variant={userRole.variant} dot>
            {userRole.label}
          </Badge>

          <div className="w-full divider my-5" />

          {/* Quick Security Action */}
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            icon={<Lock size={16} />}
            onClick={() => setPasswordModalOpen(true)}
          >
            Đổi mật khẩu
          </Button>
        </Card>

        {/* Right: Edit Profile Form */}
        <Card className="lg:col-span-2 p-6">
          <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
            <User size={18} style={{ color: "var(--accent)" }} />
            Thông tin chi tiết
          </h3>

          <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
            <Input
              label="Họ và tên"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              icon={<User size={15} />}
            />

            <Input
              label="Email"
              value={user?.email || ""}
              disabled
              icon={<EnvelopeSimple size={15} />}
              helperText="Email không thể thay đổi"
            />


            {user?.role === "LECTURER" && (
              <>
                <Input
                  label="Mã số giảng viên (MSGV)"
                  value={lecturerCode}
                  onChange={(e) => setLecturerCode(e.target.value)}
                  icon={<IdentificationCard size={15} />}
                />
                <Input
                  label="Khoa / Bộ môn"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  icon={<Building size={15} />}
                />
              </>
            )}

            <div className="flex justify-end mt-2">
              <Button
                type="submit"
                variant="primary"
                loading={saving}
                icon={<FloppyDisk size={15} />}
              >
                Lưu thay đổi
              </Button>
            </div>
          </form>
        </Card>
      </div>

      {/* Change Password Modal */}
      <Modal
        open={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        title="Đổi mật khẩu"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPasswordModalOpen(false)}>
              Hủy
            </Button>
            <Button
              variant="primary"
              loading={changingPassword}
              onClick={handleChangePassword}
            >
              Cập nhật mật khẩu
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {passwordError && (
            <div
              className="p-3 rounded-lg text-[13px]"
              style={{ background: "var(--danger-bg)", color: "var(--danger)" }}
            >
              {passwordError}
            </div>
          )}

          <Input
            label="Mật khẩu hiện tại"
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            icon={<Lock size={15} />}
          />
          <Input
            label="Mật khẩu mới"
            type="password"
            placeholder="Tối thiểu 8 ký tự"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            icon={<Lock size={15} />}
          />
          <Input
            label="Xác nhận mật khẩu mới"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            icon={<Lock size={15} />}
          />
        </div>
      </Modal>
    </div>
  );
}

"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  User,
  Camera,
  Lock,
  FloppyDisk,
  IdentificationCard,
  Building,
  EnvelopeSimple,
  PaperPlaneTilt,
  UserCircle,
  Warning,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/layout";
import {
  Card,
  Button,
  Input,
  Avatar,
  Badge,
  EmptyState,
  Modal,
  Skeleton,
} from "@/components/ui";
import {
  useAuthStore,
  isLecturer,
  isStudent,
  type User as AccountProfile,
} from "@/lib/auth";
import { api, isApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useAsync } from "@/lib/use-async";
import { formatDate, formatRelative } from "@/lib/format";

/* Business rule UC 1.10: chỉ JPG/PNG, tối đa 2MB. Kiểm ở client trước khi gửi
   để người dùng không phải chờ tải xong mới biết ảnh bị từ chối — và để câu
   báo lỗi trùng khớp với câu backend sẽ trả về nếu họ vượt qua được bước này. */
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_MIME_TYPES = ["image/jpeg", "image/png"];

/* Sao chép đúng `passwordField` trong `backend/src/middleware/validate.ts`.
   Chỉ kiểm độ dài như trước sẽ để người dùng bấm Lưu rồi mới bị server từ chối
   vì một luật họ chưa từng được cho biết. */
const PASSWORD_COMPOSITION = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;

export default function ProfilePage() {
  const router = useRouter();
  const { user, updateProfile, fetchProfile } = useAuthStore();

  /* Nạp lại hồ sơ mỗi lần vào trang: `last_login_at` và trạng thái xác minh
     email thay đổi bên ngoài phiên làm việc này, mà đây là màn hình duy nhất
     hiển thị chúng.

     Gọi thẳng `/auth/me` chứ không dùng `fetchProfile()` của store vì store cố
     ý nuốt lỗi (nó phục vụ việc khởi tạo nền); trang này cần chính lỗi đó để
     dựng được nút "Thử lại". Kết quả vẫn được đẩy vào store để sidebar và
     topbar dùng chung một nguồn dữ liệu. */
  const { loading, error, refetch } = useAsync(async () => {
    const profile = await api.get<AccountProfile>("/auth/me");
    useAuthStore.setState({ user: profile });
    return profile;
  }, []);

  // Profile Edit State
  const [fullName, setFullName] = React.useState(user?.full_name || "");
  const [studentCode, setStudentCode] = React.useState(user?.student_code || "");
  const [lecturerCode, setLecturerCode] = React.useState(user?.lecturer_code || "");
  const [department, setDepartment] = React.useState(user?.department || "");
  const [saving, setSaving] = React.useState(false);

  // Avatar Upload State
  const [uploadingAvatar, setUploadingAvatar] = React.useState(false);
  const avatarInputRef = React.useRef<HTMLInputElement>(null);

  // Email Verification State (UC 1.4)
  const [resending, setResending] = React.useState(false);

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
    setStudentCode(user.student_code || "");
    setLecturerCode(user.lecturer_code || "");
    setDepartment(user.department || "");
  }

  /* Khoá theo dữ liệu SERVER chứ không theo ô nhập: backend chỉ cho điền mã số
     khi nó còn trống (UC 2.3 BR), gửi lại một mã đã đặt sẽ nhận 409. `students.
     student_code` nullable nên sinh viên đăng ký qua form vẫn còn trống —
     `lecturers.lecturer_code` thì luôn có sẵn từ lúc admin tạo tài khoản. */
  const studentCodeLocked = Boolean(user?.student_code);
  const lecturerCodeLocked = Boolean(user?.lecturer_code);

  // Handle Profile Update (UC 1.9)
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error("Họ và tên không được để trống");
      return;
    }

    setSaving(true);
    try {
      /* Chỉ đính kèm mã số khi nó thực sự còn trống. Bản cũ gửi `lecturer_code`
         trong mọi lần lưu, nên giảng viên chỉ sửa Khoa/Bộ môn cũng ăn 409
         "Mã số giảng viên đã được thiết lập". */
      await updateProfile({
        full_name: fullName,
        ...(isStudent(user) && !studentCodeLocked && studentCode.trim()
          ? { student_code: studentCode.trim() }
          : {}),
        ...(isLecturer(user) && !lecturerCodeLocked && lecturerCode.trim()
          ? { lecturer_code: lecturerCode.trim() }
          : {}),
        ...(isLecturer(user) ? { department } : {}),
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
    const input = e.target;
    const file = input.files?.[0];
    /* Xoá giá trị ngay: chọn lại đúng tệp vừa bị từ chối sẽ không bắn `change`
       nếu ô input còn giữ tên tệp đó. */
    input.value = "";
    if (!file) return;

    if (!AVATAR_MIME_TYPES.includes(file.type)) {
      toast.error("Chỉ hỗ trợ định dạng JPG hoặc PNG");
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      toast.error("Dung lượng ảnh vượt quá 2MB. Vui lòng chọn ảnh khác nhỏ hơn.");
      return;
    }

    const formData = new FormData();
    formData.append("avatar", file);

    setUploadingAvatar(true);
    try {
      await api.upload<{ avatar_url: string }>("/auth/avatar", formData);
      /* `POST /auth/avatar` đã tự ghi `avatar_url` xuống CSDL. Gọi thêm
         `updateProfile({avatar_url})` là thừa — và có hại: schema hồ sơ ở
         backend loại bỏ khoá lạ nên PATCH đó không đổi gì mà lại ghi đè state
         bằng bản ghi vừa đọc, che mất ảnh mới nếu hai request về so le. */
      await fetchProfile();
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

  // Handle Resend Verification Email (UC 1.4)
  const handleResendVerification = async () => {
    if (!user) return;
    setResending(true);
    try {
      const res = await api.post<{ message: string }>("/auth/resend-verification", {
        email: user.email,
      });
      /* Backend cố ý trả CÙNG một câu cho mọi kết cục để chống liệt kê tài
         khoản. Hiển thị nguyên văn thay vì tự khẳng định "đã gửi". */
      toast.success(res.message);
    } catch (err) {
      if (isApiError(err)) {
        toast.error(err.message);
      } else {
        toast.error("Không gửi được email xác minh");
      }
    } finally {
      setResending(false);
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
    if (!PASSWORD_COMPOSITION.test(newPassword)) {
      setPasswordError("Mật khẩu cần có chữ hoa, chữ thường và số.");
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
      /* Backend thu hồi mọi refresh token trừ phiên đang thao tác. Người dùng
         phải biết điều đó, nếu không họ sẽ tưởng điện thoại bị lỗi khi nó bắt
         đăng nhập lại. */
      toast.success("Đổi mật khẩu thành công! Các thiết bị khác đã bị đăng xuất.");
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

      {error ? (
        <EmptyState
          icon={<Warning size={16} />}
          title="Không thể tải thông tin hồ sơ"
          description={error}
          action={
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
        />
      ) : loading && !user ? (
        <ProfileSkeleton />
      ) : !user ? (
        <EmptyState
          icon={<UserCircle size={16} />}
          title="Chưa có hồ sơ để hiển thị"
          description="Phiên đăng nhập đã kết thúc. Hãy đăng nhập lại để xem và chỉnh sửa thông tin cá nhân."
          action={
            <Button variant="primary" size="sm" onClick={() => router.push("/?auth=login")}>
              Đăng nhập lại
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Avatar & Role Summary Card */}
          <Card className="p-6 flex flex-col items-center text-center">
            <div className="relative mb-4 group cursor-pointer" onClick={() => avatarInputRef.current?.click()}>
              <Avatar src={user.avatar_url} name={user.full_name} size="lg" className="w-24 h-24 text-2xl" />
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
              accept="image/jpeg,image/png"
              className="hidden"
            />

            <h2 className="text-lg font-semibold mb-1">{user.full_name}</h2>
            <p className="text-[13px] mb-3" style={{ color: "var(--fg-tertiary)" }}>
              {user.email}
            </p>

            <div className="flex items-center justify-center gap-2 flex-wrap">
              <Badge variant={userRole.variant} dot>
                {userRole.label}
              </Badge>
              {user.email_verified ? (
                <Badge variant="success">Email đã xác minh</Badge>
              ) : (
                <Badge variant="warning" dot>
                  Email chưa xác minh
                </Badge>
              )}
            </div>

            <div className="w-full divider my-5" />

            {/* Dấu vết phiên làm việc — người dùng dùng nó để phát hiện đăng nhập lạ. */}
            <div className="w-full flex flex-col gap-1.5 mb-4 text-[12.5px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-tertiary">Đăng nhập gần nhất</span>
                <span className="text-secondary tnum">{formatRelative(user.last_login_at)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-tertiary">Ngày tạo tài khoản</span>
                <span className="text-secondary tnum">{formatDate(user.created_at)}</span>
              </div>
            </div>

            {/* Chỉ hiện khi email CHƯA xác minh: gửi lại cho hộp thư đã xác minh
                là một nút không làm gì cả. */}
            {!user.email_verified && (
              <Button
                variant="secondary"
                size="sm"
                className="w-full mb-2"
                icon={<PaperPlaneTilt size={16} />}
                loading={resending}
                onClick={handleResendVerification}
              >
                Gửi lại email xác minh
              </Button>
            )}

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
                value={user.email}
                disabled
                icon={<EnvelopeSimple size={15} />}
                helperText="Email không thể thay đổi"
              />

              {isStudent(user) && (
                <Input
                  label="Mã số sinh viên (MSSV)"
                  value={studentCode}
                  onChange={(e) => setStudentCode(e.target.value)}
                  disabled={studentCodeLocked}
                  icon={<IdentificationCard size={15} />}
                  helperText={
                    studentCodeLocked
                      ? "Mã số không thể thay đổi sau khi đã lưu"
                      : "Form đăng ký không hỏi mã số này. Điền một lần tại đây — sau khi lưu sẽ không tự sửa được."
                  }
                />
              )}

              {isLecturer(user) && (
                <>
                  <Input
                    label="Mã số giảng viên (MSGV)"
                    value={lecturerCode}
                    onChange={(e) => setLecturerCode(e.target.value)}
                    disabled={lecturerCodeLocked}
                    icon={<IdentificationCard size={15} />}
                    helperText={
                      lecturerCodeLocked
                        ? "Mã số không thể thay đổi sau khi đã lưu"
                        : "Điền một lần — sau khi lưu sẽ không tự sửa được."
                    }
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
      )}

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
            helperText="Cần có chữ hoa, chữ thường và số."
          />
          <Input
            label="Xác nhận mật khẩu mới"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            icon={<Lock size={15} />}
            helperText="Đổi xong, mọi thiết bị khác sẽ bị đăng xuất."
          />
        </div>
      </Modal>
    </div>
  );
}

/* Khung chờ giữ đúng hình dạng hai cột thật: nội dung không nhảy chỗ khi dữ
   liệu về, và người dùng thấy ngay trang này có gì thay vì một vòng xoay. */
function ProfileSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="p-6 flex flex-col items-center text-center">
        <Skeleton className="rounded-full mb-4" width="96px" height="96px" />
        <Skeleton className="rounded-md mb-2" width="60%" height="20px" />
        <Skeleton className="rounded-md mb-3" width="80%" height="14px" />
        <Skeleton className="rounded-full" width="96px" height="20px" />
        <div className="w-full divider my-5" />
        <div className="w-full flex flex-col gap-1.5 mb-4">
          <Skeleton className="rounded-md" width="100%" height="14px" />
          <Skeleton className="rounded-md" width="100%" height="14px" />
        </div>
        <Skeleton className="rounded-lg" width="100%" height="28px" />
      </Card>

      <Card className="lg:col-span-2 p-6">
        <Skeleton className="rounded-md mb-4" width="180px" height="18px" />
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="rounded-lg" width="100%" height="56px" />
          ))}
          <div className="flex justify-end mt-2">
            <Skeleton className="rounded-lg" width="128px" height="32px" />
          </div>
        </div>
      </Card>
    </div>
  );
}

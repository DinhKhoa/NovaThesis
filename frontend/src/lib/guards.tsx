"use client";

/**
 * CHẶN TRUY CẬP THEO ĐƯỜNG DẪN
 *
 * Access token chỉ nằm trong bộ nhớ của trang (xem `lib/api.ts`), còn refresh
 * token nằm trong cookie `httpOnly` mà JavaScript không đọc được. Middleware của
 * Next chạy trước khi trang có bất kỳ trạng thái nào, nên nó không biết người
 * dùng là ai. Vì vậy hàng rào điều hướng bắt buộc phải nằm ở client — đây chính
 * là nó.
 *
 * Hai nguyên tắc, cả hai đều quan trọng như nhau:
 *
 *   1. KHÔNG render `children` trong lúc chờ điều hướng. Render rồi mới đá đi
 *      nghĩa là cấu trúc trang quản trị vẫn kịp lộ ra trong một khung hình, và
 *      các trang con vẫn kịp gọi API. Đúng thứ đang cần bịt.
 *   2. Đây là lớp phòng thủ THỨ HAI, không phải lớp duy nhất. Người dùng sửa
 *      được mọi thứ trong trình duyệt của họ; quyền thật do
 *      `backend/src/middleware/auth.ts` và `backend/src/domain/access.ts` quyết
 *      định. Tệp này chỉ để giao diện không mời người ta vào chỗ họ không thuộc về.
 */

import React from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui";
import { useAuthStore, type UserRole } from "@/lib/auth";
import { toast } from "@/lib/toast";

function Waiting({ label }: { label: string }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <span className="flex items-center gap-2 text-[13px] text-tertiary">
        <Spinner size={16} />
        {label}
      </span>
    </div>
  );
}

/**
 * Bắt buộc đã đăng nhập.
 *
 * Đặt ở `(dashboard)/layout.tsx` nên phủ toàn bộ khu vực sau đăng nhập bằng một
 * chỗ khai báo duy nhất.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, initialized, initialize } = useAuthStore();
  const router = useRouter();

  React.useEffect(() => {
    void initialize();
  }, [initialize]);

  React.useEffect(() => {
    if (initialized && !user) {
      // `replace` chứ không `push`: bấm Quay lại sau khi bị đá về trang đăng
      // nhập mà quay được vào trang cũ thì hàng rào coi như không có.
      router.replace("/?auth=login");
    }
  }, [initialized, user, router]);

  if (!initialized) return <Waiting label="Đang tải…" />;
  if (!user) return <Waiting label="Đang chuyển tới trang đăng nhập…" />;

  return <>{children}</>;
}

/**
 * Bắt buộc thuộc một trong các vai trò cho trước.
 *
 * Dùng BÊN TRONG `RequireAuth` (thường là qua layout lồng nhau của Next), nên ở
 * đây không xử lý lại trường hợp chưa đăng nhập.
 */
export function RequireRole({
  roles,
  children,
  fallbackHref = "/dashboard",
}: {
  roles: UserRole[];
  children: React.ReactNode;
  /** Nơi đưa người dùng về khi không đủ quyền. */
  fallbackHref?: string;
}) {
  const { user, initialized } = useAuthStore();
  const router = useRouter();

  const allowed = user !== null && roles.includes(user.role);

  /* Báo lỗi đúng MỘT lần cho mỗi lần bị chặn. Không có ref này thì mỗi lần
     React chạy lại effect (StrictMode ở môi trường phát triển chạy hai lần) sẽ
     đẩy thêm một toast trùng. */
  const warned = React.useRef(false);

  React.useEffect(() => {
    if (!initialized || !user || allowed) return;
    if (!warned.current) {
      warned.current = true;
      toast.error("Bạn không có quyền truy cập trang này.");
    }
    router.replace(fallbackHref);
  }, [initialized, user, allowed, router, fallbackHref]);

  if (!initialized) return <Waiting label="Đang tải…" />;
  if (!allowed) return <Waiting label="Đang chuyển hướng…" />;

  return <>{children}</>;
}

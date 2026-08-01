"use client";

import React from "react";
import { RequireRole } from "@/lib/guards";

/**
 * Hàng rào cho toàn bộ khu vực `/admin/*`.
 *
 * Đặt ở layout lồng nhau thay vì bọc từng trang: bốn trang hiện tại
 * (`users`, `logs`, `statistics`, `settings`) được phủ bằng một chỗ khai báo
 * duy nhất, và trang quản trị thứ năm thêm sau này được bảo vệ sẵn mà không ai
 * phải nhớ làm gì. Cách bọc từng trang thì lỗi phổ biến nhất chính là quên bọc.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <RequireRole roles={["ADMIN"]}>{children}</RequireRole>;
}

"use client";

import React from "react";
import { CheckCircle, Clock, Warning } from "@phosphor-icons/react";
import type { AIStatus } from "@/lib/services";

/**
 * Trạng thái lập chỉ mục của một nguồn, kèm câu trả lời cho câu hỏi duy nhất mà
 * người dùng thực sự quan tâm: tệp này dùng làm nguồn được chưa.
 *
 * Khai báo ở đây chứ không trong component: `useChat` cũng cần `usable` để nút
 * "Chọn tất cả" không tick trúng những tệp còn đang xử lý.
 */
export const SOURCE_STATUS: Record<
  AIStatus,
  { icon: React.ReactNode; label: string; usable: boolean }
> = {
  DONE: {
    icon: <CheckCircle size={12} weight="fill" className="text-success" />,
    label: "Đã lập chỉ mục",
    usable: true,
  },
  PENDING: {
    icon: <Clock size={12} className="text-warning" />,
    label: "Đang chờ lập chỉ mục",
    usable: false,
  },
  PROCESSING: {
    icon: <Clock size={12} className="text-warning" />,
    label: "Đang lập chỉ mục",
    usable: false,
  },
  ERROR: {
    icon: <Warning size={12} weight="fill" className="text-danger" />,
    label: "Lỗi xử lý — không dùng làm nguồn được",
    usable: false,
  },
};

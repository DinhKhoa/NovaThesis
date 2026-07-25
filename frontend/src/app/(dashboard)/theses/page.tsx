"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  GraduationCap,
  Plus,
  MagnifyingGlass,
  Funnel,
  Clock,
  UserCheck,
  CheckCircle,
  XCircle,
  ArrowRight,
  BookmarkSimple,
  SlidersHorizontal,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/layout";
import { Card, Button, Input, Badge, Dropdown, DropdownItem } from "@/components/ui";
import { useAuthStore, isLecturer, isStudent } from "@/lib/auth";

/* ========================================
   TYPES (ERD Theses Table)
   ======================================== */

export type ThesisStatus = "DRAFT" | "PENDING" | "ONGOING" | "COMPLETED" | "REJECTED";

export interface Thesis {
  id: number;
  title: string;
  description: string;
  field: string;
  status: ThesisStatus;
  lecturer_name: string;
  lecturer_id: number;
  student_names?: string[];
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
}

export const mockTheses: Thesis[] = [
  {
    id: 1,
    title: "Hệ thống quản lý luận văn và đề tài nghiên cứu tích hợp AI (NovaThesis)",
    description: "Xây dựng nền tảng web quản lý tiến độ báo cáo luận văn, lưu trữ kho tài liệu RAG pgvector và hỗ trợ chat trợ lý học thuật.",
    field: "Công nghệ phần mềm / Trí tuệ nhân tạo",
    status: "ONGOING",
    lecturer_name: "TS. Nguyễn Văn A",
    lecturer_id: 2,
    student_names: ["Lê Văn C"],
    created_at: "2026-02-10",
    updated_at: "2026-07-15",
  },
  {
    id: 2,
    title: "Nghiên cứu ứng dụng IoT và Firmware FSM trong giám sát chất lượng nước",
    description: "Thiết kế thiết bị nhúng giám sát độ pH, độ đục và nhiệt độ nước theo thời gian thực gửi dữ liệu lên Server qua MQTT.",
    field: "Hệ thống nhúng & IoT",
    status: "ONGOING",
    lecturer_name: "PGS.TS. Trần Thị B",
    lecturer_id: 3,
    student_names: ["Phạm Văn E", "Hoàng Thị F"],
    created_at: "2026-02-12",
    updated_at: "2026-07-10",
  },
  {
    id: 3,
    title: "Phân tích cú pháp và phát hiện lỗ hổng bảo mật bằng Mô hình Học máy",
    description: "Đề xuất giải pháp kiểm tra bảo mật Static Analysis Code tự động phát hiện SQL Injection và XSS trong source code C/C++.",
    field: "An toàn thông tin",
    status: "PENDING",
    lecturer_name: "TS. Nguyễn Văn A",
    lecturer_id: 2,
    student_names: ["Đặng Văn G"],
    created_at: "2026-07-01",
    updated_at: "2026-07-01",
  },
  {
    id: 4,
    title: "Tối ưu hóa thuật toán tìm đường cho Robot tự hành trong nhà kho thông minh",
    description: "Ứng dụng thuật toán A* và DWA trên ROS2 cho robot AGV vận chuyển hàng hóa tự động.",
    field: "Robot & Tự động hóa",
    status: "REJECTED",
    lecturer_name: "PGS.TS. Trần Thị B",
    lecturer_id: 3,
    rejection_reason: "Đề tài quá rộng so với phạm vi đồ án 1. Cần thu hẹp quy mô thử nghiệm.",
    created_at: "2026-06-15",
    updated_at: "2026-06-20",
  },
  {
    id: 5,
    title: "Xây dựng ứng dụng điểm danh sinh viên bằng Nhận diện khuôn mặt Deep Learning",
    description: "Đề tài do Giảng viên đề xuất cho sinh viên đăng ký.",
    field: "Thị giác máy tính",
    status: "DRAFT",
    lecturer_name: "TS. Nguyễn Văn A",
    lecturer_id: 2,
    created_at: "2026-07-10",
    updated_at: "2026-07-10",
  },
];

export const statusMap: Record<ThesisStatus, { label: string; variant: "success" | "warning" | "danger" | "info" | "neutral" }> = {
  DRAFT: { label: "Nháp / Đề xuất", variant: "neutral" },
  PENDING: { label: "Chờ duyệt", variant: "warning" },
  ONGOING: { label: "Đang thực hiện", variant: "info" },
  COMPLETED: { label: "Hoàn thành", variant: "success" },
  REJECTED: { label: "Cần sửa / Từ chối", variant: "danger" },
};

export default function ThesesListPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [theses] = React.useState<Thesis[]>(mockTheses);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("ALL");
  const [fieldFilter, setFieldFilter] = React.useState<string>("ALL");

  const fields = React.useMemo(() => {
    const set = new Set(theses.map((t) => t.field));
    return Array.from(set);
  }, [theses]);

  // Filter & Search Logic (UC 3.2, 3.13)
  const filteredTheses = React.useMemo(() => {
    return theses.filter((t) => {
      const matchSearch =
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        t.description.toLowerCase().includes(search.toLowerCase()) ||
        t.lecturer_name.toLowerCase().includes(search.toLowerCase());

      const matchStatus = statusFilter === "ALL" || t.status === statusFilter;
      const matchField = fieldFilter === "ALL" || t.field === fieldFilter;

      return matchSearch && matchStatus && matchField;
    });
  }, [theses, search, statusFilter, fieldFilter]);

  return (
    <div>
      <PageHeader
        title="Quản lý Đề tài Nghiên cứu"
        description="Danh sách tất cả đề tài luận văn, ý tưởng nghiên cứu và đăng ký (UC 3.2, 3.13)."
        actions={
          <Link href="/theses/new">
            <Button variant="primary" icon={<Plus size={18} />}>
              {isLecturer(user) ? "Đề xuất đề tài mới" : "Đề xuất đề tài"}
            </Button>
          </Link>
        }
      />

      {/* Search & Filter Bar (UC 3.13) */}
      <Card className="p-4 mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="w-full md:w-96">
          <Input
            placeholder="Tìm theo tên đề tài, mô tả, GVHD..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            icon={<MagnifyingGlass size={18} />}
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* Status Filter */}
          <select
            className="input-base text-[13px] py-2 w-full md:w-40"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="PENDING">Chờ duyệt</option>
            <option value="ONGOING">Đang thực hiện</option>
            <option value="COMPLETED">Hoàn thành</option>
            <option value="REJECTED">Bị từ chối</option>
            <option value="DRAFT">Nháp / Đề xuất</option>
          </select>

          {/* Field Filter */}
          <select
            className="input-base text-[13px] py-2 w-full md:w-48"
            value={fieldFilter}
            onChange={(e) => setFieldFilter(e.target.value)}
          >
            <option value="ALL">Tất cả lĩnh vực</option>
            {fields.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {/* Thesis Cards Grid (UC 3.2) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredTheses.length === 0 ? (
          <div className="col-span-full py-16 text-center text-tertiary">
            Không tìm thấy đề tài nào phù hợp với bộ lọc.
          </div>
        ) : (
          filteredTheses.map((thesis) => {
            const st = statusMap[thesis.status];

            return (
              <Card
                key={thesis.id}
                hoverable
                className="p-5 flex flex-col justify-between"
                onClick={() => router.push(`/theses/${thesis.id}`)}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <Badge variant={st.variant} dot>
                      {st.label}
                    </Badge>
                    <span className="text-[11px] font-mono text-tertiary">
                      {thesis.created_at}
                    </span>
                  </div>

                  <h2 className="text-[15px] font-semibold tracking-tight mb-2 leading-snug hover:text-accent transition-colors line-clamp-2">
                    {thesis.title}
                  </h2>

                  <p className="text-[13px] text-tertiary line-clamp-2 mb-4 leading-relaxed">
                    {thesis.description}
                  </p>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-3 text-[12px] text-secondary">
                    <BookmarkSimple size={16} className="text-accent" />
                    <span className="font-medium">{thesis.field}</span>
                  </div>

                  <div className="pt-3 border-t border-[var(--border-secondary)] flex items-center justify-between text-[12px] text-tertiary">
                    <span className="flex items-center gap-1.5">
                      <GraduationCap size={16} />
                      GVHD: <strong className="text-primary font-medium">{thesis.lecturer_name}</strong>
                    </span>

                    {thesis.student_names && thesis.student_names.length > 0 ? (
                      <span className="flex items-center gap-1.5 text-accent font-medium">
                        <UserCheck size={16} />
                        {thesis.student_names.join(", ")}
                      </span>
                    ) : (
                      <span className="text-muted italic">Chưa có SV</span>
                    )}
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

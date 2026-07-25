"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  GraduationCap,
  Plus,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import { PageHeader, Toolbar } from "@/components/layout";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  Table,
} from "@/components/ui";
import { useAuthStore, isLecturer } from "@/lib/auth";

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
        title="Đề tài"
        description="Trạng thái duyệt, giảng viên hướng dẫn và tiến độ của từng đề tài."
        actions={
          <Link href="/theses/new">
            <Button variant="primary" icon={<Plus size={15} />}>
              {isLecturer(user) ? "Đề xuất đề tài mới" : "Đề xuất đề tài"}
            </Button>
          </Link>
        }
      />

      <Card hoverable={false} className="overflow-hidden">
        <Toolbar>
          <div className="flex-1 min-w-0 max-w-sm">
            <Input
              placeholder="Tìm theo tên đề tài, mô tả hoặc giảng viên…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={<MagnifyingGlass size={14} />}
              aria-label="Tìm đề tài"
            />
          </div>

          <div className="flex items-center gap-2 sm:ml-auto">
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-auto"
              aria-label="Lọc theo trạng thái"
            >
              <option value="ALL">Mọi trạng thái</option>
              <option value="DRAFT">Nháp</option>
              <option value="PENDING">Chờ duyệt</option>
              <option value="ONGOING">Đang thực hiện</option>
              <option value="COMPLETED">Hoàn thành</option>
              <option value="REJECTED">Bị từ chối</option>
            </Select>

            <Select
              value={fieldFilter}
              onChange={(e) => setFieldFilter(e.target.value)}
              className="w-auto"
              aria-label="Lọc theo lĩnh vực"
            >
              <option value="ALL">Mọi lĩnh vực</option>
              {fields.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Select>
          </div>
        </Toolbar>

        <Table
          data={filteredTheses}
          keyExtractor={(t) => String(t.id)}
          pageSize={15}
          onRowClick={(t) => router.push(`/theses/${t.id}`)}
          rowAccent={(t) => (t.status === "REJECTED" ? "danger" : undefined)}
          emptyState={
            <EmptyState
              compact
              icon={<GraduationCap size={18} />}
              title="Không tìm thấy đề tài nào"
              description="Thử từ khóa khác hoặc bỏ bớt điều kiện lọc."
            />
          }
          columns={[
            {
              key: "title",
              header: "Đề tài",
              sortValue: (t) => t.title,
              render: (t) => (
                <div className="min-w-0 py-0.5">
                  <p className="text-[13px] font-medium truncate max-w-[30rem]">
                    {t.title}
                  </p>
                  {/* One line of the abstract is enough to tell two similarly
                      titled theses apart without doubling the row height. */}
                  <p className="text-[12px] text-tertiary truncate max-w-[34rem]">
                    {t.description}
                  </p>
                </div>
              ),
            },
            {
              key: "field",
              header: "Lĩnh vực",
              width: "1%",
              hideOnMobile: true,
              sortValue: (t) => t.field,
              render: (t) => (
                <span className="chip whitespace-nowrap">{t.field}</span>
              ),
            },
            {
              key: "lecturer_name",
              header: "Hướng dẫn",
              width: "1%",
              hideOnMobile: true,
              sortValue: (t) => t.lecturer_name,
              render: (t) => (
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <Avatar name={t.lecturer_name} size="xs" />
                  <span className="text-[12.5px] text-secondary">
                    {t.lecturer_name}
                  </span>
                </span>
              ),
            },
            {
              key: "students",
              header: "Sinh viên",
              width: "1%",
              hideOnMobile: true,
              render: (t) =>
                t.student_names?.length ? (
                  <span className="text-[12.5px] text-secondary whitespace-nowrap">
                    {t.student_names.join(", ")}
                  </span>
                ) : (
                  <span className="text-[12.5px] text-muted italic">Chưa có</span>
                ),
            },
            {
              key: "status",
              header: "Trạng thái",
              width: "1%",
              sortValue: (t) => t.status,
              render: (t) => {
                const st = statusMap[t.status];
                return (
                  <Badge variant={st.variant} dot={t.status === "PENDING"}>
                    {st.label}
                  </Badge>
                );
              },
            },
            {
              key: "created_at",
              header: "Ngày tạo",
              width: "1%",
              hideOnMobile: true,
              sortValue: (t) => t.created_at,
              render: (t) => (
                <span className="text-[12.5px] text-tertiary tnum whitespace-nowrap">
                  {t.created_at}
                </span>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}

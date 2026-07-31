"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GraduationCap, MagnifyingGlass, Plus, Warning } from "@phosphor-icons/react";
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
import { useAuthStore, isLecturer, isStudent } from "@/lib/auth";
import { useAsync, useDebounced } from "@/lib/use-async";
import { thesesApi, type Thesis, type ThesisStatus } from "@/lib/services";
import { formatDate } from "@/lib/format";

/* Nhãn trạng thái dùng chung cho cả trang danh sách và trang chi tiết.
   Trang chi tiết trước đây import `mockTheses` từ đây — một trang phụ thuộc vào
   dữ liệu giả của trang khác. Giờ chỉ còn bảng nhãn được chia sẻ. */
export const statusMap: Record<
  ThesisStatus,
  { label: string; variant: "success" | "warning" | "danger" | "info" | "neutral" }
> = {
  DRAFT: { label: "Nháp / Đề xuất", variant: "neutral" },
  PENDING: { label: "Chờ duyệt", variant: "warning" },
  REVISION_REQUIRED: { label: "Cần chỉnh sửa", variant: "danger" },
  ONGOING: { label: "Đang thực hiện", variant: "info" },
  COMPLETED: { label: "Hoàn thành", variant: "success" },
  REJECTED: { label: "Từ chối", variant: "danger" },
};

export type { Thesis };

export default function ThesesListPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("ALL");
  const [fieldFilter, setFieldFilter] = React.useState("ALL");
  const [page, setPage] = React.useState(1);

  // UC 5.8 NFR áp cho mọi ô tìm kiếm: gọi API sau mỗi phím gõ là tự tấn công
  // máy chủ của mình.
  const debouncedSearch = useDebounced(search, 300);

  /* Đổi bộ lọc mà giữ nguyên số trang sẽ rơi vào một trang không còn tồn tại,
     và người dùng thấy danh sách rỗng dù dữ liệu vẫn còn.

     Chỉnh state ngay trong thân render thay vì trong useEffect: đây là mẫu được
     React khuyến nghị cho "state phụ thuộc state khác". Dùng effect sẽ tốn thêm
     một lượt render và một khoảnh khắc gọi API với số trang cũ. */
  const filterKey = `${debouncedSearch}|${statusFilter}|${fieldFilter}`;
  const [appliedFilterKey, setAppliedFilterKey] = React.useState(filterKey);
  if (appliedFilterKey !== filterKey) {
    setAppliedFilterKey(filterKey);
    setPage(1);
  }

  const { data: fields } = useAsync(() => thesesApi.fields(), []);

  const { data, loading, error, refetch } = useAsync(
    () =>
      thesesApi.list({
        page,
        per_page: 15,
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        ...(statusFilter !== "ALL" ? { status: statusFilter } : {}),
        ...(fieldFilter !== "ALL" ? { field: fieldFilter } : {}),
      }),
    [page, debouncedSearch, statusFilter, fieldFilter]
  );

  const theses = data?.data ?? [];

  return (
    <div>
      <PageHeader
        title="Đề tài"
        description="Trạng thái duyệt, giảng viên hướng dẫn và tiến độ của từng đề tài."
        meta={
          data ? <Badge variant="neutral">{data.total} đề tài</Badge> : undefined
        }
        actions={
          /* Sinh viên đã có đề tài đang chạy thì không tạo thêm được (UC 3.1 BR),
             nên nút chỉ hiện khi thao tác thật sự khả thi. */
          isStudent(user) && user?.thesis_id ? null : (
            <Link href="/theses/new">
              <Button variant="primary" icon={<Plus size={15} />}>
                {isLecturer(user) ? "Tạo đề tài mới" : "Đề xuất đề tài"}
              </Button>
            </Link>
          )
        }
      />

      <Card hoverable={false} className="overflow-hidden">
        <Toolbar>
          <div className="flex-1 min-w-0 max-w-sm">
            <Input
              placeholder="Tìm theo tên đề tài, mô tả hoặc lĩnh vực…"
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
              {(Object.keys(statusMap) as ThesisStatus[]).map((s) => (
                <option key={s} value={s}>
                  {statusMap[s].label}
                </option>
              ))}
            </Select>

            <Select
              value={fieldFilter}
              onChange={(e) => setFieldFilter(e.target.value)}
              className="w-auto"
              aria-label="Lọc theo lĩnh vực"
            >
              <option value="ALL">Mọi lĩnh vực</option>
              {(fields ?? []).map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Select>
          </div>
        </Toolbar>

        {error ? (
          <EmptyState
            icon={<Warning size={16} />}
            title="Không tải được danh sách"
            description={error}
            action={
              <Button variant="secondary" size="sm" onClick={() => void refetch()}>
                Thử lại
              </Button>
            }
          />
        ) : (
          <Table
            data={theses}
            loading={loading}
            keyExtractor={(t) => String(t.id)}
            pageSize={15}
            onRowClick={(t) => router.push(`/theses/${t.id}`)}
            rowAccent={(t) =>
              t.status === "REJECTED" || t.status === "REVISION_REQUIRED" ? "danger" : undefined
            }
            emptyState={
              <EmptyState
                compact
                icon={<GraduationCap size={18} />}
                title="Không tìm thấy đề tài nào"
                description={
                  search || statusFilter !== "ALL" || fieldFilter !== "ALL"
                    ? "Thử từ khóa khác hoặc bỏ bớt điều kiện lọc."
                    : "Chưa có đề tài nào trong phạm vi bạn được xem."
                }
              />
            }
            columns={[
              {
                key: "title",
                header: "Đề tài",
                sortValue: (t) => t.title,
                render: (t) => (
                  <div className="min-w-0 py-0.5">
                    <p className="text-[13px] font-medium truncate max-w-[30rem]">{t.title}</p>
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
                render: (t) => <span className="chip whitespace-nowrap">{t.field}</span>,
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
                    <span className="text-[12.5px] text-secondary">{t.lecturer_name}</span>
                  </span>
                ),
              },
              {
                key: "students",
                header: "Sinh viên",
                width: "1%",
                hideOnMobile: true,
                render: (t) =>
                  t.student_names.length ? (
                    <span className="text-[12.5px] text-secondary whitespace-nowrap">
                      {t.student_names.join(", ")}
                    </span>
                  ) : (
                    <span className="text-[12.5px] text-muted italic">Chưa có</span>
                  ),
              },
              {
                key: "progress",
                header: "Mốc",
                width: "1%",
                align: "right",
                hideOnMobile: true,
                render: (t) => (
                  <span className="text-[12.5px] text-tertiary tnum whitespace-nowrap">
                    {t.milestone_count}
                  </span>
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
                    {formatDate(t.created_at)}
                  </span>
                ),
              },
            ]}
          />
        )}
      </Card>

      {/* Phân trang phía server. Bảng tự phân trang trên mảng đã tải, nên khi
          tổng vượt một trang ta phải điều khiển bằng tham số truy vấn. */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-[12.5px]">
          <span className="text-tertiary tnum">
            Trang {data.page}/{data.totalPages} · {data.total} đề tài
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
    </div>
  );
}

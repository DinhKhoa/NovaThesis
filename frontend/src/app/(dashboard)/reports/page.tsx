"use client";

import React from "react";
import {
  ChartBar,
  FileCsv,
  FileXls,
  Robot,
  GraduationCap,
  Users,
  ChartPie,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/layout";
import { Card, Button, Badge } from "@/components/ui";
import { toast } from "@/lib/toast";

export default function ReportsPage() {
  const [exportingExcel, setExportingExcel] = React.useState(false);
  const [exportingCsv, setExportingCsv] = React.useState(false);

  // Export Excel Handler (UC 9.4)
  const handleExportExcel = () => {
    setExportingExcel(true);
    setTimeout(() => {
      toast.success("Đã xuất file Báo_cáo_Thống_kê_NovaThesis.xlsx!");
      setExportingExcel(false);
    }, 1200);
  };

  // Export CSV Handler (UC 9.4)
  const handleExportCsv = () => {
    setExportingCsv(true);
    setTimeout(() => {
      toast.success("Đã xuất file Báo_cáo_Thống_kê_NovaThesis.csv!");
      setExportingCsv(false);
    }, 1000);
  };

  return (
    <div>
      <PageHeader
        title="Báo cáo"
        description="Xuất dữ liệu tiến độ, danh sách đề tài và thống kê sử dụng AI."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              icon={<FileCsv size={15} />}
              loading={exportingCsv}
              onClick={handleExportCsv}
            >
              Xuất CSV
            </Button>
            <Button
              variant="primary"
              icon={<FileXls size={15} />}
              loading={exportingExcel}
              onClick={handleExportExcel}
            >
              Xuất Excel (.xlsx)
            </Button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] text-tertiary uppercase font-medium">Tổng Đề tài</span>
            <GraduationCap size={20} className="text-accent" />
          </div>
          <p className="text-2xl font-bold">54</p>
          <span className="text-[11px] text-success font-medium">↑ 12% so với kỳ trước</span>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] text-tertiary uppercase font-medium">Tỷ lệ Hoàn thành</span>
            <ChartPie size={20} className="text-success" />
          </div>
          <p className="text-2xl font-bold">78.5%</p>
          <span className="text-[11px] text-tertiary">Mức trung bình toàn khoa</span>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] text-tertiary uppercase font-medium">Lượt truy vấn AI</span>
            <Robot size={20} className="text-warning" />
          </div>
          <p className="text-2xl font-bold font-mono">4,820</p>
          <span className="text-[11px] text-accent">pgvector RAG Queries</span>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] text-tertiary uppercase font-medium">Tổng Sinh viên</span>
            <Users size={20} className="text-info" />
          </div>
          <p className="text-2xl font-bold font-mono">142</p>
          <span className="text-[11px] text-tertiary">Đã gán GVHD</span>
        </Card>
      </div>

      {/* Status Breakdown & AI Analytics (UC 9.2, 9.3) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Thesis Status Distribution */}
        <Card className="p-6">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
            <ChartBar size={20} style={{ color: "var(--accent)" }} />
            Thống kê Đề tài theo Trạng thái
          </h2>

          <div className="flex flex-col gap-4">
            {[
              { label: "Đang thực hiện (ONGOING)", count: 35, percent: 65, color: "var(--accent)" },
              { label: "Hoàn thành (COMPLETED)", count: 12, percent: 22, color: "var(--success)" },
              { label: "Chờ duyệt (PENDING)", count: 5, percent: 9, color: "var(--warning)" },
              { label: "Bị từ chối (REJECTED)", count: 2, percent: 4, color: "var(--danger)" },
            ].map((item) => (
              <div key={item.label} className="flex flex-col gap-1.5">
                <div className="flex justify-between text-[13px]">
                  <span className="text-secondary">{item.label}</span>
                  <span className="font-mono text-primary font-medium">{item.count} đề tài ({item.percent}%)</span>
                </div>
                <div className="h-2.5 rounded-full overflow-hidden bg-[var(--bg-hover)]">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${item.percent}%`, background: item.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* AI Usage Analytics */}
        <Card className="p-6">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
            <Robot size={20} style={{ color: "var(--accent)" }} />
            Thống kê Tần suất Sử dụng AI & Vector Search
          </h2>

          <div className="flex flex-col gap-3">
            {[
              { feature: "Hỏi đáp Trợ lý RAG (pgvector)", count: 2840, share: 59 },
              { feature: "Tìm kiếm Ngữ nghĩa Tài liệu (Semantic Search)", count: 1120, share: 23 },
              { feature: "Tóm tắt Tài liệu tự động", count: 540, share: 11 },
              { feature: "Kiểm tra Trùng lặp & Đạo văn", count: 320, share: 7 },
            ].map((f) => (
              <div key={f.feature} className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-secondary)] flex items-center justify-between">
                <div>
                  <span className="font-medium text-[13px] text-primary block">{f.feature}</span>
                  <span className="text-[11px] text-tertiary font-mono">{f.count} lượt truy vấn</span>
                </div>
                <Badge variant="info">{f.share}%</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

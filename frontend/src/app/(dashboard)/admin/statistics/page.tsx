"use client";

import React from "react";
import {
  ChartBar,
  GraduationCap,
  Users,
  Robot,
  Files,
  CheckCircle,
  TrendUp,
  Warning,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/layout";
import { Card, Badge } from "@/components/ui";

const adminMetrics = [
  { label: "Tổng số sinh viên", value: "142", icon: <Users size={20} />, color: "var(--info)" },
  { label: "Tổng số giảng viên", value: "18", icon: <GraduationCap size={20} />, color: "var(--accent)" },
  { label: "Đề tài đang thực hiện", value: "35", icon: <TrendUp size={20} />, color: "var(--success)" },
  { label: "Lượt hỏi AI (RAG)", value: "1,240", icon: <Robot size={20} />, color: "var(--warning)" },
];

const thesisDistribution = [
  { status: "ONGOING", label: "Đang thực hiện", count: 35, percent: 65 },
  { status: "COMPLETED", label: "Hoàn thành", count: 12, percent: 22 },
  { status: "PENDING", label: "Chờ duyệt", count: 5, percent: 9 },
  { status: "REJECTED", label: "Từ chối", count: 2, percent: 4 },
];

export default function AdminStatisticsPage() {
  return (
    <div>
      <PageHeader
        title="Thống kê toàn hệ thống"
        description="Báo cáo tổng quan số lượng đề tài, người dùng và tần suất sử dụng AI (UC 2.1, 2.8, 2.9)."
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {adminMetrics.map((m) => (
          <Card key={m.label} className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[12px] font-medium uppercase text-tertiary">{m.label}</span>
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: "var(--bg-surface)", color: m.color }}
              >
                {m.icon}
              </div>
            </div>
            <p className="text-2xl font-semibold">{m.value}</p>
          </Card>
        ))}
      </div>

      {/* Distribution Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold mb-4 flex items-center gap-2">
            <GraduationCap size={18} style={{ color: "var(--accent)" }} />
            Phân bố trạng thái đề tài (UC 2.8, 2.9)
          </h2>

          <div className="flex flex-col gap-4">
            {thesisDistribution.map((item) => (
              <div key={item.status} className="flex flex-col gap-1.5">
                <div className="flex justify-between text-[13px]">
                  <span className="text-secondary">{item.label}</span>
                  <span className="font-mono text-primary font-medium">{item.count} đề tài ({item.percent}%)</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden bg-[var(--bg-hover)]">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${item.percent}%`,
                      background:
                        item.status === "ONGOING"
                          ? "var(--accent)"
                          : item.status === "COMPLETED"
                          ? "var(--success)"
                          : item.status === "PENDING"
                          ? "var(--warning)"
                          : "var(--danger)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-[15px] font-semibold mb-4 flex items-center gap-2">
            <Robot size={18} style={{ color: "var(--accent)" }} />
            Tần suất sử dụng AI Assistant (30 ngày gần đây)
          </h2>

          <div className="flex items-end justify-between gap-2 h-48 pt-6">
            {[40, 65, 80, 55, 90, 120, 110, 135, 160, 145, 180, 210].map((val, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                <div
                  className="w-full rounded-t-sm transition-all duration-300 hover:opacity-80"
                  style={{
                    height: `${(val / 210) * 100}%`,
                    background: "var(--accent)",
                  }}
                  title={`Tuần ${idx + 1}: ${val} lượt`}
                />
                <span className="text-[10px] text-tertiary">T{idx + 1}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

"use client";

import React from "react";
import {
  Notebook,
  MagnifyingGlass,
  Funnel,
  Eye,
  Clock,
  User,
  Desktop,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/layout";
import { Card, Input, Badge, Modal, Button } from "@/components/ui";

interface SystemLog {
  id: number;
  user_email: string;
  action: string;
  ip_address: string;
  details: string;
  created_at: string;
  level: "INFO" | "WARN" | "ERROR";
}

const mockLogs: SystemLog[] = [
  {
    id: 1,
    user_email: "le.vanc@student.edu.vn",
    action: "AUTH_LOGIN",
    ip_address: "192.168.1.45",
    details: '{"browser": "Chrome", "os": "Windows 11"}',
    created_at: "2026-07-19 10:45:12",
    level: "INFO",
  },
  {
    id: 2,
    user_email: "nguyen.vana@novathesis.edu.vn",
    action: "MILESTONE_APPROVE",
    ip_address: "14.241.12.89",
    details: '{"milestone_id": 4, "thesis_id": 1, "comment": "Đạt yêu cầu"}',
    created_at: "2026-07-19 09:30:00",
    level: "INFO",
  },
  {
    id: 3,
    user_email: "pham.thid@student.edu.vn",
    action: "LOGIN_FAILED",
    ip_address: "113.161.4.12",
    details: '{"reason": "Invalid password", "attempts": 3}',
    created_at: "2026-07-18 22:15:04",
    level: "WARN",
  },
  {
    id: 4,
    user_email: "admin@novathesis.edu.vn",
    action: "CONFIG_UPDATE",
    ip_address: "127.0.0.1",
    details: '{"key": "AI_MODEL", "old": "gpt-4-turbo", "new": "gpt-4o"}',
    created_at: "2026-07-18 16:20:00",
    level: "INFO",
  },
  {
    id: 5,
    user_email: "le.vanc@student.edu.vn",
    action: "DOCUMENT_UPLOAD_ERROR",
    ip_address: "192.168.1.45",
    details: '{"filename": "too_big.pdf", "size_mb": 65, "max_allowed": 50}',
    created_at: "2026-07-17 14:10:33",
    level: "ERROR",
  },
];

const levelBadges: Record<string, { label: string; variant: "info" | "warning" | "danger" }> = {
  INFO: { label: "Info", variant: "info" },
  WARN: { label: "Warning", variant: "warning" },
  ERROR: { label: "Error", variant: "danger" },
};

export default function AdminLogsPage() {
  const [logs] = React.useState<SystemLog[]>(mockLogs);
  const [search, setSearch] = React.useState("");
  const [levelFilter, setLevelFilter] = React.useState("ALL");
  const [selectedLog, setSelectedLog] = React.useState<SystemLog | null>(null);

  const filteredLogs = React.useMemo(() => {
    return logs.filter((log) => {
      const matchSearch =
        log.user_email.toLowerCase().includes(search.toLowerCase()) ||
        log.action.toLowerCase().includes(search.toLowerCase()) ||
        log.ip_address.includes(search);
      const matchLevel = levelFilter === "ALL" || log.level === levelFilter;
      return matchSearch && matchLevel;
    });
  }, [logs, search, levelFilter]);

  return (
    <div>
      <PageHeader
        title="Nhật ký hệ thống (System Logs)"
        description="Kiểm toán tất cả hoạt động, đăng nhập, và thao tác hệ thống (UC 2.6)."
      />

      <Card className="p-4 mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="w-full md:w-80">
          <Input
            placeholder="Tìm theo email, hành động, IP..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            icon={<MagnifyingGlass size={18} />}
          />
        </div>

        <div className="w-full md:w-auto">
          <select
            className="input-base text-[13px] py-2 w-full md:w-40"
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
          >
            <option value="ALL">Tất cả cấp độ</option>
            <option value="INFO">INFO</option>
            <option value="WARN">WARN</option>
            <option value="ERROR">ERROR</option>
          </select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-primary)", background: "var(--bg-secondary)" }}>
                <th className="py-3 px-4 text-[12px] font-semibold text-tertiary uppercase tracking-wider">Thời gian</th>
                <th className="py-3 px-4 text-[12px] font-semibold text-tertiary uppercase tracking-wider">Cấp độ</th>
                <th className="py-3 px-4 text-[12px] font-semibold text-tertiary uppercase tracking-wider">Hành động</th>
                <th className="py-3 px-4 text-[12px] font-semibold text-tertiary uppercase tracking-wider">Người thực hiện</th>
                <th className="py-3 px-4 text-[12px] font-semibold text-tertiary uppercase tracking-wider">IP Address</th>
                <th className="py-3 px-4 text-[12px] font-semibold text-tertiary uppercase tracking-wider text-right">Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => (
                <tr
                  key={log.id}
                  className="transition-colors hover:bg-[var(--bg-hover)]"
                  style={{ borderBottom: "1px solid var(--border-secondary)" }}
                >
                  <td className="py-3 px-4 font-mono text-[12px] text-tertiary">
                    {log.created_at}
                  </td>
                  <td className="py-3 px-4">
                    <Badge variant={levelBadges[log.level].variant}>
                      {log.level}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 font-mono text-[13px] font-medium text-accent">
                    {log.action}
                  </td>
                  <td className="py-3 px-4 text-[13px] text-secondary">
                    {log.user_email}
                  </td>
                  <td className="py-3 px-4 font-mono text-[12px] text-tertiary">
                    {log.ip_address}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      className="btn-ghost p-1.5 rounded-lg text-tertiary hover:text-primary"
                      onClick={() => setSelectedLog(log)}
                    >
                      <Eye size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Log Details Modal */}
      <Modal
        open={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title="Chi tiết Nhật ký"
        footer={
          <Button variant="ghost" onClick={() => setSelectedLog(null)}>
            Đóng
          </Button>
        }
      >
        {selectedLog && (
          <div className="flex flex-col gap-3 text-[13px]">
            <div>
              <span className="text-tertiary block mb-1">Hành động:</span>
              <span className="font-mono text-accent font-medium">{selectedLog.action}</span>
            </div>
            <div>
              <span className="text-tertiary block mb-1">Payload / Chi tiết log:</span>
              <pre className="p-3 rounded-lg bg-[var(--bg-secondary)] font-mono text-[12px] overflow-x-auto text-primary">
                {JSON.stringify(JSON.parse(selectedLog.details), null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

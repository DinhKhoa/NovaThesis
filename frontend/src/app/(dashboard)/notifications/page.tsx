"use client";

import React from "react";
import {
  Bell,
  Check,
  Checks,
  Trash,
  Clock,
  Gear,
  Kanban,
  GraduationCap,
  ChatCircleText,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/layout";
import { Card, Button, Badge, Modal } from "@/components/ui";
import { toast } from "@/lib/toast";

/* ========================================
   TYPES (ERD Notifications Table)
   ======================================== */

export interface NotificationItem {
  id: number;
  title: string;
  content: string;
  is_read: boolean;
  type: "MILESTONE" | "THESIS" | "FEEDBACK" | "SYSTEM";
  created_at: string;
}

const mockNotifications: NotificationItem[] = [
  {
    id: 1,
    title: "Nhắc nhở: Milestone sắp đến hạn!",
    content: "Milestone 'Nộp Báo cáo Đề cương Luận văn' của bạn còn 6 ngày nữa là đến hạn (2026-07-25).",
    is_read: false,
    type: "MILESTONE",
    created_at: "Hôm nay, 08:30",
  },
  {
    id: 2,
    title: "Giảng viên đã nhận xét bài báo cáo",
    content: "TS. Nguyễn Văn A đã để lại bình luận trên milestone 'Thiết kế ERD Database'.",
    is_read: false,
    type: "FEEDBACK",
    created_at: "Hôm qua, 16:45",
  },
  {
    id: 3,
    title: "Đề tài đã được phê duyệt!",
    content: "Đề tài 'Hệ thống NovaThesis tích hợp AI' của bạn đã chuyển sang trạng thái Đang thực hiện.",
    is_read: true,
    type: "THESIS",
    created_at: "2026-07-15 10:30",
  },
  {
    id: 4,
    title: "Cập nhật hệ thống AI pgvector",
    content: "Hệ thống đã nâng cấp mô hình Vector Search giúp tăng 30% tốc độ RAG.",
    is_read: true,
    type: "SYSTEM",
    created_at: "2026-07-10 12:00",
  },
];

export default function NotificationsPage() {
  const [notifications, setNotifications] = React.useState<NotificationItem[]>(mockNotifications);
  const [filter, setFilter] = React.useState<"ALL" | "UNREAD">("ALL");

  // Settings Modal State (UC 8.2, 8.7)
  const [settingsModalOpen, setSettingsModalOpen] = React.useState(false);
  const [emailNotify, setEmailNotify] = React.useState(true);
  const [reminderNotify, setReminderNotify] = React.useState(true);
  const [feedbackNotify, setFeedbackNotify] = React.useState(true);

  // Filter Logic (UC 8.3)
  const filteredNotifications = React.useMemo(() => {
    if (filter === "UNREAD") return notifications.filter((n) => !n.is_read);
    return notifications;
  }, [notifications, filter]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // Mark Read (UC 8.4)
  const handleMarkRead = (id: number) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    toast.info("Đã đánh dấu đã đọc");
  };

  // Mark All Read (UC 8.5)
  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    toast.success("Đã đánh dấu tất cả là đã đọc!");
  };

  // Delete Notification (UC 8.6)
  const handleDelete = (id: number) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    toast.warning("Đã xóa thông báo");
  };

  // Save Settings (UC 8.2, 8.7)
  const handleSaveSettings = () => {
    toast.success("Đã lưu cài đặt nhận thông báo!");
    setSettingsModalOpen(false);
  };

  const typeIcons: Record<string, React.ReactNode> = {
    MILESTONE: <Kanban size={18} className="text-warning" />,
    FEEDBACK: <ChatCircleText size={18} className="text-info" />,
    THESIS: <GraduationCap size={18} className="text-success" />,
    SYSTEM: <Bell size={18} className="text-accent" />,
  };

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        title="Thông báo"
        description="Nhắc hạn, phản hồi của giảng viên và thay đổi trạng thái đề tài."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              icon={<Gear size={15} />}
              onClick={() => setSettingsModalOpen(true)}
            >
              Cài đặt thông báo
            </Button>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                icon={<Checks size={15} />}
                onClick={handleMarkAllRead}
              >
                Đọc tất cả ({unreadCount})
              </Button>
            )}
          </div>
        }
      />

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 mb-4">
        <button
          className={`px-3.5 py-1.5 text-[13px] font-medium rounded-lg transition-colors ${
            filter === "ALL"
              ? "bg-[var(--accent-subtle)] text-[var(--accent)]"
              : "text-tertiary hover:text-primary"
          }`}
          onClick={() => setFilter("ALL")}
        >
          Tất cả ({notifications.length})
        </button>
        <button
          className={`px-3.5 py-1.5 text-[13px] font-medium rounded-lg transition-colors ${
            filter === "UNREAD"
              ? "bg-[var(--accent-subtle)] text-[var(--accent)]"
              : "text-tertiary hover:text-primary"
          }`}
          onClick={() => setFilter("UNREAD")}
        >
          Chưa đọc ({unreadCount})
        </button>
      </div>

      {/* Notifications List (UC 8.1, 8.3, 8.8) */}
      <div className="flex flex-col gap-3">
        {filteredNotifications.length === 0 ? (
          <Card className="p-12 text-center text-tertiary">
            Không có thông báo nào.
          </Card>
        ) : (
          filteredNotifications.map((n) => (
            <Card
              key={n.id}
              className={`p-4 flex items-start justify-between gap-4 transition-colors ${
                !n.is_read ? "border-l-4 border-l-[var(--accent)] bg-[var(--bg-secondary)]" : ""
              }`}
            >
              <div className="flex items-start gap-3 flex-1">
                <div className="p-2 rounded-xl bg-[var(--bg-surface)] mt-0.5 flex-shrink-0">
                  {typeIcons[n.type]}
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className={`text-[14px] ${!n.is_read ? "font-semibold text-primary" : "font-medium text-secondary"}`}>
                      {n.title}
                    </h3>
                    {!n.is_read && <Badge variant="info">Mới</Badge>}
                  </div>
                  <p className="text-[13px] text-tertiary leading-relaxed mb-2">{n.content}</p>
                  <span className="text-[11px] font-mono text-muted flex items-center gap-1">
                    <Clock size={12} /> {n.created_at}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {!n.is_read && (
                  <button
                    className="btn-ghost p-1.5 rounded-lg text-tertiary hover:text-accent"
                    title="Đánh dấu đã đọc"
                    onClick={() => handleMarkRead(n.id)}
                  >
                    <Check size={16} />
                  </button>
                )}
                <button
                  className="btn-ghost p-1.5 rounded-lg text-tertiary hover:text-danger"
                  title="Xóa thông báo"
                  onClick={() => handleDelete(n.id)}
                >
                  <Trash size={16} />
                </button>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Modal: Notification Preferences (UC 8.2, 8.7) */}
      <Modal
        open={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        title="Cài đặt thông báo"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSettingsModalOpen(false)}>
              Hủy
            </Button>
            <Button variant="primary" onClick={handleSaveSettings}>
              Lưu Cài đặt
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 text-[14px]">
          <label className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] cursor-pointer">
            <div>
              <span className="font-medium block">Thông báo qua Email</span>
              <span className="text-[12px] text-tertiary">Gửi email khi có nhắc nhở milestone hoặc nhận xét mới</span>
            </div>
            <input
              type="checkbox"
              className="w-4 h-4 accent-[var(--accent)]"
              checked={emailNotify}
              onChange={(e) => setEmailNotify(e.target.checked)}
            />
          </label>

          <label className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] cursor-pointer">
            <div>
              <span className="font-medium block">Nhắc nhở Milestone sắp đến hạn</span>
              <span className="text-[12px] text-tertiary">Cảnh báo tự động trước 7 ngày và 1 ngày</span>
            </div>
            <input
              type="checkbox"
              className="w-4 h-4 accent-[var(--accent)]"
              checked={reminderNotify}
              onChange={(e) => setReminderNotify(e.target.checked)}
            />
          </label>

          <label className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] cursor-pointer">
            <div>
              <span className="font-medium block">Thông báo Phản hồi & Nhận xét</span>
              <span className="text-[12px] text-tertiary">Báo tức thì khi Giảng viên / Sinh viên trả lời comment</span>
            </div>
            <input
              type="checkbox"
              className="w-4 h-4 accent-[var(--accent)]"
              checked={feedbackNotify}
              onChange={(e) => setFeedbackNotify(e.target.checked)}
            />
          </label>
        </div>
      </Modal>
    </div>
  );
}

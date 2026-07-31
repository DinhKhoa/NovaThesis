"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  ChatCircleText,
  Check,
  Checks,
  Clock,
  Gear,
  GraduationCap,
  Kanban,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/layout";
import { Badge, Button, Card, EmptyState, Modal, Skeleton } from "@/components/ui";
import { toast } from "@/lib/toast";
import { isApiError } from "@/lib/api";
import { useAsync } from "@/lib/use-async";
import {
  notificationsApi,
  type NotificationItem,
  type NotificationPreference,
  type NotificationType,
} from "@/lib/services";
import { formatRelative } from "@/lib/format";

const TYPE_META: Record<
  NotificationType,
  { icon: React.ReactNode; label: string; description: string }
> = {
  MILESTONE: {
    icon: <Kanban size={18} className="text-warning" />,
    label: "Mốc tiến độ",
    description: "Nhắc hạn trước 7/3/1 ngày và cảnh báo khi đã quá hạn",
  },
  FEEDBACK: {
    icon: <ChatCircleText size={18} className="text-info" />,
    label: "Phản hồi & nhận xét",
    description: "Khi giảng viên hoặc sinh viên trả lời bình luận",
  },
  THESIS: {
    icon: <GraduationCap size={18} className="text-success" />,
    label: "Đề tài",
    description: "Kết quả duyệt đề tài và thay đổi trạng thái",
  },
  SYSTEM: {
    icon: <Bell size={18} className="text-accent" />,
    label: "Hệ thống",
    description: "Thông báo bảo trì và bảo mật — không thể tắt trong ứng dụng",
  },
};

const TYPES = Object.keys(TYPE_META) as NotificationType[];

export default function NotificationsPage() {
  const router = useRouter();
  const [filter, setFilter] = React.useState<"ALL" | "UNREAD">("ALL");
  const [typeFilter, setTypeFilter] = React.useState<"ALL" | NotificationType>("ALL");
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  const { data, loading, error, refetch, setData } = useAsync(
    () =>
      notificationsApi.list({
        filter,
        per_page: 30,
        ...(typeFilter !== "ALL" ? { type: typeFilter } : {}),
      }),
    [filter, typeFilter]
  );

  const items: NotificationItem[] = data?.data ?? [];
  const unreadCount = data?.unread_count ?? 0;

  /* Cập nhật lạc quan: đánh dấu đã đọc là thao tác không thể hỏng theo cách
     nào đáng kể, và chờ round-trip mới đổi màu dòng làm giao diện có cảm giác
     ì. Thất bại thì tải lại để state khớp server. */
  const markRead = async (n: NotificationItem) => {
    if (n.is_read) return;
    setData((prev) =>
      prev
        ? {
            ...prev,
            data: prev.data.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)),
            unread_count: Math.max(0, prev.unread_count - 1),
          }
        : prev
    );
    try {
      await notificationsApi.markRead(n.id);
    } catch {
      void refetch();
    }
  };

  const open = async (n: NotificationItem) => {
    await markRead(n);
    if (n.link) router.push(n.link);
  };

  const markAllRead = async () => {
    try {
      const { updated } = await notificationsApi.markAllRead();
      toast.success(updated > 0 ? `Đã đánh dấu ${updated} thông báo là đã đọc.` : "Không còn thông báo chưa đọc.");
      void refetch();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Thao tác thất bại");
    }
  };

  const remove = async (n: NotificationItem) => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            data: prev.data.filter((x) => x.id !== n.id),
            total: prev.total - 1,
            unread_count: n.is_read ? prev.unread_count : Math.max(0, prev.unread_count - 1),
          }
        : prev
    );
    try {
      await notificationsApi.remove(n.id);
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Xóa thất bại");
      void refetch();
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        title="Thông báo"
        description="Nhắc hạn, phản hồi của giảng viên và thay đổi trạng thái đề tài."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" icon={<Gear size={15} />} onClick={() => setSettingsOpen(true)}>
              Cài đặt
            </Button>
            {unreadCount > 0 && (
              <Button variant="ghost" icon={<Checks size={15} />} onClick={markAllRead}>
                Đọc tất cả ({unreadCount})
              </Button>
            )}
          </div>
        }
      />

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {(
          [
            ["ALL", `Tất cả${data ? ` (${data.total})` : ""}`],
            ["UNREAD", `Chưa đọc (${unreadCount})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={`px-3.5 py-1.5 text-[13px] font-medium rounded-lg transition-colors ${
              filter === key
                ? "bg-[var(--accent-subtle)] text-[var(--accent)]"
                : "text-tertiary hover:text-primary"
            }`}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}

        <span className="w-px h-4 bg-[var(--border-primary)] mx-1" aria-hidden="true" />

        <button
          className={`px-3 py-1.5 text-[12.5px] rounded-lg transition-colors ${
            typeFilter === "ALL" ? "text-primary font-medium" : "text-tertiary hover:text-primary"
          }`}
          onClick={() => setTypeFilter("ALL")}
        >
          Mọi loại
        </button>
        {TYPES.map((t) => (
          <button
            key={t}
            className={`px-3 py-1.5 text-[12.5px] rounded-lg transition-colors ${
              typeFilter === t ? "text-primary font-medium" : "text-tertiary hover:text-primary"
            }`}
            onClick={() => setTypeFilter(t)}
          >
            {TYPE_META[t].label}
          </button>
        ))}
      </div>

      {error ? (
        <EmptyState
          icon={<Warning size={16} />}
          title="Không tải được thông báo"
          description={error}
          action={
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
        />
      ) : loading && !data ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-[10px]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Bell size={16} />}
          title={filter === "UNREAD" ? "Không có thông báo chưa đọc" : "Chưa có thông báo nào"}
          description={
            filter === "UNREAD"
              ? "Bạn đã đọc hết. Quay lại tab “Tất cả” để xem lịch sử."
              : "Thông báo về mốc tiến độ, phản hồi và đề tài sẽ xuất hiện tại đây."
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((n) => (
            <Card
              key={n.id}
              className={`p-4 flex items-start justify-between gap-4 transition-colors ${
                !n.is_read ? "border-l-4 border-l-[var(--accent)] bg-[var(--bg-secondary)]" : ""
              }`}
            >
              <button
                className="flex items-start gap-3 flex-1 text-left min-w-0"
                onClick={() => void open(n)}
              >
                <span className="p-2 rounded-xl bg-[var(--bg-surface)] mt-0.5 flex-shrink-0">
                  {TYPE_META[n.type].icon}
                </span>

                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-[14px] ${
                        !n.is_read ? "font-semibold text-primary" : "font-medium text-secondary"
                      }`}
                    >
                      {n.title}
                    </span>
                    {!n.is_read && <Badge variant="info">Mới</Badge>}
                  </span>
                  <span className="block text-[13px] text-tertiary leading-relaxed mb-2">
                    {n.content}
                  </span>
                  <span className="text-[11px] tnum text-muted flex items-center gap-1">
                    <Clock size={12} /> {formatRelative(n.created_at)}
                  </span>
                </span>
              </button>

              <div className="flex items-center gap-1 flex-shrink-0">
                {!n.is_read && (
                  <button
                    className="btn-ghost p-1.5 rounded-lg text-tertiary hover:text-accent"
                    title="Đánh dấu đã đọc"
                    onClick={() => void markRead(n)}
                  >
                    <Check size={16} />
                  </button>
                )}
                <button
                  className="btn-ghost p-1.5 rounded-lg text-tertiary hover:text-danger"
                  title="Xóa thông báo"
                  onClick={() => void remove(n)}
                >
                  <Trash size={16} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <PreferencesModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

/* ==========================================================================
   CÀI ĐẶT NHẬN THÔNG BÁO (UC 8.7)
   ========================================================================== */

function PreferencesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, loading } = useAsync(() => notificationsApi.preferences(), [open], {
    enabled: open,
  });
  /* Bản nháp chỉ tồn tại sau khi người dùng bấm vào một ô; trước đó hiển thị
     thẳng dữ liệu từ server. Suy ra lúc render nên không cần effect đồng bộ. */
  const [edited, setDraft] = React.useState<NotificationPreference[] | null>(null);
  const draft = edited ?? data;
  const [saving, setSaving] = React.useState(false);

  const toggle = (type: NotificationType, channel: "in_app" | "email") => {
    setDraft((prev) =>
      prev?.map((p) => (p.type === type ? { ...p, [channel]: !p[channel] } : p)) ?? prev
    );
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await notificationsApi.savePreferences(draft);
      toast.success("Đã lưu cài đặt nhận thông báo.");
      onClose();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Không lưu được cài đặt");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cài đặt thông báo"
      description="Chọn kênh nhận cho từng loại sự kiện."
      width="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Hủy
          </Button>
          <Button variant="primary" loading={saving} disabled={!draft} onClick={save}>
            Lưu cài đặt
          </Button>
        </>
      }
    >
      {loading || !draft ? (
        <div className="flex flex-col gap-2">
          {TYPES.map((t) => (
            <Skeleton key={t} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 pb-1">
            <span className="eyebrow">Loại thông báo</span>
            <span className="eyebrow w-16 text-center">Trong app</span>
            <span className="eyebrow w-16 text-center">Email</span>
          </div>

          {draft.map((pref) => {
            const meta = TYPE_META[pref.type];
            /* Thông báo hệ thống mang cả cảnh báo bảo mật; server ép in_app=true
               nên khoá luôn ô này thay vì để người dùng bấm rồi thấy nó bật lại. */
            const lockInApp = pref.type === "SYSTEM";

            return (
              <div
                key={pref.type}
                className="grid grid-cols-[1fr_auto_auto] gap-3 items-center p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)]"
              >
                <div className="min-w-0">
                  <span className="font-medium text-[13.5px] flex items-center gap-2">
                    {meta.icon}
                    {meta.label}
                  </span>
                  <span className="text-[12px] text-tertiary block mt-0.5">{meta.description}</span>
                </div>

                <label className="w-16 flex justify-center">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-[var(--accent)]"
                    checked={pref.in_app || lockInApp}
                    disabled={lockInApp}
                    onChange={() => toggle(pref.type, "in_app")}
                    aria-label={`Thông báo trong ứng dụng cho ${meta.label}`}
                  />
                </label>

                <label className="w-16 flex justify-center">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-[var(--accent)]"
                    checked={pref.email}
                    onChange={() => toggle(pref.type, "email")}
                    aria-label={`Email cho ${meta.label}`}
                  />
                </label>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

"use client";

import React from "react";
import {
  FloppyDisk,
  HardDrives,
  Robot,
  Shield,
  SlidersHorizontal,
  Warning,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/layout";
import {
  Button,
  Card,
  Checkbox,
  EmptyState,
  Input,
  Skeleton,
} from "@/components/ui";
import { toast } from "@/lib/toast";
import { isApiError } from "@/lib/api";
import { useAsync } from "@/lib/use-async";
import { adminApi, type SystemConfigItem } from "@/lib/services";
import { formatDate, formatRelative } from "@/lib/format";

/* Nhóm hiển thị bám đúng cột `category` của API. Trước đây trang gộp cứng
   SECURITY + STORAGE + GENERAL vào một thẻ "Bảo mật & Giới hạn", nên thêm một
   tham số mới ở backend là nó rơi vào nhóm sai mà không ai biết. */
const CATEGORY_META: Record<
  SystemConfigItem["category"],
  { title: string; icon: React.ReactNode }
> = {
  AI: {
    title: "Cấu hình Trợ lý AI & Vector Store",
    icon: <Robot size={20} style={{ color: "var(--accent)" }} />,
  },
  STORAGE: {
    title: "Lưu trữ & giới hạn tệp",
    icon: <HardDrives size={20} style={{ color: "var(--accent)" }} />,
  },
  SECURITY: {
    title: "Bảo mật & chính sách tài khoản",
    icon: <Shield size={20} style={{ color: "var(--accent)" }} />,
  },
  GENERAL: {
    title: "Vận hành chung",
    icon: <SlidersHorizontal size={20} style={{ color: "var(--accent)" }} />,
  },
};

/* Thứ tự trình bày cố định ở client. API sắp theo `category` chữ cái (AI,
   GENERAL, SECURITY, STORAGE) — thứ tự đó không phản ánh mức độ hay dùng, và
   quan trọng hơn là nó sẽ đổi khi có nhóm mới, khiến các thẻ nhảy chỗ. */
const CATEGORY_ORDER: SystemConfigItem["category"][] = [
  "AI",
  "STORAGE",
  "SECURITY",
  "GENERAL",
];

const SECRET_MASK = "••••••••";

export default function AdminSettingsPage() {
  const { data, loading, error, refetch, setData } = useAsync(() => adminApi.configs(), []);

  /* Chỉ giữ những khoá người dùng đã chạm vào. Sao chép cả bảng vào state rồi
     PUT toàn bộ sẽ ghi đè cả những tham số mà Admin khác vừa đổi ở tab bên
     cạnh, và làm bẩn nhật ký kiểm toán bằng những dòng "sửa" không hề sửa gì. */
  const [edits, setEdits] = React.useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
  const [saving, setSaving] = React.useState(false);

  const configs = React.useMemo(() => data ?? [], [data]);

  // Gõ lại đúng giá trị cũ thì không còn là thay đổi — nếu không so sánh, nút
  // Lưu sẽ sáng lên cho một lô rỗng và server trả 422 "Chưa có tham số nào".
  const changed = React.useMemo(
    () =>
      configs.filter(
        (c) => edits[c.config_key] !== undefined && edits[c.config_key] !== c.config_value
      ),
    [configs, edits]
  );

  const setValue = React.useCallback((key: string, next: string) => {
    setEdits((prev) => ({ ...prev, [key]: next }));
    // Lỗi từ lần lưu trước đã hết ý nghĩa ngay khi người dùng sửa lại ô đó.
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const rest = { ...prev };
      delete rest[key];
      return rest;
    });
  }, []);

  const handleSave = async () => {
    if (changed.length === 0) return;

    setSaving(true);
    setFieldErrors({});
    try {
      const updated = await adminApi.saveConfigs(
        changed.map((c) => ({
          config_key: c.config_key,
          config_value: edits[c.config_key] ?? c.config_value,
        }))
      );
      // Phản hồi là toàn bộ bảng sau khi lưu, kèm `updated_by_name` và
      // `updated_at` mới — dùng luôn thay vì gọi lại GET.
      setData(updated);
      setEdits({});
      toast.success(`Đã lưu ${changed.length} tham số. Thay đổi có hiệu lực ngay.`);
    } catch (err) {
      // Backend gắn lỗi theo từng khoá cấu hình (422). Đưa về đúng ô để Admin
      // không phải đoán "Giá trị phải là số nguyên" đang nói về tham số nào.
      if (isApiError(err) && err.errors) setFieldErrors(err.errors);
      toast.error(isApiError(err) ? err.message : "Không lưu được cấu hình.");
    } finally {
      setSaving(false);
    }
  };

  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    items: configs.filter((c) => c.category === category),
  })).filter((g) => g.items.length > 0);

  return (
    <div>
      <PageHeader
        title="Cấu hình"
        description="Tham số vận hành: mô hình AI, giới hạn dung lượng và chính sách tài khoản."
        actions={
          <Button
            variant="primary"
            icon={<FloppyDisk size={15} />}
            loading={saving}
            disabled={changed.length === 0}
            onClick={handleSave}
          >
            {changed.length > 0 ? `Lưu ${changed.length} thay đổi` : "Lưu cấu hình"}
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6">
        {error ? (
          <EmptyState
            icon={<Warning size={16} />}
            title="Không tải được cấu hình hệ thống"
            description={error}
            action={
              <Button variant="secondary" size="sm" onClick={() => void refetch()}>
                Thử lại
              </Button>
            }
          />
        ) : loading && !data ? (
          [0, 1].map((i) => (
            <Card key={i} className="p-6">
              <Skeleton className="h-5 rounded-md mb-4" width="16rem" height="20px" />
              <div className="flex flex-col gap-4">
                {[0, 1, 2].map((j) => (
                  <div
                    key={j}
                    className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center"
                  >
                    <Skeleton className="h-4 rounded-md" width="12rem" height="16px" />
                    <div className="md:col-span-2">
                      <Skeleton className="h-8 rounded-[8px]" height="32px" />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))
        ) : groups.length === 0 ? (
          <EmptyState
            icon={<SlidersHorizontal size={16} />}
            title="Chưa có tham số nào"
            description="Bảng cấu hình đang trống. Chạy lại bước seed dữ liệu của backend để nạp bộ tham số mặc định."
          />
        ) : (
          groups.map((group) => (
            <Card key={group.category} className="p-6">
              <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
                {CATEGORY_META[group.category].icon}
                {CATEGORY_META[group.category].title}
              </h2>

              <div className="flex flex-col gap-4">
                {group.items.map((c) => (
                  <ConfigField
                    key={c.id}
                    config={c}
                    value={edits[c.config_key] ?? c.config_value}
                    error={fieldErrors[c.config_key]?.[0]}
                    onChange={(next) => setValue(c.config_key, next)}
                  />
                ))}
              </div>
            </Card>
          ))
        )}

      </div>
    </div>
  );
}

/* ==========================================================================
   MỘT THAM SỐ CẤU HÌNH (UC 2.9)
   ========================================================================== */

function ConfigField({
  config,
  value,
  error,
  onChange,
}: {
  config: SystemConfigItem;
  value: string;
  error?: string;
  onChange: (next: string) => void;
}) {
  const inputId = React.useId();

  /* Khoá bí mật: `Yêu cầu dự án.md` §2.1 quy định giá trị thật nằm trong biến
     môi trường, bảng này chỉ ghi nhận sự tồn tại của khoá. Server đã che giá trị
     trước khi trả về và từ chối mọi lệnh ghi lên khoá bí mật, nên ô nhập phải
     khoá luôn — bày ra một ô gõ được rồi trả 422 là bắt Admin tự dò ra luật. */
  const control = config.is_secret ? (
    <Input
      id={inputId}
      value={SECRET_MASK}
      readOnly
      disabled
      helperText="Khoá bí mật đọc từ biến môi trường, không sửa được tại đây"
    />
  ) : config.value_type === "BOOLEAN" ? (
    <>
      <Checkbox
        id={inputId}
        checked={value === "true"}
        onChange={(e) => onChange(e.target.checked ? "true" : "false")}
        label={value === "true" ? "Đang bật" : "Đang tắt"}
      />
      {error && <p className="text-[11.5px] text-danger mt-1">{error}</p>}
    </>
  ) : config.value_type === "INT" ? (
    <Input
      id={inputId}
      type="number"
      value={value}
      error={error}
      onChange={(e) => onChange(e.target.value)}
    />
  ) : (
    <Input
      id={inputId}
      value={value}
      error={error}
      onChange={(e) => onChange(e.target.value)}
      helperText={
        config.value_type === "JSON" ? "Giá trị phải là chuỗi JSON hợp lệ" : undefined
      }
    />
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
      <div>
        <label
          className="text-[13px] font-mono font-medium block text-primary"
          htmlFor={inputId}
        >
          {config.config_key}
        </label>
        {config.description && (
          <span className="text-[12px] text-tertiary">{config.description}</span>
        )}
        {/* UC 2.8 kiểm toán cấu hình: câu hỏi luôn là "ai đổi tham số này và đổi
            lúc nào", nên câu trả lời phải nằm ngay cạnh tham số. */}
        <span className="text-[11.5px] text-muted block mt-0.5">
          Sửa lần cuối: {config.updated_by_name ?? "hệ thống"} ·{" "}
          {formatRelative(config.updated_at)}
        </span>
      </div>
      <div className="md:col-span-2">{control}</div>
    </div>
  );
}

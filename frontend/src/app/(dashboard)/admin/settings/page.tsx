"use client";

import React from "react";
import { Gear, FloppyDisk, Sliders, Robot, HardDrive, Shield } from "@phosphor-icons/react";
import { PageHeader } from "@/components/layout";
import { Card, Button, Input, Textarea } from "@/components/ui";
import { toast } from "@/lib/toast";

interface SystemConfig {
  id: number;
  config_key: string;
  config_value: string;
  description: string;
  category: "AI" | "STORAGE" | "SECURITY" | "GENERAL";
}

const mockConfigs: SystemConfig[] = [
  {
    id: 1,
    config_key: "AI_MODEL_NAME",
    config_value: "gpt-4o",
    description: "Mô hình ngôn ngữ chính sử dụng cho Chat AI & RAG",
    category: "AI",
  },
  {
    id: 2,
    config_key: "AI_EMBEDDING_MODEL",
    config_value: "text-embedding-3-small",
    description: "Mô hình tạo vector embedding (1536 chiều, pgvector)",
    category: "AI",
  },
  {
    id: 3,
    config_key: "MAX_FILE_SIZE_MB",
    config_value: "50",
    description: "Kích thước tệp tài liệu tối đa được phép tải lên (MB)",
    category: "STORAGE",
  },
  {
    id: 4,
    config_key: "MAX_LOGIN_ATTEMPTS",
    config_value: "5",
    description: "Số lần đăng nhập sai tối đa trước khi tạm khóa 15 phút",
    category: "SECURITY",
  },
  {
    id: 5,
    config_key: "SYSTEM_MAINTENANCE_MODE",
    config_value: "false",
    description: "Bật/Tắt chế độ bảo trì toàn hệ thống",
    category: "GENERAL",
  },
];

export default function AdminSettingsPage() {
  const [configs, setConfigs] = React.useState<SystemConfig[]>(mockConfigs);
  const [saving, setSaving] = React.useState(false);

  const handleValueChange = (id: number, val: string) => {
    setConfigs((prev) =>
      prev.map((c) => (c.id === id ? { ...c, config_value: val } : c))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // API call: api.put("/admin/configs", { configs })
      toast.success("Cấu hình hệ thống đã được lưu thành công!");
    } catch {
      toast.error("Không thể lưu cấu hình");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Cấu hình hệ thống (System Configs)"
        description="Quản lý các thông số kỹ thuật, AI model, dung lượng lưu trữ (UC 2.7)."
        actions={
          <Button
            variant="primary"
            icon={<FloppyDisk size={18} />}
            loading={saving}
            onClick={handleSave}
          >
            Lưu cấu hình
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6">
        {/* AI Configurations */}
        <Card className="p-6">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
            <Robot size={20} style={{ color: "var(--accent)" }} />
            Cấu hình Trợ lý AI & Vector Store
          </h2>

          <div className="flex flex-col gap-4">
            {configs
              .filter((c) => c.category === "AI")
              .map((c) => (
                <div key={c.id} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                  <div>
                    <label className="text-[13px] font-mono font-medium block text-primary">
                      {c.config_key}
                    </label>
                    <span className="text-[12px] text-tertiary">{c.description}</span>
                  </div>
                  <div className="md:col-span-2">
                    <Input
                      value={c.config_value}
                      onChange={(e) => handleValueChange(c.id, e.target.value)}
                    />
                  </div>
                </div>
              ))}
          </div>
        </Card>

        {/* Security & System Storage */}
        <Card className="p-6">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
            <Shield size={20} style={{ color: "var(--accent)" }} />
            Bảo mật & Giới hạn hệ thống
          </h2>

          <div className="flex flex-col gap-4">
            {configs
              .filter((c) => c.category === "SECURITY" || c.category === "STORAGE" || c.category === "GENERAL")
              .map((c) => (
                <div key={c.id} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                  <div>
                    <label className="text-[13px] font-mono font-medium block text-primary">
                      {c.config_key}
                    </label>
                    <span className="text-[12px] text-tertiary">{c.description}</span>
                  </div>
                  <div className="md:col-span-2">
                    <Input
                      value={c.config_value}
                      onChange={(e) => handleValueChange(c.id, e.target.value)}
                    />
                  </div>
                </div>
              ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

"use client";

import React from "react";
import { GraduationCap } from "@phosphor-icons/react";
import { Select } from "@/components/ui";
import type { Thesis } from "@/lib/services";

/**
 * Bộ chọn phạm vi đề tài — cấp cao nhất của mô hình "notebook".
 *
 * LUÔN hiển thị, kể cả khi chỉ có một đề tài. Trước đây nó tự ẩn trong trường
 * hợp đó, với lý do "một lựa chọn duy nhất không cho thêm thông tin gì". Lý do
 * ấy sai ở một chỗ quan trọng: người dùng không nhìn ô này để CHỌN, họ nhìn để
 * biết câu hỏi sắp tới sẽ được đối chiếu với kho tài liệu nào. Ẩn đi thì phạm vi
 * trở thành trạng thái vô hình.
 */
export function ThesisScopeSelect({
  theses,
  value,
  onChange,
}: {
  theses: Thesis[];
  value: number | null;
  onChange: (id: number) => void;
}) {
  if (theses.length === 0) return null;

  const only = theses.length === 1 ? theses[0] : null;

  if (only) {
    return (
      <div
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-[8px] min-w-0"
        style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-secondary)" }}
        title={only.title}
      >
        <GraduationCap size={13} className="text-tertiary flex-shrink-0" />
        <span className="text-[12px] text-secondary truncate">{only.title}</span>
      </div>
    );
  }

  return (
    <Select
      value={value ?? ""}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label="Đề tài — phạm vi tài liệu của trợ lý"
    >
      {theses.map((t) => (
        <option key={t.id} value={t.id}>
          {t.title}
        </option>
      ))}
    </Select>
  );
}

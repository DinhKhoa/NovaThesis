"use client";

import React from "react";
import type { AnswerMode } from "@/lib/services";

/** Chuyển giữa "chỉ tài liệu" và "tài liệu + kiến thức AI". */
export function AnswerModeToggle({
  value,
  onChange,
  disabled,
}: {
  value: AnswerMode;
  onChange: (mode: AnswerMode) => void;
  disabled: boolean;
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5 p-0.5 rounded-[8px]"
      style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-secondary)" }}
      role="radiogroup"
      aria-label="Chế độ trả lời"
    >
      {(
        [
          {
            mode: "STRICT" as const,
            label: "Chỉ tài liệu",
            hint: "Không tìm thấy trong tài liệu thì trợ lý nói thẳng là không có.",
          },
          {
            mode: "HYBRID" as const,
            label: "Tài liệu + AI",
            hint: "Được bổ sung kiến thức chung, nhưng phần đó luôn tách riêng và có cảnh báo.",
          },
        ] as const
      ).map((opt) => {
        const active = value === opt.mode;
        return (
          <button
            key={opt.mode}
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(opt.mode)}
            title={opt.hint}
            className="px-2 py-1 rounded-[6px] text-[11.5px] transition-colors disabled:opacity-40"
            style={{
              background: active ? "var(--bg-surface)" : "transparent",
              color: active ? "var(--fg-primary)" : "var(--fg-tertiary)",
              fontWeight: active ? 600 : 400,
              boxShadow: active ? "var(--shadow-sm)" : undefined,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

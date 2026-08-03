"use client";

import React from "react";
import { Scales } from "@phosphor-icons/react";
import {
  Badge,
  Button,
  EmptyState,
  Panel,
  ProgressBar,
  Skeleton,
  Textarea,
} from "@/components/ui";
import { toast } from "@/lib/toast";
import { isApiError } from "@/lib/api";
import { aiApi, type PlagiarismResult, type Thesis } from "@/lib/services";
import { formatPercent } from "@/lib/format";
import { ThesisScopeSelect } from "./ThesisScopeSelect";
import { openSourceDocument } from "../lib/open-source";

/** Ngưỡng của backend (`plagiarismSchema`). Dưới mức này không gọi API. */
const PLAGIARISM_MIN_CHARS = 50;
const PLAGIARISM_MAX_CHARS = 20_000;

/** UC 6.15 — kiểm tra trùng lặp một đoạn văn bản với kho tài liệu. */
export function PlagiarismPanel({
  theses,
  thesis,
  onThesisChange,
}: {
  theses: Thesis[];
  thesis: Thesis | null;
  onThesisChange: (id: number) => void;
}) {
  const [text, setText] = React.useState("");
  const [checking, setChecking] = React.useState(false);
  const [result, setResult] = React.useState<PlagiarismResult | null>(null);

  const trimmed = text.trim();
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
  const tooShort = trimmed.length < PLAGIARISM_MIN_CHARS;

  const run = async () => {
    if (!thesis || tooShort) return;
    setChecking(true);
    setResult(null);
    try {
      setResult(await aiApi.plagiarism(thesis.id, trimmed));
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Không kiểm tra được đoạn văn bản.");
    } finally {
      setChecking(false);
    }
  };

  /* A bare number tells a student nothing. Bands turn it into a verdict they
     can act on. */
  const verdict = !result
    ? null
    : result.similarity < 20
      ? { label: "Trong ngưỡng cho phép", tone: "success" as const }
      : result.similarity < 35
        ? { label: "Cần rà soát lại", tone: "warning" as const }
        : { label: "Vượt ngưỡng cho phép", tone: "danger" as const };

  return (
    <Panel
      title="Kiểm tra trùng lặp"
      icon={<Scales size={14} />}
      className="max-w-3xl"
      actions={
        <ThesisScopeSelect
          theses={theses}
          value={thesis?.id ?? null}
          onChange={onThesisChange}
        />
      }
    >
      {theses.length === 0 ? (
        <EmptyState
          compact
          icon={<Scales size={15} />}
          title="Chưa có đề tài nào"
          description="Kết quả kiểm tra được lưu theo đề tài. Hãy tạo hoặc tham gia một đề tài trước."
        />
      ) : (
        <>
          <Textarea
            label="Đoạn văn bản cần kiểm tra"
            rows={7}
            maxLength={PLAGIARISM_MAX_CHARS}
            placeholder="Dán một đoạn trong luận văn của bạn…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            helperText={
              tooShort
                ? `${wordCount} từ · cần tối thiểu ${PLAGIARISM_MIN_CHARS} ký tự (${trimmed.length}/${PLAGIARISM_MIN_CHARS})`
                : `${wordCount} từ`
            }
          />

          <Button
            variant="primary"
            className="mt-3"
            loading={checking}
            disabled={!thesis || tooShort}
            onClick={() => void run()}
          >
            Kiểm tra
          </Button>

          {checking ? (
            <Skeleton className="h-40 rounded-[10px] mt-4" />
          ) : (
            result &&
            verdict && (
              <div
                className="mt-4 p-3.5 rounded-[10px] fade-in"
                style={{ border: "1px solid var(--border-primary)" }}
              >
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-[26px] font-semibold tnum leading-none">
                    {formatPercent(result.similarity)}
                  </span>
                  <Badge variant={verdict.tone}>{verdict.label}</Badge>
                </div>
                <p className="text-[12.5px] text-tertiary mb-3">
                  Tỷ lệ trùng lặp so với kho tài liệu học thuật và các nguồn công khai.
                </p>

                <ProgressBar value={result.similarity} tone={verdict.tone} showLabel={false} />

                <div className="eyebrow mt-3 mb-1.5">Nguồn trùng khớp</div>
                {result.matches.length === 0 ? (
                  <p className="text-[12.5px] text-tertiary">
                    Không có tài liệu nào trong phạm vi bạn được đọc trùng với đoạn này.
                  </p>
                ) : (
                  <ul className="flex flex-col">
                    {result.matches.map((m, i) => {
                      // Nguồn ngoài kho tài liệu không có id để mở; chỉ những
                      // nguồn có bản ghi thật mới bấm được.
                      const documentId = m.document_id;
                      return (
                        <li
                          key={`${m.source}-${i}`}
                          className="flex items-center justify-between gap-3 py-1.5 text-[12.5px]"
                          style={{
                            borderTop: i > 0 ? "1px solid var(--border-secondary)" : undefined,
                          }}
                        >
                          {documentId !== null ? (
                            <button
                              onClick={() => void openSourceDocument(documentId)}
                              className="text-secondary truncate text-left"
                              title={`Mở tài liệu ${m.source}`}
                            >
                              {m.source}
                            </button>
                          ) : (
                            <span className="text-secondary truncate">{m.source}</span>
                          )}
                          <span className="tnum text-tertiary whitespace-nowrap">
                            {formatPercent(m.percent)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )
          )}
        </>
      )}
    </Panel>
  );
}

"use client";

import React from "react";
import { FileText, MagnifyingGlass, Warning } from "@phosphor-icons/react";
import { Badge, Button, EmptyState, Input, Panel, Skeleton } from "@/components/ui";
import { useAsync } from "@/lib/use-async";
import { aiApi, type Thesis } from "@/lib/services";
import { ThesisScopeSelect } from "./ThesisScopeSelect";
import { openSourceDocument } from "../lib/open-source";

/** UC 6.4 — tìm kiếm ngữ nghĩa trong phạm vi tài liệu người dùng đọc được. */
export function SemanticSearchPanel({
  theses,
  thesisId,
  onThesisChange,
}: {
  theses: Thesis[];
  thesisId: number | null;
  onThesisChange: (id: number) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [submitted, setSubmitted] = React.useState("");

  /* Đếm số lần bấm "Tìm". Không có nó, gửi lại đúng câu cũ sẽ không đổi
     dependency nào và `useAsync` đứng yên — người dùng bấm mà không thấy gì. */
  const [attempt, setAttempt] = React.useState(0);

  const { data, loading, error, refetch } = useAsync(
    () => aiApi.search(submitted, thesisId),
    [submitted, attempt, thesisId],
    // Backend yêu cầu tối thiểu 2 ký tự; dưới ngưỡng đó thì chưa gọi gì cả.
    { enabled: submitted.length >= 2 }
  );

  const results = data?.results ?? [];

  const run = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;
    setSubmitted(q);
    setAttempt((n) => n + 1);
  };

  return (
    <Panel
      title="Tìm kiếm ngữ nghĩa"
      icon={<MagnifyingGlass size={14} />}
      actions={
        <ThesisScopeSelect theses={theses} value={thesisId} onChange={onThesisChange} />
      }
    >
      <p className="text-[12.5px] text-tertiary mb-3 max-w-xl">
        Tìm theo ý nghĩa của câu thay vì từ khóa chính xác. Ví dụ: “các đoạn nói về
        đánh đổi giữa tốc độ và độ chính xác” sẽ khớp cả những trang không chứa đúng
        từ đó.
      </p>

      <form onSubmit={run} className="flex items-start gap-2 max-w-2xl mb-4">
        <Input
          placeholder="Mô tả điều bạn đang tìm…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          wrapperClassName="flex-1"
          aria-label="Nội dung tìm kiếm"
        />
        <Button
          type="submit"
          variant="primary"
          loading={loading}
          disabled={query.trim().length < 2}
        >
          Tìm
        </Button>
      </form>

      {error ? (
        <EmptyState
          icon={<Warning size={15} />}
          title="Không tìm kiếm được"
          description={error}
          action={
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
        />
      ) : loading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[76px] rounded-[10px]" />
          ))}
        </div>
      ) : !data ? null : (
        <>
          {/* Bằng chứng đây là tìm kiếm vector thật chứ không phải trang trí:
              phạm vi đã quét và thời gian máy chủ thực sự bỏ ra. */}
          <p className="text-[11.5px] text-muted tnum mb-2">
            Tìm trong {data.scope_documents} tài liệu · {data.took_ms}ms
          </p>

          {results.length === 0 ? (
            <EmptyState
              compact
              icon={<MagnifyingGlass size={15} />}
              title="Không có đoạn nào đủ tương đồng"
              description="Thử diễn đạt lại, hoặc kiểm tra tài liệu đã được lập chỉ mục chưa."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {results.map((r) => (
                <div
                  key={r.chunk_id}
                  className="p-3 rounded-[10px]"
                  style={{ border: "1px solid var(--border-primary)" }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <FileText size={14} className="text-tertiary flex-shrink-0" />
                    <button
                      onClick={() => void openSourceDocument(r.document_id)}
                      className="text-[13px] font-medium truncate flex-1 text-left"
                      title={`Mở tài liệu ${r.doc_title}`}
                    >
                      {r.doc_title}
                    </button>
                    {r.page !== null && (
                      <span className="text-[11.5px] text-muted tnum whitespace-nowrap">
                        tr. {r.page}
                      </span>
                    )}
                    <Badge variant="accent">{(r.score * 100).toFixed(0)}%</Badge>
                  </div>
                  <p className="text-[12.5px] text-secondary leading-relaxed">{r.snippet}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

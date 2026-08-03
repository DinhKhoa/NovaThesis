"use client";

import React from "react";
import { ListChecks, Sparkle, Warning } from "@phosphor-icons/react";
import { Button, Checkbox, EmptyState, Panel, Skeleton } from "@/components/ui";
import { toast } from "@/lib/toast";
import { isApiError } from "@/lib/api";
import { useAsync } from "@/lib/use-async";
import { aiApi, type AISuggestion, type Thesis } from "@/lib/services";
import { formatDate, formatRelative } from "@/lib/format";
import { ThesisScopeSelect } from "./ThesisScopeSelect";

/**
 * Hạn dự kiến nếu chấp nhận gợi ý ngay bây giờ.
 *
 * Mô hình chỉ đưa ra "sau bao nhiêu tuần" vì nó không biết hôm nay là ngày nào;
 * backend quy đổi sang ngày thật tại thời điểm bấm chấp nhận. Hiển thị đúng phép
 * quy đổi đó để người dùng thấy trước mốc mình sắp tạo.
 */
function deadlineFromWeeks(weeks: number): Date {
  return new Date(Date.now() + weeks * 7 * 86_400_000);
}

/** UC 6.10 – 6.13 — gợi ý lộ trình do AI đề xuất. */
export function RoadmapPanel({
  theses,
  thesis,
  onThesisChange,
}: {
  theses: Thesis[];
  thesis: Thesis | null;
  onThesisChange: (id: number) => void;
}) {
  const { data, loading, error, refetch } = useAsync(
    () => aiApi.suggestions(thesis?.id ?? 0),
    [thesis?.id],
    { enabled: thesis !== null }
  );

  const suggestions = data ?? [];

  const [creating, setCreating] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);

  /* Lưu những mục BỊ BỎ chọn, không phải những mục được chọn: mặc định cả lộ
     trình đều được giữ, nên trạng thái rỗng đã là đúng và không cần effect nào
     đồng bộ lại mỗi lần danh sách gợi ý đổi. */
  const [unchecked, setUnchecked] = React.useState<Set<string>>(new Set());

  const toggleItem = (key: string) => {
    setUnchecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /* Đề tài đã hoàn thành bị đóng băng (business rule UC 3.13) nên server từ chối
     mọi thao tác `contribute`. Ẩn nút thay vì để người dùng bấm rồi nhận 403 và
     tự suy ra luật nghiệp vụ.

     Nhánh `isAdmin` trước đây ở đây đã bỏ: cả trang này chỉ mở cho sinh viên và
     giảng viên (xem `RequireRole` ở `AIChatPage`), nên nó vĩnh viễn sai. */
  const canContribute = thesis !== null && thesis.status !== "COMPLETED";

  const createSuggestion = async () => {
    if (!thesis) return;
    setCreating(true);
    try {
      await aiApi.suggest(thesis.id);
      toast.success("Trợ lý đã đề xuất một lộ trình mới.");
      void refetch();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Không tạo được gợi ý lộ trình.");
    } finally {
      setCreating(false);
    }
  };

  const selectedIndexes = (s: AISuggestion) =>
    s.payload.map((_, i) => i).filter((i) => !unchecked.has(`${s.id}:${i}`));

  const accept = async (s: AISuggestion) => {
    const indexes = selectedIndexes(s);
    if (indexes.length === 0) return;
    setBusy(`accept:${s.id}`);
    try {
      const created = await aiApi.acceptSuggestion(s.id, indexes);
      toast.success(
        `Đã tạo ${created.length || indexes.length} mốc tiến độ từ gợi ý của trợ lý.`
      );
      void refetch();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Không tạo được mốc tiến độ.");
    } finally {
      setBusy(null);
    }
  };

  const regenerate = async (s: AISuggestion) => {
    setBusy(`regenerate:${s.id}`);
    try {
      await aiApi.regenerateSuggestion(s.id);
      toast.success("Trợ lý đã đề xuất một lộ trình khác.");
      void refetch();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Không tạo lại được gợi ý.");
    } finally {
      setBusy(null);
    }
  };

  const reject = async (s: AISuggestion) => {
    setBusy(`reject:${s.id}`);
    try {
      await aiApi.rejectSuggestion(s.id);
      toast.success("Đã bỏ qua gợi ý này.");
      void refetch();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Không bỏ qua được gợi ý.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel
      title="Gợi ý lộ trình"
      icon={<ListChecks size={14} />}
      actions={
        <>
          <ThesisScopeSelect
            theses={theses}
            value={thesis?.id ?? null}
            onChange={onThesisChange}
          />
          {canContribute && (
            <Button
              variant="primary"
              size="sm"
              icon={<Sparkle size={14} />}
              loading={creating}
              onClick={() => void createSuggestion()}
            >
              Nhận gợi ý
            </Button>
          )}
        </>
      }
    >
      <p className="text-[12.5px] text-tertiary mb-3 max-w-xl">
        Trợ lý đọc tên đề tài, mô tả và các mốc đã có để đề xuất những việc tiếp theo.
        Bỏ chọn phần chưa phù hợp rồi tạo phần còn lại thành mốc tiến độ thật.
      </p>

      {theses.length === 0 ? (
        <EmptyState
          compact
          icon={<ListChecks size={15} />}
          title="Chưa có đề tài nào"
          description="Lộ trình gắn với một đề tài cụ thể. Hãy tạo hoặc tham gia một đề tài trước."
        />
      ) : error ? (
        <EmptyState
          icon={<Warning size={15} />}
          title="Không tải được gợi ý"
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
            <Skeleton key={i} className="h-14 rounded-[10px]" />
          ))}
        </div>
      ) : suggestions.length === 0 ? (
        <EmptyState
          compact
          icon={<Sparkle size={15} />}
          title="Chưa có gợi ý nào đang chờ"
          description={
            canContribute
              ? "Bấm “Nhận gợi ý” để trợ lý dựng một lộ trình từ đề tài và các mốc hiện có."
              : "Đề tài đã hoàn thành nên không tạo thêm mốc tiến độ được nữa."
          }
        />
      ) : (
        <div className="flex flex-col gap-5">
          {suggestions.map((s) => {
            const chosen = selectedIndexes(s);
            return (
              <div key={s.id}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="eyebrow">Lần đề xuất {s.attempt}</span>
                  <span className="text-[11.5px] text-muted tnum">
                    {formatRelative(s.created_at)}
                  </span>
                  {s.model_name && <span className="chip">{s.model_name}</span>}
                </div>

                <ul className="flex flex-col">
                  {s.payload.map((item, i) => {
                    const key = `${s.id}:${i}`;
                    return (
                      <li
                        key={key}
                        className="flex items-start gap-2.5 py-2"
                        style={{
                          borderTop: i > 0 ? "1px solid var(--border-secondary)" : undefined,
                        }}
                      >
                        <span className="mt-0.5 flex-shrink-0">
                          <Checkbox
                            checked={!unchecked.has(key)}
                            disabled={!canContribute}
                            onChange={() => toggleItem(key)}
                            aria-label={`Chọn nhiệm vụ ${item.name}`}
                          />
                        </span>

                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium leading-snug">{item.name}</p>
                          {item.description && (
                            <p className="text-[12px] text-tertiary leading-relaxed mt-0.5">
                              {item.description}
                            </p>
                          )}
                        </div>

                        <span
                          className="text-[11.5px] text-muted tnum whitespace-nowrap mt-0.5"
                          title={`Sau ${item.weeks_from_now} tuần kể từ khi chấp nhận`}
                        >
                          {formatDate(deadlineFromWeeks(item.weeks_from_now))}
                        </span>
                      </li>
                    );
                  })}
                </ul>

                {canContribute && (
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <Button
                      variant="primary"
                      size="sm"
                      loading={busy === `accept:${s.id}`}
                      disabled={chosen.length === 0 || busy !== null}
                      onClick={() => void accept(s)}
                    >
                      Tạo {chosen.length} mốc tiến độ
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={busy === `regenerate:${s.id}`}
                      disabled={busy !== null}
                      onClick={() => void regenerate(s)}
                    >
                      Tạo lại
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={busy === `reject:${s.id}`}
                      disabled={busy !== null}
                      onClick={() => void reject(s)}
                    >
                      Bỏ qua
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

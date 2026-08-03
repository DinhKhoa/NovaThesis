"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowClockwise,
  ArrowSquareOut,
  ClockCounterClockwise,
  DownloadSimple,
  Eye,
  FileDoc,
  FilePdf,
  FileText,
  Files,
  MagnifyingGlass,
  PencilSimple,
  Robot,
  ShareNetwork,
  Sparkle,
  Trash,
  UploadSimple,
  Warning,
  X,
} from "@phosphor-icons/react";
import { PageHeader, Toolbar } from "@/components/layout";
import {
  Badge,
  Button,
  Card,
  type Column,
  ConfirmDialog,
  DetailRow,
  Dropdown,
  DropdownItem,
  DropdownSeparator,
  EmptyState,
  IconButton,
  Input,
  Modal,
  Select,
  Skeleton,
  Table,
  Tabs,
} from "@/components/ui";
import { toast } from "@/lib/toast";
import { aiPanel } from "@/lib/ai-panel";
import { api, isApiError } from "@/lib/api";
import { useAsync, useDebounced } from "@/lib/use-async";
import { isAdmin, useAuthStore } from "@/lib/auth";
import { isReadOnlyViewer } from "@/lib/permissions";
import { formatDate, formatDateTime, formatFileSize } from "@/lib/format";
import {
  documentsApi,
  thesesApi,
  type AIStatus,
  type ResearchDocument,
  type Thesis,
} from "@/lib/services";

/* ==========================================================================
   CHI TIẾT TÀI LIỆU
   ========================================================================== */

/**
 * `GET /documents/:id` trả thêm ba trường mà `ResearchDocument` chưa khai báo.
 *
 * Đường vòng có chủ đích: `documentsApi.downloadUrl()` trỏ tới
 * `/documents/:id/download-url`, một route KHÔNG tồn tại ở backend. Signed URL
 * được ký ngay trong phản hồi chi tiết (`documents.routes.ts`), nên lấy link
 * tải về nghĩa là đọc bản ghi chi tiết chứ không gọi một endpoint riêng.
 */
interface DocumentDetail extends ResearchDocument {
  preview_url: string | null;
  /** `true` khi tài liệu chỉ tới được với mình qua chia sẻ (UC 5.10). */
  shared_only: boolean;
}

const fetchDocumentDetail = (id: number) =>
  api.get<DocumentDetail>(`/documents/${id}`);

/* AI pipeline state, phrased as what the user gets rather than what the
   worker is doing. "Đang xử lý" tells you to wait; "PROCESSING" doesn't. */
const AI_STATUS: Record<
  AIStatus,
  { label: string; variant: "success" | "warning" | "info" | "danger"; hint: string }
> = {
  DONE: {
    label: "Đã lập chỉ mục",
    variant: "success",
    hint: "Tài liệu này đã có thể tìm kiếm bằng ngữ nghĩa và được AI trích dẫn.",
  },
  PROCESSING: {
    label: "Đang xử lý",
    variant: "info",
    hint: "Hệ thống đang tách đoạn và tạo vector. Thường mất 1–2 phút.",
  },
  PENDING: {
    label: "Chờ xử lý",
    variant: "warning",
    hint: "Đang xếp hàng đợi xử lý.",
  },
  ERROR: {
    label: "Lỗi xử lý",
    variant: "danger",
    hint: "Không đọc được nội dung tệp. Thử tải lên lại.",
  },
};

/** Định dạng backend nhận (`DOCUMENT_MIME` trong `lib/storage.ts`). */
const ACCEPTED_FILES = ".pdf,.docx,.doc,.txt";

function FileIcon({ filename }: { filename: string }) {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "pdf")
    return <FilePdf size={17} weight="duotone" className="text-danger" />;
  if (ext === "docx" || ext === "doc")
    return <FileDoc size={17} weight="duotone" className="text-info" />;
  return <FileText size={17} weight="duotone" className="text-tertiary" />;
}

/** Ô nhập một dòng → mảng `text[]` mà `documentsApi.update` yêu cầu. */
function splitTags(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/* ==========================================================================
   PAGE
   ========================================================================== */

export default function DocumentsPage() {
  const { user } = useAuthStore();
  const searchParams = useSearchParams();

  const [search, setSearch] = React.useState("");
  const [tagFilter, setTagFilter] = React.useState("ALL");
  const [statusFilter, setStatusFilter] = React.useState<"ALL" | AIStatus>("ALL");
  /* Thông báo "có tài liệu mới" dẫn tới `/documents?thesis_id=…`. Bỏ qua tham
     số đó sẽ thả giảng viên vào danh sách gộp của mọi đề tài họ hướng dẫn,
     đúng lúc họ được mời tới xem một tệp cụ thể. */
  const [thesisFilter, setThesisFilter] = React.useState(() => {
    // Chỉ nhận chuỗi số: `?thesis_id=abc` sẽ thành `Number(...)` → NaN và biến
    // một đường link hỏng thành lỗi 400 ngay khi mở trang.
    const raw = searchParams.get("thesis_id");
    return raw && /^\d+$/.test(raw) ? raw : "ALL";
  });
  const [page, setPage] = React.useState(1);

  // UC 5.8 NFR: lọc chạy ở server, và gõ tới đâu gọi API tới đó là tự tấn công
  // máy chủ của mình.
  const debouncedSearch = useDebounced(search, 300);

  /* Đổi điều kiện lọc thì phải quay về trang 1, nếu không người dùng đang ở
     trang 3 sẽ nhận một bảng rỗng cho bộ lọc chỉ có một trang kết quả. Chỉnh
     state ngay trong lúc render (cách React khuyến nghị) thay vì trong effect:
     effect sẽ tải trang 3 trước rồi mới tải lại trang 1 — hai request, một
     nhịp nháy. */
  const filterKey = `${debouncedSearch}|${tagFilter}|${statusFilter}|${thesisFilter}`;
  const [prevFilterKey, setPrevFilterKey] = React.useState(filterKey);
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  /* Danh sách đề tài phục vụ ba việc: chọn đích tải lên, chọn đích chia sẻ, và
     suy ra quyền ghi cho từng hàng. */
  const { data: thesesPage } = useAsync(() => thesesApi.list({ per_page: 100 }), []);
  const theses = React.useMemo<Thesis[]>(() => thesesPage?.data ?? [], [thesesPage]);
  const thesisById = React.useMemo(
    () => new Map(theses.map((t) => [t.id, t])),
    [theses]
  );

  // Thẻ lấy từ server: gom thẻ trong trang hiện tại sẽ làm biến mất khỏi bộ lọc
  // đúng những thẻ chỉ xuất hiện ở trang sau.
  const { data: tagOptions, refetch: refetchTags } = useAsync(
    () => documentsApi.tags(),
    []
  );

  const { data, loading, error, refetch } = useAsync(
    () =>
      documentsApi.list({
        page,
        per_page: 15,
        ...(thesisFilter !== "ALL" ? { thesis_id: Number(thesisFilter) } : {}),
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        ...(tagFilter !== "ALL" ? { tag: tagFilter } : {}),
        ...(statusFilter !== "ALL" ? { status_ai: statusFilter } : {}),
      }),
    [page, thesisFilter, debouncedSearch, tagFilter, statusFilter]
  );

  /* Huy hiệu đếm trên TOÀN phạm vi chứ không trên trang đang mở: "3/15 đã lập
     chỉ mục" khi thực có 40 tài liệu là một câu sai. Hai truy vấn `per_page=1`
     chỉ lấy con số `total`. */
  const { data: counts, refetch: refetchCounts } = useAsync(
    async () => {
      const scope: Record<string, string | number> =
        thesisFilter !== "ALL" ? { thesis_id: Number(thesisFilter) } : {};
      const [all, indexed] = await Promise.all([
        documentsApi.list({ ...scope, per_page: 1 }),
        documentsApi.list({ ...scope, per_page: 1, status_ai: "DONE" }),
      ]);
      return { total: all.total, indexed: indexed.total };
    },
    [thesisFilter]
  );

  const documents = React.useMemo(() => data?.data ?? [], [data]);

  /* UC 5.9: worker cập nhật `status_ai` ở phía server và không có kênh đẩy về
     trình duyệt. Chỉ hỏi lại khi CÒN việc đang chạy — khi mọi tệp đã DONE, mỗi
     lượt hỏi thêm là một truy vấn không bao giờ đổi kết quả. */
  const hasPendingWork = documents.some(
    (d) => d.status_ai === "PENDING" || d.status_ai === "PROCESSING"
  );

  React.useEffect(() => {
    if (!hasPendingWork) return;
    const timer = setInterval(() => {
      void refetch();
      void refetchCounts();
    }, 5000);
    return () => clearInterval(timer);
  }, [hasPendingWork, refetch, refetchCounts]);

  /* Bảng chỉ dựng khung xám ở lần tải đầu. Bám thẳng theo `loading` thì cứ 5
     giây vòng làm mới bên trên lại biến bảng thành skeleton, cướp mất chỗ đọc
     của người đang xem. */
  const showSkeleton = loading && data === null;

  /* ---------------------------------------------------------------------- */
  /* Quyền — bám đúng `assertDocumentAccess` của backend                     */
  /* ---------------------------------------------------------------------- */

  /**
   * Tài liệu tới qua chia sẻ (UC 5.10) nằm ở đề tài KHÔNG thuộc phạm vi của
   * mình, nên không có mặt trong `thesisById`. Backend từ chối ký URL tải về
   * cho những tài liệu đó — bày nút "Tải về" rồi trả về tay không thì tệ hơn là
   * không bày.
   */
  const isSharedIn = React.useCallback(
    (d: ResearchDocument) =>
      !isAdmin(user) && thesesPage !== null && !thesisById.has(d.thesis_id),
    [thesesPage, thesisById, user]
  );

  /* Quản trị viên xem toàn hệ thống ở chế độ chỉ đọc — xem `lib/permissions.ts`
     để hiểu vì sao giao diện chặt hơn API. */
  const readOnly = isReadOnlyViewer(user);

  /** Ghi được khi đề tài còn mở: UC 3.13 đóng băng đề tài đã hoàn thành. */
  const canWrite = React.useCallback(
    (d: ResearchDocument) => {
      if (readOnly) return false;
      const thesis = thesisById.get(d.thesis_id);
      return thesis ? thesis.status !== "COMPLETED" : false;
    },
    [thesisById, readOnly]
  );

  /**
   * UC 5.5 thu hẹp quyền xoá về người đã tải lên; giảng viên hướng dẫn giữ quyền
   * gỡ nội dung vi phạm. Trong nhóm nhiều thành viên, xoá tài liệu của bạn cùng
   * nhóm là mất mát không hoàn tác được.
   */
  const canDelete = React.useCallback(
    (d: ResearchDocument) => {
      if (!canWrite(d)) return false;
      if (d.uploaded_by === user?.id) return true;
      const thesis = thesisById.get(d.thesis_id);
      return (
        thesis != null &&
        user?.lecturer_id != null &&
        thesis.lecturer_id === user.lecturer_id
      );
    },
    [canWrite, thesisById, user]
  );

  /* Đề tài đã hoàn thành không nhận tài liệu mới, nên không đưa vào ô chọn. */
  const uploadTargets = React.useMemo(
    () => (readOnly ? [] : theses.filter((t) => t.status !== "COMPLETED")),
    [theses, readOnly]
  );

  /* ---------------------------------------------------------------------- */
  /* Trạng thái hộp thoại                                                    */
  /* ---------------------------------------------------------------------- */

  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [previewDoc, setPreviewDoc] = React.useState<ResearchDocument | null>(null);
  const [editDoc, setEditDoc] = React.useState<ResearchDocument | null>(null);
  const [editFilename, setEditFilename] = React.useState("");
  const [editTags, setEditTags] = React.useState("");
  const [savingEdit, setSavingEdit] = React.useState(false);
  const [deleteDoc, setDeleteDoc] = React.useState<ResearchDocument | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [shareDoc, setShareDoc] = React.useState<ResearchDocument | null>(null);
  const [shareTarget, setShareTarget] = React.useState("");
  const [sharing, setSharing] = React.useState(false);

  const shareTargets = React.useMemo(
    () => (shareDoc ? theses.filter((t) => t.id !== shareDoc.thesis_id) : []),
    [shareDoc, theses]
  );

  const activeFilters =
    (search ? 1 : 0) +
    (tagFilter !== "ALL" ? 1 : 0) +
    (statusFilter !== "ALL" ? 1 : 0) +
    (thesisFilter !== "ALL" ? 1 : 0);

  const clearFilters = () => {
    setSearch("");
    setTagFilter("ALL");
    setStatusFilter("ALL");
    setThesisFilter("ALL");
  };

  /**
   * Tệp không nằm sau một URL tĩnh: thư mục `storage/` không được phục vụ trực
   * tiếp, backend cấp Signed URL có hạn. Ký đúng lúc bấm thay vì phát sẵn link
   * cho mọi hàng trong bảng — link đã ký là uỷ quyền, không phải địa chỉ.
   */
  const download = async (d: ResearchDocument) => {
    try {
      const detail = await fetchDocumentDetail(d.id);
      if (!detail.download_url) {
        toast.error("Tài liệu này được chia sẻ ở chế độ chỉ đọc, không tải được tệp gốc.");
        return;
      }
      // URL đã mang chữ ký nên không cần header Authorization; điều hướng thẳng
      // giữ được tên tệp mà server đặt trong Content-Disposition.
      window.location.href = detail.download_url;
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Không tải được tệp.");
    }
  };

  const openEdit = (d: ResearchDocument) => {
    setEditDoc(d);
    setEditFilename(d.filename);
    setEditTags(d.tags.join(", "));
  };

  const handleSaveEdit = async () => {
    if (!editDoc) return;
    setSavingEdit(true);
    try {
      await documentsApi.update(editDoc.id, {
        filename: editFilename.trim(),
        tags: splitTags(editTags),
      });
      toast.success("Đã cập nhật tài liệu.");
      setEditDoc(null);
      void refetch();
      void refetchTags();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Không lưu được thay đổi.");
    } finally {
      setSavingEdit(false);
    }
  };

  const openShare = (d: ResearchDocument) => {
    setShareDoc(d);
    setShareTarget(String(theses.find((t) => t.id !== d.thesis_id)?.id ?? ""));
  };

  const handleShare = async () => {
    if (!shareDoc || !shareTarget) return;
    setSharing(true);
    try {
      await documentsApi.share(shareDoc.id, Number(shareTarget));
      const target = thesisById.get(Number(shareTarget));
      toast.success(`Đã chia sẻ sang đề tài “${target?.title ?? shareTarget}”.`);
      setShareDoc(null);
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Không chia sẻ được tài liệu.");
    } finally {
      setSharing(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteDoc) return;
    setDeleting(true);
    try {
      await documentsApi.remove(deleteDoc.id);
      toast.success(`Đã xóa “${deleteDoc.filename}”.`);
      setDeleteDoc(null);
      void refetch();
      void refetchCounts();
      void refetchTags();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Không xóa được tài liệu.");
    } finally {
      setDeleting(false);
    }
  };

  /* ---------------------------------------------------------------------- */

  const columns: Column<ResearchDocument>[] = [
    {
      key: "filename",
      header: "Tên tệp",
      sortValue: (d) => d.filename,
      render: (d) => (
        <div className="flex items-start gap-2 min-w-0 py-0.5">
          <span className="mt-0.5 flex-shrink-0">
            <FileIcon filename={d.filename} />
          </span>
          <div className="min-w-0">
            <button
              onClick={() => setPreviewDoc(d)}
              className="text-[13px] font-medium text-left hover:text-accent transition-colors truncate max-w-[26rem] block"
              title={d.filename}
            >
              {d.filename}
            </button>
            {/* The AI summary is the reason to keep a document — show it in
                the row, muted, instead of hiding it behind a click. */}
            {d.summary_ai ? (
              <p className="text-[12px] text-tertiary line-clamp-1 max-w-[34rem]">
                {d.summary_ai}
              </p>
            ) : (
              <p className="text-[12px] text-muted italic">
                {d.status_ai === "ERROR"
                  ? "Không trích xuất được nội dung"
                  : "Chưa có tóm tắt"}
              </p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "tags",
      header: "Thẻ",
      width: "1%",
      hideOnMobile: true,
      render: (d) => {
        if (d.tags.length === 0) return <span className="text-muted">—</span>;
        return (
          <div className="flex items-center gap-1">
            {d.tags.slice(0, 2).map((t) => (
              <button
                key={t}
                onClick={() => setTagFilter(t)}
                className="chip"
                title={`Lọc theo thẻ ${t}`}
              >
                {t}
              </button>
            ))}
            {d.tags.length > 2 && (
              <span className="text-[11.5px] text-muted" title={d.tags.join(", ")}>
                +{d.tags.length - 2}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "status_ai",
      header: "Trạng thái AI",
      width: "1%",
      sortValue: (d) => d.status_ai,
      render: (d) => {
        const s = AI_STATUS[d.status_ai];
        return (
          <span title={d.status_ai === "ERROR" ? (d.ai_error ?? s.hint) : s.hint}>
            <Badge variant={s.variant} dot={d.status_ai !== "DONE"}>
              {s.label}
            </Badge>
          </span>
        );
      },
    },
    {
      key: "file_size",
      header: "Dung lượng",
      width: "1%",
      align: "right",
      hideOnMobile: true,
      sortValue: (d) => d.file_size,
      render: (d) => (
        <span className="text-[12.5px] text-tertiary tnum">
          {formatFileSize(d.file_size)}
        </span>
      ),
    },
    {
      key: "created_at",
      header: "Tải lên",
      width: "1%",
      hideOnMobile: true,
      sortValue: (d) => d.created_at,
      render: (d) => (
        <span className="text-[12.5px] text-tertiary tnum whitespace-nowrap">
          {formatDate(d.created_at)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "1%",
      align: "right",
      render: (d) => (
        <div className="row-actions flex items-center justify-end gap-0.5">
          {/* Hỏi trợ lý NGAY TRÊN HÀNG của tài liệu.
              Ngăn kéo mở ra với đúng tệp này làm nguồn duy nhất, nên người dùng
              không phải sang trang trợ lý rồi chọn lại đề tài và tìm lại tệp —
              ba bước đủ để phần lớn người dùng thôi hỏi.
              Chỉ hiện khi tệp đã lập chỉ mục: hỏi về một tệp còn PENDING chỉ
              nhận lại "không tìm thấy nội dung phù hợp". */}
          {d.status_ai === "DONE" && (
            <IconButton
              label="Hỏi AI về tài liệu này"
              size="sm"
              onClick={() => aiPanel.openWithDocument(d.id, d.thesis_id)}
            >
              <Robot size={14} />
            </IconButton>
          )}
          <IconButton label="Xem trước" size="sm" onClick={() => setPreviewDoc(d)}>
            <Eye size={14} />
          </IconButton>
          {!isSharedIn(d) && (
            <IconButton label="Tải về" size="sm" onClick={() => void download(d)}>
              <DownloadSimple size={14} />
            </IconButton>
          )}
          {canWrite(d) && (
            <Dropdown
              align="right"
              trigger={
                <span
                  className="btn-icon btn-icon-sm"
                  role="button"
                  aria-label="Thao tác khác"
                >
                  <span aria-hidden="true" className="text-[15px] leading-none">
                    ⋯
                  </span>
                </span>
              }
            >
              <DropdownItem icon={<PencilSimple size={14} />} onClick={() => openEdit(d)}>
                Đổi tên & thẻ
              </DropdownItem>
              {/* Không có đề tài nào khác để nhận thì mục này chỉ dẫn tới một ô
                  chọn rỗng. */}
              {shareTargetsExist(theses, d) && (
                <DropdownItem
                  icon={<ShareNetwork size={14} />}
                  onClick={() => openShare(d)}
                >
                  Chia sẻ sang đề tài khác
                </DropdownItem>
              )}
              {canDelete(d) && (
                <>
                  <DropdownSeparator />
                  <DropdownItem
                    danger
                    icon={<Trash size={14} />}
                    onClick={() => setDeleteDoc(d)}
                  >
                    Xóa tài liệu
                  </DropdownItem>
                </>
              )}
            </Dropdown>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Tài liệu"
        description="Tài liệu của đề tài. Mỗi tệp được tóm tắt và lập chỉ mục để tìm kiếm theo ngữ nghĩa."
        meta={
          counts ? (
            <Badge variant="neutral">
              {counts.indexed}/{counts.total} đã lập chỉ mục
            </Badge>
          ) : (
            <Skeleton width="8.5rem" height="18px" className="rounded-full" />
          )
        }
        actions={
          /* Không có đề tài nào đang mở thì không có chỗ nào để đặt tệp vào. */
          uploadTargets.length > 0 ? (
            <Button
              variant="primary"
              icon={<UploadSimple size={15} />}
              onClick={() => setUploadOpen(true)}
            >
              Tải tài liệu lên
            </Button>
          ) : undefined
        }
      />

      <Card hoverable={false} className="overflow-hidden">
        <Toolbar>
          <div className="flex-1 min-w-0 max-w-sm">
            <Input
              placeholder="Tìm theo tên tệp, nội dung tóm tắt hoặc thẻ…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={<MagnifyingGlass size={14} />}
              aria-label="Tìm tài liệu"
              suffix={
                search ? (
                  <button
                    onClick={() => setSearch("")}
                    aria-label="Xóa tìm kiếm"
                    className="hover:text-primary transition-colors"
                  >
                    <X size={13} />
                  </button>
                ) : undefined
              }
            />
          </div>

          <div className="flex items-center gap-2 sm:ml-auto">
            {/* Sinh viên chỉ có một đề tài — một ô chọn duy nhất một lựa chọn là
                thứ để chiếm chỗ. Giảng viên hướng dẫn nhiều đề tài thì cần nó. */}
            {theses.length > 1 && (
              <Select
                value={thesisFilter}
                onChange={(e) => setThesisFilter(e.target.value)}
                className="w-auto"
                aria-label="Lọc theo đề tài"
              >
                <option value="ALL">Mọi đề tài</option>
                {theses.map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.title}
                  </option>
                ))}
              </Select>
            )}

            <Select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="w-auto"
              aria-label="Lọc theo thẻ"
            >
              <option value="ALL">Mọi thẻ</option>
              {(tagOptions ?? []).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>

            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as AIStatus | "ALL")}
              className="w-auto"
              aria-label="Lọc theo trạng thái AI"
            >
              <option value="ALL">Mọi trạng thái</option>
              {(Object.keys(AI_STATUS) as AIStatus[]).map((k) => (
                <option key={k} value={k}>
                  {AI_STATUS[k].label}
                </option>
              ))}
            </Select>

            {activeFilters > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Bỏ lọc
              </Button>
            )}
          </div>
        </Toolbar>

        {error ? (
          <EmptyState
            icon={<Warning size={15} />}
            title="Không tải được danh sách tài liệu"
            description={error}
            action={
              <Button variant="secondary" size="sm" onClick={() => void refetch()}>
                Thử lại
              </Button>
            }
          />
        ) : (
          <Table
            columns={columns}
            data={documents}
            loading={showSkeleton}
            keyExtractor={(d) => String(d.id)}
            pageSize={15}
            rowAccent={(d) => (d.status_ai === "ERROR" ? "danger" : undefined)}
            emptyState={
              activeFilters > 0 ? (
                <EmptyState
                  compact
                  icon={<MagnifyingGlass size={15} />}
                  title="Không khớp bộ lọc nào"
                  description="Thử từ khóa khác hoặc bỏ bớt điều kiện lọc."
                  action={
                    <Button variant="secondary" size="sm" onClick={clearFilters}>
                      Bỏ lọc
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={<Files size={15} />}
                  title="Chưa có tài liệu nào"
                  description="Tải lên đề cương, bản thảo hoặc tài liệu tham khảo để bắt đầu."
                  action={
                    uploadTargets.length > 0 ? (
                      <Button
                        variant="primary"
                        size="sm"
                        icon={<UploadSimple size={14} />}
                        onClick={() => setUploadOpen(true)}
                      >
                        Tải tài liệu lên
                      </Button>
                    ) : undefined
                  }
                />
              )
            }
          />
        )}
      </Card>

      {/* Phân trang phía server. Bảng chỉ phân trang trên mảng đã tải về, nên
          khi tổng vượt một trang phải điều khiển bằng tham số truy vấn. */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-[12.5px]">
          <span className="text-tertiary tnum">
            Trang {data.page}/{data.totalPages} · {data.total} tài liệu
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Trước
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= data.totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Sau
            </Button>
          </div>
        </div>
      )}

      {/* ---------------- Upload ---------------- */}
      {uploadOpen && (
        <UploadModal
          targets={uploadTargets}
          defaultThesisId={thesisFilter !== "ALL" ? Number(thesisFilter) : null}
          onClose={() => setUploadOpen(false)}
          onDone={() => {
            setUploadOpen(false);
            void refetch();
            void refetchCounts();
            void refetchTags();
          }}
        />
      )}

      {/* ---------------- Detail ----------------
          Not a viewer: there is no renderer behind it, so reserving 400px of
          grey for one would be decoration standing in for a feature. This is
          the file's record — status, provenance and what AI made of it — at
          the density of the table it opened from. */}
      {previewDoc && (
        <DocumentDetailModal
          doc={previewDoc}
          canWrite={canWrite(previewDoc)}
          onClose={() => setPreviewDoc(null)}
          onChanged={() => {
            void refetch();
            void refetchCounts();
          }}
        />
      )}

      {/* ---------------- Edit metadata ---------------- */}
      <Modal
        open={!!editDoc}
        onClose={() => setEditDoc(null)}
        title="Đổi tên & thẻ"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditDoc(null)}>
              Hủy
            </Button>
            <Button
              variant="primary"
              loading={savingEdit}
              disabled={!editFilename.trim()}
              onClick={() => void handleSaveEdit()}
            >
              Lưu
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Input
            label="Tên hiển thị"
            value={editFilename}
            onChange={(e) => setEditFilename(e.target.value)}
          />
          <Input
            label="Thẻ phân loại"
            value={editTags}
            onChange={(e) => setEditTags(e.target.value)}
            helperText="Phân cách bằng dấu phẩy."
          />
        </div>
      </Modal>

      {/* ---------------- Share ---------------- */}
      <Modal
        open={!!shareDoc}
        onClose={() => setShareDoc(null)}
        title="Chia sẻ tài liệu"
        description={shareDoc?.filename}
        width="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShareDoc(null)}>
              Hủy
            </Button>
            <Button
              variant="primary"
              loading={sharing}
              disabled={!shareTarget}
              onClick={() => void handleShare()}
            >
              Chia sẻ
            </Button>
          </>
        }
      >
        <Select
          label="Đề tài nhận quyền đọc"
          value={shareTarget}
          onChange={(e) => setShareTarget(e.target.value)}
          helperText="Thành viên của đề tài đó sẽ đọc được tệp này, nhưng không sửa hay xóa được."
        >
          {shareTargets.map((t) => (
            <option key={t.id} value={String(t.id)}>
              #{t.id} — {t.title}
            </option>
          ))}
        </Select>
      </Modal>

      {/* ---------------- Delete ---------------- */}
      <ConfirmDialog
        open={!!deleteDoc}
        onClose={() => setDeleteDoc(null)}
        onConfirm={() => void confirmDelete()}
        loading={deleting}
        title="Xóa tài liệu?"
        confirmLabel="Xóa"
        message={
          <>
            Tệp <strong className="text-primary">{deleteDoc?.filename}</strong> và
            toàn bộ chỉ mục tìm kiếm của nó sẽ bị xóa. AI sẽ không còn trích dẫn
            được tài liệu này. Thao tác không thể hoàn tác.
          </>
        }
      />
    </div>
  );
}

/** Còn đề tài nào khác để nhận bản chia sẻ không (UC 5.10). */
function shareTargetsExist(theses: Thesis[], doc: ResearchDocument): boolean {
  return theses.some((t) => t.id !== doc.thesis_id);
}

/* ==========================================================================
   TẢI LÊN (UC 5.1)
   ========================================================================== */

/* Chỉ tồn tại khi đang mở (xem chỗ gọi), nhờ đó form bắt đầu sạch mỗi lần thay
   vì cần một effect đi dọn lại từng ô sau mỗi lần đóng. */
function UploadModal({
  targets,
  defaultThesisId,
  onClose,
  onDone,
}: {
  targets: Thesis[];
  defaultThesisId: number | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [thesisId, setThesisId] = React.useState(() =>
    String(
      targets.find((t) => t.id === defaultThesisId)?.id ?? targets[0]?.id ?? ""
    )
  );
  const [file, setFile] = React.useState<File | null>(null);
  const [tags, setTags] = React.useState("");
  const [progress, setProgress] = React.useState(0);
  const [uploading, setUploading] = React.useState(false);

  const submit = async () => {
    if (!file || !thesisId) return;
    setUploading(true);
    try {
      // Thẻ gửi nguyên chuỗi "AI, RAG": backend tự tách và khử trùng lặp
      // (`parseTagList`), nên tách ở đây chỉ tạo ra hai luật cùng tồn tại.
      await documentsApi.upload(file, Number(thesisId), tags, setProgress);
      toast.success("Đã tải lên. Tài liệu đang được lập chỉ mục.");
      onDone();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Tải lên thất bại.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Tải tài liệu lên"
      description="Tệp sẽ được tóm tắt và lập chỉ mục tự động sau khi tải lên."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Hủy
          </Button>
          <Button
            variant="primary"
            loading={uploading}
            disabled={!file || !thesisId}
            onClick={() => void submit()}
          >
            Tải lên
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {/* Một đề tài duy nhất thì không có gì để chọn — UC 5.1 giả định người
            dùng đang ở trong không gian đề tài của mình. */}
        {targets.length > 1 && (
          <Select
            label="Đề tài"
            value={thesisId}
            onChange={(e) => setThesisId(e.target.value)}
            required
          >
            {targets.map((t) => (
              <option key={t.id} value={String(t.id)}>
                {t.title}
              </option>
            ))}
          </Select>
        )}

        <label
          className="flex flex-col items-center justify-center gap-1.5 py-8 px-4 rounded-[10px] text-center cursor-pointer transition-colors hover:border-[var(--accent)]"
          style={{
            border: "1px dashed var(--border-strong)",
            background: "var(--bg-subtle)",
          }}
        >
          <UploadSimple size={22} className="text-tertiary" />
          <span className="text-[13px] font-medium">
            {file ? file.name : "Kéo thả tệp vào đây hoặc bấm để chọn"}
          </span>
          <span className="text-[12px] text-tertiary">
            {file
              ? formatFileSize(file.size)
              : "PDF, DOCX hoặc TXT · tối đa 50 MB mỗi tệp"}
          </span>
          {/* Backend nhận đúng một tệp mỗi lượt (`multer … files: 1`), nên bỏ
              `multiple`: cho chọn 5 tệp rồi âm thầm bỏ 4 là nói dối. */}
          <input
            type="file"
            className="sr-only"
            accept={ACCEPTED_FILES}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <Input
          label="Thẻ phân loại"
          placeholder="AI, RAG, Firmware"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          helperText="Phân cách bằng dấu phẩy. Dùng để lọc danh sách sau này."
        />

        {uploading && (
          <div>
            <div className="h-1 rounded-full overflow-hidden bg-[var(--bg-hover)]">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${progress}%`, background: "var(--accent)" }}
              />
            </div>
            <p className="text-[11.5px] text-tertiary mt-1 tnum">{progress}%</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ==========================================================================
   CHI TIẾT TÀI LIỆU (UC 5.3 / 5.9 / 6.2)
   ========================================================================== */

function DocumentDetailModal({
  doc,
  canWrite,
  onClose,
  onChanged,
}: {
  doc: ResearchDocument;
  canWrite: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = React.useState<"info" | "versions">("info");
  const [reindexing, setReindexing] = React.useState(false);

  const { data, loading, error, refetch, setData } = useAsync(
    () => fetchDocumentDetail(doc.id),
    [doc.id]
  );

  const reindex = async () => {
    setReindexing(true);
    try {
      const updated = await documentsApi.reindex(doc.id);
      // `toDocumentDTO` không kèm Signed URL, nên trải bản mới lên bản cũ giữ
      // nguyên `download_url` đã ký thay vì xoá mất nút Tải về.
      setData((prev) => (prev ? { ...prev, ...updated } : prev));
      toast.success("Đã xếp tài liệu vào hàng đợi lập chỉ mục lại.");
      onChanged();
    } catch (err) {
      toast.error(
        isApiError(err) ? err.message : "Không gửi được yêu cầu lập chỉ mục lại."
      );
    } finally {
      setReindexing(false);
    }
  };

  /* UC 6.2 chỉ cho chạy lại khi tiến trình trước đã dừng: PENDING/PROCESSING
     nghĩa là worker đang giữ tài liệu và backend sẽ trả 409. */
  const canReindex =
    canWrite && (data?.status_ai === "DONE" || data?.status_ai === "ERROR");

  /* Signed URL do backend ký kèm trong phản hồi chi tiết; `null` nghĩa là người
     xem chỉ có quyền đọc phần mô tả (UC 5.10), không được cầm tệp gốc. */
  const previewUrl = data?.preview_url ?? null;
  const downloadUrl = data?.download_url ?? null;

  return (
    <Modal
      open
      onClose={onClose}
      title={doc.filename}
      width="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Đóng
          </Button>
          {canReindex && (
            <Button
              variant="secondary"
              icon={<ArrowClockwise size={14} />}
              loading={reindexing}
              onClick={() => void reindex()}
            >
              Lập chỉ mục lại
            </Button>
          )}
          {previewUrl && (
            <Button
              variant="secondary"
              iconRight={<ArrowSquareOut size={13} />}
              onClick={() => window.open(previewUrl, "_blank", "noopener,noreferrer")}
            >
              Mở xem trước
            </Button>
          )}
          {downloadUrl && (
            <Button
              variant="primary"
              icon={<DownloadSimple size={14} />}
              onClick={() => {
                window.location.href = downloadUrl;
              }}
            >
              Tải về
            </Button>
          )}
        </>
      }
    >
      {loading ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <Skeleton width="36px" height="36px" className="rounded-[9px]" />
            <div className="flex flex-col gap-1.5">
              <Skeleton width="9rem" height="13px" />
              <Skeleton width="12rem" height="12px" />
            </div>
          </div>
          <Skeleton width="100%" height="86px" className="rounded-[10px]" />
          <Skeleton width="100%" height="120px" className="rounded-[10px]" />
        </div>
      ) : error || !data ? (
        <EmptyState
          compact
          icon={<Warning size={15} />}
          title="Không tải được chi tiết tài liệu"
          description={error ?? "Tài liệu có thể đã bị xóa."}
          action={
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {/* Identity strip */}
          <div className="flex items-center gap-2.5">
            <span
              className="w-9 h-9 rounded-[9px] flex items-center justify-center flex-shrink-0"
              style={{
                background: "var(--bg-subtle)",
                border: "1px solid var(--border-primary)",
              }}
            >
              <FileIcon filename={data.filename} />
            </span>
            {/* The dialog title already carries the filename — repeating it
                here would just cost a line. */}
            <div className="min-w-0">
              <p className="text-[13px] font-medium tnum">
                {(data.filename.split(".").pop() ?? "").toUpperCase()} ·{" "}
                {formatFileSize(data.file_size)}
              </p>
              <p className="text-[12px] text-tertiary tnum">
                Tải lên {formatDateTime(data.created_at)}
                {data.uploaded_by_name ? ` · ${data.uploaded_by_name}` : ""}
              </p>
            </div>
          </div>

          {/* Người xem qua chia sẻ không có phiên bản để xem, nên không bày tab
              chỉ để nó trả về 403. */}
          {!data.shared_only && (
            <Tabs
              items={[
                { key: "info", label: "Thông tin" },
                { key: "versions", label: "Phiên bản", count: data.version_count },
              ]}
              value={tab}
              onChange={(k) => setTab(k as "info" | "versions")}
            />
          )}

          {tab === "info" || data.shared_only ? (
            <>
              {/* AI state — reports what actually happened to this file rather
                  than leaving an empty summary slot. */}
              {data.status_ai === "DONE" ? (
                <section
                  className="p-3 rounded-[10px]"
                  style={{
                    background: "var(--accent-subtle)",
                    border: "1px solid var(--accent-border)",
                  }}
                >
                  <h4 className="eyebrow flex items-center gap-1.5 mb-1.5 text-accent">
                    <Sparkle size={12} weight="fill" /> Tóm tắt tự động
                  </h4>
                  <p className="text-[13px] text-secondary leading-relaxed">
                    {data.summary_ai ??
                      "Đã lập chỉ mục xong nhưng chưa sinh được bản tóm tắt."}
                  </p>
                </section>
              ) : data.status_ai === "ERROR" ? (
                <section
                  className="p-3 rounded-[10px]"
                  style={{
                    background: "var(--danger-bg)",
                    border: "1px solid var(--danger-border)",
                  }}
                >
                  <h4 className="text-[13px] font-semibold text-danger mb-1">
                    Không đọc được nội dung tệp
                  </h4>
                  {/* Backend nói rõ tệp hỏng ở đâu (quét ảnh, đặt mật khẩu, quá
                      lớn…). Thay bằng một câu chung chung là vứt đi đúng thông
                      tin người dùng cần để sửa. */}
                  <p className="text-[12.5px] text-secondary leading-relaxed">
                    {data.ai_error ??
                      "Tệp có thể bị hỏng, được đặt mật khẩu, hoặc chỉ chứa ảnh quét. Hãy tải lên lại bản khác để hệ thống lập chỉ mục."}
                  </p>
                </section>
              ) : (
                <section
                  className="p-3 rounded-[10px]"
                  style={{
                    background: "var(--bg-subtle)",
                    border: "1px solid var(--border-primary)",
                  }}
                >
                  <h4 className="text-[13px] font-medium mb-1.5">
                    {data.status_ai === "PROCESSING"
                      ? "Đang tách đoạn và tạo vector"
                      : "Đang chờ trong hàng đợi xử lý"}
                  </h4>
                  <div className="progress-indeterminate h-1 rounded-full mb-2" />
                  <p className="text-[12.5px] text-tertiary leading-relaxed">
                    {AI_STATUS[data.status_ai].hint} Bạn vẫn tải tệp về được ngay
                    bây giờ.
                  </p>
                </section>
              )}

              {/* Provenance */}
              <div
                className="rounded-[10px] px-3 py-1.5"
                style={{ border: "1px solid var(--border-primary)" }}
              >
                <DetailRow label="Trạng thái">
                  <Badge
                    variant={AI_STATUS[data.status_ai].variant}
                    dot={data.status_ai !== "DONE"}
                  >
                    {AI_STATUS[data.status_ai].label}
                  </Badge>
                </DetailRow>
                <DetailRow label="Thẻ">
                  {data.tags.length ? (
                    <span className="flex flex-wrap gap-1">
                      {data.tags.map((t) => (
                        <span key={t} className="chip">
                          {t}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="text-muted">Chưa gắn thẻ</span>
                  )}
                </DetailRow>
                <DetailRow label="Thuộc đề tài">
                  {data.thesis_title ?? `#${data.thesis_id}`}
                </DetailRow>
                {/* Hai con số cùng một dòng: đây là "tệp này đã vào chỉ mục tới
                    đâu", không phải hai thuộc tính rời nhau. */}
                <DetailRow label="Nội dung">
                  <span className="tnum">
                    {data.page_count != null ? `${data.page_count} trang · ` : ""}
                    {data.chunk_count > 0
                      ? `${data.chunk_count} đoạn đã lập chỉ mục`
                      : "chưa có đoạn nào trong chỉ mục"}
                  </span>
                </DetailRow>
                <DetailRow label="Đường dẫn">
                  <code className="font-mono text-[12px] text-tertiary break-all">
                    {data.file_path}
                  </code>
                </DetailRow>
              </div>
            </>
          ) : (
            <VersionsPanel
              documentId={data.id}
              canWrite={canWrite}
              onUploaded={() => {
                void refetch();
                onChanged();
              }}
            />
          )}
        </div>
      )}
    </Modal>
  );
}

/* ==========================================================================
   PHIÊN BẢN TÀI LIỆU (`Yêu cầu dự án.md` §3.1)
   ========================================================================== */

function VersionsPanel({
  documentId,
  canWrite,
  onUploaded,
}: {
  documentId: number;
  canWrite: boolean;
  onUploaded: () => void;
}) {
  const { data, loading, error, refetch } = useAsync(
    () => documentsApi.versions(documentId),
    [documentId]
  );

  const [file, setFile] = React.useState<File | null>(null);
  const [note, setNote] = React.useState("");
  const [progress, setProgress] = React.useState(0);
  const [uploading, setUploading] = React.useState(false);

  const submit = async () => {
    if (!file) return;
    setUploading(true);
    try {
      await documentsApi.uploadVersion(documentId, file, note, setProgress);
      toast.success("Đã nộp phiên bản mới. Tài liệu sẽ được lập chỉ mục lại.");
      setFile(null);
      setNote("");
      setProgress(0);
      void refetch();
      onUploaded();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Không nộp được phiên bản mới.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton width="100%" height="34px" className="rounded-[8px]" />
          <Skeleton width="100%" height="34px" className="rounded-[8px]" />
        </div>
      ) : error ? (
        <EmptyState
          compact
          icon={<Warning size={15} />}
          title="Không tải được danh sách phiên bản"
          description={error}
          action={
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
        />
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState
          compact
          icon={<ClockCounterClockwise size={15} />}
          title="Chưa có phiên bản nào khác"
          description="Nộp bản sửa của cùng tài liệu để giữ lại lịch sử thay vì tải lên một tệp mới."
        />
      ) : (
        <div
          className="rounded-[10px] overflow-hidden"
          style={{ border: "1px solid var(--border-primary)" }}
        >
          {(data ?? []).map((v, i) => (
            <div
              key={v.id}
              className="flex items-start gap-2.5 px-3 py-2"
              style={
                i > 0 ? { borderTop: "1px solid var(--border-secondary)" } : undefined
              }
            >
              <span className="text-[12.5px] font-medium tnum flex-shrink-0 w-8">
                v{v.version_number}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] text-secondary">
                  {v.change_note ?? (
                    <span className="text-muted italic">Không có ghi chú thay đổi</span>
                  )}
                </p>
                <p className="text-[11.5px] text-tertiary tnum">
                  {formatDateTime(v.created_at)}
                  {v.uploaded_by_name ? ` · ${v.uploaded_by_name}` : ""} ·{" "}
                  {formatFileSize(v.file_size)}
                </p>
              </div>
              {v.is_current && (
                <Badge variant="success" className="flex-shrink-0">
                  Hiện hành
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}

      {canWrite && (
        <div className="flex flex-col gap-2">
          <label
            className="flex items-center gap-2 py-2.5 px-3 rounded-[10px] cursor-pointer transition-colors hover:border-[var(--accent)]"
            style={{
              border: "1px dashed var(--border-strong)",
              background: "var(--bg-subtle)",
            }}
          >
            <UploadSimple size={16} className="text-tertiary flex-shrink-0" />
            <span className="text-[12.5px] font-medium truncate">
              {file ? file.name : "Chọn tệp cho phiên bản mới"}
            </span>
            {file && (
              <span className="text-[11.5px] text-tertiary tnum ml-auto flex-shrink-0">
                {formatFileSize(file.size)}
              </span>
            )}
            <input
              type="file"
              className="sr-only"
              accept={ACCEPTED_FILES}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>

          <Input
            placeholder="Ghi chú thay đổi (tùy chọn)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label="Ghi chú thay đổi"
          />

          {uploading && (
            <div>
              <div className="h-1 rounded-full overflow-hidden bg-[var(--bg-hover)]">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${progress}%`, background: "var(--accent)" }}
                />
              </div>
              <p className="text-[11.5px] text-tertiary mt-1 tnum">{progress}%</p>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              loading={uploading}
              disabled={!file}
              onClick={() => void submit()}
            >
              Nộp phiên bản mới
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

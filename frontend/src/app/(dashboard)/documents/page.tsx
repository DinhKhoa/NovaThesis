"use client";

import React from "react";
import {
  ArrowSquareOut,
  DownloadSimple,
  Eye,
  FileDoc,
  FilePdf,
  FileText,
  Files,
  MagnifyingGlass,
  PencilSimple,
  ShareNetwork,
  Sparkle,
  Trash,
  UploadSimple,
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
  Table,
} from "@/components/ui";
import { toast } from "@/lib/toast";

/* ==========================================================================
   TYPES (ERD: documents)
   ========================================================================== */

export type AIStatus = "PENDING" | "PROCESSING" | "DONE" | "ERROR";

export interface ResearchDocument {
  id: number;
  thesis_id: number;
  filename: string;
  file_path: string;
  file_size: number;
  summary_ai?: string | null;
  status_ai: AIStatus;
  tags?: string | null;
  created_at: string;
}

const mockDocuments: ResearchDocument[] = [
  {
    id: 1,
    thesis_id: 1,
    filename: "RAG_pgvector_Architecture_Paper.pdf",
    file_path: "/uploads/rag_pgvector_paper.pdf",
    file_size: 2450000,
    summary_ai:
      "Nghiên cứu kiến trúc RAG với PostgreSQL pgvector, HNSW Indexing tối ưu tốc độ tìm kiếm vector tương đồng dưới 50ms cho tài liệu hơn 100.000 trang.",
    status_ai: "DONE",
    tags: "AI, RAG, pgvector, Database",
    created_at: "2026-07-15 09:12",
  },
  {
    id: 2,
    thesis_id: 1,
    filename: "Thesis_Requirements_Specification_v2.docx",
    file_path: "/uploads/thesis_spec.docx",
    file_size: 1120000,
    summary_ai:
      "Tài liệu đặc tả 92 use case toàn hệ thống NovaThesis, chia thành 9 phân hệ chức năng.",
    status_ai: "DONE",
    tags: "Yêu cầu, ERD, Spec",
    created_at: "2026-07-10 14:30",
  },
  {
    id: 3,
    thesis_id: 1,
    filename: "Firmware_FSM_Watchdog_Design_Guide.pdf",
    file_path: "/uploads/firmware_fsm_guide.pdf",
    file_size: 4800000,
    summary_ai: null,
    status_ai: "PROCESSING",
    tags: "Firmware, FSM, Safety",
    created_at: "2026-07-19 08:00",
  },
  {
    id: 4,
    thesis_id: 1,
    filename: "Raw_Dataset_Survey_Responses.txt",
    file_path: "/uploads/raw_survey.txt",
    file_size: 350000,
    summary_ai: null,
    status_ai: "PENDING",
    tags: "Dataset, Survey",
    created_at: "2026-07-19 10:15",
  },
  {
    id: 5,
    thesis_id: 1,
    filename: "Bien_ban_hop_GVHD_lan_3.docx",
    file_path: "/uploads/bienban3.docx",
    file_size: 88000,
    summary_ai: null,
    status_ai: "ERROR",
    tags: "Biên bản",
    created_at: "2026-07-18 16:40",
  },
];

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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ filename }: { filename: string }) {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "pdf")
    return <FilePdf size={17} weight="duotone" className="text-danger" />;
  if (ext === "docx" || ext === "doc")
    return <FileDoc size={17} weight="duotone" className="text-info" />;
  return <FileText size={17} weight="duotone" className="text-tertiary" />;
}

function parseTags(tags?: string | null): string[] {
  return (tags ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/* ==========================================================================
   PAGE
   ========================================================================== */

export default function DocumentsPage() {
  const [documents, setDocuments] =
    React.useState<ResearchDocument[]>(mockDocuments);
  const [search, setSearch] = React.useState("");
  const [tagFilter, setTagFilter] = React.useState("ALL");
  const [statusFilter, setStatusFilter] = React.useState<"ALL" | AIStatus>("ALL");

  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [uploadTags, setUploadTags] = React.useState("");

  const [previewDoc, setPreviewDoc] = React.useState<ResearchDocument | null>(null);
  const [editDoc, setEditDoc] = React.useState<ResearchDocument | null>(null);
  const [editFilename, setEditFilename] = React.useState("");
  const [editTags, setEditTags] = React.useState("");
  const [deleteDoc, setDeleteDoc] = React.useState<ResearchDocument | null>(null);
  const [shareDoc, setShareDoc] = React.useState<ResearchDocument | null>(null);
  const [shareTarget, setShareTarget] = React.useState("2");

  /* Tag options come from the data, not a hardcoded list that drifts. */
  const allTags = React.useMemo(() => {
    const set = new Set<string>();
    documents.forEach((d) => parseTags(d.tags).forEach((t) => set.add(t)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "vi"));
  }, [documents]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return documents.filter((d) => {
      const matchesSearch =
        !q ||
        d.filename.toLowerCase().includes(q) ||
        (d.tags ?? "").toLowerCase().includes(q) ||
        (d.summary_ai ?? "").toLowerCase().includes(q);
      const matchesTag = tagFilter === "ALL" || parseTags(d.tags).includes(tagFilter);
      const matchesStatus = statusFilter === "ALL" || d.status_ai === statusFilter;
      return matchesSearch && matchesTag && matchesStatus;
    });
  }, [documents, search, tagFilter, statusFilter]);

  const indexedCount = documents.filter((d) => d.status_ai === "DONE").length;
  const activeFilters =
    (search ? 1 : 0) + (tagFilter !== "ALL" ? 1 : 0) + (statusFilter !== "ALL" ? 1 : 0);

  const clearFilters = () => {
    setSearch("");
    setTagFilter("ALL");
    setStatusFilter("ALL");
  };

  const handleUpload = () => {
    setUploading(true);
    setTimeout(() => {
      setDocuments((prev) => [
        {
          id: Date.now(),
          thesis_id: 1,
          filename: "Tai_lieu_nghien_cuu_moi.pdf",
          file_path: "/uploads/new_doc.pdf",
          file_size: 3200000,
          summary_ai: null,
          status_ai: "PROCESSING",
          tags: uploadTags || "Nghiên cứu",
          created_at: new Date().toISOString().replace("T", " ").slice(0, 16),
        },
        ...prev,
      ]);
      toast.success("Đã tải lên. Tài liệu đang được lập chỉ mục.");
      setUploading(false);
      setUploadOpen(false);
      setUploadTags("");
    }, 1000);
  };

  const handleSaveEdit = () => {
    if (!editDoc) return;
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === editDoc.id ? { ...d, filename: editFilename, tags: editTags } : d
      )
    );
    toast.success("Đã cập nhật tài liệu.");
    setEditDoc(null);
  };

  const confirmDelete = () => {
    if (!deleteDoc) return;
    setDocuments((prev) => prev.filter((d) => d.id !== deleteDoc.id));
    toast.success(`Đã xóa “${deleteDoc.filename}”.`);
    setDeleteDoc(null);
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
        const tags = parseTags(d.tags);
        if (tags.length === 0) return <span className="text-muted">—</span>;
        return (
          <div className="flex items-center gap-1">
            {tags.slice(0, 2).map((t) => (
              <button
                key={t}
                onClick={() => setTagFilter(t)}
                className="chip"
                title={`Lọc theo thẻ ${t}`}
              >
                {t}
              </button>
            ))}
            {tags.length > 2 && (
              <span className="text-[11.5px] text-muted" title={tags.join(", ")}>
                +{tags.length - 2}
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
          <span title={s.hint}>
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
          {d.created_at}
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
          <IconButton label="Xem trước" size="sm" onClick={() => setPreviewDoc(d)}>
            <Eye size={14} />
          </IconButton>
          <IconButton
            label="Tải về"
            size="sm"
            onClick={() => toast.success(`Đang tải “${d.filename}”…`)}
          >
            <DownloadSimple size={14} />
          </IconButton>
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
            <DropdownItem
              icon={<PencilSimple size={14} />}
              onClick={() => {
                setEditDoc(d);
                setEditFilename(d.filename);
                setEditTags(d.tags ?? "");
              }}
            >
              Đổi tên & thẻ
            </DropdownItem>
            <DropdownItem
              icon={<ShareNetwork size={14} />}
              onClick={() => setShareDoc(d)}
            >
              Chia sẻ sang đề tài khác
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem
              danger
              icon={<Trash size={14} />}
              onClick={() => setDeleteDoc(d)}
            >
              Xóa tài liệu
            </DropdownItem>
          </Dropdown>
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
          <Badge variant="neutral">
            {indexedCount}/{documents.length} đã lập chỉ mục
          </Badge>
        }
        actions={
          <Button
            variant="primary"
            icon={<UploadSimple size={15} />}
            onClick={() => setUploadOpen(true)}
          >
            Tải tài liệu lên
          </Button>
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
            <Select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="w-auto"
              aria-label="Lọc theo thẻ"
            >
              <option value="ALL">Mọi thẻ</option>
              {allTags.map((t) => (
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

        <Table
          columns={columns}
          data={filtered}
          keyExtractor={(d) => String(d.id)}
          pageSize={15}
          rowAccent={(d) => (d.status_ai === "ERROR" ? "danger" : undefined)}
          emptyState={
            documents.length === 0 ? (
              <EmptyState
                icon={<Files size={15} />}
                title="Chưa có tài liệu nào"
                description="Tải lên đề cương, bản thảo hoặc tài liệu tham khảo để bắt đầu."
                action={
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<UploadSimple size={14} />}
                    onClick={() => setUploadOpen(true)}
                  >
                    Tải tài liệu lên
                  </Button>
                }
              />
            ) : (
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
            )
          }
        />
      </Card>

      {/* ---------------- Upload ---------------- */}
      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Tải tài liệu lên"
        description="Tệp sẽ được tóm tắt và lập chỉ mục tự động sau khi tải lên."
        footer={
          <>
            <Button variant="ghost" onClick={() => setUploadOpen(false)}>
              Hủy
            </Button>
            <Button variant="primary" loading={uploading} onClick={handleUpload}>
              Tải lên
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <label
            className="flex flex-col items-center justify-center gap-1.5 py-8 px-4 rounded-[10px] text-center cursor-pointer transition-colors hover:border-[var(--accent)]"
            style={{
              border: "1px dashed var(--border-strong)",
              background: "var(--bg-subtle)",
            }}
          >
            <UploadSimple size={22} className="text-tertiary" />
            <span className="text-[13px] font-medium">
              Kéo thả tệp vào đây hoặc bấm để chọn
            </span>
            <span className="text-[12px] text-tertiary">
              PDF, DOCX hoặc TXT · tối đa 50 MB mỗi tệp
            </span>
            <input type="file" className="sr-only" multiple />
          </label>

          <Input
            label="Thẻ phân loại"
            placeholder="AI, RAG, Firmware"
            value={uploadTags}
            onChange={(e) => setUploadTags(e.target.value)}
            helperText="Phân cách bằng dấu phẩy. Dùng để lọc danh sách sau này."
          />
        </div>
      </Modal>

      {/* ---------------- Detail ----------------
          Not a viewer: there is no renderer behind it, so reserving 400px of
          grey for one would be decoration standing in for a feature. This is
          the file's record — status, provenance and what AI made of it — at
          the density of the table it opened from. */}
      <Modal
        open={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
        title={previewDoc?.filename}
        width="max-w-xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPreviewDoc(null)}>
              Đóng
            </Button>
            {previewDoc?.status_ai !== "ERROR" && (
              <Button
                variant="secondary"
                iconRight={<ArrowSquareOut size={13} />}
                onClick={() =>
                  toast.info("Trình xem tài liệu sẽ mở ở tab mới.")
                }
              >
                Mở xem trước
              </Button>
            )}
            <Button
              variant="primary"
              icon={<DownloadSimple size={14} />}
              onClick={() =>
                previewDoc && toast.success(`Đang tải “${previewDoc.filename}”…`)
              }
            >
              Tải về
            </Button>
          </>
        }
      >
        {previewDoc && (
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
                <FileIcon filename={previewDoc.filename} />
              </span>
              {/* The dialog title already carries the filename — repeating it
                  here would just cost a line. */}
              <div className="min-w-0">
                <p className="text-[13px] font-medium tnum">
                  {(previewDoc.filename.split(".").pop() ?? "").toUpperCase()} ·{" "}
                  {formatFileSize(previewDoc.file_size)}
                </p>
                <p className="text-[12px] text-tertiary tnum">
                  Tải lên {previewDoc.created_at}
                </p>
              </div>
            </div>

            {/* AI state — reports what actually happened to this file rather
                than leaving an empty summary slot. */}
            {previewDoc.status_ai === "DONE" && previewDoc.summary_ai ? (
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
                  {previewDoc.summary_ai}
                </p>
              </section>
            ) : previewDoc.status_ai === "ERROR" ? (
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
                <p className="text-[12.5px] text-secondary leading-relaxed">
                  Tệp có thể bị hỏng, được đặt mật khẩu, hoặc chỉ chứa ảnh quét.
                  Hãy tải lên lại bản khác để hệ thống lập chỉ mục.
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
                  {previewDoc.status_ai === "PROCESSING"
                    ? "Đang tách đoạn và tạo vector"
                    : "Đang chờ trong hàng đợi xử lý"}
                </h4>
                <div className="progress-indeterminate h-1 rounded-full mb-2" />
                <p className="text-[12.5px] text-tertiary leading-relaxed">
                  {AI_STATUS[previewDoc.status_ai].hint} Bạn vẫn tải tệp về được
                  ngay bây giờ.
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
                  variant={AI_STATUS[previewDoc.status_ai].variant}
                  dot={previewDoc.status_ai !== "DONE"}
                >
                  {AI_STATUS[previewDoc.status_ai].label}
                </Badge>
              </DetailRow>
              <DetailRow label="Thẻ">
                {parseTags(previewDoc.tags).length ? (
                  <span className="flex flex-wrap gap-1">
                    {parseTags(previewDoc.tags).map((t) => (
                      <span key={t} className="chip">
                        {t}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="text-muted">Chưa gắn thẻ</span>
                )}
              </DetailRow>
              <DetailRow label="Thuộc đề tài">#{previewDoc.thesis_id}</DetailRow>
              <DetailRow label="Đường dẫn">
                <code className="font-mono text-[12px] text-tertiary break-all">
                  {previewDoc.file_path}
                </code>
              </DetailRow>
            </div>
          </div>
        )}
      </Modal>

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
            <Button variant="primary" onClick={handleSaveEdit}>
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
              onClick={() => {
                toast.success(`Đã chia sẻ sang đề tài #${shareTarget}.`);
                setShareDoc(null);
              }}
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
          <option value="2">#2 — Nghiên cứu ứng dụng IoT và Firmware FSM</option>
          <option value="3">#3 — Phân tích cú pháp và phát hiện lỗ hổng bảo mật</option>
        </Select>
      </Modal>

      {/* ---------------- Delete ---------------- */}
      <ConfirmDialog
        open={!!deleteDoc}
        onClose={() => setDeleteDoc(null)}
        onConfirm={confirmDelete}
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

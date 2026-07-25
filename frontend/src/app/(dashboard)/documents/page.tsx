"use client";

import React from "react";
import {
  Files,
  UploadSimple,
  MagnifyingGlass,
  Tag,
  DownloadSimple,
  Trash,
  PencilSimple,
  ShareNetwork,
  Eye,
  Robot,
  CheckCircle,
  Clock,
  XCircle,
  FilePdf,
  FileDoc,
  FileText,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/layout";
import {
  Card,
  Button,
  Input,
  Badge,
  Modal,
  Textarea,
  Dropdown,
  DropdownItem,
} from "@/components/ui";
import { useAuthStore } from "@/lib/auth";
import { toast } from "@/lib/toast";

/* ========================================
   TYPES (ERD Documents Table)
   ======================================== */

export type AIStatus = "PENDING" | "PROCESSING" | "DONE" | "ERROR";

export interface ResearchDocument {
  id: number;
  thesis_id: number;
  filename: string;
  file_path: string;
  file_size: number; // in bytes
  summary_ai?: string | null;
  status_ai: AIStatus;
  tags?: string | null; // comma separated
  created_at: string;
}

const mockDocuments: ResearchDocument[] = [
  {
    id: 1,
    thesis_id: 1,
    filename: "RAG_pgvector_Architecture_Paper.pdf",
    file_path: "/uploads/rag_pgvector_paper.pdf",
    file_size: 2450000, // 2.45 MB
    summary_ai: "Nghiên cứu kiến trúc RAG với PostgreSQL pgvector, HNSW Indexing tối ưu tốc độ tìm kiếm vector tương đồng dưới 50ms cho tài liệu hơn 100,000 trang.",
    status_ai: "DONE",
    tags: "AI, RAG, pgvector, Database",
    created_at: "2026-07-15 09:12",
  },
  {
    id: 2,
    thesis_id: 1,
    filename: "Thesis_Requirements_Specification_v2.docx",
    file_path: "/uploads/thesis_spec.docx",
    file_size: 1120000, // 1.12 MB
    summary_ai: "Tài liệu đặc tả 92 Use Cases toàn hệ thống NovaThesis chia thành 9 phân hệ chức năng.",
    status_ai: "DONE",
    tags: "Yêu cầu, ERD, Spec",
    created_at: "2026-07-10 14:30",
  },
  {
    id: 3,
    thesis_id: 1,
    filename: "Firmware_FSM_Watchdog_Design_Guide.pdf",
    file_path: "/uploads/firmware_fsm_guide.pdf",
    file_size: 4800000, // 4.8 MB
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
    file_size: 350000, // 350 KB
    summary_ai: null,
    status_ai: "PENDING",
    tags: "Dataset, Survey",
    created_at: "2026-07-19 10:15",
  },
];

const aiStatusBadges: Record<AIStatus, { label: string; variant: "success" | "warning" | "info" | "danger" }> = {
  PENDING: { label: "AI Chờ xử lý", variant: "warning" },
  PROCESSING: { label: "AI Đang tạo Vector", variant: "info" },
  DONE: { label: "AI Vector Sẵn sàng", variant: "success" },
  ERROR: { label: "Lỗi xử lý AI", variant: "danger" },
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function DocumentsPage() {
  const { user } = useAuthStore();
  const [documents, setDocuments] = React.useState<ResearchDocument[]>(mockDocuments);
  const [search, setSearch] = React.useState("");
  const [tagFilter, setTagFilter] = React.useState("ALL");

  // Modals State
  const [uploadModalOpen, setUploadModalOpen] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [uploadTags, setUploadTags] = React.useState("");

  const [previewDoc, setPreviewDoc] = React.useState<ResearchDocument | null>(null);
  const [editDoc, setEditDoc] = React.useState<ResearchDocument | null>(null);
  const [editFilename, setEditFilename] = React.useState("");
  const [editTags, setEditTags] = React.useState("");

  const [shareDoc, setShareDoc] = React.useState<ResearchDocument | null>(null);
  const [shareTargetThesis, setShareTargetThesis] = React.useState("2");

  // Filter & Search Logic (UC 5.2, 5.8)
  const filteredDocs = React.useMemo(() => {
    return documents.filter((d) => {
      const matchSearch =
        d.filename.toLowerCase().includes(search.toLowerCase()) ||
        (d.tags && d.tags.toLowerCase().includes(search.toLowerCase())) ||
        (d.summary_ai && d.summary_ai.toLowerCase().includes(search.toLowerCase()));

      const matchTag = tagFilter === "ALL" || (d.tags && d.tags.includes(tagFilter));

      return matchSearch && matchTag;
    });
  }, [documents, search, tagFilter]);

  // Upload Document Handler (UC 5.1, 5.7, 5.9)
  const handleSimulateUpload = () => {
    setUploading(true);
    setTimeout(() => {
      const newDoc: ResearchDocument = {
        id: Date.now(),
        thesis_id: 1,
        filename: "Tailieu_Nghien_Cuu_Moi_Uploaded.pdf",
        file_path: "/uploads/new_doc.pdf",
        file_size: 3200000,
        summary_ai: "Đang được AI trích xuất tóm tắt và đánh chỉ mục pgvector...",
        status_ai: "PROCESSING",
        tags: uploadTags || "Nghiên cứu",
        created_at: new Date().toISOString().replace("T", " ").slice(0, 16),
      };

      setDocuments((prev) => [newDoc, ...prev]);
      toast.success("Tải tài liệu lên thành công! Đã tự động đưa vào hàng đợi AI pgvector (UC 5.9).");
      setUploading(false);
      setUploadModalOpen(false);
      setUploadTags("");
    }, 1200);
  };

  // Edit Metadata (UC 5.6, 5.7)
  const handleSaveEdit = () => {
    if (!editDoc) return;
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === editDoc.id
          ? { ...d, filename: editFilename, tags: editTags }
          : d
      )
    );
    toast.success("Đã cập nhật tên và thẻ tài liệu!");
    setEditDoc(null);
  };

  // Delete Document (UC 5.5)
  const handleDelete = (id: number) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    toast.success("Đã xóa tài liệu khỏi hệ thống!");
  };

  // Download File (UC 5.4)
  const handleDownload = (filename: string) => {
    toast.success(`Đang tải về tệp ${filename}...`);
  };

  // Share Document (UC 5.10)
  const handleShare = () => {
    toast.success(`Đã chia sẻ tài liệu sang Đề tài ID #${shareTargetThesis}!`);
    setShareDoc(null);
  };

  return (
    <div>
      <PageHeader
        title="Quản lý Tài liệu Nghiên cứu & Kho RAG"
        description="Lưu trữ tài liệu, xem tóm tắt AI, vector search pgvector và chia sẻ (UC 5.1 - 5.10)."
        actions={
          <Button
            variant="primary"
            icon={<UploadSimple size={18} />}
            onClick={() => setUploadModalOpen(true)}
          >
            Upload Tài liệu (UC 5.1)
          </Button>
        }
      />

      {/* Search & Filter Bar (UC 5.8) */}
      <Card className="p-4 mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="w-full md:w-96">
          <Input
            placeholder="Tìm theo tên file, nội dung tóm tắt AI, thẻ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            icon={<MagnifyingGlass size={18} />}
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <select
            className="input-base text-[13px] py-2 w-full md:w-48"
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
          >
            <option value="ALL">Tất cả các thẻ (Tags)</option>
            <option value="AI">AI / RAG</option>
            <option value="Firmware">Firmware</option>
            <option value="Spec">Spec / Yêu cầu</option>
          </select>
        </div>
      </Card>

      {/* Documents Data Table / Grid (UC 5.2) */}
      <div className="grid grid-cols-1 gap-4">
        {filteredDocs.length === 0 ? (
          <div className="text-center py-16 text-tertiary">Không có tài liệu nào.</div>
        ) : (
          filteredDocs.map((doc) => {
            const aiSt = aiStatusBadges[doc.status_ai];

            return (
              <Card key={doc.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-4 flex-1">
                  {/* File Type Icon */}
                  <div className="w-10 h-10 rounded-xl bg-[var(--bg-surface)] text-[var(--accent)] flex items-center justify-center flex-shrink-0 mt-1">
                    {doc.filename.endsWith(".pdf") ? (
                      <FilePdf size={24} weight="duotone" />
                    ) : doc.filename.endsWith(".docx") ? (
                      <FileDoc size={24} weight="duotone" />
                    ) : (
                      <FileText size={24} weight="duotone" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-[15px] font-semibold text-primary truncate hover:text-accent cursor-pointer" onClick={() => setPreviewDoc(doc)}>
                        {doc.filename}
                      </h3>
                      <Badge variant={aiSt.variant} dot>
                        {aiSt.label}
                      </Badge>
                    </div>

                    {/* AI Summary Box (UC 5.9) */}
                    {doc.summary_ai ? (
                      <p className="text-[13px] text-secondary mb-2 line-clamp-2 bg-[var(--bg-secondary)] p-2.5 rounded-lg border border-[var(--border-secondary)]">
                        <strong className="text-accent font-medium">Tóm tắt AI:</strong> {doc.summary_ai}
                      </p>
                    ) : (
                      <p className="text-[12px] text-muted italic mb-2">Đang tự động trích xuất tóm tắt từ AI pgvector...</p>
                    )}

                    <div className="flex flex-wrap items-center gap-4 text-[12px] text-tertiary font-mono">
                      <span>Kích thước: {formatFileSize(doc.file_size)}</span>
                      <span>• {doc.created_at}</span>
                      {doc.tags && (
                        <div className="flex items-center gap-1 text-accent">
                          <Tag size={14} />
                          <span>{doc.tags}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions Dropdown */}
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" icon={<Eye size={16} />} onClick={() => setPreviewDoc(doc)}>
                    Preview (UC 5.3)
                  </Button>
                  <Button variant="ghost" size="sm" icon={<DownloadSimple size={16} />} onClick={() => handleDownload(doc.filename)}>
                    Tải về (UC 5.4)
                  </Button>

                  <Dropdown
                    align="right"
                    trigger={
                      <button className="btn-ghost p-1.5 rounded-lg text-tertiary hover:text-primary">
                        Thao tác
                      </button>
                    }
                  >
                    <DropdownItem icon={<PencilSimple size={16} />} onClick={() => { setEditDoc(doc); setEditFilename(doc.filename); setEditTags(doc.tags || ""); }}>
                      Sửa Metadata (UC 5.6)
                    </DropdownItem>
                    <DropdownItem icon={<ShareNetwork size={16} />} onClick={() => setShareDoc(doc)}>
                      Chia sẻ đề tài (UC 5.10)
                    </DropdownItem>
                    <DropdownItem danger icon={<Trash size={16} />} onClick={() => handleDelete(doc.id)}>
                      Xóa tài liệu (UC 5.5)
                    </DropdownItem>
                  </Dropdown>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Modal: Upload Document (UC 5.1) */}
      <Modal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        title="Tải lên Tài liệu Nghiên cứu mới"
        footer={
          <>
            <Button variant="ghost" onClick={() => setUploadModalOpen(false)}>
              Hủy
            </Button>
            <Button variant="primary" loading={uploading} onClick={handleSimulateUpload}>
              Bắt đầu Upload
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-[var(--border-primary)] rounded-xl bg-[var(--bg-secondary)] text-center cursor-pointer hover:border-[var(--accent)] transition-colors">
            <UploadSimple size={36} className="text-accent mb-2" />
            <p className="text-[14px] font-medium text-primary">Káo thả file tài liệu vào đây hoặc click để chọn</p>
            <p className="text-[12px] text-tertiary mt-1">Hỗ trợ PDF, DOCX, TXT (Tối đa 50MB per file)</p>
          </div>

          <Input
            label="Gắn Thẻ / Phân loại (Tags)"
            placeholder="Ví dụ: AI, RAG, Firmware, Spec"
            value={uploadTags}
            onChange={(e) => setUploadTags(e.target.value)}
            helperText="Nhập các thẻ phân cách bằng dấu phẩy"
          />
        </div>
      </Modal>

      {/* Modal: Document Preview (UC 5.3) */}
      <Modal
        open={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
        title={`Xem trước: ${previewDoc?.filename}`}
        width="max-w-4xl"
        footer={
          <Button variant="ghost" onClick={() => setPreviewDoc(null)}>
            Đóng Xem trước
          </Button>
        }
      >
        {previewDoc && (
          <div className="flex flex-col gap-4">
            <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)]">
              <h4 className="text-[13px] font-semibold text-accent mb-1 flex items-center gap-1.5">
                <Robot size={16} /> Tóm tắt tài liệu tự động từ AI:
              </h4>
              <p className="text-[13px] text-secondary">{previewDoc.summary_ai || "Chưa có bản tóm tắt AI."}</p>
            </div>

            {/* Document Viewer Frame */}
            <div className="h-96 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] flex items-center justify-center text-center p-6">
              <div>
                <FilePdf size={48} className="text-accent mx-auto mb-2" />
                <p className="text-[14px] font-medium">Trình xem trước PDF Inline Viewer</p>
                <p className="text-[12px] text-tertiary mt-1">Hiển thị trực tiếp trang tài liệu trên trình duyệt mà không cần tải về.</p>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Edit Metadata (UC 5.6, 5.7) */}
      <Modal
        open={!!editDoc}
        onClose={() => setEditDoc(null)}
        title="Chỉnh sửa Metadata Tài liệu"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditDoc(null)}>
              Hủy
            </Button>
            <Button variant="primary" onClick={handleSaveEdit}>
              Cập nhật Metadata
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input label="Tên file hiển thị" value={editFilename} onChange={(e) => setEditFilename(e.target.value)} />
          <Input label="Các thẻ phân loại (Tags)" value={editTags} onChange={(e) => setEditTags(e.target.value)} />
        </div>
      </Modal>

      {/* Modal: Share Document (UC 5.10) */}
      <Modal
        open={!!shareDoc}
        onClose={() => setShareDoc(null)}
        title={`Chia sẻ tài liệu: ${shareDoc?.filename}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShareDoc(null)}>
              Hủy
            </Button>
            <Button variant="primary" onClick={handleShare}>
              Xác nhận Chia sẻ
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-[14px] text-secondary">
            Chọn Đề tài muốn chia sẻ quyền đọc tài liệu này:
          </p>
          <select
            className="input-base text-[14px]"
            value={shareTargetThesis}
            onChange={(e) => setShareTargetThesis(e.target.value)}
          >
            <option value="2">#2 - Nghiên cứu ứng dụng IoT và Firmware FSM</option>
            <option value="3">#3 - Phân tích cú pháp và phát hiện lỗ hổng bảo mật</option>
          </select>
        </div>
      </Modal>
    </div>
  );
}

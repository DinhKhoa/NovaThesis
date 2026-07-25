"use client";

import React from "react";
import {
  ChatCircleDots,
  Paperclip,
  CheckCircle,
  PaperPlaneTilt,
  PencilSimple,
  Trash,
  ArrowElbowDownRight,
  FileText,
  Funnel,
  Clock,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/layout";
import { Card, Button, Input, Textarea, Badge, Avatar } from "@/components/ui";
import { useAuthStore, isLecturer } from "@/lib/auth";
import { toast } from "@/lib/toast";

/* ========================================
   TYPES (ERD Feedbacks Table)
   ======================================== */

export interface FeedbackItem {
  id: number;
  target_type: "MILESTONE" | "DOCUMENT";
  target_title: string;
  user_name: string;
  user_avatar?: string;
  user_role: "LECTURER" | "STUDENT";
  content: string;
  parent_id?: number | null; // recursive thread (max 3 levels)
  file_url?: string | null;
  file_name?: string | null;
  is_resolved: boolean;
  resolved_by_name?: string | null;
  created_at: string;
  created_timestamp: number;
  replies?: FeedbackItem[];
}

const mockFeedbacks: FeedbackItem[] = [
  {
    id: 1,
    target_type: "MILESTONE",
    target_title: "Nộp Báo cáo Đề cương Luận văn",
    user_name: "TS. Nguyễn Văn A",
    user_role: "LECTURER",
    content: "Đề cương cần làm rõ hơn phương pháp RAG Reranking và thử nghiệm thời gian phản hồi API.",
    is_resolved: false,
    created_at: "2026-07-18 14:00",
    created_timestamp: Date.now() - 3600000,
    file_url: "/uploads/de_cuong_gopy.pdf",
    file_name: "de_cuong_gopy.pdf",
    replies: [
      {
        id: 2,
        target_type: "MILESTONE",
        target_title: "Nộp Báo cáo Đề cương Luận văn",
        user_name: "Lê Văn C",
        user_role: "STUDENT",
        content: "Em cảm ơn thầy! Em đã bổ sung thêm chương 3 so sánh Cosine vs L2 distance trong pgvector ạ.",
        parent_id: 1,
        is_resolved: false,
        created_at: "2026-07-18 16:30",
        created_timestamp: Date.now() - 1800000,
      },
    ],
  },
  {
    id: 3,
    target_type: "DOCUMENT",
    target_title: "RAG_pgvector_Architecture_Paper.pdf",
    user_name: "TS. Nguyễn Văn A",
    user_role: "LECTURER",
    content: "File tài liệu tham khảo này rất chuẩn. Nên áp dụng thêm thuật toán HNSW index như trong bài viết.",
    is_resolved: true,
    resolved_by_name: "TS. Nguyễn Văn A",
    created_at: "2026-07-16 09:15",
    created_timestamp: Date.now() - 86400000,
  },
];

export default function FeedbacksPage() {
  const { user } = useAuthStore();
  const [feedbacks, setFeedbacks] = React.useState<FeedbackItem[]>(mockFeedbacks);
  const [filterType, setFilterType] = React.useState<string>("ALL");
  const [filterResolved, setFilterResolved] = React.useState<string>("ALL");

  // Reply state
  const [replyingId, setReplyingId] = React.useState<number | null>(null);
  const [replyText, setReplyText] = React.useState("");

  // Edit state (15 min rule UC 7.4)
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [editText, setEditText] = React.useState("");

  // New root comment form
  const [newCommentText, setNewCommentText] = React.useState("");
  const [attachedFileName, setAttachedFileName] = React.useState<string | null>(null);

  // Filter Logic (UC 7.8)
  const filteredFeedbacks = React.useMemo(() => {
    return feedbacks.filter((f) => {
      const matchType = filterType === "ALL" || f.target_type === filterType;
      const matchResolved =
        filterResolved === "ALL" ||
        (filterResolved === "RESOLVED" && f.is_resolved) ||
        (filterResolved === "OPEN" && !f.is_resolved);
      return matchType && matchResolved;
    });
  }, [feedbacks, filterType, filterResolved]);

  // Post Comment / Reply Handler (UC 7.1, 7.2, 7.3, 7.7)
  const handlePostReply = (parentId: number) => {
    if (!replyText.trim()) return;

    const newReply: FeedbackItem = {
      id: Date.now(),
      target_type: "MILESTONE",
      target_title: "Nộp Báo cáo Đề cương",
      user_name: user?.full_name || "Bạn",
      user_role: (user?.role as "LECTURER" | "STUDENT") || "STUDENT",
      content: replyText,
      parent_id: parentId,
      is_resolved: false,
      created_at: "Vừa xong",
      created_timestamp: Date.now(),
    };

    setFeedbacks((prev) =>
      prev.map((f) =>
        f.id === parentId
          ? { ...f, replies: [...(f.replies || []), newReply] }
          : f
      )
    );

    toast.success("Đã gửi phản hồi thành công!");
    setReplyingId(null);
    setReplyText("");
  };

  // Post Root Comment
  const handlePostRootComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;

    const newComment: FeedbackItem = {
      id: Date.now(),
      target_type: "MILESTONE",
      target_title: "Tiến độ Đề tài Tổng quan",
      user_name: user?.full_name || "Bạn",
      user_role: (user?.role as "LECTURER" | "STUDENT") || "STUDENT",
      content: newCommentText,
      is_resolved: false,
      created_at: "Vừa xong",
      created_timestamp: Date.now(),
      file_name: attachedFileName || undefined,
    };

    setFeedbacks([newComment, ...feedbacks]);
    toast.success("Đã đăng phản hồi mới!");
    setNewCommentText("");
    setAttachedFileName(null);
  };

  // Resolve Comment (UC 7.6)
  const handleToggleResolve = (id: number) => {
    setFeedbacks((prev) =>
      prev.map((f) =>
        f.id === id
          ? {
              ...f,
              is_resolved: !f.is_resolved,
              resolved_by_name: !f.is_resolved ? user?.full_name : null,
            }
          : f
      )
    );
    toast.success("Đã thay đổi trạng thái giải quyết nhận xét!");
  };

  // Edit Comment (15 min rule UC 7.4)
  const handleSaveEdit = (id: number) => {
    setFeedbacks((prev) =>
      prev.map((f) => (f.id === id ? { ...f, content: editText + " (Đã chỉnh sửa)" } : f))
    );
    toast.info("Đã cập nhật nội dung phản hồi");
    setEditingId(null);
  };

  // Delete Comment (UC 7.5 - Soft delete, preserve thread)
  const handleDeleteComment = (id: number) => {
    setFeedbacks((prev) =>
      prev.map((f) =>
        f.id === id
          ? { ...f, content: "[Phản hồi này đã bị xóa]" }
          : f
      )
    );
    toast.warning("Đã xóa phản hồi");
  };

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        title="Trao đổi & Nhận xét GVHD"
        description="Luồng trao đổi phân cấp (Threaded replies), đánh giá Resolve và đính kèm file (UC 7.1 - 7.8)."
      />

      {/* Post New Comment Box (UC 7.1, 7.2, 7.7) */}
      <Card className="p-5 mb-6">
        <form onSubmit={handlePostRootComment}>
          <Textarea
            placeholder="Viết nhận xét hoặc phản hồi cho Giảng viên / Sinh viên..."
            rows={3}
            value={newCommentText}
            onChange={(e) => setNewCommentText(e.target.value)}
          />

          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-2">
              <label className="btn-ghost text-tertiary hover:text-accent p-2 rounded-lg cursor-pointer inline-flex items-center gap-1.5 text-[13px]">
                <Paperclip size={18} />
                <span>{attachedFileName || "Đính kèm file (UC 7.7)"}</span>
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      setAttachedFileName(e.target.files[0].name);
                      toast.info(`Đã đính kèm ${e.target.files[0].name}`);
                    }
                  }}
                />
              </label>
            </div>

            <Button variant="primary" type="submit" icon={<PaperPlaneTilt size={18} />}>
              Gửi nhận xét
            </Button>
          </div>
        </form>
      </Card>

      {/* Filter Bar (UC 7.8) */}
      <div className="flex items-center justify-between mb-4 text-[13px]">
        <span className="text-tertiary">Lịch sử phản hồi ({filteredFeedbacks.length})</span>

        <div className="flex items-center gap-3">
          <select
            className="input-base text-[12px] py-1.5 w-36"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="ALL">Tất cả loại</option>
            <option value="MILESTONE">Milestone</option>
            <option value="DOCUMENT">Tài liệu</option>
          </select>

          <select
            className="input-base text-[12px] py-1.5 w-36"
            value={filterResolved}
            onChange={(e) => setFilterResolved(e.target.value)}
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="OPEN">Chưa Resolve</option>
            <option value="RESOLVED">Đã Resolve</option>
          </select>
        </div>
      </div>

      {/* Feedbacks Thread Tree (UC 7.3) */}
      <div className="flex flex-col gap-4">
        {filteredFeedbacks.map((f) => (
          <Card key={f.id} className={`p-5 ${f.is_resolved ? "opacity-75" : ""}`}>
            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-3">
                <Avatar name={f.user_name} size="sm" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[14px]">{f.user_name}</span>
                    <Badge variant={f.user_role === "LECTURER" ? "info" : "success"}>
                      {f.user_role === "LECTURER" ? "Giảng viên" : "Sinh viên"}
                    </Badge>
                  </div>
                  <span className="text-[11px] text-tertiary">
                    trên {f.target_type}: <strong className="text-secondary">{f.target_title}</strong> • {f.created_at}
                  </span>
                </div>
              </div>

              {/* GV Resolve Toggle (UC 7.6) */}
              {isLecturer(user) && (
                <Button
                  variant={f.is_resolved ? "secondary" : "ghost"}
                  size="sm"
                  icon={<CheckCircle size={16} className={f.is_resolved ? "text-success" : ""} />}
                  onClick={() => handleToggleResolve(f.id)}
                >
                  {f.is_resolved ? "Resolved" : "Resolve (UC 7.6)"}
                </Button>
              )}
            </div>

            {/* Content Body */}
            {editingId === f.id ? (
              <div className="my-2">
                <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} />
                <div className="flex justify-end gap-2 mt-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>Hủy</Button>
                  <Button variant="primary" size="sm" onClick={() => handleSaveEdit(f.id)}>Lưu</Button>
                </div>
              </div>
            ) : (
              <p className="text-[14px] text-secondary leading-relaxed my-2">{f.content}</p>
            )}

            {/* File Attachment (UC 7.7) */}
            {f.file_name && (
              <div className="flex items-center gap-2 text-[12px] text-accent bg-[var(--accent-subtle)] p-2 rounded-lg w-fit my-2">
                <Paperclip size={14} />
                <span>{f.file_name}</span>
              </div>
            )}

            {/* Actions Bar */}
            <div className="flex items-center gap-4 text-[12px] text-tertiary pt-2 border-t border-[var(--border-secondary)] mt-3">
              <button
                className="hover:text-accent flex items-center gap-1 font-medium"
                onClick={() => setReplyingId(replyingId === f.id ? null : f.id)}
              >
                <ArrowElbowDownRight size={14} /> Trả lời (UC 7.3)
              </button>

              {/* Edit within 15 min (UC 7.4) */}
              {Date.now() - f.created_timestamp < 15 * 60 * 1000 && (
                <button
                  className="hover:text-primary flex items-center gap-1"
                  onClick={() => { setEditingId(f.id); setEditText(f.content); }}
                >
                  <PencilSimple size={14} /> Sửa (15ph)
                </button>
              )}

              <button
                className="hover:text-danger flex items-center gap-1"
                onClick={() => handleDeleteComment(f.id)}
              >
                <Trash size={14} /> Xóa
              </button>
            </div>

            {/* Sub-threads (Level 2 & 3 replies) (UC 7.3) */}
            {f.replies && f.replies.length > 0 && (
              <div className="ml-6 mt-4 pl-4 border-l-2 border-[var(--border-primary)] flex flex-col gap-3">
                {f.replies.map((r) => (
                  <div key={r.id} className="bg-[var(--bg-secondary)] p-3 rounded-xl border border-[var(--border-secondary)]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-[13px]">{r.user_name}</span>
                      <span className="text-[11px] text-tertiary">{r.created_at}</span>
                    </div>
                    <p className="text-[13px] text-secondary">{r.content}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Inline Reply Input */}
            {replyingId === f.id && (
              <div className="ml-6 mt-3 flex gap-2">
                <Input
                  placeholder="Nhập câu trả lời..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="flex-1"
                  autoFocus
                />
                <Button variant="primary" size="sm" onClick={() => handlePostReply(f.id)}>
                  Gửi Reply
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

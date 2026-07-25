"use client";

import React from "react";
import {
  Robot,
  PaperPlaneTilt,
  Plus,
  Trash,
  ThumbsUp,
  ThumbsDown,
  BookOpenText,
  MagnifyingGlass,
  Sparkle,
  Copy,
  Check,
  Bookmarks,
  Lightbulb,
  Scales,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/layout";
import { Card, Button, Input, Badge, Modal, Textarea } from "@/components/ui";
import { toast } from "@/lib/toast";

/* ========================================
   TYPES (ERD AI Chat Sessions & Messages)
   ======================================== */

export interface ChatMessage {
  id: number;
  role: "USER" | "ASSISTANT";
  content: string;
  citations?: { doc_title: string; page?: number; score: number }[];
  rating?: "LIKE" | "DISLIKE" | null;
  created_at: string;
}

export interface ChatSession {
  id: number;
  title: string;
  thesis_title: string;
  created_at: string;
}

const mockSessions: ChatSession[] = [
  { id: 1, title: "Hỏi đáp vềpgvector HNSW Index", thesis_title: "NovaThesis", created_at: "Hôm nay" },
  { id: 2, title: "Gợi ý Đề cương Luận văn AI", thesis_title: "NovaThesis", created_at: "Hôm qua" },
  { id: 3, title: "Kiểm tra Đạo văn & Trích dẫn", thesis_title: "NovaThesis", created_at: "3 ngày trước" },
];

const initialMessages: ChatMessage[] = [
  {
    id: 1,
    role: "ASSISTANT",
    content: "Xin chào! Tôi là Trợ lý AI NovaThesis tích hợp RAG. Tôi có thể hỗ trợ bạn tìm kiếm tài liệu, giải thích khái niệm, kiểm tra trích dẫn hoặc gợi ý cấu trúc luận văn. Bạn cần trợ giúp gì hôm nay?",
    created_at: "10:00",
  },
  {
    id: 2,
    role: "USER",
    content: "Hãy giải thích cách pgvector tối ưu hóa Vector Search bằng chỉ mục HNSW trong hệ thống NovaThesis?",
    created_at: "10:02",
  },
  {
    id: 3,
    role: "ASSISTANT",
    content: "Dựa trên tài liệu RAG_pgvector_Architecture_Paper.pdf trong kho đề tài của bạn:\n\n**HNSW (Hierarchical Navigable Small World)** là thuật toán lập chỉ mục đồ thị đa tầng cho phép tìm kiếm láng giềng gần nhất (ANN - Approximate Nearest Neighbor).\n\n- **Tốc độ:** Giảm thời gian truy vấn vector 1536 chiều từ O(N) xuống O(log N).\n- **Độ chính xác:** Đạt >98% độ tương đồng Cosine trong các bài toán Semantic Search.\n- **Tích hợp:** Chạy trực tiếp trong PostgreSQL mà không cần triển khai thêm Vector DB ngoài.",
    citations: [
      { doc_title: "RAG_pgvector_Architecture_Paper.pdf", page: 12, score: 0.94 },
      { doc_title: "Thesis_Requirements_Specification_v2.docx", page: 4, score: 0.88 },
    ],
    rating: "LIKE",
    created_at: "10:03",
  },
];

export default function AIChatPage() {
  const [sessions, setSessions] = React.useState<ChatSession[]>(mockSessions);
  const [activeSessionId, setActiveSessionId] = React.useState<number>(1);
  const [messages, setMessages] = React.useState<ChatMessage[]>(initialMessages);

  const [inputPrompt, setInputPrompt] = React.useState("");
  const [streaming, setStreaming] = React.useState(false);
  const [copiedId, setCopiedId] = React.useState<number | null>(null);

  // Tools Tabs
  const [activeTool, setActiveTool] = React.useState<"chat" | "semantic" | "plagiarism" | "outline">("chat");

  // Semantic Search State (UC 6.8)
  const [semanticQuery, setSemanticQuery] = React.useState("");
  const [semanticResults, setSemanticResults] = React.useState<Array<{ doc: string; snippet: string; score: number }>>([]);
  const [searchingSemantic, setSearchingSemantic] = React.useState(false);

  // Plagiarism Check State (UC 6.12)
  const [plagiarismText, setPlagiarismText] = React.useState("");
  const [plagiarismResult, setPlagiarismResult] = React.useState<{ similarity: number; matches: Array<{ source: string; percent: number }> } | null>(null);
  const [checkingPlagiarism, setCheckingPlagiarism] = React.useState(false);

  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  // Create Session (UC 6.2)
  const handleNewSession = () => {
    const newSess: ChatSession = {
      id: Date.now(),
      title: "Phiên hội thoại mới",
      thesis_title: "NovaThesis",
      created_at: "Vừa xong",
    };
    setSessions([newSess, ...sessions]);
    setActiveSessionId(newSess.id);
    setMessages([
      {
        id: Date.now(),
        role: "ASSISTANT",
        content: "Phiên làm việc mới đã sẵn sàng. Hãy đặt câu hỏi cho AI!",
        created_at: new Date().toLocaleTimeString().slice(0, 5),
      },
    ]);
  };

  // Delete Session (UC 6.5)
  const handleDeleteSession = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions(sessions.filter((s) => s.id !== id));
    toast.success("Đã xóa phiên chat!");
  };

  // Send Prompt (UC 6.1, 6.4, 6.6)
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPrompt.trim() || streaming) return;

    const userMsg: ChatMessage = {
      id: Date.now(),
      role: "USER",
      content: inputPrompt,
      created_at: new Date().toLocaleTimeString().slice(0, 5),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputPrompt("");
    setStreaming(true);

    // Simulate AI Streaming Response
    setTimeout(() => {
      const aiMsg: ChatMessage = {
        id: Date.now() + 1,
        role: "ASSISTANT",
        content: `Dựa trên nội dung trích xuất từ tài liệu của đề tài NovaThesis:\n\n${userMsg.content.includes("đề cương") ? "Dưới đây là đề xuất cấu trúc đề cương 5 chương chuẩn học thuật:" : "Hệ thống AI đã thực hiện RAG Vector Search qua pgvector và tổng hợp câu trả lời chi tiết cho bạn."}`,
        citations: [
          { doc_title: "RAG_pgvector_Architecture_Paper.pdf", page: 5, score: 0.91 },
        ],
        created_at: new Date().toLocaleTimeString().slice(0, 5),
      };
      setMessages((prev) => [...prev, aiMsg]);
      setStreaming(false);
    }, 1200);
  };

  // Rate Message (UC 6.7)
  const handleRateMessage = (msgId: number, rating: "LIKE" | "DISLIKE") => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, rating } : m))
    );
    toast.success(rating === "LIKE" ? "Cảm ơn bạn đã đánh giá hữu ích!" : "Đã ghi nhận phản hồi để cải thiện AI.");
  };

  // Copy Text
  const handleCopy = (id: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.info("Đã sao chép nội dung câu trả lời");
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Semantic Search Handler (UC 6.8)
  const handleSemanticSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!semanticQuery.trim()) return;

    setSearchingSemantic(true);
    setTimeout(() => {
      setSemanticResults([
        {
          doc: "RAG_pgvector_Architecture_Paper.pdf",
          snippet: "...pgvector cho phép lưu trữ 1536 chiều vector embedding và tính khoảng cách Cosine trực tiếp bằng toán tử <=>...",
          score: 0.95,
        },
        {
          doc: "Thesis_Requirements_Specification_v2.docx",
          snippet: "...Phân hệ AI Chat hỗ trợ RAG trích xuất ngữ nghĩa đoạn trích document_chunks...",
          score: 0.89,
        },
      ]);
      setSearchingSemantic(false);
    }, 800);
  };

  // Plagiarism Check Handler (UC 6.12)
  const handleCheckPlagiarism = () => {
    if (!plagiarismText.trim()) {
      toast.error("Vui lòng nhập văn bản cần kiểm tra");
      return;
    }
    setCheckingPlagiarism(true);
    setTimeout(() => {
      setPlagiarismResult({
        similarity: 12,
        matches: [
          { source: "RAG_pgvector_Architecture_Paper.pdf", percent: 8 },
          { source: "Tài liệu trực tuyến công khai", percent: 4 },
        ],
      });
      setCheckingPlagiarism(false);
    }, 1500);
  };

  return (
    <div className="h-[calc(100vh-var(--topbar-height)-3rem)] flex flex-col">
      <PageHeader
        title="Trợ lý AI & Tìm kiếm Ngữ nghĩa RAG"
        description="Chatbot học thuật, truy vấn vector pgvector, gợi ý đề cương & kiểm tra đạo văn (UC 6.1 - 6.14)."
      />

      {/* Feature Navigation Tabs */}
      <div className="flex items-center gap-2 mb-4 border-b border-[var(--border-primary)] pb-2 flex-shrink-0">
        <button
          className={`px-3.5 py-1.5 text-[13px] font-medium rounded-lg transition-colors flex items-center gap-2 ${
            activeTool === "chat" ? "bg-[var(--accent-subtle)] text-[var(--accent)]" : "text-tertiary hover:text-primary"
          }`}
          onClick={() => setActiveTool("chat")}
        >
          <Robot size={16} /> Chat AI (UC 6.1)
        </button>
        <button
          className={`px-3.5 py-1.5 text-[13px] font-medium rounded-lg transition-colors flex items-center gap-2 ${
            activeTool === "semantic" ? "bg-[var(--accent-subtle)] text-[var(--accent)]" : "text-tertiary hover:text-primary"
          }`}
          onClick={() => setActiveTool("semantic")}
        >
          <MagnifyingGlass size={16} /> Vector Search pgvector (UC 6.8)
        </button>
        <button
          className={`px-3.5 py-1.5 text-[13px] font-medium rounded-lg transition-colors flex items-center gap-2 ${
            activeTool === "plagiarism" ? "bg-[var(--accent-subtle)] text-[var(--accent)]" : "text-tertiary hover:text-primary"
          }`}
          onClick={() => setActiveTool("plagiarism")}
        >
          <Scales size={16} /> Kiểm tra Đạo văn (UC 6.12)
        </button>
      </div>

      {/* TOOL 1: CHAT AI (UC 6.1 - 6.7) */}
      {activeTool === "chat" && (
        <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4 min-h-0">
          {/* Sessions Sidebar (UC 6.3) */}
          <Card className="md:col-span-1 p-3 flex flex-col justify-between overflow-hidden">
            <div>
              <Button
                variant="primary"
                size="sm"
                className="w-full mb-3"
                icon={<Plus size={16} />}
                onClick={handleNewSession}
              >
                Phiên chat mới (UC 6.2)
              </Button>

              <div className="text-[11px] font-medium text-tertiary uppercase mb-2 px-2">Lịch sử hội thoại</div>

              <div className="flex flex-col gap-1 overflow-y-auto max-h-[420px]">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className={`flex items-center justify-between p-2 rounded-lg cursor-pointer text-[13px] transition-colors group ${
                      activeSessionId === s.id
                        ? "bg-[var(--accent-subtle)] text-[var(--accent)] font-medium"
                        : "text-secondary hover:bg-[var(--bg-hover)]"
                    }`}
                    onClick={() => setActiveSessionId(s.id)}
                  >
                    <span className="truncate pr-2">{s.title}</span>
                    <button
                      className="opacity-0 group-hover:opacity-100 text-tertiary hover:text-danger p-1"
                      onClick={(e) => handleDeleteSession(s.id, e)}
                    >
                      <Trash size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Chat Messages Main Area (UC 6.1, 6.4, 6.6) */}
          <Card className="md:col-span-3 flex flex-col min-h-0 overflow-hidden">
            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex gap-3 ${m.role === "USER" ? "justify-end" : "justify-start"}`}
                >
                  {m.role === "ASSISTANT" && (
                    <div className="w-8 h-8 rounded-lg bg-[var(--accent)] text-[var(--accent-fg)] flex items-center justify-center flex-shrink-0 font-bold">
                      <Robot size={18} />
                    </div>
                  )}

                  <div className={`max-w-[80%] flex flex-col ${m.role === "USER" ? "items-end" : "items-start"}`}>
                    <div
                      className={`p-3.5 rounded-2xl text-[14px] leading-relaxed whitespace-pre-line ${
                        m.role === "USER"
                          ? "bg-[var(--accent)] text-[var(--accent-fg)] rounded-tr-none font-medium"
                          : "bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-primary rounded-tl-none"
                      }`}
                    >
                      {m.content}
                    </div>

                    {/* RAG Citations (UC 6.6) */}
                    {m.citations && m.citations.length > 0 && (
                      <div className="mt-2 p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-secondary)] text-[12px] w-full">
                        <span className="text-tertiary font-medium block mb-1">Nguồn trích dẫn (RAG pgvector):</span>
                        {m.citations.map((c, i) => (
                          <div key={i} className="flex items-center justify-between text-accent py-0.5">
                            <span>📄 {c.doc_title} (Trang {c.page})</span>
                            <span className="font-mono text-[11px] text-tertiary">Match: {(c.score * 100).toFixed(0)}%</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Action & Feedback buttons (UC 6.7) */}
                    {m.role === "ASSISTANT" && (
                      <div className="flex items-center gap-2 mt-1 text-[12px] text-tertiary">
                        <button className="hover:text-primary" onClick={() => handleCopy(m.id, m.content)}>
                          {copiedId === m.id ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                        </button>
                        <button
                          className={`hover:text-success ${m.rating === "LIKE" ? "text-success" : ""}`}
                          onClick={() => handleRateMessage(m.id, "LIKE")}
                        >
                          <ThumbsUp size={14} />
                        </button>
                        <button
                          className={`hover:text-danger ${m.rating === "DISLIKE" ? "text-danger" : ""}`}
                          onClick={() => handleRateMessage(m.id, "DISLIKE")}
                        >
                          <ThumbsDown size={14} />
                        </button>
                        <span className="font-mono text-[11px] ml-2">{m.created_at}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {streaming && (
                <div className="flex items-center gap-2 text-[13px] text-tertiary animate-pulse">
                  <Robot size={18} className="text-accent" />
                  <span>AI đang suy nghĩ và trích xuất vector pgvector...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Prompt Input Form */}
            <form onSubmit={handleSendMessage} className="p-3 border-t border-[var(--border-primary)] flex gap-2">
              <Input
                placeholder="Nhập câu hỏi học thuật, yêu cầu giải thích hoặc tạo đề cương..."
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" variant="primary" loading={streaming} icon={<PaperPlaneTilt size={18} />}>
                Gửi
              </Button>
            </form>
          </Card>
        </div>
      )}

      {/* TOOL 2: SEMANTIC VECTOR SEARCH (UC 6.8) */}
      {activeTool === "semantic" && (
        <Card className="p-6">
          <h2 className="text-base font-semibold mb-2 flex items-center gap-2">
            <Sparkle size={20} style={{ color: "var(--accent)" }} />
            Tìm kiếm Ngữ nghĩa Kho Tài liệu (pgvector Cosine Search)
          </h2>
          <p className="text-[13px] text-tertiary mb-4">
            Tìm kiếm bằng ý nghĩa câu thay vì từ khóa chính xác. Hệ thống chuyển query thành 1536d embedding.
          </p>

          <form onSubmit={handleSemanticSearch} className="flex gap-2 mb-6 max-w-2xl">
            <Input
              placeholder="Nhập ý tưởng hoặc khái niệm cần tìm..."
              value={semanticQuery}
              onChange={(e) => setSemanticQuery(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" variant="primary" loading={searchingSemantic} icon={<MagnifyingGlass size={18} />}>
              Truy vấn Vector
            </Button>
          </form>

          <div className="flex flex-col gap-3">
            {semanticResults.map((r, i) => (
              <div key={i} className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)]">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-semibold text-[14px] text-accent">📄 {r.doc}</span>
                  <Badge variant="success">Độ tương đồng: {(r.score * 100).toFixed(0)}%</Badge>
                </div>
                <p className="text-[13px] text-secondary leading-relaxed font-mono bg-[var(--bg-tertiary)] p-3 rounded-lg">
                  {r.snippet}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* TOOL 3: PLAGIARISM CHECK (UC 6.12) */}
      {activeTool === "plagiarism" && (
        <Card className="p-6 max-w-3xl">
          <h2 className="text-base font-semibold mb-2 flex items-center gap-2">
            <Scales size={20} style={{ color: "var(--accent)" }} />
            Kiểm tra Đạo văn & Trùng lặp Văn bản
          </h2>

          <Textarea
            label="Dán đoạn văn bản luận văn cần kiểm tra"
            rows={6}
            placeholder="Dán đoạn văn cần so sánh đối chiếu trùng lặp..."
            value={plagiarismText}
            onChange={(e) => setPlagiarismText(e.target.value)}
          />

          <Button
            variant="primary"
            className="mt-4"
            loading={checkingPlagiarism}
            onClick={handleCheckPlagiarism}
          >
            Chạy Đánh giá Trùng lặp
          </Button>

          {plagiarismResult && (
            <div className="mt-6 p-5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)]">
              <h3 className="text-[15px] font-semibold mb-2 flex items-center gap-2">
                Tỷ lệ trùng lặp phát hiện:{" "}
                <span className="text-success text-lg">{plagiarismResult.similarity}% (An toàn)</span>
              </h3>
              <p className="text-[13px] text-tertiary mb-4">Kết quả đối chiếu với kho cơ sở dữ liệu học thuật NovaThesis.</p>

              <div className="flex flex-col gap-2">
                {plagiarismResult.matches.map((m, i) => (
                  <div key={i} className="flex justify-between text-[13px] py-1 border-b border-[var(--border-secondary)]">
                    <span className="text-secondary">{m.source}</span>
                    <span className="font-mono text-warning">{m.percent}% trùng khớp</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

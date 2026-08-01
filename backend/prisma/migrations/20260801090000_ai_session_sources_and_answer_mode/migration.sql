-- =============================================================================
--  TRỢ LÝ AI KIỂU NOTEBOOKLM — CHỌN NGUỒN THEO PHIÊN + HAI CHẾ ĐỘ TRẢ LỜI
-- =============================================================================
--
--  Migration này chỉ THÊM, không sửa và không xoá gì, nên dữ liệu hiện có an
--  toàn tuyệt đối:
--
--    • `ai_chat_sessions.answer_mode` có DEFAULT nên các phiên cũ tự nhận
--      'HYBRID' mà không cần UPDATE.
--    • `ai_chat_messages.used_general_knowledge` mặc định FALSE — đúng với thực
--      tế, vì mọi câu trả lời trước đây đều ở chế độ chỉ-dùng-tài-liệu.
--    • `ai_chat_session_sources` khởi tạo rỗng. Quy ước "không có dòng nào =
--      dùng tất cả tài liệu trong phạm vi" khiến phiên cũ giữ nguyên hành vi.
-- =============================================================================

-- Chế độ trả lời của trợ lý.
CREATE TYPE "AnswerMode" AS ENUM ('STRICT', 'HYBRID');

ALTER TABLE "ai_chat_sessions"
  ADD COLUMN "answer_mode" "AnswerMode" NOT NULL DEFAULT 'HYBRID';

ALTER TABLE "ai_chat_messages"
  ADD COLUMN "used_general_knowledge" BOOLEAN NOT NULL DEFAULT false;

-- Tập nguồn của từng phiên hội thoại.
CREATE TABLE "ai_chat_session_sources" (
  "session_id"  INTEGER NOT NULL,
  "document_id" INTEGER NOT NULL,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ai_chat_session_sources_pkey" PRIMARY KEY ("session_id", "document_id")
);

-- Xoá phiên hoặc xoá tài liệu thì dòng nguồn tương ứng biến mất theo. Không
-- CASCADE thì một tài liệu bị gỡ sẽ để lại nguồn mồ côi, và truy vấn RAG lọc
-- theo một id không còn tồn tại — trả về rỗng mà không báo lỗi gì.
ALTER TABLE "ai_chat_session_sources"
  ADD CONSTRAINT "ai_chat_session_sources_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "ai_chat_sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_chat_session_sources"
  ADD CONSTRAINT "ai_chat_session_sources_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "documents"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Khoá chính đã phục vụ chiều "nguồn của một phiên". Index này phục vụ chiều
-- ngược lại — "tài liệu này đang được phiên nào dùng" — mà `ON DELETE CASCADE`
-- phải quét mỗi lần xoá tài liệu.
CREATE INDEX "ai_chat_session_sources_document_id_idx"
  ON "ai_chat_session_sources"("document_id");

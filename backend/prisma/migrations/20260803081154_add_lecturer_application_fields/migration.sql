-- =============================================================================
--  ĐƠN ĐĂNG KÝ GIẢNG VIÊN — bốn cột trên bảng `lecturers`
-- =============================================================================
--
--  CẢNH BÁO cho lần `prisma migrate dev` kế tiếp:
--
--  Bản nháp mà Prisma tự sinh ra cho migration này mở đầu bằng năm lệnh
--  `DROP INDEX` — idx_chunks_embedding_hnsw, idx_chunks_content_trgm,
--  idx_documents_tags, idx_documents_filename_trgm, idx_theses_title_trgm.
--  Chúng đã bị xoá khỏi file này bằng tay.
--
--  Đây không phải drift thật. Năm index đó do migration viết tay tạo ra
--  (`..._vector_and_search_indexes`, `..._chunk_fulltext_index`) và không thể
--  biểu diễn được trong `schema.prisma`: HNSW trên `vector(1536)`, GIN trên
--  `text[]`, và trigram `gin_trgm_ops`. Cơ sở dữ liệu bóng (shadow database) mà
--  Prisma dựng lên để so sánh chỉ chạy được phần lược đồ nó hiểu, nên nó thấy
--  năm index này "thừa" và đề nghị xoá — mỗi lần, mãi mãi.
--
--  Hậu quả nếu để nguyên bản nháp: mất `idx_chunks_embedding_hnsw` thì tìm kiếm
--  vector chuyển sang quét tuần tự toàn bảng, đúng thứ mục tiêu "< 50ms cho
--  100.000 trang" sinh ra để tránh. Chuyện này đã xảy ra một lần rồi và phải
--  sửa bằng `..._repair_schema_drift`.
--
--  Vì vậy phần 2 dưới đây tạo lại cả năm, idempotent. Lần sau gặp lại bản nháp
--  có `DROP INDEX`, hãy xoá chúng đi thay vì chạy.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  1. Cột mới
-- -----------------------------------------------------------------------------
--  Cả bốn đều nullable: tài khoản giảng viên do Admin tạo tay không đi qua luồng
--  đơn từ và bỏ trống toàn bộ. `credential_image_url IS NOT NULL` vì thế chính
--  là điều kiện nhận biết một hồ sơ đến từ lá đơn tự nộp.

ALTER TABLE "lecturers" ADD COLUMN IF NOT EXISTS "institution" VARCHAR(255);
ALTER TABLE "lecturers" ADD COLUMN IF NOT EXISTS "phone" VARCHAR(30);
ALTER TABLE "lecturers" ADD COLUMN IF NOT EXISTS "credential_image_url" VARCHAR(512);
ALTER TABLE "lecturers" ADD COLUMN IF NOT EXISTS "application_note" TEXT;

-- -----------------------------------------------------------------------------
--  2. Giữ lại các index mà Prisma đòi xoá
--     (ghi chú đầy đủ về từng index nằm ở `..._vector_and_search_indexes`)
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw
  ON document_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_chunks_content_trgm
  ON document_chunks USING gin (content gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_documents_tags
  ON documents USING gin (tags);

CREATE INDEX IF NOT EXISTS idx_documents_filename_trgm
  ON documents USING gin (filename gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_theses_title_trgm
  ON theses USING gin (title gin_trgm_ops);

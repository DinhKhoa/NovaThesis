-- =============================================================================
--  SỬA LỆCH GIỮA CƠ SỞ DỮ LIỆU VÀ LỊCH SỬ MIGRATION
-- =============================================================================
--
--  Phát hiện ngày 2026-08-03: `prisma migrate dev` báo drift. Đối chiếu trực
--  tiếp với `information_schema` cho thấy cơ sở dữ liệu đang chạy THIẾU những
--  thứ mà `20260729175121_init`, `..._vector_and_search_indexes` và
--  `..._chunk_fulltext_index` đáng lẽ đã tạo:
--
--    • `lecturers.lecturer_code`, `lecturers.department`, `lecturers.max_students`
--    • `students.student_code`
--    • toàn bộ index GIN / trigram / HNSW
--
--  Ba cột đầu là NOT NULL trong `schema.prisma` và ĐƯỢC TRUY VẤN thật
--  (`THESIS_CARD_INCLUDE` trong `milestones.service.ts` select `department`),
--  nên trước migration này mọi lần tải danh sách đề tài đều ném lỗi Prisma.
--  Thiếu `idx_chunks_embedding_hnsw` thì tìm kiếm vector vẫn ra kết quả đúng
--  nhưng quét tuần tự toàn bảng — hỏng đúng mục tiêu hiệu năng của đề tài.
--
--  Nguyên nhân gần như chắc chắn: cơ sở dữ liệu được dựng bằng `prisma db push`
--  (bỏ qua mọi migration viết tay) rồi đánh dấu lịch sử bằng `migrate resolve`.
--
--  Toàn bộ câu lệnh dưới đây đều `IF NOT EXISTS` / `IF EXISTS`: chạy lại trên
--  một cơ sở dữ liệu đã đúng thì không đổi gì. Cố ý KHÔNG dùng `migrate reset` —
--  cơ sở dữ liệu này đang có dữ liệu thật.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  1. Cột hồ sơ còn thiếu
-- -----------------------------------------------------------------------------

ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "student_code" VARCHAR(50);
CREATE UNIQUE INDEX IF NOT EXISTS "students_student_code_key"
  ON "students"("student_code");

ALTER TABLE "lecturers" ADD COLUMN IF NOT EXISTS "lecturer_code" VARCHAR(50);
ALTER TABLE "lecturers" ADD COLUMN IF NOT EXISTS "department" VARCHAR(100);
ALTER TABLE "lecturers" ADD COLUMN IF NOT EXISTS "max_students" INTEGER NOT NULL DEFAULT 5;

--  Hai cột trên là NOT NULL trong lược đồ nhưng bảng đã có dữ liệu, nên phải
--  điền giá trị trước khi siết ràng buộc. Mã sinh từ `id` nên chắc chắn duy
--  nhất; phòng khoa để trống một cách nhìn thấy được, không bịa ra tên khoa.
UPDATE "lecturers" SET "lecturer_code" = 'GV' || lpad("id"::text, 4, '0')
  WHERE "lecturer_code" IS NULL;
UPDATE "lecturers" SET "department" = 'Chưa cập nhật'
  WHERE "department" IS NULL;

ALTER TABLE "lecturers" ALTER COLUMN "lecturer_code" SET NOT NULL;
ALTER TABLE "lecturers" ALTER COLUMN "department" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "lecturers_lecturer_code_key"
  ON "lecturers"("lecturer_code");

ALTER TABLE "lecturers" DROP CONSTRAINT IF EXISTS "lecturers_max_students_positive";
ALTER TABLE "lecturers" ADD CONSTRAINT "lecturers_max_students_positive"
  CHECK ("max_students" > 0);

-- -----------------------------------------------------------------------------
--  2. Index tìm kiếm (xem ghi chú gốc trong `..._vector_and_search_indexes`)
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw
  ON document_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_chunks_content_trgm
  ON document_chunks USING gin (content gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_documents_tags ON documents USING gin (tags);

CREATE INDEX IF NOT EXISTS idx_documents_filename_trgm
  ON documents USING gin (filename gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_theses_title_trgm
  ON theses USING gin (title gin_trgm_ops);

-- -----------------------------------------------------------------------------
--  3. Ràng buộc toàn vẹn — đặt lại cho chắc, cả ba đều idempotent
-- -----------------------------------------------------------------------------

ALTER TABLE feedbacks DROP CONSTRAINT IF EXISTS feedbacks_exactly_one_target;
ALTER TABLE feedbacks ADD CONSTRAINT feedbacks_exactly_one_target
  CHECK (("milestone_id" IS NULL) <> ("document_id" IS NULL));

ALTER TABLE feedbacks DROP CONSTRAINT IF EXISTS feedbacks_max_depth;
ALTER TABLE feedbacks ADD CONSTRAINT feedbacks_max_depth
  CHECK ("depth" >= 0 AND "depth" <= 2);

ALTER TABLE plagiarism_checks DROP CONSTRAINT IF EXISTS plagiarism_similarity_range;
ALTER TABLE plagiarism_checks ADD CONSTRAINT plagiarism_similarity_range
  CHECK ("similarity" >= 0 AND "similarity" <= 100);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_document_current_version
  ON document_versions (document_id) WHERE is_current = true;

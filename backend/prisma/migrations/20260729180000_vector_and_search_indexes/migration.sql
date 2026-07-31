-- =============================================================================
--  Index tìm kiếm + ràng buộc toàn vẹn mà Prisma chưa sinh được
--
--  Mục IV của `ERD_Specification.md` chỉ rõ: cột `embedding vector(1536)` không
--  có index thì mọi truy vấn tương đồng sẽ quét tuần tự toàn bảng (O(N)) — trái
--  ngược hoàn toàn với mục tiêu "< 50ms cho 100.000 trang" của đề tài.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  1. Tìm kiếm vector (cốt lõi của đề tài)
-- -----------------------------------------------------------------------------
--  HNSW thay vì IVFFlat: IVFFlat cần dữ liệu mẫu để huấn luyện danh sách phân
--  cụm, nên trên bảng rỗng lúc khởi tạo nó cho recall rất tệ cho đến khi
--  REINDEX. HNSW dựng dần theo từng lần chèn nên đúng ngay từ tài liệu đầu tiên.
--  m = 16, ef_construction = 64 là cấu hình cân bằng theo khuyến nghị pgvector.
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw
  ON document_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- -----------------------------------------------------------------------------
--  2. Lọc theo thẻ (UC 5.7) — `text[]` cần GIN, B-tree không dùng được với @>
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_documents_tags ON documents USING gin (tags);

-- -----------------------------------------------------------------------------
--  3. Tìm kiếm toàn văn (UC 5.8)
-- -----------------------------------------------------------------------------
--  Dùng cấu hình 'simple': PostgreSQL không có bộ stemmer tiếng Việt, còn
--  'english' sẽ cắt đuôi sai trên từ tiếng Việt. 'simple' chỉ tách token và hạ
--  chữ thường — đúng thứ ta cần ở đây.
CREATE INDEX IF NOT EXISTS idx_documents_fts ON documents
  USING gin (to_tsvector('simple', filename || ' ' || coalesce(summary_ai, '')));

--  Bổ sung trigram cho tìm kiếm "gõ tới đâu lọc tới đó": to_tsvector không khớp
--  được tiền tố giữa từ, trigram thì có.
CREATE INDEX IF NOT EXISTS idx_documents_filename_trgm
  ON documents USING gin (filename gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_theses_title_trgm
  ON theses USING gin (title gin_trgm_ops);

-- -----------------------------------------------------------------------------
--  4. Index bộ phận cho các truy vấn nóng
-- -----------------------------------------------------------------------------
--  Hộp thư thông báo chỉ quan tâm dòng chưa đọc.
CREATE INDEX IF NOT EXISTS idx_notif_unread
  ON notifications (user_id, created_at DESC) WHERE is_read = false;

--  Job nhắc deadline (UC 8.8) chỉ quét mốc chưa hoàn thành.
CREATE INDEX IF NOT EXISTS idx_milestones_pending_deadline
  ON milestones (deadline) WHERE status <> 'COMPLETED' AND deleted_at IS NULL;

--  Hàng đợi AI: worker liên tục hỏi "còn tài liệu nào chờ không".
CREATE INDEX IF NOT EXISTS idx_documents_ai_queue
  ON documents (status_ai, created_at) WHERE status_ai IN ('PENDING', 'PROCESSING');

-- -----------------------------------------------------------------------------
--  5. Ràng buộc toàn vẹn không diễn đạt được bằng Prisma schema
-- -----------------------------------------------------------------------------
--  `feedbacks` gắn vào ĐÚNG MỘT đối tượng. Đây là thứ thay thế cho khoá ngoại
--  đa hình (target_type, target_id) trong ERD gốc — vốn không thể ràng buộc
--  được ở tầng CSDL và để lại bình luận mồ côi khi xoá milestone/tài liệu.
ALTER TABLE feedbacks DROP CONSTRAINT IF EXISTS feedbacks_exactly_one_target;
ALTER TABLE feedbacks ADD CONSTRAINT feedbacks_exactly_one_target
  CHECK ((milestone_id IS NULL) <> (document_id IS NULL));

--  Thread tối đa 3 cấp (UC 7.3). Cưỡng chế ở CSDL để tầng ứng dụng không phải
--  đếm đệ quy mỗi lần chèn.
ALTER TABLE feedbacks DROP CONSTRAINT IF EXISTS feedbacks_max_depth;
ALTER TABLE feedbacks ADD CONSTRAINT feedbacks_max_depth
  CHECK (depth >= 0 AND depth <= 2);

--  Mỗi tài liệu chỉ có đúng một phiên bản đang hiệu lực.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_document_current_version
  ON document_versions (document_id) WHERE is_current = true;

--  Chỉ một năm học được mở tại một thời điểm (UC 2.7).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_academic_year_active
  ON academic_years (is_active) WHERE is_active = true;

--  Quota giảng viên phải dương.
ALTER TABLE lecturers DROP CONSTRAINT IF EXISTS lecturers_max_students_positive;
ALTER TABLE lecturers ADD CONSTRAINT lecturers_max_students_positive
  CHECK (max_students > 0);

--  Tỷ lệ trùng lặp nằm trong [0, 100].
ALTER TABLE plagiarism_checks DROP CONSTRAINT IF EXISTS plagiarism_similarity_range;
ALTER TABLE plagiarism_checks ADD CONSTRAINT plagiarism_similarity_range
  CHECK (similarity >= 0 AND similarity <= 100);

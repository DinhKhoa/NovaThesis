-- =============================================================================
--  Chỉ mục toàn văn cho document_chunks — phục vụ tìm kiếm lai (hybrid search)
--
--  Vì sao cần, đo được bằng số:
--
--  Tìm kiếm vector thuần thất bại với truy vấn NGẮN chứa THUẬT NGỮ HIẾM. Đo
--  trên chính kho tài liệu mẫu của dự án:
--
--    "HNSW khác IVFFlat ở điểm nào?"   → cosine cao nhất 0,101
--    "Món phở bò nấu thế nào?"          → cosine cao nhất 0,089
--
--  Hai câu hỏi này khác nhau một trời một vực về mức liên quan, nhưng cosine
--  gần như không phân biệt được. Nguyên nhân là bản chất của cosine trên vector
--  túi-từ: câu hỏi 6 từ khớp 2 thuật ngữ hiếm trong một đoạn 350 từ vẫn cho
--  điểm thấp, vì khối lượng vector của đoạn trải trên toàn bộ 350 từ đó. Đây
--  chính là bài toán mà IDF sinh ra để giải, và IDF thì không thể tính được từ
--  một vector đã nhúng sẵn.
--
--  PostgreSQL đã có sẵn IDF trong `ts_rank`. Hợp nhất hai bảng xếp hạng bằng
--  Reciprocal Rank Fusion cho ta cả hai thế mạnh: vector bắt được cách diễn đạt
--  khác nhau, còn toàn văn bắt được thuật ngữ chính xác và hiếm.
--
--  Cấu hình 'simple': PostgreSQL không có stemmer tiếng Việt, còn 'english' sẽ
--  cắt đuôi sai trên từ tiếng Việt.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_chunks_content_fts
  ON document_chunks USING gin (to_tsvector('simple', content));

-- Trigram cho khớp một phần: `to_tsvector` không bắt được tiền tố giữa từ, nên
-- gõ "pgvect" sẽ không khớp "pgvector" nếu chỉ có FTS.
CREATE INDEX IF NOT EXISTS idx_chunks_content_trgm
  ON document_chunks USING gin (content gin_trgm_ops);

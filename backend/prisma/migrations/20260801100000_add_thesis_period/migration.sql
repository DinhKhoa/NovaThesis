-- =============================================================================
--  BƯỚC 1/3 — THÊM KỲ NGHIÊN CỨU VÀO BẢNG THESES
-- =============================================================================
--
--  Ba migration TÁCH RỜI cho một việc, có chủ đích. Cơ sở dữ liệu đang có dữ
--  liệu thật, nên nếu bước 2 (chuyển dữ liệu) sai thì bước 3 (xoá bảng cũ) chưa
--  chạy — `academic_years` vẫn còn nguyên đó và làm lại được.
--
--  Gộp cả ba vào một tệp thì `DROP TABLE` nằm cùng transaction với `UPDATE`:
--  thoạt nghe an toàn hơn, nhưng thực tế là ta mất đi cơ hội DỪNG LẠI và ĐỐI
--  CHIẾU giữa hai bước — thứ duy nhất phát hiện được backfill sai mà vẫn chạy
--  trơn.
--
--  Bước này chỉ thêm cột nullable: không khoá bảng lâu, không ảnh hưởng gì tới
--  ứng dụng đang chạy.
-- =============================================================================

ALTER TABLE "theses" ADD COLUMN "start_date" DATE;
ALTER TABLE "theses" ADD COLUMN "end_date"   DATE;

-- Phân kỳ báo cáo và bộ lọc khoảng thời gian truy vấn theo cột này.
CREATE INDEX "theses_start_date_idx" ON "theses"("start_date");

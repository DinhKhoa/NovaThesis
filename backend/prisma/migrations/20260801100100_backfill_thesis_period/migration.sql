-- =============================================================================
--  BƯỚC 2/3 — CHUYỂN DỮ LIỆU TỪ ACADEMIC_YEARS SANG THESES
-- =============================================================================
--
--  Không xoá gì ở bước này. `academic_years` và `theses.academic_year_id` vẫn
--  còn nguyên sau khi chạy, nên đối chiếu được và làm lại được.
--
--  ⚠️ SAU KHI CHẠY, PHẢI ĐỐI CHIẾU TRƯỚC KHI SANG BƯỚC 3:
--
--      SELECT count(*) AS chua_chuyen
--      FROM theses
--      WHERE academic_year_id IS NOT NULL
--        AND (start_date IS NULL OR end_date IS NULL);
--
--  Kết quả phải bằng 0. Khác 0 nghĩa là có đề tài trỏ tới một năm học không còn
--  tồn tại (khoá ngoại `ON DELETE SET NULL` không dọn được trường hợp dữ liệu bị
--  sửa tay). Xử lý xong mới chạy bước 3 — chạy trước là mất khoảng thời gian của
--  những đề tài đó, không lấy lại được.
--
--  Đối chiếu thêm cho chắc:
--
--      SELECT count(*) FROM theses WHERE start_date IS NOT NULL;   -- đã có kỳ
--      SELECT count(*) FROM theses WHERE academic_year_id IS NOT NULL;
--
--  Hai con số phải bằng nhau.
-- =============================================================================

UPDATE "theses" AS t
SET "start_date" = a."start_date",
    "end_date"   = a."end_date"
FROM "academic_years" AS a
WHERE t."academic_year_id" = a."id"
  -- Không ghi đè giá trị đã có: migration này chạy lại được nhiều lần mà không
  -- xoá mất kỳ nghiên cứu do người dùng tự đặt trong khoảng thời gian giữa hai
  -- bước.
  AND (t."start_date" IS NULL OR t."end_date" IS NULL);

-- =============================================================================
--  BƯỚC 3/3 — XOÁ BẢNG ACADEMIC_YEARS
-- =============================================================================
--
--  ⚠️ CHỈ CHẠY SAU KHI câu đối chiếu ở bước 2 trả về 0. Bước này KHÔNG hoàn tác
--  được: dữ liệu năm học biến mất khỏi cơ sở dữ liệu.
--
--  Lý do bỏ: "Năm học" là khái niệm của riêng một cơ sở đào tạo — có một năm học
--  đang hoạt động, mọi đề tài mới tự gán vào đó. Trên một nền tảng công khai
--  dùng cho nhiều trường và nhiều nhóm nghiên cứu độc lập, không tồn tại một
--  lịch chung như vậy, và cái "năm học đang hoạt động" của người này là sai với
--  tất cả những người còn lại.
--
--  Phần có ích của nó — mốc thời gian để đối chiếu deadline mốc tiến độ và để
--  phân kỳ báo cáo — đã chuyển sang `theses.start_date` / `theses.end_date` ở
--  bước 1 và 2.
-- =============================================================================

-- Chỉ mục bộ phận bảo đảm "nhiều nhất một năm học đang hoạt động" (tạo trong
-- migration `..._vector_and_search_indexes`). Xoá tường minh: Postgres tự dọn
-- khi DROP TABLE, nhưng nêu tên ra để người đọc migration này biết nó từng có.
DROP INDEX IF EXISTS "uniq_academic_year_active";

ALTER TABLE "theses" DROP CONSTRAINT IF EXISTS "theses_academic_year_id_fkey";
DROP INDEX IF EXISTS "theses_academic_year_id_idx";
ALTER TABLE "theses" DROP COLUMN IF EXISTS "academic_year_id";

DROP TABLE IF EXISTS "academic_years";

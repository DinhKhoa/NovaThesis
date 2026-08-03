-- Nhánh `main` phía remote (commit "Feedback v2") đã gỡ bỏ hoàn toàn luồng nghiệp vụ
-- đọc/ghi `lecturer_code`, `department`, `max_students`, `student_code`:
--   * `admin.service.ts` tạo giảng viên bằng `lecturer.create({ data: { user_id } })`
--   * `auth.service.ts` không còn nhận các trường này trong `ProfileInput`
--
-- Nhưng hai cột `lecturers.lecturer_code` và `lecturers.department` đang là NOT NULL
-- và không có DEFAULT, nên mọi lệnh INSERT bỏ trống chúng sẽ hỏng ở tầng CSDL
-- (23502 not_null_violation) — tức là tạo tài khoản giảng viên mới sẽ lỗi.
--
-- Ở đây chỉ nới ràng buộc, KHÔNG dùng DROP COLUMN: dữ liệu cũ trong các cột này
-- vẫn được giữ nguyên để không mất mát thông tin đã nhập trước đó.

ALTER TABLE "lecturers" ALTER COLUMN "lecturer_code" DROP NOT NULL;
ALTER TABLE "lecturers" ALTER COLUMN "department" DROP NOT NULL;

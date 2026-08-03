-- =============================================================================
--  BẢN NHÁP NHẬN XÉT DO AI SINH (Milestone AI Draft Review)
-- =============================================================================
--
--  Dùng chính bảng `feedbacks` thay vì `ai_suggestions`: thứ AI sinh ra ở đây là
--  một đoạn NHẬN XÉT gửi cho người chấm — cùng hình dạng với mọi nhận xét khác,
--  nên giảng viên "chép sang phản hồi" là copy văn bản chứ không phải chuyển đổi
--  cấu trúc. `ai_suggestions.payload` giữ JSON của lộ trình, một hình dạng khác
--  hẳn.
--
--  `is_ai_draft` mặc định `false` nên mọi bình luận đã có giữ nguyên ý nghĩa.
-- =============================================================================

ALTER TABLE "feedbacks" ADD COLUMN IF NOT EXISTS "is_ai_draft" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "feedbacks" ADD COLUMN IF NOT EXISTS "ai_milestone_id" INTEGER;

--  Truy vấn duy nhất đọc cột này là "bản nháp mới nhất của mốc X", nên index bộ
--  phận: nó chỉ chứa vài dòng thay vì toàn bộ bảng bình luận.
CREATE INDEX IF NOT EXISTS "idx_feedbacks_ai_draft"
  ON "feedbacks" ("milestone_id", "created_at" DESC) WHERE "is_ai_draft" = true;

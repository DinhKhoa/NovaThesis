# REVIEW LOG – Rà soát & Sửa lỗi Tài liệu Dự án NovaThesis

> Ngày thực hiện: 26/07/2026
> Phiên bản: 1.0

---

## Tổng quan

- **Số UC ban đầu:** 92 (theo mục lục `00_UC_Overview.md`)
- **Số UC sau khi sửa:** 87
- **Số UC bị xoá/gộp:** 5 (gộp 3 UC Module 1, gộp 3 UC Module 6, xoá 1 UC trùng lặp)

---

## Danh sách thay đổi

### 1. Module 1 – Xác thực & Tài khoản (`01_UC_Authentication.md`)

| Thay đổi | Chi tiết |
|----------|---------|
| **Gộp UC 1.8 + 1.9 + 1.10 → UC 1.8 "Quản lý hồ sơ cá nhân"** | UC 1.8 (Xem hồ sơ), UC 1.9 (Chỉnh sửa hồ sơ), UC 1.10 (Cập nhật ảnh đại diện) gộp thành 1 UC vì cùng là các thao tác quản lý hồ sơ cá nhân, quá nhỏ lẻ khi tách riêng. UC mới bao gồm: xem thông tin, chỉnh sửa SĐT/Giới thiệu/Địa chỉ, upload avatar. |
| **Giảm Module 1 từ 10 → 8 UC** | Xoá UC 1.9, UC 1.10; giữ UC 1.8 mở rộng. |

### 2. Module 2 – Quản trị Admin (`02_UC_Admin.md`)

| Thay đổi | Chi tiết |
|----------|---------|
| **Bổ sung UC 2.7 "Quản lý năm học"** | UC này có trong `00_UC_Overview.md` nhưng bị thiếu trong `02_UC_Admin.md`. Đã bổ sung đầy đủ (tạo, chỉnh sửa, trạng thái aktiv). |
| **Đánh số lại UC 2.7 → 2.8, UC 2.8 → 2.9** | UC "Xem log hoạt động" từ 2.7 → 2.8. UC "Cấu hình tham số" từ 2.8 → 2.9. Khớp với `00_UC_Overview.md`. |

### 3. Module 6 – Hỗ trợ bởi AI (`06_UC_AI.md`)

| Thay đổi | Chi tiết |
|----------|---------|
| **Gộp UC 6.11 + 6.12 + 6.13 → UC 6.11 "Xử lý gợi ý lộ trình AI"** | UC 6.11 (Chấp nhận), UC 6.12 (Từ chối/Chỉnh sửa), UC 6.13 (Tái tạo) gộp thành 1 UC vì là các bước trong cùng 1 workflow xử lý gợi ý AI. UC mới bao gồm 4 luồng chính: chấp nhận, từ chối, chỉnh sửa, tái tạo. |
| **Xoá UC 6.14 "Xem trạng thái xử lý AI của tài liệu"** | Trùng hoàn toàn với UC 5.9 (cùng tên, cùng mô tả, cùng actors). Giữ UC 5.9 ở Module 5 (đúng ngữ cảnh quản lý tài liệu). |
| **Giảm Module 6 từ 14 → 11 UC** | Gộp 3 UC → 1, xoá 1 UC trùng lặp. |

### 4. Tổng hợp (`00_UC_Overview.md`)

| Thay đổi | Chi tiết |
|----------|---------|
| **Cập nhật sơ đồ Mermaid Module 1** | Gộp UC 1.8/1.9/1.10 thành UC 1.8 "Quản lý hồ sơ cá nhân". |
| **Cập nhật sơ đồ Mermaid Module 6** | Gộp UC 6.11/6.12/6.13 thành UC 6.11, xoá UC 6.14. |
| **Cập nhật bảng Actor** | Sửa số UC Module 1 (10→8) và Module 6 (14→11). |
| **Cập nhật bảng Tổng số UC** | Module 1: 10→8, Module 6: 14→11, Tổng: 92→87. |

### 5. File Tổng hợp (`ALL_UC_Consolidated.md`)

| Thay đổi | Chi tiết |
|----------|---------|
| **Cập nhật header** | Tổng UC: 92 → 87. |
| **Cập nhật mục lục** | Module 1: 8, Module 6: 11, Tổng: 87. |
| **Gộp UC 1.8/1.9/1.10** | Thay nội dung 3 UC bằng UC 1.8 "Quản lý hồ sơ cá nhân". |
| **Bổ sung UC 2.7 + đánh số lại** | Thêm UC 2.7, renumber 2.7→2.8, 2.8→2.9. |
| **Gộp UC 6.11/6.12/6.13** | Thay nội dung 3 UC bằng UC 6.11 "Xử lý gợi ý lộ trình AI". |
| **Xoá UC 6.14** | Xoá toàn bộ nội dung UC trùng lặp. |
| **Cập nhật sơ đồ Mermaid** | Module 1 và Module 6 cập nhật theo thay đổi. |
| **Đánh dấu ghi chú rà soát A1/A2/A3** | Đánh dấu đã sửa. |
| **Cập nhật ghi chú C5** | Sửa "UC 6.10–6.13" → "UC 6.10–6.11". |

---

## Bảng tổng hợp số UC theo Module

| Module | Trước | Sau | Ghi chú |
|--------|-------|-----|---------|
| M1 – Xác thực | 10 | **8** | Gộp 1.8+1.9+1.10 → 1.8 |
| M2 – Quản trị | 9 | **9** | Bổ sung 2.7, đánh số lại |
| M3 – Quản lý Đề tài | 14 | **14** | Không thay đổi |
| M4 – Quản lý Milestone | 15 | **15** | Không thay đổi |
| M5 – Quản lý Tài liệu | 10 | **10** | Không thay đổi |
| M6 – Hỗ trợ AI | 14 | **11** | Gộp 6.11+6.12+6.13→6.11, xoá 6.14 |
| M7 – Trao đổi | 8 | **8** | Không thay đổi |
| M8 – Thông báo | 8 | **8** | Không thay đổi |
| M9 – Báo cáo | 4 | **4** | Không thay đổi |
| **Tổng** | **92** | **87** | **-5 UC** |

---

## Vấn đề còn tồn đọng (chưa sửa)

| # | Vấn đề | Gợi ý |
|---|--------|-------|
| A4 | UC 6.8 đánh số lệch giữa `00_UC_Overview.md` và `06_UC_AI.md` | Xác nhận lại tên UC 6.8 và cập nhật thống nhất |
| B1 | Chức năng "Kiểm tra trùng lặp/đạo văn" đã có giao diện nhưng chưa có UC | Bổ sung UC 6.12 hoặc gỡ khỏi giao diện |
| B2 | Kéo–thả Kanban đổi trạng thái milestone chưa có UC | Bổ sung vào UC 4.8 |
| B3 | Tìm nhanh toàn cục ⌘K chưa có UC | Ghi vào Non-functional requirement |
| B4 | Đổi giao diện Sáng/Tối chưa có UC | Ghi vào Non-functional requirement |
| C1–C7 | Các UC có nhưng thiếu bảng CSDL | Xem ERD_Specification.md |

---

# ĐỢT RÀ SOÁT 2 — Đồng bộ báo cáo với source code

> Ngày thực hiện: 01/08/2026
> Phiên bản: 2.0
> Đầu vào: `REVIEW_v2_DongBo_BaoCao_SourceCode.md`, `SPEC_v2_HoanThien_NovaThesis.md`

## Thay đổi trong `Hieu_BT_NguyenDinhKhoa_49K14.1.md`

### Viết mới hai chương đang rỗng

| Mục | Trước | Sau |
|---|---|---|
| CHƯƠNG 4 — XÂY DỰNG HỆ THỐNG | Một dòng gồm 5 tiêu đề dán liền nhau, không có nội dung | 5 mục đầy đủ (~4.500 từ): cài đặt công cụ, xây dựng CSDL, chức năng chính, chức năng AI, đánh giá kết quả |
| KẾT LUẬN VÀ HƯỚNG PHÁT TRIỂN | Chỉ có tiêu đề | Phần kết luận theo 4 khía cạnh + 5 hướng phát triển |
| KẾT LUẬN CHƯƠNG 4 | Không có | Bổ sung |

### Vẽ lại ERD

| Trước | Sau |
|---|---|
| 13 bảng | **22 bảng**, khớp chính xác `schema.prisma` cả về số lượng và thứ tự |

Bảng bổ sung: `thesis_members`, `milestone_history`, `document_versions`, `document_shares`, `ai_chat_session_sources`, `ai_suggestions`, `plagiarism_checks`, `notification_preferences`, `refresh_tokens`.

Cột bổ sung/sửa đáng kể:

| Bảng | Sửa |
|---|---|
| `users` | +10 cột (xác minh email, đặt lại mật khẩu, bộ đếm đăng nhập sai, `locked_until`, xoá mềm). Thêm trạng thái `PENDING_VERIFICATION` — không có nó thì luồng UC 1.1 tự mâu thuẫn với ERD |
| `students` | Bỏ `thesis_id` (quan hệ đã thành N-N), thêm `student_code` |
| `lecturers` | Thêm `lecturer_code` |
| `theses` | Thêm `REVISION_REQUIRED`, `created_by`, `start_date`/`end_date`, `revision_note`, `submitted_at`, `completed_at` |
| `milestones` | +12 cột (yêu cầu sửa, xin gia hạn, thứ tự, kiểm toán phê duyệt) |
| `documents` | +9 cột, `tags` đổi từ `VARCHAR` phân cách phẩy sang `TEXT[]` |
| `document_chunks` | +`chunk_index`, `page_number`, `token_count`; `embedding` cho phép NULL |
| `feedbacks` | Khoá đa hình `target_type`/`target_id` tách thành 2 cột nullable + CHECK |
| `notifications` | +`type`, `link`, `read_at`, `dedupe_key` |
| `system_logs` | +`level`, `user_agent`; `details` đổi sang JSONB |
| `system_configs` | +`value_type`, `category`, `is_secret`, `updated_by` |
| `academic_years` | **Đã xoá** — thay bằng `theses.start_date`/`end_date` |

### Bổ sung mục 3.3 Thiết kế bảo mật

Mục hoàn toàn mới, gồm 7 phần: xác thực và quản lý phiên, chống dò mật khẩu hai lớp, phân quyền hai tầng, bảo vệ tệp tin, an toàn cho phần AI (chống prompt injection, phạm vi truy xuất), kiểm toán, và các lớp còn lại.

### Sửa mâu thuẫn nội tại

| # | Vấn đề | Sửa thành |
|---|---|---|
| 1 | Kiến trúc nói "OpenAI API" | Lớp trừu tượng đa nhà cung cấp (Anthropic/OpenAI/Gemini) + phương án dự phòng trích xuất |
| 2 | UC 2.8 nói model "GPT-3.5/GPT-4" | `claude-sonnet-5` mặc định, kèm các lựa chọn khác |
| 3 | UC 4.9 nói tối đa 10MB, UC 5.1 nói 50MB | Thống nhất 50MB (`MAX_UPLOAD_MB`) |
| 4 | UC 4.9 nói lưu Cloud S3/Cloudinary, UC 5.1 nói MinIO | Thư mục riêng tư trên máy chủ, tên băm, tải qua endpoint có quyền hoặc URL ký HMAC |
| 5 | KẾT LUẬN CHƯƠNG 2 nói "sáu nhóm" | Chín nhóm, khớp bảng Use case |
| 6 | Cùng đoạn nói "đặc tả bao phủ toàn bộ chín nhóm" | Nói rõ là UC tiêu biểu; 87 UC đầy đủ ở Phụ lục 1 |
| 7 | UC 6.3 nói "không cross-thesis" | Phần giao của tập quyền (gồm tài liệu chia sẻ) và tập nguồn người dùng chọn |
| 8 | UC 6.3 nói cosine đơn thuần | Tìm kiếm lai (pgvector HNSW + toàn văn IDF, hợp nhất bằng RRF), ngưỡng tương đối |
| 9 | UC 6.5 chỉ có một chế độ | Bổ sung hai chế độ STRICT/HYBRID và quy tắc tách khối cảnh báo |
| 10 | Bảng yêu cầu chức năng thiếu nhóm quản trị | +16 chức năng: nhóm QT (6), BC (3), TL (2), AI (3), PH (1) |
| 11 | Nói "hai nhóm người dùng chính" | Ba nhóm, kèm mô tả vai trò quản trị viên |
| 12 | AI-02 ghi tác nhân chỉ "Sinh viên" | Sinh viên, Giảng viên — khớp UC 6.1 |

### Sửa lỗi trình bày

- "Xem **dánh** sách" → "danh sách"
- "Mô tả bảng **lectures**" → "lecturers"
- "Tên mốc **tiến**." → "tiến độ."
- "liên kết **đếnmilestone_id**" → thêm dấu cách
- Caption UC 6.1 ghi "Yêu cầu tóm tắt lại" → "Tóm tắt tài liệu", khớp tiêu đề
- Escape markdown lộ ra ở ``\`ERROR\``` → `ERROR`

### Tài liệu tham khảo

- Gộp 2 cặp trùng lặp: `[15]` ≡ `[3]` (Sentence-BERT), `[16]` ≡ `[4]` (RAG)
- Đánh số lại từ 22 → **20** mục
- Ánh xạ lại toàn bộ trích dẫn trong thân báo cáo cho khớp
- Đã kiểm chứng: trích dẫn trong thân = [1..20], danh mục = [1..20], không có trích dẫn treo, không có mục không được dùng

### Mục lục

- Bổ sung `3.3. Thiết kế bảo mật`, đánh số lại giao diện thành `3.4`
- Bổ sung `KẾT LUẬN CHƯƠNG 4`
- Bỏ số trang ở ba mục cuối vì chương 4 đã dài ra, số cũ không còn đúng

---

## Vấn đề tồn đọng của đợt 1 — trạng thái

| # | Vấn đề đợt 1 | Trạng thái |
|---|---|---|
| B1 | "Kiểm tra trùng lặp" có giao diện nhưng chưa có UC | Đã có bảng `plagiarism_checks` trong ERD và chức năng AI-07 trong bảng yêu cầu; **UC đặc tả vẫn còn thiếu** |
| B2 | Kéo–thả Kanban đổi trạng thái chưa có UC | Đã mô tả trong mục 4.3 (máy trạng thái); **UC 4.8 chưa bổ sung** |
| B3 | Tìm nhanh ⌘K chưa có UC | Chưa xử lý |
| B4 | Đổi giao diện Sáng/Tối chưa có UC | Chưa xử lý |
| C1–C7 | UC có nhưng thiếu bảng CSDL | **Đã xử lý** — ERD giờ có đủ 22 bảng |
| A4 | UC 6.8 đánh số lệch giữa hai tệp | Chưa xử lý |

## Việc còn lại

1. Bổ sung đặc tả UC cho: chọn nguồn hội thoại AI, chuyển chế độ trả lời, kiểm tra trùng lặp, phiên bản tài liệu, chia sẻ tài liệu, xin gia hạn mốc, trang tổng quan quản trị.
2. Xoá UC 2.7 "Quản lý năm học" khỏi các tệp UC, thay bằng "Đặt kỳ nghiên cứu cho đề tài" thuộc nhóm quản lý đề tài.
3. Đồng bộ `00_UC_Overview.md`, `02_UC_Admin.md`, `03_UC_Thesis.md`, `05_UC_Document.md`, `06_UC_AI.md`, `ALL_UC_Consolidated.md`, `ERD_Specification.md`, `Screen_Flow_Diagram.md`, `ARCHITECTURE.md`.
4. Đánh số toàn bộ "Bảng ." và "Hình ." thành "Bảng 1..n" / "Hình 1..n" — cần làm sau khi chốt nội dung để số không phải sửa lại.
5. Chèn ảnh chụp giao diện mới (bảng nguồn AI, trang tổng quan quản trị) vào Phụ lục 2.

---

# ĐỢT RÀ SOÁT 3 — Bỏ localStorage, dọn sạch năm học

> Ngày thực hiện: 01/08/2026
> Ba quyết định của người hướng dẫn dự án

## 1. Bỏ hoàn toàn "năm học" khỏi source code, backend, router và database

| Nơi | Trạng thái |
|---|---|
| `schema.prisma` | Không còn model, không còn cột, không còn quan hệ |
| Router (`admin`, `theses`, `reports`) | Không còn endpoint, không còn bộ lọc, không còn schema |
| Service | Không còn hàm CRUD, `resolveAcademicYearId` đã xoá |
| Serializer | Không còn trường trả về |
| Frontend | Không còn tab cấu hình, không còn kiểu dữ liệu, không còn lời gọi API |
| Audit action | `ACADEMIC_YEAR_UPDATE` đã xoá |
| **Comment trong code** | Đã xoá hết tham chiếu, kể cả các ghi chú giải thích lịch sử |
| **Cơ sở dữ liệu** | Bảng `academic_years` bị `DROP` ở migration `20260801100200` |
| **Migration SQL** | **Vẫn giữ** — xem ghi chú dưới |

`grep -ri "academic\|năm học"` trên `backend/src`, `frontend/src`, `schema.prisma`, `seed*.ts` và `tests` giờ **không trả về gì**.

**Vì sao migration phải giữ:** cơ sở dữ liệu đang chạy đã áp dụng migration `20260729175121_init`, và migration đó tạo bảng `academic_years`. Xoá nó khỏi thư mục `migrations/` sẽ làm lệch bảng `_prisma_migrations` và Prisma từ chối chạy tiếp. Ba migration `20260801100000` → `20260801100200` chính là các bước hợp thức để loại bảng đó khỏi cơ sở dữ liệu. Chúng là nhật ký, không phải mã nguồn đang hoạt động; kết quả cuối cùng trong cơ sở dữ liệu là sạch.

Chỉ khi nào tạo lại cơ sở dữ liệu từ đầu (mất toàn bộ dữ liệu hiện có) thì mới gộp được bốn migration đó lại thành một.

## 2. Không lưu dữ liệu ở localStorage

### Phiên đăng nhập

| Trước | Sau |
|---|---|
| Access token + refresh token đều nằm trong `localStorage` | Refresh token: cookie `httpOnly`, path giới hạn `/api/v1/auth`. Access token: một biến trong bộ nhớ trang |

Lý do: mọi script chạy trên trang đọc được `localStorage`. Một thư viện phụ thuộc bị chèn mã độc, một đoạn nhúng bên thứ ba, hay một lỗ XSS ở bất kỳ đâu đều đủ để lấy trọn phiên 14 ngày.

Tệp mới: `backend/src/lib/cookies.ts` (đặt/xoá/đọc cookie + `assertSameOrigin` chống CSRF), biến môi trường `COOKIE_SAMESITE`.

Thay đổi hợp đồng API:

| Endpoint | Trước | Sau |
|---|---|---|
| `POST /auth/login` | Trả `access_token` + `refresh_token` trong body | Trả `access_token`; refresh token vào cookie |
| `POST /auth/refresh` | Nhận `{ refresh_token }` trong body | Không nhận tham số; đọc cookie, xoay vòng cookie |
| `POST /auth/logout` | Nhận `{ refresh_token }` trong body | Không nhận tham số; đọc cookie, xoá cookie |

Hệ quả ở frontend: `initialize()` gọi `/auth/refresh` **trước** `/auth/me`, vì sau khi tải lại trang bộ nhớ chưa có token nào. Thêm một request mỗi lần tải trang — cái giá của việc không lưu gì ở máy người dùng.

### Tuỳ chọn giao diện

| Trước | Sau |
|---|---|
| `next-themes` lưu chế độ sáng/tối vào `localStorage` | `ThemeProvider` tự viết, dùng cookie. Đã **gỡ dependency `next-themes`** |
| `useStoredFlag` (sidebar thu gọn) dùng `localStorage` | Dùng cookie |

Cookie hoá ra tốt hơn cho đúng bài toán này: root layout là server component nên đọc được cookie và gắn class `dark` vào HTML đầu tiên — không script chặn render, không nháy sáng-rồi-tối.

Tệp mới: `frontend/src/lib/client-cookies.ts`.

### Khoá đăng nhập

| Trước | Sau |
|---|---|
| `locked_until` ghi vào `localStorage` theo email để sống qua F5 | Không lưu ở đâu; lấy thẳng từ phản hồi 429 |

Đánh đổi có ý thức: tải lại trang thì đồng hồ mất, bấm "Đăng nhập" một lần là hiện lại. Giữ đồng hồ sống qua F5 đòi hỏi một endpoint hỏi "email này có bị khoá không" — chính là công cụ dò email đã đăng ký.

### Nhân đây sửa 3 lỗi lint React Compiler

| Tệp | Lỗi |
|---|---|
| `ThemeProvider.tsx` | `setState` trong effect → dùng `useSyncExternalStore` |
| `auth-sheet.tsx` | Gọi `Date.now()` trong lúc render |
| `layout/index.tsx` | `setState` trong effect cho nhãn phím tắt (**lỗi có từ trước**) |

`npx eslint src` giờ **0 lỗi**.

## 3. Hoàn tất phần spec còn dở

- Bộ lọc khoảng kỳ nghiên cứu (`from`/`to`) ở trang Báo cáo, đi thẳng vào query của endpoint xuất theo business rule UC 9.2-3.
- Sửa được kỳ nghiên cứu ở trang chi tiết đề tài; `updateSchema` nhận `start_date`/`end_date` kèm ràng buộc `end > start`.

## Thay đổi trong `Hieu_BT_NguyenDinhKhoa_49K14.1.md`

| Mục | Sửa |
|---|---|
| ERD `theses.end_date` | Bỏ câu "thay cho bảng năm học" |
| Chương 4 §4.2 (migration nhiều bước) | Diễn đạt lại không nêu khái niệm cũ, bổ sung ý "bước xoá không hoàn tác được" |
| Chương 4 §4.1 | Bổ sung đoạn giải thích vì sao loại bỏ `next-themes` |
| Bảng thư viện | Gỡ `next-themes`, thêm `cookie-parser` |
| **Mục 3.3 Bảo mật** | Thêm hẳn phần "Nơi lưu token phía trình duyệt" (~6 đoạn) |
| Mục 3.3 chống dò mật khẩu | Bổ sung đánh đổi của việc không lưu `locked_until` ở client |
| Chương 4 §4.2 kết nối dữ liệu | Bổ sung yêu cầu bật `credentials` ở cả nhánh `XMLHttpRequest` |
| UC 1.1 | Post-condition và main flow nói rõ token nào đi đâu; exception 5b bỏ phần đồng hồ sống qua F5 |
| UC 1.3 | Business rule và exception flow bỏ `local storage` |
| UC 2.6 | Bộ lọc "Năm học/Học kỳ" → "khoảng thời gian" |
| UC 9.2 | Bộ lọc năm học → khoảng kỳ nghiên cứu; định dạng PDF → CSV cho khớp cài đặt thật |
| Kết luận | Bổ sung ý về nơi lưu token; bài học thiết kế diễn đạt lại không nêu khái niệm cũ |
| Hạn chế | Thêm hạn chế thứ năm về CSRF chỉ dựa vào `Origin`; tổng 5 → 6 hạn chế |

`grep -i "năm học\|academic"` trên báo cáo giờ trả về **0**. Ba lần còn nhắc `localStorage` đều nằm trong mục 3.3 và là phần giải thích tại sao không dùng nó.

## Việc còn lại (giữ nguyên từ đợt 2)

1. Bổ sung đặc tả UC cho: chọn nguồn hội thoại AI, chuyển chế độ trả lời, kiểm tra trùng lặp, phiên bản tài liệu, chia sẻ tài liệu, xin gia hạn mốc, trang tổng quan quản trị.
2. Xoá UC 2.7 "Quản lý năm học" khỏi các tệp UC rời, thay bằng "Đặt kỳ nghiên cứu cho đề tài".
3. Đồng bộ 9 tệp tài liệu còn lại trong thư mục này.
4. Đánh số toàn bộ "Bảng ." và "Hình .".
5. Chèn ảnh chụp giao diện mới vào Phụ lục 2.

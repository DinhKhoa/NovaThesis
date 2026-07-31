# REVIEW v2 — Đối chiếu Báo cáo ↔ Source code & Đề xuất hoàn thiện

> Ngày thực hiện: 31/07/2026
> Tài liệu được rà soát: `Hieu_BT_NguyenDinhKhoa_49K14.1.md` (2861 dòng)
> Source code: `backend/` (Express + Prisma + PostgreSQL/pgvector), `frontend/` (Next.js)

---

## PHẦN A — LỖI KHÔNG ĐỒNG NHẤT GIỮA BÁO CÁO VÀ SOURCE CODE

### A1. Chương 4 "XÂY DỰNG HỆ THỐNG" bị rỗng — lỗi nặng nhất

`Hieu_BT_...md:1496` chỉ có **một dòng** với 5 tiêu đề bị dán liền nhau, không có nội dung:

```
## Cài đặt các công cụ và thư việnXây dựng cơ sở dữ liệu và kết nối dữ liệu với
giao diệnTriển khai các chức năng chính của hệ thốngTriển khai các chức năng hỗ
trợ bởi AIĐánh giá kết quả
```

Trong khi đó code đã có ~13.500 dòng backend + ~16.500 dòng frontend. Đây là chương lẽ ra
phải dày nhất của báo cáo. `KẾT LUẬN VÀ HƯỚNG PHÁT TRIỂN` cũng rỗng.

### A2. Kiến trúc: báo cáo nói "OpenAI API", code là đa nhà cung cấp

| Báo cáo | Source code |
|---|---|
| `:1266` "tích hợp với OpenAI API" | `config/env.ts:79-89` — `LLM_PROVIDER` ∈ {anthropic, openai, gemini}, mặc định `ANTHROPIC_MODEL=claude-sonnet-5`; `EMBEDDING_PROVIDER` mặc định **`local`** (không gọi API ngoài) |
| UC 2.8 `:971` "Cấu hình AI: Chọn mô hình (GPT-3.5/GPT-4)" | Model thực tế: `claude-sonnet-5` / `gpt-4o-mini` / `gemini-2.0-flash`. GPT-3.5/GPT-4 đã lỗi thời |
| `:1266` "REST API kết hợp SSE" | Đúng — `streamChat` dùng SSE. Đây là điểm **khớp** |
| Không đề cập | `services/ai/llm.ts:246+` có **fallback trích xuất** (`composeExtractiveAnswer`) khi không có LLM — một quyết định thiết kế quan trọng chưa được ghi vào báo cáo |
| Không đề cập | `vector.repository.ts` dùng **hybrid search** (cosine + full-text `text_rank`), không phải cosine đơn thuần như UC 6.3 `:1131` mô tả |

### A3. ERD trong báo cáo thiếu 7 bảng và ~30 cột so với `schema.prisma`

Báo cáo mô tả **13 bảng**. `backend/prisma/schema.prisma` có **20 model**.

**Bảng có trong code, KHÔNG có trong báo cáo:**

| Bảng | Vai trò | Hệ quả nếu thiếu trong báo cáo |
|---|---|---|
| `thesis_members` | Quan hệ N-N đề tài ↔ sinh viên | Báo cáo `:1302` vẫn dùng `students.thesis_id` (1-1), sai hoàn toàn mô hình dữ liệu thực tế |
| `academic_years` | Năm học | Xem PHẦN C — bạn muốn bỏ |
| `document_versions` | Phiên bản tài liệu | UC 5.x không có UC nào cho versioning |
| `document_shares` | Chia sẻ tài liệu chỉ đọc | UC 6.3 `:1134` nói "không cross-thesis" nhưng code CÓ cho phép qua bảng này |
| `milestone_history` | Nhật ký thay đổi mốc (append-only) | Không có trong báo cáo |
| `notification_preferences` | Bật/tắt kênh thông báo | Không có |
| `ai_suggestions` | Gợi ý lộ trình (AI-04) | Báo cáo có chức năng AI-04 `:776` nhưng **không có bảng lưu** trong ERD |
| `plagiarism_checks` | Kiểm tra trùng lặp | Có UI (`ai-chat/page.tsx:1109`) nhưng không có UC lẫn bảng trong báo cáo |
| `refresh_tokens` | Phiên đăng nhập | Báo cáo chỉ nói "JWT token" `:879`; thực tế có access + refresh token xoay vòng |

**Cột sai/thiếu trong các bảng đã có:**

| Bảng | Báo cáo | Code | Ghi chú |
|---|---|---|---|
| `users.status` | `ACTIVE`, `SUSPENDED` | thêm `PENDING_VERIFICATION` | UC 1.1 `:882` có luồng "chưa xác minh email" nhưng ERD không có trạng thái đó → tự mâu thuẫn trong chính báo cáo |
| `users` | — | `email_verified_at`, `verification_token_hash`, `verification_expires_at`, `reset_token_hash`, `reset_token_expires_at`, `reset_requested_at`, `failed_login_attempts`, `locked_until`, `last_login_at`, `deleted_at` | **Không có 10 cột này thì UC 1.1 BR-1 (khóa 15 phút), UC 1.4/1.5 (quên/đặt lại mật khẩu) không cài được** |
| `students` | `thesis_id` | `student_code` (unique, nullable) | Cột `thesis_id` không tồn tại |
| `lecturers` | `department`, `max_students` | thêm `lecturer_code` (unique, **NOT NULL**) | Thiếu |
| `theses.status` | 5 giá trị | 6 giá trị — thêm `REVISION_REQUIRED` | UC 3.10 (trả về sửa) khác UC 3.11 (từ chối); ERD báo cáo gộp mất |
| `theses` | `rejection_reason` | thêm `revision_note`, `completed_at`, `submitted_at`, `created_by`, `academic_year_id`, `deleted_at` | |
| `milestones` | 8 cột | thêm `description_revision`, `evidence_filename`, `extension_requested`, `extension_reason`, `extension_new_deadline`, `extension_status`, `order_index`, `approved_by`, `approved_at`, `deleted_at` | UC xin gia hạn / duyệt mốc không có chỗ lưu theo ERD báo cáo |
| `documents` | `tags VARCHAR(255)` phân cách phẩy | `tags text[]` + GIN index | Báo cáo `:1368`. Code cố ý đổi để tránh `LIKE '%AI%'` khớp nhầm |
| `documents` | — | `mime_type`, `page_count`, `summary_note`, `ai_error`, `ai_attempts`, `ai_started_at`, `ai_model`, `uploaded_by`, `deleted_at` | |
| `documents.status_ai` | `PENDING/PROCESSING/DONE/ERROR` | giống | **Khớp** |
| `document_chunks` | `content`, `embedding` | thêm `chunk_index`, `page_number`, `token_count` | UC 6.6 hiển thị "tr. 12" cần `page_number` — ERD báo cáo không có |
| `ai_chat_sessions.thesis_id` | **Not Null** | **Nullable** | Code cho phép chat khi chưa có đề tài; báo cáo cấm |
| `ai_chat_sessions` | — | thêm `deleted_at`, `updated_at` | UC 6.8 xoá mềm |
| `ai_chat_messages.citations` | `TEXT` (chuỗi JSON) | `Json` (JSONB) | |
| `ai_chat_messages` | — | thêm `model_name`, `tokens_used`, `finished_at`, `latency_ms` | Thống kê AI (UC 9.3) không chạy được nếu thiếu |
| `feedbacks` | `target_type` + `target_id` đa hình | `milestone_id` + `document_id` nullable + CHECK | Code chọn giữ toàn vẹn tham chiếu ở tầng CSDL |
| `feedbacks` | — | thêm `depth`, `file_name`, `resolved_at`, `deleted_at`, `edited_at` | Ràng buộc "thread ≤ 3 cấp" (UC 7.3) được cưỡng chế bằng CHECK `depth <= 2` |
| `notifications` | 6 cột | thêm `type` (enum), `link`, `read_at`, `dedupe_key` | UC 8.1 `:1223` yêu cầu "bấm vào nhảy đúng mốc" → cần `link`; job nhắc deadline cần `dedupe_key` |
| `system_logs` | `details TEXT` | `level` (enum), `user_agent`, `details Json` | |
| `system_configs` | 5 cột | thêm `value_type`, `category`, `is_secret`, `updated_by` | |
| **Toàn bộ** | `id INT` | `Int @id @default(autoincrement())` | **Khớp** |

### A4. Lưu trữ tệp: báo cáo nói Cloud, code là đĩa cục bộ

| Báo cáo | Code |
|---|---|
| UC 4.9 NFR `:1064` "File lưu ở Cloud (S3/Cloudinary)" | `lib/storage.ts:33,68` — `path.join(env.storageRoot, area, yyyy, mm, name)`, ghi vào `backend/storage/` |
| UC 5.1 `:1085` "lưu file vào server (MinIO/Local)" | Chỉ có Local. Không có MinIO trong `docker-compose.yml` |
| UC 4.9 `:1063` "Tối đa 10MB/file" | `env.MAX_UPLOAD_MB = 50` — **một hạn mức duy nhất cho cả milestone và document** |
| UC 5.1 `:1088` "Tối đa 50MB" | Khớp |

→ Hai UC trong cùng báo cáo nói hai hạn mức khác nhau; code chỉ có một.

### A5. Số nhóm chức năng tự mâu thuẫn trong báo cáo

- `:756` bảng yêu cầu chức năng: **18 mục / 5 nhóm mã** (QL, DT, TD, TL, AI, PH → thực ra 6 tiền tố)
- `:1256` KẾT LUẬN CHƯƠNG 2: "**sáu nhóm** nghiệp vụ chính"
- `:1258` cùng đoạn: "bao phủ toàn bộ **chín nhóm** chức năng"
- `:849` bảng Use case: **9 nhóm**

→ Ba con số khác nhau trong hai câu liền nhau.

### A6. Bảng yêu cầu chức năng `:756` thiếu ~40% chức năng đã code

Chức năng đã cài đặt nhưng **không có mã CN** trong bảng: quản trị người dùng (`admin/users`),
nhật ký hệ thống (`admin/logs`), cấu hình tham số (`admin/settings`), thống kê hệ thống
(`admin/statistics`), phiên bản tài liệu, chia sẻ tài liệu, kiểm tra trùng lặp,
xin gia hạn mốc, kéo–thả Kanban, biểu đồ Gantt (UC 9.4), xuất CSV/XLSX (UC 9.2),
xuất PDF (UC 9.1), tuỳ chọn kênh thông báo (UC 8.7), tìm nhanh ⌘K, giao diện sáng/tối.

Ngược lại: `AI-02` `:774` ghi tác nhân chỉ "Sinh viên", nhưng UC 6.1 `:1105` ghi
"Sinh viên, Giảng viên hướng dẫn" → lệch nhau.

### A7. UC 6.3 (Tìm kiếm ngữ nghĩa) mô tả sai phạm vi

Báo cáo `:1134`: *"Phạm vi tìm kiếm bị giới hạn trong các tài liệu thuộc đề tài của sinh
viên (không cross-thesis)"*.

Code `domain/access.ts:203-237` (`accessibleDocumentIds`) hợp nhất **tài liệu của đề tài
+ tài liệu được chia sẻ sang** qua `document_shares`. Đây chính là cross-thesis có kiểm soát.
Báo cáo cần sửa lại, và phải mô tả `document_shares`.

### A8. UC 6.3 mô tả thuật toán không đúng thực tế

Báo cáo `:1131` bước 4: *"truy vấn so sánh cosine similarity bằng pgvector"*.

Code `services/ai/rag.ts:104-127` dùng ngưỡng **tương đối** (`bestCosine * 0.45`) kết hợp
tín hiệu **full-text** (`text_rank`), vì ngưỡng cosine tuyệt đối không phân biệt được câu
hỏi liên quan và không liên quan. Đây là một đóng góp kỹ thuật đáng viết vào chương 4 —
hiện đang bị bỏ trắng.

### A9. Số Use case: báo cáo chính chỉ đặc tả 15 UC, tài liệu UC có 87

`REVIEW_LOG.md` xác nhận hệ thống có **87 UC** sau khi rà soát. Báo cáo chính (`:861-1252`)
chỉ đặc tả **15 UC** và không nói rõ đây là "các UC tiêu biểu, đặc tả đầy đủ ở Phụ lục 1".
Câu `:847` có nói "một số Use case tiêu biểu" nhưng `:1258` lại nói "đặc tả chi tiết cho
các Use case bao phủ toàn bộ chín nhóm chức năng" → không nhất quán.

### A10. Chi tiết nhỏ nhưng nên sửa

| Vị trí | Vấn đề |
|---|---|
| `:1001` | "Xem **dánh** sách đề tài hướng dẫn" — lỗi chính tả |
| `:1308` | "Mô tả bảng **lectures**" — phải là `lecturers` |
| `:1346` | "Tên mốc **tiến**." — câu bị cắt |
| `:1423` | "liên kết **đếnmilestone_id**" — thiếu dấu cách |
| Toàn bộ | "Bảng ." / "Hình ." — chưa đánh số (Bảng 1, Bảng 2, …) |
| `:816` | "Bảng 2 mô tả" nhưng bảng không có số |
| `:1094`, `:1097` | Tiêu đề "UC 6.1 Tóm tắt tài liệu" nhưng caption bảng ghi "Đặc tả UC **Yêu cầu tóm tắt lại**" |
| `:1112` | Ghi `\`ERROR\`` — escape markdown bị lộ |
| Tài liệu tham khảo | `[3]` và `[15]` là **cùng một bài** (Sentence-BERT); `[4]` và `[16]` là **cùng một bài** (RAG). Trùng lặp 2 cặp |
| `:845` | Footnote `[3]` trỏ vào Sentence-BERT khi nói về Use case — sai ngữ cảnh trích dẫn |
| `:1474` | Footnote `[4]` (RAG paper) đặt ở mục "Thiết kế giao diện người dùng" — sai ngữ cảnh |

---

## PHẦN B — LỖI TRONG SOURCE CODE (theo phản hồi của bạn)

### B1. Dropdown sơ sài, không ăn khớp giao diện — ĐÚNG

**Nguyên nhân gốc:** `components/ui/index.tsx:332` — `Select` là thẻ `<select>` **native**
của trình duyệt, chỉ được bọc CSS `input-base`.

```tsx
<select ref={ref} id={inputId} className={`input-base ${className}`} {...props}>
```

Hệ quả không thể sửa bằng CSS:
- Popup danh sách do **hệ điều hành** vẽ → không nhận `--bg-surface`, `--shadow-md`,
  `border-radius`, không theo dark mode
- Không có mũi chevron riêng, không icon, không mô tả phụ, không nhóm, không tìm kiếm
- Không dùng được `pop-in` animation như `Dropdown` (`:1020`)

Trong khi đó project **đã có** `Dropdown` / `DropdownItem` / `DropdownLabel` /
`DropdownSeparator` đúng design system — chỉ là `Select` không dùng chúng.

Đang dùng `<Select>` ở **8 trang**: `theses`, `theses/new`, `ai-chat`, `admin/users`,
`feedbacks`, `milestones`, `reports`, `documents`.

### B2. Khóa đăng nhập không hiện đồng hồ chờ, refresh là vào lại được — ĐÚNG một phần

**Backend LÀM ĐÚNG** (`auth.service.ts:272-281`, `341-372`):
- Đếm ở server (`users.failed_login_attempts`), khóa bằng `users.locked_until`
- `MAX_LOGIN_ATTEMPTS = 5`, `LOCKOUT_MINUTES = 15` (`env.ts:103-104`)
- Kiểm tra khóa **trước** khi so mật khẩu → trong 15 phút, gõ đúng cũng không vào được
- Trả `429` kèm số phút còn lại

**Frontend SAI** (`components/auth-sheet.tsx`):

| Dòng | Vấn đề |
|---|---|
| `:111` `const [attempts, setAttempts] = React.useState(0)` | Bộ đếm nằm trong React state → **F5 là mất** |
| `:114` `const locked = attempts >= MAX_ATTEMPTS` | Trạng thái khóa cũng chỉ là state |
| `:136-141` | Chặn cục bộ với câu "thử lại sau 15 phút" — **con số cứng**, không phải thời gian thật |
| `:148-159` | Xử lý `401` và `403`, **không xử lý `429`** → thông điệp có số phút của server rơi vào nhánh `else` chung |
| `:147` `setAttempts((n) => n + 1)` | Đếm cả lỗi mạng và email không tồn tại |

**Về email không tồn tại** (`auth.service.ts:329-339`): `recordFailedLogin` chỉ ghi log rồi
trả 401, không có bộ đếm theo tài khoản (đúng — tài khoản đó không tồn tại). Nhưng
`auth.routes.ts:139` **đã** áp `authLimiter` (`rate-limit.ts:37`): 10 lần hỏng / 15 phút,
đếm theo IP, `skipSuccessfulRequests: true`. Vậy đây **không phải lỗ hổng** — chỉ là hàng
rào nằm ở tầng khác. Cần lưu ý: 429 của `authLimiter` và 429 của khóa tài khoản có **cùng
mã trạng thái nhưng hai ý nghĩa khác nhau**, frontend hiện không phân biệt được.

**Backend chưa trả dữ liệu để vẽ đồng hồ:** `lib/errors.ts:9` — `HttpError` chỉ có
`status`, `code`, `errors`, `context` (context **không gửi ra client**). `middleware/error.ts:46`
trả `{message, code, status, errors?}`. Không có chỗ nào chứa `locked_until` /
`retry_after_seconds` → frontend không thể đếm ngược chính xác. Cần mở rộng hình dạng lỗi.

### B3. Trợ lý AI chưa giống NotebookLM — ĐÚNG

**Cái đã có:**
- `ai-chat/page.tsx:266` `ThesisScopeSelect` — chọn đề tài
- Danh sách phiên hội thoại theo đề tài (`:609-...`), tạo/xoá phiên
- RAG + trích dẫn có số trang, mở tệp gốc, độ tương đồng (`Citations` `:185`)
- Hybrid search, chống prompt injection, streaming SSE

**Cái còn thiếu so với NotebookLM:**

| # | Vấn đề | Vị trí | Chi tiết |
|---|---|---|---|
| 1 | **Chỉ trả lời từ tài liệu, không có kiến thức chung** | `services/ai/rag.ts:209` | System prompt: *"Chỉ trả lời dựa trên nội dung nằm trong thẻ `<tai_lieu>`"*. Hỏi "RAG là gì?" mà tài liệu không có → trả lời "không tìm thấy" dù model biết rõ |
| 2 | **Không chọn được tài liệu nguồn cụ thể** | `rag.ts:59` | `accessibleDocumentIds(user, thesisId)` lấy **toàn bộ** tài liệu của đề tài. Không có tham số `document_ids`. Đây chính xác là lý do "upload chung hết lên các tài liệu chủ đề khác nhau, AI không biết đang hỏi cái nào" |
| 3 | **Bộ chọn đề tài bị ẩn khi chỉ có 1 đề tài, và ẩn hoàn toàn trên mobile** | `:275` `if (theses.length <= 1) return null`; `:609` `hidden lg:flex` | Người dùng không thấy mình đang hỏi trong phạm vi nào |
| 4 | **Không có bảng nguồn (source panel)** | — | NotebookLM luôn hiện danh sách nguồn + checkbox + trạng thái lập chỉ mục. Ở đây phải sang trang `/documents` mới biết tài liệu nào đã index |
| 5 | **Không thấy trạng thái index trong khung chat** | — | `documents.status_ai` có 4 trạng thái nhưng chat không hiển thị. Hỏi khi tài liệu còn `PENDING` → im lặng không có nguồn |
| 6 | **Đề tài = notebook, nên giảng viên/admin gần như không dùng được** | `access.ts:52-72` | Giảng viên chỉ thấy đề tài mình hướng dẫn; **Admin không có `/ai-chat` trong nav** (`layout/index.tsx:92-96`). Một "notebook" cho tài liệu tham khảo chung không tồn tại |
| 7 | **Không có tóm tắt/câu hỏi gợi ý theo nguồn** | `:124` | `SUGGESTED_PROMPTS` là **4 câu cứng**, giống nhau ở mọi đề tài — NotebookLM sinh gợi ý từ chính nguồn |
| 8 | **Không upload trực tiếp trong khung chat** | — | Phải rời trang sang `/documents` |
| 9 | **Không dán URL / văn bản làm nguồn** | — | NotebookLM nhận link, YouTube, text dán vào |
| 10 | **4 tab ngang nhau làm loãng trọng tâm** | `:591-604` | "Hỏi đáp / Tìm kiếm ngữ nghĩa / Kiểm tra trùng lặp / Gợi ý lộ trình". Tìm kiếm ngữ nghĩa thực chất là bước con của hỏi đáp |
| 11 | **`services.ts` khai báo sai kiểu trả về của API AI** | `ai-chat/page.tsx:71` `asList()` | Comment trong code tự thừa nhận: backend trả `{data: [...]}`, `services.ts` khai mảng trần. Đang chữa cháy tại chỗ thay vì sửa tầng dịch vụ |

### B4. Quản trị hệ thống

#### B4.1. Không có trang Tổng quan cho Admin — ĐÚNG

`dashboard/page.tsx:59`:
```tsx
const lecturerView = isLecturer(user) || user?.role === "ADMIN";
```
Admin bị đưa vào **dashboard của giảng viên**, gọi `milestonesApi.lecturerDashboard()`.
Admin không có `lecturer_id` → danh sách rỗng → hiện `EmptyState` *"Chưa hướng dẫn đề tài
nào"* + nút *"Xem đề tài chờ duyệt"*.

Tệ hơn, `PageHeader` `:82-99` bày 2 nút **"Tải tài liệu"** và **"Hỏi trợ lý AI"** cho Admin —
cả hai trang này **không có trong nav của Admin**.

#### B4.2. Không phân quyền trang/nút, vào được bằng URL — ĐÚNG, đây là lỗi bảo mật

**Không có bất kỳ route guard nào ở frontend:**
- Không có `frontend/src/middleware.ts`
- `(dashboard)/layout.tsx:33-42` chỉ chờ `initialized`, **không kiểm tra `user`, không kiểm tra `role`**
- Không có component `RoleGuard` nào

Hệ quả cụ thể:

| Kịch bản | Kết quả hiện tại |
|---|---|
| Sinh viên gõ `/admin/users` | **Trang render đầy đủ** (tiêu đề, bảng, toolbar, nút "Tạo người dùng"). API trả 403 → hiện lỗi. Cấu trúc trang quản trị bị lộ |
| Sinh viên gõ `/admin/settings` | Tương tự — thấy các nhóm cấu hình hệ thống |
| Sinh viên gõ `/admin/statistics` | Tương tự |
| Chưa đăng nhập gõ `/dashboard` | Layout + sidebar nhấp nháy rồi mới bị `api.ts:177` đá về `/?auth=login` |
| Admin gõ `/ai-chat` | Trang chạy được dù không có trong nav |
| Admin gõ `/documents`, `/theses`, `/milestones` | Chạy được |

Thêm một lỗi logic: `layout/index.tsx:168-172`
```tsx
function visibleFor(role: UserRole | undefined, allowed?: UserRole[]) {
  if (!allowed) return true;
  if (!role) return true;   // ← chưa biết vai trò thì HIỆN HẾT
  return allowed.includes(role);
}
```
Trong khoảnh khắc `initialize()` chưa xong, **toàn bộ menu Quản trị hiện ra cho mọi người**.

#### B4.3. Backend RBAC — phần lớn ĐÚNG, cần bổ sung vài chỗ

Backend làm tốt hơn frontend rất nhiều:
- `middleware/auth.ts:117` `requireRole()` — kiểm tra vai trò
- `middleware/auth.ts:51-87` `loadUser()` — đọc lại `status` từ CSDL **mỗi request** để việc
  vô hiệu hoá tài khoản có hiệu lực tức thì (đúng UC 2.4)
- `domain/access.ts` — kiểm soát theo dữ liệu (`visibleThesisIds`, `assertThesisAccess`,
  `accessibleDocumentIds`), là **nguồn sự thật duy nhất** cho tenant isolation
- `adminRouter.use(requireAuth, requireRole("ADMIN"))` — chặn cả nhóm route

Chỗ cần rà thêm:

| Route | Hiện trạng | Đề xuất |
|---|---|---|
| `GET /reports/ai-usage` | `requireRole("ADMIN")` | **Trùng hoàn toàn** `GET /ai/stats` — xem C2 |
| `documents.routes.ts` | 12 route chỉ `requireAuth`, dựa vào `assertDocumentAccess` | Đã đủ ở tầng dữ liệu, nhưng nên thêm `requireRole` cho route ghi để chặn sớm |
| `feedbacks.routes.ts` | 5 route chỉ `requireAuth` | Tương tự |
| `notifications.routes.ts:284` | `requireAuth` | Cần xác nhận route nào là admin-only (gửi thông báo hệ thống) |
| `POST /auth/login` | **Đã có** `authLimiter` (`auth.routes.ts:139`) | Không cần sửa. Chỉ cần phân biệt 429-do-rate-limit với 429-do-khóa-tài-khoản ở frontend |

#### B4.4. Còn mock data / fake data — ĐÚNG

**Nghiêm trọng nhất — `components/layout/index.tsx:587-620`:**

```tsx
const mockNotifications: NotificationItem[] = [
  { id: 1, title: "Nhắc nhở: Milestone sắp đến hạn!", ... created_at: "Hôm nay, 08:30" },
  { id: 2, ... content: "TS. Nguyễn Văn A đã để lại bình luận..." },
  { id: 3, ... },
  { id: 4, ... content: "Hệ thống đã nâng cấp mô hình Vector Search giúp tăng 30% tốc độ RAG." },
];
```

Dòng `:650`: `const latestNotifications = mockNotifications.slice(0, 4);`

→ **Chuông thông báo trên topbar hiện 4 thông báo giả cho MỌI người dùng.** Trong khi
`useUnreadCount()` (`:772`) lại lấy số thật từ API. Kết quả: badge đỏ ghi số thật, danh
sách bên dưới là dữ liệu bịa. Các item cũng **không bấm được** (không `onClick`), và trang
`/notifications` thì dùng dữ liệu thật.

**`backend/prisma/seed.ts` (853 dòng)** — dữ liệu mẫu:
- `:32` `PASSWORD = "Admin@123456"` dùng chung cho mọi tài khoản seed
- `:58` `SAMPLE_DOCUMENTS`
- 7 tài khoản: `admin@novathesis.edu.vn`, `nguyen.vana@`, `tran.thib@`, `student@`,
  `pham.thid@`, `pham.vane@`, `dang.vang@`
- Họ tên giả: "TS. Nguyễn Văn A", "PGS.TS. Trần Thị B", "Lê Văn C", "Phạm Thị D", "Phạm Văn E", "Đặng Văn G"
- 5 đề tài mẫu, milestone mẫu, `:497` `evidence: "frontend_demo_v1.zip"`
- `:720-757` 4 thông báo mẫu
- `:841-844` in bảng tài khoản demo ra console

#### B4.5. Năm học — cần bỏ, nhưng đã ăn sâu vào 6 chỗ

Không phải chỉ xoá 1 bảng. Danh sách phụ thuộc thực tế:

| Vị trí | Dùng năm học để làm gì |
|---|---|
| `schema.prisma:234-246` | Model `AcademicYear` + `theses.academic_year_id` |
| `admin.routes.ts:546-607` | 4 endpoint CRUD + kích hoạt |
| `admin.service.ts:959-1050` | `listAcademicYears`, `create`, `update`, `activate`, `toAcademicYearDTO`, unique index `uniq_academic_year_active` |
| `admin.routes.ts:194,469-471` | Bộ lọc năm học cho **thống kê** |
| `admin.service.ts:618,652,658` | Truy vấn thống kê lọc theo `academic_year_id` |
| `theses.routes.ts:85-101,178,311-339` | Tạo/lọc đề tài theo năm học |
| `theses.service.ts:198-210` | `resolveAcademicYearId()` — gán năm học đang hoạt động |
| **`milestones.service.ts:151-154`** | **Validate deadline mốc phải nằm trong khoảng `academic_year.start_date`–`end_date`** ← chỗ khó nhất |
| `reports.routes.ts:93,204` | Bộ lọc xuất danh sách đề tài |
| `reports.service.ts:244,268,336,521,735,746` | Cột "Năm học" trong CSV/XLSX và dòng "Năm học" trong **PDF báo cáo tiến độ** |
| `admin/settings/page.tsx:310-505` | Toàn bộ tab "Năm học" ở giao diện |
| `serializers.ts:127,146-147` | Trả `academic_year` trong DTO đề tài |
| `REVIEW_LOG.md:29` | UC 2.7 "Quản lý năm học" vừa được **bổ sung** trong lần rà soát trước |

Nhận xét: bạn đúng về mặt định vị sản phẩm — web public cho cộng đồng lớn thì "năm học"
là khái niệm của một trường. Nhưng **nếu bỏ hẳn thì mất luôn hai thứ đang hoạt động**:
(1) validate deadline mốc không vượt ngoài kỳ, (2) cột phân kỳ trong báo cáo/thống kê.
Tôi đề xuất phương án ở PHẦN C.

---

## PHẦN C — TỰ HỎI TỰ TRẢ LỜI: Thống kê AI ở `statistics` vs ở `reports` khác gì nhau?

### C1. Câu trả lời: KHÁC NHAU — khác cả phạm vi lẫn độ sâu

| | `/reports` (trang Báo cáo) | `/admin/statistics` (trang Thống kê) |
|---|---|---|
| **Endpoint** | `GET /reports/overview` → `buildOverview(user)` | `GET /admin/statistics` + `GET /ai/stats` |
| **Ai xem được** | Sinh viên, Giảng viên, **Admin** | **Chỉ Admin** |
| **Phạm vi dữ liệu** | **Lọc theo vai trò** qua `thesisScopeFilter(user)`:<br>• SV → đề tài của mình<br>• GV → đề tài mình hướng dẫn<br>• Admin → toàn hệ thống | **Luôn toàn hệ thống** |
| **Nội dung AI** | 1 thẻ tổng `ai_queries` + phân bổ theo 5 tính năng (`ai_by_feature`: chat / search / summarize / suggest / plagiarism) kèm `share` % | Xu hướng **theo tuần**, **Top tài liệu được trích dẫn**, tỷ lệ **LIKE/DISLIKE**, thống kê **theo model**, tình trạng **hệ thống (health)** |
| **Mục đích** | "Tôi/nhóm tôi đã dùng AI bao nhiêu" | "Hệ thống AI đang chạy thế nào, tốn kém ra sao, chất lượng ra sao" |
| **Đơn vị `share`** | **0–100** (phần trăm) | **0–1** (tỷ lệ) — `reports.service.ts:161-163` ghi rõ cảnh báo này |

**Kết luận:** hai chỗ **không trùng chức năng**. Cái ở `/reports` là *"lượt dùng AI trong
phạm vi của tôi"*, cái ở `/admin/statistics` là *"vận hành hệ thống AI"*. Vì thế **không nên
xoá khỏi trang Báo cáo** — sinh viên và giảng viên cần nó, và đúng như bạn nói, họ chỉ có
đường vào qua `/reports`.

**Nhưng tên gọi thì đúng là gây nhầm** — theo chính nguyên tắc bạn đặt ra, cần đổi tên:

| Vị trí | Tên hiện tại | Đề xuất |
|---|---|---|
| `reports/page.tsx:263` | "Thống kê Tần suất Sử dụng AI & Vector Search" | **"Lượt sử dụng AI của bạn"** / "…của nhóm bạn hướng dẫn" / "…toàn hệ thống" — đổi theo vai trò, giống `scopeLabel` `:109` đã làm |
| `admin/statistics/page.tsx:127` | "Thống kê" | **"Vận hành hệ thống AI"** hoặc "Giám sát hệ thống" |
| `reports/page.tsx:271` | link "Xem thống kê AI chi tiết" | **"Mở bảng giám sát AI"** |

### C2. Cái THỰC SỰ trùng lặp: endpoint `GET /reports/ai-usage`

`reports.routes.ts:257-264`:
```ts
reportsRouter.get("/ai-usage", requireRole("ADMIN"), asyncHandler(async (_req, res) => {
  const stats = await collectAiStats();
  res.json({ ...stats, generated_at: new Date().toISOString() });
}));
```

- Gọi **đúng cùng một hàm** `collectAiStats()` như `GET /ai/stats` (`ai.routes.ts:891-892`)
- **Cùng yêu cầu quyền ADMIN**
- Khác biệt duy nhất: thêm trường `generated_at`
- `services.ts:773` có khai báo `aiUsage()` nhưng **không trang nào gọi**

→ Đây là endpoint **chết và trùng lặp thật sự**. Nên xoá `GET /reports/ai-usage` +
`services.ts:773`, và chuyển `generated_at` vào `GET /ai/stats` nếu cần.

---

## PHẦN D — ĐỀ XUẤT CHỈNH SỬA (ưu tiên theo mức độ)

### Ưu tiên 1 — Bảo mật & tính đúng đắn

| # | Việc | Chi tiết |
|---|---|---|
| D1 | **Thêm route guard ở frontend** | Tạo `lib/guards.tsx` với `<RequireAuth>` và `<RequireRole roles={[...]}>`, dùng `router.replace()` khi không đủ quyền. Áp vào `(dashboard)/layout.tsx` (yêu cầu đăng nhập) và từng nhóm route: `/admin/*` → ADMIN; `/theses`, `/milestones`, `/documents`, `/ai-chat`, `/feedbacks` → STUDENT + LECTURER (+ ADMIN nếu quyết định cho xem) |
| D2 | **Sửa `visibleFor()`** | `if (!role) return false` — chưa biết vai trò thì **ẩn**, đừng hiện |
| D3 | **Phân biệt hai loại 429** | `authLimiter` (IP) và khóa tài khoản dùng cùng mã 429. Đặt `code` khác nhau: `TOO_MANY_REQUESTS` vs `ACCOUNT_LOCKED` |
| D4 | **Trả `locked_until` trong lỗi 429** | Mở rộng `HttpError` + `errorHandler` để gửi `retry_after_seconds` / `locked_until` ra client, frontend mới đếm ngược thật được |
| D5 | **Xoá `mockNotifications`** | Nối `NotificationDropdown` vào `notificationsApi.list({per_page: 5})` thật, mỗi item bấm được và điều hướng theo `notification.link`, đánh dấu đã đọc |
| D6 | **Xoá dữ liệu seed mẫu** | Giữ `seed.ts` **chỉ tạo 1 tài khoản Admin** từ biến môi trường (`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, bắt buộc phải đặt, không có giá trị mặc định). Bỏ `SAMPLE_DOCUMENTS`, 5 đề tài mẫu, 4 thông báo mẫu, và phần in bảng tài khoản ra console |

### Ưu tiên 2 — Trợ lý AI theo mô hình NotebookLM

Đây là phần cần bạn quyết định hướng — tôi trình bày ở phần câu hỏi bên dưới.

Khung đề xuất chung:

```
┌─ Chọn Không gian (đề tài) ──────────────────────────────┐
│ [▼ Đề tài của tôi: Hệ thống NovaThesis…]                │
├──────────────┬──────────────────────┬───────────────────┤
│ NGUỒN        │ HỘI THOẠI            │ KHUNG CHAT        │
│ ☑ tailieu1   │ • Hỏi về kiến trúc   │  (streaming +     │
│ ☑ tailieu2   │ • So sánh HNSW…      │   trích dẫn)      │
│ ☐ tailieu3   │ + Hội thoại mới      │                   │
│ ⏳ đang index │                      │  [Nguồn: 2 tài    │
│ + Tải lên    │                      │   liệu đã chọn]   │
│ + Dán URL    │                      │  ○ Chỉ tài liệu   │
│              │                      │  ● Tài liệu + AI  │
└──────────────┴──────────────────────┴───────────────────┘
```

Việc cần làm:
1. `retrieve()` nhận thêm `documentIds?: number[]` — giao nhau với `accessibleDocumentIds()`
   (**không thay thế**, để không phá tenant isolation)
2. `AIChatSession` thêm bảng `ai_chat_session_sources` (session_id, document_id) để phạm vi
   nguồn dính theo phiên
3. System prompt 2 chế độ: `strict` (chỉ tài liệu — như hiện tại) và `hybrid`
   (ưu tiên tài liệu + trích dẫn; được dùng kiến thức chung nhưng **phải ghi rõ**
   *"Phần này không có trong tài liệu của bạn"*)
4. Panel nguồn luôn hiện (cả mobile), có `status_ai` từng tài liệu
5. Upload trực tiếp trong khung chat
6. Bỏ `SUGGESTED_PROMPTS` cứng → sinh gợi ý từ `documents.summary_ai` của các nguồn đã chọn
7. Gộp tab "Tìm kiếm ngữ nghĩa" thành một chế độ trong khung chat; giữ "Kiểm tra trùng lặp"
   và "Gợi ý lộ trình" là công cụ riêng
8. Sửa kiểu trả về trong `services.ts` để bỏ được hàm chữa cháy `asList()`

### Ưu tiên 3 — Quản trị

| # | Việc |
|---|---|
| D7 | **Tạo `AdminDashboard` riêng** trong `dashboard/page.tsx`: KPI toàn hệ thống (người dùng theo vai trò, đề tài theo trạng thái, tài liệu, dung lượng, lượt AI), việc cần xử lý (tài khoản chờ xác minh, đề tài chờ duyệt quá N ngày), log lỗi gần nhất, tình trạng hệ thống. Bỏ `lecturerView = … \|\| ADMIN` |
| D8 | **Sửa `PageHeader` của dashboard theo vai trò** — Admin không thấy nút "Tải tài liệu"/"Hỏi trợ lý AI" |
| D9 | **Đổi tên hai chỗ thống kê AI** theo bảng C1; **giữ** panel ở `/reports` |
| D10 | **Xoá `GET /reports/ai-usage`** và `services.ts:773` |
| D11 | **Rà soát decorator còn thiếu** — thêm `requireRole` cho các route ghi ở `documents`, `feedbacks`, `notifications`; viết test khẳng định "STUDENT gọi route ADMIN → 403" cho **từng** route |

### Ưu tiên 4 — Thay "Năm học" bằng khái niệm phổ quát

Bỏ hẳn sẽ mất validate deadline + phân kỳ báo cáo. Ba phương án — xem câu hỏi bên dưới.

### Ưu tiên 5 — Thiết kế lại `Select`

Viết lại `Select` dựa trên `Dropdown` đã có: nút trigger dùng `input-base` + chevron
`CaretDown`, popup dùng `card p-1 pop-in` + `--shadow-md`, item dùng `menu-item`, hỗ trợ
`searchable` khi > 8 lựa chọn, `description` phụ mỗi item, `group`. **Giữ nguyên API**
(`label`, `error`, `helperText`, `options`, `value`, `onChange`) để 8 trang đang dùng không
phải sửa. Có `<select>` ẩn kèm theo để form/accessibility không hỏng.

### Ưu tiên 6 — Viết lại Báo cáo

| # | Việc |
|---|---|
| D12 | **Viết Chương 4** (đang rỗng): cài đặt công cụ, migration Prisma + pgvector/HNSW, triển khai chức năng chính, triển khai AI (pipeline extract → chunk → embed → index → hybrid retrieve → RAG stream), đánh giá kết quả |
| D13 | **Vẽ lại ERD** theo `schema.prisma` (20 bảng), bổ sung mô tả 7 bảng thiếu + ~30 cột |
| D14 | **Sửa bảng yêu cầu chức năng** `:756` — bổ sung nhóm QT (quản trị) và các chức năng ở A6 |
| D15 | **Sửa các mâu thuẫn nội tại**: số nhóm chức năng (A5), phạm vi tìm kiếm (A7), thuật toán retrieval (A8), số UC (A9), hạn mức file (A4), nhà cung cấp AI (A2) |
| D16 | **Sửa lỗi trình bày** (A10): đánh số Bảng/Hình, lỗi chính tả, gộp 2 cặp tài liệu tham khảo trùng, sửa footnote sai ngữ cảnh |
| D17 | **Bổ sung mục "Bảo mật"** vào chương 3: tenant isolation qua `domain/access.ts`, chống prompt injection, băm token, refresh token xoay vòng, audit log |

---

## Bảng tổng hợp

| Nhóm | Số vấn đề | Mức độ |
|---|---|---|
| Báo cáo ↔ code không đồng nhất | 10 nhóm (A1–A10) | Cao (A1, A3 rất cao) |
| Bảo mật phân quyền frontend | 6 kịch bản vào được bằng URL | **Rất cao** |
| Mock/fake data còn sót | 2 nơi (topbar + seed) | Cao |
| Trợ lý AI so với NotebookLM | 11 điểm thiếu | Cao |
| Dropdown/Select | 1 nguyên nhân gốc, 8 trang bị ảnh hưởng | Trung bình |
| Khóa đăng nhập | 5 lỗi frontend + 2 lỗi backend | Cao |
| Trùng lặp thống kê AI | 1 endpoint chết | Thấp |
| Năm học | 13 điểm phụ thuộc | Cần quyết định |

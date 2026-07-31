# SPEC v2 — Hoàn thiện NovaThesis

> Ngày: 31/07/2026
> Đầu vào: `REVIEW_v2_DongBo_BaoCao_SourceCode.md`
> Trạng thái: đã chốt 6 quyết định thiết kế

---

## 0. Quyết định đã chốt

| # | Quyết định | Lý do |
|---|---|---|
| Q1 | **Đề tài = notebook.** Thêm `ai_chat_session_sources` để chọn nguồn theo từng phiên | Ít thay đổi CSDL nhất, đúng nghiệp vụ luận văn |
| Q2 | **Hai chế độ trả lời**, người dùng chọn, mặc định `HYBRID` | Giữ được cam kết "không bịa" của UC 6.5 khi cần, đồng thời tận dụng được model |
| Q3 | **"Năm học" → "Kỳ nghiên cứu"** đặt trên chính đề tài (`start_date`/`end_date`), drop `academic_years` | Web public không nên gắn với lịch của một trường; vẫn giữ validate deadline và cột phân kỳ |
| Q4 | **Admin xem được trang nghiệp vụ ở chế độ chỉ đọc**, và có trong nav | Nav khớp với quyền thật, admin hỗ trợ được người dùng |
| Q5 | **Thứ tự:** Phân quyền + dọn mock → AI → Quản trị → Kỳ nghiên cứu → Select → Báo cáo | Rủi ro cao/ít phụ thuộc làm trước; báo cáo viết cuối để mô tả đúng code cuối |
| Q6 | **CSDL đã có dữ liệu thật** → migration phải backfill, không reset | Không được làm mất dữ liệu |

---

## 1. GIAI ĐOẠN 1 — Phân quyền & dọn mock data

### 1.1 `frontend/src/lib/permissions.ts` (mới)

Token nằm trong `localStorage` nên Next middleware không đọc được. Guard phải ở client.
Tệp này là **nguồn sự thật duy nhất** cho câu hỏi "vai trò này có được ghi vào loại dữ liệu
này không" ở phía frontend, đối xứng với `backend/src/domain/access.ts`.

```ts
export type Resource = "thesis" | "milestone" | "document" | "feedback" | "ai";

/** Admin CHỦ ĐỘNG bị chặn ghi ở giao diện — xem ghi chú bất đối xứng bên dưới. */
export function canWrite(user: User | null, resource: Resource): boolean
export function isReadOnlyViewer(user: User | null): boolean   // true khi role === ADMIN
```

**Ghi chú bất đối xứng phải viết vào comment của tệp:** backend `domain/access.ts:120`
(`can()`) vẫn trả `true` cho Admin ở mọi capability, để Admin còn xử lý được sự vụ qua API
khi cần. Frontend cố ý chặt hơn backend. Ai đó thấy "UI ẩn nút mà API vẫn cho" thì đó là
thiết kế, không phải lỗi — đừng "sửa" backend theo UI.

### 1.2 `frontend/src/lib/guards.tsx` (mới)

```tsx
<RequireAuth>            // !initialized → Spinner; initialized && !user → router.replace("/?auth=login")
<RequireRole roles={[]}> // không đủ vai trò → router.replace("/dashboard") + toast.error
```

Không render `children` trong lúc chờ điều hướng — nếu render, cấu trúc trang quản trị vẫn
lộ ra trong một khung hình, đúng thứ đang cần bịt.

### 1.3 Áp guard

| Tệp | Thay đổi |
|---|---|
| `(dashboard)/layout.tsx` | Bọc toàn bộ trong `<RequireAuth>`. Hiện tại `:33-42` chỉ chờ `initialized` |
| `(dashboard)/admin/layout.tsx` | **Mới** — `<RequireRole roles={["ADMIN"]}>`. Nested layout của Next phủ cả 4 trang con, không phải sửa từng trang |
| `(dashboard)/theses/new/page.tsx` | Bọc `<RequireRole roles={["STUDENT"]}>` — chỉ sinh viên đề xuất đề tài (UC 3.1) |

### 1.4 `components/layout/index.tsx`

| Dòng | Thay đổi |
|---|---|
| `:168-172` | `if (!role) return false` — chưa biết vai trò thì **ẩn**. Hiện tại `return true` làm menu Quản trị hiện cho mọi người trong lúc `initialize()` chưa xong |
| `:63-142` `navSections` | Thêm nhóm **"Giám sát"** `roles: ["ADMIN"]` trỏ tới `/theses`, `/milestones`, `/documents`, `/ai-chat`; mỗi item có `readOnly: true` để render badge "Chỉ đọc" |
| `:145-160` `ROUTE_TITLES` | Không đổi |
| `:587-620` | **Xoá `mockNotifications`** (34 dòng) |
| `:629-756` `NotificationDropdown` | Nối vào `notificationsApi.list({ per_page: 5 })`. Mỗi item: `onClick` → `markRead(id)` rồi `router.push(n.link ?? "/notifications")`. Thêm trạng thái loading (`Skeleton`) và trạng thái lỗi. Giữ `useUnreadCount()` nguyên |

### 1.5 Ẩn nút ghi cho Admin

| Tệp | Việc |
|---|---|
| `theses/page.tsx`, `theses/[id]/page.tsx` | Ẩn "Tạo đề tài", "Sửa", "Xoá", "Duyệt/Từ chối" khi `isReadOnlyViewer(user)` |
| `milestones/page.tsx` | Ẩn "Thêm mốc", chặn kéo–thả Kanban, ẩn "Duyệt mốc" |
| `documents/page.tsx` | Ẩn "Tải lên", "Xoá", "Tóm tắt lại". **Chú ý** `:251`, `:266` hiện dùng `isAdmin(user)` để **cấp thêm** quyền — phải đảo lại |
| `feedbacks/page.tsx` | Ẩn ô nhập phản hồi. **Chú ý** `:200`, `:207` cũng dùng `isAdmin(user)` để cấp quyền xoá/giải quyết |

### 1.6 Backend — bổ sung decorator + test

| Tệp | Việc |
|---|---|
| `documents.routes.ts` | 12 route hiện chỉ `requireAuth`. Thêm `requireRole("STUDENT","LECTURER","ADMIN")` cho route ghi để chặn sớm ở tầng vai trò, trước khi tốn truy vấn của `assertDocumentAccess` |
| `feedbacks.routes.ts` | Tương tự cho 5 route |
| `notifications.routes.ts:284` | Xác định route gửi thông báo hệ thống → `requireRole("ADMIN")` |
| `backend/tests/rbac.spec.ts` | **Mới** — bảng tham số hoá: với **từng** route admin-only, gọi bằng token STUDENT và LECTURER, khẳng định `403`. Đây là loại test duy nhất phát hiện được "quên decorator" khi thêm route mới |

### 1.7 `backend/prisma/seed.ts` — rút gọn

| Xoá | Dòng |
|---|---|
| `SAMPLE_DOCUMENTS` | `:58` |
| 6 tài khoản mẫu (giữ Admin) | `:327-372` |
| 5 đề tài mẫu + milestone + minh chứng `frontend_demo_v1.zip` | `:383-533` |
| 4 thông báo mẫu | `:720-757` |
| In bảng tài khoản demo ra console | `:841-844` |

`PASSWORD` (`:32`) bỏ mặc định `"Admin@123456"`. Đọc `SEED_ADMIN_EMAIL` + `SEED_ADMIN_PASSWORD`,
thiếu thì **thoát với lỗi** — mật khẩu admin mặc định trong repo public là cách chắc chắn để
có người quên đổi.

Giữ lại: seed `system_configs` mặc định và `notification_preferences` (cấu hình, không phải
dữ liệu mẫu).

Dữ liệu mẫu **không xoá đi mất**: chuyển sang script riêng `npm run seed:demo`, **không**
chạy mặc định, đầu script in cảnh báo và thoát nếu `NODE_ENV === "production"`. Giữ được
môi trường thử nghiệm mà `npm run seed` trên máy thật không bao giờ tạo dữ liệu giả.

### 1.8 Khóa đăng nhập có đồng hồ thật

**Backend**

| Tệp | Thay đổi |
|---|---|
| `lib/errors.ts:9` | `HttpError` thêm `readonly public?: Record<string, unknown>` — khác `context` vốn **không** gửi ra client |
| `middleware/error.ts:46` | Merge `err.public` vào body phản hồi |
| `auth.service.ts:272-281` | Ném `new HttpError(429, msg, { code: "ACCOUNT_LOCKED", public: { locked_until, retry_after_seconds } })` |
| `auth.service.ts:360-372` | Cùng cách, cho nhánh vừa bị khóa |
| `middleware/rate-limit.ts:23` | Giữ `code: "TOO_MANY_REQUESTS"` — để frontend phân biệt được hai loại 429 |

**Frontend `components/auth-sheet.tsx`**

| Xoá | Thay bằng |
|---|---|
| `:111` `attempts` state | `lockedUntil: number \| null` đọc từ `localStorage["nova.lock." + email]` khi email đổi → **F5 không mất** |
| `:114` `locked` | `locked = lockedUntil !== null && lockedUntil > now` |
| `:136-141` chặn cục bộ với "15 phút" cứng | Bỏ hẳn. Chỉ server biết còn bao lâu |
| `:147` `setAttempts(n+1)` | Bỏ |
| `:148-159` | Thêm nhánh `err.status === 429`: nếu `code === "ACCOUNT_LOCKED"` → lưu `locked_until`, hiện đồng hồ; nếu `TOO_MANY_REQUESTS` → "Quá nhiều yêu cầu từ thiết bị này, thử lại sau ít phút" |
| `:336-341` "Còn N lần thử" | `<LockCountdown until={lockedUntil} onExpire={…} />` — `setInterval` 1s, hiện `mm:ss`, hết giờ tự mở nút và xoá `localStorage` |

Nút submit `disabled={locked}`. Xoá hằng `MAX_ATTEMPTS` (`:28`) — số lần thử là việc của server.

### Kiểm chứng giai đoạn 1

1. Đăng nhập STUDENT → gõ `/admin/users` → bị đẩy về `/dashboard` + toast, **không thấy** khung trang quản trị
2. Xoá token → gõ `/dashboard` → về `/?auth=login`, không nhấp nháy sidebar
3. Đăng nhập ADMIN → thấy nhóm "Giám sát", mở `/theses` thấy dữ liệu, **không** thấy nút ghi nào
4. Sai mật khẩu 5 lần → thấy đồng hồ `14:59` đếm xuống → **F5** → đồng hồ vẫn còn đúng số giây
5. Chuông thông báo hiện đúng thông báo thật, bấm vào nhảy đúng trang và giảm badge
6. `npm run seed` với DB rỗng và không có biến môi trường → thoát với lỗi rõ ràng
7. `npm test -- rbac` xanh

---

## 2. GIAI ĐOẠN 2 — Trợ lý AI kiểu NotebookLM

### 2.1 Migration

```prisma
enum AnswerMode { STRICT  HYBRID }

model AIChatSessionSource {
  session_id  Int
  document_id Int
  session  AIChatSession @relation(...)
  document Document      @relation(...)
  @@id([session_id, document_id])
  @@index([document_id])
  @@map("ai_chat_session_sources")
}

// AIChatSession thêm:
answer_mode AnswerMode @default(HYBRID)
sources     AIChatSessionSource[]

// AIChatMessage thêm:
used_general_knowledge Boolean @default(false)
```

Phiên đã có từ trước: `sources` rỗng = "toàn bộ tài liệu của đề tài" (giữ nguyên hành vi cũ),
không cần backfill.

### 2.2 `services/ai/rag.ts`

```ts
export async function retrieve(params: {
  user; query; thesisId?; topK?; minScore?;
  documentIds?: number[];   // MỚI
})
```

Cài đặt bắt buộc theo thứ tự này:

```ts
const allowed = await accessibleDocumentIds(params.user, params.thesisId ?? null);
const scope = params.documentIds
  ? (allowed === null ? params.documentIds : allowed.filter(id => params.documentIds!.includes(id)))
  : allowed;
```

**Giao, không thay thế.** Nhận thẳng `documentIds` từ client là mở đúng lỗ rò tenant
isolation mà `domain/access.ts:8-11` đã cảnh báo.

Thêm `RetrievalResult.scoped_out: number` — số tài liệu bị loại vì người dùng bỏ tick, để
UI nói được "3/5 nguồn đang dùng".

### 2.3 Hai system prompt

`SYSTEM_PROMPT_STRICT` = prompt hiện tại (`:206-213`), không đổi.

`SYSTEM_PROMPT_HYBRID` — khác ở quy tắc 1:

> 1. Ưu tiên tuyệt đối nội dung trong `<tai_lieu>`; mọi câu dựa trên tài liệu phải có
>    trích dẫn `[n]`.
> 2. Nếu tài liệu không đủ, bạn ĐƯỢC dùng kiến thức chung, nhưng phải đặt toàn bộ phần đó
>    vào một khối riêng ở cuối, mở đầu **đúng nguyên văn** bằng dòng:
>    `⚠ Ngoài tài liệu của bạn:`
> 3. Tuyệt đối không gán trích dẫn `[n]` cho nội dung không nằm trong tài liệu.

Backend phát hiện chuỗi `⚠ Ngoài tài liệu của bạn:` trong câu trả lời → set
`used_general_knowledge = true`. Frontend tách khối đó ra và tô bằng `--warning-bg` để người
đọc không nhầm là nội dung có nguồn.

`streamAnswer()` nhận `mode: AnswerMode`.

### 2.4 Endpoint

| Method | Path | Việc |
|---|---|---|
| `POST` | `/ai/chat` | Thêm body `answer_mode?`, `document_ids?`. Khi tạo phiên mới thì ghi cả hai vào phiên |
| `PATCH` | `/ai/sessions/:id/sources` | Đặt lại danh sách nguồn của phiên. Xác thực từng id qua `accessibleDocumentIds` |
| `PATCH` | `/ai/sessions/:id` | Đổi `answer_mode` |
| `GET` | `/ai/sessions/:id/sources` | Danh sách nguồn kèm `status_ai`, `page_count`, `summary_ai` |
| `GET` | `/ai/suggested-prompts` | `?thesis_id=&document_ids=` → 4 câu hỏi sinh từ `documents.summary_ai` của các nguồn đã chọn. Cache theo tập nguồn để không gọi LLM mỗi lần mở trang |

Tất cả áp `aiLimiter`.

### 2.5 `frontend/src/lib/services.ts` — sửa kiểu trả về

`ai-chat/page.tsx:71` có hàm `asList()` và comment tự thừa nhận đang chữa cháy: backend trả
`{data: [...]}` còn `services.ts` khai mảng trần.

Sửa `services.ts`: `sessions()`, `messages()`, `suggestions()`, `acceptSuggestion()` trả
`{ data: T[] }` đúng như backend. `ChatStreamHandlers.onDone` khai đủ `message`, `incomplete`
(hiện `ai-chat/page.tsx:83` phải tự khai lại `ChatDonePayload`). Rồi **xoá `asList()` và
`ChatDonePayload`**.

### 2.6 `ai-chat/page.tsx` — cấu trúc lại

```
[▼ Đề tài: Hệ thống NovaThesis…]                    ○ Chỉ tài liệu  ● Tài liệu + AI
┌───────────────┬────────────────────┬──────────────────────────────┐
│ NGUỒN (3/5)   │ HỘI THOẠI          │ Bạn: RAG là gì?              │
│ ☑ tailieu1 ✓  │ • Hỏi về kiến trúc │ AI: …[1][2]                  │
│ ☑ tailieu2 ✓  │ • So sánh HNSW…    │ ⚠ Ngoài tài liệu của bạn: …  │
│ ☐ tailieu3 ⏳  │ + Hội thoại mới    │ Nguồn trích dẫn: [1] [2]     │
│ + Tải lên     │                    │                              │
└───────────────┴────────────────────┴──────────────────────────────┘
```

| Thành phần | Thay đổi |
|---|---|
| `ThesisScopeSelect` `:266` | **Bỏ `if (theses.length <= 1) return null`** — luôn hiện để người dùng biết mình đang hỏi trong phạm vi nào. Hiện cả trên mobile |
| Layout `:607` | `grid-cols-[14rem_13rem_1fr]` trên `lg`; dưới `lg` thành 3 tab con (Nguồn / Hội thoại / Chat). Bỏ `hidden lg:flex` của cột phiên `:609` |
| `SourcePanel` (mới) | Checkbox từng tài liệu, chip trạng thái theo `status_ai` (`PENDING` ⏳ / `PROCESSING` ⏳ / `DONE` ✓ / `ERROR` ⚠ + tooltip `ai_error`), "Chọn tất cả", nút "Tải lên" mở dialog upload ngay tại chỗ (dùng lại `documentsApi.upload`), tooltip `summary_ai` khi hover |
| `AnswerModeToggle` (mới) | `SegmentedControl` (`ui/index.tsx:1189`) hai lựa chọn. Đổi chế độ giữa phiên → lưu qua `PATCH /ai/sessions/:id` |
| `MessageBody` `:161` | Tách khối `⚠ Ngoài tài liệu của bạn:` ra, render riêng với `--warning-bg` + `--warning-border` |
| `SUGGESTED_PROMPTS` `:124` | Xoá 4 câu cứng. Gọi `GET /ai/suggested-prompts`, có fallback khi chưa có nguồn nào |
| `Tabs` `:591-604` | Còn 3 tab: **Hỏi đáp** / Kiểm tra trùng lặp / Gợi ý lộ trình. "Tìm kiếm ngữ nghĩa" thành nút chuyển chế độ trong khung chat (nó vốn là bước 2 của UC 6.5) |
| `SemanticSearch` `:963` | Giữ nguyên component, gắn vào chế độ mới thay vì tab riêng |
| `changeThesis` `:399` | Giữ nguyên logic đóng phiên. Thêm: reset danh sách nguồn đã chọn |

### Kiểm chứng giai đoạn 2

1. Upload 3 tài liệu **khác chủ đề** vào một đề tài → chỉ tick 1 → hỏi câu thuộc tài liệu
   **không** được tick → AI **không** trích dẫn tài liệu đó
2. Chế độ `STRICT`, hỏi câu không có trong tài liệu → trả lời "không tìm thấy"
3. Chế độ `HYBRID`, cùng câu đó → có phần `⚠ Ngoài tài liệu của bạn:` tô màu cảnh báo,
   **không** có `[n]` gán cho phần đó
4. Sinh viên A thử gửi `document_ids` chứa id tài liệu của sinh viên B → id đó bị lọc bỏ,
   không xuất hiện trong trích dẫn
5. Tài liệu `status_ai = PENDING` hiện ⏳ và không cho tick (hoặc tick được nhưng cảnh báo)
6. Đổi đề tài → phiên đóng, danh sách nguồn nạp lại đúng
7. Mobile: thấy đủ bộ chọn đề tài, nguồn, hội thoại
8. `asList()` và `ChatDonePayload` đã bị xoá, `tsc` xanh

---

## 3. GIAI ĐOẠN 3 — Quản trị

### 3.1 `GET /admin/overview` (mới, `admin.routes.ts` + `admin.service.ts`)

```ts
{
  users:     { total, by_role: {ADMIN, LECTURER, STUDENT}, pending_verification, suspended },
  theses:    { total, by_status: [...] },
  documents: { total, indexed, failed, total_bytes },
  ai:        { messages_7d, cost_signal: { tokens_7d } },
  actions_required: {
    pending_verification: n,
    theses_pending_over_7d: n,     // đề tài chờ duyệt quá 7 ngày
    documents_ai_error: n,
    milestones_overdue: n,
  },
  recent_errors: [ { created_at, action, message } ],  // system_logs WHERE level = 'ERROR' LIMIT 5
  health: { db, storage, llm_provider, embedding_provider },
}
```

`actions_required` là phần quan trọng nhất — một trang tổng quan chỉ có số liệu tĩnh thì
Admin đọc xong vẫn không biết phải làm gì. Mỗi mục là một liên kết dẫn tới danh sách đã lọc.

### 3.2 `dashboard/page.tsx`

| Dòng | Thay đổi |
|---|---|
| `:59` | Bỏ `\|\| user?.role === "ADMIN"`. Thành 3 nhánh: `AdminDashboard` / `LecturerDashboard` / `StudentDashboard` |
| `:82-99` `PageHeader.actions` | Theo vai trò. Admin: "Quản lý người dùng" + "Bảng giám sát AI". SV/GV: giữ nguyên |
| mới | `dashboard/admin-dashboard.tsx` — tách file riêng, `dashboard/page.tsx` đã 485 dòng |

### 3.3 Đổi tên hai chỗ thống kê AI

Xem `REVIEW_v2 §C1` cho lý do đầy đủ: hai chỗ **khác nhau thật** (phạm vi theo vai trò vs
toàn hệ thống; 5 tính năng vs xu hướng/top trích dẫn/rating/model/health), nên **giữ cả hai**,
chỉ đổi tên.

| Tệp:dòng | Cũ | Mới |
|---|---|---|
| `reports/page.tsx:263` | "Thống kê Tần suất Sử dụng AI & Vector Search" | "Lượt sử dụng AI của bạn" / "…của nhóm bạn hướng dẫn" / "…toàn hệ thống" — theo `scopeLabel` `:109` |
| `reports/page.tsx:271` | "Xem thống kê AI chi tiết" | "Mở bảng giám sát AI" |
| `admin/statistics/page.tsx:127` | "Thống kê" | "Vận hành hệ thống AI" |
| `layout/index.tsx:129` nav | "Thống kê" | "Giám sát AI" |
| `layout/index.tsx:158` | "Thống kê" | "Vận hành hệ thống AI" |

### 3.4 Xoá endpoint trùng lặp

- `reports/reports.routes.ts:257-264` — xoá `GET /reports/ai-usage`. Gọi đúng cùng
  `collectAiStats()` như `GET /ai/stats`, cùng quyền ADMIN, chỉ thêm `generated_at`, và
  **không trang nào gọi**
- `lib/services.ts:773` — xoá `aiUsage()`
- Chuyển `generated_at` vào `GET /ai/stats` (`ai.routes.ts:891`) để không mất thông tin
  "số liệu tính lúc nào"
- Bỏ `import { collectAiStats }` khỏi `reports.routes.ts:24` nếu không còn dùng

### Kiểm chứng giai đoạn 3

1. Đăng nhập Admin → `/dashboard` hiện KPI toàn hệ thống, **không** hiện "Chưa hướng dẫn đề tài nào"
2. Mỗi mục trong "Việc cần xử lý" bấm được và dẫn tới danh sách đã lọc đúng
3. Không còn nút "Tải tài liệu"/"Hỏi trợ lý AI" trên header dashboard của Admin
4. `GET /reports/ai-usage` trả 404
5. `grep -rn "aiUsage" frontend/src` không còn kết quả

---

## 4. GIAI ĐOẠN 4 — "Kỳ nghiên cứu" thay "Năm học"

**CSDL đã có dữ liệu thật → migration phải backfill, tuyệt đối không `migrate reset`.**

### 4.1 Migration nhiều bước (không gộp làm một)

```
1. add_thesis_period          ALTER TABLE theses ADD start_date DATE, ADD end_date DATE;
2. backfill_thesis_period     UPDATE theses t SET start_date = a.start_date,
                                 end_date = a.end_date
                              FROM academic_years a WHERE t.academic_year_id = a.id;
   → Dừng lại kiểm tra:
     SELECT count(*) FROM theses WHERE academic_year_id IS NOT NULL AND start_date IS NULL;
     phải bằng 0 mới đi tiếp
3. drop_academic_year         ALTER TABLE theses DROP COLUMN academic_year_id;
                              DROP TABLE academic_years;
```

Tách 3 bước để nếu bước 2 sai thì bước 3 chưa chạy — dữ liệu năm học vẫn còn đó.

### 4.2 Backend

| Tệp | Việc |
|---|---|
| `schema.prisma:234-246` | Xoá `model AcademicYear`; `Thesis` bỏ `academic_year_id` + relation, thêm `start_date DateTime? @db.Date`, `end_date DateTime? @db.Date` |
| **`milestones.service.ts:151-154`** | **Chỗ khó nhất.** Đổi từ `thesis.academic_year.start_date/end_date` sang `thesis.start_date/end_date`. Khi đề tài chưa đặt kỳ (`null`) → chỉ kiểm `deadline > now` |
| `theses.service.ts:198-210` | Xoá `resolveAcademicYearId()` |
| `theses.routes.ts:85-101,178,311-339` | Bỏ `academic_year_id` khỏi schema tạo/sửa/lọc. Thêm `start_date`, `end_date` (validate `end_date > start_date`) |
| `admin.routes.ts:194,469-471,546-607` | Xoá 4 endpoint CRUD năm học + bộ lọc thống kê |
| `admin.service.ts:618,652,658,959-1050` | Xoá 6 hàm + bộ lọc `academic_year_id`. Thay bằng bộ lọc khoảng thời gian `from`/`to` trên `theses.start_date` nếu vẫn muốn phân kỳ thống kê |
| `reports.routes.ts:93,204` | Bỏ `academic_year_id` khỏi `exportQuerySchema`. Thêm `from`/`to` |
| `reports.service.ts:244,268,336,521,735,746` | Cột "Năm học" → **"Kỳ nghiên cứu"**, giá trị `formatPeriod(start_date, end_date)`, mặc định "Chưa đặt kỳ" |
| `serializers.ts:127,146-147` | Bỏ `academic_year`, thêm `start_date`/`end_date` |
| Migration SQL | Xoá index `uniq_academic_year_active` |

### 4.3 Frontend

| Tệp | Việc |
|---|---|
| `admin/settings/page.tsx:310-505` | Xoá toàn bộ tab "Năm học" (~195 dòng) |
| `theses/new/page.tsx` | Thêm 2 ô ngày "Kỳ nghiên cứu: từ … đến …" (tuỳ chọn) |
| `theses/[id]/page.tsx` | Hiện + sửa được kỳ nghiên cứu |
| `reports/page.tsx` | Bỏ bộ lọc năm học nếu có, thêm bộ lọc khoảng thời gian |
| `lib/services.ts` | Xoá `adminApi.academicYears()` và các hàm liên quan; cập nhật type `Thesis` |
| `lib/format.ts` | Thêm `formatPeriod(start, end)` |

### Kiểm chứng giai đoạn 4

1. Chạy migration trên **bản sao** DB thật trước. Sau bước 2, câu kiểm tra trả 0
2. Đề tài cũ vẫn giữ đúng khoảng thời gian từ năm học cũ
3. Tạo mốc với deadline ngoài kỳ nghiên cứu → bị chặn với thông điệp đúng
4. Đề tài chưa đặt kỳ → tạo mốc được, chỉ chặn deadline trong quá khứ
5. PDF báo cáo tiến độ hiện dòng "Kỳ nghiên cứu", không lỗi font tiếng Việt
6. CSV/XLSX có cột "Kỳ nghiên cứu"
7. `grep -rni "academic\|năm học" backend/src frontend/src` không còn kết quả

---

## 5. GIAI ĐOẠN 5 — Viết lại `Select`

### 5.1 Vấn đề

`ui/index.tsx:332` — `Select` là `<select>` **native** bọc CSS `input-base`. Popup do **hệ
điều hành** vẽ nên không nhận được `--bg-surface`, `--shadow-md`, `border-radius`, không theo
dark mode, không có chevron riêng, không icon, không mô tả phụ, không tìm kiếm, không dùng
được animation `pop-in`. Đây là toàn bộ nguyên nhân "hộp dropdown sơ sài, không ăn khớp".

Project **đã có** `Dropdown` / `DropdownItem` / `DropdownLabel` / `DropdownSeparator`
(`:1020-1124`) đúng design system — chỉ là `Select` không dùng chúng.

### 5.2 Thiết kế

**Giữ nguyên API** để 8 trang đang dùng (`theses`, `theses/new`, `ai-chat`, `admin/users`,
`feedbacks`, `milestones`, `reports`, `documents`) không phải sửa:

```ts
interface SelectProps {
  label?; error?; helperText?; disabled?; placeholder?;
  value; onChange;                              // giữ nguyên chữ ký (e.target.value)
  options?: SelectOption[]; children?;          // vẫn nhận <option> con
  searchable?: boolean;                         // tự bật khi options.length > 8
  name?; id?; required?;
}
interface SelectOption {
  value: string; label: string;
  description?: string; icon?: ReactNode; group?: string; disabled?: boolean;
}
```

- Trigger: `<button>` dùng `input-base` + `<CaretDown size={14}>` xoay 180° khi mở
- Popup: `card p-1 pop-in` + `boxShadow: var(--shadow-md)`, `max-h-64 overflow-y-auto`
- Item: `menu-item`, item đang chọn có `<Check size={13}>` + `--bg-active`
- `searchable`: ô `Input` ở đầu popup, khớp theo nhãn **đã bỏ dấu** (dùng lại logic
  `CommandPalette` `:451-467` — không ai gõ dấu vào ô tìm kiếm)
- Bàn phím: `ArrowUp`/`ArrowDown`/`Enter`/`Escape`/`Home`/`End`, gõ chữ để nhảy tới
- `aria-*`: `role="combobox"`, `aria-expanded`, `aria-activedescendant`, `role="listbox"`,
  `role="option"` + `aria-selected`
- Giữ một `<select className="sr-only" tabIndex={-1}>` đồng bộ giá trị: form submit thuần
  HTML và trình đọc màn hình cũ vẫn hoạt động
- Popup dùng `position: fixed` + tính toạ độ từ `getBoundingClientRect()`, tự lật lên khi
  không đủ chỗ dưới. `Dropdown` hiện tại dùng `absolute` nên bị cắt trong container có
  `overflow: hidden` — `Table` (`:1263`) chính là chỗ đó

Đổi tên component cũ thành `NativeSelect` và giữ export, phòng trường hợp cần quay lại nhanh.

### Kiểm chứng giai đoạn 5

1. So sánh cạnh nhau: popup `Select` và popup `Dropdown` của menu tài khoản có cùng nền,
   viền, bán kính, đổ bóng, animation
2. Dark mode: danh sách lựa chọn theo đúng theme
3. Bên trong `Table` có `overflow: hidden` → popup **không** bị cắt
4. Bàn phím: mở, di chuyển, chọn, đóng — không cần chuột
5. Bộ lọc trạng thái ở `admin/users` (nhiều lựa chọn) tự có ô tìm kiếm
6. 8 trang đang dùng `<Select>` chạy đúng mà **không phải sửa gì vì việc đổi `Select`**
   (một số trang trong đó có thay đổi khác ở giai đoạn 1, không liên quan)

---

## 6. GIAI ĐOẠN 6 — Viết lại Báo cáo

Làm sau cùng để mô tả đúng code cuối.

### 6.1 Chương 4 "XÂY DỰNG HỆ THỐNG" — viết từ đầu

Hiện `:1496` chỉ có 5 tiêu đề dán liền nhau, không có nội dung.

| Mục | Nội dung |
|---|---|
| 4.1 Cài đặt công cụ và thư viện | Node/TypeScript, Express, Prisma, Next.js, PostgreSQL 16 + extension `vector` & `pg_trgm`, Docker Compose. Bảng phiên bản từ `package.json` |
| 4.2 Xây dựng CSDL và kết nối | Migration Prisma, chiến lược đặt tên `snake_case` (`schema.prisma:25-28` giải thích lý do bỏ tầng ánh xạ camelCase↔snake_case), index HNSW cho pgvector, CHECK constraint cho `feedbacks` và `depth <= 2` |
| 4.3 Triển khai chức năng chính | Cấu trúc module, `middleware/auth.ts` + `domain/access.ts` (hai tầng phân quyền), máy trạng thái `milestone-fsm.ts`, luồng upload → lưu trữ, xuất PDF/CSV/XLSX |
| 4.4 Triển khai chức năng AI | Pipeline `extract.ts` → `chunking.ts` → `embeddings.ts` → `vector.repository.ts` → `rag.ts` → `llm.ts`. **Ba điểm đáng viết nhất:** (a) hybrid search cosine + `text_rank`, (b) ngưỡng **tương đối** `bestCosine * 0.45` (`rag.ts:104-127`) với số đo thực tế 0,101 vs 0,089, (c) fallback trích xuất khi không có LLM. Cộng chống prompt injection bằng thẻ `<tai_lieu>` |
| 4.5 Đánh giá kết quả | Bảng đối chiếu UC ↔ trạng thái cài đặt; đo thời gian phản hồi đối chiếu NFR ("đăng nhập < 1s", "tìm kiếm < 3s", "PDF < 5s"); kết quả test RBAC |

### 6.2 Chương 3 — vẽ lại ERD

Từ 13 bảng lên **19 bảng** (20 model trừ `academic_years` đã bỏ ở giai đoạn 4). Bổ sung mô tả:
`thesis_members`, `document_versions`, `document_shares`, `milestone_history`,
`notification_preferences`, `ai_suggestions`, `plagiarism_checks`, `refresh_tokens`,
`ai_chat_session_sources`. Bổ sung ~30 cột thiếu theo bảng ở `REVIEW_v2 §A3`.

Thêm mục **3.4 Thiết kế bảo mật** (hiện không có): tenant isolation qua `domain/access.ts`,
băm token xác minh/đặt lại thay vì lưu thô, refresh token xoay vòng + thu hồi, chống prompt
injection, audit log, hai tầng chống dò mật khẩu (`authLimiter` theo IP + `failed_login_attempts`
theo tài khoản).

### 6.3 Chương 2 — sửa mâu thuẫn

| Mục | Sửa |
|---|---|
| Bảng yêu cầu chức năng `:756` | Thêm nhóm **QT** (quản trị): quản lý người dùng, nhật ký, cấu hình, giám sát. Thêm các chức năng ở `REVIEW_v2 §A6`. Sửa tác nhân `AI-02` cho khớp UC 6.1 |
| `:1256` / `:1258` | Thống nhất **một** con số nhóm chức năng (hiện có 3 con số khác nhau: 6, 9, và 18 mục/6 tiền tố) |
| `:847` / `:1258` | Nói rõ báo cáo chính đặc tả **15 UC tiêu biểu**, 87 UC đầy đủ ở Phụ lục 1 |
| UC 6.3 `:1134` | Sửa phạm vi: bao gồm cả tài liệu chia sẻ qua `document_shares`, **và** tập nguồn người dùng tự chọn (tính năng mới ở giai đoạn 2) |
| UC 6.3 `:1131` | Sửa bước 4: hybrid search + ngưỡng tương đối, không phải cosine đơn thuần |
| UC 6.5 `:1155` | Bổ sung **hai chế độ** `STRICT` / `HYBRID` và quy tắc đánh dấu phần ngoài tài liệu |
| UC 4.9 `:1063` vs UC 5.1 `:1088` | Thống nhất hạn mức **50MB** (`env.MAX_UPLOAD_MB`) |
| UC 4.9 `:1064` / UC 5.1 `:1085` | Sửa "Cloud S3/Cloudinary/MinIO" → lưu trữ trên máy chủ (`lib/storage.ts`), có ghi chú hướng phát triển lên object storage |
| UC 2.8 `:971` | Bỏ "GPT-3.5/GPT-4", ghi đúng: đa nhà cung cấp (Anthropic/OpenAI/Gemini), mặc định `claude-sonnet-5`, embedding mặc định `local` |
| `:1266` kiến trúc | Sửa "OpenAI API" → lớp trừu tượng đa nhà cung cấp; bổ sung fallback trích xuất |
| UC mới | Bổ sung UC cho: chọn nguồn trong hội thoại AI, chuyển chế độ trả lời, kiểm tra trùng lặp (`REVIEW_LOG.md:87` đã ghi là còn tồn đọng), phiên bản tài liệu, chia sẻ tài liệu, xin gia hạn mốc |
| UC 2.7 | **Xoá** UC "Quản lý năm học" (`REVIEW_LOG.md:29` vừa bổ sung lần trước), thay bằng "Đặt kỳ nghiên cứu cho đề tài" thuộc nhóm quản lý đề tài |

### 6.4 Lỗi trình bày

Đánh số toàn bộ "Bảng ." → "Bảng 1..n", "Hình ." → "Hình 1..n" · sửa `:1001` "dánh sách",
`:1308` "lectures"→"lecturers", `:1346` "Tên mốc tiến.", `:1423` "đếnmilestone_id",
`:1112` escape `` \`ERROR\` `` · sửa caption `:1097` cho khớp tiêu đề `:1095` · gộp 2 cặp
tài liệu tham khảo trùng (`[3]`≡`[15]` Sentence-BERT, `[4]`≡`[16]` RAG) · sửa footnote sai
ngữ cảnh ở `:845` và `:1474`.

### 6.5 Cập nhật tài liệu UC

Đồng bộ `00_UC_Overview.md`, `02_UC_Admin.md`, `03_UC_Thesis.md`, `05_UC_Document.md`,
`06_UC_AI.md`, `ALL_UC_Consolidated.md`, `ERD_Specification.md`, `Screen_Flow_Diagram.md`,
`ARCHITECTURE.md`. Ghi thay đổi vào `REVIEW_LOG.md` như lần trước.

---

## 7. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Migration `academic_years` làm mất dữ liệu | 3 migration riêng biệt, kiểm tra giữa bước 2 và 3, chạy thử trên bản sao trước |
| `documentIds` từ client làm rò tenant isolation | **Giao** với `accessibleDocumentIds()`, không thay thế. Viết test: SV A gửi id của SV B → bị lọc |
| Ẩn nút ghi cho Admin bỏ sót chỗ | `canWrite()` là hàm duy nhất; grep toàn bộ `isAdmin(user)` trong `frontend/src/app` và duyệt từng chỗ — hiện có 4 chỗ đang dùng nó để **cấp thêm** quyền, phải đảo lại |
| `Select` mới làm hỏng 8 trang | Giữ nguyên API, giữ `<select>` ẩn, giữ `NativeSelect` để quay lại nhanh |
| Prompt `HYBRID` không tuân thủ định dạng `⚠ Ngoài tài liệu của bạn:` | Backend kiểm tra chuỗi; nếu không có mà `retrieval.hits` rỗng thì đánh dấu `used_general_knowledge` theo suy luận và ghi log để chỉnh prompt |
| Xoá seed làm mất môi trường thử nghiệm | Thêm script riêng `npm run seed:demo` **không** chạy mặc định, có cảnh báo rõ "chỉ dùng ở môi trường phát triển" |

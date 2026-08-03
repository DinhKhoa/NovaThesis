# Kế hoạch Tích hợp 3 Module Cốt lõi: Milestone – Document – AI Chat
**Phiên bản 2.0 — Đã cập nhật sau review codebase thực tế**

> Mọi quyết định kỹ thuật trong tài liệu này đều được đối chiếu trực tiếp với mã nguồn hiện hành.
> Các rủi ro kỹ thuật tiềm ẩn đã được xác định và có phương án xử lý cụ thể.

---

## 1. Bối cảnh & Vấn đề được xác nhận

### 1.1. Kiến trúc hiện tại
- **Backend**: Node.js/Express + TypeScript, Prisma ORM, PostgreSQL + pgvector
- **Frontend**: Next.js 16 (App Router), Zustand `^5.0.14` (đã có sẵn)
- **AI**: RAG pipeline (chunking → embedding → vector search → LLM stream via SSE)
- **Worker**: `document-indexer.ts` — chạy nền, chỉ xử lý các bản ghi có trong bảng `documents`

### 1.2. Ba vấn đề gốc được xác nhận bằng code

| # | Vấn đề | Bằng chứng trong code |
|---|---|---|
| 1 | Evidence file **không liên kết Document** | `milestones.routes.ts` L728-749: chỉ gọi `saveBuffer()` rồi ghi `evidence_file_url` vào milestone, không có `prisma.document.create()` |
| 2 | AI Chat **không biết ngữ cảnh Milestone** | `chatSchema` chỉ nhận `session_id`, `thesis_id`, `prompt`, `document_ids` — không có `milestone_id` |
| 3 | AI Chat là **trang riêng biệt** (`/ai-chat`) | `frontend/src/components/layout/index.tsx` chỉ export `Sidebar` + `Topbar`, không có AI panel toàn cục |

### 1.3. Rủi ro kỹ thuật được xác định

**EVIDENCE_MIME** bao gồm cả ảnh PNG/JPEG và ZIP — Worker RAG (`extractText()`) không extract được text từ ảnh → nếu evidence là ảnh, Document record sẽ tồn tại nhưng `DocumentChunk` rỗng → AI không có gì để đọc. Cần xử lý graceful.

---

## 2. Mục tiêu tích hợp

1. **Evidence → Document pipeline**: Minh chứng Milestone được đăng ký như Document thực thụ để Worker RAG tự động lập chỉ mục (với xử lý graceful khi evidence là ảnh).
2. **Context-Aware AI Chat**: Khi hỏi AI về một Milestone, hệ thống tự inject thông tin mốc vào System Prompt và lọc document liên quan làm nguồn.
3. **AI Draft Review cho Giảng viên**: Khi sinh viên nộp minh chứng, AI sinh bản đánh giá nháp lưu vào một model phù hợp, giảng viên thấy và có thể sao chép/tinh chỉnh.
4. **Global AI Drawer**: Một component panel AI trượt ra từ bên phải, có thể gọi từ trang Documents hoặc Milestones với context tự động nạp.

---

## 3. Thiết kế kỹ thuật chi tiết

### 3.1. Backend — Shared Utility (KHÔNG cross-import giữa module)

**Tạo file mới**: `backend/src/lib/evidence-to-document.ts`

```typescript
// Hàm tạo Document record từ evidence file, sau đó enqueue indexing
export async function registerEvidenceAsDocument(params: {
  thesisId: number;
  milestoneId: number;
  uploaderId: number;
  filePath: string;
  filename: string;
  mimeType: string;
  fileSize: number;
}): Promise<{ documentId: number; willIndex: boolean }>
```

- Tạo `Document` record với `tags: ["milestone-evidence", `milestone-id:${milestoneId}`]`
- `willIndex = true` chỉ khi MIME type **không phải** ảnh PNG/JPEG (vì ảnh không extract được text)
- Nếu `willIndex = true` → gọi `enqueueIndexing({ documentId })`
- Trả về `{ documentId, willIndex }` để caller quyết định hiện thông báo phù hợp

**Gọi hàm này trong** `milestones.routes.ts` — bên trong handler evidence upload, sau khi `saveBuffer()` thành công và transaction commit.

**Xử lý re-upload**: Khi evidence bị thay thế bằng file mới:
- Tìm Document record cũ qua `tags CONTAINS "milestone-id:${id}"`
- Gọi `deleteChunks(oldDocumentId)` để xóa vector chunks cũ
- Xóa mềm Document record cũ (`deleted_at = now()`)
- Tạo Document record mới cho file mới

### 3.2. Backend — AI Chat API (Milestone Context Injection)

**Không thêm `milestone_id` vào schema CSDL** — lý do: phức tạp hoá Tenant Isolation, tốn migration, không cần thiết để lưu trữ.

Thay vào đó, **thêm vào `chatSchema`**:
```typescript
const chatSchema = z.object({
  // ... các trường cũ ...
  milestone_id: optionalId("Mã mốc tiến độ"), // MỚI — chỉ dùng lúc tạo session mới
});
```

Trong handler `POST /chat`, **trước khi** `initSSE(res)`:
```
Nếu body.milestone_id có giá trị:
  1. Query prisma.milestone.findFirst({ where: { id, thesis_id: body.thesis_id } })
     → Đảm bảo milestone thuộc đúng thesis (Tenant Isolation)
  2. Nếu không tìm thấy → throw badRequest() TRƯỚC KHI mở SSE
  3. Tự động thêm Documents có tag "milestone-id:{id}" vào selectedDocumentIds
  4. Inject vào System Prompt: tên mốc, mô tả, hạn chót, trạng thái hiện tại
```

### 3.3. Backend — AI Draft Review cho Milestone

**Không tái dùng `AISuggestion`** (vốn chỉ dành cho roadmap với payload `[{name, description, deadline, order_index}]`).

Thay vào đó, dùng model **`Feedback`** đã sẵn có (có `milestone_id` field):
- Tạo endpoint mới: `POST /api/ai/milestone-review/:milestoneId`
- Đây là endpoint bất đồng bộ (không SSE): gọi AI → nhận kết quả → lưu `Feedback` với `content = AI review text` và metadata flag `is_ai_draft = true` trong một JSON field
- Trigger tự động: khi Milestone chuyển sang `PENDING_APPROVAL`, backend enqueue job tạo review

> **Lưu ý**: Bảng `Feedback` hiện tại chưa có trường `is_ai_draft`. Cần thêm `is_ai_draft Boolean @default(false)` và migration.

### 3.4. Frontend — Zustand Store cho AI Panel

**Tạo file mới**: `frontend/src/lib/ai-panel.ts`

Pattern nhất quán với `toast.ts` (Zustand v5):
```typescript
import { create } from "zustand";

interface AIPanelState {
  isOpen: boolean;
  // Context được nạp khi mở panel:
  activeDocumentId: number | null;
  activeMilestoneId: number | null;
  activeThesisId: number | null;
  // Actions:
  openWithDocument: (docId: number, thesisId: number) => void;
  openWithMilestone: (milestoneId: number, thesisId: number) => void;
  close: () => void;
}

export const useAIPanelStore = create<AIPanelState>(...);
// Export convenience helpers (giống toast.ts pattern):
export const aiPanel = {
  openWithDocument: (docId, thesisId) => ...,
  openWithMilestone: (milestoneId, thesisId) => ...,
};
```

### 3.5. Frontend — AIChatDrawer Component

**Tạo file mới**: `frontend/src/components/layout/AIChatDrawer.tsx`

- Component render một panel slide-in cố định bên phải màn hình
- Đọc state từ `useAIPanelStore`
- Khi `isOpen && activeMilestoneId` → tự động gửi request chat với `milestone_id` context
- Khi `isOpen && activeDocumentId` → tự động set document đó làm source khi chat
- **Phím tắt**: Dùng `Ctrl+J` (tránh `Ctrl+K` vì có thể conflict với browser/OS)
- Export từ `frontend/src/components/layout/index.tsx`

### 3.6. Frontend — Mount trong Dashboard Layout

Trong `frontend/src/app/(dashboard)/layout.tsx`, thêm `<AIChatDrawer />` vào `DashboardShell` cùng cấp với `<Sidebar>` và nội dung chính.

### 3.7. Refactor ai-chat/page.tsx (Bắt buộc, làm trước)

File hiện tại **80,156 bytes** — monolithic, tất cả trong một file. Phải tách thành:
- `ChatSessionList.tsx` — sidebar danh sách phiên
- `ChatMessageBubble.tsx` — bubble tin nhắn
- `ChatSourcePicker.tsx` — chọn tài liệu nguồn
- `ChatInput.tsx` — ô nhập và nút gửi
- `useChat.ts` — hook quản lý SSE stream, session state

---

## 4. Kế hoạch triển khai từng bước (Có thứ tự ưu tiên)

### 🔴 Bước 0 — Refactor ai-chat/page.tsx [BLOCKER]
**Làm trước tất cả.** File 80KB là rủi ro cao nhất, mọi thay đổi sau sẽ khó hơn nếu chưa tách.
- Không thay đổi logic nghiệp vụ, chỉ tách component

### 🟠 Bước 1 — Shared Utility + Schema Migration
1. Tạo `backend/src/lib/evidence-to-document.ts`
2. Thêm `is_ai_draft Boolean @default(false)` vào model `Feedback` trong `schema.prisma`
3. Chạy `npx prisma migrate dev --name add_feedback_ai_draft`
4. Cập nhật Prisma Client

### 🟠 Bước 2 — Nâng cấp Milestone Evidence Upload
1. Trong `milestones.routes.ts`, sau khi evidence upload thành công:
   - Gọi `registerEvidenceAsDocument(...)` từ `lib/evidence-to-document.ts`
   - Xử lý re-upload: xóa soft Document record cũ + chunks cũ
2. Thêm điều kiện: nếu `willIndex = false` (evidence là ảnh), vẫn tạo Document record nhưng không enqueue — `status_ai = "DONE"` với `summary_ai = "(Tệp ảnh – không trích xuất được nội dung)"`

### 🟡 Bước 3 — Nâng cấp AI Chat API
1. Thêm `milestone_id` vào `chatSchema` (optional)
2. Trong handler `/chat`: load Milestone info, validate Tenant Isolation, inject System Prompt **trước** `initSSE(res)`
3. Tự động filter document có tag milestone vào `selectedDocumentIds`

### 🟡 Bước 4 — Milestone AI Draft Review
1. Tạo endpoint `POST /api/ai/milestone-review/:milestoneId`
2. Job worker: sau khi Milestone chuyển `PENDING_APPROVAL`, enqueue review job
3. Lưu kết quả vào `Feedback` với `is_ai_draft = true`

### 🟢 Bước 5 — Frontend: Zustand Store + AIChatDrawer
1. Tạo `frontend/src/lib/ai-panel.ts` (Zustand store)
2. Tạo `frontend/src/components/layout/AIChatDrawer.tsx`
3. Cập nhật `components/layout/index.tsx` để export
4. Cập nhật `(dashboard)/layout.tsx` để mount `<AIChatDrawer />`

### 🟢 Bước 6 — Touchpoints trong Documents & Milestones
1. **Documents page**: thêm nút "Hỏi AI" trên mỗi dòng → `aiPanel.openWithDocument(docId, thesisId)`
2. **Milestones page (Student)**: thêm khu vực "Hỗ trợ AI" khi đang nộp evidence → `aiPanel.openWithMilestone(milestoneId, thesisId)`
3. **Milestones page (Lecturer)**: hiển thị Feedback có `is_ai_draft = true` trong panel duyệt

### 🟢 Bước 7 — Kiểm tra & Sửa lỗi xung đột
1. Kiểm tra TypeScript build: `cd backend && npx tsc --noEmit` + `cd frontend && npx tsc --noEmit`
2. Kiểm tra Tenant Isolation: document từ milestone của thesis A không được thấy qua AI Chat của thesis B
3. Kiểm tra SSE stream: mọi lỗi validation (milestone không tìm thấy) phải được throw TRƯỚC `initSSE(res)`

---

## 5. Danh sách file cần tạo/sửa đổi

| File | Hành động | Ghi chú |
|---|---|---|
| `backend/src/lib/evidence-to-document.ts` | **Tạo mới** | Shared utility, tránh circular import |
| `backend/prisma/schema.prisma` | **Sửa** | Thêm `is_ai_draft` vào `Feedback` |
| `backend/src/modules/milestones/milestones.routes.ts` | **Sửa** | Gọi `registerEvidenceAsDocument` sau upload |
| `backend/src/modules/ai/ai.routes.ts` | **Sửa** | Thêm `milestone_id` vào chatSchema, inject context |
| `backend/src/modules/ai/ai.service.ts` | **Sửa** | Thêm hàm `generateMilestoneReview()` |
| `frontend/src/lib/ai-panel.ts` | **Tạo mới** | Zustand store, theo pattern của `toast.ts` |
| `frontend/src/components/layout/AIChatDrawer.tsx` | **Tạo mới** | Panel toàn cục |
| `frontend/src/components/layout/index.tsx` | **Sửa** | Export AIChatDrawer |
| `frontend/src/app/(dashboard)/layout.tsx` | **Sửa** | Mount `<AIChatDrawer />` |
| `frontend/src/app/(dashboard)/ai-chat/page.tsx` | **Refactor** | Tách thành 5 component con |
| `frontend/src/app/(dashboard)/documents/page.tsx` | **Sửa** | Thêm nút "Hỏi AI" |
| `frontend/src/app/(dashboard)/milestones/page.tsx` | **Sửa** | Thêm AI touchpoint cho Student & Lecturer |

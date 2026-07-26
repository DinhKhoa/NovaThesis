# NovaThesis — System Architecture Diagram

> Hướng dẫn: Dùng file này làm reference để vẽ trên Figma. Mỗi section tương ứng 1 vùng trên canvas.

---

## 1. OVERVIEW LAYER (Vẽ ở giữa, làm trung tâm)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        NGƯỜI DÙNG (Browser)                        │
│                                                                     │
│   👤 Student    👨‍🏫 Lecturer    🔧 Admin                           │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                    HTTP / HTTPS
                           │
          ┌────────────────┴────────────────┐
          ▼                                 ▼
┌──────────────────┐            ┌──────────────────────┐
│  Frontend (SPA)  │  REST API  │   Backend (API)      │
│  Next.js 16      │◄──────────►│   FastAPI             │
│  Port: 3000      │  + SSE     │   Port: 8000          │
└──────────────────┘            └──────────┬───────────┘
                                           │
                              ┌────────────┼────────────────┐
                              ▼            ▼                ▼
                     ┌──────────────┐ ┌─────────┐ ┌──────────────┐
                     │  PostgreSQL  │ │ pgvector│ │  OpenAI API  │
                     │  (Database)  │ │(Vectors)│ │  (Embedding) │
                     │  Port: 5432  │ │         │ │  (Optional)  │
                     └──────────────┘ └─────────┘ └──────────────┘
```

---

## 2. FRONTEND ARCHITECTURE (Vẽ bên trái)

### 2.1. Tech Stack Box

```
┌─────────────────────────────────────────────┐
│           FRONTEND — Next.js 16 SPA          │
├─────────────────────────────────────────────┤
│  React 19 · TypeScript 5 · Tailwind CSS 4  │
│  Zustand 5 · next-themes · Motion 12        │
│  Three.js + Vanta.js · Phosphor Icons       │
└─────────────────────────────────────────────┘
```

### 2.2. Route Map (Vẽ dạng tree)

```
app/
├── page.tsx ───────────────────── Landing Page + Auth Sheet
│
├── (auth)/
│   ├── forgot-password/
│   ├── reset-password/
│   └── verify-email/
│
└── (dashboard)/ ──────────────── Protected Layout (AuthGuard)
    │
    ├── dashboard/ ─────────────── Overview (Stats, Milestones, Activity)
    │
    ├── theses/
    │   ├── page.tsx ───────────── Thesis List
    │   ├── new/page.tsx ───────── Create Thesis
    │   └── [id]/page.tsx ──────── Thesis Detail
    │
    ├── milestones/ ────────────── Kanban Board (Drag & Drop + FSM)
    │
    ├── documents/ ─────────────── Document Management & Upload
    │
    ├── ai-chat/ ───────────────── AI RAG Chat (SSE Streaming)
    │
    ├── feedbacks/ ─────────────── Threaded Feedback / Discussion
    │
    ├── notifications/ ─────────── Notification Center
    │
    ├── reports/ ───────────────── Export Excel/CSV
    │
    ├── profile/ ───────────────── User Profile
    │
    └── admin/
        ├── users/ ─────────────── User Management
        ├── logs/ ──────────────── System Audit Logs
        ├── statistics/ ─────────── System Statistics
        └── settings/ ──────────── System Configuration
```

### 2.3. Core Modules Box (Vẽ dạng 3-4 ô nhỏ)

```
┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
│  api.ts            │  │  auth.ts           │  │  milestone-fsm.ts  │
│  API Client        │  │  Zustand Store     │  │  State Machine     │
│  - Bearer token    │  │  - JWT in localStorage│ │  - Transition rules│
│  - Auto redirect 401│  │  - login/logout   │  │  - Role-based      │
│  - FormData upload │  │  - fetchProfile    │  │  - Guard functions  │
└────────────────────┘  └────────────────────┘  └────────────────────┘

┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
│  use-board-drag.ts │  │  toast.ts          │  │  layout/           │
│  Drag & Drop Hook  │  │  Toast System      │  │  Sidebar + Topbar  │
│  - Pointer events  │  │  - Zustand store   │  │  - Role-gated nav  │
│  - Keyboard a11y   │  │  - Global toasts   │  │  - Cmd+K palette   │
└────────────────────┘  └────────────────────┘  └────────────────────┘
```

### 2.4. Component Library Box

```
┌──────────────────────────────────────────────────────┐
│              UI Component Library (~1643 lines)       │
├──────────────────────────────────────────────────────┤
│  Button · Input · Select · Textarea · Checkbox       │
│  Modal · Sheet · Dropdown · Avatar · Badge · Card    │
│  Panel · Table · ProgressBar · StatTile · Tabs       │
│  EmptyState · ConfirmDialog · Toast · Spinner        │
│  DetailRow · IconButton · PageHeader · Toolbar       │
└──────────────────────────────────────────────────────┘
```

---

## 3. BACKEND ARCHITECTURE (Vẽ bên phải)

### 3.1. Tech Stack Box

```
┌─────────────────────────────────────────────────────┐
│          BACKEND — FastAPI REST API                   │
├─────────────────────────────────────────────────────┤
│  Python · SQLAlchemy 2.0 (async) · Pydantic 2.6     │
│  PyJWT (HS256) · passlib (pbkdf2_sha256)            │
│  asyncpg · openpyxl · reportlab · httpx              │
└─────────────────────────────────────────────────────┘
```

### 3.2. Directory Structure (Vẽ dạng tree)

```
backend/
├── main.py ──────────────── FastAPI App (Lifespan, CORS, Routers)
│
└── app/
    ├── core/
    │   ├── config.py ────── Settings (JWT, DB, AI keys)
    │   ├── security.py ──── Password hash, JWT create, XSS sanitize
    │   ├── deps.py ──────── Auth deps (get_current_user, require_roles)
    │   └── store.py ─────── JSON File Store (mock fallback)
    │
    ├── db/
    │   ├── session.py ───── Async Engine + Session Factory
    │   └── models.py ────── 13 SQLAlchemy ORM Models
    │
    ├── schemas/
    │   └── schemas.py ───── Pydantic Request/Response Schemas
    │
    ├── api/v1/
    │   ├── auth.py ──────── Login, Register, Profile, Me
    │   ├── theses.py ────── CRUD + FSM Approve/Reject
    │   ├── milestones.py ── CRUD + Approve + Role-gated Delete
    │   ├── documents.py ─── Upload, List, Delete
    │   ├── ai.py ────────── RAG Chat (SSE), Semantic Search, Plagiarism
    │   ├── feedbacks.py ─── Threaded Feedback + Resolve
    │   ├── notifications.py│ List, Mark-read
    │   └── admin.py ─────── Dashboard, Users, Logs, Report Export
    │
    └── data/ ─────────────── JSON Mock Data Files
```

### 3.3. API Routes Table (Vẽ dạng bảng)

```
┌────────────┬──────────────────────┬──────────────────────────────────┐
│   Router   │     Base URL         │          Key Endpoints           │
├────────────┼──────────────────────┼──────────────────────────────────┤
│   auth     │  /api/v1/auth        │  POST /login, POST /register    │
│            │                      │  GET /me, PATCH /profile        │
├────────────┼──────────────────────┼──────────────────────────────────┤
│   theses   │  /api/v1/theses      │  GET /, POST /, PATCH /{id}     │
│            │                      │  DELETE /{id}                    │
│            │                      │  POST /{id}/approve, /reject    │
├────────────┼──────────────────────┼──────────────────────────────────┤
│ milestones │  /api/v1/milestones  │  GET /, POST /, PATCH /{id}     │
│            │                      │  POST /{id}/approve, DELETE     │
├────────────┼──────────────────────┼──────────────────────────────────┤
│ documents  │  /api/v1/documents   │  GET /, POST /upload            │
│            │                      │  DELETE /{id}                    │
├────────────┼──────────────────────┼──────────────────────────────────┤
│    ai      │  /api/v1/ai          │  POST /chat/stream (SSE)        │
│            │                      │  GET /sessions/{id}/messages     │
│            │                      │  POST /semantic-search           │
│            │                      │  POST /check-plagiarism          │
├────────────┼──────────────────────┼──────────────────────────────────┤
│ feedbacks  │  /api/v1/feedbacks   │  GET /, POST /                  │
│            │                      │  POST /{id}/resolve, DELETE     │
├────────────┼──────────────────────┼──────────────────────────────────┤
│  notifs    │  /api/v1/notifications│ GET /, PATCH /{id}/read        │
├────────────┼──────────────────────┼──────────────────────────────────┤
│   admin    │  /api/v1/admin       │  GET /dashboard, /users, /logs  │
│            │                      │  GET /reports/export             │
└────────────┴──────────────────────┴──────────────────────────────────┘
```

---

## 4. DATABASE SCHEMA (Vẽ ở dưới cùng, dạng ERD)

### 4.1. Entity Relationship

```
┌──────────────┐       ┌──────────────────┐       ┌──────────────┐
│    User       │1────1│    Student       │       │   Lecturer   │
│──────────────│       │──────────────────│       │──────────────│
│ id (PK)      │       │ user_id (FK)     │       │ user_id (FK) │
│ email        │       │ student_code     │       │ lecturer_code│
│ password_hash│       └────────┬─────────┘       │ department   │
│ full_name    │                │                 │ max_students │
│ role         │                │                 └──────┬───────┘
│ status       │                │                        │
│ avatar_url   │                │                        │
└──────┬───────┘                │                        │
       │                        │                        │
       │1                       │*                       │1
       │                        │                        │
       │*               ┌───────┴────────────────────────┘
       │                │*
       │        ┌───────┴──────────┐
       │        │     Thesis       │
       │        │──────────────────│
       │        │ id (PK)          │
       │        │ title            │
       │        │ description      │
       │        │ field            │
       │        │ status (FSM)     │
       │        │ lecturer_id (FK) │
       │        │ rejection_reason │
       │        └────────┬─────────┘
       │                 │
       │        ┌────────┼─────────────┬──────────────┬───────────────┐
       │        │1       │*            │*             │*              │*
       │        │  ┌─────┴──────┐  ┌──┴──────────┐ ┌─┴──────────┐ ┌──┴────────────┐
       │        │  │ Milestone  │  │  Document   │ │ AIChatSess │ │ ThesisStudent │
       │        │  │────────────│  │─────────────│ │────────────│ │───────────────│
       │        │  │ id (PK)    │  │ id (PK)     │ │ id (PK)    │ │ thesis_id(FK) │
       │        │  │ thesis_id  │  │ thesis_id   │ │ thesis_id  │ │ student_id(FK)│
       │        │  │ name       │  │ filename    │ │ user_id    │ │ role          │
       │        │  │ deadline   │  │ file_path   │ │ title      │ │ (LEADER/MEMBER)│
       │        │  │ status(FSM)│  │ file_size   │ └─────┬──────┘ └───────────────┘
       │        │  │ evidence   │  │ summary_ai  │       │
       │        │  └─────┬──────┘  │ tags (ARRAY)│       │1
       │        │        │         └──────┬──────┘       │
       │        │1       │*               │*             │*
       │        │  ┌─────┴──────┐  ┌──────┴───────┐ ┌────┴───────────┐
       │        │  │ Feedback   │  │ DocumentChunk│ │ AIChatMessage  │
       │        │  │────────────│  │──────────────│ │────────────────│
       │        │  │ id (PK)    │  │ id (PK)      │ │ id (PK)        │
       │        │  │ user_id    │  │ document_id  │ │ session_id(FK) │
       │        │  │ content    │  │ content      │ │ role           │
       │        │  │ parent_id  │  │ embedding    │ │ content        │
       │        │  │ is_resolved│  │ Vector(1536) │ │ citations      │
       │        │  └────────────┘  └──────────────┘ │ rating         │
       │        │                                   └────────────────┘
       │
       │1
       ├──────────────────┬──────────────────┐
       │*                 │*                 │*
┌──────┴───────┐  ┌───────┴────────┐  ┌─────┴──────────┐
│ Notification │  │   SystemLog    │  │ SystemConfig   │
│──────────────│  │────────────────│  │────────────────│
│ id (PK)      │  │ id (PK)        │  │ config_key     │
│ user_id (FK) │  │ user_id (FK)   │  │ config_value   │
│ title        │  │ action         │  │ description    │
│ content      │  │ ip_address     │  └────────────────┘
│ is_read      │  │ details (JSONB)│
└──────────────┘  └────────────────┘
```

### 4.2. FSM Status Diagrams (Vẽ dạng flowchart)

```
MILESTONE STATUS (Finite State Machine):
═══════════════════════════════════════════

  ┌─────────────┐
  │ NOT_STARTED │
  └──────┬──────┘
         │ Start (Student)
         ▼
  ┌───────────┐
  │  ONGOING  │◄──────────────────────┐
  └─────┬─────┘                       │
        │ Submit (Student)            │ Revise (Lecturer)
        ▼                             │
  ┌──────────────────┐               │
  │ PENDING_APPROVAL │───────────────┘
  └─────┬────────────┘
        │ Approve (Lecturer)
        ▼
  ┌──────────┐
  │COMPLETED │
  └──────────┘


THESIS STATUS:
═══════════════════════════════════════════

  ┌────────────┐
  │  PENDING   │
  └──────┬─────┘
         │ Approve (Lecturer)
         ▼
  ┌───────────┐
  │ IN_PROGRESS│
  └─────┬─────┘
        │ Submit (Lecturer)
        ▼
  ┌──────────────┐
  │ UNDER_REVIEW │
  └──────┬───────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌─────────┐
│APPROVED│ │REJECTED │
└────────┘ └─────────┘
```

---

## 5. AUTHENTICATION & AUTHORIZATION FLOW (Vẽ dạng sequence diagram)

```
┌──────────┐          ┌──────────┐          ┌──────────┐
│  Browser │          │ Frontend │          │ Backend  │
│ (User)   │          │ (Next.js)│          │ (FastAPI)│
└────┬─────┘          └────┬─────┘          └────┬─────┘
     │  1. Enter credentials│                    │
     │─────────────────────►│                    │
     │                      │ 2. POST /auth/login│
     │                      │───────────────────►│
     │                      │                    │ 3. Verify password
     │                      │                    │    (pbkdf2_sha256)
     │                      │                    │ 4. Generate JWT
     │                      │                    │    (HS256, 24h)
     │                      │  5. { access_token,│
     │                      │       user }       │
     │                      │◄───────────────────│
     │                      │ 6. Store token     │
     │                      │    localStorage    │
     │                      │    nova_access_token│
     │  7. Authenticated    │                    │
     │     view             │                    │
     │◄─────────────────────│                    │
     │                      │                    │
     │  8. Navigate to page │                    │
     │─────────────────────►│                    │
     │                      │ 9. GET /api/v1/... │
     │                      │ + Bearer <token>   │
     │                      │───────────────────►│
     │                      │                    │ 10. get_current_user()
     │                      │                    │     PyJWT decode
     │                      │                    │     + DB lookup
     │                      │  11. Response      │
     │                      │◄───────────────────│
     │  12. Render page     │                    │
     │◄─────────────────────│                    │

RBAC: require_roles(ADMIN, LECTURER, STUDENT)
→ Admin bypasses all role checks
→ Suspended users → 403
```

---

## 6. AI RAG PIPELINE (Vẽ dạng flow)

```
┌──────────────────────────────────────────────────────────────┐
│                    AI RAG ENGINE                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │ Document │───►│  Chunking    │───►│  Embedding       │   │
│  │ Upload   │    │  (split text)│    │  OpenAI 1536-dim │   │
│  └──────────┘    └──────────────┘    └────────┬─────────┘   │
│                                               │              │
│                                               ▼              │
│                                    ┌──────────────────┐      │
│                                    │   pgvector       │      │
│                                    │   Vector Store   │      │
│                                    └────────┬─────────┘      │
│                                             │                │
│  ┌──────────┐    ┌──────────────┐           │                │
│  │  User    │───►│ Semantic     │◄──────────┘                │
│  │  Query   │    │  Search      │                            │
│  └──────────┘    └──────┬───────┘                            │
│                         │                                    │
│                         ▼                                    │
│              ┌────────────────────┐                          │
│              │  LLM Completion   │                          │
│              │  (Mock for now)   │                          │
│              └────────┬───────────┘                          │
│                       │                                      │
│                       ▼                                      │
│              ┌────────────────────┐                          │
│              │  SSE Streaming     │──► Frontend ai-chat page │
│              │  text/event-stream │                          │
│              └────────────────────┘                          │
│                                                              │
│  Additional:                                                 │
│  • POST /semantic-search — vector similarity search          │
│  • POST /check-plagiarism — plagiarism detection (mock)      │
└──────────────────────────────────────────────────────────────┘
```

---

## 7. DATA FLOW SUMMARY (Vẽ dạng Sankey/Arrow diagram)

```
                        ┌─────────────────────────┐
                        │      NGƯỜI DÙNG         │
                        │   (Student/Lecturer/     │
                        │        Admin)            │
                        └───────────┬─────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
              ┌──────────┐   ┌──────────┐   ┌──────────┐
              │ Auth     │   │ Thesis   │   │ AI Chat  │
              │ Flow     │   │ Flow     │   │ Flow     │
              └────┬─────┘   └────┬─────┘   └────┬─────┘
                   │              │              │
                   ▼              ▼              ▼
              ┌─────────────────────────────────────────┐
              │         REST API (FastAPI)               │
              │    /api/v1/{resource}                    │
              └──────────────────┬──────────────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
     ┌──────────────┐  ┌────────────────┐  ┌──────────────┐
     │  PostgreSQL  │  │  File Storage  │  │  OpenAI API  │
     │  (13 tables) │  │  (Uploads)     │  │  (Embedding) │
     │  + pgvector  │  │  (JSON mock)   │  │  (Optional)  │
     └──────────────┘  └────────────────┘  └──────────────┘
```

---

## 8. DEPLOYMENT (Vẽ ở dưới, dạng infrastructure diagram)

```
┌──────────────────────────────────────────────────────────────────┐
│                    DEVELOPMENT ENVIRONMENT                        │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐         ┌─────────────────┐                │
│  │  Frontend       │         │  Backend        │                │
│  │  Next.js Dev    │  HTTP   │  Uvicorn        │                │
│  │  localhost:3000 │◄───────►│  localhost:8000  │                │
│  └─────────────────┘         └────────┬────────┘                │
│                                       │                          │
│                              ┌────────┴────────┐                │
│                              ▼                 ▼                │
│                     ┌──────────────┐  ┌──────────────┐          │
│                     │  PostgreSQL  │  │  Docker      │          │
│                     │  localhost   │  │  Container   │          │
│                     │  :5432       │  │  (pgvector)  │          │
│                     └──────────────┘  └──────────────┘          │
│                                                                  │
│  No CI/CD · No Docker Compose · Local development only          │
└──────────────────────────────────────────────────────────────────┘
```

---

## 9. COLOR PALETTE (cho Figma)

```
Primary (DUE Blue):     #2563EB → Frontend accent
Background Light:        #F8FAFC
Background Dark:         #0F172A
Surface Light:           #FFFFFF
Surface Dark:            #1E293B
Text Primary:            #0F172A
Text Secondary:          #64748B
Border:                  #E2E8F0
Success:                 #22C55E
Warning:                 #F59E0B
Error:                   #EF4444
Info:                    #3B82F6
```

---

## 10. FIGMA LAYOUT SUGGESTION

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│   ┌─────────────┐   ┌──────────────────────────┐  ┌────────────┐ │
│   │             │   │                          │  │            │ │
│   │  FRONTEND   │   │     API / BACKEND        │  │  DATABASE  │ │
│   │             │   │                          │  │            │ │
│   │  • Routes   │◄──┤  • Auth                  │──►  • ERD    │ │
│   │  • Modules  │   │  • Theses                │  │  • FSM    │ │
│   │  • UI Lib   │   │  • Milestones            │  │  • pgvector│ │
│   │  • Auth     │   │  • Documents             │  │            │ │
│   │             │   │  • AI (SSE)              │  │            │ │
│   │             │   │  • Feedbacks             │  │            │ │
│   │             │   │  • Admin                 │  │            │ │
│   └─────────────┘   └──────────────────────────┘  └────────────┘ │
│                                                                    │
│   ┌──────────────────────────────────────────────────────────────┐ │
│   │                    EXTERNAL SERVICES                         │ │
│   │   PostgreSQL + pgvector  │  OpenAI API  │  File Storage     │ │
│   └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│   ┌──────────────────────────────────────────────────────────────┐ │
│   │               AUTH FLOW  │  AI RAG FLOW  │  FSM FLOWS       │ │
│   └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

*Generated from NovaThesis source code — July 2026*

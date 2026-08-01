# Hướng dẫn chạy dự án NovaThesis

Hệ thống quản lý luận văn tích hợp AI — **Next.js 16 + Node.js/Express + Prisma + PostgreSQL/pgvector**.

---

## 1. Yêu cầu môi trường

| Thành phần   | Phiên bản                       | Ghi chú                               |
| -------------- | --------------------------------- | -------------------------------------- |
| Node.js        | ≥ 20 (khuyến nghị 22 hoặc 24) | `node -v` để kiểm tra             |
| npm            | ≥ 10                             | đi kèm Node                          |
| Docker Desktop | bất kỳ bản hiện hành         | dùng để chạy PostgreSQL + pgvector |

> **Không muốn dùng Docker?** Xem [mục 7](#7-chạy-không-dùng-docker) để cài PostgreSQL trực tiếp.

Kiểm tra nhanh:

```bash
node -v && npm -v && docker --version
```

---

## 2. Khởi động lần đầu (5 bước)

Mở terminal tại thư mục gốc dự án (`NovaThesis/`).

### Bước 1 — Bật cơ sở dữ liệu

```bash
docker compose up -d
```

Lệnh này dựng hai container:

| Container           | Cổng          | Vai trò                                                      |
| ------------------- | -------------- | ------------------------------------------------------------- |
| `novathesis-db`   | **5433** | PostgreSQL 16 kèm sẵn extension`pgvector`                 |
| `novathesis-mail` | **8025** | Mailpit — hộp thư giả, bắt mọi email hệ thống gửi ra |

> Cổng **5433** (không phải 5432) là cố ý, để không đụng PostgreSQL bạn đã cài sẵn trên máy.

Chờ database sẵn sàng:

```bash
docker compose ps
```

Cột `STATUS` của `novathesis-db` phải hiện `healthy`.

### Bước 2 — Cấu hình backend

```bash
cd backend
cp .env.example .env
```

Mở `backend/.env` và **thay hai khoá bí mật** bằng chuỗi ngẫu nhiên:

```bash
# macOS / Linux — sinh khoá và chép vào .env
openssl rand -hex 48   # → JWT_SECRET
openssl rand -hex 32   # → FILE_URL_SECRET
```

```powershell
# Windows PowerShell
-join ((1..48) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
```

> Server **từ chối khởi động** nếu hai biến này vẫn là giá trị mẫu. Đó là chủ ý: một khoá JWT mặc định trong mã nguồn là lỗ hổng, không phải sự tiện lợi.

**Phiên đăng nhập dùng cookie, không dùng localStorage.** Refresh token đi trong
cookie `httpOnly` do backend đặt; access token chỉ nằm trong bộ nhớ của trang.
Mặc định `COOKIE_SAMESITE=lax` chạy đúng cho `localhost` và cho trường hợp
frontend/backend cùng tên miền. Nếu triển khai hai tên miền khác nhau hẳn, đổi
sang `COOKIE_SAMESITE=none` **và** đặt `NODE_ENV=production` — trình duyệt từ chối
`SameSite=None` mà không có cờ `Secure`.

### Bước 3 — Cài đặt và khởi tạo dữ liệu

```bash
# vẫn ở trong thư mục backend/
npm install
npm run setup          # tải font tiếng Việt cho xuất PDF
npx prisma migrate deploy   # tạo 22 bảng + chỉ mục HNSW (bỏ academic_years, thêm ai_chat_session_sources)
npm run db:seed        # tham số hệ thống + 1 tài khoản quản trị
npm run db:seed:demo   # (tuỳ chọn) dữ liệu mẫu để thử nghiệm
```

**`npm run db:seed`** chạy được ở mọi môi trường. Nó cần hai biến trong `.env` và
sẽ dừng lại nếu thiếu:

```bash
SEED_ADMIN_EMAIL=admin@truong-cua-ban.edu.vn
SEED_ADMIN_PASSWORD=<mật khẩu mạnh, tối thiểu 12 ký tự>
```

Chạy lại lần hai **không** đặt lại mật khẩu quản trị — nếu có, một lần chạy vô ý
sẽ đưa mật khẩu về giá trị trong `.env` mà bạn đã đổi từ lâu.

**`npm run db:seed:demo`** nạp dữ liệu thử nghiệm (7 tài khoản, 5 đề tài, mốc
tiến độ, 3 tài liệu thật để trợ lý AI trích dẫn). Lệnh này **tự từ chối chạy khi
`NODE_ENV=production`** — dữ liệu bịa lẫn vào dữ liệu thật thì thống kê mất ý
nghĩa và không có nút hoàn tác.

### Bước 4 — Chạy backend

```bash
npm run dev
```

Thấy dòng này là thành công:

```
NovaThesis API đang chạy tại http://localhost:8000
```

Kiểm tra: mở [http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health) → phải trả `{"status":"NOMINAL",...}`

> Nếu đã chạy `npm run db:seed:demo`, lần khởi động đầu backend tự động lập chỉ mục 3 tài liệu mẫu (chia đoạn → sinh vector → lưu pgvector). Quá trình mất khoảng 5–15 giây và chạy ngầm; xem log để theo dõi.

### Bước 5 — Chạy frontend

Mở **terminal thứ hai**:

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000) và đăng nhập.

---

## 3. Tài khoản dùng thử

> Các tài khoản dưới đây chỉ tồn tại sau khi chạy **`npm run db:seed:demo`**.
> `npm run db:seed` thường chỉ tạo đúng một tài khoản quản trị theo
> `SEED_ADMIN_EMAIL` trong `.env` của bạn.

Mật khẩu chung: **`Admin@123456`** (đổi được ở `SEED_PASSWORD` trong `backend/.env`).

| Vai trò                   | Email                             | Xem được gì                                                             |
| -------------------------- | --------------------------------- | --------------------------------------------------------------------------- |
| **Quản trị viên** | `admin@novathesis.edu.vn`       | Quản lý người dùng, nhật ký, cấu hình, thống kê toàn hệ thống |
| **Giảng viên**     | `nguyen.vana@novathesis.edu.vn` | Duyệt đề tài, phê duyệt mốc, nhận xét, dashboard hướng dẫn      |
| **Giảng viên**     | `tran.thib@novathesis.edu.vn`   | (hướng dẫn đề tài IoT)                                                |
| **Sinh viên**       | `student@novathesis.edu.vn`     | Đề tài NovaThesis, 6 mốc tiến độ, 3 tài liệu, trợ lý AI          |

---

## 4. Thử các tính năng chính

Đăng nhập bằng tài khoản **sinh viên** để có đầy đủ dữ liệu.

### 4.1. Tìm kiếm ngữ nghĩa (pgvector + full-text)

Vào **Trợ lý AI → tab "Tìm kiếm ngữ nghĩa"**, thử các câu sau. Đây là tìm kiếm **lai**: hợp nhất xếp hạng vector (pgvector/HNSW) với xếp hạng toàn văn có trọng số IDF, bằng Reciprocal Rank Fusion.

| Gõ câu này                                                            | Kết quả mong đợi                                                 | Thời gian đo được |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------- | ---------------------- |
| `đánh đổi giữa tốc độ và độ chính xác khi lập chỉ mục` | Bài về HNSW/IVFFlat, dù câu hỏi không chứa hai từ đó       | ~16 ms                 |
| `làm sao để tác vụ nền không bị treo vĩnh viễn`              | Bài về Watchdog Timer                                              | ~8 ms                  |
| `chống rò rỉ dữ liệu giữa các sinh viên`                       | Bài về Tenant Isolation                                            | ~7 ms                  |
| `HNSW khác IVFFlat ở điểm nào?`                                   | Đúng bài so sánh hai thuật toán                                | ~19 ms                 |
| `Món phở bò nấu thế nào?`                                        | Không có kết quả — hệ thống nói thẳng là không tìm thấy | —                     |

> **Vì sao phải lai hai kỹ thuật?** Đo trên chính kho tài liệu mẫu: với câu hỏi ngắn chứa thuật ngữ hiếm, cosine cho câu đúng chủ đề là **0,101** còn câu hoàn toàn lạc đề là **0,089** — không ngưỡng nào tách được hai con số đó. Nguyên nhân là cosine trên vector túi-từ không có IDF: câu hỏi 6 từ khớp 2 thuật ngữ hiếm trong đoạn 350 từ vẫn cho điểm thấp. PostgreSQL có sẵn IDF, nên nhánh toàn văn bù đúng vào chỗ vector yếu, và ngược lại vector bắt được cách diễn đạt khác từ mà toàn văn bỏ lỡ. Chi tiết trong `backend/src/services/ai/vector.repository.ts`.

### 4.2. Hỏi đáp RAG có trích dẫn

Vào **Trợ lý AI → tab "Hỏi đáp"**:

- *"HNSW khác IVFFlat ở điểm nào?"*
- *"Vì sao phải chuẩn hoá L2 trước khi lưu vector?"*
- *"Đề tài này áp dụng tư duy firmware như thế nào?"*

Câu trả lời hiện dần theo luồng (streaming) kèm **nguồn trích dẫn** — bấm vào từng nguồn để xem nguyên văn đoạn được dùng và số trang.

### 4.3. Máy trạng thái mốc tiến độ (FSM)

Vào **Tiến độ**, thử kéo thẻ trên bảng Kanban:

- Kéo một mốc từ *Đang làm* → *Chờ phê duyệt* khi **chưa có minh chứng** → bị chặn kèm lý do.
- Đăng nhập bằng tài khoản **sinh viên**, kéo mốc sang *Hoàn thành* → bị chặn: chỉ giảng viên mới duyệt được.
- Đăng nhập bằng **giảng viên**, thao tác tương tự → thành công.

Server kiểm tra lại mọi chuyển tiếp; chặn phía giao diện chỉ để giải thích cho người dùng.

### 4.4. Tải tài liệu và lập chỉ mục nền

Vào **Tài liệu → Tải tài liệu lên**, chọn một tệp PDF/DOCX/TXT. Trạng thái đi qua `Chờ xử lý → Đang xử lý → Đã lập chỉ mục`. Sau đó tài liệu vừa tải đã có thể được trợ lý AI trích dẫn.

### 4.5. Bảng chẩn đoán (telemetry)

Đăng nhập **admin** rồi mở:

```
http://localhost:8000/api/v1/health/diagnostics
```

Trả về CPU, RAM, độ trễ CSDL, độ sâu hàng đợi worker, số lần watchdog kích hoạt, số đoạn đã vector hoá — tương đương việc đọc thanh ghi trạng thái của một thiết bị nhúng.

### 4.6. Email hệ thống

Mọi email (xác minh tài khoản, đặt lại mật khẩu, nhắc deadline) được Mailpit bắt lại. Mở [http://localhost:8025](http://localhost:8025) để đọc.

Thử: **Đăng xuất → Quên mật khẩu →** nhập `student@novathesis.edu.vn` → mở Mailpit xem thư.

---

## 5. Lệnh thường dùng

### Backend (`cd backend`)

| Lệnh                          | Tác dụng                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| `npm run dev`                | Chạy chế độ phát triển, tự nạp lại khi sửa mã                           |
| `npm run build && npm start` | Build và chạy bản production                                                    |
| `npm test`                   | Chạy 25 test đơn vị cho FSM, vector hoá, chia đoạn, chống prompt injection |
| `npm run typecheck`          | Kiểm tra kiểu TypeScript                                                         |
| `npm run db:studio`          | Mở Prisma Studio để xem/sửa dữ liệu trực quan                               |
| `npm run db:seed`            | Tham số hệ thống + 1 tài khoản quản trị (chạy lại được nhiều lần)     |
| `npm run db:seed:demo`       | Dữ liệu mẫu để thử nghiệm — từ chối chạy khi `NODE_ENV=production`     |
| `npm run db:reset`           | **Xoá sạch** CSDL rồi migrate + seed lại                                 |

### Frontend (`cd frontend`)

| Lệnh             | Tác dụng                   |
| ----------------- | ---------------------------- |
| `npm run dev`   | Chạy chế độ phát triển |
| `npm run build` | Build production             |
| `npm run lint`  | Kiểm tra ESLint             |

### Docker (thư mục gốc)

| Lệnh                      | Tác dụng                                        |
| -------------------------- | ------------------------------------------------- |
| `docker compose up -d`   | Bật CSDL và Mailpit                             |
| `docker compose stop`    | Tạm dừng (giữ nguyên dữ liệu)               |
| `docker compose down`    | Xoá container (vẫn giữ dữ liệu trong volume) |
| `docker compose down -v` | **Xoá cả dữ liệu**                      |

---

## 6. Dừng hệ thống

Nhấn `Ctrl + C` ở cả hai terminal, sau đó:

```bash
docker compose stop
```

Giải phóng cổng nếu có tiến trình còn treo:

```bash
# macOS / Linux
lsof -ti:3000,8000 | xargs kill -9
```

```powershell
# Windows PowerShell
Get-NetTCPConnection -LocalPort 3000,8000 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

---

## 7. Chạy không dùng Docker

Cần PostgreSQL 16 kèm extension `pgvector`.

**macOS (Homebrew):**

```bash
brew install postgresql@16 pgvector
brew services start postgresql@16
createdb novathesis
psql novathesis -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

**Ubuntu/Debian:**

```bash
sudo apt install postgresql-16 postgresql-16-pgvector
sudo -u postgres createdb novathesis
sudo -u postgres psql novathesis -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

**Windows:** cài PostgreSQL 16 từ trang chủ, sau đó cài `pgvector` theo hướng dẫn tại [https://github.com/pgvector/pgvector#windows](https://github.com/pgvector/pgvector#windows).

Rồi sửa `DATABASE_URL` trong `backend/.env` cho khớp (cổng mặc định là `5432`):

```env
DATABASE_URL="postgresql://postgres:matkhau@localhost:5432/novathesis?schema=public"
```

Không có Mailpit thì đặt `SMTP_HOST` trỏ tới máy chủ SMTP thật, hoặc bỏ qua — hệ thống vẫn chạy, chỉ ghi log lỗi gửi mail.

---

## 8. Bật AI thật (tuỳ chọn)

Mặc định hệ thống chạy ở chế độ **`local`** — không cần khoá API, không gửi dữ liệu ra ngoài:

- **Embedding cục bộ**: vector hoá bằng feature hashing trên n-gram từ và ký tự, có xử lý dấu tiếng Việt. Toàn bộ luồng pgvector/HNSW/RAG/trích dẫn hoạt động thật.
- **Trả lời trích xuất**: câu trả lời được ghép từ chính các câu trong tài liệu tìm được. Văn phong kém mượt hơn mô hình sinh, nhưng **không thể bịa** vì mọi chữ đều lấy từ tài liệu thật.

Muốn dùng mô hình thật, sửa `backend/.env`:

```env
# Ví dụ dùng OpenAI
EMBEDDING_PROVIDER=openai
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...

# Hoặc Anthropic cho phần trả lời, embedding vẫn dùng OpenAI
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

Hỗ trợ: `openai`, `anthropic`, `gemini`, `local`.

> **Đổi nhà cung cấp embedding thì phải lập chỉ mục lại toàn bộ.** Vector của hai mô hình khác nhau không nằm chung một không gian, nên so sánh chúng với nhau là vô nghĩa. Vào **Tài liệu → menu ⋯ → Lập chỉ mục lại** cho từng tệp, hoặc chạy `npm run db:seed:demo` rồi khởi động lại backend.

---

## 9. Xử lý sự cố

| Triệu chứng                                                 | Nguyên nhân & cách xử lý                                                                                                                                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Cấu hình môi trường không hợp lệ` khi khởi động | Chưa thay`JWT_SECRET` / `FILE_URL_SECRET` trong `.env`. Xem [Bước 2](#bước-2--cấu-hình-backend).                                                                                           |
| `Không kết nối được PostgreSQL`                       | Container chưa chạy →`docker compose up -d`, chờ `healthy`.                                                                                                                                    |
| `Extension pgvector chưa được cài`                     | Đang dùng PostgreSQL thường thay vì ảnh`pgvector/pgvector`. Chạy `docker compose down -v && docker compose up -d`.                                                                          |
| Port 5433 đã bị chiếm                                     | Sửa cổng trong`docker-compose.yml` và `DATABASE_URL` cho khớp.                                                                                                                                 |
| Tài liệu kẹt ở`Đang xử lý`                           | Watchdog tự đưa lại hàng đợi sau ~4 phút. Kiểm tra`/api/v1/health/diagnostics` mục `worker`.                                                                                             |
| Tài liệu báo`Lỗi xử lý`                               | Tệp PDF là bản quét ảnh hoặc có mật khẩu → không trích được văn bản. Mở chi tiết tài liệu để xem lý do cụ thể.                                                               |
| Báo cáo PDF bị lỗi dấu tiếng Việt                      | Chưa tải font →`npm run setup` trong `backend/`.                                                                                                                                                |
| Frontend gọi API bị lỗi CORS                               | `CORS_ORIGINS` trong `backend/.env` phải chứa đúng `http://localhost:3000`.                                                                                                                  |
| Đăng nhập báo khoá tài khoản                           | Đã sai mật khẩu 5 lần → chờ 15 phút. Đồng hồ đếm ngược hiện sau lần bấm Đăng nhập kế tiếp (trạng thái khoá không lưu ở trình duyệt — xem `lib/cookies.ts`). Cần gỡ ngay: đặt `locked_until = NULL` cho tài khoản đó trong `prisma studio`. |
| Không nhận được email                                    | Kiểm tra Mailpit tại[http://localhost:8025](http://localhost:8025). Ở chế độ dev, email **không** gửi ra Internet thật.                                                                  |
| Repo có ~4000 tệp thừa (`venv/`, `.next/`)             | Chúng được commit từ trước khi có`.gitignore` đầy đủ. Gỡ khỏi chỉ mục git (giữ nguyên tệp trên đĩa): `git rm -r --cached backend-legacy-fastapi/venv frontend/.next --quiet` |

Xem log chi tiết:

```bash
docker compose logs -f db        # log PostgreSQL
# log backend hiện trực tiếp ở terminal đang chạy `npm run dev`
```

---

## 10. Cấu trúc dự án

```
NovaThesis/
├─ docker-compose.yml          PostgreSQL + pgvector, Mailpit
│
├─ backend/                    API — Express + Prisma
│  ├─ prisma/
│  │  ├─ schema.prisma         22 bảng, đã xử lý toàn bộ ghi chú "CẦN SỬA" của ERD
│  │  ├─ migrations/           gồm migration riêng cho chỉ mục HNSW & CHECK constraint
│  │  └─ seed.ts               dữ liệu mẫu, có tài liệu thật để RAG hoạt động
│  ├─ src/
│  │  ├─ config/env.ts         xác thực biến môi trường lúc khởi động
│  │  ├─ lib/                  prisma, logger, errors, crypto, storage, mailer, audit
│  │  ├─ middleware/           auth (RBAC), validate (zod), error, rate-limit
│  │  ├─ domain/
│  │  │  ├─ access.ts          Tenant Isolation — nguồn sự thật duy nhất về quyền
│  │  │  └─ milestone-fsm.ts   máy trạng thái mốc tiến độ & đề tài
│  │  ├─ services/ai/          embeddings, chunking, extract, llm, rag, pgvector
│  │  ├─ workers/              hàng đợi nền + watchdog timer
│  │  ├─ jobs/scheduler.ts     cron nhắc deadline (UC 8.8)
│  │  └─ modules/              9 module REST theo 9 phân hệ use case
│  ├─ tests/                   25 test đơn vị cho phần lõi
│  └─ storage/                 tệp người dùng — riêng tư, không phục vụ tĩnh
│
├─ frontend/                   Next.js 16 + React 19 + Tailwind v4
│  └─ src/
│     ├─ lib/
│     │  ├─ api.ts             fetch wrapper, quản lý token
│     │  ├─ services.ts        khai báo toàn bộ endpoint kèm kiểu
│     │  ├─ use-async.ts       hook tải dữ liệu
│     │  ├─ format.ts          định dạng ngày/dung lượng theo locale người xem
│     │  └─ milestone-fsm.ts   bản sao client của FSM (chỉ để giải thích cho người dùng)
│     ├─ components/           design system tự viết (ui/, layout/)
│     └─ app/(dashboard)/      14 trang chức năng
│
├─ Tài liệu dự án/             92 use case, ERD, yêu cầu
└─ backend-legacy-fastapi/     backend Python cũ, giữ lại để đối chiếu
```

---

## 11. Ghi chú kiến trúc

Những quyết định đáng chú ý và lý do đằng sau:

- **Cô lập dữ liệu (Tenant Isolation).** Mọi truy vấn vector đều đi qua `domain/access.ts`. Không module nào được tự dựng điều kiện phân quyền riêng — đây là cách duy nhất để yêu cầu "scope tìm kiếm giới hạn trong tài liệu user có quyền" chỉ cần đúng ở một chỗ.
- **Truy hồi lai thay vì vector thuần.** Vector bắt được cách diễn đạt khác từ; toàn văn có IDF nên bắt được thuật ngữ hiếm. Hợp nhất bằng RRF cho cả hai, và trọng số hai nhánh thay đổi theo nhà cung cấp embedding đang cấu hình.
- **Máy trạng thái ở cả hai phía.** Bảng chuyển tiếp gốc nằm ở server. Bản client chỉ để giải thích vì sao một thao tác kéo thả bị từ chối; nó không phải hàng rào bảo mật.
- **Watchdog hai lớp.** `AbortController` cứu tác vụ treo trong tiến trình còn sống; vòng quét CSDL định kỳ cứu những tác vụ mắc kẹt khi tiến trình bị kill giữa chừng.
- **Tệp không phục vụ tĩnh.** `storage/` chỉ ra ngoài qua endpoint có kiểm tra quyền hoặc URL ký HMAC có hạn 5 phút.
- **Token dùng một lần lưu dạng băm.** Rò rỉ bản sao CSDL không được phép biến thành chiếm quyền tài khoản.
- **Chỉ mục HNSW thay vì IVFFlat.** IVFFlat cần dữ liệu mẫu để huấn luyện phân cụm nên cho recall rất tệ trên bảng rỗng lúc khởi tạo; HNSW dựng dần theo từng lần chèn nên đúng ngay từ tài liệu đầu tiên.

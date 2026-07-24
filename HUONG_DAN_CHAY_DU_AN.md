# 🚀 HƯỚNG DẪN KHỞI ĐỘNG VÀ VẬN HÀNH DỰ ÁN NOVATHESIS

Tài liệu này hướng dẫn chi tiết cách chạy và dừng cả 2 phân hệ **Frontend (Next.js 15)** và **Backend (FastAPI + AI pgvector)** trên máy tính của bạn.

---

## ⚠️ LƯU Ý QUAN TRỌNG VỀ PHIÊN BẢN PYTHON TRÊN MÁY BẠN

Máy tính của bạn có 2 bản Python:

1. Bản mặc định MSYS2: `C:\msys64\ucrt64\bin\python.exe` *(Không có thư viện dự án)*.
2. Bản **Python 3.14 chính thức**: `C:\Users\LEGION\AppData\Local\Programs\Python\Python314\python.exe` *(Đã cài sẵn đầy đủ FastAPI, uvicorn, pgvector, pydantic, pyjwt)*.

> 👉 **Do đó, khi chạy Backend, bạn cần dùng đường dẫn Python 3.14 theo hướng dẫn bên dưới.**

---

## 1️⃣ BƯỚC 1: KHỞI ĐỘNG BACKEND FASTAPI (PORT 8000)

1. Mở cửa sổ **PowerShell** hoặc **Terminal** mới.
2. Di chuyển vào thư mục `backend`:
   ```powershell
   cd "d:\Đại học\Thực tập nghề nghiệp\NovaThesis\backend"
   ```
3. Chạy lệnh khởi động Backend API Server:
   ```powershell
   & "C:\Users\LEGION\AppData\Local\Programs\Python\Python314\python.exe" -m uvicorn main:app --reload --port 8000
   ```

📍 **Sau khi chạy thành công:**

- Trang tài liệu **Swagger API Docs tương tác**: 👉 **[http://localhost:8000/docs](http://localhost:8000/docs)**
- Trang kiểm tra trạng thái **Telemetry Health Check**: 👉 **[http://localhost:8000/health](http://localhost:8000/health)**

---

## 2️⃣ BƯỚC 2: KHỞI ĐỘNG FRONTEND NEXT.JS (PORT 3000)

1. Mở một cửa sổ **PowerShell** hoặc **Terminal** thứ hai.
2. Di chuyển vào thư mục `frontend`:
   ```powershell
   cd "d:\Đại học\Thực tập nghề nghiệp\NovaThesis\frontend"
   ```
3. Chạy lệnh khởi động Web App:
   ```powershell
   npm run dev
   ```

📍 **Sau khi chạy thành công:**

- Giao diện người dùng NovaThesis High-End UI: 👉 **[http://localhost:3000](http://localhost:3000)**

---

## 🛑 3️⃣ BƯỚC 3: CÁCH DỪNG / KILL TOÀN BỘ FRONTEND VÀ BACKEND

Khi bạn muốn tắt hoặc giải phóng tất cả các cổng `3000` và `8000`, bạn có thể thực hiện theo một trong 2 cách sau:

### Cách 1: Dùng PowerShell (Khuyên dùng)

Mở PowerShell và dán lệnh sau:

```powershell
Get-Process -Name node, python -ErrorAction SilentlyContinue | Stop-Process -Force
```

### Cách 2: Dùng Command Prompt (CMD)

Mở CMD và dán 2 lệnh sau:

```cmd
taskkill /F /IM node.exe
taskkill /F /IM python.exe
```

---

## 🔑 4️⃣ TÀI KHOẢN ĐĂNG NHẬP DÙNG THỬ (MOCK USERS)

| Vai trò                                  | Email đăng nhập            | Mật khẩu chuẩn | Chức năng nổi bật                                     |
| ----------------------------------------- | ----------------------------- | ----------------- | --------------------------------------------------------- |
| **Tài khoản cá nhân của bạn** | `khoapdeptrai07@gmail.com`  | `Khoa132547698` | Đã đăng ký sẵn                                      |
| **Quản trị viên (Admin)**        | `admin@novathesis.edu.vn`   | `Admin123456`   | Quản lý users, System Logs, Configs                     |
| **Sinh viên (Student)**            | `student@novathesis.edu.vn` | `Student123456` | Nộp Đề xuất, Bằng chứng Milestone, Chat với AI RAG |

---

## 🗄️ 5️⃣ NÂNG CAO: KẾT NỐI POSTGRESQL + PGVECTOR QUA DOCKER (TÙY CHỌN)

Backend hiện tại đã có sẵn bộ dữ liệu mẫu (Mock Fallback) nên **chạy ngay được không bắt buộc cài DB**.

Nếu bạn muốn chạy với Cơ sở dữ liệu PostgreSQL thực tế hỗ trợ tìm kiếm Vector:

1. Mở Terminal tại thư mục `NovaThesis`:
   ```powershell
   docker-compose up -d
   ```
2. Hệ thống sẽ tự động khởi tạo Container PostgreSQL chạy tại cổng `5432` tích hợp sẵn extension `pgvector`.

---

## 🛠️ TỔNG HỢP CÁC TRANG CHỨC NĂNG DỰ ÁN

- 🏠 **Dashboard**: [http://localhost:3000/dashboard](http://localhost:3000/dashboard)
- 🎓 **Quản lý Đề tài (UC 3.1-3.14)**: [http://localhost:3000/theses](http://localhost:3000/theses)
- 📋 **Quản lý Milestone & Kanban (UC 4.1-4.15)**: [http://localhost:3000/milestones](http://localhost:3000/milestones)
- 📂 **Kho Tài liệu & Vector (UC 5.1-5.10)**: [http://localhost:3000/documents](http://localhost:3000/documents)
- 🤖 **Trợ lý AI RAG Chat & Vector Search (UC 6.1-6.14)**: [http://localhost:3000/ai-chat](http://localhost:3000/ai-chat)
- 💬 **Bình luận & Phản hồi (UC 7.1-7.8)**: [http://localhost:3000/feedbacks](http://localhost:3000/feedbacks)
- 🔔 **Thông báo (UC 8.1-8.8)**: [http://localhost:3000/notifications](http://localhost:3000/notifications)
- 📊 **Báo cáo & Export Excel/CSV (UC 9.1-9.4)**: [http://localhost:3000/reports](http://localhost:3000/reports)
- ⚙️ **Admin Management (UC 2.1-2.9)**: [http://localhost:3000/admin/users](http://localhost:3000/admin/users)

# 🖥️ NOVATHESIS – SƠ ĐỒ LUỒNG MÀN HÌNH THEO ACTOR (SCREEN TREE FLOW)

> **Dự án**: NovaThesis – Hệ thống Quản lý Luận văn & Đề tài Tích hợp AI
> **Tài liệu**: Sơ đồ Phân cấp Luồng Màn hình (Screen Tree Flow Diagram)
> **Định dạng**: Chuẩn hóa 100% Mermaid syntax tương thích hoàn toàn với **Draw.io (diagrams.net)** và **GitHub Markdown**

---

## 📌 HƯỚNG DẪN COPY VÀO DRAW.IO KHÔNG BỊ LỖI

1. Truy cập [draw.io](https://app.diagrams.net/)
2. Vào menu **Arrange** -> **Insert** -> **Advanced** -> **Mermaid** (hoặc bấm phím **Ctrl + Shift + M**)
3. Copy đoạn mã Mermaid bên dưới và dán vào ô nhập liệu
4. Bấm nút **Insert**

---

## 1. 👨‍🎓 LUỒNG MÀN HÌNH SINH VIÊN (STUDENT SCREEN FLOW)

### 🌳 1.1 Sơ đồ Cây Phân cấp Màn hình (ASCII Tree)

```text
└── 🏠 [S0. Trang công khai / Landing Page (`/`)]
    └── 🔐 [S0.1 Sheet Đăng nhập / Đăng ký (`AuthSheet`)]
        └── 📊 [S1. Dashboard Sinh viên (`/dashboard`)]
            ├── 📁 [S2. Quản lý Đề tài (`/theses`)]
            │   ├── 📄 [S2.1 Màn hình Danh sách đề tài]
            │   ├── 🔲 [S2.2 Modal Tạo đề tài mới]
            │   └── 🖥️ [S2.3 Màn hình Chi tiết đề tài (`/theses/[id]`)]
            │       ├── 📌 [Tab S2.3.1: Thông tin đề tài & SV/GVHD]
            │       ├── 📌 [Tab S2.3.2: Lộ trình & Milestone]
            │       ├── 📌 [Tab S2.3.3: Danh sách Tài liệu]
            │       ├── 📌 [Tab S2.3.4: Bình luận & Phản hồi]
            │       └── 📌 [Tab S2.3.5: Trợ lý AI Hỏi đáp]
            ├── 📅 [S3. Quản lý Milestone (`/milestones`)]
            │   ├── 📊 [S3.1 Màn hình Kanban Board]
            │   ├── 📈 [S3.2 Màn hình Biểu đồ Gantt]
            │   ├── 🔲 [S3.3 Modal Nộp sản phẩm & Đính kèm file]
            │   └── 🔲 [S3.4 Modal Xin gia hạn deadline]
            ├── 📄 [S4. Kho Tài liệu (`/documents`)]
            │   ├── 📥 [S4.1 Màn hình Tải lên & Quản lý file]
            │   └── 🔍 [S4.2 Modal Preview PDF/Word & Status AI]
            ├── 🤖 [S5. Trợ lý AI Assistant (`/ai-chat`)]
            │   ├── 💬 [S5.1 Màn hình Chat RAG (Streaming SSE)]
            │   ├── 📌 [S5.2 Popover Trích dẫn Nguồn (Citations)]
            │   ├── 🔍 [S5.3 Tab Kiểm tra Đạo văn / Trùng lặp]
            │   └── 💡 [S5.4 Tab Nhận Gợi ý Lộ trình Nhiệm vụ]
            ├── 🔔 [S6. Thông báo (`/notifications`)]
            │   ├── 🛎️ [S6.1 Dropdown Panel Chuông thông báo]
            │   └── ⚙️ [S6.2 Màn hình Cài đặt Loại thông báo]
            └── 👤 [S7. Hồ sơ cá nhân (`/profile`)]
                └── 🔑 [S7.1 Màn hình Đổi mật khẩu & Cập nhật thông tin]
```

### 🎨 1.2 Sơ đồ Mermaid Draw.io (Sinh viên)

```mermaid
graph TD
    S0["Trang chu Landing Page"] --> S_Auth["Form Dang Nhap - Dang Ky"]
    S_Auth --> S1["Dashboard Sinh Vien"]

    S1 --> S2["Quan ly De tai"]
    S1 --> S3["Quan ly Milestone"]
    S1 --> S4["Kho Tai lieu"]
    S1 --> S5["Tro ly AI"]
    S1 --> S6["Thong bao"]
    S1 --> S7["Ho so ca nhan"]

    S2 --> S2_1["Danh sach De tai"]
    S2_1 -->|Tao moi| S2_2["Modal Tao De tai"]
    S2_1 -->|Xem chi tiet| S2_3["Chi tiet De tai"]
    S2_3 --> T2_1["Tab Thong tin De tai"]
    S2_3 --> T2_2["Tab Lo trinh Milestone"]
    S2_3 --> T2_3["Tab Danh sach Tai lieu"]
    S2_3 --> T2_4["Tab Binh luan - Phan hoi"]
    S2_3 --> T2_5["Tab Tro ly AI Hoi dap"]

    S3 --> S3_1["Mien Kanban Board"]
    S3 --> S3_2["Bieu do Gantt"]
    S3_1 -->|Nop bai| S3_3["Modal Nop san pham - Up file"]
    S3_1 -->|Gia han| S3_4["Modal Xin gia han Deadline"]

    S4 --> S4_1["Danh sach Tai lieu"]
    S4_1 -->|Xem file| S4_2["Modal Xem Tep PDF - Word"]

    S5 --> S5_1["Chat RAG Hoi dap AI"]
    S5_1 -->|Xem nguon| S5_2["Popover Trich dan Citations"]
    S5 --> S5_3["Tab Kiem tra Dao van"]
    S5 --> S5_4["Tab Goi y Lo trinh AI"]

    S6 --> S6_1["Panel Chuong Thong bao"]
    S6 --> S6_2["Cai dat Loai Thong bao"]
```

---

## 2. 👨‍🏫 LUỒNG MÀN HÌNH GIẢNG VIÊN HƯỚNG DẪN (LECTURER SCREEN FLOW)

### 🌳 2.1 Sơ đồ Cây Phân cấp Màn hình (ASCII Tree)

```text
└── 🏠 [L0. Trang công khai / Landing Page (`/`)]
    └── 🔐 [L0.1 Sheet Đăng nhập Giảng viên (`AuthSheet`)]
        └── 📊 [L1. Dashboard Giảng viên (`/dashboard`)]
            ├── 📋 [L2. Quản lý Duyệt Đề tài (`/theses`)]
            │   ├── 📄 [L2.1 Màn hình Danh sách đề tài hướng dẫn]
            │   ├── ⏳ [L2.2 Màn hình Danh sách đề tài chờ duyệt]
            │   └── 🖥️ [L2.3 Màn hình Duyệt đề tài chi tiết]
            │       ├── 🔲 [Modal L2.3.1: Nút Phê duyệt đề tài]
            │       ├── 🔲 [Modal L2.3.2: Popup Yêu cầu sửa đổi]
            │       └── 🔲 [Modal L2.3.3: Popup Từ chối đề tài]
            ├── 📅 [L3. Theo dõi Tiến độ Milestone (`/milestones`)]
            │   ├── 📊 [L3.1 Màn hình Kanban xem bài nộp SV]
            │   ├── 🔲 [L3.2 Modal Phê duyệt đạt Milestone]
            │   ├── 🔲 [L3.3 Modal Yêu cầu nộp lại Milestone]
            │   └── 🔲 [L3.4 Modal Duyệt gia hạn deadline]
            ├── 💬 [L4. Phản hồi & Đánh giá (`/feedbacks`)]
            │   ├── ✍️ [L4.1 Khung bình luận trực tiếp trên Milestone/Tài liệu]
            │   ├── 📎 [L4.2 Modal Đính kèm file phản hồi]
            │   └── ✅ [L4.3 Nút Đánh dấu Đã giải quyết (Resolve)]
            ├── 🤖 [L5. Trợ lý AI Hỗ trợ Giảng viên (`/ai-chat`)]
            │   ├── 💬 [L5.1 Màn hình Hỏi đáp RAG tài liệu sinh viên]
            │   └── 🔍 [L5.2 Màn hình Đối soát & Kiểm tra đạo văn]
            ├── 📊 [L6. Báo cáo & Thống kê Tiến độ (`/reports`)]
            │   ├── 📉 [L6.1 Màn hình Biểu đồ Tiến độ tổng thể SV]
            │   └── 📥 [L6.2 Nút Xuất file Báo cáo PDF / Excel]
            └── 🔔 [L7. Panel Thông báo & Cài đặt (`/notifications`)]
```

### 🎨 2.2 Sơ đồ Mermaid Draw.io (Giảng viên)

```mermaid
graph TD
    L0["Trang chu Landing Page"] --> LAuth["Dang Nhap Giang Vien"]
    LAuth --> L1["Dashboard Giang Vien"]

    L1 --> L2["Quan ly De tai"]
    L1 --> L3["Theo doi Tien do Milestone"]
    L1 --> L4["Phan hoi - Binh luan"]
    L1 --> L5["Tro ly AI Support"]
    L1 --> L6["Bao cao - Thong ke"]

    L2 --> L2_1["Danh sach De tai Huong dan"]
    L2 --> L2_2["Danh sach De tai Cho duyat"]
    L2_2 -->|Xem chi tiet| L2_3["Man hinh Duyet De tai"]
    L2_3 -->|Phe duyet| M_Approve["Modal Phe duyet De tai"]
    L2_3 -->|Yeu cau sua| M_Edit["Popup Yeu cau Chinh sua"]
    L2_3 -->|Tu choi| M_Reject["Popup Tu choi De tai"]

    L3 --> L3_1["Kanban Bai nop Sinh vien"]
    L3_1 -->|Duyet| M_MApprove["Modal Phe duyet Milestone"]
    L3_1 -->|Yeu cau sua| M_MRejection["Modal Yeu cau Nop lai"]
    L3_1 -->|Gia han| M_ExtApprove["Modal Duyet Gia han"]

    L4 --> L4_1["Khung Binh luan 3 Cap"]
    L4_1 --> L4_2["Upload File Dinh kem"]
    L4_1 --> L4_3["Nut Resolve Thread"]

    L5 --> L5_1["Hoi dap RAG Tai lieu SV"]
    L5 --> L5_2["Kiem tra Dao van Vector"]

    L6 --> L6_1["Bieu do Tien do SV"]
    L6_1 --> L6_2["Xuat File PDF - Excel"]
```

---

## 3. 👨‍💼 LUỒNG MÀN HÌNH QUẢN TRỊ VIÊN (ADMIN SCREEN FLOW)

### 🌳 3.1 Sơ đồ Cây Phân cấp Màn hình (ASCII Tree)

```text
└── 🏠 [A0. Trang công khai / Landing Page (`/`)]
    └── 🔐 [A0.1 Sheet Đăng nhập Quản trị viên (`AuthSheet`)]
        └── 🖥️ [A1. Dashboard Quản trị Hệ thống (`/admin`)]
            ├── 👥 [A2. Quản lý Tài khoản (`/admin/users`)]
            │   ├── 📄 [A2.1 Màn hình Danh sách Người dùng (SV, GV, Admin)]
            │   ├── 🔲 [A2.2 Modal Tạo Tài khoản / Import Excel]
            │   ├── 🔲 [A2.3 Modal Chỉnh sửa & Reset mật khẩu]
            │   └── 🔲 [A2.4 Modal Vô hiệu hóa / Khôi phục tài khoản]
            ├── 📅 [A3. Quản lý Năm học & Đợt Đề tài (`/admin/academic-years`)]
            │   ├── 📝 [A3.1 Màn hình Danh sách Năm học & Đợt đợt làm luận văn]
            │   └── 🔲 [A3.2 Modal Cấu hình Thời gian đăng ký đề tài]
            ├── 🔗 [A4. Phân công & Gán Giảng viên (`/admin/theses/assign`)]
            │   └── 🔲 [A4.1 Modal Gán GVHD cho Đề tài chưa có người hướng dẫn]
            ├── 🤖 [A5. Thống kê Hoạt động AI (`/admin/ai-stats`)]
            │   └── 📊 [A5.1 Dashboard Token, lượt gọi API, Rating tốt/xấu]
            └── 📜 [A6. Nhật ký Hệ thống & Settings (`/admin/logs`)]
                ├── 📋 [A6.1 Màn hình Xem System Logs]
                └── ⚙️ [A6.2 Màn hình Cấu hình tham số Hệ thống]
```

### 🎨 3.2 Sơ đồ Mermaid Draw.io (Admin)

```mermaid
graph TD
    A0["Trang chu Landing Page"] --> AAuth["Dang Nhap Admin"]
    AAuth --> A1["Dashboard Admin"]

    A1 --> A2["Quan ly Tai khoan"]
    A1 --> A3["Quan ly Nam hoc"]
    A1 --> A4["Phan cong Giang vien"]
    A1 --> A5["Thong ke AI"]
    A1 --> A6["System Logs - Settings"]

    A2 --> A2_1["Danh sach Tai khoan"]
    A2_1 --> A2_2["Modal Tao Moi - Import CSV"]
    A2_1 --> A2_3["Modal Chinh sua - Reset Pass"]
    A2_1 --> A2_4["Modal Khoa - Khoi phuc"]

    A3 --> A3_1["Man hinh Dot De tai"]
    A3_1 --> A3_2["Modal Tao Nam hoc Moi"]

    A4 --> A4_1["Modal Gan GVHD Cho De tai"]

    A5 --> A5_1["Dashboard Tokens - API Usage"]

    A6 --> A6_1["Man hinh Log He thong"]
    A6 --> A6_2["Man hinh Cau hinh Tham so"]
```

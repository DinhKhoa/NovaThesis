# 📋 NOVATHESIS – ĐẶC TẢ USE CASE TOÀN HỆ THỐNG

> **Hệ thống**: NovaThesis – Hệ thống quản lý luận văn và đề tài nghiên cứu tích hợp AI hỗ trợ học thuật
> **Đơn vị**: Trường Đại học Kinh tế – Đại học Đà Nẵng
> **Phiên bản**: 1.0 | **Ngày lập**: 07/2026

---

## I. DANH SÁCH ACTORS

| Actor | Loại | Mô tả |
|-------|------|-------|
| **Sinh viên** | Primary | Người thực hiện đề tài. Tạo đề tài, cập nhật milestone, upload tài liệu, sử dụng các tính năng AI hỗ trợ. |
| **Giảng viên hướng dẫn** | Primary | Người hướng dẫn nghiên cứu. Duyệt đề tài, phê duyệt milestone, phản hồi tài liệu, xem Dashboard. |
| **Quản trị viên (Admin)** | Primary | Người quản lý hệ thống. Quản lý tài khoản, cấu hình hệ thống, xem thống kê. |
| **Hệ thống AI** | Secondary | Xử lý embedding, tóm tắt, RAG, đề xuất lộ trình. Được gọi tự động hoặc theo yêu cầu người dùng. |
| **Scheduler (Cron Job)** | Secondary | Hệ thống lập lịch nội bộ. Kích hoạt nhắc nhở deadline, kiểm tra milestone quá hạn. |
| **Email Service** | Secondary | Dịch vụ gửi email (Nodemailer). Gửi thông báo, xác minh tài khoản, reset mật khẩu. |

---

## II. SƠ ĐỒ USE CASE TỔNG QUÁT – TOÀN HỆ THỐNG

```mermaid
graph TB
    SV((Sinh viên))
    GV((Giảng viên\nhướng dẫn))
    AD((Admin))
    AI((Hệ thống AI))
    SC((Scheduler))
    EM((Email Service))

    subgraph M1["🔐 Module 1: Xác thực & Tài khoản"]
        UC11["1.1 Đăng nhập"]
        UC12["1.2 Đăng ký"]
        UC13["1.3 Đăng xuất"]
        UC14["1.4 Xác minh email"]
        UC15["1.5 Quên mật khẩu"]
        UC16["1.6 Đặt lại mật khẩu"]
        UC17["1.7 Đổi mật khẩu"]
        UC18["1.8 Quản lý hồ sơ cá nhân"]
    end

    subgraph M2["👑 Module 2: Quản trị Admin"]
        UC21["2.1 Xem ds tài khoản"]
        UC22["2.2 Tạo tài khoản"]
        UC23["2.3 Chỉnh sửa tài khoản"]
        UC24["2.4 Vô hiệu hóa/Khôi phục"]
        UC25["2.5 Phân quyền"]
        UC26["2.6 Xem thống kê"]
        UC27["2.7 Quản lý năm học"]
        UC28["2.8 Xem log"]
        UC29["2.9 Cấu hình hệ thống"]
    end

    subgraph M3["📁 Module 3: Quản lý Đề tài"]
        UC31["3.1 Tạo đề tài"]
        UC32["3.2 Xem ds đề tài (SV)"]
        UC33["3.3 Xem ds đề tài (GV)"]
        UC34["3.4 Xem chi tiết"]
        UC35["3.5 Chỉnh sửa đề tài"]
        UC36["3.6 Xóa đề tài nháp"]
        UC37["3.7 Gửi duyệt"]
        UC38["3.8 Xem ds cần duyệt"]
        UC39["3.9 Phê duyệt"]
        UC310["3.10 Yêu cầu sửa"]
        UC311["3.11 Từ chối"]
        UC312["3.12 Gán GV hướng dẫn"]
        UC313["3.13 Đánh dấu hoàn thành"]
        UC314["3.14 Tìm kiếm/Lọc"]
    end

    subgraph M4["📅 Module 4: Quản lý Milestone"]
        UC41["4.1 Tạo milestone"]
        UC42["4.2 Xem ds milestone"]
        UC43["4.3 Xem chi tiết"]
        UC44["4.4 Chỉnh sửa milestone"]
        UC45["4.5 Xóa milestone"]
        UC46["4.6 Đặt/Sửa deadline"]
        UC47["4.7 Gia hạn deadline"]
        UC48["4.8 Cập nhật trạng thái"]
        UC49["4.9 Đính kèm file"]
        UC410["4.10 GV phê duyệt milestone"]
        UC411["4.11 GV yêu cầu sửa milestone"]
        UC412["4.12 Xem lịch sử"]
        UC413["4.13 Dashboard SV"]
        UC414["4.14 Dashboard GV"]
        UC415["4.15 Xuất báo cáo PDF"]
    end

    subgraph M5["📄 Module 5: Quản lý Tài liệu"]
        UC51["5.1 Upload tài liệu"]
        UC52["5.2 Xem ds tài liệu"]
        UC53["5.3 Preview tài liệu"]
        UC54["5.4 Download"]
        UC55["5.5 Xóa tài liệu"]
        UC56["5.6 Chỉnh sửa metadata"]
        UC57["5.7 Gắn thẻ/Phân loại"]
        UC58["5.8 Tìm kiếm từ khóa"]
        UC59["5.9 Xem trạng thái AI"]
        UC510["5.10 Chia sẻ tài liệu"]
    end

    subgraph M6["🤖 Module 6: Hỗ trợ AI"]
        UC61["6.1 Tóm tắt tự động"]
        UC62["6.2 Tóm tắt lại"]
        UC63["6.3 Ghi chú tóm tắt"]
        UC64["6.4 Semantic Search"]
        UC65["6.5 Hỏi đáp RAG"]
        UC66["6.6 Xem citations"]
        UC67["6.7 Xem lịch sử chat AI"]
        UC68["6.8 Xóa lịch sử chat"]
        UC69["6.9 Đánh giá AI"]
        UC610["6.10 Đề xuất lộ trình"]
        UC611["6.11 Xử lý gợi ý lộ trình AI"]
    end

    subgraph M7["💬 Module 7: Trao đổi & Phản hồi"]
        UC71["7.1 GV phản hồi milestone"]
        UC72["7.2 GV phản hồi tài liệu"]
        UC73["7.3 SV trả lời phản hồi"]
        UC74["7.4 Chỉnh sửa phản hồi"]
        UC75["7.5 Xóa phản hồi"]
        UC76["7.6 Resolve comment"]
        UC77["7.7 Đính kèm file phản hồi"]
        UC78["7.8 Xem lịch sử phản hồi"]
    end

    subgraph M8["🔔 Module 8: Thông báo"]
        UC81["8.1 Thông báo in-app"]
        UC82["8.2 Thông báo email"]
        UC83["8.3 Xem ds thông báo"]
        UC84["8.4 Đánh dấu đã đọc"]
        UC85["8.5 Đánh dấu tất cả đã đọc"]
        UC86["8.6 Xóa thông báo"]
        UC87["8.7 Cài đặt thông báo"]
        UC88["8.8 Nhắc nhở deadline"]
    end

    subgraph M9["📊 Module 9: Báo cáo & Thống kê"]
        UC91["9.1 Xuất báo cáo tiến độ"]
        UC92["9.2 Xuất ds đề tài"]
        UC93["9.3 Thống kê AI"]
        UC94["9.4 Biểu đồ Gantt"]
    end

    SV --> M1
    SV --> M3
    SV --> M4
    SV --> M5
    SV --> M6
    SV --> M7
    SV --> M8
    SV --> M9

    GV --> M1
    GV --> M3
    GV --> M4
    GV --> M6
    GV --> M7
    GV --> M8
    GV --> M9

    AD --> M1
    AD --> M2
    AD --> M3
    AD --> M8
    AD --> M9

    AI --> M6
    SC --> M8
    EM --> M1
    EM --> M8
```

---

## III. BẢNG TỔNG HỢP USE CASE THEO MODULE

| Module | Số UC | Files |
|--------|-------|-------|
| 🔐 Module 1 – Xác thực & Tài khoản | 8 | [01_UC_Authentication.md](./01_UC_Authentication.md) |
| 👑 Module 2 – Quản trị Admin | 9 | [02_UC_Admin.md](./02_UC_Admin.md) |
| 📁 Module 3 – Quản lý Đề tài | 14 | [03_UC_Thesis.md](./03_UC_Thesis.md) |
| 📅 Module 4 – Quản lý Milestone | 15 | [04_UC_Milestone.md](./04_UC_Milestone.md) |
| 📄 Module 5 – Quản lý Tài liệu | 10 | [05_UC_Document.md](./05_UC_Document.md) |
| 🤖 Module 6 – Hỗ trợ AI | 11 | [06_UC_AI.md](./06_UC_AI.md) |
| 💬 Module 7 – Trao đổi & Phản hồi | 8 | [07_UC_Feedback.md](./07_UC_Feedback.md) |
| 🔔 Module 8 – Thông báo | 8 | [08_UC_Notification.md](./08_UC_Notification.md) |
| 📊 Module 9 – Báo cáo & Thống kê | 4 | [09_UC_Report.md](./09_UC_Report.md) |
| **Tổng** | **87** | |

---

## IV. BẢNG TỔNG HỢP UC THEO ACTOR

| Actor | Các UC liên quan |
|-------|-----------------|
| **Sinh viên** | 1.1–1.8, 3.1–3.7, 3.4, 3.14, 4.1–4.9, 4.12–4.13, 4.15, 5.1–5.10, 6.1–6.11, 7.3–7.5, 7.7–7.8, 8.1–8.7, 9.1, 9.4 |
| **Giảng viên hướng dẫn** | 1.1–1.8, 3.3–3.4, 3.8–3.14, 4.2–4.3, 4.6–4.7, 4.10–4.15, 5.2–5.4, 6.4–6.9, 7.1–7.2, 7.4–7.8, 8.1–8.7, 9.1–9.2, 9.4 |
| **Admin** | 1.1–1.3, 1.7–1.8, 2.1–2.9, 3.12–3.14, 8.1–8.7, 9.1–9.3 |
| **Hệ thống AI** | 6.1, 6.4, 6.5, 6.10–6.11 |
| **Scheduler** | 8.8 |
| **Email Service** | 1.2, 1.4, 1.5, 8.2 |

---

## V. SƠ ĐỒ QUAN HỆ GIỮA CÁC MODULE

```mermaid
graph LR
    M1["🔐 Xác thực\n& Tài khoản"] --> M3["📁 Quản lý\nĐề tài"]
    M3 --> M4["📅 Quản lý\nMilestone"]
    M3 --> M5["📄 Quản lý\nTài liệu"]
    M4 --> M6["🤖 Hỗ trợ AI"]
    M5 --> M6
    M4 --> M7["💬 Trao đổi\n& Phản hồi"]
    M5 --> M7
    M3 --> M8["🔔 Thông báo"]
    M4 --> M8
    M7 --> M8
    M4 --> M9["📊 Báo cáo\n& Thống kê"]
    M6 --> M9
    M2["👑 Quản trị\nAdmin"] --> M1
    M2 --> M3

    style M1 fill:#4A90D9,color:#fff
    style M2 fill:#E74C3C,color:#fff
    style M3 fill:#27AE60,color:#fff
    style M4 fill:#F39C12,color:#fff
    style M5 fill:#8E44AD,color:#fff
    style M6 fill:#16A085,color:#fff
    style M7 fill:#D35400,color:#fff
    style M8 fill:#2980B9,color:#fff
    style M9 fill:#C0392B,color:#fff
```

---

*Tài liệu này được tạo tự động. Xem chi tiết từng module trong các file con.*

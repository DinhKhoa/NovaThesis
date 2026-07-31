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

# Yêu cầu cho dự án NovaThesis

## 1. Yêu cầu cốt lõi

- Xây dựng được Security tốt
- Giao diện không bị AI Slop
- Tích hợp AI (sử dụng PostgreSQL + pgvector)
- Có thể ứng dụng tư duy/kiến thức từ Firmware Engineering

## 2. Chi tiết triển khai đề xuất

### 2.1. Đề xuất cho Yêu cầu "Security tốt"

Đối với một hệ thống quản lý luận văn, bảo mật cần được thiết kế từ kiến trúc lõi (Security by Design):

- **Xác thực và Phân quyền (Authentication & Authorization):**
  - Sử dụng **OAuth 2.0 / OpenID Connect** (tích hợp đăng nhập Google Workspace/Microsoft của trường).
  - **RBAC (Role-Based Access Control):** Phân quyền chặt chẽ (Admin, Giảng viên, Sinh viên).
- **Bảo mật Dữ liệu (Data Security):**
  - **Mã hóa dữ liệu:** Hash mật khẩu bằng thuật toán mạnh (Argon2, bcrypt).
  - **Bảo vệ tài liệu:** File luận văn lưu trữ ở private bucket, truy cập bằng Signed URL.
- **Chống lỗ hổng (OWASP Top 10):**
  - **Input Validation & Sanitization:** Luôn kiểm tra và làm sạch dữ liệu đầu vào từ người dùng (ở cả Client-side và Server-side) trước khi xử lý.
  - Chống XSS & CSRF bằng Anti-CSRF tokens.
  - Chống SQL Injection qua ORM/Parameterized Queries.
- **Quản lý Secrets (Secret Management):** Tuyệt đối không hardcode API Keys, Database Credentials hay JWT Secrets trong source code. Phải sử dụng file `.env` (và đưa vào `.gitignore`) hoặc các dịch vụ Secret Manager chuyên dụng.
- **Bảo mật AI & Vector DB:**
  - **Chống Prompt Injection:** Validate input của người dùng trước khi đưa vào LLM.
  - **Tenant Isolation trong pgvector:** Đảm bảo khi thực hiện similarity search, scope tìm kiếm phải giới hạn trong những tài liệu mà user đó có quyền truy cập.

### 2.2. Đề xuất cho Yêu cầu "Giao diện không bị AI Slop"

Tránh các UI bóng bẩy nhưng thiếu thực tế, rỗng tuếch, hoặc quá nhiều khoảng trắng vô nghĩa:

- **Design System Custom & Nhất quán:** Sử dụng framework như TailwindCSS/Shadcn UI nhưng phải tinh chỉnh thủ công theme, typography, không dùng template chung chung.
- **UX tập trung vào Công năng (Function-driven UX):**
  - Ưu tiên **Data Density** (mật độ dữ liệu hiển thị tốt) thay vì các UI cards quá to.
  - Sử dụng Data Tables có filter, sort, pagination thực tế.
- **Giao diện tương tác AI (AI-Native UI):**
  - Cung cấp trải nghiệm **Streaming text** mượt mà khi AI trả lời.
  - Luôn hiển thị rõ **Trích dẫn (Citations/Sources)** để người dùng biết AI lấy thông tin từ đoạn nào của luận văn nào, tăng độ tin cậy.

### 2.3. Đề xuất về AI & pgvector

- **Tìm kiếm ngữ nghĩa (Semantic Search):** Thay vì search luận văn bằng từ khóa (LIKE %keyword%), sinh viên có thể search bằng ngôn ngữ tự nhiên (VD: "Các đề tài về học máy trong y tế").
- **Hệ thống RAG (Retrieval-Augmented Generation):** Người dùng có thể "Chat với luận văn". AI sẽ đọc các chunk text được vector hóa trong `pgvector` và tổng hợp câu trả lời dựa trên nội dung thực tế của sinh viên khóa trước.

### 2.4. Ứng dụng tư duy Firmware vào dự án Web/AI

Mặc dù là dự án Web, các pattern mạnh mẽ trong Firmware hoàn toàn có thể áp dụng để tăng tính ổn định:

- **Finite State Machine (FSM):**
- - Áp dụng FSM để quản lý luồng trạng thái của luận văn (Draft -> Pending Review -> Defending -> Approved -> Published). Mọi sự chuyển đổi trạng thái (state transition) đều phải được kiểm tra điều kiện nghiêm ngặt giống như FSM trong hệ thống nhúng.
- **Watchdog & Background Workers (Interrupt-driven mindset):**
  - Việc đọc file PDF và vector hóa (embedding) để lưu vào `pgvector` là tác vụ rất nặng. Nó phải được chạy ngầm (Background Job/Message Queue). Có thể thiết kế cơ chế giống **Watchdog Timer**: Nếu một worker bị treo quá thời gian (timeout) khi đọc file PDF hỏng, hệ thống sẽ tự động kill và restart worker đó.
- **Tối ưu hóa Memory (Resource Constrained Thinking):**
  - Khi chia nhỏ (chunking) file PDF 100 trang để nhúng, hãy quản lý memory allocation thật kỹ (stream file thay vì load toàn bộ file vào RAM). Đây là mindset tiết kiệm từng byte RAM trên vi điều khiển được mang lên backend.
- **Telemetry & Health Diagnostics:**
  - Thay vì chỉ có "Error Log", hãy xây dựng các API Health Check theo thời gian thực (giám sát CPU, RAM, trạng thái DB Connection, Worker Queue) tương tự như việc đọc các thanh ghi trạng thái (status registers) hoặc sensor data cho Admin.

## 3. Các tính năng nghiệp vụ và Vận hành

### 3.1. Nghiệp vụ Quản lý Luận văn

- **Document Versioning (Quản lý phiên bản tài liệu):** Luận văn thường trải qua nhiều lần sửa đổi (Draft v1, Draft v2, Final). Cần thiết kế DB để lưu trữ nhiều phiên bản của cùng một đề tài thay vì ghi đè file cũ.

### 3.2. Vận hành & DevOps (Bắt buộc cho Web App)

- **CI/CD Pipeline:** Tương tự như HIL (Hardware-in-the-loop) testing trong firmware, Web App cần thiết lập GitHub Actions hoặc GitLab CI để tự động chạy Unit Test, Linting và Build mỗi khi có code mới.

### 3.3. Chất lượng Code & Hiệu năng (Code Quality & Performance)

- **Non-blocking I/O & Bắt buộc dùng Async/Await:** Không bao giờ được để các tác vụ gọi DB, đọc file hoặc gọi API AI làm block thread chính (giống như việc không được dùng vòng lặp `while(1)` chờ trong hàm ngắt/ISR ở firmware). Sử dụng triệt để `async/await` để server có thể xử lý hàng ngàn request cùng lúc mà không bị treo.
- **Tránh lỗi Query N + 1:** Đây là "sát thủ" hiệu năng của Web App dùng ORM. Bắt buộc dùng Eager Loading (JOIN/SelectRelated/Include) khi truy vấn các dữ liệu có quan hệ (ví dụ: lấy danh sách luận văn kèm theo tên giáo viên hướng dẫn).
- **Tránh vòng lặp lồng nhau vô ích:** Tối ưu hóa độ phức tạp thuật toán. Thay vì dùng 2 vòng `for` lồng nhau ($O(N^2)$) để đối chiếu dữ liệu, hãy sử dụng Hash Map (Dictionary/Object) để đưa về $O(N)$.
- **Kiểm soát Memory Leak âm thầm:** Đảm bảo luôn đóng kết nối Database (hoặc dùng Connection Pool chuẩn), giải phóng các file streams, và cẩn thận với các closure/event listeners bị rò rỉ trong quá trình chạy thời gian dài.
- **KISS (Keep It Simple, Stupid) - Tránh Over-engineering:** Tuyệt đối không làm phức tạp hóa những yêu cầu đơn giản. Việc "lạm dụng" Design Pattern hoặc chia tầng kiến trúc (layers) quá rườm rà không những làm phần mềm chạy chậm đi mà còn gây khó khăn cực lớn cho việc bảo trì.


## 4. Đề xuất Tech Stack

- **Backend:** Spring Boot (Java), NestJS (Node.js), FastAPI (Python - cực kỳ phù hợp vì dễ tích hợp AI).
- **Frontend:** Next.js (React).
- **Database:** PostgreSQL (bắt buộc cài thêm extension `pgvector`).

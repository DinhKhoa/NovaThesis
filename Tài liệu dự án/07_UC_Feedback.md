# MODULE 7 – TRAO ĐỔI & PHẢN HỒI

> Module quản lý các chức năng trao đổi, bình luận, và phản hồi giữa giảng viên hướng dẫn và sinh viên trên các milestone và tài liệu của đề tài.

## Sơ đồ Use Case

```mermaid
graph LR
    GV((Giảng viên))
    SV((Sinh viên))
    
    UC71(7.1 Thêm phản hồi lên milestone)
    UC72(7.2 Thêm phản hồi lên tài liệu)
    UC73(7.3 Trả lời phản hồi)
    UC74(7.4 Chỉnh sửa phản hồi)
    UC75(7.5 Xóa phản hồi)
    UC76(7.6 Đánh dấu phản hồi đã giải quyết)
    UC77(7.7 Đính kèm file vào phản hồi)
    UC78(7.8 Xem lịch sử phản hồi)

    GV --> UC71
    GV --> UC72
    GV --> UC73
    SV --> UC73
    
    GV --> UC74
    SV --> UC74
    
    GV --> UC75
    SV --> UC75
    
    GV --> UC76
    
    GV --> UC77
    SV --> UC77
    
    GV --> UC78
    SV --> UC78
    
    UC71 ..-> UC77 : <<extend>>
    UC72 ..-> UC77 : <<extend>>
    UC73 ..-> UC77 : <<extend>>
```

---

### UC 7.1 – Giảng viên thêm phản hồi lên milestone

| Field | Content |
|-------|---------|
| **Use case ID** | 7.1 |
| **Use case name** | Giảng viên thêm phản hồi lên milestone |
| **Description** | Giảng viên hướng dẫn thêm các nhận xét, đánh giá hoặc yêu cầu chỉnh sửa trực tiếp vào một milestone cụ thể của sinh viên. |
| **Actors** | Giảng viên hướng dẫn (chính), Hệ thống (phụ) |
| **Priority** | Cao |
| **Triggers** | Giảng viên xem chi tiết một milestone và chọn chức năng thêm bình luận/phản hồi. |
| **Pre-conditions** | Giảng viên đã đăng nhập và đang xem milestone của sinh viên mình hướng dẫn. Milestone tồn tại trong hệ thống. |
| **Post-conditions** | Phản hồi được lưu trữ thành công, liên kết với milestone. Hệ thống gửi thông báo cho sinh viên. |
| **Business rules** | Giảng viên chỉ được phản hồi trên milestone của đề tài mình hướng dẫn. Có thể gắn thẻ (tag) loại phản hồi (vd: yêu cầu sửa, góp ý). |
| **Non-functional requirement** | Phản hồi phải hiển thị real-time cho sinh viên nếu đang online. Thời gian lưu phản hồi < 1s. |

**Main flow:**

| Bước | Thao tác |
|------|---------|
| 1 | Giảng viên truy cập vào chi tiết một milestone của đề tài. |
| 2 | Giảng viên nhập nội dung phản hồi vào ô nhập liệu ở phần bình luận của milestone. |
| 3 | Giảng viên nhấn nút "Gửi phản hồi". |
| 4 | Hệ thống kiểm tra tính hợp lệ của nội dung và quyền truy cập của giảng viên. |
| 5 | Hệ thống lưu phản hồi vào cơ sở dữ liệu. |
| 6 | Hệ thống hiển thị phản hồi vừa tạo lên giao diện milestone của giảng viên. |
| 7 | Hệ thống tự động gửi thông báo (notification/email) cho sinh viên sở hữu milestone. |

**Alternative flows:**

| Luồng | Điều kiện | Xử lý |
|-------|-----------|-------|
| 3a | Giảng viên muốn đính kèm file | Giảng viên thực hiện UC 7.7 trước khi nhấn "Gửi phản hồi". Quay lại bước 3. |

**Exception flows:**

| Luồng | Điều kiện | Xử lý |
|-------|-----------|-------|
| 4a | Nội dung phản hồi trống | Hệ thống báo lỗi "Nội dung phản hồi không được để trống" và vô hiệu hóa nút gửi. |
| 4b | Giảng viên không có quyền (không phải người hướng dẫn) | Hệ thống từ chối lưu, hiển thị thông báo "Bạn không có quyền phản hồi trên đề tài này". |

---

### UC 7.2 – Giảng viên thêm phản hồi lên tài liệu

| Field | Content |
|-------|---------|
| **Use case ID** | 7.2 |
| **Use case name** | Giảng viên thêm phản hồi lên tài liệu |
| **Description** | Giảng viên hướng dẫn thêm bình luận, nhận xét trực tiếp lên một tài liệu đã được sinh viên upload. |
| **Actors** | Giảng viên hướng dẫn (chính), Hệ thống (phụ) |
| **Priority** | Cao |
| **Triggers** | Giảng viên xem tài liệu và chọn chức năng nhận xét. |
| **Pre-conditions** | Giảng viên đã đăng nhập. Tài liệu đã được sinh viên tải lên hệ thống thành công. |
| **Post-conditions** | Phản hồi được lưu, liên kết với tài liệu tương ứng. Hệ thống thông báo cho sinh viên. |
| **Business rules** | Có thể comment chung cho tài liệu. Giảng viên chỉ nhận xét tài liệu thuộc đề tài mình quản lý. |
| **Non-functional requirement** | Giao diện không bị gián đoạn khi tải tài liệu và lưu comment. |

**Main flow:**

| Bước | Thao tác |
|------|---------|
| 1 | Giảng viên mở xem tài liệu đính kèm của một đề tài/milestone. |
| 2 | Giảng viên nhập nội dung nhận xét vào phần bình luận của tài liệu. |
| 3 | Giảng viên nhấn nút "Gửi". |
| 4 | Hệ thống xác thực quyền và kiểm tra nội dung. |
| 5 | Hệ thống lưu dữ liệu bình luận gắn với ID của tài liệu. |
| 6 | Hệ thống cập nhật danh sách bình luận trên giao diện. |
| 7 | Hệ thống gửi thông báo cho sinh viên liên quan. |

**Alternative flows:**

| Luồng | Điều kiện | Xử lý |
|-------|-----------|-------|
| 3a | Giảng viên thêm file đính kèm hỗ trợ sửa lỗi | Thực hiện UC 7.7. Sau đó quay lại bước 3. |

**Exception flows:**

| Luồng | Điều kiện | Xử lý |
|-------|-----------|-------|
| 4a | Tài liệu đã bị sinh viên xóa | Hệ thống báo lỗi "Tài liệu không còn tồn tại", refresh trang. |

---

### UC 7.3 – Sinh viên trả lời phản hồi của giảng viên

| Field | Content |
|-------|---------|
| **Use case ID** | 7.3 |
| **Use case name** | Sinh viên trả lời phản hồi của giảng viên |
| **Description** | Sinh viên xem phản hồi của giảng viên và tiến hành trả lời (reply) để trao đổi thêm thông tin. |
| **Actors** | Sinh viên (chính), Giảng viên (chính), Hệ thống (phụ) |
| **Priority** | Cao |
| **Triggers** | Sinh viên nhấn nút "Trả lời" (Reply) dưới một phản hồi của giảng viên. |
| **Pre-conditions** | Có ít nhất một phản hồi của giảng viên trên milestone/tài liệu. |
| **Post-conditions** | Câu trả lời của sinh viên được lưu dưới dạng thread comment. Hệ thống thông báo cho giảng viên. |
| **Business rules** | Thread comment tối đa 3 cấp. Sinh viên chỉ có thể reply trong đề tài của mình. |
| **Non-functional requirement** | UI hiển thị dạng cây (tree-view) rõ ràng. |

**Main flow:**

| Bước | Thao tác |
|------|---------|
| 1 | Sinh viên chọn một phản hồi cụ thể và nhấn "Trả lời". |
| 2 | Hệ thống hiển thị ô nhập liệu reply ngay dưới phản hồi được chọn. |
| 3 | Sinh viên nhập nội dung và nhấn "Gửi trả lời". |
| 4 | Hệ thống kiểm tra số cấp của thread (tối đa 3 cấp). |
| 5 | Hệ thống lưu reply vào CSDL, liên kết với ID của phản hồi cha. |
| 6 | Hệ thống hiển thị reply thụt lề dưới comment cha. |
| 7 | Hệ thống thông báo cho giảng viên đã tạo comment cha. |

**Alternative flows:**

| Luồng | Điều kiện | Xử lý |
|-------|-----------|-------|
| 1a | Giảng viên reply lại sinh viên | Các bước tương tự, giảng viên là người nhập liệu. Thông báo gửi lại cho sinh viên. |

**Exception flows:**

| Luồng | Điều kiện | Xử lý |
|-------|-----------|-------|
| 4a | Đạt giới hạn 3 cấp reply | Hệ thống vô hiệu hóa nút "Trả lời" trên các reply thuộc cấp thứ 3, hiển thị thông báo "Không thể reply quá 3 cấp". |

---

### UC 7.4 – Chỉnh sửa phản hồi / bình luận

| Field | Content |
|-------|---------|
| **Use case ID** | 7.4 |
| **Use case name** | Chỉnh sửa phản hồi / bình luận |
| **Description** | Người dùng (giảng viên hoặc sinh viên) thay đổi nội dung phản hồi/bình luận do chính mình tạo ra. |
| **Actors** | Giảng viên, Sinh viên |
| **Priority** | Trung bình |
| **Triggers** | Người dùng nhấn biểu tượng "Chỉnh sửa" trên bình luận của họ. |
| **Pre-conditions** | Bình luận được tạo trong vòng 15 phút. Người dùng là tác giả của bình luận đó. |
| **Post-conditions** | Nội dung mới được cập nhật, đánh dấu là "(Đã chỉnh sửa)". |
| **Business rules** | Chỉ được chỉnh sửa trong vòng 15 phút kể từ khi tạo. Không thể sửa bình luận của người khác. |
| **Non-functional requirement** | Cập nhật real-time trên giao diện. |

**Main flow:**

| Bước | Thao tác |
|------|---------|
| 1 | Người dùng chọn bình luận của mình và nhấn "Chỉnh sửa". |
| 2 | Hệ thống kiểm tra thời gian tạo bình luận có nằm trong giới hạn 15 phút hay không. |
| 3 | Hệ thống chuyển bình luận thành ô nhập liệu với nội dung cũ. |
| 4 | Người dùng sửa nội dung và nhấn "Lưu". |
| 5 | Hệ thống cập nhật nội dung vào cơ sở dữ liệu. |
| 6 | Hệ thống hiển thị bình luận mới với nhãn "(Đã chỉnh sửa)". |

**Alternative flows:**

| Luồng | Điều kiện | Xử lý |
|-------|-----------|-------|
| 4a | Người dùng nhấn "Hủy" | Hệ thống đóng ô nhập liệu, giữ nguyên bình luận cũ. |

**Exception flows:**

| Luồng | Điều kiện | Xử lý |
|-------|-----------|-------|
| 2a | Quá 15 phút kể từ lúc tạo | Hệ thống ẩn nút "Chỉnh sửa" hoặc thông báo "Đã hết thời gian chỉnh sửa". |

---

### UC 7.5 – Xóa phản hồi / bình luận

| Field | Content |
|-------|---------|
| **Use case ID** | 7.5 |
| **Use case name** | Xóa phản hồi / bình luận |
| **Description** | Người dùng xóa phản hồi/bình luận của mình khỏi hệ thống. |
| **Actors** | Giảng viên, Sinh viên |
| **Priority** | Trung bình |
| **Triggers** | Người dùng chọn "Xóa" trên bình luận của họ. |
| **Pre-conditions** | Người dùng là tác giả của bình luận. |
| **Post-conditions** | Bình luận bị xóa hoặc chuyển trạng thái ẩn nội dung. |
| **Business rules** | Nếu bình luận chưa có reply, xóa hoàn toàn. Nếu đã có reply, không xóa hoàn toàn mà đổi nội dung thành "[Bình luận đã bị xóa]" để giữ cấu trúc thread. |
| **Non-functional requirement** | Đảm bảo tính toàn vẹn dữ liệu của cây bình luận. |

**Main flow:**

| Bước | Thao tác |
|------|---------|
| 1 | Người dùng nhấn nút "Xóa" trên bình luận của mình. |
| 2 | Hệ thống hiển thị popup xác nhận: "Bạn có chắc muốn xóa bình luận này?". |
| 3 | Người dùng xác nhận "Đồng ý". |
| 4 | Hệ thống kiểm tra bình luận này đã có reply nào chưa. |
| 5 | (Trường hợp chưa có reply) Hệ thống xóa hoàn toàn bản ghi khỏi CSDL. |
| 6 | Hệ thống ẩn/xóa bình luận trên giao diện. |

**Alternative flows:**

| Luồng | Điều kiện | Xử lý |
|-------|-----------|-------|
| 4a | Bình luận đã có reply | Hệ thống cập nhật nội dung bình luận thành "[Bình luận đã bị xóa]", giữ nguyên tác giả và các reply con. Chuyển đến bước 6. |

**Exception flows:**

| Luồng | Điều kiện | Xử lý |
|-------|-----------|-------|
| 3a | Người dùng chọn "Hủy" | Hệ thống đóng popup, không thực hiện xóa. |

---

### UC 7.6 – Đánh dấu phản hồi đã giải quyết (Resolve comment)

| Field | Content |
|-------|---------|
| **Use case ID** | 7.6 |
| **Use case name** | Đánh dấu phản hồi đã giải quyết |
| **Description** | Giảng viên đánh dấu một luồng phản hồi/yêu cầu sửa đổi là "Đã giải quyết" sau khi sinh viên đã hoàn thiện theo yêu cầu. |
| **Actors** | Giảng viên hướng dẫn |
| **Priority** | Trung bình |
| **Triggers** | Giảng viên nhấn nút "Resolve" trên một thread phản hồi. |
| **Pre-conditions** | Phản hồi gốc do giảng viên tạo. Phản hồi đang ở trạng thái chưa resolve. |
| **Post-conditions** | Thread phản hồi chuyển sang trạng thái "Resolved" và bị thu gọn trên giao diện. |
| **Business rules** | Chỉ giảng viên tạo ra phản hồi gốc mới có quyền đánh dấu resolve. Sinh viên không có quyền này. |
| **Non-functional requirement** | Lưu lịch sử trạng thái resolve. |

**Main flow:**

| Bước | Thao tác |
|------|---------|
| 1 | Giảng viên chọn một thread phản hồi đã được xử lý xong. |
| 2 | Giảng viên nhấn biểu tượng "Resolve" (hoàn tất). |
| 3 | Hệ thống xác thực quyền của giảng viên. |
| 4 | Hệ thống cập nhật trạng thái của thread thành "Resolved". |
| 5 | Hệ thống thu gọn thread bình luận trên giao diện với nhãn "Đã giải quyết". |
| 6 | Hệ thống thông báo cho sinh viên liên quan. |

**Alternative flows:**

| Luồng | Điều kiện | Xử lý |
|-------|-----------|-------|
| 1a | Giảng viên muốn "Unresolve" | Giảng viên nhấn "Mở lại" (Unresolve) trên thread đã đóng. Hệ thống đổi trạng thái về "Open" và mở rộng thread. |

**Exception flows:**

| Luồng | Điều kiện | Xử lý |
|-------|-----------|-------|
| 3a | Người dùng không phải giảng viên tạo comment | Không hiển thị nút Resolve. Nếu cố gọi API, báo lỗi "Unauthorized". |

---

### UC 7.7 – Đính kèm file vào phản hồi

| Field | Content |
|-------|---------|
| **Use case ID** | 7.7 |
| **Use case name** | Đính kèm file vào phản hồi |
| **Description** | Người dùng upload file tài liệu (PDF, Word, Ảnh) đính kèm theo phản hồi để minh họa hoặc cung cấp thêm thông tin. |
| **Actors** | Giảng viên, Sinh viên |
| **Priority** | Trung bình |
| **Triggers** | Người dùng nhấn biểu tượng "Đính kèm" (📎) khi đang nhập phản hồi. |
| **Pre-conditions** | Đang trong quá trình tạo hoặc chỉnh sửa phản hồi. |
| **Post-conditions** | File được tải lên server lưu trữ tạm thời và đính kèm thành công vào phản hồi sau khi gửi. |
| **Business rules** | Định dạng hỗ trợ: PDF, DOC, DOCX, JPG, PNG. Dung lượng tối đa: 5MB/file. Tối đa 3 file mỗi phản hồi. |
| **Non-functional requirement** | Tốc độ upload nhanh, hiển thị thanh tiến trình. Lưu trữ file an toàn trên cloud (ví dụ AWS S3/Cloudinary). |

**Main flow:**

| Bước | Thao tác |
|------|---------|
| 1 | Người dùng nhấn biểu tượng đính kèm file ở hộp thoại phản hồi. |
| 2 | Hệ thống mở cửa sổ chọn file từ thiết bị. |
| 3 | Người dùng chọn file muốn tải lên. |
| 4 | Hệ thống kiểm tra định dạng và dung lượng file. |
| 5 | Hệ thống tải file lên server và hiển thị preview (hoặc tên file) kèm thanh tiến trình. |
| 6 | Người dùng hoàn tất nhập nội dung và nhấn "Gửi". File chính thức được gắn vào bình luận. |

**Alternative flows:**

| Luồng | Điều kiện | Xử lý |
|-------|-----------|-------|
| 5a | Người dùng xóa file đính kèm trước khi gửi | Người dùng nhấn "x" cạnh file. Hệ thống gỡ file khỏi danh sách tạm. |

**Exception flows:**

| Luồng | Điều kiện | Xử lý |
|-------|-----------|-------|
| 4a | File sai định dạng | Hệ thống báo lỗi "Định dạng file không hỗ trợ". Hủy upload. |
| 4b | File vượt quá 5MB | Hệ thống báo lỗi "Dung lượng file vượt quá 5MB". Hủy upload. |

---

### UC 7.8 – Xem lịch sử toàn bộ phản hồi của đề tài

| Field | Content |
|-------|---------|
| **Use case ID** | 7.8 |
| **Use case name** | Xem lịch sử toàn bộ phản hồi của đề tài |
| **Description** | Người dùng xem danh sách tổng hợp tất cả các phản hồi/bình luận đã được tạo trong một đề tài nghiên cứu. |
| **Actors** | Giảng viên, Sinh viên |
| **Priority** | Thấp |
| **Triggers** | Người dùng truy cập tab "Lịch sử phản hồi" trong trang chi tiết đề tài. |
| **Pre-conditions** | Người dùng đã đăng nhập và là thành viên (SV hoặc GVHD) của đề tài. |
| **Post-conditions** | Danh sách tất cả các bình luận được hiển thị, có thể lọc và sắp xếp. |
| **Business rules** | Sinh viên chỉ xem được của đề tài mình, giảng viên xem của đề tài sinh viên mình hướng dẫn. |
| **Non-functional requirement** | Dữ liệu được phân trang hoặc cuộn vô hạn (infinite scroll). Tải dữ liệu < 1.5s. |

**Main flow:**

| Bước | Thao tác |
|------|---------|
| 1 | Người dùng chọn tab "Lịch sử phản hồi" trong giao diện quản lý đề tài. |
| 2 | Hệ thống truy vấn toàn bộ các phản hồi liên quan đến milestone và tài liệu của đề tài. |
| 3 | Hệ thống hiển thị danh sách các phản hồi theo thứ tự thời gian (mới nhất trước). |
| 4 | Người dùng chọn bộ lọc (theo Milestone, theo Tài liệu, hoặc trạng thái Open/Resolved). |
| 5 | Hệ thống lọc dữ liệu tương ứng và cập nhật giao diện. |
| 6 | Người dùng nhấn vào một bình luận để xem ngữ cảnh gốc. Hệ thống điều hướng đến chính xác milestone/tài liệu chứa bình luận đó. |

**Alternative flows:**

| Luồng | Điều kiện | Xử lý |
|-------|-----------|-------|
| Xa | Không có bộ lọc nào được chọn | Hệ thống mặc định hiển thị tất cả phản hồi. |

**Exception flows:**

| Luồng | Điều kiện | Xử lý |
|-------|-----------|-------|
| 2a | Đề tài chưa có phản hồi nào | Hệ thống hiển thị trạng thái rỗng "Chưa có phản hồi nào cho đề tài này". |

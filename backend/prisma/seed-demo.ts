/**
 * DỮ LIỆU MẪU — CHỈ DÙNG Ở MÔI TRƯỜNG PHÁT TRIỂN
 *
 * ⚠️ Tệp này KHÔNG chạy khi `npm run db:seed`. Nó nằm sau `npm run db:seed:demo`
 * và tự từ chối chạy khi `NODE_ENV=production`.
 *
 * Lý do tách ra: trước đây đây chính là `prisma/seed.ts`, nghĩa là mọi lần khởi
 * tạo cơ sở dữ liệu — kể cả trên máy thật — đều sinh ra bảy tài khoản dùng
 * chung một mật khẩu, năm đề tài bịa và bốn thông báo giả. Dữ liệu thật rồi mà
 * hệ thống vẫn còn "TS. Nguyễn Văn A" nằm lẫn bên trong thì không ai phân biệt
 * được đâu là số liệu thật khi xem thống kê.
 *
 * Phần khởi tạo bắt buộc (cấu hình hệ thống + một tài khoản quản trị) đã chuyển
 * sang `prisma/seed.ts`.
 *
 * Mục tiêu của tệp này: sau `npm run db:seed:demo`, đăng nhập vào là có ngay một
 * đề tài đang chạy, mốc tiến độ ở đủ 5 trạng thái, tài liệu THẬT để trợ lý AI
 * trích dẫn được, và ba vai trò để thử phân quyền.
 *
 * Tài liệu mẫu được ghi ra `storage/` dưới dạng tệp .txt có nội dung học thuật
 * thật bằng tiếng Việt, và để ở `status_ai = PENDING`. Lần khởi động server kế
 * tiếp, `resumePendingJobs()` sẽ nhặt chúng lên, chia đoạn và nhúng vector —
 * nên phần Semantic Search cùng RAG có dữ liệu thật ngay từ lần chạy đầu, không
 * phải là màn kịch với kết quả cứng.
 *
 * Chạy lại được nhiều lần: mọi thứ đều `upsert` theo khoá tự nhiên.
 */
import {
  PrismaClient,
  type MilestoneStatus,
  type NotificationType,
  type ThesisStatus,
} from "@prisma/client";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { hash as argonHash } from "@node-rs/argon2";
import { config as loadDotenv } from "dotenv";

loadDotenv();

const prisma = new PrismaClient();

const PASSWORD = process.env.SEED_PASSWORD || "Admin@123456";
const STORAGE = path.resolve(process.cwd(), process.env.STORAGE_DIR || "./storage");

const hashPassword = (plain: string) =>
  argonHash(plain, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });

/** Ngày tương đối so với hôm nay — dữ liệu mẫu không bị "hết hạn" theo thời gian. */
function daysFromNow(days: number): Date {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

/* ==========================================================================
   NỘI DUNG TÀI LIỆU MẪU
   ========================================================================== */

/**
 * Văn bản thật, không phải "lorem ipsum".
 *
 * Semantic Search chỉ chứng minh được điều gì đó khi kho tài liệu có nội dung
 * thật để tìm. Ba tài liệu này phủ ba chủ đề tách bạch (vector search, đặc tả
 * hệ thống, firmware) nên khi gõ "HNSW khác IVFFlat thế nào" hay "làm sao chống
 * treo worker", kết quả trả về đúng tài liệu tương ứng — đó là phép thử thật.
 */
const SAMPLE_DOCUMENTS = [
  {
    filename: "RAG_pgvector_Architecture_Paper.txt",
    tags: ["AI", "RAG", "pgvector", "Database"],
    body: `KIẾN TRÚC RAG VỚI POSTGRESQL VÀ PGVECTOR

1. Đặt vấn đề

Các hệ thống hỏi đáp dựa trên mô hình ngôn ngữ lớn gặp hai giới hạn cố hữu: tri thức bị đóng băng tại thời điểm huấn luyện, và xu hướng sinh ra thông tin nghe hợp lý nhưng không có thật. Retrieval-Augmented Generation giải quyết cả hai bằng cách tách rời khâu ghi nhớ khỏi khâu diễn đạt. Hệ thống truy xuất các đoạn văn bản liên quan từ một kho tri thức có thể cập nhật, rồi yêu cầu mô hình chỉ trả lời dựa trên những đoạn đó.

2. Vector hoá và không gian ngữ nghĩa

Mỗi đoạn văn bản được ánh xạ thành một vector số thực nhiều chiều. Với mô hình text-embedding-3-small, số chiều là 1536. Hai đoạn có nội dung gần nhau về ngữ nghĩa sẽ nằm gần nhau trong không gian này, đo bằng khoảng cách cosine. Đây là điểm khác biệt căn bản so với tìm kiếm từ khoá: câu truy vấn "các đánh đổi giữa tốc độ và độ chính xác" vẫn khớp được với đoạn văn nói về "sự cân bằng giữa recall và latency" dù không dùng chung một từ nào.

3. Chỉ mục HNSW

HNSW, viết tắt của Hierarchical Navigable Small World, là thuật toán lập chỉ mục đồ thị đa tầng cho phép tìm kiếm láng giềng gần nhất gần đúng. Cấu trúc gồm nhiều tầng, mỗi tầng là một tập con thưa dần của tầng dưới, cho phép quá trình duyệt đi từ thô đến mịn. Về tốc độ, HNSW giảm thời gian truy vấn trên vector 1536 chiều từ O(N) xuống xấp xỉ O(log N). Trên tập dữ liệu một triệu đoạn văn, thời gian truy vấn điển hình dưới 50 mili giây với độ chính xác trên 98 phần trăm.

Hai tham số quan trọng khi tạo chỉ mục là m và ef_construction. Tham số m quy định số kết nối tối đa của mỗi nút, ảnh hưởng trực tiếp tới dung lượng chỉ mục và chất lượng đồ thị. Tham số ef_construction quy định độ rộng của hàng đợi ưu tiên khi dựng chỉ mục; giá trị cao cho chỉ mục chất lượng hơn nhưng thời gian dựng lâu hơn. Cấu hình m bằng 16 và ef_construction bằng 64 là điểm cân bằng được khuyến nghị cho phần lớn tình huống.

4. So sánh HNSW và IVFFlat

IVFFlat phân hoạch không gian vector thành các cụm bằng thuật toán k-means, sau đó chỉ tìm kiếm trong một số cụm gần nhất. Ưu điểm là dung lượng chỉ mục nhỏ và thời gian dựng nhanh. Nhược điểm quyết định là IVFFlat cần dữ liệu mẫu để huấn luyện danh sách phân cụm, nên trên một bảng rỗng lúc khởi tạo hệ thống, chất lượng truy hồi rất kém cho tới khi chạy lại REINDEX. HNSW dựng dần theo từng lần chèn nên cho kết quả đúng ngay từ tài liệu đầu tiên. Với một hệ thống mà dữ liệu tích luỹ dần theo từng lần sinh viên tải tài liệu lên, HNSW là lựa chọn phù hợp hơn.

5. Toán tử khoảng cách trong pgvector

pgvector cung cấp ba toán tử: dấu nhỏ hơn kèm dấu bằng và dấu lớn hơn cho khoảng cách cosine, toán tử khoảng cách L2, và toán tử tích vô hướng âm. Với vector đã chuẩn hoá L2, khoảng cách cosine và khoảng cách L2 xếp hạng kết quả giống hệt nhau, nhưng cosine cho giá trị nằm trong khoảng từ 0 đến 2 nên dễ diễn giải thành phần trăm tương đồng hiển thị cho người dùng.

Việc chuẩn hoá L2 trước khi lưu là bắt buộc chứ không phải tuỳ chọn. Nếu bỏ qua, độ dài vector sẽ chi phối kết quả và những đoạn văn dài luôn được xếp hạng cao hơn bất kể nội dung.

6. Chiến lược chia đoạn

Kích thước đoạn ảnh hưởng trực tiếp tới chất lượng truy hồi. Đoạn quá ngắn làm mất ngữ cảnh, khiến vector không biểu diễn đủ một ý trọn vẹn. Đoạn quá dài trộn nhiều chủ đề vào cùng một vector, làm loãng tín hiệu. Thực nghiệm trên tài liệu học thuật tiếng Việt cho thấy khoảng 300 đến 400 token mỗi đoạn là vùng tối ưu, kèm phần chồng lấp khoảng 15 phần trăm để một câu bị cắt ở ranh giới vẫn còn nguyên ngữ cảnh ở ít nhất một đoạn.

Ranh giới đoạn nên trùng với ranh giới câu. Cắt theo số ký tự cố định tạo ra những đoạn mở đầu bằng nửa mệnh đề; vector của đoạn đó biểu diễn một câu không tồn tại, và khi được trích dẫn, người đọc nhận được một câu cụt.

7. Cô lập dữ liệu giữa các người dùng

Khi nhiều người dùng chia sẻ chung một bảng vector, mọi truy vấn tương đồng phải giới hạn phạm vi theo quyền truy cập. Một câu lệnh sắp xếp theo khoảng cách trên toàn bảng mà không kèm điều kiện lọc sẽ trả về nội dung của bất kỳ ai. Cách an toàn là tính trước tập định danh tài liệu mà người dùng được phép đọc, rồi đưa tập đó vào mệnh đề lọc của truy vấn vector. Điều kiện lọc nên đặt trong WHERE còn ngưỡng điểm tương đồng nên lọc sau khi đã sắp xếp, vì đặt ngưỡng vào WHERE sẽ khiến bộ tối ưu truy vấn bỏ qua chỉ mục.`,
  },
  {
    filename: "Dac_ta_he_thong_NovaThesis.txt",
    tags: ["Yêu cầu", "ERD", "Spec"],
    body: `ĐẶC TẢ HỆ THỐNG QUẢN LÝ LUẬN VĂN NOVATHESIS

1. Phạm vi

Hệ thống phục vụ ba nhóm người dùng: sinh viên thực hiện đề tài, giảng viên hướng dẫn, và quản trị viên. Toàn bộ chức năng được đặc tả thành 92 use case, chia làm chín phân hệ: xác thực và tài khoản, quản trị, quản lý đề tài, quản lý mốc tiến độ, quản lý tài liệu, hỗ trợ AI, trao đổi và phản hồi, thông báo, báo cáo và thống kê.

2. Mô hình dữ liệu

Cơ sở dữ liệu gồm 22 bảng. Nhóm tài khoản gồm users, students, lecturers. Nhóm nghiệp vụ gồm theses, thesis_members, milestones, milestone_history, documents, document_versions, document_shares. Nhóm AI gồm document_chunks, ai_chat_sessions, ai_chat_messages, ai_suggestions, plagiarism_checks. Nhóm vận hành gồm feedbacks, notifications, notification_preferences, system_logs, system_configs, academic_years, refresh_tokens.

Quan hệ giữa đề tài và sinh viên là nhiều-nhiều thông qua bảng thesis_members. Thiết kế ban đầu đặt một cột thesis_id trên bảng students, nhưng cách đó chỉ cho phép một sinh viên trên một đề tài và không lưu được lịch sử khi sinh viên đổi đề tài hoặc học lại năm sau.

3. Quản lý phiên bản tài liệu

Một luận văn trải qua nhiều lần sửa đổi. Bảng document_versions lưu từng phiên bản với số hiệu tăng dần, đường dẫn tệp riêng, người tải lên và ghi chú thay đổi. Ràng buộc duy nhất bộ phận đảm bảo mỗi tài liệu chỉ có đúng một phiên bản đang hiệu lực tại một thời điểm. Cách này thay thế việc ghi đè tệp cũ, vốn làm mất khả năng đối chiếu giữa các bản nháp.

4. Máy trạng thái mốc tiến độ

Trạng thái mốc tiến độ được quản lý như một máy trạng thái hữu hạn với bảng chuyển tiếp tường minh. Năm trạng thái gồm chưa bắt đầu, đang làm, chờ phê duyệt, cần sửa đổi, và hoàn thành. Mỗi chuyển tiếp có điều kiện về vai trò và điều kiện tiên quyết về dữ liệu. Chuyển từ đang làm sang chờ phê duyệt bắt buộc phải có minh chứng đính kèm. Chỉ giảng viên hướng dẫn hoặc quản trị viên mới được chuyển sang trạng thái hoàn thành; sinh viên không thể tự đánh dấu hoàn thành phần việc của mình.

Bảng chuyển tiếp được cài đặt ở cả phía máy chủ và phía trình duyệt. Bản phía trình duyệt tồn tại để giải thích cho người dùng vì sao một thao tác kéo thả bị từ chối; nó không phải hàng rào bảo mật, vì bất kỳ ai cũng gọi thẳng API được. Máy chủ kiểm tra lại mọi chuyển tiếp.

5. Yêu cầu phi chức năng

Thời gian phản hồi của API đăng nhập dưới một giây. Tìm kiếm ngữ nghĩa trả kết quả dưới ba giây. Kết xuất báo cáo PDF dưới năm giây, không lỗi font tiếng Việt. Trả lời của trợ lý AI phải ở dạng luồng để người dùng thấy chữ xuất hiện dần thay vì chờ một khối văn bản.

6. Bảo mật

Mật khẩu băm bằng Argon2id. Tài khoản bị khoá tạm mười lăm phút sau năm lần đăng nhập sai liên tiếp. Tệp tài liệu lưu ở thư mục riêng tư, không phục vụ tĩnh; mọi lượt tải đều đi qua endpoint có kiểm tra quyền hoặc qua đường dẫn ký HMAC có hạn. Đầu vào được kiểm tra ở cả hai phía, nhưng hàng rào thật nằm ở máy chủ. Truy vấn cơ sở dữ liệu dùng tham số hoá để chống SQL Injection.

Với phần AI, nội dung tài liệu được bọc trong thẻ dữ liệu và chỉ dẫn hệ thống nêu rõ phần bên trong là dữ liệu chứ không phải mệnh lệnh, nhằm hạn chế prompt injection từ nội dung tệp tải lên.`,
  },
  {
    filename: "Firmware_FSM_Watchdog_Design_Guide.txt",
    tags: ["Firmware", "FSM", "Safety"],
    body: `ÁP DỤNG TƯ DUY FIRMWARE VÀO HỆ THỐNG WEB

1. Máy trạng thái hữu hạn

Trong hệ thống nhúng, mọi thiết bị đều được mô hình hoá bằng máy trạng thái hữu hạn. Điểm cốt lõi không nằm ở việc có bao nhiêu trạng thái, mà ở chỗ tập chuyển tiếp hợp lệ được liệt kê tường minh trong một bảng, và mọi thay đổi trạng thái đều phải tra bảng đó trước. Một chuyển tiếp không có trong bảng là chuyển tiếp không tồn tại, khác với chuyển tiếp tồn tại nhưng bị từ chối vì thiếu điều kiện.

Chuyển cách nghĩ này sang ứng dụng web mang lại lợi ích trực tiếp. Trạng thái luận văn và trạng thái mốc tiến độ đều là máy trạng thái. Không có bảng chuyển tiếp, mã nguồn sẽ đầy những câu lệnh điều kiện rải rác kiểm tra trạng thái hiện tại, và sớm muộn sẽ có một nhánh cho phép sinh viên tự đánh dấu công việc của mình là đã được duyệt.

2. Watchdog Timer

Watchdog Timer là bộ đếm ngược phần cứng. Chương trình phải nạp lại bộ đếm định kỳ; nếu không kịp, vi điều khiển tự khởi động lại. Nguyên lý là chấp nhận rằng phần mềm sẽ treo, và chuẩn bị sẵn cách thoát ra thay vì tin rằng nó không bao giờ treo.

Tương ứng ở phía máy chủ là các tác vụ nền có giới hạn thời gian. Đọc một tệp PDF hỏng có thể khiến thư viện phân tích rơi vào vòng lặp không kết thúc. Nếu tác vụ chạy không có giới hạn, nó chiếm một luồng xử lý vĩnh viễn, và sau vài lần như vậy toàn bộ hàng đợi ngừng chảy. Giải pháp gồm hai lớp. Lớp thứ nhất là bộ đếm thời gian trong tiến trình, phát tín hiệu huỷ khi tác vụ vượt ngưỡng. Lớp thứ hai là vòng quét định kỳ đọc trạng thái từ cơ sở dữ liệu, tìm những tác vụ đã ở trạng thái đang xử lý quá lâu và đưa chúng trở lại hàng đợi. Lớp thứ hai cần thiết vì lớp thứ nhất chỉ cứu được tiến trình còn sống; nếu máy chủ bị dừng đột ngột giữa chừng, bản ghi sẽ mắc kẹt ở trạng thái đang xử lý mãi mãi.

Số lần thử lại phải có giới hạn. Một tệp hỏng vĩnh viễn sẽ thất bại ở mọi lần thử, và vòng lặp thử lại vô hạn biến một tệp lỗi thành nguồn tiêu tốn tài nguyên liên tục. Sau số lần cho phép, tác vụ chuyển sang trạng thái lỗi vĩnh viễn kèm thông điệp giải thích cho người dùng.

3. Tư duy tiết kiệm tài nguyên

Trên vi điều khiển, mỗi byte RAM đều được tính. Thói quen đó có giá trị trên máy chủ. Đọc trọn một tệp năm mươi megabyte vào bộ nhớ để chép sang chỗ khác là lãng phí; hai mươi người dùng cùng nộp bài sẽ chiếm một gigabyte heap chỉ để sao chép tệp. Dùng luồng đọc ghi thì bộ nhớ tiêu thụ không phụ thuộc kích thước tệp.

Tương tự khi phân tích tài liệu nhiều trang: giải phóng từng trang ngay sau khi trích xuất xong thay vì giữ toàn bộ cây đối tượng đã dựng. Với luận văn ba trăm trang, khác biệt là giữa vài chục megabyte và vài trăm megabyte.

4. Telemetry và chẩn đoán

Hệ thống nhúng phơi bày các thanh ghi trạng thái để kỹ thuật viên đọc được tình trạng thiết bị mà không cần tháo máy. Ứng dụng web nên có thứ tương đương: một endpoint chẩn đoán trả về mức sử dụng CPU và bộ nhớ, độ trễ kết nối cơ sở dữ liệu, độ sâu hàng đợi tác vụ nền, số tác vụ đã hết thời gian, và tình trạng các phụ thuộc bên ngoài. Chỉ có nhật ký lỗi là chưa đủ: nhật ký cho biết chuyện gì đã hỏng, còn số liệu trạng thái cho biết chuyện gì sắp hỏng.

Ngưỡng cảnh báo nên đặt sẵn trong chính endpoint đó. Độ trễ cơ sở dữ liệu vượt năm trăm mili giây, hàng đợi ùn quá hai mươi tác vụ, hoặc một tác vụ chờ quá năm phút đều là dấu hiệu sớm, xuất hiện trước khi người dùng bắt đầu phàn nàn.

5. Vào ra không chặn

Trong hàm ngắt của firmware, tuyệt đối không được chờ bận. Nguyên tắc tương đương trên máy chủ là không để một thao tác vào ra chặn luồng xử lý chính. Gọi cơ sở dữ liệu, đọc tệp, gọi API bên ngoài đều phải bất đồng bộ. Một hàm đồng bộ chạy hai giây trong Node.js không làm chậm một người dùng; nó làm đóng băng toàn bộ máy chủ trong hai giây đối với mọi người dùng.`,
  },
];

/* ==========================================================================
   SEED
   ========================================================================== */

async function main(): Promise<void> {
  /* Hàng rào cứng. Một lệnh gõ nhầm trên máy thật sẽ chèn bảy tài khoản dùng
     chung mật khẩu vào giữa dữ liệu người dùng — hỏng cả về bảo mật lẫn về số
     liệu thống kê, và không có nút hoàn tác. */
  if (process.env.NODE_ENV === "production") {
    console.error(
      "✖ Từ chối chạy: đây là dữ liệu mẫu, không được chèn vào môi trường production.\n" +
        "  Dùng `npm run db:seed` để khởi tạo cấu hình và tài khoản quản trị."
    );
    process.exit(1);
  }

  console.log("→ Đang tạo DỮ LIỆU MẪU (chỉ dành cho môi trường phát triển)…\n");

  const passwordHash = await hashPassword(PASSWORD);
  const now = new Date();

  /* --- Năm học ------------------------------------------------------- */
  const year = await prisma.academicYear.upsert({
    where: { name: "2025–2026" },
    update: {},
    create: {
      name: "2025–2026",
      start_date: new Date("2025-09-01"),
      end_date: new Date("2026-08-31"),
      is_active: true,
    },
  });

  /* --- Cấu hình hệ thống ---------------------------------------------- */
  const configs = [
    {
      config_key: "AI_MODEL_NAME",
      config_value: process.env.LLM_PROVIDER === "local" ? "local-extractive-v1" : "gpt-4o-mini",
      category: "AI" as const,
      value_type: "STRING" as const,
      description: "Mô hình ngôn ngữ chính sử dụng cho Chat AI & RAG",
    },
    {
      config_key: "AI_EMBEDDING_MODEL",
      config_value: process.env.EMBEDDING_PROVIDER === "local" ? "local-hashing-v1" : "text-embedding-3-small",
      category: "AI" as const,
      value_type: "STRING" as const,
      description: "Mô hình tạo vector embedding (1536 chiều, pgvector)",
    },
    {
      config_key: "AI_RAG_TOP_K",
      config_value: "5",
      category: "AI" as const,
      value_type: "INT" as const,
      description: "Số đoạn tài liệu đưa vào ngữ cảnh mỗi câu trả lời RAG",
    },
    {
      config_key: "MAX_FILE_SIZE_MB",
      config_value: "50",
      category: "STORAGE" as const,
      value_type: "INT" as const,
      description: "Kích thước tệp tài liệu tối đa được phép tải lên (MB)",
    },
    {
      config_key: "ALLOWED_FILE_TYPES",
      config_value: "pdf,docx,txt",
      category: "STORAGE" as const,
      value_type: "STRING" as const,
      description: "Các định dạng tài liệu được phép tải lên",
    },
    {
      config_key: "MAX_LOGIN_ATTEMPTS",
      config_value: "5",
      category: "SECURITY" as const,
      value_type: "INT" as const,
      description: "Số lần đăng nhập sai tối đa trước khi tạm khóa 15 phút",
    },
    {
      config_key: "LOCKOUT_MINUTES",
      config_value: "15",
      category: "SECURITY" as const,
      value_type: "INT" as const,
      description: "Thời gian khóa tài khoản sau khi vượt số lần đăng nhập sai",
    },
    {
      config_key: "REMINDER_DAYS_BEFORE_DEADLINE",
      config_value: "7,3,1",
      category: "GENERAL" as const,
      value_type: "STRING" as const,
      description: "Các mốc ngày gửi nhắc nhở trước hạn milestone",
    },
    {
      config_key: "SYSTEM_MAINTENANCE_MODE",
      config_value: "false",
      category: "GENERAL" as const,
      value_type: "BOOLEAN" as const,
      description: "Bật/Tắt chế độ bảo trì toàn hệ thống",
    },
  ];

  for (const c of configs) {
    await prisma.systemConfig.upsert({
      where: { config_key: c.config_key },
      update: { description: c.description, category: c.category, value_type: c.value_type },
      create: c,
    });
  }

  /* --- Tài khoản ------------------------------------------------------ */
  async function createUser(input: {
    email: string;
    full_name: string;
    role: "ADMIN" | "LECTURER" | "STUDENT";
    student_code?: string;
    lecturer_code?: string;
    department?: string;
    max_students?: number;
  }) {
    const user = await prisma.user.upsert({
      where: { email: input.email },
      update: { full_name: input.full_name, role: input.role, status: "ACTIVE" },
      create: {
        email: input.email,
        password_hash: passwordHash,
        full_name: input.full_name,
        role: input.role,
        status: "ACTIVE",
        email_verified_at: now,
      },
    });

    if (input.role === "STUDENT") {
      await prisma.student.upsert({
        where: { user_id: user.id },
        update: {},
        create: { user_id: user.id, student_code: input.student_code ?? null },
      });
    }

    if (input.role === "LECTURER") {
      await prisma.lecturer.upsert({
        where: { user_id: user.id },
        update: { department: input.department ?? "Khoa Công nghệ Thông tin" },
        create: {
          user_id: user.id,
          lecturer_code: input.lecturer_code ?? `GV${user.id}`,
          department: input.department ?? "Khoa Công nghệ Thông tin",
          max_students: input.max_students ?? 5,
        },
      });
    }

    const types: NotificationType[] = ["MILESTONE", "THESIS", "FEEDBACK", "SYSTEM"];
    await prisma.notificationPreference.createMany({
      data: types.map((type) => ({ user_id: user.id, type })),
      skipDuplicates: true,
    });

    return user;
  }

  const admin = await createUser({
    email: process.env.SEED_ADMIN_EMAIL || "admin@novathesis.edu.vn",
    full_name: "Quản Trị Viên Hệ Thống",
    role: "ADMIN",
  });

  const lecturerA = await createUser({
    email: "nguyen.vana@novathesis.edu.vn",
    full_name: "TS. Nguyễn Văn A",
    role: "LECTURER",
    lecturer_code: "GV001",
    department: "Khoa Công nghệ Thông tin",
    max_students: 6,
  });

  const lecturerB = await createUser({
    email: "tran.thib@novathesis.edu.vn",
    full_name: "PGS.TS. Trần Thị B",
    role: "LECTURER",
    lecturer_code: "GV002",
    department: "Khoa Hệ thống Thông tin Quản lý",
    max_students: 5,
  });

  const studentC = await createUser({
    email: "student@novathesis.edu.vn",
    full_name: "Lê Văn C",
    role: "STUDENT",
    student_code: "20110001",
  });

  const studentD = await createUser({
    email: "pham.thid@student.novathesis.edu.vn",
    full_name: "Phạm Thị D",
    role: "STUDENT",
    student_code: "20110002",
  });

  const studentE = await createUser({
    email: "pham.vane@student.novathesis.edu.vn",
    full_name: "Phạm Văn E",
    role: "STUDENT",
    student_code: "20110003",
  });

  const studentG = await createUser({
    email: "dang.vang@student.novathesis.edu.vn",
    full_name: "Đặng Văn G",
    role: "STUDENT",
    student_code: "20110004",
  });

  const [lecA, lecB, stuC, stuD, stuE, stuG] = await Promise.all([
    prisma.lecturer.findUniqueOrThrow({ where: { user_id: lecturerA.id } }),
    prisma.lecturer.findUniqueOrThrow({ where: { user_id: lecturerB.id } }),
    prisma.student.findUniqueOrThrow({ where: { user_id: studentC.id } }),
    prisma.student.findUniqueOrThrow({ where: { user_id: studentD.id } }),
    prisma.student.findUniqueOrThrow({ where: { user_id: studentE.id } }),
    prisma.student.findUniqueOrThrow({ where: { user_id: studentG.id } }),
  ]);

  /* --- Đề tài --------------------------------------------------------- */
  interface ThesisSeed {
    title: string;
    description: string;
    field: string;
    status: ThesisStatus;
    lecturerId: number;
    studentIds: number[];
    rejection_reason?: string;
    revision_note?: string;
  }

  const thesisSeeds: ThesisSeed[] = [
    {
      title: "Hệ thống quản lý luận văn và đề tài nghiên cứu tích hợp AI (NovaThesis)",
      description:
        "Xây dựng nền tảng web quản lý tiến độ báo cáo luận văn, lưu trữ kho tài liệu RAG trên pgvector và hỗ trợ chat trợ lý học thuật. Đề tài áp dụng tư duy Firmware Engineering (máy trạng thái hữu hạn, watchdog timer, tối ưu bộ nhớ) vào kiến trúc web nhằm tăng tính ổn định và khả năng chẩn đoán.",
      field: "Công nghệ phần mềm / Trí tuệ nhân tạo",
      status: "ONGOING",
      lecturerId: lecA.id,
      studentIds: [stuC.id],
    },
    {
      title: "Nghiên cứu ứng dụng IoT và Firmware FSM trong giám sát chất lượng nước",
      description:
        "Thiết kế thiết bị nhúng giám sát độ pH, độ đục và nhiệt độ nước theo thời gian thực, gửi dữ liệu lên server qua giao thức MQTT. Firmware được tổ chức theo máy trạng thái hữu hạn với watchdog timer đảm bảo thiết bị tự phục hồi khi mất kết nối.",
      field: "Hệ thống nhúng & IoT",
      status: "ONGOING",
      lecturerId: lecB.id,
      studentIds: [stuE.id, stuD.id],
    },
    {
      title: "Phân tích cú pháp và phát hiện lỗ hổng bảo mật bằng mô hình học máy",
      description:
        "Đề xuất giải pháp kiểm tra bảo mật Static Analysis tự động phát hiện SQL Injection và XSS trong mã nguồn C/C++ dựa trên biểu diễn cây cú pháp trừu tượng và mô hình phân loại có giám sát.",
      field: "An toàn thông tin",
      status: "PENDING",
      lecturerId: lecA.id,
      studentIds: [stuG.id],
    },
    {
      title: "Tối ưu hóa thuật toán tìm đường cho robot tự hành trong nhà kho thông minh",
      description:
        "Ứng dụng thuật toán A* kết hợp Dynamic Window Approach trên nền ROS2 cho robot AGV vận chuyển hàng hóa tự động trong môi trường có chướng ngại vật động.",
      field: "Robot & Tự động hóa",
      status: "REJECTED",
      lecturerId: lecB.id,
      studentIds: [],
      rejection_reason:
        "Đề tài quá rộng so với phạm vi đồ án tốt nghiệp. Cần thu hẹp quy mô thử nghiệm xuống một kịch bản cụ thể và xác định rõ tiêu chí đánh giá định lượng.",
    },
    {
      title: "Xây dựng ứng dụng điểm danh sinh viên bằng nhận diện khuôn mặt",
      description:
        "Đề tài do giảng viên đề xuất cho sinh viên đăng ký. Sử dụng mô hình FaceNet cho bước trích đặc trưng và so khớp vector khuôn mặt bằng tìm kiếm tương đồng.",
      field: "Thị giác máy tính",
      status: "DRAFT",
      lecturerId: lecA.id,
      studentIds: [],
    },
  ];

  const theses = [];
  for (const seed of thesisSeeds) {
    const existing = await prisma.thesis.findFirst({ where: { title: seed.title } });
    const thesis = existing
      ? await prisma.thesis.update({
          where: { id: existing.id },
          data: { status: seed.status, description: seed.description },
        })
      : await prisma.thesis.create({
          data: {
            title: seed.title,
            description: seed.description,
            field: seed.field,
            status: seed.status,
            lecturer_id: seed.lecturerId,
            academic_year_id: year.id,
            created_by: seed.studentIds.length ? studentC.id : lecturerA.id,
            rejection_reason: seed.rejection_reason ?? null,
            revision_note: seed.revision_note ?? null,
            submitted_at: seed.status === "DRAFT" ? null : daysFromNow(-120),
          },
        });

    for (const studentId of seed.studentIds) {
      await prisma.thesisMember.upsert({
        where: { thesis_id_student_id: { thesis_id: thesis.id, student_id: studentId } },
        update: {},
        create: { thesis_id: thesis.id, student_id: studentId, role: "OWNER" },
      });
    }

    theses.push(thesis);
  }

  const mainThesis = theses[0];
  if (!mainThesis) throw new Error("Không tạo được đề tài chính");

  /* --- Mốc tiến độ ----------------------------------------------------- */
  interface MilestoneSeed {
    name: string;
    description: string;
    days: number;
    status: MilestoneStatus;
    evidence?: string;
    revision?: string;
    extension?: { reason: string; days: number };
  }

  const milestoneSeeds: MilestoneSeed[] = [
    {
      name: "Hoàn thiện Frontend Dashboard và luồng 92 use case",
      description: "Xây dựng giao diện Next.js với Tailwind v4, đảm bảo mật độ dữ liệu và khả năng truy cập.",
      days: -14,
      status: "COMPLETED",
      evidence: "frontend_demo_v1.zip",
    },
    {
      name: "Thiết kế kiến trúc hệ thống và ERD cơ sở dữ liệu",
      description: "Đặc tả sơ đồ thực thể 22 bảng, chỉ mục HNSW cho pgvector và các ràng buộc toàn vẹn.",
      days: -1,
      status: "PENDING_APPROVAL",
      evidence: "erd_spec_v2.pdf",
    },
    {
      name: "Nộp báo cáo đề cương luận văn",
      description: "Xây dựng đề cương chi tiết, tổng quan tài liệu nghiên cứu và lịch trình thực hiện.",
      days: 6,
      status: "ONGOING",
    },
    {
      name: "Cài đặt module AI và Vector Search trên pgvector",
      description: "Tích hợp pgvector, chia đoạn tài liệu PDF, sinh embedding và cài đặt truy hồi RAG có trích dẫn.",
      days: 17,
      status: "NOT_STARTED",
    },
    {
      name: "Thử nghiệm đánh giá bảo mật và kiểm tra đầu vào",
      description: "Kiểm tra chống SQL Injection, rate limit, chính sách mật khẩu và cô lập dữ liệu giữa người dùng.",
      days: 27,
      status: "REVISION_REQUIRED",
      revision:
        "Phần kiểm thử còn thiếu kịch bản refresh token bị đánh cắp và kịch bản người dùng bị vô hiệu hoá giữa phiên. Bổ sung thêm bảng đối chiếu với OWASP Top 10.",
      extension: {
        reason:
          "Em cần thêm thời gian để dựng môi trường kiểm thử bảo mật riêng và chạy bộ công cụ quét tự động.",
        days: 38,
      },
    },
    {
      name: "Viết báo cáo tổng kết và chuẩn bị bảo vệ",
      description: "Hoàn thiện quyển báo cáo, slide trình bày và bản demo cho hội đồng.",
      days: 45,
      status: "NOT_STARTED",
    },
  ];

  const milestones = [];
  for (const [i, seed] of milestoneSeeds.entries()) {
    const existing = await prisma.milestone.findFirst({
      where: { thesis_id: mainThesis.id, name: seed.name },
    });

    const data = {
      thesis_id: mainThesis.id,
      name: seed.name,
      description: seed.description,
      deadline: daysFromNow(seed.days),
      status: seed.status,
      order_index: i,
      evidence_filename: seed.evidence ?? null,
      evidence_file_url: seed.evidence ? `evidence/seed/${seed.evidence}` : null,
      description_revision: seed.revision ?? null,
      extension_requested: Boolean(seed.extension),
      extension_reason: seed.extension?.reason ?? null,
      extension_new_deadline: seed.extension ? daysFromNow(seed.extension.days) : null,
      extension_status: seed.extension ? ("PENDING" as const) : null,
      approved_by: seed.status === "COMPLETED" ? lecturerA.id : null,
      approved_at: seed.status === "COMPLETED" ? daysFromNow(-12) : null,
    };

    const milestone = existing
      ? await prisma.milestone.update({ where: { id: existing.id }, data })
      : await prisma.milestone.create({ data });

    milestones.push(milestone);
  }

  // Một dòng lịch sử cho mốc đã hoàn thành, để tab "Lịch sử" không trống trơn.
  const completed = milestones[0];
  if (completed) {
    const hasHistory = await prisma.milestoneHistory.count({
      where: { milestone_id: completed.id },
    });
    if (hasHistory === 0) {
      await prisma.milestoneHistory.createMany({
        data: [
          {
            milestone_id: completed.id,
            changed_by: studentC.id,
            field_name: "status",
            old_value: "ONGOING",
            new_value: "PENDING_APPROVAL",
            note: "Sinh viên nộp minh chứng",
            created_at: daysFromNow(-15),
          },
          {
            milestone_id: completed.id,
            changed_by: lecturerA.id,
            field_name: "status",
            old_value: "PENDING_APPROVAL",
            new_value: "COMPLETED",
            note: "Giảng viên phê duyệt hoàn thành",
            created_at: daysFromNow(-12),
          },
        ],
      });
    }
  }

  /* --- Tài liệu (ghi tệp thật) ---------------------------------------- */
  const docDir = path.join(STORAGE, "documents", "seed");
  await fsp.mkdir(docDir, { recursive: true });

  const createdDocs = [];
  for (const sample of SAMPLE_DOCUMENTS) {
    const relativePath = path.join("documents", "seed", sample.filename);
    const absolutePath = path.join(STORAGE, relativePath);
    const content = sample.body.trim() + "\n";
    await fsp.writeFile(absolutePath, content, "utf8");
    const size = Buffer.byteLength(content, "utf8");

    const existing = await prisma.document.findFirst({
      where: { thesis_id: mainThesis.id, filename: sample.filename },
    });

    const doc = existing
      ? await prisma.document.update({
          where: { id: existing.id },
          data: {
            file_path: relativePath,
            file_size: size,
            tags: sample.tags,
            // Đặt lại về PENDING để lần khởi động server tiếp theo nhúng lại —
            // nội dung mẫu có thể đã thay đổi kể từ lần seed trước.
            status_ai: "PENDING",
            ai_attempts: 0,
            ai_error: null,
          },
        })
      : await prisma.document.create({
          data: {
            thesis_id: mainThesis.id,
            filename: sample.filename,
            file_path: relativePath,
            file_size: size,
            mime_type: "text/plain",
            tags: sample.tags,
            status_ai: "PENDING",
            uploaded_by: studentC.id,
          },
        });

    await prisma.documentVersion.upsert({
      where: { document_id_version_number: { document_id: doc.id, version_number: 1 } },
      update: { file_path: relativePath, file_size: size, is_current: true },
      create: {
        document_id: doc.id,
        version_number: 1,
        file_path: relativePath,
        file_size: size,
        mime_type: "text/plain",
        uploaded_by: studentC.id,
        change_note: "Phiên bản đầu tiên",
        is_current: true,
      },
    });

    createdDocs.push(doc);
  }

  /* --- Phản hồi -------------------------------------------------------- */
  const targetMilestone = milestones[2];
  if (targetMilestone) {
    const existing = await prisma.feedback.findFirst({
      where: { milestone_id: targetMilestone.id, parent_id: null },
    });
    if (!existing) {
      const root = await prisma.feedback.create({
        data: {
          milestone_id: targetMilestone.id,
          user_id: lecturerA.id,
          content:
            "Đề cương cần làm rõ hơn phương pháp rerank sau bước truy hồi, và bổ sung số liệu đo thời gian phản hồi API ở các mức tải khác nhau.",
          depth: 0,
          created_at: daysFromNow(-2),
        },
      });
      await prisma.feedback.create({
        data: {
          milestone_id: targetMilestone.id,
          user_id: studentC.id,
          parent_id: root.id,
          depth: 1,
          content:
            "Em cảm ơn thầy. Em đã bổ sung chương 3 so sánh khoảng cách cosine và L2 trong pgvector, phần đo tải em sẽ làm sau khi hoàn thiện module AI ạ.",
          created_at: daysFromNow(-1),
        },
      });
    }
  }

  const firstDoc = createdDocs[0];
  if (firstDoc) {
    const existing = await prisma.feedback.findFirst({
      where: { document_id: firstDoc.id, parent_id: null },
    });
    if (!existing) {
      await prisma.feedback.create({
        data: {
          document_id: firstDoc.id,
          user_id: lecturerA.id,
          content:
            "Tài liệu tham khảo này rất sát đề tài. Em nên áp dụng phần cấu hình chỉ mục HNSW như bài viết mô tả và ghi lại kết quả đo được.",
          depth: 0,
          is_resolved: true,
          resolved_by: lecturerA.id,
          resolved_at: daysFromNow(-3),
          created_at: daysFromNow(-4),
        },
      });
    }
  }

  /* --- Thông báo ------------------------------------------------------- */
  const notifications: {
    user_id: number;
    type: NotificationType;
    title: string;
    content: string;
    link: string;
    is_read: boolean;
    dedupe_key: string;
  }[] = [
    {
      user_id: studentC.id,
      type: "MILESTONE",
      title: "Nhắc nhở: mốc tiến độ sắp đến hạn",
      content: `Mốc “Nộp báo cáo đề cương luận văn” còn 6 ngày nữa là đến hạn (${daysFromNow(6).toISOString().slice(0, 10)}).`,
      link: "/milestones",
      is_read: false,
      dedupe_key: "seed:milestone-due",
    },
    {
      user_id: studentC.id,
      type: "FEEDBACK",
      title: "Giảng viên đã nhận xét mốc tiến độ",
      content: "TS. Nguyễn Văn A đã để lại nhận xét trên mốc “Nộp báo cáo đề cương luận văn”.",
      link: "/feedbacks",
      is_read: false,
      dedupe_key: "seed:feedback-new",
    },
    {
      user_id: studentC.id,
      type: "THESIS",
      title: "Đề tài đã được phê duyệt",
      content: "Đề tài “Hệ thống quản lý luận văn tích hợp AI (NovaThesis)” đã chuyển sang trạng thái Đang thực hiện.",
      link: `/theses/${mainThesis.id}`,
      is_read: true,
      dedupe_key: "seed:thesis-approved",
    },
    {
      user_id: lecturerA.id,
      type: "MILESTONE",
      title: "Sinh viên nộp minh chứng chờ duyệt",
      content: "Lê Văn C đã nộp minh chứng cho mốc “Thiết kế kiến trúc hệ thống và ERD cơ sở dữ liệu”.",
      link: "/milestones",
      is_read: false,
      dedupe_key: "seed:milestone-pending",
    },
  ];

  for (const n of notifications) {
    await prisma.notification.upsert({
      where: { user_id_dedupe_key: { user_id: n.user_id, dedupe_key: n.dedupe_key } },
      update: {},
      create: n,
    });
  }

  /* --- Nhật ký hệ thống ------------------------------------------------ */
  const logCount = await prisma.systemLog.count();
  if (logCount === 0) {
    await prisma.systemLog.createMany({
      data: [
        {
          user_id: studentC.id,
          level: "INFO",
          action: "AUTH_LOGIN",
          ip_address: "192.168.1.45",
          user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0",
          details: { browser: "Chrome", os: "Windows 11" },
          created_at: daysFromNow(-1),
        },
        {
          user_id: lecturerA.id,
          level: "INFO",
          action: "MILESTONE_APPROVE",
          ip_address: "14.241.12.89",
          details: { milestone_id: completed?.id ?? null, thesis_id: mainThesis.id, comment: "Đạt yêu cầu" },
          created_at: daysFromNow(-12),
        },
        {
          user_id: studentD.id,
          level: "WARN",
          action: "AUTH_LOGIN_FAILED",
          ip_address: "113.161.4.12",
          details: { reason: "Sai mật khẩu", attempts: 3 },
          created_at: daysFromNow(-2),
        },
        {
          user_id: admin.id,
          level: "INFO",
          action: "CONFIG_UPDATE",
          ip_address: "127.0.0.1",
          details: { key: "AI_MODEL_NAME", old: "gpt-4-turbo", new: "gpt-4o-mini" },
          created_at: daysFromNow(-3),
        },
        {
          user_id: studentC.id,
          level: "ERROR",
          action: "DOCUMENT_UPLOAD_ERROR",
          ip_address: "192.168.1.45",
          details: { filename: "luan_van_ban_day.pdf", size_mb: 65, max_allowed: 50 },
          created_at: daysFromNow(-5),
        },
      ],
    });
  }

  /* --- Tổng kết -------------------------------------------------------- */
  const summary = await prisma.$transaction([
    prisma.user.count(),
    prisma.thesis.count(),
    prisma.milestone.count(),
    prisma.document.count(),
    prisma.feedback.count(),
    prisma.notification.count(),
  ]);

  console.log("✓ Hoàn tất.\n");
  console.log(`  Người dùng    ${summary[0]}`);
  console.log(`  Đề tài        ${summary[1]}`);
  console.log(`  Mốc tiến độ   ${summary[2]}`);
  console.log(`  Tài liệu      ${summary[3]}  (sẽ được lập chỉ mục khi khởi động server)`);
  console.log(`  Phản hồi      ${summary[4]}`);
  console.log(`  Thông báo     ${summary[5]}\n`);
  console.log("  TÀI KHOẢN DÙNG THỬ — mật khẩu chung: " + PASSWORD);
  console.log("  ┌──────────────┬──────────────────────────────────────┐");
  console.log("  │ Quản trị     │ " + (process.env.SEED_ADMIN_EMAIL || "admin@novathesis.edu.vn").padEnd(36) + " │");
  console.log("  │ Giảng viên   │ nguyen.vana@novathesis.edu.vn        │");
  console.log("  │ Giảng viên   │ tran.thib@novathesis.edu.vn          │");
  console.log("  │ Sinh viên    │ student@novathesis.edu.vn            │");
  console.log("  └──────────────┴──────────────────────────────────────┘\n");
}

main()
  .catch((err) => {
    console.error("Seed thất bại:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

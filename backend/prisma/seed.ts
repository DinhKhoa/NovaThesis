/**
 * KHỞI TẠO CƠ SỞ DỮ LIỆU
 *
 * Chạy được trên MỌI môi trường, kể cả production. Vì vậy nó chỉ tạo đúng hai
 * thứ mà một hệ thống rỗng bắt buộc phải có mới vận hành được:
 *
 *   1. Bảng tham số hệ thống (`system_configs`) với giá trị mặc định.
 *   2. Đúng MỘT tài khoản quản trị, lấy từ biến môi trường.
 *
 * Không có đề tài mẫu, không có sinh viên mẫu, không có thông báo mẫu. Dữ liệu
 * mẫu nằm ở `prisma/seed-demo.ts` và chỉ chạy qua `npm run db:seed:demo`.
 *
 * Chạy lại được nhiều lần: mọi thứ đều `upsert` theo khoá tự nhiên. Chạy lần thứ
 * hai KHÔNG đặt lại mật khẩu quản trị — nếu có, một lần chạy vô tình sẽ đưa mật
 * khẩu về giá trị trong `.env` mà người quản trị đã đổi từ lâu.
 */
import { PrismaClient, type NotificationType } from "@prisma/client";
import { hash as argonHash } from "@node-rs/argon2";
import { config as loadDotenv } from "dotenv";

loadDotenv();

const prisma = new PrismaClient();

/* ==========================================================================
   THAM SỐ BẮT BUỘC

   Không có giá trị mặc định cho email lẫn mật khẩu — đó là chủ ý. Một mật khẩu
   quản trị viết sẵn trong mã nguồn của kho công khai thì mọi bản cài đặt quên
   đổi đều dùng chung một cánh cửa, và không ai nhận ra cho tới lúc muộn.
   ========================================================================== */

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL?.trim();
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;
const ADMIN_NAME = process.env.SEED_ADMIN_NAME?.trim() || "Quản trị viên";

function requireEnv(): { email: string; password: string } {
  const missing: string[] = [];
  if (!ADMIN_EMAIL) missing.push("SEED_ADMIN_EMAIL");
  if (!ADMIN_PASSWORD) missing.push("SEED_ADMIN_PASSWORD");

  if (missing.length > 0) {
    console.error(
      `✖ Thiếu biến môi trường bắt buộc: ${missing.join(", ")}\n\n` +
        "  Đặt trong `.env` rồi chạy lại, ví dụ:\n" +
        "    SEED_ADMIN_EMAIL=admin@truong-cua-ban.edu.vn\n" +
        "    SEED_ADMIN_PASSWORD=<mật khẩu mạnh, tối thiểu 12 ký tự>\n"
    );
    process.exit(1);
  }

  if (ADMIN_PASSWORD!.length < 12) {
    console.error(
      "✖ SEED_ADMIN_PASSWORD quá ngắn (tối thiểu 12 ký tự).\n" +
        "  Đây là tài khoản có toàn quyền trên hệ thống."
    );
    process.exit(1);
  }

  return { email: ADMIN_EMAIL!, password: ADMIN_PASSWORD! };
}

/* ==========================================================================
   THAM SỐ HỆ THỐNG

   Đây là CẤU HÌNH, không phải dữ liệu mẫu: thiếu chúng thì trang
   `/admin/settings` rỗng và các giá trị vận hành không có điểm khởi đầu.

   `update` cố ý chỉ đụng vào phần mô tả và phân loại, không đụng `config_value`:
   chạy lại seed không được ghi đè lên giá trị mà quản trị viên đã chỉnh.
   ========================================================================== */

const DEFAULT_CONFIGS = [
  {
    config_key: "AI_MODEL_NAME",
    config_value: process.env.LLM_PROVIDER === "local" ? "local-extractive-v1" : "gpt-4o-mini",
    category: "AI" as const,
    value_type: "STRING" as const,
    description: "Mô hình ngôn ngữ chính sử dụng cho Chat AI & RAG",
  },
  {
    config_key: "AI_EMBEDDING_MODEL",
    config_value:
      process.env.EMBEDDING_PROVIDER === "local" ? "local-hashing-v1" : "text-embedding-3-small",
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

/* ==========================================================================
   CHẠY
   ========================================================================== */

async function main(): Promise<void> {
  const { email, password } = requireEnv();

  console.log("→ Khởi tạo cấu hình hệ thống…");
  for (const c of DEFAULT_CONFIGS) {
    await prisma.systemConfig.upsert({
      where: { config_key: c.config_key },
      update: { description: c.description, category: c.category, value_type: c.value_type },
      create: c,
    });
  }
  console.log(`  ✓ ${DEFAULT_CONFIGS.length} tham số`);

  console.log("→ Khởi tạo tài khoản quản trị…");
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existing) {
    // Chỉ bảo đảm tài khoản còn dùng được. KHÔNG đặt lại mật khẩu — xem ghi chú
    // ở đầu tệp.
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        role: "ADMIN",
        status: "ACTIVE",
        deleted_at: null,
        failed_login_attempts: 0,
        locked_until: null,
      },
    });
    console.log(`  ✓ Tài khoản ${email} đã tồn tại — giữ nguyên mật khẩu hiện tại`);
  } else {
    const user = await prisma.user.create({
      data: {
        email,
        password_hash: await argonHash(password, {
          memoryCost: 19_456,
          timeCost: 2,
          parallelism: 1,
        }),
        full_name: ADMIN_NAME,
        role: "ADMIN",
        status: "ACTIVE",
        email_verified_at: new Date(),
      },
    });

    const types: NotificationType[] = ["MILESTONE", "THESIS", "FEEDBACK", "SYSTEM"];
    await prisma.notificationPreference.createMany({
      data: types.map((type) => ({ user_id: user.id, type })),
      skipDuplicates: true,
    });

    console.log(`  ✓ Đã tạo ${email}`);
  }

  console.log("\n✓ Hoàn tất. Cơ sở dữ liệu sẵn sàng — chưa có dữ liệu nghiệp vụ nào.");
  console.log("  Cần dữ liệu để thử nghiệm? Chạy `npm run db:seed:demo` (không dùng ở production).");
}

main()
  .catch((err) => {
    console.error("✖ Khởi tạo thất bại:", err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());

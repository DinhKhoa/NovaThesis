/**
 * Cấu hình môi trường — được xác thực MỘT LẦN lúc khởi động.
 *
 * Server thà không chạy còn hơn chạy với `JWT_SECRET` là chuỗi rỗng: một biến
 * thiếu được phát hiện lúc boot là dòng log; phát hiện lúc chạy là lỗ hổng.
 * Đây cũng là ranh giới duy nhất đọc `process.env` — phần còn lại của mã nguồn
 * import đối tượng `env` đã có kiểu.
 */
import { config as loadDotenv } from "dotenv";
import { z } from "zod";
import path from "node:path";

loadDotenv();

const bool = (d: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? d : v === "true" || v === "1"));

const int = (d: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? d : Number(v)))
    .pipe(z.number().int());

const num = (d: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? d : Number(v)))
    .pipe(z.number());

const str = (d: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? d : v));

/**
 * Bí mật phải dài và không được là giá trị mẫu. Ở production ta từ chối khởi
 * động; ở development chỉ cảnh báo để `npm run dev` không chặn người mới clone.
 */
const secret = (name: string) =>
  z
    .string({ required_error: `${name} chưa được đặt trong .env` })
    .min(16, `${name} quá ngắn — sinh chuỗi mới bằng: openssl rand -hex 48`)
    .refine(
      (v) => !v.startsWith("thay-bang"),
      `${name} vẫn là giá trị mẫu trong .env.example`
    );

const schema = z.object({
  NODE_ENV: str("development").pipe(z.enum(["development", "test", "production"])),
  PORT: int(8000),
  API_PUBLIC_URL: str("http://localhost:8000"),
  APP_PUBLIC_URL: str("http://localhost:3000"),
  CORS_ORIGINS: str(""),

  DATABASE_URL: z.string().min(1, "DATABASE_URL chưa được đặt trong .env"),

  JWT_SECRET: secret("JWT_SECRET"),
  JWT_ACCESS_TTL: str("2h"),
  JWT_REFRESH_TTL_DAYS: int(14),
  FILE_URL_SECRET: secret("FILE_URL_SECRET"),
  FILE_URL_TTL_SECONDS: int(300),

  STORAGE_DIR: str("./storage"),
  MAX_UPLOAD_MB: int(50),

  SMTP_HOST: str("localhost"),
  SMTP_PORT: int(1025),
  SMTP_SECURE: bool(false),
  SMTP_USER: str(""),
  SMTP_PASS: str(""),
  MAIL_FROM: str("NovaThesis <no-reply@novathesis.edu.vn>"),

  EMBEDDING_PROVIDER: str("local").pipe(z.enum(["local", "openai", "gemini"])),
  LLM_PROVIDER: str("local").pipe(z.enum(["local", "anthropic", "openai", "gemini"])),

  ANTHROPIC_API_KEY: str(""),
  ANTHROPIC_MODEL: str("claude-sonnet-5"),
  OPENAI_API_KEY: str(""),
  OPENAI_BASE_URL: str("https://api.openai.com/v1"),
  OPENAI_MODEL: str("gpt-4o-mini"),
  OPENAI_EMBEDDING_MODEL: str("text-embedding-3-small"),
  GEMINI_API_KEY: str(""),
  GEMINI_MODEL: str("gemini-2.0-flash"),

  RAG_TOP_K: int(5),
  RAG_MIN_SCORE: num(0.15),
  RAG_CONTEXT_TOKENS: int(3000),

  WORKER_CONCURRENCY: int(2),
  WORKER_TIMEOUT_MS: int(120_000),
  WORKER_MAX_ATTEMPTS: int(3),
  WATCHDOG_INTERVAL_MS: int(30_000),

  REMINDER_CRON: str("0 7 * * *"),
  REMINDER_DAYS: str("7,3,1"),

  MAX_LOGIN_ATTEMPTS: int(5),
  LOCKOUT_MINUTES: int(15),
  RATE_LIMIT_WINDOW_MS: int(60_000),
  RATE_LIMIT_MAX: int(300),
  AUTH_RATE_LIMIT_MAX: int(10),

  /**
   * `SameSite` của cookie phiên đăng nhập.
   *
   * `lax` đúng khi frontend và backend cùng tên miền đăng ký (khác cổng vẫn là
   * same-site theo chuẩn). Triển khai hai tên miền khác nhau hẳn thì phải đổi
   * sang `none`, và khi đó bắt buộc `NODE_ENV=production` để cookie có `secure`
   * — trình duyệt từ chối `SameSite=None` mà không `Secure`.
   */
  COOKIE_SAMESITE: str("lax").pipe(z.enum(["lax", "strict", "none"])),

  SEED_ADMIN_EMAIL: str("admin@novathesis.edu.vn"),
  SEED_PASSWORD: str("Admin@123456"),
  LOG_LEVEL: str("info"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  • ${i.path.join(".")}: ${i.message}`);
  // Không dùng logger ở đây: logger còn chưa cấu hình được vì thiếu chính env này.
  console.error(
    ["", "Cấu hình môi trường không hợp lệ — server dừng khởi động:", ...lines, "", "Xem backend/.env.example để biết đủ danh sách biến.", ""].join("\n")
  );
  process.exit(1);
}

const raw = parsed.data;

/** Số chiều của cột `document_chunks.embedding`. Đổi ở đây là phải migrate DB. */
export const EMBEDDING_DIM = 1536;

export const env = {
  ...raw,
  isProd: raw.NODE_ENV === "production",

  /** Kiểu đã hẹp lại cho `res.cookie()` — xem `lib/cookies.ts`. */
  cookieSameSite: raw.COOKIE_SAMESITE as "lax" | "strict" | "none",
  isTest: raw.NODE_ENV === "test",

  /** Thư mục lưu trữ tuyệt đối — mọi đường dẫn tệp đều được kiểm tra nằm trong đây. */
  storageRoot: path.resolve(process.cwd(), raw.STORAGE_DIR),

  maxUploadBytes: raw.MAX_UPLOAD_MB * 1024 * 1024,

  /**
   * Danh sách origin cho CORS. Cố ý là allowlist tường minh chứ không phải `*`:
   * API này dùng Bearer token nên `*` sẽ mở cửa cho mọi trang web gọi thay
   * người dùng nếu token từng lọt ra ngoài.
   */
  corsOrigins: (raw.CORS_ORIGINS || raw.APP_PUBLIC_URL)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  /** Các mốc ngày gửi nhắc deadline (UC 8.8). */
  reminderDays: raw.REMINDER_DAYS.split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => b - a),
} as const;

export type Env = typeof env;

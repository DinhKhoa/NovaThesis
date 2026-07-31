import { PrismaClient } from "@prisma/client";
import { env } from "../config/env";
import { logger } from "./logger";

/**
 * Prisma Client dùng chung.
 *
 * Một thể hiện duy nhất cho cả tiến trình: mỗi `new PrismaClient()` mở riêng
 * một connection pool, nên tạo nhiều lần là cách chắc chắn nhất để làm cạn
 * `max_connections` của PostgreSQL — đúng loại rò rỉ âm thầm mà
 * `Yêu cầu dự án.md` §3.3 cảnh báo.
 *
 * Biến toàn cục được giữ lại để lần hot-reload của `tsx watch` tái sử dụng
 * pool cũ thay vì mở thêm pool mới sau mỗi lần lưu tệp.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.isProd
      ? [{ emit: "event", level: "error" }]
      : [
          { emit: "event", level: "error" },
          { emit: "event", level: "warn" },
        ],
  });

prisma.$on("error" as never, (e: unknown) => logger.error({ prisma: e }, "Lỗi Prisma"));

if (!env.isProd) {
  globalForPrisma.prisma = prisma;
  prisma.$on("warn" as never, (e: unknown) => logger.warn({ prisma: e }, "Cảnh báo Prisma"));
}

/** Đóng pool sạch sẽ khi tiến trình dừng, tránh để lại kết nối treo. */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}

/**
 * Điểm khởi động tiến trình.
 */
import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { prisma, disconnectPrisma } from "./lib/prisma";
import { ensureStorage } from "./lib/storage";
import { startScheduler, stopScheduler } from "./jobs/scheduler";
import { documentQueue, resumePendingJobs } from "./workers/document-indexer";
import { vectorHealth } from "./services/ai/vector.repository";

async function main(): Promise<void> {
  await ensureStorage();

  // Kiểm tra CSDL trước khi mở cổng: server nhận request rồi mới phát hiện
  // không kết nối được sẽ trả 500 cho mọi người thay vì thất bại rõ ràng ở đây.
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    logger.fatal(
      { err },
      "Không kết nối được PostgreSQL. Kiểm tra DATABASE_URL và chạy `docker compose up -d`."
    );
    process.exit(1);
  }

  const health = await vectorHealth().catch(() => null);
  if (!health?.extension) {
    logger.fatal(
      "Extension pgvector chưa được cài. Chạy `npx prisma migrate deploy` hoặc dùng ảnh pgvector/pgvector."
    );
    process.exit(1);
  }
  if (!health.hnswIndex) {
    logger.warn(
      "Thiếu chỉ mục HNSW — tìm kiếm vector sẽ quét tuần tự. Chạy `npx prisma migrate deploy`."
    );
  }

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(
      {
        port: env.PORT,
        env: env.NODE_ENV,
        embedding: env.EMBEDDING_PROVIDER,
        llm: env.LLM_PROVIDER,
        indexedChunks: health.indexedChunks,
      },
      `NovaThesis API đang chạy tại ${env.API_PUBLIC_URL}`
    );
  });

  startScheduler();
  await resumePendingJobs();

  /* --- Tắt êm ---------------------------------------------------------- */
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Đang tắt server…");

    // Ngừng nhận kết nối mới, nhưng để request đang chạy hoàn tất.
    server.close(async () => {
      stopScheduler();
      documentQueue.abortAll();
      await disconnectPrisma();
      logger.info("Đã đóng kết nối. Tạm biệt.");
      process.exit(0);
    });

    // Cắt cứng sau 10 giây: một request treo không được phép giữ tiến trình
    // sống mãi và chặn lần khởi động lại tiếp theo.
    setTimeout(() => {
      logger.warn("Hết thời gian chờ tắt êm — buộc thoát.");
      process.exit(1);
    }, 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Ngoại lệ không bắt được để lại tiến trình ở trạng thái không xác định:
  // ghi log rồi thoát để process manager khởi động lại sạch sẽ.
  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Ngoại lệ không được bắt");
    shutdown("uncaughtException");
  });
  process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "Promise bị từ chối mà không xử lý");
  });
}

main().catch((err) => {
  logger.fatal({ err }, "Khởi động thất bại");
  process.exit(1);
});

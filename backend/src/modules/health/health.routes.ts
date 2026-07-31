/**
 * TELEMETRY & HEALTH DIAGNOSTICS
 *
 * `Yêu cầu dự án.md` §2.4: "Thay vì chỉ có Error Log, hãy xây dựng các API
 * Health Check theo thời gian thực (giám sát CPU, RAM, trạng thái DB Connection,
 * Worker Queue) tương tự như việc đọc các thanh ghi trạng thái (status
 * registers) hoặc sensor data cho Admin."
 *
 * Ba mức, đúng như phân tầng chẩn đoán trong firmware:
 *   • `/health`             — nhịp tim, không chạm CSDL. Dùng cho load balancer.
 *   • `/health/ready`       — kiểm tra phụ thuộc, quyết định có nhận traffic không.
 *   • `/health/diagnostics` — toàn bộ thanh ghi trạng thái. Chỉ Admin.
 */
import os from "node:os";
import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { asyncHandler } from "../../lib/http";
import { requireAuth, requireRole } from "../../middleware/auth";
import { documentQueue } from "../../workers/document-indexer";
import { vectorHealth } from "../../services/ai/vector.repository";
import { pendingMailCount, verifyMailer } from "../../lib/mailer";
import { embeddingModelName } from "../../services/ai/embeddings";
import { hasGenerativeModel, llmModelName } from "../../services/ai/llm";

export const healthRouter = Router();

const startedAt = Date.now();

/* Đo tải CPU giữa hai lần lấy mẫu. `os.loadavg()` luôn là 0 trên Windows, còn
   `process.cpuUsage()` chỉ tính tiến trình này — cần cả hai để đọc đúng. */
let lastCpu = process.cpuUsage();
let lastCpuAt = Date.now();

function cpuPercent(): number {
  const now = Date.now();
  const diff = process.cpuUsage(lastCpu);
  const elapsedMs = now - lastCpuAt;
  lastCpu = process.cpuUsage();
  lastCpuAt = now;
  if (elapsedMs <= 0) return 0;
  const usedMs = (diff.user + diff.system) / 1000;
  return Number(((usedMs / (elapsedMs * os.cpus().length)) * 100).toFixed(2));
}

function memory() {
  const mem = process.memoryUsage();
  return {
    rss_mb: round(mem.rss / 1048576),
    heap_used_mb: round(mem.heapUsed / 1048576),
    heap_total_mb: round(mem.heapTotal / 1048576),
    external_mb: round(mem.external / 1048576),
    system_free_mb: round(os.freemem() / 1048576),
    system_total_mb: round(os.totalmem() / 1048576),
  };
}

function round(n: number): number {
  return Number(n.toFixed(1));
}

/** Nhịp tim: không I/O, luôn nhanh. */
healthRouter.get("/", (_req, res) => {
  res.json({
    status: "NOMINAL",
    uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
  });
});

/** Sẵn sàng nhận traffic: CSDL trả lời được và pgvector còn nguyên. */
healthRouter.get(
  "/ready",
  asyncHandler(async (_req, res) => {
    const started = Date.now();
    let dbOk = false;
    let dbLatency = -1;

    try {
      await prisma.$queryRaw`SELECT 1`;
      dbLatency = Date.now() - started;
      dbOk = true;
    } catch {
      dbOk = false;
    }

    const vector = dbOk ? await vectorHealth().catch(() => null) : null;
    const ready = dbOk && Boolean(vector?.extension);

    res.status(ready ? 200 : 503).json({
      status: ready ? "READY" : "NOT_READY",
      database: { connected: dbOk, latency_ms: dbLatency },
      pgvector: {
        extension: vector?.extension ?? false,
        hnsw_index: vector?.hnswIndex ?? false,
      },
    });
  })
);

/**
 * Bảng thanh ghi trạng thái đầy đủ.
 *
 * Yêu cầu quyền Admin: độ trễ CSDL, độ sâu hàng đợi và cấu hình nhà cung cấp AI
 * là bản đồ hạ tầng, không phải thông tin công khai.
 */
healthRouter.get(
  "/diagnostics",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (_req, res) => {
    /*
     * Đo độ trễ CSDL bằng MỘT truy vấn tối thiểu, tách khỏi mọi thứ khác.
     *
     * Bản đầu bọc `Date.now()` quanh cả `Promise.all` gồm cả `verifyMailer()`,
     * nên thời gian bắt tay SMTP bị báo cáo thành "độ trễ CSDL" — con số đo
     * được là 342ms trong khi CSDL thực tế trả lời dưới 5ms, và nó kích hoạt
     * cảnh báo sai. Một chỉ số chẩn đoán nói dối còn tệ hơn không có chỉ số nào.
     */
    const dbStart = Date.now();
    const dbAlive = await prisma
      .$queryRaw`SELECT 1`
      .then(() => true)
      .catch(() => false);
    const dbLatency = Date.now() - dbStart;

    const [counts, vector, mailOk] = await Promise.all([
      dbAlive
        ? prisma
            .$transaction([
              prisma.user.count({ where: { deleted_at: null } }),
              prisma.thesis.count({ where: { deleted_at: null } }),
              prisma.document.count({ where: { deleted_at: null } }),
              prisma.document.count({ where: { status_ai: "ERROR", deleted_at: null } }),
              prisma.aIChatMessage.count(),
            ])
            .catch(() => null)
        : Promise.resolve(null),
      vectorHealth().catch(() => null),
      verifyMailer(),
    ]);

    const queue = documentQueue.getStats();

    // Ngưỡng cảnh báo: hàng đợi ùn hoặc CSDL chậm là dấu hiệu sớm, thấy trước
    // khi người dùng bắt đầu phàn nàn.
    const warnings: string[] = [];
    if (dbLatency > 500) warnings.push(`Độ trễ CSDL cao: ${dbLatency}ms`);
    if (queue.pending > 20) warnings.push(`Hàng đợi lập chỉ mục ùn: ${queue.pending} tác vụ`);
    if (queue.oldestPendingMs > 300_000) warnings.push("Có tác vụ chờ quá 5 phút");
    if (!vector?.hnswIndex) warnings.push("Thiếu chỉ mục HNSW — tìm kiếm vector sẽ chậm");
    if (!mailOk) warnings.push("Không kết nối được máy chủ SMTP");
    if ((counts?.[3] ?? 0) > 0) warnings.push(`${counts?.[3]} tài liệu lập chỉ mục lỗi`);

    res.json({
      status: warnings.length === 0 ? "NOMINAL" : "DEGRADED",
      warnings,
      uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),

      runtime: {
        node: process.version,
        platform: `${os.platform()} ${os.arch()}`,
        cpu_cores: os.cpus().length,
        cpu_percent: cpuPercent(),
        load_average: os.loadavg().map((n) => Number(n.toFixed(2))),
        memory: memory(),
      },

      database: {
        connected: counts !== null,
        latency_ms: dbLatency,
        users: counts?.[0] ?? null,
        theses: counts?.[1] ?? null,
        documents: counts?.[2] ?? null,
        documents_failed: counts?.[3] ?? null,
        ai_messages: counts?.[4] ?? null,
      },

      pgvector: {
        extension: vector?.extension ?? false,
        hnsw_index: vector?.hnswIndex ?? false,
        indexed_chunks: vector?.indexedChunks ?? 0,
        dimensions: 1536,
      },

      // Đây là "watchdog timer" mà yêu cầu dự án nhắc tới, đọc ra dạng số liệu.
      worker: {
        ...queue,
        concurrency: env.WORKER_CONCURRENCY,
        timeout_ms: env.WORKER_TIMEOUT_MS,
        max_attempts: env.WORKER_MAX_ATTEMPTS,
        watchdog_interval_ms: env.WATCHDOG_INTERVAL_MS,
      },

      mail: { smtp_reachable: mailOk, queued: pendingMailCount() },

      ai: {
        embedding_provider: env.EMBEDDING_PROVIDER,
        embedding_model: embeddingModelName(),
        llm_provider: env.LLM_PROVIDER,
        llm_model: llmModelName(),
        generative_model_available: hasGenerativeModel(),
        rag_top_k: env.RAG_TOP_K,
        rag_context_tokens: env.RAG_CONTEXT_TOKENS,
      },
    });
  })
);

/**
 * HÀNG ĐỢI TÁC VỤ NỀN CÓ WATCHDOG
 *
 * `Yêu cầu dự án.md` §2.4 mô tả đúng yêu cầu: đọc PDF và vector hoá là tác vụ
 * rất nặng, phải chạy ngầm, và cần một cơ chế kiểu Watchdog Timer — worker treo
 * quá thời gian thì bị huỷ và khởi động lại.
 *
 * Cài đặt là hàng đợi trong tiến trình chứ không phải Redis/BullMQ. Lý do thẳng
 * thắn: quy mô một khoa là vài chục tài liệu mỗi ngày, và §3.3 yêu cầu không
 * over-engineering. Đánh đổi được ghi rõ và được xử lý:
 *
 *   • Job đang chờ trong RAM sẽ mất khi tiến trình chết → trạng thái thật nằm ở
 *     cột `documents.status_ai` trong CSDL, và `resumePendingJobs()` nạp lại
 *     hàng đợi mỗi lần khởi động.
 *   • Chỉ chạy được trên một tiến trình → có ghi chú ở `resumePendingJobs()`.
 *
 * Watchdog ở đây là `AbortController` + `setTimeout`, tương ứng với việc nạp
 * lại bộ đếm watchdog trong firmware: job không "vỗ về" bộ đếm kịp thì bị cắt.
 */
import { setTimeout as delay } from "node:timers/promises";
import { logger } from "../lib/logger";

export interface JobResult {
  ok: boolean;
  /** Lỗi vĩnh viễn: đừng thử lại (tệp hỏng, định dạng không hỗ trợ). */
  permanent?: boolean;
  message?: string;
}

export interface JobHandler<T> {
  name: string;
  run: (payload: T, signal: AbortSignal) => Promise<JobResult>;
  /** Gọi khi job hết số lần thử hoặc gặp lỗi vĩnh viễn. */
  onFailure?: (payload: T, reason: string) => Promise<void>;
}

interface QueuedJob<T> {
  id: string;
  payload: T;
  attempt: number;
  enqueuedAt: number;
}

export interface QueueOptions {
  concurrency: number;
  timeoutMs: number;
  maxAttempts: number;
}

export interface QueueStats {
  name: string;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  timedOut: number;
  retried: number;
  /** Thời gian job cũ nhất đã nằm chờ (ms) — chỉ dấu tắc nghẽn. */
  oldestPendingMs: number;
}

export class JobQueue<T> {
  private readonly queue: QueuedJob<T>[] = [];
  private readonly running = new Map<string, { controller: AbortController; startedAt: number }>();
  private readonly seen = new Set<string>();
  private stats = { completed: 0, failed: 0, timedOut: 0, retried: 0 };
  private draining = false;

  constructor(
    private readonly handler: JobHandler<T>,
    private readonly options: QueueOptions
  ) {}

  /**
   * Đưa job vào hàng đợi. Trùng `id` bị bỏ qua.
   *
   * Chống trùng quan trọng hơn vẻ ngoài của nó: người dùng bấm "Tóm tắt lại"
   * hai lần sẽ tạo hai job cùng nhúng một tài liệu, và cái chậm hơn sẽ ghi đè
   * kết quả của cái nhanh hơn.
   */
  enqueue(id: string, payload: T): boolean {
    if (this.seen.has(id) || this.running.has(id)) return false;
    this.seen.add(id);
    this.queue.push({ id, payload, attempt: 1, enqueuedAt: Date.now() });
    void this.pump();
    return true;
  }

  private async pump(): Promise<void> {
    if (this.draining) return;
    this.draining = true;

    try {
      while (this.queue.length > 0 && this.running.size < this.options.concurrency) {
        const job = this.queue.shift();
        if (!job) break;
        void this.execute(job);
      }
    } finally {
      this.draining = false;
    }
  }

  private async execute(job: QueuedJob<T>): Promise<void> {
    const controller = new AbortController();
    this.running.set(job.id, { controller, startedAt: Date.now() });

    // Watchdog: hết giờ thì phát tín hiệu huỷ. Handler quan sát `signal` và
    // dừng ở điểm kiểm tra gần nhất, nên tiến trình không bị bỏ lại với một
    // vòng lặp chạy hoang.
    const watchdog = setTimeout(() => {
      controller.abort(new Error("watchdog-timeout"));
    }, this.options.timeoutMs);

    let result: JobResult;
    try {
      result = await this.handler.run(job.payload, controller.signal);
    } catch (err) {
      const aborted = controller.signal.aborted;
      if (aborted) this.stats.timedOut++;
      result = {
        ok: false,
        permanent: false,
        message: aborted
          ? `Quá thời gian xử lý (${Math.round(this.options.timeoutMs / 1000)}s)`
          : err instanceof Error
            ? err.message
            : String(err),
      };
    } finally {
      clearTimeout(watchdog);
      this.running.delete(job.id);
      this.seen.delete(job.id);
    }

    if (result.ok) {
      this.stats.completed++;
    } else if (result.permanent || job.attempt >= this.options.maxAttempts) {
      this.stats.failed++;
      logger.error(
        { job: this.handler.name, id: job.id, attempt: job.attempt, reason: result.message },
        "Tác vụ nền thất bại vĩnh viễn"
      );
      await this.handler
        .onFailure?.(job.payload, result.message ?? "Lỗi không xác định")
        .catch((err) => logger.error({ err }, "onFailure của hàng đợi ném lỗi"));
    } else {
      this.stats.retried++;
      // Backoff luỹ thừa: nhà cung cấp embedding đang quá tải mà thử lại ngay
      // lập tức chỉ làm nó quá tải thêm.
      const backoff = Math.min(30_000, 1000 * 2 ** job.attempt);
      logger.warn(
        { job: this.handler.name, id: job.id, attempt: job.attempt, backoff, reason: result.message },
        "Tác vụ nền lỗi — sẽ thử lại"
      );
      await delay(backoff);
      this.seen.add(job.id);
      this.queue.push({ ...job, attempt: job.attempt + 1 });
    }

    void this.pump();
  }

  /** Huỷ mọi job đang chạy — dùng khi tắt server. */
  abortAll(): void {
    for (const [, entry] of this.running) entry.controller.abort(new Error("shutdown"));
    this.queue.length = 0;
    this.seen.clear();
  }

  getStats(): QueueStats {
    const oldest = this.queue[0]?.enqueuedAt;
    return {
      name: this.handler.name,
      pending: this.queue.length,
      running: this.running.size,
      oldestPendingMs: oldest ? Date.now() - oldest : 0,
      ...this.stats,
    };
  }

  get depth(): number {
    return this.queue.length + this.running.size;
  }
}

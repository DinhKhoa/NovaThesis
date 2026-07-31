/**
 * VECTOR HOÁ (EMBEDDING)
 *
 * Ba nhà cung cấp sau một giao diện chung. Mặc định là `local` để toàn bộ luồng
 * pgvector — chia đoạn, nhúng, đánh chỉ mục HNSW, tìm kiếm cosine, trích dẫn —
 * chạy được ngay sau khi `git clone` mà không cần khoá API và không gửi nội
 * dung luận văn của sinh viên ra dịch vụ bên thứ ba.
 *
 * Điều cần nói thẳng: `local` là vector hoá TỪ VỰNG (feature hashing trên
 * unigram/bigram từ và 4-gram ký tự), không phải vector ngữ nghĩa học từ dữ
 * liệu. Nó khớp rất tốt cách diễn đạt gần giống nhau và biến thể hình thái,
 * nhưng không nhận ra "ô tô" và "xe hơi" là một. Muốn ngữ nghĩa thật thì đặt
 * `EMBEDDING_PROVIDER=openai` — phần còn lại của hệ thống không đổi một dòng.
 */
import { env, EMBEDDING_DIM } from "../../config/env";
import { logger } from "../../lib/logger";
import { contentTokens, stripDiacritics } from "./text";

export interface EmbeddingResult {
  vectors: number[][];
  model: string;
}

/* ==========================================================================
   NHÀ CUNG CẤP CỤC BỘ — FEATURE HASHING
   ========================================================================== */

/**
 * FNV-1a 32-bit. Chọn vì rẻ, phân bố đều và quan trọng nhất là TẤT ĐỊNH giữa
 * các lần chạy: vector đã lưu trong CSDL phải so khớp được với vector sinh ra
 * hôm nay. Một hàm băm có seed ngẫu nhiên (như hash của V8) sẽ làm hỏng toàn bộ
 * chỉ mục sau mỗi lần khởi động lại.
 */
function fnv1a(str: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Cộng dồn một đặc trưng vào vector, dùng dấu băm để bù trừ va chạm. */
function addFeature(vec: Float64Array, feature: string, weight: number): void {
  const h = fnv1a(feature);
  const index = h % EMBEDDING_DIM;
  // Băm thứ hai quyết định dấu: hai đặc trưng khác nhau rơi vào cùng ô sẽ triệt
  // tiêu nhau một nửa số lần thay vì luôn cộng dồn, nên nhiễu do va chạm không
  // tích luỹ theo một hướng.
  const sign = fnv1a(feature, 0x9e3779b9) & 1 ? 1 : -1;
  vec[index] = (vec[index] ?? 0) + weight * sign;
}

/**
 * Sinh 4-gram ký tự CỦA MỘT TỪ, có đệm ranh giới.
 *
 * Cố ý chỉ chạy trên từng token thay vì trên cả chuỗi đã ghép.
 *
 * Lý do là một bài học đo được: bản đầu tiên rải n-gram trên toàn văn bản, và
 * vì tiếng Việt viết rời từng âm tiết, những mảnh cực phổ biến ("ng ", " th",
 * "nh ", " ch") xuất hiện trong MỌI tài liệu. Chúng tạo ra một sàn tương đồng
 * giả: đo thực tế cho thấy câu hỏi lạc đề hoàn toàn ("Món phở bò nấu thế nào?")
 * vẫn đạt 0,119 — gần bằng câu hỏi đúng chủ đề ở 0,128. Ngưỡng nào cũng không
 * tách nổi hai con số đó.
 *
 * Giới hạn ở token dài từ 5 ký tự trở lên giữ đúng phần có ích — chịu lỗi chính
 * tả và biến thể có/không dấu cho thuật ngữ chuyên môn ("ivfflat", "watchdog",
 * "pgvector", "embedding") — mà không nhận lại cái sàn kia, vì âm tiết tiếng
 * Việt thông dụng gần như luôn ngắn hơn 5 ký tự.
 */
function tokenCharNgrams(token: string, n: number): string[] {
  if (token.length < 5) return [];
  const padded = `_${token}_`;
  const out: string[] = [];
  for (let i = 0; i + n <= padded.length; i++) out.push(padded.slice(i, i + n));
  return out;
}

/**
 * Nhúng cục bộ một đoạn văn bản.
 *
 * Ba họ đặc trưng, trọng số giảm dần theo độ đặc hiệu:
 *   • bigram từ (2.2) — cụm chuyên môn: "học máy", "vector hoá", "hệ thống nhúng"
 *   • unigram từ (1.0) — nền tảng
 *   • 4-gram ký tự trong từ dài (0.30) — chịu lỗi chính tả và thiếu dấu
 *
 * Trọng số tần suất dưới tuyến tính (1 + log tf) thay vì đếm thô: một từ xuất
 * hiện 50 lần không có nghĩa nó quan trọng gấp 50 lần từ xuất hiện một lần.
 */
export function embedLocal(text: string): number[] {
  const vec = new Float64Array(EMBEDDING_DIM);
  const tokens = contentTokens(text);

  if (tokens.length === 0) {
    // Vector rỗng không chuẩn hoá được. Trả vector zero — pgvector vẫn lưu
    // được, và mọi độ tương đồng cosine với nó sẽ là 0, đúng như mong đợi.
    return Array.from(vec);
  }

  const counts = new Map<string, number>();
  const bump = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;
    bump(`w:${token}`);

    const next = tokens[i + 1];
    if (next) bump(`b:${token}_${next}`);

    for (const g of tokenCharNgrams(token, 4)) bump(`c:${g}`);
  }

  for (const [feature, tf] of counts) {
    const base = feature.startsWith("b:") ? 2.2 : feature.startsWith("c:") ? 0.3 : 1.0;
    addFeature(vec, feature, base * (1 + Math.log(tf)));
  }

  return l2Normalize(vec);
}

/**
 * Chuẩn hoá L2.
 *
 * Bắt buộc, không phải tuỳ chọn: pgvector tính khoảng cách cosine bằng toán tử
 * `<=>`, và độ dài vector chưa chuẩn hoá sẽ khiến đoạn văn dài luôn thắng đoạn
 * ngắn bất kể nội dung.
 */
function l2Normalize(vec: Float64Array): number[] {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const norm = Math.sqrt(sum);
  if (norm === 0) return Array.from(vec);
  const out = new Array<number>(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = (vec[i] ?? 0) / norm;
  return out;
}

/* ==========================================================================
   NHÀ CUNG CẤP TỪ XA
   ========================================================================== */

/**
 * Đưa vector về đúng `EMBEDDING_DIM`.
 *
 * `text-embedding-004` của Gemini trả 768 chiều còn cột CSDL là 1536. Đệm số 0
 * ở đuôi giữ nguyên mọi tích vô hướng giữa các vector cùng nhà cung cấp, nên độ
 * tương đồng không đổi. Đổi nhà cung cấp SAU KHI đã đánh chỉ mục vẫn cần nhúng
 * lại toàn bộ — vector của hai model khác nhau không nằm cùng không gian.
 */
function fitDimension(vector: number[]): number[] {
  if (vector.length === EMBEDDING_DIM) return vector;
  if (vector.length > EMBEDDING_DIM) return vector.slice(0, EMBEDDING_DIM);
  return [...vector, ...new Array<number>(EMBEDDING_DIM - vector.length).fill(0)];
}

async function embedOpenAI(texts: string[]): Promise<number[][]> {
  const res = await fetch(`${env.OPENAI_BASE_URL}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: env.OPENAI_EMBEDDING_MODEL, input: texts }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    throw new Error(`OpenAI embeddings HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  }

  const body = (await res.json()) as { data: { embedding: number[]; index: number }[] };
  // API không cam kết giữ thứ tự; sắp lại theo `index` để vector không bị gán
  // nhầm cho đoạn khác — lỗi này im lặng và cực khó lần ra.
  return body.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((d) => fitDimension(d.embedding));
}

async function embedGemini(texts: string[]): Promise<number[][]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=${env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: texts.map((t) => ({
        model: "models/text-embedding-004",
        content: { parts: [{ text: t }] },
      })),
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    throw new Error(`Gemini embeddings HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  }

  const body = (await res.json()) as { embeddings: { values: number[] }[] };
  return body.embeddings.map((e) => fitDimension(e.values));
}

/* ==========================================================================
   API CÔNG KHAI
   ========================================================================== */

export function embeddingModelName(): string {
  switch (env.EMBEDDING_PROVIDER) {
    case "openai":
      return env.OPENAI_EMBEDDING_MODEL;
    case "gemini":
      return "text-embedding-004";
    default:
      return "local-hashing-v1";
  }
}

/**
 * Nhúng một lô văn bản.
 *
 * Nhà cung cấp từ xa hỏng thì tự động lui về `local` thay vì làm hỏng cả tài
 * liệu: một chỉ mục từ vựng dùng được vẫn hơn hẳn không có chỉ mục nào. Sự việc
 * được ghi log ở mức `error` để không trôi qua âm thầm.
 */
export async function embedBatch(texts: string[]): Promise<EmbeddingResult> {
  if (texts.length === 0) return { vectors: [], model: embeddingModelName() };

  const provider = env.EMBEDDING_PROVIDER;

  if (provider === "openai" && env.OPENAI_API_KEY) {
    try {
      return { vectors: await embedOpenAI(texts), model: env.OPENAI_EMBEDDING_MODEL };
    } catch (err) {
      logger.error({ err }, "Embedding OpenAI thất bại — tạm dùng vector hoá cục bộ");
    }
  }

  if (provider === "gemini" && env.GEMINI_API_KEY) {
    try {
      return { vectors: await embedGemini(texts), model: "text-embedding-004" };
    } catch (err) {
      logger.error({ err }, "Embedding Gemini thất bại — tạm dùng vector hoá cục bộ");
    }
  }

  if (provider !== "local") {
    logger.warn(
      { provider },
      "EMBEDDING_PROVIDER khác local nhưng thiếu API key — dùng vector hoá cục bộ"
    );
  }

  return { vectors: texts.map(embedLocal), model: "local-hashing-v1" };
}

export async function embedOne(text: string): Promise<number[]> {
  const { vectors } = await embedBatch([text]);
  return vectors[0] ?? new Array<number>(EMBEDDING_DIM).fill(0);
}

/** Chuyển sang literal mà PostgreSQL ép được về kiểu `vector`. */
export function toVectorLiteral(vector: number[]): string {
  // `toFixed(6)` giữ literal gọn: 1536 chiều với đủ 17 chữ số thập phân là
  // ~30 KB mỗi câu lệnh, phần lớn là nhiễu dưới ngưỡng phân giải của float4 mà
  // pgvector dùng để lưu.
  return `[${vector.map((v) => (Number.isFinite(v) ? v.toFixed(6) : "0")).join(",")}]`;
}

/** Cosine similarity — dùng cho kiểm thử và cho đối chiếu trùng lặp cục bộ. */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

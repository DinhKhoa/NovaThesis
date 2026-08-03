/**
 * SINH VĂN BẢN
 *
 * Bốn nhà cung cấp sau một giao diện chung, tất cả đều hỗ trợ streaming vì UC
 * 6.5 yêu cầu trả lời từng phần giống ChatGPT.
 *
 * `local` không gọi mô hình nào: nó dựng câu trả lời bằng cách chọn và ghép các
 * câu liên quan nhất trong tài liệu tìm được (extractive). Đánh đổi rất rõ ràng
 * và cố ý — câu văn kém mượt hơn mô hình sinh, nhưng mọi chữ đều xuất phát từ
 * tài liệu thật của sinh viên, nên không thể bịa. Với một hệ thống mà business
 * rule UC 6.5 ghi thẳng "không bịa đặt (hallucination)", đó là mặc định an toàn
 * khi chưa cấu hình khoá API.
 */
import { env } from "../../config/env";
import { logger } from "../../lib/logger";
import { estimateTokens, normalizeText, splitSentences, stripDiacritics } from "./text";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface GenerateOptions {
  system?: string;
  messages: ChatTurn[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export function llmModelName(): string {
  switch (env.LLM_PROVIDER) {
    case "anthropic":
      return env.ANTHROPIC_MODEL;
    case "openai":
      return env.OPENAI_MODEL;
    case "gemini":
      return env.GEMINI_MODEL;
    default:
      return "local-extractive-v1";
  }
}

/** Nhà cung cấp thật đã sẵn sàng (đúng provider và có khoá)? */
export function hasGenerativeModel(): boolean {
  switch (env.LLM_PROVIDER) {
    case "anthropic":
      return Boolean(env.ANTHROPIC_API_KEY);
    case "openai":
      return Boolean(env.OPENAI_API_KEY);
    case "gemini":
      return Boolean(env.GEMINI_API_KEY);
    default:
      return false;
  }
}

/* ==========================================================================
   CHỐNG PROMPT INJECTION
   ========================================================================== */

/**
 * `Yêu cầu dự án.md` §2.1 yêu cầu validate đầu vào trước khi đưa vào LLM.
 *
 * Không thể "làm sạch" prompt injection theo kiểu lọc từ khoá — đó là trò đuổi
 * bắt không có hồi kết. Ở đây làm ba việc thực tế hơn:
 *   • cắt độ dài, để một prompt khổng lồ không đẩy chỉ dẫn hệ thống ra khỏi cửa sổ;
 *   • vô hiệu hoá các nhãn vai trò mà nhà cung cấp dùng để phân tách lượt nói;
 *   • bọc nội dung tài liệu trong thẻ dữ liệu và nói rõ với model rằng phần bên
 *     trong là dữ liệu, không phải chỉ dẫn.
 *
 * Chỉ dẫn hệ thống luôn nằm ở kênh riêng (`system`), không nối chuỗi cùng dữ
 * liệu người dùng — đây mới là lớp phòng thủ chính.
 */
export function sanitizePrompt(input: string, maxChars = 4000): string {
  return normalizeText(input)
    .slice(0, maxChars)
    .replace(/^\s*(system|assistant|human|user)\s*:/gim, "$1 -")
    .replace(/<\/?(system|assistant|human|user|tai_lieu)>/gi, "");
}

/* ==========================================================================
   NHÀ CUNG CẤP TỪ XA
   ========================================================================== */

/** Đọc luồng SSE và trả về từng dòng `data:`. */
async function* sseLines(response: Response): AsyncGenerator<string> {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Giữ lại phần đuôi chưa trọn dòng: gói TCP cắt ngang giữa một sự kiện
      // JSON là chuyện bình thường, và parse nửa dòng sẽ ném lỗi.
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data:")) yield trimmed.slice(5).trim();
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

async function* streamAnthropic(opts: GenerateOptions): AsyncGenerator<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.3,
      system: opts.system,
      messages: opts.messages,
      stream: true,
    }),
    signal: opts.signal,
  });

  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}: ${await res.text().catch(() => "")}`);

  for await (const data of sseLines(res)) {
    if (data === "[DONE]") return;
    try {
      const event = JSON.parse(data) as {
        type: string;
        delta?: { type?: string; text?: string };
      };
      if (event.type === "content_block_delta" && event.delta?.text) yield event.delta.text;
    } catch {
      // Dòng keep-alive hoặc sự kiện chưa biết — bỏ qua, không làm hỏng luồng.
    }
  }
}

async function* streamOpenAI(opts: GenerateOptions): AsyncGenerator<string> {
  const messages = opts.system
    ? [{ role: "system" as const, content: opts.system }, ...opts.messages]
    : opts.messages;

  const res = await fetch(`${env.OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      messages,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.3,
      stream: true,
    }),
    signal: opts.signal,
  });

  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${await res.text().catch(() => "")}`);

  for await (const data of sseLines(res)) {
    if (data === "[DONE]") return;
    try {
      const event = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
      const text = event.choices?.[0]?.delta?.content;
      if (text) yield text;
    } catch {
      /* bỏ qua dòng không phải JSON */
    }
  }
}

async function* streamGemini(opts: GenerateOptions): AsyncGenerator<string> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}` +
    `:streamGenerateContent?alt=sse&key=${env.GEMINI_API_KEY}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: opts.system ? { parts: [{ text: opts.system }] } : undefined,
      contents: opts.messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        maxOutputTokens: opts.maxTokens ?? 1024,
        temperature: opts.temperature ?? 0.3,
      },
    }),
    signal: opts.signal,
  });

  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${await res.text().catch(() => "")}`);

  for await (const data of sseLines(res)) {
    try {
      const event = JSON.parse(data) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      for (const part of event.candidates?.[0]?.content?.parts ?? []) {
        if (part.text) yield part.text;
      }
    } catch {
      /* bỏ qua */
    }
  }
}

/* ==========================================================================
   API CÔNG KHAI
   ========================================================================== */

/**
 * Sinh văn bản dạng luồng.
 *
 * Người gọi phải cung cấp `fallback` — văn bản dùng khi nhà cung cấp không sẵn
 * sàng hoặc lỗi. Buộc phải có, vì trả về chuỗi rỗng ở tầng này sẽ hiện ra thành
 * một bong bóng trống trên giao diện mà không giải thích được gì.
 */
export async function* streamCompletion(
  opts: GenerateOptions & { fallback: string }
): AsyncGenerator<string> {
  if (!hasGenerativeModel()) {
    yield* pseudoStream(opts.fallback);
    return;
  }

  try {
    switch (env.LLM_PROVIDER) {
      case "anthropic":
        yield* streamAnthropic(opts);
        return;
      case "openai":
        yield* streamOpenAI(opts);
        return;
      case "gemini":
        yield* streamGemini(opts);
        return;
      default:
        yield* pseudoStream(opts.fallback);
        return;
    }
  } catch (err) {
    if (opts.signal?.aborted) return;
    logger.error({ err, provider: env.LLM_PROVIDER }, "Gọi mô hình sinh thất bại");
    // Không được tái dùng opts.fallback ở đây: fallback là thông báo "không tìm
    // thấy tài liệu liên quan" của tầng RAG. Nếu model đã cấu hình đúng nhưng
    // lời gọi API lỗi (401, 429, timeout...), trả về fallback đó sẽ khiến người
    // dùng tưởng nhầm là hệ thống truy hồi tài liệu bị hỏng, trong khi lỗi thật
    // sự nằm ở việc gọi mô hình sinh.
    yield* pseudoStream(
      "⚠ Trợ lý AI đang gặp sự cố kết nối hoặc cấu hình API Key không hợp lệ. " +
        "Vui lòng kiểm tra lại hệ thống (Lỗi gọi mô hình sinh thất bại)."
    );
  }
}

/**
 * Phát văn bản có sẵn theo từng cụm để giao diện vẫn thấy dòng chảy.
 *
 * Cắt theo từ chứ không theo ký tự: đọc giống người gõ thay vì máy điện báo, và
 * ít lần render hơn hẳn.
 */
async function* pseudoStream(text: string): AsyncGenerator<string> {
  const words = text.split(/(\s+)/);
  for (let i = 0; i < words.length; i += 4) {
    yield words.slice(i, i + 4).join("");
    await new Promise((r) => setTimeout(r, 18));
  }
}

/** Sinh văn bản một lần (không streaming). */
export async function complete(opts: GenerateOptions & { fallback: string }): Promise<string> {
  let out = "";
  for await (const piece of streamCompletion(opts)) out += piece;
  return out.trim() || opts.fallback;
}

/**
 * Sinh JSON.
 *
 * Business rule UC 6.10 yêu cầu AI trả về JSON chuẩn để hệ thống parse được.
 * Mô hình vẫn hay bọc JSON trong khối ```json hoặc thêm lời dẫn, nên ta bóc lấy
 * đoạn ngoặc ngoài cùng thay vì tin vào định dạng.
 */
export async function completeJson<T>(
  opts: GenerateOptions & { fallback: T }
): Promise<{ value: T; fromModel: boolean }> {
  if (!hasGenerativeModel()) return { value: opts.fallback, fromModel: false };

  try {
    const raw = await complete({ ...opts, fallback: "" });
    const parsed = extractJson<T>(raw);
    if (parsed !== null) return { value: parsed, fromModel: true };
    logger.warn({ raw: raw.slice(0, 400) }, "Mô hình không trả về JSON hợp lệ");
  } catch (err) {
    logger.error({ err }, "Sinh JSON thất bại");
  }
  return { value: opts.fallback, fromModel: false };
}

function extractJson<T>(raw: string): T | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? raw;

  const start = candidate.search(/[[{]/);
  if (start < 0) return null;
  const openChar = candidate[start];
  const closeChar = openChar === "[" ? "]" : "}";
  const end = candidate.lastIndexOf(closeChar);
  if (end <= start) return null;

  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

/* ==========================================================================
   TRẢ LỜI KIỂU TRÍCH XUẤT (chế độ `local`)
   ========================================================================== */

export interface ExtractiveSource {
  doc_title: string;
  page: number | null;
  content: string;
  score: number;
}

/**
 * Dựng câu trả lời bằng cách chọn các câu liên quan nhất trong tài liệu.
 *
 * Chấm điểm mỗi câu theo tỷ lệ từ khoá của câu hỏi xuất hiện trong đó, có tính
 * đến độ tương đồng vector của đoạn chứa nó. Cách này không hiểu ngôn ngữ,
 * nhưng nó trả lời đúng câu hỏi "tài liệu của tôi nói gì về X" — vốn là phần
 * lớn những gì sinh viên hỏi trợ lý.
 */
export function composeExtractiveAnswer(
  question: string,
  sources: ExtractiveSource[],
  maxSentences = 6
): string {
  if (sources.length === 0) {
    return (
      "Chưa tìm thấy đoạn nào đủ liên quan trong tài liệu của đề tài này.\n\n" +
      "Hãy thử diễn đạt lại câu hỏi, hoặc kiểm tra xem tài liệu đã được lập chỉ mục xong chưa " +
      "(trạng thái “Đã lập chỉ mục” ở trang Tài liệu)."
    );
  }

  const keywords = new Set(
    stripDiacritics(question.toLowerCase())
      .replace(/[^a-z0-9\s]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );

  interface Scored {
    sentence: string;
    score: number;
    source: ExtractiveSource;
    /** Vị trí câu trong đoạn nguồn, dùng để khôi phục mạch đọc ở cuối. */
    position: number;
  }

  const scored: Scored[] = [];
  for (const source of sources) {
    const sentences = splitSentences(source.content);
    for (const [position, sentence] of sentences.entries()) {
      if (sentence.length < 30) continue;
      // Đoạn có phần chồng lấp nên câu đầu tiên thường bị cắt mất vế trước
      // ("…bằng 16 và ef_construction bằng 64 là…"). Trích một mẩu như vậy vào
      // câu trả lời làm người đọc tưởng AI viết sai ngữ pháp.
      if (position === 0 && isSentenceFragment(sentence)) continue;
      const words = stripDiacritics(sentence.toLowerCase())
        .replace(/[^a-z0-9\s]+/g, " ")
        .split(/\s+/);
      let hits = 0;
      for (const w of words) if (keywords.has(w)) hits++;
      // Trọng số đoạn (điểm vector) nhân với mật độ từ khoá trong câu. Chia cho
      // căn bậc hai độ dài để câu dài không thắng chỉ vì chứa nhiều từ hơn.
      const density = hits / Math.sqrt(Math.max(words.length, 1));
      scored.push({ sentence, score: source.score * (0.35 + density), source, position });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  const picked: Scored[] = [];
  const seen = new Set<string>();
  for (const item of scored) {
    if (picked.length >= maxSentences) break;
    // Khử trùng lặp: các đoạn có phần chồng lấp nên cùng một câu xuất hiện ở
    // hai đoạn liền kề là chuyện thường.
    const key = stripDiacritics(item.sentence.toLowerCase()).slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(item);
  }

  if (picked.length === 0) {
    return (
      `Tìm được ${sources.length} đoạn liên quan nhưng không đoạn nào chứa câu trả lời trực tiếp. ` +
      "Bạn có thể mở các nguồn trích dẫn bên dưới để đọc nguyên văn."
    );
  }

  /*
   * Trả lại thứ tự xuất hiện trong tài liệu.
   *
   * Phải so CẢ hai mức: nguồn nào trước, rồi câu nào trước TRONG nguồn đó. Chỉ
   * so theo nguồn thì các câu cùng một đoạn giữ nguyên thứ tự điểm số, và câu
   * kết luận sẽ đứng trước câu giải thích — đọc như một bản tóm tắt bị xáo trộn.
   */
  const order = new Map(sources.map((s, i) => [s, i]));
  picked.sort((a, b) => {
    const bySource = (order.get(a.source) ?? 0) - (order.get(b.source) ?? 0);
    return bySource !== 0 ? bySource : a.position - b.position;
  });

  const body = picked.map((p) => p.sentence.trim()).join(" ");

  return (
    "Dựa trên các tài liệu đã lập chỉ mục trong đề tài của bạn:\n\n" +
    body +
    "\n\nCác đoạn trên được trích nguyên văn từ nguồn liệt kê bên dưới — mở từng nguồn để đối chiếu ngữ cảnh đầy đủ."
  );
}

/**
 * Câu bắt đầu bằng chữ thường (và không phải danh từ riêng viết thường như tên
 * hàm/bảng) gần như chắc chắn là phần đuôi của một câu bị cắt ở ranh giới đoạn.
 */
function isSentenceFragment(sentence: string): boolean {
  const first = sentence.trimStart()[0];
  if (!first) return true;
  // Chữ hoa, chữ số, hoặc dấu gạch đầu dòng đều là mở đầu hợp lệ.
  return first === first.toLowerCase() && first !== first.toUpperCase() && !/^[-•\d]/.test(sentence.trimStart());
}

/** Tóm tắt kiểu trích xuất — dùng cho UC 6.1 khi chưa có mô hình sinh. */
export function composeExtractiveSummary(fullText: string, maxSentences = 5): string {
  const sentences = splitSentences(fullText).filter((s) => s.length >= 40);
  if (sentences.length === 0) return "Tài liệu quá ngắn hoặc không đủ nội dung để tóm tắt.";

  // Tần suất từ làm trọng số — bản rút gọn của ý tưởng TextRank: câu chứa nhiều
  // từ phổ biến của chính tài liệu thường là câu nói về chủ đề chính.
  const freq = new Map<string, number>();
  for (const s of sentences) {
    for (const w of stripDiacritics(s.toLowerCase()).replace(/[^a-z0-9\s]+/g, " ").split(/\s+/)) {
      if (w.length > 3) freq.set(w, (freq.get(w) ?? 0) + 1);
    }
  }

  const ranked = sentences
    .map((sentence, index) => {
      const words = stripDiacritics(sentence.toLowerCase())
        .replace(/[^a-z0-9\s]+/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3);
      const score = words.reduce((sum, w) => sum + (freq.get(w) ?? 0), 0) / Math.max(words.length, 1);
      // Ưu ái nhẹ phần đầu tài liệu: phần mở đầu và tóm tắt gần như luôn nằm ở đó.
      const positionBonus = index < sentences.length * 0.2 ? 1.15 : 1;
      return { sentence, index, score: score * positionBonus };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.index - b.index);

  const summary = ranked.map((r) => r.sentence.trim()).join(" ");
  return estimateTokens(summary) > 400 ? summary.slice(0, 1200) + "…" : summary;
}

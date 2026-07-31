/**
 * CHIA ĐOẠN TÀI LIỆU
 *
 * Chia theo câu với phần chồng lấp, giữ nguyên số trang nguồn.
 *
 * Vì sao không cắt theo số ký tự cố định: cắt giữa câu tạo ra những đoạn mở đầu
 * bằng nửa mệnh đề. Vector của đoạn đó biểu diễn một câu không tồn tại, và khi
 * nó được trích dẫn, sinh viên đọc thấy một câu cụt — đúng thứ làm mất niềm tin
 * vào trích dẫn.
 */
import { estimateTokens, normalizeText, splitSentences } from "./text";

export interface Chunk {
  index: number;
  page: number | null;
  content: string;
  tokenCount: number;
}

export interface ChunkOptions {
  /** Kích thước mục tiêu mỗi đoạn (token ước lượng). */
  targetTokens?: number;
  /** Phần chồng lấp giữa hai đoạn liền kề. */
  overlapTokens?: number;
  /** Đoạn ngắn hơn ngưỡng này bị bỏ (tiêu đề rời, số trang…). */
  minTokens?: number;
}

const DEFAULTS = {
  // ~350 token ≈ một đoạn văn học thuật dài. Đủ để một ý trọn vẹn nằm gọn trong
  // một vector, chưa đủ dài để nhiều chủ đề trộn vào nhau làm loãng vector.
  targetTokens: 350,
  // Chồng lấp ~15%: một câu bị cắt ở ranh giới đoạn vẫn còn nguyên ngữ cảnh ở
  // một trong hai đoạn.
  overlapTokens: 50,
  minTokens: 12,
} as const;

export interface PageInput {
  page: number;
  text: string;
}

/**
 * Chia một tài liệu đã trích xuất thành các đoạn.
 *
 * Ranh giới trang cũng là ranh giới đoạn: một đoạn vắt qua hai trang thì không
 * gán được số trang duy nhất cho trích dẫn.
 */
export function chunkPages(pages: PageInput[], options: ChunkOptions = {}): Chunk[] {
  const opts = { ...DEFAULTS, ...options };
  const chunks: Chunk[] = [];
  let index = 0;

  for (const { page, text } of pages) {
    const sentences = splitSentences(normalizeText(text));
    if (sentences.length === 0) continue;

    let buffer: string[] = [];
    let bufferTokens = 0;

    const flush = () => {
      if (buffer.length === 0) return;
      const content = buffer.join(" ").trim();
      const tokenCount = estimateTokens(content);
      if (tokenCount >= opts.minTokens) {
        chunks.push({ index: index++, page, content, tokenCount });
      }
      // Giữ lại phần đuôi làm chồng lấp cho đoạn kế tiếp.
      const carry: string[] = [];
      let carryTokens = 0;
      for (let i = buffer.length - 1; i >= 0 && carryTokens < opts.overlapTokens; i--) {
        const s = buffer[i];
        if (!s) continue;
        carry.unshift(s);
        carryTokens += estimateTokens(s);
      }
      buffer = carry;
      bufferTokens = carryTokens;
    };

    for (const sentence of sentences) {
      const t = estimateTokens(sentence);

      // Câu đơn lẻ dài hơn cả một đoạn (bảng biểu, danh sách dài không có dấu
      // câu): cắt cứng theo ký tự, vì không còn ranh giới tự nhiên nào để bám.
      if (t > opts.targetTokens * 1.5) {
        flush();
        for (const piece of hardSplit(sentence, opts.targetTokens)) {
          chunks.push({
            index: index++,
            page,
            content: piece,
            tokenCount: estimateTokens(piece),
          });
        }
        buffer = [];
        bufferTokens = 0;
        continue;
      }

      if (bufferTokens + t > opts.targetTokens && buffer.length > 0) flush();

      buffer.push(sentence);
      bufferTokens += t;
    }

    // Lần flush cuối của trang: bỏ qua phần chồng lấp còn sót để không tạo ra
    // một đoạn trùng lặp hoàn toàn với đuôi đoạn trước.
    if (buffer.length > 0) {
      const content = buffer.join(" ").trim();
      const tokenCount = estimateTokens(content);
      const isDuplicateTail =
        chunks.length > 0 && chunks[chunks.length - 1]?.content.endsWith(content);
      if (tokenCount >= opts.minTokens && !isDuplicateTail) {
        chunks.push({ index: index++, page, content, tokenCount });
      }
    }
  }

  return chunks;
}

function hardSplit(text: string, targetTokens: number): string[] {
  const maxChars = targetTokens * 3;
  const out: string[] = [];
  for (let i = 0; i < text.length; i += maxChars) {
    const piece = text.slice(i, i + maxChars).trim();
    if (piece) out.push(piece);
  }
  return out;
}

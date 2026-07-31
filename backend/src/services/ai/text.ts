/**
 * XỬ LÝ VĂN BẢN TIẾNG VIỆT
 *
 * Chuẩn hoá, tách token và ước lượng số token. Dùng chung cho vector hoá cục
 * bộ, chia đoạn và kiểm soát ngân sách ngữ cảnh RAG.
 */

/** Bỏ dấu tiếng Việt: "Trí tuệ nhân tạo" → "tri tue nhan tao". */
export function stripDiacritics(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

/** Gộp khoảng trắng, chuẩn hoá Unicode. Giữ nguyên dấu. */
export function normalizeText(input: string): string {
  return input.normalize("NFC").replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").trim();
}

/**
 * Từ dừng tiếng Việt.
 *
 * Danh sách ngắn có chủ đích. Cắt quá tay sẽ phá hỏng cụm từ chuyên môn: "học
 * máy có giám sát" mất chữ "có" thì vẫn hiểu được, nhưng loại luôn "không" sẽ
 * biến "không hội tụ" thành "hội tụ" — đảo ngược ý nghĩa.
 */
const STOPWORDS = new Set([
  "va", "la", "cua", "cho", "voi", "trong", "tren", "duoc", "co", "cac", "nhung",
  "mot", "nay", "do", "khi", "den", "tu", "de", "ve", "theo", "nhu", "hoac",
  "boi", "vi", "nen", "thi", "ma", "cung", "da", "se", "dang", "ra", "vao",
  "the", "and", "or", "of", "to", "in", "is", "are", "for", "with", "on", "at",
  "by", "an", "as", "it", "that", "this", "be", "from",
]);

/** Tách thành token chữ-số, đã bỏ dấu và hạ chữ thường. */
export function tokenize(input: string): string[] {
  return stripDiacritics(input.toLowerCase())
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0 && t.length <= 32);
}

export function contentTokens(input: string): string[] {
  return tokenize(input).filter((t) => !STOPWORDS.has(t));
}

/**
 * Ước lượng số token cho ngân sách ngữ cảnh.
 *
 * Không gọi tokenizer thật của nhà cung cấp: chúng khác nhau giữa các model và
 * kéo theo phụ thuộc nặng. Tiếng Việt có dấu tốn khoảng 2,5–3 ký tự mỗi token
 * với BPE của các model phổ biến; lấy 3 là ước lượng thiên về an toàn (thà báo
 * nhiều hơn thực tế còn hơn vượt cửa sổ ngữ cảnh).
 */
export function estimateTokens(input: string): number {
  return Math.ceil(input.length / 3);
}

/**
 * Cắt văn bản theo ngân sách token, cắt ở ranh giới câu gần nhất.
 * Cắt giữa câu khiến prompt kết thúc bằng một mệnh đề cụt và làm model bối rối.
 */
export function truncateToTokens(input: string, maxTokens: number): string {
  if (estimateTokens(input) <= maxTokens) return input;
  const maxChars = maxTokens * 3;
  const slice = input.slice(0, maxChars);
  const lastStop = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("\n"), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
  return (lastStop > maxChars * 0.6 ? slice.slice(0, lastStop + 1) : slice).trim() + "…";
}

/**
 * Tách câu.
 *
 * Ngoài dấu chấm/hỏi/than, còn tách theo xuống dòng vì tài liệu học thuật đầy
 * gạch đầu dòng và tiêu đề mục vốn không kết thúc bằng dấu câu nào.
 */
export function splitSentences(input: string): string[] {
  return normalizeText(input)
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Rút gọn cho đoạn trích trong trích dẫn — cắt tại ranh giới từ. */
export function snippet(input: string, maxChars = 220): string {
  const clean = normalizeText(input).replace(/\n+/g, " ");
  if (clean.length <= maxChars) return clean;
  const cut = clean.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > maxChars * 0.5 ? cut.slice(0, lastSpace) : cut) + "…";
}

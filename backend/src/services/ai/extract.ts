/**
 * TRÍCH XUẤT VĂN BẢN TỪ TỆP
 *
 * Trả về văn bản KÈM SỐ TRANG. Số trang không phải chi tiết phụ: giao diện trích
 * dẫn RAG (`ai-chat/page.tsx` → `Citation.page`) hiển thị "tr. 12" cho từng
 * nguồn, và UC 6.6 yêu cầu chỉ rõ trang. Mất số trang là mất khả năng đối chiếu
 * — thứ khiến câu trả lời của AI đáng tin.
 */
import fsp from "node:fs/promises";
import path from "node:path";
import { normalizeText } from "./text";
import { logger } from "../../lib/logger";

export interface ExtractedPage {
  /** 1-based, khớp cách người đọc đánh số trang. */
  page: number;
  text: string;
}

export interface ExtractedDocument {
  pages: ExtractedPage[];
  pageCount: number;
  /** Toàn văn đã ghép, dùng cho tóm tắt. */
  fullText: string;
}

export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionError";
  }
}

/* ==========================================================================
   PDF
   ========================================================================== */

/**
 * `pdfjs-dist` là gói ESM thuần còn backend biên dịch sang CommonJS, nên phải
 * nạp động. Nạp một lần rồi giữ lại: pdf.js là thư viện nặng, import lại cho
 * từng tệp sẽ thêm hàng trăm mili-giây vào mỗi job.
 */
let pdfjsPromise: Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> | null = null;

function loadPdfjs() {
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsPromise;
}

async function extractPdf(absolutePath: string): Promise<ExtractedDocument> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await fsp.readFile(absolutePath));

  const doc = await pdfjs.getDocument({
    data,
    // Tắt worker: chạy trong worker nền của Node vốn đã tách khỏi luồng request,
    // và worker của pdf.js cần cấu hình đường dẫn dễ vỡ khi đóng gói.
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: false,
  }).promise;

  try {
    const pages: ExtractedPage[] = [];

    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      try {
        const content = await page.getTextContent();
        // pdf.js trả từng mảnh chữ rời kèm cờ `hasEOL`. Ghép lại theo cờ đó
        // thay vì nối bằng khoảng trắng, nếu không mọi ngắt dòng biến mất và
        // các đoạn dính liền thành một khối.
        let text = "";
        for (const item of content.items) {
          if (!("str" in item)) continue;
          text += item.str;
          if (item.hasEOL) text += "\n";
          else if (!item.str.endsWith(" ")) text += " ";
        }
        const cleaned = normalizeText(text);
        if (cleaned) pages.push({ page: i, text: cleaned });
      } finally {
        // Giải phóng ngay từng trang. `Yêu cầu dự án.md` §2.4 nói rõ về quản lý
        // bộ nhớ: giữ cả 300 trang đã dựng trong RAM là cách chắc chắn để một
        // luận văn dày làm sập worker.
        page.cleanup();
      }
    }

    if (pages.length === 0) {
      throw new ExtractionError(
        "Không đọc được nội dung văn bản trong tệp PDF. Tệp có thể là bản quét ảnh hoặc được đặt mật khẩu."
      );
    }

    return {
      pages,
      pageCount: doc.numPages,
      fullText: pages.map((p) => p.text).join("\n\n"),
    };
  } finally {
    await doc.destroy();
  }
}

/* ==========================================================================
   DOCX
   ========================================================================== */

/**
 * DOCX không có khái niệm "trang" — phân trang do trình soạn thảo quyết định
 * lúc dựng hình. Ước lượng ranh giới trang theo lượng ký tự để trích dẫn vẫn
 * chỉ được về một vùng gần đúng thay vì bỏ trống hoàn toàn.
 */
const CHARS_PER_PAGE = 1800;

async function extractDocx(absolutePath: string): Promise<ExtractedDocument> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ path: absolutePath });
  const text = normalizeText(result.value);

  if (!text) {
    throw new ExtractionError("Tệp DOCX không chứa nội dung văn bản đọc được.");
  }

  const paragraphs = text.split(/\n{2,}/);
  const pages: ExtractedPage[] = [];
  let buffer = "";
  let page = 1;

  for (const para of paragraphs) {
    if (buffer.length + para.length > CHARS_PER_PAGE && buffer) {
      pages.push({ page, text: buffer.trim() });
      page++;
      buffer = "";
    }
    buffer += para + "\n\n";
  }
  if (buffer.trim()) pages.push({ page, text: buffer.trim() });

  return { pages, pageCount: pages.length, fullText: text };
}

/* ==========================================================================
   TEXT THUẦN
   ========================================================================== */

async function extractPlain(absolutePath: string): Promise<ExtractedDocument> {
  const raw = await fsp.readFile(absolutePath, "utf8");
  const text = normalizeText(raw);
  if (!text) throw new ExtractionError("Tệp rỗng, không có nội dung để lập chỉ mục.");

  const pages: ExtractedPage[] = [];
  let page = 1;
  for (let i = 0; i < text.length; i += CHARS_PER_PAGE) {
    pages.push({ page, text: text.slice(i, i + CHARS_PER_PAGE) });
    page++;
  }

  return { pages, pageCount: pages.length, fullText: text };
}

/* ==========================================================================
   ĐIỀU PHỐI
   ========================================================================== */

export async function extractText(
  absolutePath: string,
  mimeType: string
): Promise<ExtractedDocument> {
  const ext = path.extname(absolutePath).toLowerCase();

  try {
    if (mimeType === "application/pdf" || ext === ".pdf") {
      return await extractPdf(absolutePath);
    }
    if (ext === ".docx" || mimeType.includes("wordprocessingml")) {
      return await extractDocx(absolutePath);
    }
    if (ext === ".txt" || ext === ".md" || mimeType.startsWith("text/")) {
      return await extractPlain(absolutePath);
    }
  } catch (err) {
    if (err instanceof ExtractionError) throw err;
    logger.warn({ err, absolutePath, mimeType }, "Trích xuất văn bản thất bại");
    throw new ExtractionError(
      "Không đọc được nội dung tệp. Tệp có thể bị hỏng, được đặt mật khẩu, hoặc chỉ chứa ảnh quét."
    );
  }

  throw new ExtractionError(
    `Định dạng ${ext || mimeType} chưa hỗ trợ trích xuất văn bản. Hỗ trợ: PDF, DOCX, TXT.`
  );
}

/**
 * TRUY VẤN pgvector
 *
 * Prisma chưa có kiểu vector gốc, nên toàn bộ thao tác trên cột
 * `document_chunks.embedding` tập trung ở tệp này. Gom một chỗ có hai lý do:
 *
 *   1. Mỗi câu SQL đều là template tham số hoá (`Prisma.sql`), nên không có
 *      đường nào để chuỗi do người dùng nhập lọt vào câu lệnh — chống SQL
 *      Injection theo đúng `Yêu cầu dự án.md` §2.1.
 *   2. Mọi truy vấn tìm kiếm đều BẮT BUỘC nhận `documentIds` đã được lọc quyền.
 *      Đây chính là kịch bản mà ERD cảnh báo: viết
 *      `ORDER BY embedding <=> $1 LIMIT 5` trên toàn bảng sẽ làm rò rỉ nội dung
 *      luận văn của sinh viên khác.
 */
import { Prisma } from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { toVectorLiteral } from "./embeddings";
import type { Chunk } from "./chunking";

export interface SearchHit {
  chunk_id: number;
  document_id: number;
  chunk_index: number;
  page_number: number | null;
  content: string;
  /** Độ tương đồng cosine trong [0, 1]; càng cao càng giống. */
  score: number;
  doc_title: string;
  thesis_id: number;
}

/**
 * Ghi các đoạn kèm vector.
 *
 * Chèn theo lô trong một transaction: một tài liệu 300 trang sinh ra vài trăm
 * đoạn, và 300 lần round-trip riêng lẻ tới CSDL chậm hơn hàng chục lần. Nếu lỗi
 * giữa chừng, transaction cuộn lại toàn bộ — thà không có chỉ mục còn hơn có
 * chỉ mục thiếu một nửa mà không ai biết.
 */
export async function insertChunks(
  documentId: number,
  chunks: Chunk[],
  vectors: number[][]
): Promise<number> {
  if (chunks.length === 0) return 0;

  const BATCH = 100;
  let inserted = 0;

  await prisma.$transaction(async (tx) => {
    // Nhúng lại (UC 6.2) phải xoá chỉ mục cũ trước, nếu không sẽ có hai thế hệ
    // vector cùng tồn tại và tìm kiếm trả về đoạn trùng nhau.
    await tx.$executeRaw`DELETE FROM document_chunks WHERE document_id = ${documentId}`;

    for (let start = 0; start < chunks.length; start += BATCH) {
      const slice = chunks.slice(start, start + BATCH);
      const values = slice.map((chunk, i) => {
        const vector = vectors[start + i];
        const literal = vector ? toVectorLiteral(vector) : null;
        return Prisma.sql`(
          ${documentId}::int,
          ${chunk.index}::int,
          ${chunk.page}::int,
          ${chunk.content}::text,
          ${chunk.tokenCount}::int,
          ${literal}::vector
        )`;
      });

      inserted += await tx.$executeRaw`
        INSERT INTO document_chunks
          (document_id, chunk_index, page_number, content, token_count, embedding)
        VALUES ${Prisma.join(values)}
      `;
    }
  });

  return inserted;
}

export async function deleteChunks(documentId: number): Promise<void> {
  await prisma.$executeRaw`DELETE FROM document_chunks WHERE document_id = ${documentId}`;
}

/**
 * Tìm các đoạn gần nhất với vector truy vấn.
 *
 * @param documentIds `null` = không giới hạn (chỉ Admin). Mảng rỗng = không
 *   được xem gì; hàm trả về ngay mà không chạm CSDL.
 */
export async function searchSimilarChunks(params: {
  queryVector: number[];
  documentIds: number[] | null;
  limit: number;
  minScore?: number;
  /** Loại trừ một tài liệu — dùng khi đối chiếu trùng lặp với chính nó. */
  excludeDocumentId?: number;
}): Promise<SearchHit[]> {
  const { queryVector, documentIds, limit, minScore = 0, excludeDocumentId } = params;

  if (documentIds !== null && documentIds.length === 0) return [];

  const vector = toVectorLiteral(queryVector);

  // Chỉ tìm trong tài liệu đã lập chỉ mục xong: business rule UC 5.9 nói rõ chỉ
  // khi trạng thái "Hoàn thành" thì tài liệu mới dùng được cho Semantic Search
  // và RAG.
  const scopeFilter =
    documentIds === null
      ? Prisma.empty
      : Prisma.sql`AND c.document_id IN (${Prisma.join(documentIds)})`;

  const excludeFilter = excludeDocumentId
    ? Prisma.sql`AND c.document_id <> ${excludeDocumentId}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<
    Array<{
      chunk_id: number;
      document_id: number;
      chunk_index: number;
      page_number: number | null;
      content: string;
      score: number;
      doc_title: string;
      thesis_id: number;
    }>
  >`
    SELECT
      c.id            AS chunk_id,
      c.document_id   AS document_id,
      c.chunk_index   AS chunk_index,
      c.page_number   AS page_number,
      c.content       AS content,
      1 - (c.embedding <=> ${vector}::vector) AS score,
      d.filename      AS doc_title,
      d.thesis_id     AS thesis_id
    FROM document_chunks c
    JOIN documents d ON d.id = c.document_id
    WHERE c.embedding IS NOT NULL
      AND d.deleted_at IS NULL
      AND d.status_ai = 'DONE'
      ${scopeFilter}
      ${excludeFilter}
    ORDER BY c.embedding <=> ${vector}::vector
    LIMIT ${limit}
  `;

  // Lọc ngưỡng SAU khi đã ORDER BY: đặt điều kiện vào WHERE sẽ khiến planner bỏ
  // chỉ mục HNSW và chuyển sang quét tuần tự.
  return rows
    .filter((r) => Number(r.score) >= minScore)
    .map((r) => ({ ...r, score: Number(r.score) }));
}

/* ==========================================================================
   TÌM KIẾM LAI (HYBRID)
   ========================================================================== */

export interface HybridHit extends SearchHit {
  /** Thứ hạng theo khoảng cách vector (1 = gần nhất). `null` nếu chỉ toàn văn tìm ra. */
  vector_rank: number | null;
  /** Thứ hạng theo `ts_rank` toàn văn. `null` nếu chỉ vector tìm ra. */
  text_rank: number | null;
  /** Điểm hợp nhất Reciprocal Rank Fusion — dùng để sắp xếp, không để hiển thị. */
  fused: number;
}

/**
 * Tìm kiếm lai: hợp nhất xếp hạng vector và xếp hạng toàn văn.
 *
 * Vì sao không dùng riêng một trong hai:
 *   • Vector thuần hỏng với truy vấn ngắn chứa thuật ngữ hiếm — xem phần đo đạc
 *     trong migration `..._chunk_fulltext_index`.
 *   • Toàn văn thuần hỏng với truy vấn diễn đạt khác từ trong tài liệu, vốn là
 *     lý do tồn tại của tìm kiếm ngữ nghĩa (UC 6.4).
 *
 * Reciprocal Rank Fusion: `score = Σ 1 / (k + rank)` với k = 60 theo bài báo
 * gốc của Cormack. Ưu điểm quyết định là nó chỉ dùng THỨ HẠNG chứ không dùng
 * điểm số thô — nên không cần chuẩn hoá hai thang điểm hoàn toàn khác nhau
 * (cosine 0–1 và ts_rank không chặn trên) về cùng một đơn vị, việc vốn dĩ đầy
 * hằng số tuỳ tiện.
 *
 * `score` trả về vẫn là **cosine thật**, để phần trăm hiển thị trên giao diện
 * đúng với nhãn "độ tương đồng ngữ nghĩa". Thứ tự thì do `fused` quyết định.
 */
export async function searchHybridChunks(params: {
  queryVector: number[];
  queryText: string;
  documentIds: number[] | null;
  limit: number;
  excludeDocumentId?: number;
}): Promise<HybridHit[]> {
  const { queryVector, queryText, documentIds, limit, excludeDocumentId } = params;

  if (documentIds !== null && documentIds.length === 0) return [];

  const vector = toVectorLiteral(queryVector);
  // Lấy dư ở mỗi nhánh: một đoạn có thể đứng hạng 20 ở nhánh này và hạng 2 ở
  // nhánh kia, và chính những trường hợp đó mới là lý do phải hợp nhất.
  const poolSize = Math.max(limit * 4, 20);

  /*
   * Hằng số RRF.
   *
   * Bài báo gốc dùng k = 60 cho danh sách kết quả hàng nghìn dòng của TREC. Kho
   * tài liệu một đề tài luận văn chỉ có vài trăm đoạn, và ở quy mô đó k = 60
   * san phẳng mọi thứ: chênh lệch giữa hạng 1 và hạng 5 chỉ còn 1/61 so với
   * 1/65, tức là gần như không có ý kiến gì. k = 30 giữ lại tiếng nói của thứ
   * hạng đầu bảng.
   */
  const RRF_K = 30;

  /*
   * Trọng số nhánh toàn văn.
   *
   * Ở chế độ `local`, "embedding" là hashing từ vựng chứ không phải vector ngữ
   * nghĩa đã huấn luyện, nên với truy vấn ngắn nó là tín hiệu YẾU HƠN hẳn so
   * với khớp từ có trọng số IDF — điều này đo được: câu hỏi "HNSW khác IVFFlat"
   * cho nhánh toàn văn điểm 5,8 cho đúng tài liệu và 2,2 cho tài liệu sai,
   * trong khi nhánh vector xếp nhầm tài liệu lên hạng 1.
   *
   * Với nhà cung cấp thật (`openai`, `gemini`), vector mang thông tin ngữ nghĩa
   * mà toàn văn không có, nên hai nhánh được cân bằng.
   */
  const textWeight = env.EMBEDDING_PROVIDER === "local" ? 2 : 1;

  const scopeFilter =
    documentIds === null
      ? Prisma.empty
      : Prisma.sql`AND c.document_id IN (${Prisma.join(documentIds)})`;

  const excludeFilter = excludeDocumentId
    ? Prisma.sql`AND c.document_id <> ${excludeDocumentId}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<
    Array<{
      chunk_id: number;
      document_id: number;
      chunk_index: number;
      page_number: number | null;
      content: string;
      score: number;
      doc_title: string;
      thesis_id: number;
      vector_rank: number | null;
      text_rank: number | null;
      fused: number;
    }>
  >`
    WITH scoped AS (
      SELECT c.id, c.document_id, c.chunk_index, c.page_number, c.content,
             c.embedding, d.filename, d.thesis_id
      FROM document_chunks c
      JOIN documents d ON d.id = c.document_id
      WHERE d.deleted_at IS NULL
        AND d.status_ai = 'DONE'
        ${scopeFilter}
        ${excludeFilter}
    ),
    vec AS (
      SELECT id,
             row_number() OVER (ORDER BY embedding <=> ${vector}::vector) AS rank
      FROM scoped
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${vector}::vector
      LIMIT ${poolSize}
    ),
    -- Tách câu hỏi thành từ. Cắt bằng danh sách dấu ASCII tường minh thay vì
    -- lớp [:alnum:], vì lớp POSIX phụ thuộc locale của cụm CSDL và sẽ cắt nhầm
    -- chữ tiếng Việt có dấu khi cụm chạy ở locale C.
    terms AS (
      SELECT DISTINCT t AS term
      FROM unnest(
        regexp_split_to_array(lower(${queryText}), '[[:space:],.;:!?()"''/-]+')
      ) AS t
      WHERE length(t) >= 2
    ),
    corpus AS (SELECT count(*)::numeric AS n FROM scoped),
    -- IDF THẬT, đo trên chính kho tài liệu của người dùng.
    --
    -- Đây là mảnh còn thiếu và nó quyết định toàn bộ chất lượng nhánh toàn văn.
    -- ts_rank chấm điểm theo TẦN SUẤT trong đoạn nhưng KHÔNG có IDF, nên với
    -- truy vấn hợp, một đoạn chứa nhiều lần chữ "khác" (từ phổ biến) đánh bại
    -- đoạn chứa hai lần "HNSW" (từ hiếm) — ngược hẳn với thứ người dùng tìm.
    -- Đo thực tế trên kho mẫu: df("khác") = 5, df("ở") = 7, df("ivfflat") = 1.
    --
    -- Công thức IDF chuẩn của BM25. Lọc nhị phân theo ngưỡng phần trăm cũng
    -- được, nhưng ngưỡng đó phụ thuộc kích thước corpus: 50% là quá rộng với
    -- 17 đoạn và quá chặt với 17.000 đoạn. Trọng số liên tục thì không.
    term_idf AS (
      SELECT te.term,
             ln(1 + (corpus.n - df.cnt + 0.5) / (df.cnt + 0.5)) AS idf
      FROM terms te, corpus, LATERAL (
        SELECT count(*)::numeric AS cnt
        FROM scoped s
        WHERE to_tsvector('simple', s.content) @@ plainto_tsquery('simple', te.term)
      ) df
      WHERE df.cnt > 0
    ),
    txt AS (
      SELECT id,
             row_number() OVER (ORDER BY score DESC) AS rank
      FROM (
        -- Điểm của một đoạn = tổng IDF các từ trong câu hỏi mà nó chứa.
        -- Đoạn khớp hai thuật ngữ hiếm thắng đoạn khớp bốn từ phổ biến.
        SELECT s.id, SUM(ti.idf) AS score
        FROM scoped s
        JOIN term_idf ti
          ON to_tsvector('simple', s.content) @@ plainto_tsquery('simple', ti.term)
        GROUP BY s.id
      ) scored
      LIMIT ${poolSize}
    )
    SELECT
      s.id            AS chunk_id,
      s.document_id   AS document_id,
      s.chunk_index   AS chunk_index,
      s.page_number   AS page_number,
      s.content       AS content,
      COALESCE(1 - (s.embedding <=> ${vector}::vector), 0) AS score,
      s.filename      AS doc_title,
      s.thesis_id     AS thesis_id,
      vec.rank::int   AS vector_rank,
      txt.rank::int   AS text_rank,
      COALESCE(1.0 / (${RRF_K} + vec.rank), 0)
        + ${textWeight} * COALESCE(1.0 / (${RRF_K} + txt.rank), 0) AS fused
    FROM scoped s
    LEFT JOIN vec ON vec.id = s.id
    LEFT JOIN txt ON txt.id = s.id
    WHERE vec.rank IS NOT NULL OR txt.rank IS NOT NULL
    ORDER BY fused DESC
    LIMIT ${limit}
  `;

  return rows.map((r) => ({
    ...r,
    score: Number(r.score),
    fused: Number(r.fused),
  }));
}

/** Tổng số đoạn đã lập chỉ mục — dùng cho endpoint chẩn đoán. */
export async function countIndexedChunks(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*)::bigint AS count FROM document_chunks WHERE embedding IS NOT NULL
  `;
  return Number(rows[0]?.count ?? 0);
}

/** Kiểm tra extension pgvector và chỉ mục HNSW còn nguyên vẹn. */
export async function vectorHealth(): Promise<{
  extension: boolean;
  hnswIndex: boolean;
  indexedChunks: number;
}> {
  const [ext, idx, count] = await Promise.all([
    prisma.$queryRaw<Array<{ ok: boolean }>>`
      SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS ok
    `,
    prisma.$queryRaw<Array<{ ok: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'idx_chunks_embedding_hnsw'
      ) AS ok
    `,
    countIndexedChunks(),
  ]);

  return {
    extension: ext[0]?.ok ?? false,
    hnswIndex: idx[0]?.ok ?? false,
    indexedChunks: count,
  };
}

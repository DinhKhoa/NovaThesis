/**
 * NGHIỆP VỤ TÀI LIỆU (Module 5)
 *
 * Tách khỏi `documents.routes.ts` để tệp định tuyến chỉ còn phần "hợp đồng HTTP"
 * (xác thực đầu vào, quyền, mã trạng thái). Phần khó ở đây là PHẠM VI DỮ LIỆU:
 * tài liệu người dùng thấy được không chỉ là tài liệu của đề tài mình, mà còn cả
 * tài liệu được chia sẻ tới (UC 5.10). Toàn bộ truy vấn danh sách vì thế đều đi
 * qua `accessibleDocumentIds()` — lọc thủ công theo `thesis_id` ở đây sẽ vừa làm
 * hỏng tính năng chia sẻ, vừa mở đường cho lỗi Tenant Isolation
 * (`Yêu cầu dự án.md` §2.1).
 */
import path from "node:path";
import { Prisma, type AIStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { badRequest, notFound } from "../../lib/errors";
import type { Page } from "../../lib/http";
import { cleanText } from "../../middleware/validate";
import type { AuthUser } from "../../middleware/auth";
import { accessibleDocumentIds } from "../../domain/access";
import { notify, notifyMany, thesisAudience } from "../../services/notifications";

/* ==========================================================================
   HÌNH DẠNG TRUY VẤN
   ========================================================================== */

/**
 * Quan hệ mà `toDocumentDTO` cần. Khai báo một lần rồi dùng lại ở mọi truy vấn:
 * thiếu `_count` ở một endpoint sẽ khiến giao diện thấy `version_count = 0` cho
 * đúng tài liệu vừa nộp phiên bản mới.
 */
export const DOCUMENT_INCLUDE = {
  uploader: { select: { id: true, full_name: true } },
  thesis: { select: { id: true, title: true } },
  _count: { select: { chunks: true, versions: true, shares: true } },
} satisfies Prisma.DocumentInclude;

export type DocumentDetail = Prisma.DocumentGetPayload<{ include: typeof DOCUMENT_INCLUDE }>;

export const VERSION_INCLUDE = {
  uploader: { select: { full_name: true } },
} satisfies Prisma.DocumentVersionInclude;

const SHARE_INCLUDE = {
  thesis: { select: { id: true, title: true, status: true } },
  sharer: { select: { id: true, full_name: true } },
} satisfies Prisma.DocumentShareInclude;

/**
 * `serializers.ts` chưa có DTO cho bản ghi chia sẻ và tệp đó nằm ngoài module
 * này, nên hình dạng được khai báo tại chỗ — vẫn giữ đúng hai quy ước của nhà:
 * khoá snake_case và thời gian ISO 8601.
 */
export function toDocumentShareDTO(
  share: Prisma.DocumentShareGetPayload<{ include: typeof SHARE_INCLUDE }>
) {
  return {
    id: share.id,
    document_id: share.document_id,
    thesis_id: share.thesis_id,
    thesis_title: share.thesis.title,
    thesis_status: share.thesis.status,
    permission: share.permission,
    shared_by: share.shared_by,
    shared_by_name: share.sharer.full_name,
    created_at: share.created_at.toISOString(),
  };
}

/* ==========================================================================
   THẺ PHÂN LOẠI (UC 5.7)
   ========================================================================== */

/** UC 5.7 exception 3a — thẻ quá dài bị từ chối ngay thay vì cắt cụt âm thầm. */
const MAX_TAG_LENGTH = 30;
const MAX_TAGS_PER_DOCUMENT = 20;

/**
 * Chuẩn hoá danh sách thẻ.
 *
 * Giao diện gửi lên một chuỗi phân cách phẩy (`Input` một dòng trong
 * `documents/page.tsx`), nhưng cột trong CSDL là `text[]`. Khử trùng không phân
 * biệt hoa/thường: "AI" và "ai" là cùng một thẻ với người dùng, để cả hai vào
 * mảng sẽ sinh ra hai mục trong bộ lọc thẻ.
 */
export function parseTagList(raw: string | string[] | undefined | null): string[] {
  if (raw === undefined || raw === null) return [];
  const parts = Array.isArray(raw) ? raw : raw.split(",");

  const tags: string[] = [];
  const seen = new Set<string>();

  for (const part of parts) {
    const tag = cleanText(part);
    if (!tag) continue;
    if (tag.length > MAX_TAG_LENGTH) {
      throw badRequest(`Thẻ “${tag.slice(0, MAX_TAG_LENGTH)}…” quá dài. Mỗi thẻ tối đa ${MAX_TAG_LENGTH} ký tự.`);
    }
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    if (tags.length >= MAX_TAGS_PER_DOCUMENT) {
      throw badRequest(`Mỗi tài liệu chỉ gắn được tối đa ${MAX_TAGS_PER_DOCUMENT} thẻ.`);
    }
    seen.add(key);
    tags.push(tag);
  }

  return tags;
}

/**
 * Tên hiển thị của tài liệu.
 *
 * Tên do người dùng đặt KHÔNG bao giờ chạm tới hệ thống tệp (`lib/storage.ts`
 * sinh tên ngẫu nhiên), nhưng nó vẫn đi vào header `Content-Disposition` khi tải
 * về. Bỏ mọi thành phần đường dẫn để không có gì trông giống `../` lọt ra ngoài.
 */
export function sanitizeFilename(raw: string): string {
  const base = path.basename(cleanText(raw)).replace(/[\\/]/g, "").trim();
  if (!base || base === "." || base === "..") {
    throw badRequest("Tên tài liệu không hợp lệ.");
  }
  return base.slice(0, 255);
}

/**
 * Giải mã tên tệp gốc từ multipart.
 *
 * multer 2.x nhận `defParamCharset` mặc định là `latin1` (kế thừa busboy), nên
 * "Đề_cương.pdf" về tới đây thành "Ä‘á»_cÆ°Æ¡ng.pdf". Đọc lại chuỗi dưới dạng
 * byte latin1 rồi thử giải mã UTF-8; chỉ nhận kết quả khi nó mã hoá ngược lại
 * đúng y hệt dãy byte ban đầu — tên vốn đã là ASCII/UTF-8 hợp lệ sẽ không bị
 * đụng tới.
 */
export function decodeUploadFilename(raw: string): string {
  const bytes = Buffer.from(raw, "latin1");
  const utf8 = bytes.toString("utf8");
  return Buffer.from(utf8, "utf8").equals(bytes) ? utf8 : raw;
}

/* ==========================================================================
   DANH SÁCH & TÌM KIẾM
   ========================================================================== */

export interface DocumentFilters {
  thesis_id?: number;
  search?: string;
  tag?: string;
  status_ai?: AIStatus;
}

/**
 * Danh sách tài liệu trong phạm vi người dùng (UC 5.2 / 5.8).
 *
 * `accessibleDocumentIds` trả `null` nghĩa là Admin không bị giới hạn — khi đó
 * cố tình BỎ mệnh đề `id IN (...)` thay vì nạp toàn bộ id của hệ thống vào SQL.
 */
export async function listDocuments(
  user: AuthUser,
  filters: DocumentFilters,
  page: Page
): Promise<{ rows: DocumentDetail[]; total: number }> {
  const ids = await accessibleDocumentIds(user, filters.thesis_id ?? null);
  if (ids !== null && ids.length === 0) return { rows: [], total: 0 };

  const where: Prisma.DocumentWhereInput = {
    deleted_at: null,
    ...(ids === null ? {} : { id: { in: ids } }),
    ...(filters.status_ai ? { status_ai: filters.status_ai } : {}),
    // Cột `text[]` + index GIN: `has` là so khớp đúng một phần tử, không phải
    // `LIKE '%AI%'` vốn khớp nhầm cả "MAINTAIN".
    ...(filters.tag ? { tags: { has: filters.tag } } : {}),
    ...(filters.search ? { OR: searchClauses(filters.search) } : {}),
  };

  const [rows, total] = await prisma.$transaction([
    prisma.document.findMany({
      where,
      include: DOCUMENT_INCLUDE,
      orderBy: { created_at: "desc" },
      skip: page.skip,
      take: page.take,
    }),
    prisma.document.count({ where }),
  ]);

  return { rows, total };
}

/**
 * UC 5.8 — tìm kiếm chạy ở SERVER, không phải lọc mảng ở client.
 *
 * Bản mẫu giao diện lọc trên dữ liệu đã tải về; làm vậy thật thì trang 2 trở đi
 * sẽ không bao giờ được tìm tới. `mode: "insensitive"` là điều kiện
 * case-insensitive mà business rule của UC 5.8 yêu cầu.
 */
function searchClauses(search: string): Prisma.DocumentWhereInput[] {
  return [
    { filename: { contains: search, mode: "insensitive" } },
    { summary_ai: { contains: search, mode: "insensitive" } },
    { summary_note: { contains: search, mode: "insensitive" } },
    // UC 5.8 bước 3 tính cả thẻ. `has` so khớp nguyên thẻ — đúng ngữ nghĩa khi
    // người dùng gõ tên một thẻ, và không quét được toàn mảng bằng `contains`.
    { tags: { has: search } },
  ];
}

/**
 * Tập thẻ đang dùng trong phạm vi người dùng (UC 5.7 — gợi ý autocomplete).
 *
 * Dùng `unnest` trong SQL thay vì nạp toàn bộ cột `tags` về rồi gom bằng
 * JavaScript: Postgres trả về đúng vài chục chuỗi, còn cách kia kéo về mọi hàng
 * chỉ để vứt đi.
 */
export async function listTagsInScope(user: AuthUser, thesisId?: number): Promise<string[]> {
  const ids = await accessibleDocumentIds(user, thesisId ?? null);
  if (ids !== null && ids.length === 0) return [];

  const scope = ids === null ? Prisma.empty : Prisma.sql`AND d.id IN (${Prisma.join(ids)})`;

  const rows = await prisma.$queryRaw<Array<{ tag: string }>>`
    SELECT DISTINCT t AS tag
    FROM documents d, unnest(d.tags) AS t
    WHERE d.deleted_at IS NULL
      ${scope}
  `;

  // Sắp xếp ở tầng ứng dụng: `ORDER BY` của Postgres theo collation của CSDL,
  // còn danh sách này hiển thị cạnh bộ lọc đã sắp bằng `localeCompare("vi")`.
  return rows.map((r) => r.tag).sort((a, b) => a.localeCompare(b, "vi"));
}

/** Bản ghi đầy đủ kèm quan hệ cho serializer. */
export async function loadDocumentDetail(documentId: number): Promise<DocumentDetail> {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, deleted_at: null },
    include: DOCUMENT_INCLUDE,
  });
  if (!doc) throw notFound("Tài liệu không tồn tại hoặc đã bị xóa.");
  return doc;
}

/* ==========================================================================
   GHI DỮ LIỆU
   ========================================================================== */

export interface StoredUpload {
  relativePath: string;
  size: number;
  mimeType: string;
  originalName: string;
}

/**
 * Tạo tài liệu kèm phiên bản đầu tiên (UC 5.1 + Document Versioning §3.1).
 *
 * Hai bảng phải sinh ra cùng nhau: một `documents` không có `document_versions`
 * tương ứng sẽ khiến lần nộp lại kế tiếp đánh số là v1 và ghi đè lịch sử.
 */
export async function createDocumentWithFirstVersion(params: {
  thesisId: number;
  uploaderId: number;
  file: StoredUpload;
  tags: string[];
}): Promise<DocumentDetail> {
  const { thesisId, uploaderId, file, tags } = params;

  const created = await prisma.$transaction(async (tx) => {
    const doc = await tx.document.create({
      data: {
        thesis_id: thesisId,
        filename: sanitizeFilename(file.originalName),
        file_path: file.relativePath,
        file_size: file.size,
        mime_type: file.mimeType,
        tags,
        uploaded_by: uploaderId,
        // Worker sẽ chuyển sang PROCESSING rồi DONE/ERROR (UC 5.9).
        status_ai: "PENDING",
      },
      select: { id: true },
    });

    await tx.documentVersion.create({
      data: {
        document_id: doc.id,
        version_number: 1,
        file_path: file.relativePath,
        file_size: file.size,
        mime_type: file.mimeType,
        uploaded_by: uploaderId,
        is_current: true,
      },
    });

    return doc;
  });

  // Đọc lại sau transaction để `_count.versions` phản ánh phiên bản vừa tạo —
  // đếm trong cùng transaction sẽ trả về 0.
  return loadDocumentDetail(created.id);
}

/**
 * Thêm phiên bản mới (Document Versioning — `Yêu cầu dự án.md` §3.1).
 *
 * Toàn bộ nằm trong MỘT transaction và thứ tự là bắt buộc: hạ cờ `is_current`
 * của bản cũ TRƯỚC khi chèn bản mới. Migration `..._vector_and_search_indexes`
 * có unique index bộ phận `ON document_versions (document_id) WHERE is_current`,
 * nên chèn trước sẽ vi phạm ràng buộc và cuộn lại cả lượt nộp.
 */
export async function addDocumentVersion(params: {
  documentId: number;
  uploaderId: number;
  file: StoredUpload;
  changeNote?: string;
}) {
  const { documentId, uploaderId, file, changeNote } = params;

  return prisma.$transaction(async (tx) => {
    const latest = await tx.documentVersion.findFirst({
      where: { document_id: documentId },
      orderBy: { version_number: "desc" },
      select: { version_number: true },
    });

    await tx.documentVersion.updateMany({
      where: { document_id: documentId, is_current: true },
      data: { is_current: false },
    });

    const version = await tx.documentVersion.create({
      data: {
        document_id: documentId,
        version_number: (latest?.version_number ?? 0) + 1,
        file_path: file.relativePath,
        file_size: file.size,
        mime_type: file.mimeType,
        uploaded_by: uploaderId,
        change_note: changeNote ?? null,
        is_current: true,
      },
      include: VERSION_INCLUDE,
    });

    await tx.document.update({
      where: { id: documentId },
      data: {
        // `filename` cố ý KHÔNG đổi theo tên tệp mới: đó là tên hiển thị do
        // người dùng quản lý qua UC 5.6, còn đây chỉ là thay nội dung.
        file_path: file.relativePath,
        file_size: file.size,
        mime_type: file.mimeType,
        // Nội dung đã khác thì chỉ mục và tóm tắt cũ không còn đúng nữa.
        status_ai: "PENDING",
        ai_attempts: 0,
        ai_error: null,
        ai_started_at: null,
        page_count: null,
      },
    });

    return version;
  });
}

/* ==========================================================================
   THÔNG BÁO
   ========================================================================== */

/**
 * Báo cho giảng viên hướng dẫn khi có tài liệu mới.
 *
 * Chỉ gửi cho giảng viên, không gửi cho cả nhóm: các thành viên còn lại đang mở
 * cùng trang danh sách và đã thấy tệp, còn giảng viên thì không — đúng đối tượng
 * cần biết mà không biến hộp thông báo thành nơi ai cũng bỏ qua.
 */
export async function notifySupervisorAboutUpload(params: {
  thesisId: number;
  actorId: number;
  actorName: string;
  filename: string;
  isNewVersion: boolean;
}): Promise<void> {
  const { thesisId, actorId, actorName, filename, isNewVersion } = params;

  const audience = await thesisAudience(thesisId);
  const lecturerUserId = audience.lecturerUserId;
  // Giảng viên tự tải lên thì không cần tự báo cho mình.
  if (lecturerUserId === null || lecturerUserId === actorId) return;

  await notify({
    userId: lecturerUserId,
    type: "THESIS",
    title: isNewVersion ? "Có phiên bản tài liệu mới" : "Có tài liệu mới được tải lên",
    content: isNewVersion
      ? `${actorName} vừa nộp phiên bản mới cho tài liệu “${filename}”.`
      : `${actorName} vừa tải lên tài liệu “${filename}”.`,
    link: `/documents?thesis_id=${thesisId}`,
  });
}

/** UC 5.10 — người của đề tài nhận chia sẻ cần biết mình vừa có thêm tài liệu. */
export async function notifyShareRecipients(params: {
  targetThesisId: number;
  actorId: number;
  actorName: string;
  filename: string;
}): Promise<void> {
  const { targetThesisId, actorId, actorName, filename } = params;

  const audience = await thesisAudience(targetThesisId);
  const recipients = audience.all.filter((id) => id !== actorId);
  if (recipients.length === 0) return;

  await notifyMany(recipients, {
    type: "THESIS",
    title: "Tài liệu được chia sẻ tới đề tài của bạn",
    content: `${actorName} đã chia sẻ tài liệu “${filename}” cho đề tài của bạn (chỉ đọc).`,
    link: `/documents?thesis_id=${targetThesisId}`,
  });
}

export { SHARE_INCLUDE };

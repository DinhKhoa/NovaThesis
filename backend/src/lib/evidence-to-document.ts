/**
 * MINH CHỨNG MỐC TIẾN ĐỘ → TÀI LIỆU CÓ THỂ HỎI ĐÁP
 *
 * Trước tệp này, minh chứng (UC 4.9) và tài liệu (Module 5) là hai kho tách rời:
 * sinh viên nộp `bao_cao_giua_ky.pdf` làm minh chứng, rồi hỏi trợ lý "báo cáo
 * giữa kỳ của tôi thiếu gì" và nhận lại "không tìm thấy" — vì tệp đó chưa bao
 * giờ đi qua đường lập chỉ mục. Đăng ký minh chứng thành một `Document` khiến
 * chính nó trở thành nguồn RAG, có trích dẫn và có tóm tắt.
 *
 * ⚠️ VÌ SAO Ở `lib/` CHỨ KHÔNG Ở `modules/milestones/` HAY `modules/documents/`:
 * đây là logic mà CẢ HAI module cần biết. Đặt nó vào một trong hai sẽ buộc module
 * kia phải `import` ngang qua ranh giới module — thứ mà kiến trúc của dự án cấm,
 * và cũng là cách nhanh nhất để hai module dính chặt vào nhau.
 *
 * Quy ước THẺ là hợp đồng giữa hai module, không phải chi tiết cài đặt:
 *
 *   • `milestone-evidence`      — "bản ghi này sinh ra từ một minh chứng"
 *   • `milestone-id:<id>`       — mốc nào, dùng để tìm ngược và để thay thế
 *
 * `documents.tags` là `text[]` có index GIN nên `tags @> ARRAY[...]` chạy bằng
 * index chứ không quét bảng.
 */
import { prisma } from "./prisma";
import { logger } from "./logger";
import { DOCUMENT_MIME } from "./storage";
import { enqueueIndexing } from "../workers/document-indexer";
import { deleteChunks } from "../services/ai/vector.repository";

/** Thẻ đánh dấu mọi tài liệu sinh ra từ minh chứng. */
export const EVIDENCE_TAG = "milestone-evidence";

/** Thẻ trỏ ngược về mốc. Một hàm để không nơi nào tự ghép chuỗi sai định dạng. */
export function milestoneTag(milestoneId: number): string {
  return `milestone-id:${milestoneId}`;
}

/**
 * Định dạng trích xuất được văn bản.
 *
 * Suy từ `DOCUMENT_MIME` thay vì chép lại danh sách: `EVIDENCE_MIME` rộng hơn
 * (thêm ZIP và ảnh), và hai danh sách chép tay sẽ lệch nhau ngay lần đầu ai đó
 * bổ sung một định dạng tài liệu mới. Ảnh PNG/JPEG cố ý KHÔNG nằm ở đây: chưa
 * có OCR trong dự án, nên đẩy chúng vào hàng đợi chỉ tạo ra một job chắc chắn
 * thất bại và một tài liệu vĩnh viễn ở trạng thái ERROR.
 */
const INDEXABLE_MIME = new Set(Object.keys(DOCUMENT_MIME));

export interface EvidenceDocumentResult {
  documentId: number;
  /** `false` với ảnh và tệp nén — không có gì để trích xuất. */
  willIndex: boolean;
  /** Số bản ghi minh chứng cũ của cùng mốc đã bị xoá mềm. */
  replaced: number;
}

/**
 * Đăng ký tệp minh chứng vừa lưu thành một `Document` của đề tài.
 *
 * Nộp lại minh chứng cho cùng một mốc sẽ THAY THẾ bản trước: bản cũ bị xoá mềm
 * và vector của nó bị dọn. Không làm vậy thì sau ba lần nộp lại, trợ lý có ba
 * phiên bản của cùng một tệp trong phạm vi truy xuất và sẽ trích dẫn đúng bản
 * mà sinh viên đã sửa bỏ.
 *
 * Hàm này KHÔNG kiểm tra quyền: nó chỉ được gọi sau khi handler đã đi qua
 * `assertThesisAccess`. Đó cũng là lý do nó nhận `thesisId` đã xác định chứ
 * không tự tra ngược từ `milestoneId`.
 */
export async function registerEvidenceAsDocument(params: {
  thesisId: number;
  milestoneId: number;
  uploaderId: number;
  filePath: string;
  filename: string;
  mimeType: string;
  fileSize: number;
}): Promise<EvidenceDocumentResult> {
  const { thesisId, milestoneId, uploaderId, filePath, filename, mimeType, fileSize } = params;

  const tag = milestoneTag(milestoneId);

  const oldDocs = await prisma.document.findMany({
    where: { thesis_id: thesisId, deleted_at: null, tags: { has: tag } },
    select: { id: true },
  });

  const willIndex = INDEXABLE_MIME.has(mimeType);

  // Xoá mềm bản cũ và tạo bản mới trong CÙNG một giao dịch: đứt gánh ở giữa sẽ
  // để lại hai bản ghi cùng trỏ về một mốc, và bảng nguồn của trợ lý sẽ hiện
  // hai dòng trùng tên.
  const newDoc = await prisma.$transaction(async (tx) => {
    if (oldDocs.length > 0) {
      await tx.document.updateMany({
        where: { id: { in: oldDocs.map((d) => d.id) } },
        data: { deleted_at: new Date() },
      });
    }

    return tx.document.create({
      data: {
        thesis_id: thesisId,
        uploaded_by: uploaderId,
        filename,
        file_path: filePath,
        file_size: fileSize,
        mime_type: mimeType,
        tags: [EVIDENCE_TAG, tag],
        status_ai: willIndex ? "PENDING" : "DONE",
        // Không để `summary_ai` rỗng với ảnh: bảng nguồn hiển thị tóm tắt làm
        // tooltip, và một ô trống không nói được vì sao tệp này không tra cứu
        // được — người dùng sẽ tưởng hệ thống đang xử lý dở.
        summary_ai: willIndex
          ? null
          : "Tệp ảnh hoặc tệp nén — hệ thống không trích xuất được nội dung văn bản, nên tài liệu này không dùng làm nguồn trích dẫn được.",
      },
      select: { id: true },
    });
  });

  // Dọn vector SAU khi giao dịch commit. `deleteChunks` dùng client toàn cục nên
  // gọi bên trong `$transaction` cũng không nằm trong giao dịch đó — làm vậy sẽ
  // xoá vector thật rồi mới rollback bản ghi, để lại tài liệu còn sống mà không
  // còn chỉ mục. Bản cũ đã `deleted_at` nên nó đã nằm ngoài phạm vi
  // `accessibleDocumentIds()` ngay từ lúc commit; đây chỉ là dọn kho.
  for (const old of oldDocs) {
    await deleteChunks(old.id).catch((err: unknown) => {
      logger.error({ err, documentId: old.id }, "Không dọn được vector của minh chứng cũ");
    });
  }

  if (willIndex) enqueueIndexing(newDoc.id);

  return { documentId: newDoc.id, willIndex, replaced: oldDocs.length };
}

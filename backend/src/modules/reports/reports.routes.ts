/**
 * MODULE 9 — BÁO CÁO & THỐNG KÊ (UC 9.1 → 9.4)
 *
 * Bốn nhóm endpoint: KPI tổng quan cho trang Báo cáo, kết xuất PDF tiến độ một
 * đề tài (UC 9.1), kết xuất danh sách đề tài ra CSV/XLSX (UC 9.2), thống kê
 * hoạt động AI cho Admin (UC 9.3) và dữ liệu biểu đồ Gantt (UC 9.4).
 *
 * Hai điểm cần giữ nguyên khi sửa về sau:
 *
 *   • Phạm vi dữ liệu đi qua `domain/access.ts`, không có ngoại lệ. Endpoint
 *     xuất tệp là chỗ nguy hiểm nhất trong cả hệ thống: kết quả không hiện lên
 *     màn hình để ai đó kịp phát hiện bất thường, nó nằm luôn trong Downloads.
 *   • Mọi truy vấn dữ liệu phải xong TRƯỚC khi ghi header phản hồi. Khi tệp đã
 *     bắt đầu chảy ra socket thì không còn cách nào trả về JSON lỗi nữa —
 *     người dùng sẽ nhận một tệp cụt thay vì một thông báo đọc được.
 */
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/http";
import { audit, AuditAction } from "../../lib/audit";
import { currentUser, requireAuth, requireRole } from "../../middleware/auth";
import { optionalText, validateParams, validateQuery } from "../../middleware/validate";
import { assertThesisAccess } from "../../domain/access";
import {
  buildGantt,
  buildOverview,
  loadProgressReport,
  loadThesesForExport,
  progressPdfFilename,
  resolveVietnameseFonts,
  streamProgressPdf,
  streamThesesCsv,
  streamThesesXlsx,
  thesesExportFilename,
  type ThesisExportFilters,
} from "./reports.service";

export const reportsRouter = Router();

// Không có báo cáo nào là dữ liệu công khai.
reportsRouter.use(requireAuth);

/* ==========================================================================
   LƯỢC ĐỒ ĐẦU VÀO
   ========================================================================== */

const THESIS_STATUS_VALUES = [
  "DRAFT",
  "PENDING",
  "REVISION_REQUIRED",
  "ONGOING",
  "COMPLETED",
  "REJECTED",
] as const;

/**
 * Ô lọc trên giao diện gửi `"ALL"` khi người dùng chọn "Tất cả". Không quy về
 * `undefined` thì server đi tìm đề tài có `status = "ALL"` và xuất ra một tệp
 * rỗng — người dùng đọc thành "mất dữ liệu", không phải "lọc sai".
 */
const anyToUndefined = (value: unknown): unknown =>
  value === "" || value === "ALL" || value === null ? undefined : value;

const positiveId = (label: string) =>
  z.coerce
    .number({ invalid_type_error: `${label} không hợp lệ.` })
    .int(`${label} không hợp lệ.`)
    .positive(`${label} không hợp lệ.`);

const thesisIdParams = z.object({ thesis_id: positiveId("Mã đề tài") });

const ganttQuerySchema = z.object({ thesis_id: positiveId("Mã đề tài") });

const exportQuerySchema = z.object({
  format: z.preprocess(
    anyToUndefined,
    z
      .enum(["csv", "xlsx"], {
        errorMap: () => ({ message: "Định dạng xuất chỉ hỗ trợ csv hoặc xlsx." }),
      })
      .default("xlsx")
  ),
  status: z.preprocess(
    anyToUndefined,
    z
      .enum(THESIS_STATUS_VALUES, {
        errorMap: () => ({ message: "Trạng thái lọc không hợp lệ." }),
      })
      .optional()
  ),
  field: z.preprocess(anyToUndefined, optionalText(100, "Lĩnh vực")),
  academic_year_id: z.preprocess(anyToUndefined, positiveId("Năm học").optional()),
  lecturer_id: z.preprocess(anyToUndefined, positiveId("Giảng viên").optional()),
});

/* ==========================================================================
   TIỆN ÍCH PHẢN HỒI TỆP
   ========================================================================== */

/**
 * Tên tệp trong header HTTP.
 *
 * Header HTTP là latin-1: tên tệp có dấu chưa mã hoá sẽ bị cắt cụt hoặc làm
 * hỏng cả dòng header. Gửi kèm cả `filename=` dạng ASCII (cho trình duyệt cũ)
 * lẫn `filename*=UTF-8''` theo RFC 5987 (cho trình duyệt hiện đại).
 */
function attachment(filename: string): string {
  // So sánh theo code point thay vì dùng lớp ký tự điều khiển trong regex.
  let ascii = "";
  for (const ch of filename) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 0x22) ascii += "'";
    else if (code >= 0x20 && code <= 0x7e) ascii += ch;
    else ascii += "_";
  }
  return `attachment; filename="${ascii || "download"}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** Tệp báo cáo chứa dữ liệu riêng tư: không cho proxy nào lưu đệm. */
function noStore(headers: Record<string, string>): Record<string, string> {
  return { ...headers, "Cache-Control": "private, max-age=0, no-store" };
}

/* ==========================================================================
   KPI TỔNG QUAN — trang Báo cáo
   ========================================================================== */

/**
 * Phạm vi theo vai trò: sinh viên thấy số liệu đề tài mình, giảng viên thấy các
 * đề tài mình hướng dẫn, Admin thấy toàn hệ thống. Cả ba đọc CÙNG một endpoint
 * vì luật phạm vi nằm ở `thesisScopeFilter`, không nằm ở ba nhánh `if` chép tay.
 */
reportsRouter.get(
  "/overview",
  asyncHandler(async (req, res) => {
    res.json(await buildOverview(currentUser(req)));
  })
);

/* ==========================================================================
   UC 9.1 — XUẤT BÁO CÁO TIẾN ĐỘ (PDF)
   ========================================================================== */

reportsRouter.get(
  "/progress/:thesis_id/pdf",
  validateParams(thesisIdParams),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { thesis_id } = req.params as unknown as z.infer<typeof thesisIdParams>;

    // Business rule UC 9.1: SV chỉ đề tài mình, GV chỉ đề tài mình hướng dẫn,
    // Admin tất cả — đúng định nghĩa của capability "view".
    await assertThesisAccess(user, thesis_id, "view");

    // Kiểm tra font TRƯỚC khi chạm vào header: thiếu font thì còn trả được 503
    // dạng JSON, chứ khi PDF đã bắt đầu chảy ra thì không quay lại được nữa.
    resolveVietnameseFonts();

    const report = await loadProgressReport(thesis_id);

    audit({
      action: AuditAction.REPORT_EXPORT,
      req,
      details: {
        report: "thesis_progress",
        format: "pdf",
        thesis_id,
        milestones: report.milestones.length,
      },
    });

    res.writeHead(
      200,
      noStore({
        "Content-Type": "application/pdf",
        "Content-Disposition": attachment(progressPdfFilename(report)),
      })
    );

    streamProgressPdf(res, report, user.full_name);
  })
);

/* ==========================================================================
   UC 9.2 — XUẤT DANH SÁCH ĐỀ TÀI (CSV / XLSX)
   ========================================================================== */

/**
 * Chỉ giảng viên và Admin (pre-condition UC 9.2). Sinh viên có endpoint riêng
 * là báo cáo tiến độ PDF của chính đề tài mình.
 */
reportsRouter.get(
  "/theses/export",
  requireRole("LECTURER", "ADMIN"),
  validateQuery(exportQuerySchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const query = req.query as unknown as z.infer<typeof exportQuerySchema>;

    const filters: ThesisExportFilters = {
      status: query.status,
      field: query.field,
      academic_year_id: query.academic_year_id,
      lecturer_id: query.lecturer_id,
    };

    // Business rule UC 9.2-3: bộ lọc trên giao diện phải phản ánh CHÍNH XÁC
    // trong tệp xuất ra, nên cùng một bộ điều kiện được dùng cho cả hai định
    // dạng. Hàm này cũng là nơi ném "không có dữ liệu" / "dữ liệu quá lớn".
    const rows = await loadThesesForExport(user, filters);
    const filename = thesesExportFilename(query.format);

    audit({
      action: AuditAction.REPORT_EXPORT,
      req,
      details: { report: "thesis_list", format: query.format, count: rows.length, ...filters },
    });

    if (query.format === "csv") {
      res.writeHead(
        200,
        noStore({
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": attachment(filename),
        })
      );
      streamThesesCsv(res, rows);
      return;
    }

    res.writeHead(
      200,
      noStore({
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": attachment(filename),
      })
    );
    await streamThesesXlsx(res, rows);
  })
);

/* ==========================================================================
   UC 9.3 — THỐNG KÊ HOẠT ĐỘNG AI

   ĐÃ XOÁ `GET /reports/ai-usage`.
   Nó gọi đúng cùng một hàm `collectAiStats()` như `GET /ai/stats`, cùng đòi
   quyền ADMIN, và khác biệt duy nhất là thêm trường `generated_at`. Không trang
   nào gọi tới nó. Hai endpoint trả cùng một câu trả lời cho cùng một câu hỏi là
   hai chỗ để về sau trôi dạt khỏi nhau.

   `generated_at` đã chuyển sang `GET /ai/stats` để không mất thông tin "số liệu
   tính lúc nào" — thiếu nó thì người xem không phân biệt được bảng đang mới hay
   đang treo ở bản cũ.

   Lưu ý: đây KHÔNG phải phần thống kê AI trên trang Báo cáo. Phần đó nằm trong
   `GET /reports/overview` (`ai_by_feature`), lọc theo vai trò người xem, và sinh
   viên cùng giảng viên cần nó — xem `buildOverview()` trong `reports.service.ts`.
   ========================================================================== */

/* ==========================================================================
   UC 9.4 — BIỂU ĐỒ GANTT
   ========================================================================== */

reportsRouter.get(
  "/gantt",
  validateQuery(ganttQuerySchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { thesis_id } = req.query as unknown as z.infer<typeof ganttQuerySchema>;

    await assertThesisAccess(user, thesis_id, "view");

    res.json(await buildGantt(thesis_id));
  })
);

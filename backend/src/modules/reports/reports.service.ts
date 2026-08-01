/**
 * MODULE 9 — BÁO CÁO & THỐNG KÊ (UC 9.1 → 9.4)
 *
 * Phần nặng của module nằm ở đây: tổng hợp số liệu và KẾT XUẤT tệp. Tách khỏi
 * `reports.routes.ts` vì ba trình dựng tài liệu (PDF, CSV, XLSX) đều dài, còn
 * tầng route chỉ nên lo xác thực đầu vào, phân quyền và ghi nhật ký.
 *
 * Nguyên tắc xuyên suốt: phạm vi dữ liệu LUÔN lấy từ `domain/access.ts`. Báo
 * cáo là nơi rò rỉ đắt nhất — một câu SELECT quên mệnh đề phạm vi ở đây không
 * chỉ hiện sai một con số, nó xuất nguyên danh sách luận văn toàn trường thành
 * một tệp Excel nằm trên máy người lạ.
 */
import fs from "node:fs";
import path from "node:path";
import type { Response } from "express";
import PDFDocument from "pdfkit";
import { Workbook } from "exceljs";
import { Prisma, type MilestoneStatus, type ThesisStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { HttpError, notFound, unprocessable } from "../../lib/errors";
import { logger } from "../../lib/logger";
import { STATUS_LABELS, THESIS_STATUS_LABELS } from "../../domain/milestone-fsm";
import { thesisScopeFilter, visibleThesisIds } from "../../domain/access";
import type { AuthUser } from "../../middleware/auth";

/* ==========================================================================
   HẰNG SỐ TRÌNH BÀY
   ========================================================================== */

const SYSTEM_TITLE = "NOVATHESIS — HỆ THỐNG QUẢN LÝ LUẬN VĂN TỐT NGHIỆP";

/**
 * Tên trường đọc từ `system_configs` nếu quản trị viên đã đặt, nếu chưa thì
 * dùng giá trị mặc định. Không nhúng cứng: cùng một mã nguồn có thể được cài
 * cho nhiều khoa/trường, và sửa tên trường không đáng phải build lại backend.
 */
const SCHOOL_NAME_KEY = "SCHOOL_NAME";
const SCHOOL_NAME_FALLBACK = "Trường Đại học — Khoa Công nghệ Thông tin";

async function schoolName(): Promise<string> {
  const row = await prisma.systemConfig.findUnique({
    where: { config_key: SCHOOL_NAME_KEY },
    select: { config_value: true },
  });
  const value = row?.config_value.trim();
  return value && value.length > 0 ? value : SCHOOL_NAME_FALLBACK;
}

/* ==========================================================================
   UC 9.x — TIỆN ÍCH NGÀY THÁNG
   ========================================================================== */

/**
 * Định dạng theo các thành phần UTC chứ không theo múi giờ máy chủ.
 *
 * `deadline` được nhập như một NGÀY (input type="date" của trình duyệt gửi lên
 * lúc 00:00 UTC). Đọc lại bằng `getDate()` trên một máy chủ đặt ở UTC-5 sẽ lùi
 * mọi hạn nộp về hôm trước — cả báo cáo lệch một ngày mà không ai nhận ra.
 */
function formatDate(value: Date | null | undefined): string {
  if (!value) return "";
  const d = String(value.getUTCDate()).padStart(2, "0");
  const m = String(value.getUTCMonth() + 1).padStart(2, "0");
  return `${d}/${m}/${value.getUTCFullYear()}`;
}

function formatDateTime(value: Date): string {
  const hh = String(value.getUTCHours()).padStart(2, "0");
  const mm = String(value.getUTCMinutes()).padStart(2, "0");
  return `${formatDate(value)} ${hh}:${mm} (UTC)`;
}

/**
 * Kỳ nghiên cứu của đề tài.
 *
 * Xử lý cả trường hợp chỉ có một đầu: một đề tài mới thường biết ngày bắt đầu
 * trước khi biết ngày kết thúc, và in ra "01/09/2025 – " thì tệ hơn là nói rõ
 * "từ 01/09/2025".
 */
function formatPeriod(start: Date | null, end: Date | null): string {
  if (start && end) return `${formatDate(start)} – ${formatDate(end)}`;
  if (start) return `từ ${formatDate(start)}`;
  if (end) return `đến ${formatDate(end)}`;
  return "Chưa đặt kỳ nghiên cứu";
}

/** Chỉ ngày, dùng cho trục thời gian của biểu đồ Gantt. */
function isoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function fileStamp(value: Date): string {
  return isoDay(value).replace(/-/g, "");
}

/**
 * Mốc 00:00 UTC của hôm nay.
 *
 * So "quá hạn" theo NGÀY, không theo mili giây: một mốc đến hạn hôm nay chưa
 * phải là trễ lúc 9 giờ sáng, dù `deadline` lưu là 00:00 của chính ngày đó.
 */
function startOfTodayUtc(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function isOverdue(deadline: Date, status: MilestoneStatus): boolean {
  return status !== "COMPLETED" && deadline.getTime() < startOfTodayUtc();
}

function percentOf(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

/* ==========================================================================
   UC 9.x — TỔNG QUAN KPI (GET /overview)
   ========================================================================== */

type AiFeatureKey = "chat" | "search" | "summarize" | "suggest" | "plagiarism";

const AI_FEATURE_LABELS: Record<AiFeatureKey, string> = {
  chat: "Hỏi đáp trợ lý RAG (pgvector)",
  search: "Tìm kiếm ngữ nghĩa tài liệu",
  summarize: "Tóm tắt tài liệu tự động",
  suggest: "Gợi ý lộ trình milestone",
  plagiarism: "Kiểm tra trùng lặp & đạo văn",
};

export async function buildOverview(user: AuthUser) {
  // Hai lời gọi vào `domain/access` thay vì tự suy ra một cái từ cái kia: đó là
  // API công khai của tầng kiểm soát truy cập, và giá phải trả chỉ là một truy
  // vấn id rất rẻ. Đổi lại, module này không giữ bản sao nào của luật phạm vi.
  const [scope, thesisIds] = await Promise.all([
    thesisScopeFilter(user),
    visibleThesisIds(user),
  ]);

  const thesisWhere: Prisma.ThesisWhereInput = { deleted_at: null, ...scope };

  const [byStatus, studentRows, features] = await Promise.all([
    prisma.thesis.groupBy({ by: ["status"], where: thesisWhere, _count: { _all: true } }),
    // `distinct` để một sinh viên tham gia hai đề tài không bị đếm hai lần.
    prisma.thesisMember.findMany({
      where: { left_at: null, thesis: thesisWhere },
      select: { student_id: true },
      distinct: ["student_id"],
    }),
    countAiFeatures(user, thesisIds),
  ]);

  const counts = new Map<ThesisStatus, number>();
  for (const row of byStatus) counts.set(row.status, row._count._all);

  const total = byStatus.reduce((sum, row) => sum + row._count._all, 0);
  const completed = counts.get("COMPLETED") ?? 0;

  const featureTotal = features.reduce((sum, f) => sum + f.count, 0);

  return {
    total_theses: total,
    // Một chữ số thập phân: giao diện in "78.5%", làm tròn về số nguyên sẽ nuốt
    // mất chênh lệch giữa hai kỳ báo cáo liền nhau.
    completion_rate: total === 0 ? 0 : Math.round((completed / total) * 1000) / 10,
    ai_queries: featureTotal,
    total_students: studentRows.length,

    // Trả đủ cả 6 trạng thái kể cả khi bằng 0, theo đúng thứ tự khai báo trong
    // `THESIS_STATUS_LABELS`: biểu đồ cột giữ nguyên vị trí giữa các lần tải
    // thay vì đảo chỗ mỗi khi một trạng thái rỗng đi.
    theses_by_status: (Object.keys(THESIS_STATUS_LABELS) as ThesisStatus[]).map((status) => {
      const count = counts.get(status) ?? 0;
      return { status, label: THESIS_STATUS_LABELS[status], count, percent: percentOf(count, total) };
    }),

    // ⚠️ `share` ở ĐÂY là PHẦN TRĂM (0–100) để khớp badge "{share}%" của trang
    // Báo cáo, khác với `by_feature.share` của `/ai/stats` vốn là tỷ lệ 0–1.
    // Hai endpoint, hai đối tượng đọc — ghi rõ ra để không ai nhân 100 lần nữa.
    ai_by_feature: features.map((f) => ({
      feature: f.feature,
      label: AI_FEATURE_LABELS[f.feature],
      count: f.count,
      share: percentOf(f.count, featureTotal),
    })),
  };
}

/**
 * Đếm lượt dùng AI theo từng tính năng, giới hạn trong phạm vi người dùng.
 *
 * `system_logs` không gắn với đề tài nên hai tính năng tra cứu (tìm kiếm ngữ
 * nghĩa, tóm tắt) chỉ giới hạn được theo CHÍNH người đang xem. Đó là giới hạn
 * chặt hơn phạm vi đề tài, không lỏng hơn — nên vẫn an toàn về mặt cách ly dữ
 * liệu, chỉ là giảng viên thấy số của riêng mình thay vì của cả nhóm hướng dẫn.
 */
async function countAiFeatures(
  user: AuthUser,
  thesisIds: number[] | null
): Promise<Array<{ feature: AiFeatureKey; count: number }>> {
  const isAdmin = thesisIds === null;

  const sessionScope: Prisma.AIChatSessionWhereInput | undefined = isAdmin
    ? undefined
    : {
        // Phiên chat không gắn đề tài (sinh viên chưa được duyệt đề tài) vẫn là
        // hoạt động của chính người này, nên phải được tính.
        OR: [{ thesis_id: { in: thesisIds } }, { user_id: user.id }],
      };

  const logScope = isAdmin ? {} : { user_id: user.id };
  const thesisScope = isAdmin ? {} : { thesis_id: { in: thesisIds } };

  const [chat, search, summarize, suggest, plagiarism] = await prisma.$transaction([
    prisma.aIChatMessage.count({
      where: { role: "ASSISTANT", ...(sessionScope ? { session: sessionScope } : {}) },
    }),
    prisma.systemLog.count({ where: { action: "AI_SEMANTIC_SEARCH", ...logScope } }),
    prisma.systemLog.count({ where: { action: "AI_SUMMARIZE", ...logScope } }),
    prisma.aISuggestion.count({ where: thesisScope }),
    prisma.plagiarismCheck.count({ where: thesisScope }),
  ]);

  return [
    { feature: "chat", count: chat },
    { feature: "search", count: search },
    { feature: "summarize", count: summarize },
    { feature: "suggest", count: suggest },
    { feature: "plagiarism", count: plagiarism },
  ];
}

/* ==========================================================================
   UC 9.1 — BÁO CÁO TIẾN ĐỘ (PDF)
   ========================================================================== */

interface ProgressMilestone {
  name: string;
  deadline: Date;
  status: MilestoneStatus;
  approved_at: Date | null;
  overdue: boolean;
}

interface ProgressFeedback {
  author: string;
  target: string;
  created_at: Date;
  content: string;
}

export interface ProgressReport {
  school: string;
  thesis_id: number;
  title: string;
  field: string;
  status_label: string;
  lecturer: string;
  students: string;
  /** Kỳ nghiên cứu của đề tài, dạng "01/09/2025 – 31/08/2026" hoặc "Chưa đặt". */
  research_period: string;
  created_at: Date;
  completed_at: Date | null;
  milestones: ProgressMilestone[];
  milestone_done: number;
  progress_percent: number;
  feedbacks: ProgressFeedback[];
}

/** Số phản hồi gần nhất in vào báo cáo — đủ để nắm tình hình, không tràn trang. */
const RECENT_FEEDBACK_LIMIT = 5;

export async function loadProgressReport(thesisId: number): Promise<ProgressReport> {
  const [thesis, feedbacks, school] = await Promise.all([
    prisma.thesis.findFirst({
      where: { id: thesisId, deleted_at: null },
      select: {
        id: true,
        title: true,
        field: true,
        status: true,
        created_at: true,
        completed_at: true,
        lecturer: { select: { user: { select: { full_name: true } } } },
        start_date: true,
        end_date: true,
        members: {
          where: { left_at: null },
          orderBy: { joined_at: "asc" },
          select: {
            student: {
              select: { student_code: true, user: { select: { full_name: true } } },
            },
          },
        },
        milestones: {
          where: { deleted_at: null },
          orderBy: [{ order_index: "asc" }, { deadline: "asc" }, { id: "asc" }],
          select: { name: true, deadline: true, status: true, approved_at: true },
        },
      },
    }),
    // Một truy vấn duy nhất cho cả hai loại phản hồi (theo mốc và theo tài
    // liệu). Hỏi riêng từng mốc là đúng kiểu N+1 mà đề tài 20 mốc sẽ trả giá.
    prisma.feedback.findMany({
      where: {
        deleted_at: null,
        author: { role: { in: ["LECTURER", "ADMIN"] } },
        OR: [
          { milestone: { thesis_id: thesisId, deleted_at: null } },
          { document: { thesis_id: thesisId, deleted_at: null } },
        ],
      },
      orderBy: { created_at: "desc" },
      take: RECENT_FEEDBACK_LIMIT,
      select: {
        content: true,
        created_at: true,
        author: { select: { full_name: true } },
        milestone: { select: { name: true } },
        document: { select: { filename: true } },
      },
    }),
    schoolName(),
  ]);

  if (!thesis) throw notFound("Đề tài không tồn tại hoặc đã bị xóa.");

  const milestones: ProgressMilestone[] = thesis.milestones.map((m) => ({
    name: m.name,
    deadline: m.deadline,
    status: m.status,
    approved_at: m.approved_at,
    overdue: isOverdue(m.deadline, m.status),
  }));

  const done = milestones.filter((m) => m.status === "COMPLETED").length;

  const students = thesis.members
    .map((m) => {
      const code = m.student.student_code;
      return code ? `${m.student.user.full_name} (${code})` : m.student.user.full_name;
    })
    .join(", ");

  return {
    school,
    thesis_id: thesis.id,
    title: thesis.title,
    field: thesis.field,
    status_label: THESIS_STATUS_LABELS[thesis.status],
    lecturer: thesis.lecturer?.user.full_name ?? "Chưa phân công",
    students: students || "Chưa có sinh viên",
    research_period: formatPeriod(thesis.start_date, thesis.end_date),
    created_at: thesis.created_at,
    completed_at: thesis.completed_at,
    milestones,
    milestone_done: done,
    progress_percent: percentOf(done, milestones.length),
    feedbacks: feedbacks.map((f) => ({
      author: f.author.full_name,
      target: f.milestone?.name ?? f.document?.filename ?? "Đề tài",
      created_at: f.created_at,
      content: f.content,
    })),
  };
}

/* --------------------------------------------------------------------------
   Font tiếng Việt
   -------------------------------------------------------------------------- */

const FONT_FILES = { regular: "NotoSans-Regular.ttf", bold: "NotoSans-Bold.ttf" } as const;

/**
 * Hai vị trí tìm font: theo vị trí mã nguồn (chạy `tsx` từ `src/`, chạy đã build
 * từ `dist/` — cả hai đều lùi ba cấp về gốc backend) và theo thư mục làm việc.
 */
const FONT_DIRS = [
  path.resolve(__dirname, "../../../assets/fonts"),
  path.resolve(process.cwd(), "assets/fonts"),
];

let cachedFonts: { regular: string; bold: string } | null = null;

/**
 * Font mặc định của pdfkit (Helvetica) KHÔNG có glyph tiếng Việt: mọi chữ có
 * dấu sẽ in ra ô vuông, vi phạm thẳng NFR của UC 9.1. Thà từ chối xuất còn hơn
 * giao cho người dùng một tệp PDF không đọc được.
 *
 * Chỉ nhớ kết quả THÀNH CÔNG: nếu lần đầu thiếu font, quản trị viên chạy
 * `npm run setup` xong phải có hiệu lực ngay mà không cần khởi động lại server.
 */
export function resolveVietnameseFonts(): { regular: string; bold: string } {
  if (cachedFonts) return cachedFonts;

  for (const dir of FONT_DIRS) {
    const regular = path.join(dir, FONT_FILES.regular);
    const bold = path.join(dir, FONT_FILES.bold);
    if (fs.existsSync(regular) && fs.existsSync(bold)) {
      cachedFonts = { regular, bold };
      return cachedFonts;
    }
  }

  throw new HttpError(503, "Chưa cài font tiếng Việt, chạy npm run setup", {
    code: "FONT_NOT_INSTALLED",
    context: { searched: FONT_DIRS },
  });
}

/* --------------------------------------------------------------------------
   Trình dựng PDF
   -------------------------------------------------------------------------- */

const PAGE_MARGIN = 50;
/** A4 rộng 595.28pt; trừ hai lề còn 495.28pt cho nội dung. */
const CONTENT_WIDTH = 495;

const COLOR_TEXT = "#111827";
const COLOR_MUTED = "#6b7280";
const COLOR_LINE = "#d1d5db";
const COLOR_HEADER_BG = "#eef2f7";
const COLOR_ACCENT = "#2563eb";
const COLOR_DANGER = "#c0261f";

/** Bề rộng các cột bảng mốc tiến độ — tổng đúng bằng `CONTENT_WIDTH`. */
const COL_NAME = 200;
const COL_DEADLINE = 80;
const COL_STATUS = 110;
const COL_APPROVED = 105;

const MILESTONE_COLUMNS: ReadonlyArray<{ title: string; width: number }> = [
  { title: "Tên mốc", width: COL_NAME },
  { title: "Hạn nộp", width: COL_DEADLINE },
  { title: "Trạng thái", width: COL_STATUS },
  { title: "Ngày duyệt", width: COL_APPROVED },
];

export function progressPdfFilename(report: ProgressReport): string {
  return `bao-cao-tien-do-DT${report.thesis_id}-${fileStamp(new Date())}.pdf`;
}

/**
 * Dựng PDF và ĐẨY THẲNG vào response.
 *
 * Không gom `Buffer` rồi mới gửi: `Yêu cầu dự án.md` §2.4 (Resource Constrained)
 * — vài giảng viên cùng xuất báo cáo đề tài dài là vài chục MB nằm trong heap
 * chỉ để chờ ghi ra socket. `doc.pipe(res)` cho phép byte đầu tiên rời máy chủ
 * trước khi trang cuối được vẽ xong, và đó cũng là cách dễ nhất để giữ NFR
 * "dưới 5 giây" của UC 9.1.
 */
export function streamProgressPdf(res: Response, report: ProgressReport, exporter: string): void {
  const fonts = resolveVietnameseFonts();

  const doc = new PDFDocument({
    size: "A4",
    margin: PAGE_MARGIN,
    // Tự thêm trang đầu thì sự kiện `pageAdded` của trang 1 đã bắn trước khi ta
    // kịp đăng ký listener vẽ chân trang — trang 1 sẽ trống chân trang.
    autoFirstPage: false,
    info: {
      Title: `Báo cáo tiến độ — ${report.title}`,
      Author: exporter,
      Creator: "NovaThesis",
    },
  });

  doc.registerFont("vn", fonts.regular);
  doc.registerFont("vn-bold", fonts.bold);

  doc.on("error", (err: unknown) => {
    // Header đã gửi đi rồi nên không còn cách nào trả JSON lỗi: cắt kết nối để
    // trình duyệt biết tệp hỏng thay vì lưu một PDF cụt.
    logger.error({ err, thesis_id: report.thesis_id }, "Lỗi khi dựng PDF báo cáo tiến độ");
    res.destroy();
  });

  const footer = `Xuất ngày ${formatDateTime(new Date())} — Người xuất: ${exporter}`;
  let pageNumber = 0;

  doc.on("pageAdded", () => {
    pageNumber += 1;
    const page = doc.page;
    const savedBottom = page.margins.bottom;
    // Chân trang nằm TRONG vùng lề dưới. Không tạm bỏ lề thì pdfkit coi dòng
    // này là tràn trang và tự thêm trang mới — mỗi trang mới lại vẽ chân trang,
    // thành đệ quy vô hạn.
    page.margins.bottom = 0;
    doc
      .font("vn")
      .fontSize(8)
      .fillColor(COLOR_MUTED)
      .text(`${footer}    |    Trang ${pageNumber}`, PAGE_MARGIN, page.height - 34, {
        width: CONTENT_WIDTH,
        align: "center",
        lineBreak: false,
      });
    page.margins.bottom = savedBottom;

    doc.fillColor(COLOR_TEXT);
    doc.x = PAGE_MARGIN;
    doc.y = PAGE_MARGIN;
  });

  doc.pipe(res);
  doc.addPage();

  drawReportHeader(doc, report);
  drawThesisInfo(doc, report);
  drawProgressBar(doc, report);
  drawMilestoneTable(doc, report.milestones);
  drawFeedbacks(doc, report.feedbacks);

  doc.end();
}

type Doc = PDFKit.PDFDocument;

function drawReportHeader(doc: Doc, report: ProgressReport): void {
  doc.font("vn-bold").fontSize(15).fillColor(COLOR_TEXT).text(SYSTEM_TITLE, { align: "center" });
  doc.moveDown(0.2);
  doc.font("vn").fontSize(10).fillColor(COLOR_MUTED).text(report.school, { align: "center" });
  doc.moveDown(0.9);
  doc.font("vn-bold").fontSize(13).fillColor(COLOR_ACCENT).text("BÁO CÁO TIẾN ĐỘ ĐỀ TÀI", {
    align: "center",
  });
  doc.moveDown(1);
  ruler(doc);
}

function drawThesisInfo(doc: Doc, report: ProgressReport): void {
  section(doc, "1. Thông tin đề tài");
  infoRow(doc, "Tên đề tài", report.title);
  infoRow(doc, "Lĩnh vực", report.field);
  infoRow(doc, "Trạng thái", report.status_label);
  infoRow(doc, "Giảng viên HD", report.lecturer);
  infoRow(doc, "Sinh viên", report.students);
  infoRow(doc, "Kỳ nghiên cứu", report.research_period);
  infoRow(doc, "Ngày tạo", formatDate(report.created_at));
  if (report.completed_at) infoRow(doc, "Ngày hoàn thành", formatDate(report.completed_at));
  doc.moveDown(0.8);
}

function drawProgressBar(doc: Doc, report: ProgressReport): void {
  section(doc, "2. Tiến độ hoàn thành");

  const percent = report.progress_percent;
  const y = doc.y;
  const height = 16;

  doc.save();
  doc.roundedRect(PAGE_MARGIN, y, CONTENT_WIDTH, height, 4).fillColor("#e5e7eb").fill();
  if (percent > 0) {
    // Tối thiểu 6pt để 1% vẫn nhìn thấy được; một thanh dài 0pt trông y hệt 0%.
    const filled = Math.max(6, Math.round((CONTENT_WIDTH * percent) / 100));
    doc.roundedRect(PAGE_MARGIN, y, filled, height, 4).fillColor(COLOR_ACCENT).fill();
  }
  doc.restore();

  doc
    .font("vn-bold")
    .fontSize(9)
    .fillColor(COLOR_TEXT)
    .text(`${percent}%`, PAGE_MARGIN, y + 4, { width: CONTENT_WIDTH, align: "center" });

  doc.y = y + height + 8;
  doc
    .font("vn")
    .fontSize(9)
    .fillColor(COLOR_MUTED)
    .text(
      `Đã hoàn thành ${report.milestone_done}/${report.milestones.length} mốc tiến độ.`,
      PAGE_MARGIN,
      doc.y,
      { width: CONTENT_WIDTH }
    );
  doc.moveDown(1);
}

function drawMilestoneTable(doc: Doc, milestones: ProgressMilestone[]): void {
  section(doc, "3. Danh sách mốc tiến độ");

  // UC 9.1 nhánh 4a: vẫn xuất báo cáo, chỉ ghi rõ là chưa có dữ liệu.
  if (milestones.length === 0) {
    doc.font("vn").fontSize(10).fillColor(COLOR_MUTED).text("Chưa có dữ liệu.", PAGE_MARGIN, doc.y, {
      width: CONTENT_WIDTH,
    });
    doc.moveDown(1.2);
    return;
  }

  drawTableHeader(doc);

  for (const m of milestones) {
    // Mốc quá hạn chưa hoàn thành phải nổi bật (Business rule UC 9.4-2, áp dụng
    // cả cho báo cáo giấy — người đọc bản in không có màu trạng thái nào khác
    // để dựa vào).
    const color = m.overdue ? COLOR_DANGER : COLOR_TEXT;
    // Chọn font TRƯỚC khi đo: chữ đậm rộng hơn chữ thường nên cùng một tên mốc
    // có thể xuống 3 dòng thay vì 2. Đo bằng font này rồi vẽ bằng font kia là
    // cách chắc chắn để dòng cuối tràn qua đường kẻ của hàng kế tiếp.
    doc.font(m.overdue ? "vn-bold" : "vn").fontSize(9);

    const nameHeight = doc.heightOfString(m.name, { width: COL_NAME - 8 });
    const rowHeight = Math.max(20, nameHeight + 9);

    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      drawTableHeader(doc);
      doc.font(m.overdue ? "vn-bold" : "vn").fontSize(9);
    }

    const y = doc.y;
    doc.fillColor(color);

    let x = PAGE_MARGIN;
    doc.text(m.name, x + 4, y + 5, { width: COL_NAME - 8 });
    x += COL_NAME;
    doc.text(formatDate(m.deadline), x + 4, y + 5, {
      width: COL_DEADLINE - 8,
      lineBreak: false,
      ellipsis: true,
    });
    x += COL_DEADLINE;
    doc.text(m.overdue ? `${STATUS_LABELS[m.status]} (quá hạn)` : STATUS_LABELS[m.status], x + 4, y + 5, {
      width: COL_STATUS - 8,
      lineBreak: false,
      ellipsis: true,
    });
    x += COL_STATUS;
    doc.text(m.approved_at ? formatDate(m.approved_at) : "—", x + 4, y + 5, {
      width: COL_APPROVED - 8,
      lineBreak: false,
      ellipsis: true,
    });

    doc
      .moveTo(PAGE_MARGIN, y + rowHeight)
      .lineTo(PAGE_MARGIN + CONTENT_WIDTH, y + rowHeight)
      .lineWidth(0.5)
      .strokeColor(COLOR_LINE)
      .stroke();

    doc.y = y + rowHeight;
  }

  doc.moveDown(1.2);
}

function drawTableHeader(doc: Doc): void {
  const y = doc.y;
  doc.save();
  doc.rect(PAGE_MARGIN, y, CONTENT_WIDTH, 20).fillColor(COLOR_HEADER_BG).fill();
  doc.restore();

  let x = PAGE_MARGIN;
  doc.font("vn-bold").fontSize(9).fillColor(COLOR_TEXT);
  for (const col of MILESTONE_COLUMNS) {
    doc.text(col.title, x + 4, y + 6, { width: col.width - 8, lineBreak: false });
    x += col.width;
  }
  doc.y = y + 20;
}

function drawFeedbacks(doc: Doc, feedbacks: ProgressFeedback[]): void {
  section(doc, "4. Nhận xét gần đây của giảng viên");

  // UC 9.1 nhánh 4b.
  if (feedbacks.length === 0) {
    doc
      .font("vn")
      .fontSize(10)
      .fillColor(COLOR_MUTED)
      .text("Không có phản hồi nào gần đây.", PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
    return;
  }

  for (const f of feedbacks) {
    if (doc.y + 60 > doc.page.height - doc.page.margins.bottom) doc.addPage();

    doc
      .font("vn-bold")
      .fontSize(9)
      .fillColor(COLOR_TEXT)
      .text(`${f.author} — ${f.target}`, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc
      .font("vn")
      .fontSize(8)
      .fillColor(COLOR_MUTED)
      .text(formatDateTime(f.created_at), PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc
      .font("vn")
      .fontSize(9.5)
      .fillColor(COLOR_TEXT)
      .text(truncate(f.content, 600), PAGE_MARGIN, doc.y + 2, { width: CONTENT_WIDTH });
    doc.moveDown(0.8);
  }
}

function section(doc: Doc, title: string): void {
  if (doc.y + 40 > doc.page.height - doc.page.margins.bottom) doc.addPage();
  doc.font("vn-bold").fontSize(11).fillColor(COLOR_TEXT).text(title, PAGE_MARGIN, doc.y, {
    width: CONTENT_WIDTH,
  });
  doc.moveDown(0.35);
  ruler(doc);
}

function ruler(doc: Doc): void {
  const y = doc.y;
  doc
    .moveTo(PAGE_MARGIN, y)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, y)
    .lineWidth(0.7)
    .strokeColor(COLOR_LINE)
    .stroke();
  doc.y = y + 8;
}

const LABEL_WIDTH = 110;

function infoRow(doc: Doc, label: string, value: string): void {
  if (doc.y + 24 > doc.page.height - doc.page.margins.bottom) doc.addPage();

  const y = doc.y;
  doc.font("vn-bold").fontSize(10).fillColor(COLOR_MUTED).text(label, PAGE_MARGIN, y, {
    width: LABEL_WIDTH,
  });
  const afterLabel = doc.y;

  doc.font("vn").fontSize(10).fillColor(COLOR_TEXT).text(value, PAGE_MARGIN + LABEL_WIDTH + 8, y, {
    width: CONTENT_WIDTH - LABEL_WIDTH - 8,
  });

  // Hai cột vẽ từ cùng một `y`; con trỏ phải nhảy xuống dưới cột DÀI HƠN, nếu
  // không dòng kế tiếp sẽ đè lên phần giá trị bị xuống dòng.
  doc.y = Math.max(afterLabel, doc.y) + 3;
}

function truncate(value: string, max: number): string {
  const clean = value.trim();
  return clean.length <= max ? clean : `${clean.slice(0, max)}…`;
}

/* ==========================================================================
   UC 9.2 — XUẤT DANH SÁCH ĐỀ TÀI (CSV / XLSX)
   ========================================================================== */

export interface ThesisExportFilters {
  status?: ThesisStatus;
  field?: string;
  /** Lọc theo đề tài BẮT ĐẦU trong khoảng này (`theses.start_date`). */
  from?: Date;
  to?: Date;
  lecturer_id?: number;
}

interface ExportRow {
  id: number;
  title: string;
  field: string;
  status: string;
  lecturer: string;
  students: string;
  research_period: string;
  milestone_total: number;
  milestone_done: number;
  document_count: number;
  created_at: string;
  completed_at: string;
}

interface ExportColumn {
  header: string;
  key: keyof ExportRow;
  width: number;
}

/** Một khai báo cột duy nhất cho CẢ CSV lẫn XLSX — hai tệp không thể lệch nhau. */
const EXPORT_COLUMNS: ReadonlyArray<ExportColumn> = [
  { header: "Mã đề tài", key: "id", width: 10 },
  { header: "Tên đề tài", key: "title", width: 46 },
  { header: "Lĩnh vực", key: "field", width: 22 },
  { header: "Trạng thái", key: "status", width: 16 },
  { header: "GVHD", key: "lecturer", width: 24 },
  { header: "Sinh viên", key: "students", width: 32 },
  { header: "Kỳ nghiên cứu", key: "research_period", width: 24 },
  // Không để cột nào rộng đúng ~9: exceljs coi đó là bề rộng mặc định và bỏ hẳn
  // khai báo `<col>`, khiến độ rộng đặt ở đây biến mất sau khi ghi tệp.
  { header: "Số mốc", key: "milestone_total", width: 11 },
  { header: "Mốc hoàn thành", key: "milestone_done", width: 15 },
  { header: "Tài liệu", key: "document_count", width: 10 },
  { header: "Ngày tạo", key: "created_at", width: 13 },
  { header: "Ngày hoàn thành", key: "completed_at", width: 16 },
];

/**
 * Trần số dòng cho một lần xuất.
 *
 * UC 9.2 nhánh ngoại lệ 5a yêu cầu báo "dữ liệu quá lớn" thay vì để request
 * chạy tới lúc timeout. Chặn TRƯỚC khi truy vấn dữ liệu nặng thì máy chủ không
 * phải trả giá cho một yêu cầu chắc chắn thất bại.
 */
const EXPORT_ROW_LIMIT = 5000;

export async function loadThesesForExport(
  user: AuthUser,
  filters: ThesisExportFilters
): Promise<ExportRow[]> {
  const scope = await thesisScopeFilter(user);

  const where: Prisma.ThesisWhereInput = {
    deleted_at: null,
    ...scope,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.field ? { field: { contains: filters.field, mode: "insensitive" } } : {}),
    ...(filters.from || filters.to
      ? {
          start_date: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
    // Lọc theo giảng viên áp lên TRÊN phạm vi, không thay thế nó: một giảng
    // viên gửi `lecturer_id` của đồng nghiệp vẫn chỉ nhận về tệp rỗng.
    ...(filters.lecturer_id ? { lecturer_id: filters.lecturer_id } : {}),
  };

  const total = await prisma.thesis.count({ where });
  if (total === 0) throw unprocessable("Không có dữ liệu phù hợp để xuất.");
  if (total > EXPORT_ROW_LIMIT) {
    throw unprocessable("Dữ liệu quá lớn, vui lòng thu hẹp phạm vi lọc.");
  }

  const theses = await prisma.thesis.findMany({
    where,
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    select: {
      id: true,
      title: true,
      field: true,
      status: true,
      created_at: true,
      completed_at: true,
      lecturer: { select: { user: { select: { full_name: true } } } },
      start_date: true,
      end_date: true,
      members: {
        where: { left_at: null },
        orderBy: { joined_at: "asc" },
        select: { student: { select: { user: { select: { full_name: true } } } } },
      },
      // Trạng thái mốc lấy kèm trong CÙNG truy vấn. Đếm "mốc hoàn thành" bằng
      // một truy vấn riêng cho mỗi đề tài là N+1 thuần tuý — với 500 đề tài thì
      // NFR "dưới 10 giây" của UC 9.2 không còn cơ hội nào.
      milestones: { where: { deleted_at: null }, select: { status: true } },
      _count: { select: { documents: { where: { deleted_at: null } } } },
    },
  });

  return theses.map((t) => ({
    // Hệ thống không có mã đề tài riêng ngoài khoá chính; xuất thẳng id để số
    // trong tệp còn tra ngược được về đúng bản ghi.
    id: t.id,
    title: t.title,
    field: t.field,
    status: THESIS_STATUS_LABELS[t.status],
    lecturer: t.lecturer?.user.full_name ?? "Chưa phân công",
    students: t.members.map((m) => m.student.user.full_name).join(", "),
    research_period: formatPeriod(t.start_date, t.end_date),
    milestone_total: t.milestones.length,
    milestone_done: t.milestones.filter((m) => m.status === "COMPLETED").length,
    document_count: t._count.documents,
    created_at: formatDate(t.created_at),
    completed_at: formatDate(t.completed_at),
  }));
}

export function thesesExportFilename(format: "csv" | "xlsx"): string {
  return `danh-sach-de-tai-${fileStamp(new Date())}.${format}`;
}

/**
 * Dấu chấm phẩy, không phải dấu phẩy.
 *
 * Excel bản Việt Nam (và mọi locale dùng dấu phẩy làm dấu thập phân) đọc tệp
 * CSV theo "list separator" của hệ điều hành, mặc định là `;`. Xuất bằng `,`
 * thì toàn bộ dữ liệu dồn vào cột A — lỗi mà người dùng luôn báo là "file xuất
 * bị hỏng".
 */
const CSV_DELIMITER = ";";
/** RFC 4180 quy định kết thúc bản ghi bằng CRLF. */
const CSV_EOL = "\r\n";

function csvCell(value: string | number): string {
  const text = String(value);
  // RFC 4180: chỉ bọc nháy khi cần, và nháy kép bên trong được nhân đôi.
  if (/["\r\n;]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/**
 * Ghi CSV thẳng ra response theo từng dòng.
 *
 * BOM UTF-8 ở đầu tệp là bắt buộc: thiếu nó, Excel trên Windows đoán bảng mã
 * theo locale hệ thống và "Đề tài" thành "Ä‘á»..." — dữ liệu đúng, hiển thị hỏng.
 */
/**
 * Sinh BOM từ code point thay vì dán ký tự U+FEFF thật vào mã nguồn: đó là ký
 * tự VÔ HÌNH, chỉ cần một lần định dạng lại tệp hoặc một lần copy-paste là nó
 * biến mất mà không ai nhìn ra, kéo theo lỗi font chỉ lộ diện trên máy người dùng.
 */
const UTF8_BOM = String.fromCharCode(0xfeff);

export function streamThesesCsv(res: Response, rows: ExportRow[]): void {
  res.write(UTF8_BOM);
  res.write(EXPORT_COLUMNS.map((c) => csvCell(c.header)).join(CSV_DELIMITER) + CSV_EOL);
  for (const row of rows) {
    res.write(EXPORT_COLUMNS.map((c) => csvCell(row[c.key])).join(CSV_DELIMITER) + CSV_EOL);
  }
  res.end();
}

export async function streamThesesXlsx(res: Response, rows: ExportRow[]): Promise<void> {
  const workbook = new Workbook();
  workbook.creator = "NovaThesis";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Danh sách đề tài", {
    // Đóng băng dòng tiêu đề: danh sách hàng trăm đề tài cuộn xuống mà mất tên
    // cột thì bảng thành vô nghĩa.
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = EXPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));

  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle" };

  for (const row of rows) sheet.addRow(row);

  await workbook.xlsx.write(res);
  res.end();
}

/* ==========================================================================
   UC 9.4 — BIỂU ĐỒ GANTT
   ========================================================================== */

/**
 * Phần trăm hoàn thành suy ra từ trạng thái.
 *
 * Mốc tiến độ không có cột `progress` riêng, và cố tình như vậy: một con số do
 * sinh viên tự khai sẽ mâu thuẫn với máy trạng thái ở `domain/milestone-fsm.ts`
 * (khai 100% trong khi mốc vẫn "Chờ phê duyệt"). Suy ra từ trạng thái thì thanh
 * Gantt luôn kể đúng câu chuyện mà quy trình duyệt đang kể.
 */
const MILESTONE_PROGRESS: Record<MilestoneStatus, number> = {
  NOT_STARTED: 0,
  ONGOING: 40,
  PENDING_APPROVAL: 75,
  REVISION_REQUIRED: 50,
  COMPLETED: 100,
};

export async function buildGantt(thesisId: number) {
  const thesis = await prisma.thesis.findFirst({
    where: { id: thesisId, deleted_at: null },
    select: {
      id: true,
      title: true,
      created_at: true,
      completed_at: true,
      milestones: {
        where: { deleted_at: null },
        orderBy: [{ order_index: "asc" }, { deadline: "asc" }, { id: "asc" }],
        select: { id: true, name: true, deadline: true, status: true },
      },
    },
  });

  if (!thesis) throw notFound("Đề tài không tồn tại hoặc đã bị xóa.");

  // Mốc đầu tiên bắt đầu từ ngày tạo đề tài; các mốc sau nối tiếp hạn của mốc
  // liền trước, vì lược đồ chỉ lưu `deadline` chứ không lưu ngày bắt đầu.
  let cursor = thesis.created_at;

  const tasks = thesis.milestones.map((m) => {
    const end = m.deadline;
    // Thứ tự hiển thị theo `order_index`, nên hạn của mốc trước có thể muộn hơn
    // hạn của mốc này (dữ liệu nhập tay không ai đảm bảo tăng dần). Kẹp lại để
    // không sinh ra thanh Gantt có chiều dài âm — trình vẽ sẽ vỡ bố cục.
    const start = cursor.getTime() > end.getTime() ? end : cursor;
    cursor = end;

    return {
      id: m.id,
      name: m.name,
      start: isoDay(start),
      end: isoDay(end),
      status: m.status,
      status_label: STATUS_LABELS[m.status],
      progress: MILESTONE_PROGRESS[m.status],
      overdue: isOverdue(end, m.status),
    };
  });

  // Khung thời gian của đề tài phải BAO TRỌN mọi thanh mốc. Lấy thẳng
  // `created_at` làm điểm đầu là chưa đủ: mốc được nhập với hạn nộp trước ngày
  // tạo đề tài (dữ liệu di trú, hoặc đề tài lập sau khi lộ trình đã chạy) sẽ
  // rơi ra ngoài trục và bị trình vẽ cắt mất.
  let first = thesis.created_at.getTime();
  let last = thesis.completed_at?.getTime() ?? thesis.created_at.getTime();
  for (const m of thesis.milestones) {
    const deadline = m.deadline.getTime();
    if (deadline < first) first = deadline;
    if (deadline > last) last = deadline;
  }

  return {
    thesis: {
      id: thesis.id,
      title: thesis.title,
      start: isoDay(new Date(first)),
      // Đề tài chưa có mốc nào (UC 9.4 nhánh 3a): trục thời gian thu về đúng
      // ngày tạo và `tasks` rỗng — giao diện tự hiển thị thông báo thay biểu đồ.
      end: isoDay(new Date(last)),
    },
    tasks,
  };
}

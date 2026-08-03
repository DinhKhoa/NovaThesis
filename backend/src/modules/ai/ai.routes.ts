/**
 * MODULE 6 — TRỢ LÝ AI
 *
 * Hỏi đáp RAG có trích dẫn (UC 6.5–6.9), tìm kiếm ngữ nghĩa (UC 6.4), gợi ý lộ
 * trình (UC 6.10–6.13), kiểm tra trùng lặp (UC 6.15) và thống kê sử dụng (UC 9.3).
 *
 * Hai ràng buộc chi phối gần như mọi dòng trong tệp này:
 *
 *   • PHẠM VI DỮ LIỆU. Không có một điều kiện phân quyền nào được viết tay ở đây.
 *     Mọi câu hỏi "người này được đọc tài liệu nào" đều đi qua `domain/access.ts`
 *     (`assertThesisAccess`, `accessibleDocumentIds`, `thesisScopeFilter`). Đó là
 *     điều kiện để Tenant Isolation (`Yêu cầu dự án.md` §2.1) chỉ cần đúng ở một
 *     chỗ thay vì đúng ở mười ba endpoint.
 *
 *   • RANH GIỚI SSE. `POST /chat` gửi header ngay khi bắt đầu trả lời, nên từ
 *     thời điểm đó `errorHandler` không còn làm gì được nữa. Toàn bộ phần có thể
 *     hỏng vì đầu vào — tìm phiên, kiểm tra quyền — được làm XONG trước khi mở
 *     luồng; sau khi mở, lỗi được báo bằng sự kiện `error` chứ không ném ra ngoài.
 */
import { Router, type Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "../../lib/prisma";
import { logger } from "../../lib/logger";
import { env } from "../../config/env";
import { asyncHandler, initSSE, noContent, paginated, parsePage, paginationSchema, sendSSE } from "../../lib/http";
import { audit, AuditAction } from "../../lib/audit";
import { badRequest, conflict, notFound, unprocessable } from "../../lib/errors";
import { currentUser, requireAuth, requireRole, type AuthUser } from "../../middleware/auth";
import { optionalText, text, validateBody, validateParams, validateQuery, idParam } from "../../middleware/validate";
import { aiLimiter } from "../../middleware/rate-limit";
import { accessibleDocumentIds, assertThesisAccess, thesisScopeFilter } from "../../domain/access";
import { notifyMany, thesisAudience } from "../../services/notifications";
import {
  containsGeneralKnowledge,
  currentModelName,
  narrowToSelection,
  retrieve,
  streamAnswer,
  type Citation,
} from "../../services/ai/rag";
import { searchHybridChunks, searchSimilarChunks } from "../../services/ai/vector.repository";
import { embedOne } from "../../services/ai/embeddings";
import { sanitizePrompt, type ChatTurn } from "../../services/ai/llm";
import { milestoneTag } from "../../lib/evidence-to-document";
import { generateMilestoneReview } from "../../lib/milestone-review";
import {
  toChatMessageDTO,
  toChatSessionDTO,
  toMilestoneDTO,
  toSuggestionDTO,
} from "../serializers";
import {
  collectAiStats,
  generateRoadmap,
  parseStoredRoadmap,
  roadmapAuditDetails,
  scorePlagiarism,
} from "./ai.service";

export const aiRouter = Router();

/* ==========================================================================
   LƯỢC ĐỒ ĐẦU VÀO
   ========================================================================== */

/**
 * Khoá ngoại tuỳ chọn đến từ query string hoặc body.
 *
 * `preprocess` quy chuỗi rỗng về `undefined` vì `?thesis_id=` (người dùng xoá bộ
 * lọc trên giao diện) là chuyện thường xuyên, và `z.coerce.number("")` cho ra 0 —
 * một mã đề tài không tồn tại, dẫn tới 404 khó hiểu thay vì "không lọc gì cả".
 */
const optionalId = (label: string) =>
  z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z.coerce.number().int().positive(`${label} không hợp lệ.`).optional()
  );

const thesisFilterQuery = z.object({ thesis_id: optionalId("Mã đề tài") });

const createSessionSchema = z.object({
  thesis_id: optionalId("Mã đề tài"),
  title: optionalText(255, "Tiêu đề hội thoại"),
});

const answerModeSchema = z.enum(["STRICT", "HYBRID"], {
  errorMap: () => ({ message: "Chế độ trả lời chỉ nhận STRICT hoặc HYBRID." }),
});

/**
 * Danh sách id tài liệu người dùng tick ở bảng nguồn.
 *
 * Giới hạn 200 phần tử: một danh sách dài vô hạn từ client sẽ đi thẳng vào mệnh
 * đề `IN (...)` của truy vấn vector. Đây là hạn mức, không phải hàng rào bảo
 * mật — hàng rào nằm ở `narrowToSelection()` trong `services/ai/rag.ts`.
 */
const documentIdsSchema = z
  .array(z.coerce.number().int().positive("Mã tài liệu không hợp lệ."))
  .max(200, "Chọn tối đa 200 tài liệu làm nguồn.")
  .optional();

const chatSchema = z.object({
  session_id: optionalId("Mã phiên hội thoại"),
  thesis_id: optionalId("Mã đề tài"),
  prompt: text(1, 2000, "Câu hỏi"),
  /** Chỉ dùng khi TẠO phiên mới; phiên đã có thì đọc từ CSDL. */
  answer_mode: answerModeSchema.optional(),
  document_ids: documentIdsSchema,
  /**
   * Mốc tiến độ mà câu hỏi đang nhắm tới.
   *
   * CHỈ SỐNG TRONG MỘT REQUEST. Cố ý KHÔNG có cột tương ứng trong
   * `ai_chat_sessions`: gắn một phiên hội thoại vào một mốc là một lời hứa sai —
   * người dùng mở khung chat từ mốc rồi hỏi tiếp sang chuyện khác ở câu thứ hai
   * là chuyện bình thường, và lúc đó nhãn "hội thoại của mốc X" chỉ còn gây
   * hiểu nhầm. Ngữ cảnh mốc được nạp vào chỉ dẫn hệ thống của đúng câu đầu tiên
   * rồi thôi.
   */
  milestone_id: optionalId("Mã mốc tiến độ"),
});

const sessionSourcesSchema = z.object({
  /** Mảng rỗng = "dùng tất cả tài liệu trong phạm vi". */
  document_ids: z
    .array(z.coerce.number().int().positive("Mã tài liệu không hợp lệ."))
    .max(200, "Chọn tối đa 200 tài liệu làm nguồn."),
});

const updateSessionSchema = z
  .object({
    title: text(1, 255, "Tiêu đề hội thoại").optional(),
    answer_mode: answerModeSchema.optional(),
  })
  .refine(
    (v) => v.title !== undefined || v.answer_mode !== undefined,
    "Không có thay đổi nào được gửi lên."
  );

const ratingSchema = z.object({
  // `null` là giá trị hợp lệ, không phải thiếu dữ liệu: UC 6.9 luồng phụ 1a —
  // bấm lại đúng biểu tượng đang chọn nghĩa là huỷ đánh giá.
  rating: z.enum(["LIKE", "DISLIKE"]).nullable(),
  note: optionalText(1000, "Ghi chú phản hồi"),
});

const searchSchema = z.object({
  query: text(2, 500, "Nội dung tìm kiếm"),
  thesis_id: optionalId("Mã đề tài"),
  top_k: z.coerce.number().int().min(1).max(20).default(Math.min(env.RAG_TOP_K, 20)),
});

const suggestSchema = z.object({
  thesis_id: z.coerce.number().int().positive("Mã đề tài không hợp lệ."),
});

const acceptSchema = z.object({
  indexes: z.array(z.coerce.number().int().min(0).max(999)).max(12).optional(),
});

const plagiarismSchema = z.object({
  thesis_id: z.coerce.number().int().positive("Mã đề tài không hợp lệ."),
  text: text(50, 20_000, "Đoạn văn bản cần kiểm tra"),
});

/* ==========================================================================
   PHIÊN HỘI THOẠI (UC 6.7 / 6.8)
   ========================================================================== */

/** Số phiên trả về tối đa. Thanh bên chỉ hiển thị lịch sử gần đây, không phải kho lưu trữ. */
const SESSION_LIST_LIMIT = 100;

/**
 * Nạp phiên và khẳng định người gọi là chủ sở hữu.
 *
 * Lọc thẳng theo `user_id` trong `where` thay vì tải lên rồi so sánh: phiên của
 * người khác trả về 404 chứ không phải 403, nên không có cách nào dò xem một mã
 * phiên có tồn tại hay không.
 */
async function ownedSession(user: AuthUser, sessionId: number) {
  const session = await prisma.aIChatSession.findFirst({
    where: { id: sessionId, user_id: user.id, deleted_at: null },
    select: {
      id: true,
      thesis_id: true,
      title: true,
      answer_mode: true,
      sources: { select: { document_id: true } },
    },
  });
  if (!session) throw notFound("Phiên hội thoại không tồn tại hoặc đã bị xóa.");
  return session;
}

/**
 * Lọc danh sách id tài liệu về đúng những gì người dùng được phép đọc.
 *
 * Chạy ở tầng route để việc GHI vào `ai_chat_session_sources` không bao giờ lưu
 * một id ngoài phạm vi. `rag.ts` vẫn lọc lại lần nữa lúc truy xuất — hai lớp có
 * chủ đích, vì quyền có thể bị thu hồi SAU khi nguồn đã được lưu (đề tài bị gỡ
 * chia sẻ, sinh viên rời nhóm).
 */
async function keepAccessibleDocuments(
  user: AuthUser,
  thesisId: number | null,
  requested: number[]
): Promise<number[]> {
  if (requested.length === 0) return [];

  const allowed = await accessibleDocumentIds(user, thesisId);
  if (allowed === null) return [...new Set(requested)];

  const permitted = new Set(allowed);
  return [...new Set(requested)].filter((id) => permitted.has(id));
}

aiRouter.get(
  "/sessions",
  requireAuth,
  validateQuery(thesisFilterQuery),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { thesis_id } = req.query as unknown as z.infer<typeof thesisFilterQuery>;

    if (thesis_id !== undefined) await assertThesisAccess(user, thesis_id, "view");

    const sessions = await prisma.aIChatSession.findMany({
      where: {
        user_id: user.id,
        deleted_at: null,
        ...(thesis_id !== undefined ? { thesis_id } : {}),
      },
      orderBy: { updated_at: "desc" },
      take: SESSION_LIST_LIMIT,
      include: { _count: { select: { messages: true } } },
    });

    res.json({ data: sessions.map(toChatSessionDTO) });
  })
);

aiRouter.post(
  "/sessions",
  requireAuth,
  validateBody(createSessionSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const body = req.body as z.infer<typeof createSessionSchema>;

    // `thesis_id` để trống là hợp lệ (xem ghi chú ở schema): sinh viên chưa được
    // duyệt đề tài vẫn hỏi trợ lý được, chỉ là phạm vi RAG rỗng.
    if (body.thesis_id !== undefined) await assertThesisAccess(user, body.thesis_id, "view");

    const session = await prisma.aIChatSession.create({
      data: {
        user_id: user.id,
        thesis_id: body.thesis_id ?? null,
        ...(body.title ? { title: body.title } : {}),
      },
      include: { _count: { select: { messages: true } } },
    });

    audit({
      action: AuditAction.AI_CHAT,
      req,
      details: { sub_action: "session_create", session_id: session.id, thesis_id: session.thesis_id },
    });

    res.status(201).json(toChatSessionDTO(session));
  })
);

/** Đổi tên hội thoại và/hoặc đổi chế độ trả lời. */
aiRouter.patch(
  "/sessions/:id",
  requireAuth,
  validateParams(idParam),
  validateBody(updateSessionSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;
    const { title, answer_mode } = req.body as z.infer<typeof updateSessionSchema>;

    await ownedSession(user, id);

    const session = await prisma.aIChatSession.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(answer_mode !== undefined ? { answer_mode } : {}),
      },
      include: { _count: { select: { messages: true } } },
    });

    audit({
      action: AuditAction.AI_CHAT,
      req,
      details: {
        sub_action: "session_update",
        session_id: id,
        ...(title !== undefined ? { renamed: true } : {}),
        ...(answer_mode !== undefined ? { answer_mode } : {}),
      },
    });

    res.json(toChatSessionDTO(session));
  })
);

/* ==========================================================================
   NGUỒN CỦA PHIÊN HỘI THOẠI

   Đây là phần khiến trợ lý hoạt động giống NotebookLM: mỗi hội thoại có bảng
   nguồn riêng, và câu hỏi chỉ được đối chiếu với những tài liệu đang được tick.

   Không có nó, tải năm tài liệu thuộc năm chủ đề lên cùng một đề tài rồi hỏi
   thì trợ lý không có cách nào biết câu hỏi nhắm vào tài liệu nào — nó trộn
   trích dẫn từ cả năm.
   ========================================================================== */

/** Danh sách tài liệu có thể dùng làm nguồn, kèm tài liệu nào đang được chọn. */
aiRouter.get(
  "/sessions/:id/sources",
  requireAuth,
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;

    const session = await ownedSession(user, id);
    const available = await accessibleDocumentIds(user, session.thesis_id);

    const documents = await prisma.document.findMany({
      where: {
        deleted_at: null,
        ...(available === null ? {} : { id: { in: available } }),
      },
      select: {
        id: true,
        filename: true,
        status_ai: true,
        ai_error: true,
        page_count: true,
        summary_ai: true,
        thesis_id: true,
        created_at: true,
      },
      orderBy: { created_at: "desc" },
      take: 200,
    });

    const selected = new Set(session.sources.map((s) => s.document_id));

    res.json({
      // Quy ước: chưa chọn gì nghĩa là DÙNG TẤT CẢ. Giao diện cần biết mình
      // đang ở trạng thái nào để hiển thị "5/5 nguồn" thay vì "0/5".
      uses_all: selected.size === 0,
      data: documents.map((d) => ({
        id: d.id,
        filename: d.filename,
        status_ai: d.status_ai,
        ai_error: d.ai_error,
        page_count: d.page_count,
        // Cắt ngắn: bảng nguồn chỉ cần một dòng gợi nhớ nội dung, không cần cả
        // bản tóm tắt — nó nhân với 200 tài liệu là một phản hồi rất nặng.
        summary: d.summary_ai ? d.summary_ai.slice(0, 240) : null,
        thesis_id: d.thesis_id,
        selected: selected.size === 0 || selected.has(d.id),
      })),
    });
  })
);

/** Đặt lại tập nguồn của phiên. Mảng rỗng = dùng tất cả. */
aiRouter.put(
  "/sessions/:id/sources",
  requireAuth,
  validateParams(idParam),
  validateBody(sessionSourcesSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;
    const { document_ids } = req.body as z.infer<typeof sessionSourcesSchema>;

    const session = await ownedSession(user, id);
    const permitted = await keepAccessibleDocuments(user, session.thesis_id, document_ids);

    // Gửi lên toàn id không được phép thì đó là lỗi thật, không phải "chọn tất
    // cả". Im lặng quy về "tất cả" sẽ mở rộng phạm vi đúng lúc người dùng đang
    // cố thu hẹp nó.
    if (document_ids.length > 0 && permitted.length === 0) {
      throw badRequest("Không tài liệu nào trong danh sách thuộc phạm vi truy cập của bạn.");
    }

    // Thay toàn bộ trong một giao dịch: xoá xong mà chèn hỏng sẽ để phiên rơi về
    // "dùng tất cả" — âm thầm mở rộng phạm vi, đúng thứ không được phép xảy ra.
    await prisma.$transaction([
      prisma.aIChatSessionSource.deleteMany({ where: { session_id: id } }),
      ...(permitted.length > 0
        ? [
            prisma.aIChatSessionSource.createMany({
              data: permitted.map((document_id) => ({ session_id: id, document_id })),
            }),
          ]
        : []),
    ]);

    audit({
      action: AuditAction.AI_CHAT,
      req,
      details: {
        sub_action: "session_sources",
        session_id: id,
        requested: document_ids.length,
        applied: permitted.length,
      },
    });

    res.json({ uses_all: permitted.length === 0, document_ids: permitted });
  })
);

aiRouter.delete(
  "/sessions/:id",
  requireAuth,
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;

    await ownedSession(user, id);

    // Xoá MỀM dù UC 6.8 nói "xóa hoàn toàn": thống kê UC 9.3 đếm trên chính bảng
    // này, nên xoá cứng sẽ làm báo cáo sử dụng AI teo dần mỗi lần có người dọn
    // lịch sử. Người dùng không còn thấy phiên ở bất kỳ endpoint nào — đúng thứ
    // họ yêu cầu; số liệu tổng hợp thì vẫn nguyên.
    await prisma.aIChatSession.update({ where: { id }, data: { deleted_at: new Date() } });

    audit({
      action: AuditAction.AI_CHAT,
      req,
      details: { sub_action: "session_delete", session_id: id },
    });

    noContent(res);
  })
);

aiRouter.get(
  "/sessions/:id/messages",
  requireAuth,
  validateParams(idParam),
  validateQuery(paginationSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;
    const page = parsePage(req.query);

    await ownedSession(user, id);

    const [messages, total] = await Promise.all([
      prisma.aIChatMessage.findMany({
        where: { session_id: id },
        // Cũ → mới: khung chat đọc từ trên xuống, đảo lại ở client là việc thừa.
        orderBy: { created_at: "asc" },
        skip: page.skip,
        take: page.take,
      }),
      prisma.aIChatMessage.count({ where: { session_id: id } }),
    ]);

    res.json(paginated(messages.map(toChatMessageDTO), total, page));
  })
);

/* ==========================================================================
   HỎI ĐÁP RAG DẠNG LUỒNG (UC 6.5)
   ========================================================================== */

/** Số lượt gần nhất đưa vào ngữ cảnh để hiểu câu hỏi nối tiếp ("cái đó" trỏ về đâu). */
const HISTORY_TURNS = 6;

/** Không ghi vào response đã đóng: sau khi client ngắt, `res` bị huỷ và mọi lần ghi là vô nghĩa. */
function emit(res: Response, event: string, data: unknown): void {
  if (res.writableEnded || res.destroyed) return;
  sendSSE(res, event, data);
}

function sessionTitle(prompt: string): string {
  return prompt.slice(0, 60).trim() || "Hội thoại mới";
}

async function loadHistory(sessionId: number, beforeMessageId: number): Promise<ChatTurn[]> {
  const rows = await prisma.aIChatMessage.findMany({
    where: { session_id: sessionId, id: { lt: beforeMessageId } },
    orderBy: { id: "desc" },
    take: HISTORY_TURNS,
    select: { role: true, content: true },
  });
  return rows
    .reverse()
    .map((r) => ({ role: r.role === "USER" ? ("user" as const) : ("assistant" as const), content: r.content }));
}

aiRouter.post(
  "/chat",
  requireAuth,
  aiLimiter,
  validateBody(chatSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const body = req.body as z.infer<typeof chatSchema>;
    const prompt = body.prompt;

    /* ---- Giai đoạn 1: mọi thứ còn báo lỗi JSON được, làm trước khi mở luồng ---- */

    let session: {
      id: number;
      thesis_id: number | null;
      answer_mode: "STRICT" | "HYBRID";
      sources: Array<{ document_id: number }>;
    };

    /**
     * Ngữ cảnh mốc tiến độ, nối vào chỉ dẫn hệ thống của lượt này.
     *
     * `null` ở mọi trường hợp còn lại — kể cả khi hỏi tiếp trong một phiên vốn
     * được mở từ một mốc. Đó là chủ ý: câu thứ hai trong cùng phiên thường đã
     * chuyển sang chuyện khác, và giữ nguyên ngữ cảnh mốc sẽ kéo mọi câu trả lời
     * về lại mốc đó.
     */
    let milestoneSystemContext: string | null = null;

    if (body.session_id !== undefined) {
      /* Phiên đã tồn tại thì chế độ và nguồn đọc từ CSDL, KHÔNG lấy từ body.
         Tin vào body sẽ để một người dùng đổi phạm vi giữa chừng mà lịch sử hội
         thoại không ghi nhận gì — câu trả lời thứ ba dựa trên nguồn khác hẳn hai
         câu đầu, và không ai nhìn ra được điều đó khi đọc lại. */
      session = await ownedSession(user, body.session_id);
    } else {
      if (body.thesis_id !== undefined) await assertThesisAccess(user, body.thesis_id, "view");

      const thesisId = body.thesis_id ?? null;

      /* ---- Ngữ cảnh mốc tiến độ ------------------------------------------
       *
       * Đặt Ở ĐÂY, trước `aIChatSession.create`, vì hai lý do:
       *
       *   1. Nó ném lỗi được. Sau `initSSE(res)` thì header 200 đã đi và
       *      `errorHandler` không còn đổi được mã trạng thái nữa (xem ghi chú
       *      "RANH GIỚI SSE" ở đầu tệp).
       *   2. Ném TRƯỚC khi tạo phiên thì một mã mốc sai không để lại một hội
       *      thoại rỗng trong thanh bên của người dùng.
       */
      const evidenceDocumentIds: number[] = [];

      if (body.milestone_id !== undefined) {
        /* Phiên không gắn đề tài thì không có phạm vi nào để đối chiếu, và bỏ
           qua điều kiện `thesis_id` sẽ cho phép nạp tên/mô tả/hạn chót của mốc
           BẤT KỲ vào chỉ dẫn hệ thống — tức là đọc được dữ liệu của đề tài
           người khác qua câu trả lời. Chặn thẳng thay vì nới điều kiện. */
        if (thesisId === null) {
          throw badRequest(
            "Hỏi theo mốc tiến độ cần chọn đề tài trước để trợ lý biết phạm vi tài liệu."
          );
        }

        const milestone = await prisma.milestone.findFirst({
          // `thesisId` đã đi qua `assertThesisAccess` ngay phía trên, nên điều
          // kiện này vừa là bộ lọc vừa là hàng rào phân quyền.
          where: { id: body.milestone_id, thesis_id: thesisId, deleted_at: null },
          select: { id: true, name: true, description: true, deadline: true, status: true },
        });

        if (!milestone) {
          throw badRequest("Mốc tiến độ không tồn tại hoặc không thuộc đề tài đang chọn.");
        }

        milestoneSystemContext = [
          `Người dùng đang hỏi về mốc tiến độ: “${sanitizePrompt(milestone.name, 300)}”`,
          milestone.description
            ? `Yêu cầu của mốc: ${sanitizePrompt(milestone.description, 2000)}`
            : null,
          // `deadline` là nửa đêm UTC của một NGÀY (xem `milestones.service.ts`),
          // nên cắt 10 ký tự đầu là cách đọc đúng, không phải cách đọc tắt.
          `Hạn chót: ${milestone.deadline.toISOString().slice(0, 10)}`,
          `Trạng thái hiện tại: ${milestone.status}`,
        ]
          .filter((line): line is string => line !== null)
          .join("\n");

        /* Minh chứng của chính mốc đó được đưa vào tập nguồn.
           Không lọc theo `thesis_id`: `keepAccessibleDocuments` ngay bên dưới
           đã giao lại với `accessibleDocumentIds()`, nên một id lọt ra ngoài
           phạm vi sẽ bị loại ở đó. */
        const evidenceDocs = await prisma.document.findMany({
          where: { deleted_at: null, tags: { has: milestoneTag(milestone.id) } },
          select: { id: true },
        });
        evidenceDocumentIds.push(...evidenceDocs.map((d) => d.id));
      }

      const sources = await keepAccessibleDocuments(user, thesisId, [
        ...(body.document_ids ?? []),
        ...evidenceDocumentIds,
      ]);

      const created = await prisma.aIChatSession.create({
        data: {
          user_id: user.id,
          thesis_id: thesisId,
          title: sessionTitle(prompt),
          answer_mode: body.answer_mode ?? "HYBRID",
          ...(sources.length > 0
            ? { sources: { create: sources.map((document_id) => ({ document_id })) } }
            : {}),
        },
        select: { id: true, thesis_id: true, answer_mode: true },
      });

      session = { ...created, sources: sources.map((document_id) => ({ document_id })) };
    }

    const selectedDocumentIds = session.sources.map((s) => s.document_id);

    const userMessage = await prisma.aIChatMessage.create({
      data: { session_id: session.id, role: "USER", content: prompt },
    });
    const history = await loadHistory(session.id, userMessage.id);

    /* ---- Giai đoạn 2: từ đây trở đi header đã gửi, lỗi đi qua sự kiện `error` ---- */

    initSSE(res);

    const controller = new AbortController();
    let aborted = false;

    /*
     * Bấm "Dừng" giữa chừng.
     *
     * Nghe trên `res` chứ không phải `req`: từ Node 16, `req` phát `close` NGAY
     * khi thân yêu cầu đã đọc xong — với một POST JSON nhỏ, điều đó xảy ra trước
     * cả chữ đầu tiên của câu trả lời, nên gắn vào đó sẽ huỷ mọi phiên chat ngay
     * lập tức. `res` phát `close` khi phản hồi kết thúc HOẶC khi kết nối đứt, nên
     * `writableFinished` phân biệt được hai trường hợp đó.
     */
    const onClose = (): void => {
      if (res.writableFinished) return;
      aborted = true;
      controller.abort();
    };
    res.on("close", onClose);

    const startedAt = Date.now();
    let answer = "";
    let citations: Citation[] = [];

    try {
      emit(res, "session", {
        session_id: session.id,
        thesis_id: session.thesis_id,
        answer_mode: session.answer_mode,
        source_document_ids: selectedDocumentIds,
        user_message: toChatMessageDTO(userMessage),
      });

      const retrieval = await retrieve({
        user,
        query: prompt,
        thesisId: session.thesis_id,
        documentIds: selectedDocumentIds,
      });
      citations = retrieval.citations;

      // Gửi trích dẫn TRƯỚC khi sinh chữ: nguồn là bề mặt tin cậy của một câu trả
      // lời RAG, và người đọc có thể mở tài liệu gốc trong lúc chữ vẫn đang chạy.
      emit(res, "citations", {
        citations,
        // Giao diện hiển thị "đang dùng N/M nguồn" — không có con số này, một câu
        // trả lời thiếu sót trông giống hệt một kho tài liệu thiếu sót.
        excluded_by_selection: retrieval.excluded_by_selection,
      });

      for await (const chunk of streamAnswer({
        question: prompt,
        retrieval,
        history,
        signal: controller.signal,
        mode: session.answer_mode,
        ...(milestoneSystemContext ? { systemContext: milestoneSystemContext } : {}),
      })) {
        // Chế độ `local` phát lại văn bản có sẵn và không hề nhìn tới `signal`;
        // không tự thoát ở đây thì "Dừng" sẽ không dừng được gì.
        if (aborted) break;
        answer += chunk;
        emit(res, "delta", { text: chunk });
      }

      const latencyMs = Date.now() - startedAt;

      const assistantMessage = await prisma.aIChatMessage.create({
        data: {
          session_id: session.id,
          role: "ASSISTANT",
          content: answer,
          // `Citation` có trường tuỳ chọn nên không khớp trực tiếp `InputJsonValue`;
          // giá trị thì luôn là JSON thuần vì nó vừa đi qua `JSON.stringify` của SSE.
          citations: citations as unknown as Prisma.InputJsonValue,
          model_name: currentModelName(),
          latency_ms: latencyMs,
          // Chế độ HYBRID có thể chèn khối kiến thức ngoài tài liệu. Ghi lại để
          // giao diện tô màu đúng và để thống kê trả lời được "kho tài liệu
          // không đáp ứng nổi bao nhiêu phần trăm câu hỏi".
          used_general_knowledge: containsGeneralKnowledge(answer),
          // Bị ngắt giữa chừng thì để trống: serializer dựa vào đúng cột này để
          // đánh dấu câu trả lời chưa hoàn chỉnh.
          finished_at: aborted ? null : new Date(),
        },
      });

      // Danh sách phiên sắp theo `updated_at`; không chạm vào đây thì phiên vừa
      // nhắn vẫn nằm nguyên chỗ cũ trong thanh bên.
      await prisma.aIChatSession.update({
        where: { id: session.id },
        data: { updated_at: new Date() },
      });

      audit({
        action: AuditAction.AI_CHAT,
        req,
        details: {
          session_id: session.id,
          thesis_id: session.thesis_id,
          citations: citations.length,
          latency_ms: latencyMs,
          aborted,
        },
      });

      emit(res, "done", {
        message_id: assistantMessage.id,
        session_id: session.id,
        message: toChatMessageDTO(assistantMessage),
        model_name: assistantMessage.model_name,
        latency_ms: latencyMs,
        citations: citations.length,
        incomplete: aborted,
      });
    } catch (err) {
      // Không ném ra `errorHandler`: header 200 đã đi rồi, đổi mã trạng thái lúc
      // này là không thể và `res.json()` sẽ nối JSON vào giữa luồng sự kiện.
      logger.error({ err, session_id: session.id }, "Luồng trả lời AI thất bại");
      audit({
        action: AuditAction.AI_PROVIDER_ERROR,
        req,
        level: "ERROR",
        details: { session_id: session.id, message: err instanceof Error ? err.message : "unknown" },
      });
      emit(res, "error", {
        message: "Trợ lý gặp sự cố khi sinh câu trả lời. Vui lòng thử lại sau ít phút.",
      });
    } finally {
      res.off("close", onClose);
      if (!res.writableEnded) res.end();
    }
  })
);

/* ==========================================================================
   GỢI Ý CÂU HỎI MỞ ĐẦU

   Thay cho bốn câu viết cứng trong `ai-chat/page.tsx`, vốn giống hệt nhau ở mọi
   đề tài và hỏi về những thứ tài liệu có thể không hề nhắc tới.

   Gợi ý dựng từ CHÍNH tên tệp và bản tóm tắt của các nguồn đang chọn, bằng mẫu
   câu chứ không gọi mô hình: một lượt gọi LLM mỗi lần mở trang là chi phí thật,
   trong khi thứ người dùng cần chỉ là một điểm khởi đầu để bấm.
   ========================================================================== */

const suggestedPromptsQuery = z.object({
  thesis_id: optionalId("Mã đề tài"),
  session_id: optionalId("Mã phiên hội thoại"),
});

/** Bỏ đuôi mở rộng và dấu gạch để tên tệp đọc được như một cụm từ. */
function readableTitle(filename: string): string {
  return filename
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

aiRouter.get(
  "/suggested-prompts",
  requireAuth,
  validateQuery(suggestedPromptsQuery),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const query = req.query as unknown as z.infer<typeof suggestedPromptsQuery>;

    let thesisId = query.thesis_id ?? null;
    let selected: number[] = [];

    if (query.session_id !== undefined) {
      const session = await ownedSession(user, query.session_id);
      thesisId = session.thesis_id;
      selected = session.sources.map((s) => s.document_id);
    }

    const allowed = await accessibleDocumentIds(user, thesisId);
    const { scope } = narrowToSelection(allowed, selected);

    const documents = await prisma.document.findMany({
      where: {
        deleted_at: null,
        // Chỉ tài liệu đã lập chỉ mục: gợi ý hỏi về một tệp chưa xử lý xong sẽ
        // dẫn thẳng tới câu "không tìm thấy nội dung phù hợp".
        status_ai: "DONE",
        ...(scope === null ? {} : { id: { in: scope } }),
      },
      select: { filename: true },
      orderBy: { created_at: "desc" },
      take: 3,
    });

    if (documents.length === 0) {
      res.json({
        data: [],
        reason: "Chưa có tài liệu nào được lập chỉ mục trong phạm vi đang chọn.",
      });
      return;
    }

    const titles = documents.map((d) => readableTitle(d.filename));
    const prompts = [
      `Tóm tắt những ý chính của “${titles[0]}”`,
      titles.length > 1
        ? `So sánh nội dung của “${titles[0]}” và “${titles[1]}”`
        : `Nêu các khái niệm quan trọng xuất hiện trong “${titles[0]}”`,
      "Những nguồn này còn thiếu phần nào so với một đề cương luận văn hoàn chỉnh?",
      "Liệt kê các định nghĩa và thuật ngữ cần làm rõ trong tài liệu đã chọn",
    ];

    res.json({ data: prompts });
  })
);

/* ==========================================================================
   ĐÁNH GIÁ CÂU TRẢ LỜI (UC 6.9)
   ========================================================================== */

aiRouter.post(
  "/messages/:id/rating",
  requireAuth,
  validateParams(idParam),
  validateBody(ratingSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;
    const { rating, note } = req.body as z.infer<typeof ratingSchema>;

    const message = await prisma.aIChatMessage.findFirst({
      where: { id, session: { user_id: user.id, deleted_at: null } },
      select: { id: true, role: true, session_id: true },
    });
    if (!message) throw notFound("Không tìm thấy câu trả lời cần đánh giá.");
    if (message.role !== "ASSISTANT") {
      throw badRequest("Chỉ đánh giá được câu trả lời của trợ lý.");
    }

    const updated = await prisma.aIChatMessage.update({
      where: { id },
      data: {
        rating,
        // Huỷ đánh giá thì xoá luôn ghi chú đi kèm: giữ lại một ghi chú không còn
        // gắn với biểu tượng nào chỉ làm dữ liệu phân tích nhiễu.
        feedback_note: rating === null ? null : (note ?? null),
      },
    });

    audit({
      action: AuditAction.AI_CHAT,
      req,
      details: { sub_action: "rating", message_id: id, session_id: message.session_id, rating },
    });

    res.json(toChatMessageDTO(updated));
  })
);

/* ==========================================================================
   BẢN NHÁP NHẬN XÉT MỐC TIẾN ĐỘ

   Nghiệp vụ nằm trong `lib/milestone-review.ts` vì module Mốc tiến độ cũng gọi
   nó (tự động khi mốc chuyển sang "chờ phê duyệt"). Đặt ở một trong hai module
   sẽ buộc module kia import ngang qua ranh giới module.
   ========================================================================== */

const milestoneParam = z.object({
  milestoneId: z.coerce.number().int().positive("Mã mốc tiến độ không hợp lệ."),
});

aiRouter.post(
  "/milestone-review/:milestoneId",
  requireAuth,
  aiLimiter,
  validateParams(milestoneParam),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { milestoneId } = req.params as unknown as z.infer<typeof milestoneParam>;

    const milestone = await prisma.milestone.findFirst({
      where: { id: milestoneId, deleted_at: null },
      select: { id: true, thesis_id: true, name: true },
    });
    if (!milestone) throw notFound("Mốc tiến độ không tồn tại hoặc đã bị xóa.");

    /* Quyền `review`, không phải `contribute`: bản nháp này là ghi chú cho
       người CHẤM. Cho sinh viên tự sinh ra bản phê bình bài của chính mình sẽ
       biến nó thành một công cụ dò đáp án — và mỗi lần bấm là một lượt gọi mô
       hình mà đề tài phải trả tiền. */
    await assertThesisAccess(user, milestone.thesis_id, "review");

    const review = await generateMilestoneReview(milestone.id, { throwIfMissing: true });

    if (!review) {
      throw unprocessable(
        "Đề tài chưa có giảng viên hướng dẫn nên chưa xác định được người nhận bản nháp nhận xét."
      );
    }

    audit({
      action: AuditAction.AI_MILESTONE_REVIEW,
      req,
      details: {
        thesis_id: milestone.thesis_id,
        milestone_id: milestone.id,
        feedback_id: review.feedbackId,
        evidence_chunks: review.evidenceChunks,
        from_model: review.fromModel,
        model_name: review.modelName,
        trigger: "manual",
      },
    });

    res.status(201).json({
      data: {
        id: review.feedbackId,
        milestone_id: milestone.id,
        content: review.content,
        created_at: review.createdAt.toISOString(),
        model_name: review.modelName,
        evidence_chunks: review.evidenceChunks,
      },
    });
  })
);

/* ==========================================================================
   TÌM KIẾM NGỮ NGHĨA (UC 6.4)
   ========================================================================== */

aiRouter.post(
  "/search",
  requireAuth,
  aiLimiter,
  validateBody(searchSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { query, thesis_id, top_k } = req.body as z.infer<typeof searchSchema>;

    if (thesis_id !== undefined) await assertThesisAccess(user, thesis_id, "view");

    const startedAt = Date.now();
    const documentIds = await accessibleDocumentIds(user, thesis_id ?? null);

    // `null` = Admin không giới hạn. Con số này chỉ để hiển thị "đã tìm trong N
    // tài liệu", nên chỉ Admin mới phải trả giá thêm một lần đếm.
    const scopeDocuments =
      documentIds === null
        ? await prisma.document.count({ where: { deleted_at: null } })
        : documentIds.length;

    const queryVector = await embedOne(query);
    // Tìm kiếm LAI: hợp nhất xếp hạng vector và xếp hạng toàn văn. Vector thuần
    // thất bại với truy vấn ngắn chứa thuật ngữ hiếm ("HNSW khác IVFFlat?") —
    // xem phần đo đạc trong migration ..._chunk_fulltext_index.
    const hits = await searchHybridChunks({
      queryVector,
      queryText: query,
      documentIds,
      // Lấy dư rồi cắt: bộ lọc liên quan bên dưới có thể loại bớt kết quả đầu.
      limit: top_k * 3,
    });

    const results = hits.slice(0, top_k).map((hit) => ({
      document_id: hit.document_id,
      doc_title: hit.doc_title,
      page: hit.page_number,
      score: Number(hit.score.toFixed(4)),
      snippet: hit.content.slice(0, 400),
      chunk_id: hit.chunk_id,
    }));

    const tookMs = Date.now() - startedAt;

    audit({
      action: AuditAction.AI_SEMANTIC_SEARCH,
      req,
      details: {
        thesis_id: thesis_id ?? null,
        query: query.slice(0, 120),
        results: results.length,
        scope_documents: scopeDocuments,
        took_ms: tookMs,
      },
    });

    res.json({ results, took_ms: tookMs, scope_documents: scopeDocuments });
  })
);

/* ==========================================================================
   GỢI Ý LỘ TRÌNH (UC 6.10 – 6.13)
   ========================================================================== */

aiRouter.get(
  "/suggestions",
  requireAuth,
  validateQuery(thesisFilterQuery),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { thesis_id } = req.query as unknown as z.infer<typeof thesisFilterQuery>;

    if (thesis_id !== undefined) await assertThesisAccess(user, thesis_id, "view");

    // Không lọc theo đề tài thì phạm vi vẫn phải bị chặn: lọc lồng qua quan hệ
    // `thesis` để tái dùng đúng điều kiện mà module đề tài đang dùng.
    const scope = await thesisScopeFilter(user);

    const suggestions = await prisma.aISuggestion.findMany({
      where: {
        status: "PENDING",
        ...(thesis_id !== undefined ? { thesis_id } : { thesis: scope }),
      },
      orderBy: { created_at: "desc" },
      take: 50,
    });

    res.json({ data: suggestions.map(toSuggestionDTO) });
  })
);

aiRouter.post(
  "/suggestions",
  requireAuth,
  aiLimiter,
  validateBody(suggestSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { thesis_id } = req.body as z.infer<typeof suggestSchema>;

    await assertThesisAccess(user, thesis_id, "contribute");

    const draft = await generateRoadmap({ thesisId: thesis_id, attempt: 1 });

    const suggestion = await prisma.aISuggestion.create({
      data: {
        thesis_id,
        created_by: user.id,
        payload: draft.items as unknown as Prisma.InputJsonValue,
        status: "PENDING",
        model_name: draft.modelName,
        attempt: 1,
      },
    });

    audit({
      action: AuditAction.AI_SUGGEST,
      req,
      details: { thesis_id, suggestion_id: suggestion.id, attempt: 1, ...roadmapAuditDetails(draft) },
    });

    res.status(201).json(toSuggestionDTO(suggestion));
  })
);

/** Nạp gợi ý kèm kiểm tra quyền trên đề tài của nó. */
async function editableSuggestion(user: AuthUser, suggestionId: number) {
  const suggestion = await prisma.aISuggestion.findUnique({ where: { id: suggestionId } });
  if (!suggestion) throw notFound("Gợi ý không tồn tại.");
  await assertThesisAccess(user, suggestion.thesis_id, "contribute");
  return suggestion;
}

aiRouter.post(
  "/suggestions/:id/accept",
  requireAuth,
  validateParams(idParam),
  validateBody(acceptSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;
    const { indexes } = req.body as z.infer<typeof acceptSchema>;

    const suggestion = await editableSuggestion(user, id);
    if (suggestion.status !== "PENDING") {
      throw conflict("Gợi ý này đã được xử lý trước đó.");
    }

    const items = parseStoredRoadmap(suggestion.payload);
    if (!items) throw unprocessable("Nội dung gợi ý không còn đọc được. Hãy tạo lại gợi ý mới.");

    const selected = indexes?.length
      ? indexes.map((i) => {
          const item = items[i];
          if (!item) throw badRequest(`Gợi ý số ${i + 1} không tồn tại trong danh sách.`);
          return item;
        })
      : items;

    if (selected.length === 0) throw badRequest("Chưa chọn nhiệm vụ nào để tạo mốc.");

    // Nối tiếp thứ tự hiện có thay vì bắt đầu lại từ 0: bảng Kanban và biểu đồ
    // Gantt (UC 9.4) sắp theo `order_index`, chèn trùng số sẽ làm mốc nhảy chỗ.
    const maxOrder = await prisma.milestone.aggregate({
      where: { thesis_id: suggestion.thesis_id, deleted_at: null },
      _max: { order_index: true },
    });
    const baseOrder = (maxOrder._max.order_index ?? -1) + 1;

    const createdAfter = new Date();
    const rows = selected.map((item, i) => ({
      thesis_id: suggestion.thesis_id,
      name: item.name,
      description: item.description || null,
      // Mô hình chỉ đưa ra "sau bao nhiêu tuần"; ngày thật được quy đổi ở đây,
      // tại thời điểm người dùng bấm chấp nhận (xem ghi chú ở `ai.service.ts`).
      deadline: new Date(createdAfter.getTime() + item.weeks_from_now * 7 * 86_400_000),
      status: "NOT_STARTED" as const,
      order_index: baseOrder + i,
    }));

    const created = await prisma.$transaction(async (tx) => {
      await tx.milestone.createMany({ data: rows });
      await tx.aISuggestion.update({ where: { id }, data: { status: "ACCEPTED" } });
      // `createMany` không trả về bản ghi; đọc lại theo đúng khoảng thứ tự vừa
      // cấp phát, kèm mốc thời gian để không vơ nhầm mốc do người khác tạo song song.
      return tx.milestone.findMany({
        where: {
          thesis_id: suggestion.thesis_id,
          deleted_at: null,
          order_index: { gte: baseOrder, lt: baseOrder + rows.length },
          created_at: { gte: createdAfter },
        },
        orderBy: { order_index: "asc" },
        include: {
          thesis: { select: { id: true, title: true } },
          _count: { select: { feedbacks: true } },
        },
      });
    });

    const audience = await thesisAudience(suggestion.thesis_id);
    await notifyMany(
      audience.all.filter((userId) => userId !== user.id),
      {
        type: "MILESTONE",
        title: "Đề tài có mốc tiến độ mới",
        content: `${user.full_name} đã tạo ${created.length} mốc tiến độ từ gợi ý của trợ lý AI.`,
        link: `/milestones?thesis_id=${suggestion.thesis_id}`,
      }
    );

    audit({
      action: AuditAction.MILESTONE_CREATE,
      req,
      details: {
        source: "ai_suggestion",
        suggestion_id: id,
        thesis_id: suggestion.thesis_id,
        milestone_ids: created.map((m) => m.id),
      },
    });

    res.status(201).json({
      data: created.map(toMilestoneDTO),
      suggestion: toSuggestionDTO({ ...suggestion, status: "ACCEPTED" }),
    });
  })
);

aiRouter.post(
  "/suggestions/:id/reject",
  requireAuth,
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;

    const suggestion = await editableSuggestion(user, id);
    if (suggestion.status !== "PENDING") {
      throw conflict("Gợi ý này đã được xử lý trước đó.");
    }

    // Đổi trạng thái chứ không xoá — UC 6.12 business rule: "việc bỏ qua không
    // xóa dữ liệu vĩnh viễn nhưng ẩn khỏi view hiện tại".
    const updated = await prisma.aISuggestion.update({
      where: { id },
      data: { status: "REJECTED" },
    });

    audit({
      action: AuditAction.AI_SUGGEST,
      req,
      details: { sub_action: "reject", suggestion_id: id, thesis_id: suggestion.thesis_id },
    });

    res.json(toSuggestionDTO(updated));
  })
);

aiRouter.post(
  "/suggestions/:id/regenerate",
  requireAuth,
  aiLimiter,
  validateParams(idParam),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params as unknown as z.infer<typeof idParam>;

    const previous = await editableSuggestion(user, id);
    const attempt = previous.attempt + 1;
    const previousItems = parseStoredRoadmap(previous.payload);

    const draft = await generateRoadmap({
      thesisId: previous.thesis_id,
      attempt,
      previousNames: previousItems?.map((i) => i.name) ?? [],
    });

    // Hai lượt ghi trong một giao dịch: nếu gợi ý mới được tạo mà bản cũ không
    // chuyển sang REJECTED, người dùng sẽ thấy hai danh sách PENDING cùng lúc.
    const suggestion = await prisma.$transaction(async (tx) => {
      await tx.aISuggestion.update({ where: { id }, data: { status: "REJECTED" } });
      return tx.aISuggestion.create({
        data: {
          thesis_id: previous.thesis_id,
          created_by: user.id,
          payload: draft.items as unknown as Prisma.InputJsonValue,
          status: "PENDING",
          model_name: draft.modelName,
          attempt,
        },
      });
    });

    audit({
      action: AuditAction.AI_SUGGEST,
      req,
      details: {
        sub_action: "regenerate",
        thesis_id: previous.thesis_id,
        replaced_suggestion_id: id,
        suggestion_id: suggestion.id,
        attempt,
        ...roadmapAuditDetails(draft),
      },
    });

    res.status(201).json(toSuggestionDTO(suggestion));
  })
);

/* ==========================================================================
   KIỂM TRA TRÙNG LẶP (UC 6.15)
   ========================================================================== */

/** Số đoạn lấy về trước khi gom theo tài liệu. Rộng hơn 5 nguồn cần trả về khá nhiều. */
const PLAGIARISM_CANDIDATES = 60;

aiRouter.post(
  "/plagiarism",
  requireAuth,
  aiLimiter,
  validateBody(plagiarismSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const body = req.body as z.infer<typeof plagiarismSchema>;

    // Chỉ cần quyền ĐỌC: đối chiếu trùng lặp không thay đổi gì trên đề tài, và
    // giảng viên phải chạy được cả trên đề tài đã hoàn thành (vốn bị `contribute`
    // đóng băng).
    await assertThesisAccess(user, body.thesis_id, "view");

    // Đối chiếu với TOÀN BỘ kho tài liệu người dùng được đọc, không loại trừ
    // chính đề tài đang kiểm tra: trùng với tài liệu tham khảo mà chính mình đã
    // tải lên vẫn là trùng, và đó lại là trường hợp hay gặp nhất.
    const documentIds = await accessibleDocumentIds(user, null);

    const queryVector = await embedOne(body.text);
    const hits = await searchSimilarChunks({
      queryVector,
      documentIds,
      limit: PLAGIARISM_CANDIDATES,
    });

    const verdict = scorePlagiarism(body.text, hits);

    const check = await prisma.plagiarismCheck.create({
      data: {
        thesis_id: body.thesis_id,
        input_text: body.text,
        similarity: verdict.similarity,
        matches: verdict.matches as unknown as Prisma.InputJsonValue,
        checked_by: user.id,
      },
      select: { id: true },
    });

    audit({
      action: AuditAction.AI_PLAGIARISM,
      req,
      details: {
        thesis_id: body.thesis_id,
        check_id: check.id,
        similarity: verdict.similarity,
        matches: verdict.matches.length,
        input_chars: body.text.length,
      },
    });

    res.status(201).json({
      id: check.id,
      similarity: verdict.similarity,
      matches: verdict.matches,
    });
  })
);

/* ==========================================================================
   THỐNG KÊ SỬ DỤNG AI (UC 9.3)
   ========================================================================== */

aiRouter.get(
  "/stats",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (_req, res) => {
    // `generated_at` để giao diện hiển thị "số liệu tính lúc …". Trước đây nó
    // chỉ có ở `GET /reports/ai-usage` — endpoint trùng lặp đã bị xoá.
    const stats = await collectAiStats();
    res.json({ ...stats, generated_at: new Date().toISOString() });
  })
);

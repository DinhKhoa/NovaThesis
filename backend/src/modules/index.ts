/**
 * Bảng định tuyến API v1.
 *
 * Nhóm theo module nghiệp vụ, khớp 9 phân hệ trong `00_UC_Overview.md`.
 */
import { Router } from "express";
import { healthRouter } from "./health/health.routes";
import { filesRouter } from "./files/files.routes";
import { authRouter } from "./auth/auth.routes";
import { thesesRouter } from "./theses/theses.routes";
import { milestonesRouter } from "./milestones/milestones.routes";
import { documentsRouter } from "./documents/documents.routes";
import { aiRouter } from "./ai/ai.routes";
import { feedbacksRouter } from "./feedbacks/feedbacks.routes";
import { notificationsRouter } from "./notifications/notifications.routes";
import { adminRouter } from "./admin/admin.routes";
import { reportsRouter } from "./reports/reports.routes";

export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/files", filesRouter);

apiRouter.use("/auth", authRouter); //  Module 1 — Xác thực & Tài khoản
apiRouter.use("/admin", adminRouter); //  Module 2 — Quản trị
apiRouter.use("/theses", thesesRouter); //  Module 3 — Đề tài
apiRouter.use("/milestones", milestonesRouter); //  Module 4 — Mốc tiến độ
apiRouter.use("/documents", documentsRouter); //  Module 5 — Tài liệu
apiRouter.use("/ai", aiRouter); //  Module 6 — Trợ lý AI
apiRouter.use("/feedbacks", feedbacksRouter); //  Module 7 — Phản hồi
apiRouter.use("/notifications", notificationsRouter); //  Module 8 — Thông báo
apiRouter.use("/reports", reportsRouter); //  Module 9 — Báo cáo

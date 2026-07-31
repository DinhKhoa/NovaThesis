/**
 * MÁY TRẠNG THÁI MỐC TIẾN ĐỘ (Finite State Machine)
 *
 * `Yêu cầu dự án.md` §2.4 yêu cầu quản lý trạng thái theo đúng tinh thần FSM
 * trong firmware: mọi chuyển tiếp phải được đối chiếu với một bảng tường minh,
 * không được gán tự do.
 *
 * Đây là BẢN GỐC. `frontend/src/lib/milestone-fsm.ts` là bản sao phía client và
 * chỉ tồn tại để giải thích cho người dùng vì sao một thao tác kéo-thả bị từ
 * chối. Kiểm tra ở client chặn nhầm lẫn; nó không phải hàng rào bảo mật, vì bất
 * kỳ ai cũng gọi thẳng `PATCH /milestones/:id/status` được. Bảng dưới đây mới
 * là thứ quyết định.
 *
 * Hai bảng phải khớp nhau; lệch nhau thì giao diện sẽ hứa những thao tác mà
 * server từ chối.
 */
import type { MilestoneStatus, UserRole } from "@prisma/client";

export interface TransitionSubject {
  evidence_filename?: string | null;
  evidence_file_url?: string | null;
}

interface Rule {
  roles: UserRole[];
  /** Hiện khi chuyển tiếp có tồn tại nhưng vai trò này không được phép. */
  denied?: string;
  /** Điều kiện tiên quyết trên chính mốc. Trả về lý do khi bị chặn. */
  guard?: (m: TransitionSubject) => string | null;
}

const needsEvidence = (m: TransitionSubject): string | null =>
  m.evidence_filename || m.evidence_file_url
    ? null
    : "Cần nộp minh chứng trước khi gửi duyệt.";

const EVERYONE: UserRole[] = ["STUDENT", "LECTURER", "ADMIN"];
const REVIEWERS: UserRole[] = ["LECTURER", "ADMIN"];

/**
 * Bảng kề. Không có entry nghĩa là chuyển tiếp KHÔNG TỒN TẠI — khác với "tồn
 * tại nhưng bị cấm". Hai trường hợp này được diễn đạt bằng hai câu khác nhau,
 * vì với người dùng chúng là hai vấn đề khác nhau.
 */
const TRANSITIONS: Record<MilestoneStatus, Partial<Record<MilestoneStatus, Rule>>> = {
  NOT_STARTED: {
    ONGOING: { roles: EVERYONE },
  },

  ONGOING: {
    NOT_STARTED: { roles: EVERYONE },
    PENDING_APPROVAL: { roles: EVERYONE, guard: needsEvidence },
  },

  PENDING_APPROVAL: {
    // Sinh viên rút bài nộp lại khi còn đang chờ.
    ONGOING: { roles: EVERYONE },
    COMPLETED: {
      roles: REVIEWERS,
      denied: "Chỉ giảng viên hướng dẫn mới được phê duyệt mốc này.",
    },
    REVISION_REQUIRED: {
      roles: REVIEWERS,
      denied: "Chỉ giảng viên hướng dẫn mới được yêu cầu chỉnh sửa.",
    },
  },

  REVISION_REQUIRED: {
    ONGOING: { roles: EVERYONE },
    PENDING_APPROVAL: { roles: EVERYONE, guard: needsEvidence },
  },

  COMPLETED: {
    REVISION_REQUIRED: {
      roles: REVIEWERS,
      denied: "Chỉ giảng viên mới mở lại được mốc đã hoàn thành.",
    },
  },
};

export type TransitionCheck = { allowed: true } | { allowed: false; reason: string };

export function checkTransition(
  from: MilestoneStatus,
  to: MilestoneStatus,
  role: UserRole,
  subject: TransitionSubject
): TransitionCheck {
  if (from === to) return { allowed: true };

  const rule = TRANSITIONS[from]?.[to];
  if (!rule) {
    return {
      allowed: false,
      reason: `Không thể chuyển thẳng từ “${STATUS_LABELS[from]}” sang “${STATUS_LABELS[to]}”.`,
    };
  }

  if (!rule.roles.includes(role)) {
    return { allowed: false, reason: rule.denied ?? "Bạn không có quyền thực hiện thao tác này." };
  }

  const blocked = rule.guard?.(subject);
  if (blocked) return { allowed: false, reason: blocked };

  return { allowed: true };
}

/** Các trạng thái đích hợp lệ — dùng để giao diện chỉ hiện lựa chọn khả thi. */
export function allowedTargets(
  from: MilestoneStatus,
  role: UserRole,
  subject: TransitionSubject
): MilestoneStatus[] {
  return (Object.keys(TRANSITIONS[from] ?? {}) as MilestoneStatus[]).filter(
    (to) => checkTransition(from, to, role, subject).allowed
  );
}

export const STATUS_LABELS: Record<MilestoneStatus, string> = {
  NOT_STARTED: "Chưa bắt đầu",
  ONGOING: "Đang làm",
  PENDING_APPROVAL: "Chờ phê duyệt",
  REVISION_REQUIRED: "Cần sửa đổi",
  COMPLETED: "Hoàn thành",
};

/* ==========================================================================
   MÁY TRẠNG THÁI ĐỀ TÀI (UC 3.7 – 3.13)
   ========================================================================== */

import type { ThesisStatus } from "@prisma/client";

interface ThesisRule {
  roles: UserRole[];
  denied?: string;
}

/**
 * Ghi chú thiết kế: `Yêu cầu dự án.md` §2.4 mô tả luồng
 * `Draft → Pending Review → Defending → Approved → Published`, còn ERD và mã
 * frontend dùng `DRAFT → PENDING → ONGOING → COMPLETED`. ERD (mục 4, ghi chú d)
 * chỉ ra mâu thuẫn này và yêu cầu thống nhất MỘT bản.
 *
 * Bản được chọn là bản của ERD/frontend, vì nó đã hiện diện trong giao diện và
 * trong dữ liệu; bổ sung thêm `REVISION_REQUIRED` cho UC 3.10 (trả về sửa) mà
 * enum cũ còn thiếu.
 */
const THESIS_TRANSITIONS: Record<ThesisStatus, Partial<Record<ThesisStatus, ThesisRule>>> = {
  DRAFT: {
    PENDING: { roles: ["STUDENT", "LECTURER", "ADMIN"] },
  },
  PENDING: {
    ONGOING: { roles: REVIEWERS, denied: "Chỉ giảng viên hướng dẫn mới được phê duyệt đề tài." },
    REVISION_REQUIRED: {
      roles: REVIEWERS,
      denied: "Chỉ giảng viên hướng dẫn mới được yêu cầu chỉnh sửa.",
    },
    REJECTED: { roles: REVIEWERS, denied: "Chỉ giảng viên hướng dẫn mới được từ chối đề tài." },
    // Sinh viên rút đề xuất về nháp khi giảng viên chưa xử lý.
    DRAFT: { roles: ["STUDENT", "ADMIN"] },
  },
  REVISION_REQUIRED: {
    PENDING: { roles: ["STUDENT", "ADMIN"] },
    DRAFT: { roles: ["STUDENT", "ADMIN"] },
  },
  ONGOING: {
    COMPLETED: { roles: REVIEWERS, denied: "Chỉ giảng viên hướng dẫn mới được đánh dấu hoàn thành." },
  },
  // UC 3.11 business rule: "Từ chối là trạng thái cuối cùng, đề tài này không
  // thể kích hoạt lại." Bảng rỗng chính là cách diễn đạt điều đó.
  REJECTED: {},
  // UC 3.13: hồ sơ được lưu trữ vĩnh viễn, không quay ngược.
  COMPLETED: {},
};

export const THESIS_STATUS_LABELS: Record<ThesisStatus, string> = {
  DRAFT: "Nháp",
  PENDING: "Chờ duyệt",
  REVISION_REQUIRED: "Cần chỉnh sửa",
  ONGOING: "Đang thực hiện",
  COMPLETED: "Hoàn thành",
  REJECTED: "Từ chối",
};

export function checkThesisTransition(
  from: ThesisStatus,
  to: ThesisStatus,
  role: UserRole
): TransitionCheck {
  if (from === to) return { allowed: true };
  const rule = THESIS_TRANSITIONS[from]?.[to];
  if (!rule) {
    return {
      allowed: false,
      reason: `Không thể chuyển đề tài từ “${THESIS_STATUS_LABELS[from]}” sang “${THESIS_STATUS_LABELS[to]}”.`,
    };
  }
  if (!rule.roles.includes(role)) {
    return { allowed: false, reason: rule.denied ?? "Bạn không có quyền thực hiện thao tác này." };
  }
  return { allowed: true };
}

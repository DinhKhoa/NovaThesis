/**
 * Milestone state machine.
 *
 * The project brief calls for milestone status to behave like an embedded FSM:
 * every transition is checked against an explicit table rather than assigned
 * freely. That matters most in the UI, because a Kanban board is an invitation
 * to drag a card anywhere — without a transition table a student could drop
 * their own work straight into "Hoàn thành" and skip review entirely.
 *
 * This table is the client-side mirror of the server's. It exists to keep the
 * board honest and to explain *why* a move is refused; it is not a security
 * boundary. The server re-validates every transition regardless — a client
 * check only stops accidents, never an attacker.
 */

import type { UserRole } from "./auth";

export type MilestoneStatus =
  | "NOT_STARTED"
  | "ONGOING"
  | "PENDING_APPROVAL"
  | "REVISION_REQUIRED"
  | "COMPLETED";

/** The subset of a milestone the guards need. */
export interface TransitionSubject {
  evidence_filename?: string | null;
}

interface Rule {
  /** Roles permitted to perform this transition. */
  roles: UserRole[];
  /** Shown when the transition exists but this role may not perform it. */
  denied?: string;
  /**
   * Precondition on the milestone itself. Returns a reason when blocked,
   * `null` when satisfied.
   */
  guard?: (m: TransitionSubject) => string | null;
}

const needsEvidence = (m: TransitionSubject) =>
  m.evidence_filename
    ? null
    : "Cần nộp minh chứng trước khi gửi duyệt.";

const EVERYONE: UserRole[] = ["STUDENT", "LECTURER", "ADMIN"];
const REVIEWERS: UserRole[] = ["LECTURER", "ADMIN"];

/**
 * Adjacency table. A missing entry means the transition does not exist at all,
 * which is different from existing-but-forbidden — the board words those two
 * cases differently.
 */
const TRANSITIONS: Record<
  MilestoneStatus,
  Partial<Record<MilestoneStatus, Rule>>
> = {
  NOT_STARTED: {
    ONGOING: { roles: EVERYONE },
  },

  ONGOING: {
    NOT_STARTED: { roles: EVERYONE },
    PENDING_APPROVAL: { roles: EVERYONE, guard: needsEvidence },
  },

  PENDING_APPROVAL: {
    // The student may withdraw a submission while it is still waiting.
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

export type TransitionCheck =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * Decides whether `from -> to` may be performed by `role` on `subject`.
 * Reasons are user-facing Vietnamese, because they are surfaced directly on
 * the drop target the user is hovering.
 */
export function checkTransition(
  from: MilestoneStatus,
  to: MilestoneStatus,
  role: UserRole | undefined,
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

  // An unauthenticated demo session is treated as the least-privileged actor
  // rather than the most, so the board never implies a permission the user
  // does not have.
  const effective: UserRole = role ?? "STUDENT";
  if (!rule.roles.includes(effective)) {
    return { allowed: false, reason: rule.denied ?? "Bạn không có quyền thực hiện thao tác này." };
  }

  const blocked = rule.guard?.(subject);
  if (blocked) return { allowed: false, reason: blocked };

  return { allowed: true };
}

export const STATUS_LABELS: Record<MilestoneStatus, string> = {
  NOT_STARTED: "Chưa bắt đầu",
  ONGOING: "Đang làm",
  PENDING_APPROVAL: "Chờ phê duyệt",
  REVISION_REQUIRED: "Cần sửa đổi",
  COMPLETED: "Hoàn thành",
};

/** Past-tense confirmation shown after a successful move. */
export const TRANSITION_TOASTS: Partial<
  Record<MilestoneStatus, string>
> = {
  ONGOING: "Đã chuyển sang đang thực hiện.",
  NOT_STARTED: "Đã đưa về chưa bắt đầu.",
  PENDING_APPROVAL: "Đã gửi duyệt. Giảng viên sẽ nhận được thông báo.",
  REVISION_REQUIRED: "Đã chuyển sang cần chỉnh sửa.",
  COMPLETED: "Đã phê duyệt hoàn thành.",
};

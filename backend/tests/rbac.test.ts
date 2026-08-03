/**
 * KIỂM THỬ HÀNG RÀO PHÂN QUYỀN
 *
 * Đây là kiểm thử CẤU TRÚC, không phải kiểm thử HTTP: nó đọc thẳng stack
 * middleware mà Express đã dựng và khẳng định mỗi route có đúng những hàng rào
 * cần thiết. Cách này không cần cơ sở dữ liệu, không cần token, và quan trọng
 * hơn: nó phát hiện được lỗi mà kiểm thử theo từng ca không bao giờ thấy — route
 * MỚI thêm vào mà quên gắn decorator.
 *
 * Một bộ test gọi HTTP sẽ chỉ kiểm những route mà người viết test nghĩ ra. Bộ
 * test này duyệt TOÀN BỘ route đang tồn tại, nên route thứ 41 thêm vào tuần sau
 * cũng bị soi ngay.
 *
 * Chạy: npm test
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { Router } from "express";

import { adminRouter } from "../src/modules/admin/admin.routes";
import { aiRouter } from "../src/modules/ai/ai.routes";
import { documentsRouter } from "../src/modules/documents/documents.routes";
import { feedbacksRouter } from "../src/modules/feedbacks/feedbacks.routes";
import { milestonesRouter } from "../src/modules/milestones/milestones.routes";
import { reportsRouter } from "../src/modules/reports/reports.routes";
import { thesesRouter } from "../src/modules/theses/theses.routes";

/* ==========================================================================
   ĐỌC STACK CỦA EXPRESS

   `router.stack` là API nội bộ của Express nên không có kiểu công khai. Ta đọc
   nó qua một hình dạng tối thiểu thay vì `any`, để nếu Express đổi cấu trúc thì
   test này hỏng ồn ào — đúng điều ta muốn — chứ không âm thầm bỏ qua mọi route.
   ========================================================================== */

/** Một mắt trong stack của Express, thu gọn về phần ta cần đọc. */
interface Handler {
  name?: string;
  /** Có mặt khi handler do `requireRole()` sinh ra — xem `middleware/auth.ts`. */
  roles?: readonly string[];
}

interface Layer {
  name?: string;
  handle?: Handler;
  route?: {
    path: string;
    stack: Array<{ name?: string; handle?: Handler }>;
    methods: Record<string, boolean>;
  };
}

interface Guard {
  name: string;
  /** Vai trò mà middleware này cho phép, nếu nó là hàng rào vai trò. */
  roles?: readonly string[];
}

interface RouteInfo {
  method: string;
  path: string;
  /** Middleware theo đúng thứ tự khai báo. */
  guards: Guard[];
}

/* Trong route stack, hàm thật nằm ở `handle`, còn `name` của mắt là tên đã được
   Express sao lại. Đọc cả hai vì phiên bản khác nhau đặt ở chỗ khác nhau. */
function toGuard(entry: { name?: string; handle?: Handler }): Guard {
  const fn = entry.handle;
  return {
    name: fn?.name || entry.name || "<anonymous>",
    roles: fn?.roles,
  };
}

function collect(router: Router, prefix: string): RouteInfo[] {
  const out: RouteInfo[] = [];
  const stack = (router as unknown as { stack: Layer[] }).stack ?? [];

  for (const layer of stack) {
    if (!layer.route) continue;
    const methods = Object.keys(layer.route.methods)
      .filter((m) => layer.route!.methods[m])
      .map((m) => m.toUpperCase());

    for (const method of methods) {
      out.push({
        method,
        path: `${prefix}${layer.route.path}`,
        guards: layer.route.stack.map(toGuard),
      });
    }
  }

  return out;
}

/** Middleware đặt ở cấp router (`router.use(...)`) — áp cho mọi route bên dưới. */
function routerLevelGuards(router: Router): Guard[] {
  const stack = (router as unknown as { stack: Layer[] }).stack ?? [];
  return stack.filter((l) => !l.route).map((l) => toGuard(l));
}

const MODULES = [
  { name: "admin", prefix: "/admin", router: adminRouter },
  { name: "ai", prefix: "/ai", router: aiRouter },
  { name: "documents", prefix: "/documents", router: documentsRouter },
  { name: "feedbacks", prefix: "/feedbacks", router: feedbacksRouter },
  { name: "milestones", prefix: "/milestones", router: milestonesRouter },
  { name: "reports", prefix: "/reports", router: reportsRouter },
  { name: "theses", prefix: "/theses", router: thesesRouter },
];

const ALL = MODULES.flatMap((m) => {
  const shared = routerLevelGuards(m.router);
  return collect(m.router, m.prefix).map((r) => {
    // Hàng rào hiệu lực = cấp router + cấp route. `adminRouter` khai
    // `requireAuth, requireRole("ADMIN")` một lần ở cấp router cho cả 20 route;
    // bỏ qua lớp đó thì test sẽ báo sai toàn bộ nhóm quản trị.
    const effective = [...shared, ...r.guards];
    return {
      ...r,
      module: m.name,
      effective,
      names: effective.map((g) => g.name),
      /** Có hàng rào vai trò nào không, bất kể tên hàm là gì. */
      roleGuards: effective.filter((g) => g.roles !== undefined),
    };
  });
});

const label = (r: { method: string; path: string }) => `${r.method} ${r.path}`;

/** Vai trò được một route cho phép, giao của mọi hàng rào vai trò trên đó. */
function allowedRoles(r: (typeof ALL)[number]): Set<string> | null {
  if (r.roleGuards.length === 0) return null;
  return r.roleGuards.reduce<Set<string>>(
    (acc, g) => new Set([...acc].filter((role) => g.roles!.includes(role))),
    new Set(["ADMIN", "LECTURER", "STUDENT"])
  );
}

/* ==========================================================================
   1. KHÔNG CÓ ROUTE NÀO ĐỨNG NGOÀI XÁC THỰC
   ========================================================================== */

test("mọi route nghiệp vụ đều đi qua requireAuth", () => {
  const open = ALL.filter(
    (r) => !r.names.includes("requireAuth") && !r.names.includes("optionalAuth")
  );

  assert.deepEqual(
    open.map(label),
    [],
    "Route dưới đây không có xác thực — bất kỳ ai cũng gọi được:\n" +
      open.map((r) => `  ${r.module}: ${label(r)}`).join("\n")
  );
});

/* ==========================================================================
   2. TOÀN BỘ /admin LÀ ĐỘC QUYỀN QUẢN TRỊ

   Đây là điều kiện mà lỗ hổng ở giao diện đợt trước phơi ra: sinh viên gõ
   `/admin/users` thì trang vẫn dựng lên. Hàng rào giao diện đã có, nhưng nó chỉ
   là lớp thứ hai — lớp thật là ở đây.
   ========================================================================== */

test("mọi route /admin chỉ cho ADMIN, không ai khác", () => {
  const admin = ALL.filter((r) => r.module === "admin");
  assert.ok(admin.length > 0, "Không đọc được route nào của adminRouter — test này vô nghĩa");

  const leaky = admin.filter((r) => {
    const allowed = allowedRoles(r);
    // Không có hàng rào vai trò, hoặc có mà vẫn để lọt vai trò khác ADMIN.
    return allowed === null || allowed.size !== 1 || !allowed.has("ADMIN");
  });

  assert.deepEqual(
    leaky.map(label),
    [],
    "Route quản trị không giới hạn đúng về một mình ADMIN:\n" +
      leaky
        .map((r) => `  ${label(r)} → ${[...(allowedRoles(r) ?? ["(không có hàng rào)"])].join(", ")}`)
        .join("\n")
  );
});

/* ==========================================================================
   3. GHI VÀO DỮ LIỆU NGHIỆP VỤ PHẢI CÓ HÀNG RÀO VAI TRÒ

   Quản trị viên không làm thay sinh viên và giảng viên (xem `requireContributor`
   trong `middleware/auth.ts`). Ranh giới là "hành chính" so với "nội dung", nên
   một số route ghi CỐ Ý dành cho Admin và được liệt kê tường minh bên dưới —
   danh sách trắng ngắn và phải giải thích được từng dòng.
   ========================================================================== */

/** Route ghi cố ý KHÔNG dùng `requireContributor`, kèm lý do. */
const ADMIN_WRITE_ALLOWLIST = new Map<string, string>([
  ["PATCH /theses/:id/lecturer", "UC 3.12 — Admin gán/đổi giảng viên hướng dẫn"],
  /* Hai route thành viên là thao tác PHÂN CÔNG, không phải ghi nội dung nghiệp
     vụ: chúng không đụng tới đề cương, mốc tiến độ hay tài liệu nào. Quyền thật
     nằm ở `assertCanManageMembers` — chủ nhiệm hoặc GVHD của chính đề tài đó,
     nên một giảng viên khác vẫn không chạm được vào đề tài không phải của mình. */
  ["POST /theses/:id/members", "Chủ nhiệm, GVHD hoặc Admin thêm sinh viên vào đề tài"],
  ["DELETE /theses/:id/members/:user_id", "Chủ nhiệm, GVHD hoặc Admin gỡ sinh viên khỏi đề tài"],
]);

const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

/** Module chứa dữ liệu nghiệp vụ của sinh viên và giảng viên. */
const CONTENT_MODULES = new Set(["theses", "documents", "feedbacks", "milestones"]);

test("route ghi dữ liệu nghiệp vụ đều có hàng rào vai trò", () => {
  const writes = ALL.filter(
    (r) => CONTENT_MODULES.has(r.module) && WRITE_METHODS.has(r.method)
  );
  assert.ok(writes.length > 0, "Không đọc được route ghi nào — test này vô nghĩa");

  const missing = writes.filter((r) => {
    if (ADMIN_WRITE_ALLOWLIST.has(label(r))) return false;
    const allowed = allowedRoles(r);
    // Phải có hàng rào, và hàng rào đó phải loại ADMIN ra.
    return allowed === null || allowed.has("ADMIN");
  });

  assert.deepEqual(
    missing.map(label),
    [],
    "Route ghi nội dung nghiệp vụ vẫn cho ADMIN đi qua. Thêm `requireContributor`\n" +
      "(đặt SAU `requireAuth`), hoặc thêm vào ADMIN_WRITE_ALLOWLIST kèm lý do nếu\n" +
      "route này thực sự là thao tác hành chính:\n" +
      missing.map((r) => `  ${r.module}: ${label(r)}`).join("\n")
  );
});

test("danh sách trắng ADMIN_WRITE_ALLOWLIST không chứa route đã biến mất", () => {
  const stale = [...ADMIN_WRITE_ALLOWLIST.keys()].filter(
    (target) => !ALL.some((r) => label(r) === target)
  );
  assert.deepEqual(
    stale,
    [],
    "Danh sách trắng còn ngoại lệ cho route không còn tồn tại — xoá đi để nó không\n" +
      "âm thầm che một route khác trong tương lai:\n" +
      stale.map((s) => `  ${s}`).join("\n")
  );
});

/* ==========================================================================
   4. THỨ TỰ MIDDLEWARE

   `requireRole` đọc `req.user` do `requireAuth` đặt vào. Đặt ngược thứ tự thì
   route trả 401 cho MỌI người, kể cả người có đủ quyền — và vì nó vẫn "chặn
   được", lỗi này rất dễ lọt qua kiểm tra bằng mắt. Chính lỗi đó vừa xảy ra ở 21
   route khi các decorator được chèn tự động.
   ========================================================================== */

test("requireRole và requireContributor luôn nằm SAU requireAuth", () => {
  const wrong: string[] = [];

  for (const r of ALL) {
    const auth = r.names.indexOf("requireAuth");
    if (auth === -1) continue; // đã bị test 1 bắt

    const firstRoleGuard = r.effective.findIndex((g) => g.roles !== undefined);
    if (firstRoleGuard !== -1 && firstRoleGuard < auth) {
      wrong.push(`${r.module}: ${label(r)} — hàng rào vai trò đứng trước requireAuth`);
    }
  }

  assert.deepEqual(wrong, [], "Sai thứ tự middleware:\n" + wrong.map((w) => `  ${w}`).join("\n"));
});

/* ==========================================================================
   5. ROUTE CHỈ DÀNH CHO ADMIN NGOÀI NHÓM /admin
   ========================================================================== */

test("route đặc quyền ngoài nhóm /admin vẫn giới hạn đúng vai trò", () => {
  const expected: Array<[string, string[]]> = [
    ["GET /ai/stats", ["ADMIN"]],
    ["GET /reports/theses/export", ["ADMIN", "LECTURER"]],
    // Chỉ còn LECTURER: duyệt đề tài là việc của giảng viên hướng dẫn, Admin đã bị
    // gỡ khỏi luồng này (xem thêm `visibleThesisIds` trả về [] cho ADMIN).
    ["GET /theses/pending", ["LECTURER"]],
    ["PATCH /theses/:id/lecturer", ["ADMIN"]],
  ];

  for (const [target, roles] of expected) {
    const route = ALL.find((r) => label(r) === target);
    assert.ok(route, `Không tìm thấy route ${target} — đường dẫn đã đổi?`);

    const allowed = allowedRoles(route);
    assert.ok(allowed, `${target} không có hàng rào vai trò nào`);
    assert.deepEqual(
      [...allowed].sort(),
      [...roles].sort(),
      `${target} cho phép sai tập vai trò`
    );
  }
});

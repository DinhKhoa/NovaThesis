/**
 * KIỂM THỬ ĐẦU-CUỐI: MINH CHỨNG → TÀI LIỆU → TRỢ LÝ
 *
 * Chạy trên CƠ SỞ DỮ LIỆU THẬT của môi trường phát triển, không phải mock. Ba
 * thứ cần kiểm chỉ tồn tại ở tầng đó và không một bài kiểm thử đơn vị nào chạm
 * tới được: thẻ `text[]` + index GIN, ràng buộc CHECK trên `feedbacks`, và ranh
 * giới SSE (lỗi phải bay ra dưới dạng JSON 4xx, không phải một sự kiện `error`
 * nằm giữa luồng).
 *
 * Mọi bản ghi do bài kiểm thử tạo ra đều mang tiền tố `[e2e]` và bị xoá ở bước
 * dọn dẹp cuối, kể cả khi có assertion thất bại giữa chừng.
 *
 *   npx tsx tests/milestone-doc-ai.e2e.ts
 */
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { prisma } from "../src/lib/prisma";
import { signAccessToken } from "../src/lib/crypto";
import { EVIDENCE_TAG, milestoneTag } from "../src/lib/evidence-to-document";
import { deleteChunks } from "../src/services/ai/vector.repository";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:8000/api/v1";
const TAG = "[e2e]";

let passed = 0;
const failures: string[] = [];

async function step(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${err instanceof Error ? err.message : String(err)}`);
  }
}

/* ==========================================================================
   DỰNG DỮ LIỆU
   ========================================================================== */

interface Fixture {
  lecturerUserId: number;
  studentUserId: number;
  outsiderUserId: number;
  thesisId: number;
  otherThesisId: number;
  milestoneId: number;
  otherMilestoneId: number;
  lecturerToken: string;
  studentToken: string;
}

async function seed(): Promise<Fixture> {
  const stamp = Date.now();
  const hash = "$argon2id$v=19$m=1,t=1,p=1$AAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

  const lecturerUser = await prisma.user.create({
    data: { email: `${TAG}gv-${stamp}@e2e.local`, password_hash: hash, full_name: `${TAG} Giảng viên`, role: "LECTURER", status: "ACTIVE" },
  });
  const lecturer = await prisma.lecturer.create({
    data: { user_id: lecturerUser.id, lecturer_code: `E2E-${stamp}`, department: `${TAG} Khoa` },
  });

  const studentUser = await prisma.user.create({
    data: { email: `${TAG}sv-${stamp}@e2e.local`, password_hash: hash, full_name: `${TAG} Sinh viên`, role: "STUDENT", status: "ACTIVE" },
  });
  const student = await prisma.student.create({ data: { user_id: studentUser.id } });

  // Người ngoài: không thuộc đề tài nào — dùng để kiểm tra rào phân quyền.
  const outsiderUser = await prisma.user.create({
    data: { email: `${TAG}ngoai-${stamp}@e2e.local`, password_hash: hash, full_name: `${TAG} Người ngoài`, role: "STUDENT", status: "ACTIVE" },
  });
  await prisma.student.create({ data: { user_id: outsiderUser.id } });

  const thesis = await prisma.thesis.create({
    data: {
      title: `${TAG} Đề tài chính`, field: "CNTT", status: "ONGOING",
      lecturer_id: lecturer.id, created_by: studentUser.id,
      members: { create: { student_id: student.id, role: "OWNER" } },
    },
  });

  // Đề tài thứ hai của CÙNG giảng viên: mốc của nó là "mốc hợp lệ nhưng sai
  // đề tài" — đúng kịch bản rò rỉ mà bước kiểm tra `milestone_id` phải chặn.
  const otherThesis = await prisma.thesis.create({
    data: { title: `${TAG} Đề tài khác`, field: "CNTT", status: "ONGOING", lecturer_id: lecturer.id, created_by: lecturerUser.id },
  });

  const milestone = await prisma.milestone.create({
    data: {
      thesis_id: thesis.id, name: `${TAG} Nộp đề cương`,
      description: "Đề cương phải nêu rõ mục tiêu, phạm vi và câu hỏi nghiên cứu.",
      deadline: new Date(Date.now() + 7 * 86_400_000), status: "ONGOING",
    },
  });

  const otherMilestone = await prisma.milestone.create({
    data: { thesis_id: otherThesis.id, name: `${TAG} Mốc đề tài khác`, deadline: new Date(Date.now() + 7 * 86_400_000) },
  });

  const token = (u: { id: number; email: string; role: string }) =>
    signAccessToken({ sub: u.id, email: u.email, role: u.role as "LECTURER" | "STUDENT" });

  return {
    lecturerUserId: lecturerUser.id,
    studentUserId: studentUser.id,
    outsiderUserId: outsiderUser.id,
    thesisId: thesis.id,
    otherThesisId: otherThesis.id,
    milestoneId: milestone.id,
    otherMilestoneId: otherMilestone.id,
    lecturerToken: token(lecturerUser),
    studentToken: token(studentUser),
  };
}

async function cleanup(f: Fixture | null): Promise<void> {
  if (!f) return;

  const docs = await prisma.document.findMany({
    where: { thesis_id: { in: [f.thesisId, f.otherThesisId] } },
    select: { id: true },
  });
  for (const d of docs) await deleteChunks(d.id).catch(() => undefined);

  await prisma.feedback.deleteMany({ where: { milestone: { thesis_id: { in: [f.thesisId, f.otherThesisId] } } } });
  await prisma.thesis.deleteMany({ where: { id: { in: [f.thesisId, f.otherThesisId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [f.lecturerUserId, f.studentUserId, f.outsiderUserId] } } });
}

/* ==========================================================================
   TIỆN ÍCH HTTP
   ========================================================================== */

function authed(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${token}`, ...extra };
}

/**
 * Đọc thân phản hồi ĐÚNG MỘT LẦN rồi mới khẳng định mã trạng thái.
 *
 * `assert.equal(res.status, 201, await res.text())` trông vô hại nhưng template
 * literal được tính TRƯỚC lời gọi assert, nên thân phản hồi bị tiêu thụ ngay cả
 * khi khẳng định đúng — và `res.json()` ngay sau đó ném "Body already read".
 */
async function expectJson<T>(res: Response, status: number): Promise<T> {
  const raw = await res.text();
  assert.equal(res.status, status, `HTTP ${res.status}: ${raw}`);
  return JSON.parse(raw) as T;
}

async function uploadEvidence(
  token: string, milestoneId: number,
  file: { name: string; type: string; body: Buffer },
  autoSubmit: boolean
): Promise<Response> {
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(file.body)], { type: file.type }), file.name);
  fd.append("auto_submit", String(autoSubmit));
  return fetch(`${BASE}/milestones/${milestoneId}/evidence`, { method: "POST", headers: authed(token), body: fd });
}

/** Đọc luồng SSE thành danh sách `[tên sự kiện, dữ liệu]`. */
async function readSSE(res: Response): Promise<Array<[string, unknown]>> {
  const text = await res.text();
  const out: Array<[string, unknown]> = [];
  for (const block of text.split("\n\n")) {
    let name = "message";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) name = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    if (data) {
      try {
        out.push([name, JSON.parse(data)]);
      } catch {
        /* keep-alive */
      }
    }
  }
  return out;
}

/* ==========================================================================
   KỊCH BẢN
   ========================================================================== */

async function main() {
  console.log(`\nKiểm thử đầu-cuối tới ${BASE}\n`);

  const health = await fetch(`${BASE}/health`).catch(() => null);
  if (!health?.ok) {
    console.error("Máy chủ chưa chạy. Khởi động `npm run dev` ở thư mục backend rồi chạy lại.");
    process.exit(2);
  }

  let f: Fixture | null = null;
  try {
    f = await seed();
    const fx = f;

    /* ---- 1. Minh chứng văn bản → Document có thẻ, chờ lập chỉ mục ---- */
    await step("nộp minh chứng .txt → tạo Document với thẻ milestone-evidence + milestone-id", async () => {
      const res = await uploadEvidence(fx.studentToken, fx.milestoneId, {
        name: "de_cuong.txt", type: "text/plain",
        body: Buffer.from("Đề cương nghiên cứu. Mục tiêu: xây dựng hệ thống RAG. Phạm vi: luận văn tốt nghiệp. Câu hỏi nghiên cứu: làm sao tăng độ chính xác trích dẫn.", "utf8"),
      }, false);
      assert.equal(res.status, 201, `HTTP ${res.status}: ${await res.text()}`);

      const doc = await prisma.document.findFirst({
        where: { thesis_id: fx.thesisId, deleted_at: null, tags: { has: milestoneTag(fx.milestoneId) } },
      });
      assert.ok(doc, "không tìm thấy Document nào mang thẻ của mốc");
      assert.deepEqual([...doc.tags].sort(), [EVIDENCE_TAG, milestoneTag(fx.milestoneId)].sort());
      // Worker có thể đã nhấc job lên trước khi khẳng định chạy tới đây; cả ba
      // trạng thái đều có nghĩa "đã vào hàng đợi", khác hẳn nhánh ảnh bên dưới.
      assert.ok(
        ["PENDING", "PROCESSING", "DONE"].includes(doc.status_ai),
        `tệp văn bản phải vào hàng đợi lập chỉ mục, nhận ${doc.status_ai}`
      );
      assert.equal(doc.filename, "de_cuong.txt");
    });

    /* ---- 2. Nộp lại → bản cũ xoá mềm, chỉ còn một bản sống ---- */
    let firstDocId = 0;
    await step("nộp lại minh chứng → Document cũ bị xoá mềm, chỉ còn đúng một bản đang sống", async () => {
      const before = await prisma.document.findFirstOrThrow({
        where: { thesis_id: fx.thesisId, deleted_at: null, tags: { has: milestoneTag(fx.milestoneId) } },
      });
      firstDocId = before.id;

      const res = await uploadEvidence(fx.studentToken, fx.milestoneId, {
        name: "de_cuong_v2.txt", type: "text/plain",
        body: Buffer.from("Đề cương nghiên cứu bản sửa. Bổ sung phương pháp đánh giá và tiêu chí nghiệm thu.", "utf8"),
      }, false);
      assert.equal(res.status, 201, `HTTP ${res.status}: ${await res.text()}`);

      const alive = await prisma.document.findMany({
        where: { thesis_id: fx.thesisId, deleted_at: null, tags: { has: milestoneTag(fx.milestoneId) } },
      });
      assert.equal(alive.length, 1, `còn ${alive.length} bản đang sống, phải là 1`);
      assert.equal(alive[0]!.filename, "de_cuong_v2.txt");

      const old = await prisma.document.findUniqueOrThrow({ where: { id: firstDocId } });
      assert.notEqual(old.deleted_at, null, "bản cũ chưa bị xoá mềm");

      const leftover = await prisma.documentChunk.count({ where: { document_id: firstDocId } });
      assert.equal(leftover, 0, `còn ${leftover} đoạn vector của bản cũ`);
    });

    /* ---- 3. Ảnh PNG → DONE, không xếp hàng lập chỉ mục ---- */
    await step("minh chứng PNG → status_ai = DONE và KHÔNG có job lập chỉ mục", async () => {
      // PNG 1×1 hợp lệ.
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64"
      );
      const res = await uploadEvidence(fx.studentToken, fx.milestoneId, { name: "anh.png", type: "image/png", body: png }, false);
      assert.equal(res.status, 201, `HTTP ${res.status}: ${await res.text()}`);

      const doc = await prisma.document.findFirstOrThrow({
        where: { thesis_id: fx.thesisId, deleted_at: null, tags: { has: milestoneTag(fx.milestoneId) } },
      });
      assert.equal(doc.filename, "anh.png");
      assert.equal(doc.status_ai, "DONE", "ảnh không trích xuất được chữ nên phải DONE ngay, không PENDING");
      assert.ok(doc.summary_ai && doc.summary_ai.length > 0, "phải có câu giải thích vì sao tệp này không tra cứu được");
      assert.equal(doc.ai_attempts, 0, "ảnh không được đưa vào hàng đợi worker");
    });

    /* ---- 4. Ranh giới SSE: milestone_id sai đề tài phải là JSON 4xx ---- */
    await step("chat với milestone_id của đề tài KHÁC → 400 JSON, phát ra TRƯỚC khi mở luồng SSE", async () => {
      const res = await fetch(`${BASE}/ai/chat`, {
        method: "POST",
        headers: authed(fx.studentToken, { "Content-Type": "application/json", Accept: "text/event-stream" }),
        body: JSON.stringify({ prompt: "Mốc này yêu cầu gì?", thesis_id: fx.thesisId, milestone_id: fx.otherMilestoneId }),
      });

      assert.equal(res.status, 400, `phải là 400, nhận ${res.status}`);
      const ctype = res.headers.get("content-type") ?? "";
      assert.ok(ctype.includes("application/json"), `phải trả JSON chứ không phải SSE, nhận "${ctype}"`);

      const body = (await res.json()) as { message?: string };
      assert.match(String(body.message), /mốc tiến độ/i);

      // Và không được để lại một phiên hội thoại rỗng nào.
      const sessions = await prisma.aIChatSession.count({ where: { user_id: fx.studentUserId } });
      assert.equal(sessions, 0, `để lại ${sessions} phiên rỗng sau khi từ chối`);
    });

    await step("chat với milestone_id nhưng KHÔNG có thesis_id → 400, không mở luồng", async () => {
      const res = await fetch(`${BASE}/ai/chat`, {
        method: "POST",
        headers: authed(fx.studentToken, { "Content-Type": "application/json", Accept: "text/event-stream" }),
        body: JSON.stringify({ prompt: "Mốc này yêu cầu gì?", milestone_id: fx.milestoneId }),
      });
      assert.equal(res.status, 400, `phải là 400, nhận ${res.status}`);
      assert.ok((res.headers.get("content-type") ?? "").includes("application/json"));
    });

    /* ---- 5. milestone_id hợp lệ → luồng SSE chạy, nguồn gồm minh chứng ---- */
    await step("chat với milestone_id hợp lệ → luồng SSE mở, nguồn của phiên gồm minh chứng của mốc", async () => {
      const res = await fetch(`${BASE}/ai/chat`, {
        method: "POST",
        headers: authed(fx.studentToken, { "Content-Type": "application/json", Accept: "text/event-stream" }),
        body: JSON.stringify({ prompt: "Mốc này còn thiếu gì?", thesis_id: fx.thesisId, milestone_id: fx.milestoneId }),
      });
      assert.equal(res.status, 200, `HTTP ${res.status}`);
      assert.ok((res.headers.get("content-type") ?? "").includes("text/event-stream"), "phải là luồng SSE");

      const events = await readSSE(res);
      const names = events.map(([n]) => n);
      assert.ok(names.includes("session"), `thiếu sự kiện session (nhận: ${names.join(", ")})`);
      assert.ok(names.includes("done") || names.includes("error"), `luồng phải kết thúc (nhận: ${names.join(", ")})`);

      const session = events.find(([n]) => n === "session")?.[1] as { session_id: number; source_document_ids: number[] };
      const evidenceDocs = await prisma.document.findMany({
        where: { deleted_at: null, tags: { has: milestoneTag(fx.milestoneId) } },
        select: { id: true },
      });
      for (const d of evidenceDocs) {
        assert.ok(
          session.source_document_ids.includes(d.id),
          `minh chứng ${d.id} phải nằm trong nguồn của phiên (${session.source_document_ids.join(",")})`
        );
      }
    });

    /* ---- 6. Chuyển sang PENDING_APPROVAL → bản nháp AI chạy nền ---- */
    await step("chuyển sang PENDING_APPROVAL → phản hồi trả về ngay, bản nháp AI sinh ở nền", async () => {
      /*
       * Ngưỡng SO SÁNH chứ không phải ngưỡng tuyệt đối.
       *
       * Endpoint đổi trạng thái vốn đã mất vài giây trên cơ sở dữ liệu ở xa
       * (nhiều lượt đi–về tuần tự + ghi thông báo), nên một con số cứng kiểu
       * "< 3000ms" chỉ đo được độ trễ mạng của máy chạy kiểm thử. Thứ cần
       * khẳng định là bản nháp AI KHÔNG cộng thêm vào thời gian chờ của sinh
       * viên — nên ta đo một phép chuyển KHÔNG kích hoạt bản nháp làm mốc, rồi
       * đối chiếu.
       */
      const baselineMilestone = await prisma.milestone.create({
        data: {
          thesis_id: fx.thesisId, name: `${TAG} Mốc đối chứng`,
          deadline: new Date(Date.now() + 7 * 86_400_000), status: "NOT_STARTED",
        },
      });

      const timeTransition = async (id: number, status: string): Promise<number> => {
        const t = Date.now();
        const r = await fetch(`${BASE}/milestones/${id}/status`, {
          method: "PATCH",
          headers: authed(fx.studentToken, { "Content-Type": "application/json" }),
          body: JSON.stringify({ status }),
        });
        const raw = await r.text();
        assert.equal(r.status, 200, `HTTP ${r.status}: ${raw}`);
        return Date.now() - t;
      };

      const baseline = await timeTransition(baselineMilestone.id, "ONGOING");
      const elapsed = await timeTransition(fx.milestoneId, "PENDING_APPROVAL");

      // Nới rộng: mạng dao động thật. Nếu bản nháp bị `await` nhầm, chênh lệch
      // sẽ là hàng chục giây (một lượt gọi nhúng + một lượt gọi mô hình sinh),
      // không phải vài trăm mili giây.
      assert.ok(
        elapsed < baseline + 4000,
        `phản hồi mất ${elapsed}ms so với mốc đối chứng ${baseline}ms — bản nháp AI đang chặn luồng request`
      );

      // Bản nháp chạy nền: chờ có giới hạn thay vì đoán một khoảng cố định.
      let draft = null;
      for (let i = 0; i < 40 && !draft; i++) {
        await sleep(500);
        draft = await prisma.feedback.findFirst({
          where: { milestone_id: fx.milestoneId, is_ai_draft: true },
          orderBy: { created_at: "desc" },
        });
      }

      assert.ok(draft, "không sinh được bản nháp nhận xét sau 20 giây");
      assert.equal(draft.user_id, fx.lecturerUserId, "tác giả bản nháp phải là giảng viên hướng dẫn");
      assert.equal(draft.ai_milestone_id, fx.milestoneId);
      assert.ok(draft.content.length > 40, "bản nháp quá ngắn để có nội dung thật");
    });

    /* ---- 7. Bản nháp KHÔNG lọt vào luồng trao đổi ---- */
    await step("bản nháp AI không xuất hiện trong GET /feedbacks của sinh viên", async () => {
      const res = await fetch(`${BASE}/feedbacks?milestone_id=${fx.milestoneId}`, { headers: authed(fx.studentToken) });
      assert.equal(res.status, 200, `HTTP ${res.status}`);
      const body = (await res.json()) as { data: Array<{ id: number }> };

      const draft = await prisma.feedback.findFirstOrThrow({ where: { milestone_id: fx.milestoneId, is_ai_draft: true } });
      assert.ok(!body.data.some((f) => f.id === draft.id), "bản nháp AI lọt vào luồng trao đổi của sinh viên");
    });

    await step("số đếm phản hồi trên mốc không tính bản nháp AI", async () => {
      const res = await fetch(`${BASE}/milestones/${fx.milestoneId}`, { headers: authed(fx.studentToken) });
      const body = (await res.json()) as { data: { feedback_count: number } };
      assert.equal(body.data.feedback_count, 0, "bản nháp AI bị đếm vào số phản hồi hiển thị");
    });

    /* ---- 8. GET ai-review: giảng viên đọc được, sinh viên thì không ---- */
    await step("GET /milestones/:id/ai-review → giảng viên đọc được bản nháp", async () => {
      const res = await fetch(`${BASE}/milestones/${fx.milestoneId}/ai-review`, { headers: authed(fx.lecturerToken) });
      const body = await expectJson<{ data: { content: string } | null }>(res, 200);
      assert.ok(body.data, "giảng viên phải đọc được bản nháp");
      assert.ok(body.data.content.length > 40);
    });

    await step("GET /milestones/:id/ai-review → sinh viên bị chặn (403)", async () => {
      const res = await fetch(`${BASE}/milestones/${fx.milestoneId}/ai-review`, { headers: authed(fx.studentToken) });
      assert.equal(res.status, 403, `sinh viên phải nhận 403, nhận ${res.status}`);
    });

    await step("POST /ai/milestone-review/:id → sinh viên bị chặn, giảng viên tạo lại được", async () => {
      const denied = await fetch(`${BASE}/ai/milestone-review/${fx.milestoneId}`, { method: "POST", headers: authed(fx.studentToken) });
      assert.equal(denied.status, 403, `sinh viên phải nhận 403, nhận ${denied.status}`);

      const ok = await fetch(`${BASE}/ai/milestone-review/${fx.milestoneId}`, { method: "POST", headers: authed(fx.lecturerToken) });
      const body = await expectJson<{ data: { id: number; content: string; created_at: string } }>(ok, 201);
      assert.ok(body.data.content.length > 40);
      assert.ok(!Number.isNaN(Date.parse(body.data.created_at)), "created_at phải là ISO 8601 hợp lệ");
    });

    /* ---- 9. "Chép sang phản hồi" tạo một bình luận THẬT ---- */
    await step("chép bản nháp sang phản hồi → sinh viên nhìn thấy, và nó không còn là bản nháp", async () => {
      const draft = await prisma.feedback.findFirstOrThrow({
        where: { milestone_id: fx.milestoneId, is_ai_draft: true }, orderBy: { created_at: "desc" },
      });

      const fd = new FormData();
      fd.append("milestone_id", String(fx.milestoneId));
      fd.append("content", draft.content);
      const res = await fetch(`${BASE}/feedbacks`, { method: "POST", headers: authed(fx.lecturerToken), body: fd });
      assert.equal(res.status, 201, `HTTP ${res.status}: ${await res.text()}`);

      const listed = await fetch(`${BASE}/feedbacks?milestone_id=${fx.milestoneId}`, { headers: authed(fx.studentToken) });
      const body = (await listed.json()) as { data: Array<{ id: number; content: string }> };
      assert.equal(body.data.length, 1, `sinh viên phải thấy đúng 1 phản hồi, thấy ${body.data.length}`);
      // multipart/form-data mã hoá giá trị trường văn bản bằng CRLF theo đặc tả,
      // nên nội dung lưu xuống có `\r\n` trong khi bản nháp gốc dùng `\n`.
      const flat = (v: string) => v.replace(/\r\n/g, "\n");
      assert.equal(flat(body.data[0]!.content), flat(draft.content));
    });

    /* ---- 10. Xoá tài liệu minh chứng KHÔNG xoá tệp của mốc ---- */
    await step("xoá Document minh chứng → tệp vật lý của mốc vẫn còn tải về được", async () => {
      const doc = await prisma.document.findFirstOrThrow({
        where: { thesis_id: fx.thesisId, deleted_at: null, tags: { has: milestoneTag(fx.milestoneId) } },
      });
      const milestone = await prisma.milestone.findUniqueOrThrow({ where: { id: fx.milestoneId } });
      assert.equal(doc.file_path, milestone.evidence_file_url, "hai bản ghi phải trỏ cùng một tệp");

      const res = await fetch(`${BASE}/documents/${doc.id}`, { method: "DELETE", headers: authed(fx.studentToken) });
      assert.equal(res.status, 204, `HTTP ${res.status}: ${await res.text()}`);

      const { fileExists } = await import("../src/lib/storage");
      assert.ok(await fileExists(milestone.evidence_file_url!), "tệp minh chứng của mốc đã bị xoá theo — mất bằng chứng");
    });

    /* ---- 11. Người ngoài không chạm được vào mốc ---- */
    await step("người ngoài đề tài không nộp được minh chứng (403/404)", async () => {
      const token = signAccessToken({ sub: fx.outsiderUserId, email: `${TAG}ngoai`, role: "STUDENT" });
      const res = await uploadEvidence(token, fx.milestoneId, {
        name: "gia_mao.txt", type: "text/plain", body: Buffer.from("noi dung", "utf8"),
      }, false);
      assert.ok(res.status === 403 || res.status === 404, `phải bị chặn, nhận ${res.status}`);
    });
  } finally {
    await cleanup(f);
    await prisma.$disconnect();
  }

  console.log(`\n${passed} đạt, ${failures.length} hỏng`);
  if (failures.length > 0) {
    console.log(`Hỏng: ${failures.join(" · ")}`);
    process.exit(1);
  }
}

void main();

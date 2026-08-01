/**
 * KIỂM THỬ PHẠM VI TRUY XUẤT CỦA TRỢ LÝ AI
 *
 * `narrowToSelection()` là chỗ dữ liệu do CLIENT gửi lên gặp quyền do SERVER
 * tính. Sai ở đây không làm sập gì cả — nó chỉ lặng lẽ trả về nội dung luận văn
 * của sinh viên khác, và không ai biết cho tới khi có người đọc thấy.
 *
 * Vì vậy nó có bộ test riêng, tách khỏi phần còn lại.
 *
 * Chạy: npm test
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  narrowToSelection,
  containsGeneralKnowledge,
  GENERAL_KNOWLEDGE_MARKER,
} from "../src/services/ai/rag";

/* ==========================================================================
   CÔ LẬP DỮ LIỆU
   ========================================================================== */

test("narrowToSelection: id client gửi lên mà không được phép thì bị loại", () => {
  // Sinh viên A được đọc tài liệu 1, 2. Gửi lên cả 99 của người khác.
  const { scope } = narrowToSelection([1, 2], [1, 99]);

  assert.deepEqual(scope, [1]);
  assert.ok(!scope!.includes(99), "id không thuộc phạm vi đã lọt qua — đây là rò rỉ dữ liệu");
});

test("narrowToSelection: chọn TOÀN BỘ id lạ thì phạm vi rỗng, không mở rộng", () => {
  const { scope } = narrowToSelection([1, 2], [98, 99]);
  assert.deepEqual(scope, [], "phải rỗng, tuyệt đối không được rơi về 'dùng tất cả'");
});

test("narrowToSelection: không chọn gì thì giữ nguyên phạm vi được phép", () => {
  assert.deepEqual(narrowToSelection([1, 2, 3], undefined).scope, [1, 2, 3]);
  assert.deepEqual(narrowToSelection([1, 2, 3], null).scope, [1, 2, 3]);
  assert.deepEqual(narrowToSelection([1, 2, 3], []).scope, [1, 2, 3]);
});

test("narrowToSelection: Admin không giới hạn thì phạm vi đúng bằng tập đã chọn", () => {
  // `allowed === null` nghĩa là không giới hạn. Không được trả `null` tiếp,
  // nếu không lựa chọn của người dùng bị bỏ qua hoàn toàn.
  assert.deepEqual(narrowToSelection(null, [7, 8]).scope, [7, 8]);
  assert.equal(narrowToSelection(null, undefined).scope, null);
});

test("narrowToSelection: đếm đúng số tài liệu bị bỏ chọn", () => {
  assert.equal(narrowToSelection([1, 2, 3, 4, 5], [1, 2]).excluded, 3);
  assert.equal(narrowToSelection([1, 2, 3], [1, 2, 3]).excluded, 0);
  assert.equal(narrowToSelection([1, 2, 3], undefined).excluded, 0);
  // id lạ không được tính là "bị bỏ chọn" — nó chưa bao giờ thuộc phạm vi.
  assert.equal(narrowToSelection([1, 2], [1, 99]).excluded, 1);
});

test("narrowToSelection: id trùng lặp trong lựa chọn không nhân bản phạm vi", () => {
  const { scope } = narrowToSelection([1, 2], [1, 1, 1, 2]);
  assert.deepEqual(scope, [1, 2]);
});

/* ==========================================================================
   TÁCH BẠCH KIẾN THỨC NGOÀI TÀI LIỆU
   ========================================================================== */

test("containsGeneralKnowledge: nhận ra khối cảnh báo", () => {
  const answer = `RAG kết hợp truy xuất và sinh [1].

${GENERAL_KNOWLEDGE_MARKER}
Kiến trúc này lần đầu được Lewis và cộng sự đề xuất năm 2020.`;

  assert.equal(containsGeneralKnowledge(answer), true);
});

test("containsGeneralKnowledge: câu trả lời thuần tài liệu không bị đánh dấu nhầm", () => {
  assert.equal(
    containsGeneralKnowledge("HNSW nhanh hơn IVFFlat trên tập dữ liệu tăng dần [1][2]."),
    false
  );
});

test("GENERAL_KNOWLEDGE_MARKER là hằng số dùng chung, không phải chuỗi gõ tay", () => {
  // Nhãn xuất hiện ở ba nơi (prompt, hàm dò, giao diện). Test này chốt giá trị
  // để một lần sửa nhãn mà quên nơi khác sẽ bị bắt tại đây thay vì âm thầm làm
  // hỏng việc tô màu cảnh báo trên giao diện.
  assert.equal(GENERAL_KNOWLEDGE_MARKER, "⚠ Ngoài tài liệu của bạn:");
});

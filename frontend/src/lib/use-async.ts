"use client";

/**
 * Hook tải dữ liệu.
 *
 * Nhỏ có chủ đích. Kéo React Query hay SWR vào để làm ba trạng thái
 * loading/error/data cùng một nút "thử lại" là đúng kiểu over-engineering mà
 * `Yêu cầu dự án.md` §3.3 nhắc phải tránh — thêm ~13 KB và một mô hình cache
 * nữa cho thứ mà 60 dòng giải quyết xong.
 *
 * Ba thứ hook này lo, và đều là những chỗ dễ sai khi tự viết trong từng trang:
 *   • huỷ cập nhật state sau khi component đã unmount (rò rỉ + cảnh báo React);
 *   • bỏ qua phản hồi của request cũ khi request mới đã xuất phát (race);
 *   • tách `refetch` để nút "Thử lại" và các thao tác ghi dùng lại được.
 */
import React from "react";
import { isApiError } from "./api";

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
}

export function useAsync<T>(
  loader: () => Promise<T>,
  deps: React.DependencyList = [],
  options: { enabled?: boolean; initial?: T | null } = {}
): AsyncState<T> {
  const { enabled = true, initial = null } = options;

  const [data, setData] = React.useState<T | null>(initial);
  const [fetching, setFetching] = React.useState(enabled);
  const [error, setError] = React.useState<string | null>(null);

  // Mỗi lần chạy nhận một số thứ tự. Phản hồi về muộn hơn lần chạy mới nhất sẽ
  // bị bỏ qua — nếu không, gõ nhanh vào ô tìm kiếm sẽ khiến kết quả cũ ghi đè
  // kết quả mới một cách ngẫu nhiên.
  const runId = React.useRef(0);
  const mounted = React.useRef(true);

  /*
   * `loader` là closure mới sau MỖI lần render, nên đưa nó vào mảng phụ thuộc
   * sẽ khiến effect chạy lại liên tục. Giữ qua ref và đồng bộ trong một effect
   * KHÔNG có mảng phụ thuộc.
   *
   * Cố ý không gán `loaderRef.current` ngay trong thân hàm: React 19 cấm ghi
   * ref lúc render, vì với Concurrent Rendering một lần render có thể bị bỏ dở
   * và lần ghi đó vẫn nằm lại. Effect dưới đây khai báo TRƯỚC effect tải dữ
   * liệu nên nó luôn chạy trước trong cùng một lượt commit.
   */
  const loaderRef = React.useRef(loader);
  React.useEffect(() => {
    loaderRef.current = loader;
  });

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const execute = React.useCallback(async () => {
    const id = ++runId.current;
    setFetching(true);
    setError(null);
    try {
      const result = await loaderRef.current();
      if (!mounted.current || id !== runId.current) return;
      setData(result);
    } catch (err) {
      if (!mounted.current || id !== runId.current) return;
      setError(isApiError(err) ? err.message : "Không tải được dữ liệu. Vui lòng thử lại.");
    } finally {
      if (mounted.current && id === runId.current) setFetching(false);
    }
  }, []);

  React.useEffect(() => {
    if (!enabled) return;
    /*
     * `react-hooks/set-state-in-effect` gắn cờ dòng này vì `execute()` bật cờ
     * `fetching` ngay lập tức. Quy tắc đó nhắm vào state SUY RA ĐƯỢC — thứ đáng
     * lẽ tính lúc render thay vì đồng bộ bằng effect. Ở đây không có gì để suy
     * ra: khởi động một request mạng đúng là tác dụng phụ, và "đang tải" là
     * trạng thái của chính request đó chứ không phải hàm của props.
     *
     * Tắt có chủ đích và chỉ ở đúng dòng này. Mọi vi phạm KHÁC trong dự án đều
     * đã được sửa bằng cách suy giá trị lúc render (xem `useSelection`).
     */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void execute();
    // `deps` do người gọi truyền vào nên ESLint không kiểm tra tĩnh được — đó
    // chính là hợp đồng của hook này.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, execute, ...deps]);

  return {
    data,
    // Suy ra thay vì `setFetching(false)` trong effect: gọi setState đồng bộ
    // trong effect gây thêm một lượt render thừa, và React 19 cảnh báo đúng.
    loading: enabled && fetching,
    error,
    refetch: execute,
    setData,
  };
}

/**
 * Trì hoãn giá trị.
 *
 * UC 5.8 NFR nêu rõ 300ms cho ô tìm kiếm: gọi API sau mỗi phím gõ biến một ô
 * tìm kiếm thành công cụ tấn công chính máy chủ của mình.
 */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = React.useState(value);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/**
 * Giá trị "chốt lần đầu rồi cho phép người dùng đổi".
 *
 * Dùng cho những ô chọn được khởi tạo từ dữ liệu tải về (chọn đề tài đầu tiên
 * trong danh sách, chẳng hạn). Cách quen tay là `useEffect` + `setState`, nhưng
 * đó chính là mẫu mà React 19 gắn cờ: nó tạo thêm một lượt render và một
 * khoảnh khắc giao diện hiển thị giá trị rỗng trước khi tự sửa.
 *
 * Suy ra lúc render thì không có khoảnh khắc đó.
 */
export function useSelection<T>(
  fallback: T | null
): [T | null, React.Dispatch<React.SetStateAction<T | null>>] {
  const [selected, setSelected] = React.useState<T | null>(null);
  return [selected ?? fallback, setSelected];
}

"use client";

import { toast } from "@/lib/toast";
import { isApiError } from "@/lib/api";
import { documentsApi } from "@/lib/services";

/**
 * Mở tệp gốc của một nguồn trích dẫn (UC 6.6).
 *
 * Không dùng `documentsApi.downloadUrl()`: đường dẫn `/documents/:id/download-url`
 * không tồn tại ở backend. Liên kết đã ký nằm trong trường `download_url` của
 * chính bản ghi tài liệu, và nó là `null` khi người xem chỉ được chia sẻ phần mô
 * tả (business rule UC 5.10).
 *
 * Tab được mở TRƯỚC khi `await`: trình duyệt chỉ cho `window.open` chạy trong
 * cùng nhịp xử lý cú nhấp chuột, gọi sau khi request về sẽ bị chặn pop-up.
 */
export async function openSourceDocument(documentId: number): Promise<void> {
  const tab = window.open("about:blank", "_blank");
  if (tab) tab.opener = null;

  try {
    const document = await documentsApi.get(documentId);
    if (!document.download_url) {
      tab?.close();
      toast.error("Tài liệu này được chia sẻ ở chế độ chỉ đọc, không mở được tệp gốc.");
      return;
    }
    if (tab) tab.location.href = document.download_url;
    else window.open(document.download_url, "_blank");
  } catch (err) {
    tab?.close();
    toast.error(isApiError(err) ? err.message : "Không mở được tài liệu nguồn.");
  }
}

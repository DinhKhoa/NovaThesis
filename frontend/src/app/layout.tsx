import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Be_Vietnam_Pro, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { THEME_COOKIE, ThemeProvider, type ThemeSetting } from "@/components/ThemeProvider";

/*
 * Geist ships no `vietnamese` subset, so every tone mark (ệ, ữ, ạ) fell back
 * to a system face and the UI rendered in two typefaces at once. Be Vietnam Pro
 * is drawn for Vietnamese diacritics and keeps stacked marks from clipping at
 * the 12–13px sizes this UI leans on.
 */
const sans = Be_Vietnam_Pro({
  variable: "--font-be-vietnam",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

/* Reserved for IDs, hashes, file sizes and timestamps — anything meant to be
   compared vertically down a column. */
const mono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "NovaThesis",
    template: "%s · NovaThesis",
  },
  description:
    "Hệ thống quản lý luận văn và đề tài nghiên cứu của Trường Đại học Kinh tế – Đại học Đà Nẵng.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0d12" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  /*
   * Đọc tuỳ chọn giao diện NGAY TRÊN SERVER.
   *
   * Đây là lợi ích thực dụng của việc lưu tuỳ chọn bằng cookie thay vì
   * `localStorage`: class `dark` có mặt trong HTML đầu tiên gửi về, nên không có
   * khung hình nào hiện giao diện sáng rồi mới nháy sang tối. Với
   * `localStorage`, server không đọc được nên buộc phải chèn một script chặn
   * render — chính cách `next-themes` phải làm.
   *
   * Chế độ "system" là ngoại lệ duy nhất: server không biết
   * `prefers-color-scheme` của người xem, nên phần đó do client quyết định ngay
   * sau khi hydrate.
   */
  const stored = (await cookies()).get(THEME_COOKIE)?.value;
  const theme: ThemeSetting =
    stored === "light" || stored === "dark" || stored === "system" ? stored : "system";

  return (
    /*
     * No height constraint on `html`/`body`: `globals.css` already gives the
     * body a `100dvh` minimum, and pinning both to 100% makes the modal's
     * `overflow: hidden` scroll lock clip page content instead of just
     * freezing it.
     */
    <html
      lang="vi"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable}${theme === "dark" ? " dark" : ""}`}
      style={theme === "system" ? undefined : { colorScheme: theme }}
    >
      <body>
        <ThemeProvider initialTheme={theme}>{children}</ThemeProvider>
      </body>
    </html>
  );
}

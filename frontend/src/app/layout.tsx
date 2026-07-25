import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    /*
     * No height constraint on `html`/`body`: `globals.css` already gives the
     * body a `100dvh` minimum, and pinning both to 100% makes the modal's
     * `overflow: hidden` scroll lock clip page content instead of just
     * freezing it.
     */
    <html lang="vi" suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}

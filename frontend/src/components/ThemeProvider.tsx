"use client";

/**
 * CHUYỂN GIAO DIỆN SÁNG / TỐI
 *
 * Thay cho `next-themes`. Lý do duy nhất: `next-themes` lưu lựa chọn vào
 * `localStorage`, và hệ thống không dùng `localStorage` ở bất kỳ đâu.
 *
 * Dùng cookie hoá ra còn tốt hơn cho đúng bài toán này. `next-themes` phải chèn
 * một script chặn render vào `<head>` để đọc `localStorage` trước khi trang vẽ,
 * nếu không sẽ có một khung hình sáng trước khi nháy sang tối. Cookie thì root
 * layout — một server component — đọc được ngay, nên class `dark` có mặt trong
 * HTML đầu tiên gửi từ server. Không script, không nháy.
 *
 * Chỉ chế độ "theo hệ thống" cần tới JavaScript, vì server không biết
 * `prefers-color-scheme` của người xem.
 */

import React from "react";
import { writeCookie } from "@/lib/client-cookies";

export const THEME_COOKIE = "nova_theme";

export type ThemeSetting = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  /** Lựa chọn của người dùng, có thể là "system". */
  theme: ThemeSetting;
  /** Giao diện đang hiển thị thật — "system" đã được quy về sáng hoặc tối. */
  resolvedTheme: ResolvedTheme | undefined;
  setTheme: (next: ThemeSetting) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

/* ==========================================================================
   THEO DÕI `prefers-color-scheme`

   Dùng `useSyncExternalStore` chứ không phải `useState` + `useEffect`.

   Media query là một nguồn dữ liệu NGOÀI React: nó đổi khi người dùng đổi cài
   đặt hệ điều hành, không phải khi component render. Đọc nó bằng cách gọi
   `setState` trong effect gây thêm một lượt render mỗi lần mount và bị React
   cảnh báo đúng lý. `useSyncExternalStore` là API dành riêng cho đúng việc này,
   và nó còn giải quyết luôn bài toán SSR: `getServerSnapshot` trả `null` nghĩa
   là "server không biết", nên không có sai lệch hydration nào.
   ========================================================================== */

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribeSystemTheme(onChange: () => void): () => void {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

const getSystemDark = (): boolean => window.matchMedia(DARK_QUERY).matches;

/** Server không đọc được `prefers-color-scheme` của người xem. */
const getSystemDarkOnServer = (): null => null;

/** Đồng bộ class trên `<html>`. CSS dùng `.dark` (xem `globals.css`). */
function applyToDocument(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  // `color-scheme` để trình duyệt vẽ thanh cuộn và ô nhập theo đúng tông.
  root.style.colorScheme = resolved;
}

export function ThemeProvider({
  children,
  initialTheme = "system",
}: {
  children: React.ReactNode;
  /** Giá trị cookie mà server đã đọc được — tránh một lượt render sai tông. */
  initialTheme?: ThemeSetting;
}) {
  /* Khởi tạo từ giá trị server đọc được. Không đọc lại cookie ở client: cookie
     chính là thứ server vừa đọc, nên đọc lại chỉ thêm một lượt render. */
  const [theme, setThemeState] = React.useState<ThemeSetting>(initialTheme);

  const systemDark = React.useSyncExternalStore(
    subscribeSystemTheme,
    getSystemDark,
    getSystemDarkOnServer
  );

  /* `undefined` khi đang ở chế độ "system" mà chưa hydrate xong. Các nút chuyển
     giao diện đã xử lý trường hợp này bằng một ô giữ chỗ cùng kích thước, nên
     thanh công cụ không bị giật. */
  const resolvedTheme: ResolvedTheme | undefined =
    theme === "system" ? (systemDark === null ? undefined : systemDark ? "dark" : "light") : theme;

  /* Effect này CHỈ chạm vào DOM, không gọi `setState` — đúng thứ effect sinh ra
     để làm: đồng bộ React với một hệ thống bên ngoài. */
  React.useEffect(() => {
    if (resolvedTheme) applyToDocument(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = React.useCallback((next: ThemeSetting) => {
    writeCookie(THEME_COOKIE, next);
    setThemeState(next);
  }, []);

  const value = React.useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Cùng hình dạng với `useTheme` của `next-themes` để các nút chuyển không phải sửa. */
export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme phải được dùng bên trong <ThemeProvider>.");
  }
  return ctx;
}

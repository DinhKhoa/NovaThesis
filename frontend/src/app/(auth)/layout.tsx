/**
 * Auth Layout - No sidebar, minimal chrome.
 * Used for login, register, forgot-password, etc.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

import { ViewTransition } from "react";

/**
 * Auth layout — no sidebar, minimal chrome.
 *
 * These four screens (login, register, forgot, reset) are one task the user
 * gets bounced around inside, so they crossfade with the same `page`
 * transition as the rest of the app rather than hard-cutting.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ViewTransition default="page">{children}</ViewTransition>;
}

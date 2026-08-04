import { redirect } from "next/navigation";

/*
 * /login is no longer a page — signing in happens in a side panel over the
 * landing page. The route is kept as a redirect because plenty of things
 * still point at it: the verify-email and reset-password screens, the
 * signed-out sidebar, and any bookmark or email sent before the change.
 */
export default function LoginRedirect() {
	redirect("/?auth=login");
}

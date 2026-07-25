import { redirect } from "next/navigation";

/** See `app/login/page.tsx` — kept so existing links keep working. */
export default function RegisterRedirect() {
  redirect("/?auth=register");
}

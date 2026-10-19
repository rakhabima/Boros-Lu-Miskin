import { getSession } from "@/lib/session";
import { createConnectCode, isInsecure, isSameOrigin } from "@/lib/devices";
import { SHORTCUT_NAME } from "@/lib/branding";

/**
 * Logged-in browser on the iPhone taps "Connect" on /connect. We mint a
 * one-time code and bounce straight into the Shortcut with it as text input,
 * so nothing is copied or typed. Never log the Location header: it holds the code.
 */
export async function POST(req: Request) {
  if (isInsecure(req) || !isSameOrigin(req)) {
    return new Response("Forbidden", { status: 403 });
  }
  const user = await getSession();
  if (!user) {
    return new Response(null, { status: 303, headers: { Location: "/login?next=/connect" } });
  }

  const code = await createConnectCode(user.id);
  const url =
    `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}` +
    `&input=text&text=${encodeURIComponent(code)}`;
  return new Response(null, {
    status: 303,
    headers: { Location: url, "Cache-Control": "no-store" }
  });
}

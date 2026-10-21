import { getSession } from "@/lib/session";
import { syncOnboarding } from "@/lib/onboarding";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Polled by /connect on a laptop while the user finishes the iPhone step. */
export async function GET() {
  const user = await getSession();
  if (!user) return json({ error: "unauthorized" }, 401);
  const { sheets, iphone, completed } = await syncOnboarding(user.id);
  return json({ sheets, iphone, completed });
}

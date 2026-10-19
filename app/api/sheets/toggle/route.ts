import { getSession } from "@/lib/session";
import { isSameOrigin } from "@/lib/devices";
import { setSheetsMirror } from "@/lib/sheets";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new Response("Forbidden", { status: 403 });
  const user = await getSession();
  if (!user) return new Response(null, { status: 303, headers: { Location: "/login?next=/devices" } });
  const enabled = (await req.formData().catch(() => null))?.get("enabled") === "on";
  const ok = await setSheetsMirror(user.id, enabled);
  return new Response(null, {
    status: 303,
    headers: { Location: ok ? "/devices" : "/devices?sheets=connect_first" }
  });
}

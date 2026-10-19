import { getSession } from "@/lib/session";
import { isSameOrigin } from "@/lib/devices";
import { disconnectSheets } from "@/lib/sheets";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new Response("Forbidden", { status: 403 });
  const user = await getSession();
  if (!user) return new Response(null, { status: 303, headers: { Location: "/login?next=/devices" } });
  await disconnectSheets(user.id);
  return new Response(null, { status: 303, headers: { Location: "/devices?sheets=disconnected" } });
}

import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { config } from "@/lib/config";
import { getSession } from "@/lib/session";
import { connectFromCode } from "@/lib/sheets";
import { verifyState, SHEETS_STATE_COOKIE } from "@/lib/sheetsCore";

const back = (flag: string) =>
  new Response(null, { status: 303, headers: { Location: `/devices?sheets=${flag}` } });

export async function GET(req: NextRequest) {
  const user = await getSession();
  if (!user) return new Response(null, { status: 303, headers: { Location: "/login?next=/devices" } });

  const jar = await cookies();
  const cookie = jar.get(SHEETS_STATE_COOKIE)?.value;
  jar.set(SHEETS_STATE_COOKIE, "", { path: "/api/sheets", maxAge: 0 });

  const params = req.nextUrl.searchParams;
  if (!verifyState(cookie, params.get("state"), user.id, config.session.secret)) {
    return back("state_error");
  }
  if (params.get("error")) return back(params.get("error") === "access_denied" ? "denied" : "error");
  const code = params.get("code");
  if (!code) return back("error");

  try {
    return back(await connectFromCode(user.id, code));
  } catch (err) {
    console.error("[sheets] connect failed", err instanceof Error ? err.message : "error");
    return back("error");
  }
}

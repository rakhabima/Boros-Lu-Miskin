import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { config } from "@/lib/config";
import { getSession } from "@/lib/session";
import { connectFromCode } from "@/lib/sheets";
import { returnFromState } from "@/lib/onboardingCore";
import { verifyState, SHEETS_STATE_COOKIE } from "@/lib/sheetsCore";

const back = (flag: string, ret = "/devices") =>
  new Response(null, { status: 303, headers: { Location: `${ret}?sheets=${flag}` } });

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
  // The state is authentic now, so the return path inside it can be trusted.
  const ret = returnFromState(params.get("state"));
  if (params.get("error")) return back(params.get("error") === "access_denied" ? "denied" : "error", ret);
  const code = params.get("code");
  if (!code) return back("error", ret);

  try {
    return back(await connectFromCode(user.id, code), ret);
  } catch (err) {
    console.error("[sheets] connect failed", err instanceof Error ? err.message : "error");
    return back("error", ret);
  }
}

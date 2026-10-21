import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { config } from "@/lib/config";
import { getSession } from "@/lib/session";
import { authUrl, missingSheetsConfig } from "@/lib/sheets";
import { safeSheetsReturn, stateWithReturn } from "@/lib/onboardingCore";
import { signState, SHEETS_STATE_COOKIE } from "@/lib/sheetsCore";

const to = (location: string) => new Response(null, { status: 302, headers: { Location: location } });

/**
 * Starts the Sheets grant. `state` is tied to this user via a signed cookie.
 * `?return=/connect` (only /connect or /devices) says where the callback lands.
 */
export async function GET(req: NextRequest) {
  const ret = safeSheetsReturn(req.nextUrl.searchParams.get("return"));
  const user = await getSession();
  if (!user) return to(`/login?next=${ret}`);

  const missing = missingSheetsConfig();
  if (missing.length > 0) {
    console.error("[sheets] not configured, missing:", missing.join(", "));
    return to(`${ret}?sheets=not_configured`);
  }

  const state = stateWithReturn(randomBytes(32).toString("base64url"), ret);
  (await cookies()).set(SHEETS_STATE_COOKIE, signState(state, user.id, config.session.secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: config.session.isProd,
    path: "/api/sheets",
    maxAge: 600
  });
  return to(authUrl(state));
}

import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { config } from "@/lib/config";
import { getSession } from "@/lib/session";
import { authUrl, missingSheetsConfig } from "@/lib/sheets";
import { signState, SHEETS_STATE_COOKIE } from "@/lib/sheetsCore";

const to = (location: string) => new Response(null, { status: 302, headers: { Location: location } });

/** Starts the Sheets grant. `state` is tied to this user via a signed cookie. */
export async function GET() {
  const user = await getSession();
  if (!user) return to("/login?next=/devices");

  const missing = missingSheetsConfig();
  if (missing.length > 0) {
    console.error("[sheets] not configured, missing:", missing.join(", "));
    return to("/devices?sheets=not_configured");
  }

  const state = randomBytes(32).toString("base64url");
  (await cookies()).set(SHEETS_STATE_COOKIE, signState(state, user.id, config.session.secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: config.session.isProd,
    path: "/api/sheets",
    maxAge: 600
  });
  return to(authUrl(state));
}

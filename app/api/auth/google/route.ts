import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest } from "next/server";
import { config } from "@/lib/config";
import { safeNext } from "@/lib/validation";

export async function GET(req: NextRequest) {
  const state = randomBytes(16).toString("hex");
  const jar = await cookies();
  const opts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: config.session.isProd,
    path: "/",
    maxAge: 600
  };
  jar.set("oauth_state", state, opts);
  // Google only round-trips `state`, so the post-login target rides in a cookie.
  jar.set("oauth_next", safeNext(req.nextUrl.searchParams.get("next")), opts);

  const params = new URLSearchParams({
    client_id: config.auth.googleClientId,
    redirect_uri: `${config.origins.backend}/api/auth/google/callback`,
    response_type: "code",
    scope: "profile email",
    state
  });

  redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

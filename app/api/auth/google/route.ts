import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { config } from "@/lib/config";

export async function GET() {
  const state = randomBytes(16).toString("hex");
  (await cookies()).set("oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.session.isProd,
    path: "/",
    maxAge: 600
  });

  const params = new URLSearchParams({
    client_id: config.auth.googleClientId,
    redirect_uri: `${config.origins.backend}/api/auth/google/callback`,
    response_type: "code",
    scope: "profile email",
    state
  });

  redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

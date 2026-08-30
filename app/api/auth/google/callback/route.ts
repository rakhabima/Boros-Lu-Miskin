import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest } from "next/server";
import { config } from "@/lib/config";
import { pool } from "@/lib/db";
import { createSession } from "@/lib/session";

const USER_COLUMNS = "id, google_id, email, name, avatar_url";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");

  const jar = await cookies();
  const expected = jar.get("oauth_state")?.value;
  jar.delete("oauth_state");

  if (!code || !state || !expected || state !== expected) {
    redirect("/login?error=oauth");
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.auth.googleClientId,
      client_secret: config.auth.googleClientSecret,
      redirect_uri: `${config.origins.backend}/api/auth/google/callback`,
      grant_type: "authorization_code"
    })
  });
  if (!tokenRes.ok) {
    console.error("[OAUTH] token exchange failed", tokenRes.status);
    redirect("/login?error=oauth");
  }
  const { access_token } = await tokenRes.json();

  const profileRes = await fetch(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    { headers: { Authorization: `Bearer ${access_token}` } }
  );
  if (!profileRes.ok) {
    console.error("[OAUTH] profile fetch failed", profileRes.status);
    redirect("/login?error=oauth");
  }
  const profile = await profileRes.json();

  const googleId: string = profile.id;
  const email: string | null = profile.email ? String(profile.email).toLowerCase() : null;
  const name: string = profile.name || "Unknown";
  const avatarUrl: string | null = profile.picture || null;

  // Branch 1: known Google account.
  const existing = await pool.query(
    `SELECT ${USER_COLUMNS} FROM users WHERE google_id = $1`,
    [googleId]
  );
  let userId: number | undefined = existing.rows[0]?.id;

  // Branch 2: same email registered with a password — link the Google id.
  // Only link a Google identity onto an EXISTING account when Google says the
  // address is verified. Without this, someone holding a Google account with an
  // unverified address equal to a real user's could attach themselves to it.
  // An unverified address can still create a NEW account below.
  if (!userId && email && profile.verified_email) {
    const byEmail = await pool.query(
      `SELECT id FROM users WHERE LOWER(email) = $1`,
      [email]
    );
    if (byEmail.rows.length > 0) {
      const linked = await pool.query(
        `UPDATE users SET google_id = $1, avatar_url = COALESCE($2, avatar_url)
         WHERE id = $3 RETURNING ${USER_COLUMNS}`,
        [googleId, avatarUrl, byEmail.rows[0].id]
      );
      userId = linked.rows[0].id;
    }
  }

  // Branch 3: brand new user.
  if (!userId) {
    const created = await pool.query(
      `INSERT INTO users (google_id, email, name, avatar_url)
       VALUES ($1, $2, $3, $4) RETURNING ${USER_COLUMNS}`,
      [googleId, email, name, avatarUrl]
    );
    userId = created.rows[0].id;
  }

  await createSession(userId!);
  redirect("/");
}

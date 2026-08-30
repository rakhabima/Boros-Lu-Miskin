"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { pool } from "@/lib/db";
import { createSession, destroySession } from "@/lib/session";
import { checkAuthRateLimit, pruneRateLimits } from "@/lib/rateLimit";

export type AuthState = { error?: string };

const USER_COLUMNS = "id, google_id, email, name, avatar_url";

export async function signUp(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const name = String(formData.get("name") || "").trim();

  if (!email || !password || !name) {
    return { error: "Missing required fields" };
  }
  if (password.length < 8) {
    return { error: "Password too short (minimum 8 characters)" };
  }

  const rate = await checkAuthRateLimit(email);
  if (!rate.allowed) {
    return { error: "Too many attempts. Try again in a few minutes." };
  }

  const existing = await pool.query(
    `SELECT ${USER_COLUMNS}, password_hash FROM users WHERE LOWER(email) = $1`,
    [email]
  );

  if (existing.rows.length > 0) {
    if (existing.rows[0].password_hash) {
      return { error: "Email already registered" };
    }
    // Google-only account claiming a password — link, do not duplicate.
    const hash = await bcrypt.hash(password, 12);
    const updated = await pool.query(
      `UPDATE users SET password_hash = $1, name = $2 WHERE id = $3
       RETURNING ${USER_COLUMNS}`,
      [hash, name, existing.rows[0].id]
    );
    await createSession(updated.rows[0].id);
    redirect("/");
  }

  const hash = await bcrypt.hash(password, 12);
  const created = await pool.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
     RETURNING ${USER_COLUMNS}`,
    [email, name, hash]
  );
  await createSession(created.rows[0].id);
  redirect("/");
}

export async function signIn(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    return { error: "Missing required fields" };
  }

  const rate = await checkAuthRateLimit(email);
  if (!rate.allowed) {
    return { error: "Too many attempts. Try again in a few minutes." };
  }

  const result = await pool.query(
    `SELECT ${USER_COLUMNS}, password_hash FROM users WHERE LOWER(email) = $1`,
    [email]
  );

  if (result.rows.length === 0 || !result.rows[0].password_hash) {
    return { error: "Invalid email or password" };
  }
  const ok = await bcrypt.compare(password, result.rows[0].password_hash);
  if (!ok) {
    return { error: "Invalid email or password" };
  }

  await createSession(result.rows[0].id);
  redirect("/");
}

export async function signOut(): Promise<void> {
  await pruneRateLimits();
  await destroySession();
  redirect("/login");
}

"use server";

import { redirect } from "next/navigation";
import { destroySession } from "@/lib/session";
import { pruneRateLimits } from "@/lib/rateLimit";

// Google is the only way to sign in (app/api/auth/google). The password
// sign-in/sign-up actions were removed; users.password_hash is kept, unused.
export async function signOut(): Promise<void> {
  await pruneRateLimits();
  await destroySession();
  redirect("/login");
}

"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthState } from "@/actions/auth";
import { APP_LOGO, APP_NAME } from "@/lib/branding";

export function AuthCard() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const action = mode === "signup" ? signUp : signIn;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    action,
    {}
  );

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6">
      <h1 className="text-2xl font-semibold mb-2 flex items-center gap-2">
        <span role="img" aria-label="Money with wings">
          {APP_LOGO}
        </span>
        {APP_NAME}
      </h1>
      <p className="text-sm text-neutral-600 mb-4">
        Masih boros in this economy?!?!?!?
      </p>
      <div className="flex flex-col gap-4">
        <div className="flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`rounded-md border px-3 py-2 ${
              mode === "login"
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`rounded-md border px-3 py-2 ${
              mode === "signup"
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300"
            }`}
          >
            Sign up
          </button>
        </div>

        <form action={formAction} className="grid gap-2">
          {mode === "signup" && (
            <input
              type="text"
              placeholder="Name"
              name="name"
              className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/20"
              required
            />
          )}
          <input
            type="email"
            placeholder="Email"
            name="email"
            className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/20"
            required
          />
          <input
            type="password"
            placeholder="Password (min 8 characters)"
            name="password"
            className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/20"
            required
            minLength={8}
          />
          {state.error && (
            <div className="text-sm text-red-600">{state.error}</div>
          )}
          <button
            type="submit"
            disabled={pending}
            className="h-10 rounded-md border border-neutral-900 bg-neutral-900 text-sm font-medium text-white transition hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-neutral-900/30 disabled:opacity-60"
          >
            {mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>

        <div className="flex items-center gap-3 text-xs text-neutral-400">
          <span className="h-px flex-1 bg-neutral-200" />
          or
          <span className="h-px flex-1 bg-neutral-200" />
        </div>

        <a
          href="/api/auth/google"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900/20"
          aria-label="Continue with Google"
        >
          <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 48 48">
            <path
              fill="#FFC107"
              d="M43.6 20.5H42V20H24v8h11.3C33.9 32.5 29.4 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8.1 3.1l5.7-5.7C34.2 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c10.5 0 19-8.5 19-19 0-1.3-.1-2.1-.4-3.5z"
            />
            <path
              fill="#FF3D00"
              d="M6.3 14.7l6.6 4.8C14.7 16.1 19 12 24 12c3.1 0 5.9 1.2 8.1 3.1l5.7-5.7C34.2 6.1 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"
            />
            <path
              fill="#4CAF50"
              d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.2C29.2 35.4 26.7 36 24 36c-5.4 0-9.9-3.4-11.5-8.1l-6.6 5.1C9.2 39.7 16.1 44 24 44z"
            />
            <path
              fill="#1976D2"
              d="M43.6 20.5H42V20H24v8h11.3c-1.1 3-3.5 5.4-6.8 6.6l6.3 5.2C38.8 36 43 30.6 43 24c0-1.3-.1-2.1-.4-3.5z"
            />
          </svg>
          Continue with Google
        </a>
      </div>
    </div>
  );
}

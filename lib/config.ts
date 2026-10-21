import { gateEnabledFrom } from "./onboardingCore";

const required = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  // The Google OAuth redirect_uri is built from this. Unset on Vercel, it
  // silently becomes a relative path and Google rejects the callback.
  "BACKEND_ORIGIN",
  "SESSION_SECRET",
  "DB_USER",
  "DB_PASSWORD"
];

// DATABASE_URL supersedes the discrete DB_* vars (Neon/Supabase style).
const missing = process.env.DATABASE_URL
  ? required.filter((key) => (key.startsWith("DB_") ? false : !process.env[key]))
  : required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  throw new Error(`Missing required env vars: ${missing.join(", ")}`);
}

const shortcutInstallUrl = process.env.SHORTCUT_INSTALL_URL || "";
const gateRequested = process.env.ONBOARDING_GATE_ENABLED === "true";
// A gate with no Shortcut to install would lock every new user out for good.
if (gateRequested && !shortcutInstallUrl) {
  console.warn("[onboarding] ONBOARDING_GATE_ENABLED=true but SHORTCUT_INSTALL_URL is empty: gate stays OFF");
}

export const config = {
  db: {
    user: process.env.DB_USER as string,
    host: process.env.DB_HOST || "localhost",
    name: process.env.DB_NAME || "expense_tracker",
    password: process.env.DB_PASSWORD as string,
    port: Number(process.env.DB_PORT || 5432)
  },
  auth: {
    googleClientId: process.env.GOOGLE_CLIENT_ID as string,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET as string
  },
  ai: {
    apiKey: process.env.OPENROUTER_API_KEY || "",
    model: process.env.OPENROUTER_MODEL || "openrouter/free",
    baseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    siteUrl: process.env.OPENROUTER_SITE_URL || "",
    siteName: process.env.OPENROUTER_SITE_NAME || ""
  },
  // Receipt reader (9router, OpenAI-compatible). Separate from OpenRouter,
  // which stays for AI Insights only.
  vision: {
    // Base URL ending in /v1; /chat/completions is appended. Server-only.
    baseUrl: (process.env.NINEROUTER_BASE_URL || "").replace(/\/+$/, ""),
    key: process.env.NINEROUTER_API_KEY || "",
    model: process.env.NINEROUTER_MODEL || "parse-struk",
    dailyCap: Number(process.env.RECEIPT_DAILY_CAP || 50),
    hourlyLimit: Number(process.env.RECEIPT_HOURLY_LIMIT || 30)
  },
  sheets: {
    // Per-user OAuth mirror. Checked on first use (missingSheetsConfig), not
    // at startup, so the app still runs where Sheets is not set up.
    redirectUri: process.env.SHEETS_OAUTH_REDIRECT_URI || "",
    encKey: process.env.SHEETS_TOKEN_ENC_KEY || "",
    // Legacy shared Apps Script webhook, only for these (lowercased) emails.
    webhookUrl: process.env.SHEETS_WEBHOOK_URL || "",
    secret: process.env.SHEETS_WEBHOOK_SECRET || "",
    legacyEmails: (process.env.SHEETS_LEGACY_WEBHOOK_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
    // Tests only: send every Google API call to a local mock. Never in production.
    googleMockUrl:
      process.env.NODE_ENV === "production" ? "" : process.env.GOOGLE_API_MOCK_URL || ""
  },
  shortcutInstallUrl,
  onboarding: { gateEnabled: gateEnabledFrom(process.env.ONBOARDING_GATE_ENABLED, shortcutInstallUrl) },
  // Public origin for the /connect QR code; falls back to the request origin.
  appBaseUrl: (process.env.APP_BASE_URL || "").replace(/\/+$/, ""),
  session: {
    secret: process.env.SESSION_SECRET as string,
    isProd: process.env.NODE_ENV === "production",
    ttlSeconds: Number(process.env.SESSION_TTL_SECONDS || 60 * 60 * 24 * 14)
  },
  origins: {
    frontend: process.env.FRONTEND_ORIGIN || "",
    backend: process.env.BACKEND_ORIGIN || ""
  }
};

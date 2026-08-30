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

import dotenv from "dotenv";

dotenv.config();

const required = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "SESSION_SECRET"];

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(`Missing required env vars: ${missing.join(", ")}`);
}

export const config = {
  db: {
    user: process.env.DB_USER || "rakhabimaaryasambarana",
    host: process.env.DB_HOST || "localhost",
    name: process.env.DB_NAME || "expense_tracker",
    password: process.env.DB_PASSWORD || "12345",
    port: Number(process.env.DB_PORT || 5432)
  },
  auth: {
    googleClientId: process.env.GOOGLE_CLIENT_ID as string,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET as string
  },
  ai: {
    apiKey: process.env.OPENROUTER_API_KEY || "",
    model:
      process.env.OPENROUTER_MODEL ||
      "liquid/lfm-2.5-1.2b-thinking:free",
    baseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    siteUrl: process.env.OPENROUTER_SITE_URL || "",
    siteName: process.env.OPENROUTER_SITE_NAME || ""
  },
  session: {
    secret: process.env.SESSION_SECRET as string,
    isProd: process.env.NODE_ENV === "production"
  },
  origins: {
    frontend: process.env.FRONTEND_ORIGIN || "",
    backend: process.env.BACKEND_ORIGIN || ""
  }
};

import express from "express";
import { randomUUID } from "crypto";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import session from "express-session";
import passport from "passport";
import { doubleCsrf } from "csrf-csrf";
import { config } from "./config.js";
import { configurePassport } from "./auth/passport.js";
import { sessionStore } from "./sessionStore.js";
import { authLimiter, insightsLimiter } from "./middleware/rateLimit.js";
import { authRouter } from "./routes/auth.js";
import { expensesRouter } from "./routes/expenses.js";
import { insightsRouter } from "./routes/insights.js";
import { integrationsRouter } from "./routes/integrations.js";
import { errorHandler } from "./middleware/error.js";

const app = express();

const normalizeOrigin = (origin: string) => origin.replace(/\/$/, "");

// Same-origin in production (frontend and API share the Vercel domain), so the
// allowlist only ever needs the local dev frontend.
const allowedOrigins = new Set<string>(
  [
    ...(config.session.isProd ? [] : ["http://localhost:5173"]),
    ...config.origins.frontend.split(",").map((origin) => origin.trim())
  ]
    .filter(Boolean)
    .map(normalizeOrigin)
);

app.use(helmet());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(normalizeOrigin(origin))) return callback(null, true);
      console.warn("[CORS] blocked origin", { origin });
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true
  })
);
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  next();
});

// Behind Vercel/Nginx TLS termination, trust X-Forwarded-* headers.
app.set("trust proxy", 1);

app.use(
  session({
    secret: config.session.secret,
    proxy: true,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: config.session.isProd,
      maxAge: config.session.ttlSeconds * 1000
    }
  })
);

configurePassport();
app.use(passport.initialize());
app.use(passport.session());

// CSRF: double-submit cookie. The Telegram webhook is exempt because it is
// called by Telegram, not a browser, and authenticates via its secret header.
const { doubleCsrfProtection } = doubleCsrf({
  getSecret: () => config.session.secret,
  getSessionIdentifier: (req) => req.sessionID || "",
  cookieName: config.session.isProd ? "__Host-csrf" : "csrf",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: config.session.isProd,
    path: "/"
  },
  getCsrfTokenFromRequest: (req) => req.headers["x-csrf-token"],
  skipCsrfProtection: (req) =>
    req.path.startsWith("/integrations/telegram/webhook") ||
    req.path.startsWith("/auth/google")
});

app.use(doubleCsrfProtection);

app.use("/auth/login", authLimiter);
app.use("/auth/signup", authLimiter);
app.use("/insights", insightsLimiter);

app.use("/auth", authRouter);
app.use("/expenses", expensesRouter);
app.use("/insights", insightsRouter);
app.use("/integrations", integrationsRouter);

app.use(errorHandler);

export { app };

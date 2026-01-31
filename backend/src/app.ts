import express from "express";
import { randomUUID } from "crypto";
import cors from "cors";
import session from "express-session";
import passport from "passport";
import csrf from "csurf";
import RedisStore from "connect-redis";
import { createClient as createRedisClient } from "redis";
import { config } from "./config.js";
import { configurePassport } from "./auth/passport.js";
import { authRouter } from "./routes/auth.js";
import { expensesRouter } from "./routes/expenses.js";
import { insightsRouter } from "./routes/insights.js";
import { integrationsRouter } from "./routes/integrations.js";
import { errorHandler } from "./middleware/error.js";

const app = express();

const normalizeOrigin = (origin: string) => origin.replace(/\/$/, "");

const explicitAllowedOrigins = ["https://no-boros.rakhbim-project.my.id"];
const rawAllowedOrigins = config.origins.frontend
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)
  .map(normalizeOrigin)
  .filter((origin) => !origin.includes("localhost") && !origin.includes("127.0.0.1"));

const allowedOrigins = new Set<string>([
  ...explicitAllowedOrigins.map(normalizeOrigin),
  ...rawAllowedOrigins
]);

// Redis session store
const redisClient = createRedisClient({ url: config.redis.url });
redisClient.connect().catch((err) => {
  console.error("[REDIS] connection error", err);
});
const redisStore = new RedisStore({
  client: redisClient,
  ttl: config.session.ttlSeconds
});

console.log("[CONFIG] origins", {
  frontend: config.origins.frontend,
  backend: config.origins.backend,
  cors_allowlist: Array.from(allowedOrigins)
});

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, true);
      console.error("[CORS] blocked origin", {
        origin,
        allowed: Array.from(allowedOrigins)
      });
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true
  })
);
app.use(express.json());

app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  console.log("[REQUEST] start", {
    request_id: req.requestId,
    method: req.method,
    path: req.path
  });
  next();
});

const isHttps =
  config.origins.frontend.startsWith("https://") &&
  config.origins.backend.startsWith("https://");

// Behind Nginx TLS termination, trust X-Forwarded-* headers for secure cookies.
app.set("trust proxy", 1);

app.use(
  session({
    secret: config.session.secret,
    proxy: true,
    resave: false,
    saveUninitialized: false,
    store: redisStore,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: true
    }
  })
);

app.use((req, res, next) => {
  console.log("[SESSION DEBUG] request", {
    sessionID: req.sessionID,
    session: req.session,
    cookieHeader: req.headers.cookie,
    secure: req.secure,
    forwardedProto: req.headers["x-forwarded-proto"]
  });
  next();
});

configurePassport();
app.use(passport.initialize());
app.use(passport.session());

// CSRF protection for browser routes (exclude Telegram webhooks and public auth)
const csrfProtection = csrf();
const csrfExemptPaths = [
  /^\/integrations\/telegram\/?/,
  /^\/auth\/google/,
  /^\/auth\/google\/callback/,
  /^\/auth\/login/,
  /^\/auth\/signup/
];

app.use((req, res, next) => {
  if (csrfExemptPaths.some((rx) => rx.test(req.path))) return next();
  // Allow safe methods without token
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return csrfProtection(req, res, next);
  return csrfProtection(req, res, next);
});

app.use("/auth", authRouter);
app.use("/expenses", expensesRouter);
app.use("/insights", insightsRouter);
app.use("/integrations", integrationsRouter);

app.use(errorHandler);

export { app };

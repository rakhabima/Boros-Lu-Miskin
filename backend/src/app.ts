import express from "express";
import cors from "cors";
import session from "express-session";
import passport from "passport";
import { config } from "./config.js";
import { configurePassport } from "./auth/passport.js";
import { authRouter } from "./routes/auth.js";
import { expensesRouter } from "./routes/expenses.js";
import { insightsRouter } from "./routes/insights.js";
import { errorHandler } from "./middleware/error.js";

const app = express();

const normalizeOrigin = (origin: string) => origin.replace(/\/$/, "");

const rawAllowedOrigins = config.origins.frontend
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)
  .map(normalizeOrigin);

const allowedOrigins = new Set<string>();

for (const origin of rawAllowedOrigins) {
  allowedOrigins.add(origin);
  if (origin.startsWith("http://")) {
    if (origin.endsWith(":80")) {
      allowedOrigins.add(origin.replace(/:80$/, ""));
    } else if (!origin.includes(":", "http://".length)) {
      allowedOrigins.add(`${origin}:80`);
    }
  }
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true
  })
);
app.use(express.json());

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
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isHttps
    }
  })
);

configurePassport();
app.use(passport.initialize());
app.use(passport.session());

app.use("/auth", authRouter);
app.use("/expenses", expensesRouter);
app.use("/insights", insightsRouter);

app.use(errorHandler);

export { app };

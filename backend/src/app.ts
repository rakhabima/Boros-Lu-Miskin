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

app.use(
  cors({
    origin: config.origins.frontend,
    credentials: true
  })
);
app.use(express.json());

app.use(
  session({
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: config.session.isProd
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

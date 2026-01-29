import { Router, type Request, type Response, type NextFunction } from "express";
import passport from "passport";
import bcrypt from "bcryptjs";
import { pool } from "../db.js";
import { config } from "../config.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { respondError, respondSuccess } from "../utils/response.js";

export const authRouter = Router();

authRouter.get(
  "/google",
  (req: Request, res: Response, next: NextFunction) => {
    console.log("[OAUTH DEBUG] /auth/google start", {
      request_id: req.requestId,
      origin: req.headers.origin,
      host: req.headers.host,
      userAgent: req.headers["user-agent"]
    });
    next();
  },
  passport.authenticate("google", { scope: ["profile", "email"] })
);

authRouter.get(
  "/google/callback",
  (req: Request, res: Response, next: NextFunction) => {
    console.log("[OAUTH DEBUG] /auth/google/callback start", {
      request_id: req.requestId,
      origin: req.headers.origin,
      host: req.headers.host,
      queryKeys: Object.keys(req.query || {}),
      hasCode: typeof req.query?.code === "string"
    });
    next();
  },
  passport.authenticate("google", {
    failureRedirect: `${config.origins.frontend}/login?error=oauth`
  }),
  (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.id && req.session) {
      req.session.userId = req.user.id;
      return req.session.save((err) => {
        if (err) return next(err);
        res.redirect(config.origins.frontend);
      });
    }
    res.redirect(config.origins.frontend);
  }
);

authRouter.post("/logout", (req: Request, res: Response, next: NextFunction) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      respondSuccess(res, req, {
        code: "AUTH_LOGOUT_SUCCESS",
        message: "User logged out successfully",
        data: { ok: true },
        authenticated: false
      });
    });
  });
});

authRouter.get("/me", async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user && req.session?.userId) {
    try {
      const result = await pool.query(
        `SELECT id, google_id, email, name, avatar_url FROM users WHERE id = $1`,
        [req.session.userId]
      );
      if (result.rows.length > 0) {
        req.user = result.rows[0];
      }
    } catch (err) {
      return next(err);
    }
  }

  if (!req.user) {
    console.log("[SESSION DEBUG] /auth/me unauthorized", {
      request_id: req.requestId,
      sessionID: req.sessionID,
      session: req.session,
      user: req.user
    });
    return respondError(res, req, {
      status: 401,
      code: "AUTH_ME_UNAUTHORIZED",
      message: "No authenticated user found for this session",
      details: { session_id: req.sessionID },
      authenticated: false
    });
  }
  console.log("[SESSION DEBUG] /auth/me authorized", {
    request_id: req.requestId,
    sessionID: req.sessionID,
    session: req.session,
    user: req.user
  });
  return respondSuccess(res, req, {
    code: "AUTH_ME_SUCCESS",
    message: "Authenticated user found",
    data: { user: req.user },
    authenticated: true
  });
});

authRouter.post(
  "/signup",
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { email, password, name } = req.body;
    const missingFields = ["email", "password", "name"].filter(
      (field) => !req.body?.[field]
    );
    if (missingFields.length > 0) {
      return respondError(res, req, {
        status: 400,
        code: "AUTH_SIGNUP_VALIDATION_FAILED",
        message: "Missing required fields",
        details: { fields: missingFields },
        authenticated: false
      });
    }
    if (password.length < 8) {
      return respondError(res, req, {
        status: 400,
        code: "AUTH_SIGNUP_PASSWORD_TOO_SHORT",
        message: "Password too short",
        details: { field: "password", minLength: 8 },
        authenticated: false
      });
    }

    const existing = await pool.query(
      `SELECT id, google_id, email, name, avatar_url, password_hash
       FROM users
       WHERE email = $1`,
      [email]
    );

    if (existing.rows.length > 0) {
      if (existing.rows[0].password_hash) {
        return respondError(res, req, {
          status: 409,
          code: "AUTH_EMAIL_IN_USE",
          message: "Email already registered",
          details: { field: "email" },
          authenticated: false
        });
      }

      const hash = await bcrypt.hash(password, 10);
      const updated = await pool.query(
        `UPDATE users
         SET password_hash = $1, name = $2
         WHERE id = $3
         RETURNING id, google_id, email, name, avatar_url`,
        [hash, name, existing.rows[0].id]
      );

      return req.login(updated.rows[0], (err) => {
        if (err) return next(err);
        req.session.userId = updated.rows[0].id;
        req.session.save((saveErr) => {
          if (saveErr) return next(saveErr);
          respondSuccess(res, req, {
            code: "AUTH_SIGNUP_LINKED_SUCCESS",
            message: "Email account linked and logged in",
            data: { user: updated.rows[0] },
            authenticated: true
          });
        });
      });
    }

    const hash = await bcrypt.hash(password, 10);
    const created = await pool.query(
      `INSERT INTO users (email, name, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, google_id, email, name, avatar_url`,
      [email, name, hash]
    );

    return req.login(created.rows[0], (err) => {
      if (err) return next(err);
      req.session.userId = created.rows[0].id;
      req.session.save((saveErr) => {
        if (saveErr) return next(saveErr);
        respondSuccess(res, req, {
          code: "AUTH_SIGNUP_SUCCESS",
          message: "User signed up successfully",
          data: { user: created.rows[0] },
          authenticated: true
        });
      });
    });
  })
);

authRouter.post(
  "/login",
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    console.log("[SESSION DEBUG] /auth/login before", {
      request_id: req.requestId,
      sessionID: req.sessionID,
      session: req.session
    });
    const { email, password } = req.body;
    const missingFields = ["email", "password"].filter(
      (field) => !req.body?.[field]
    );
    if (missingFields.length > 0) {
      return respondError(res, req, {
        status: 400,
        code: "AUTH_LOGIN_VALIDATION_FAILED",
        message: "Missing required fields",
        details: { fields: missingFields },
        authenticated: false
      });
    }

    const result = await pool.query(
      `SELECT id, google_id, email, name, avatar_url, password_hash
       FROM users
       WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0 || !result.rows[0].password_hash) {
      return respondError(res, req, {
        status: 401,
        code: "AUTH_LOGIN_INVALID_CREDENTIALS",
        message: "Invalid email or password",
        details: { field: "email" },
        authenticated: false
      });
    }

    const ok = await bcrypt.compare(password, result.rows[0].password_hash);
    if (!ok) {
      return respondError(res, req, {
        status: 401,
        code: "AUTH_LOGIN_INVALID_CREDENTIALS",
        message: "Invalid email or password",
        details: { field: "password" },
        authenticated: false
      });
    }

    const user = {
      id: result.rows[0].id,
      google_id: result.rows[0].google_id,
      email: result.rows[0].email,
      name: result.rows[0].name,
      avatar_url: result.rows[0].avatar_url
    };

    return req.login(user, (err) => {
      if (err) return next(err);
      req.session.userId = user.id;
      req.session.save((saveErr) => {
        if (saveErr) return next(saveErr);
        console.log("[SESSION DEBUG] /auth/login after", {
          request_id: req.requestId,
          sessionID: req.sessionID,
          session: req.session
        });
        respondSuccess(res, req, {
          code: "AUTH_LOGIN_SUCCESS",
          message: "User logged in successfully",
          data: { user },
          authenticated: true
        });
      });
    });
  })
);

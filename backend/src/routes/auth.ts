import { Router, type Request, type Response, type NextFunction } from "express";
import passport from "passport";
import bcrypt from "bcryptjs";
import { pool } from "../db.js";
import { config } from "../config.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const authRouter = Router();

authRouter.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

authRouter.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${config.origins.frontend}/login?error=oauth`
  }),
  (req: Request, res: Response) => {
    res.redirect(config.origins.frontend);
  }
);

authRouter.post("/logout", (req: Request, res: Response, next: NextFunction) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ ok: true });
    });
  });
});

authRouter.get("/me", (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  res.json(req.user);
});

authRouter.post(
  "/signup",
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: "email, password, name required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "password too short" });
    }

    const existing = await pool.query(
      `SELECT id, google_id, email, name, avatar_url, password_hash
       FROM users
       WHERE email = $1`,
      [email]
    );

    if (existing.rows.length > 0) {
      if (existing.rows[0].password_hash) {
        return res.status(409).json({ error: "email already registered" });
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
        res.json(updated.rows[0]);
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
      res.json(created.rows[0]);
    });
  })
);

authRouter.post(
  "/login",
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "email and password required" });
    }

    const result = await pool.query(
      `SELECT id, google_id, email, name, avatar_url, password_hash
       FROM users
       WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0 || !result.rows[0].password_hash) {
      return res.status(401).json({ error: "invalid credentials" });
    }

    const ok = await bcrypt.compare(password, result.rows[0].password_hash);
    if (!ok) {
      return res.status(401).json({ error: "invalid credentials" });
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
      res.json(user);
    });
  })
);

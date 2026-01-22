import express from "express";
import cors from "cors";
import session from "express-session";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import bcrypt from "bcryptjs";
import { pool } from "./db.js";

const app = express();
const frontendOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
const backendOrigin = process.env.BACKEND_ORIGIN || "http://localhost:4000";

app.use(
    cors({
        origin: frontendOrigin,
        credentials: true
    })
);
app.use(express.json());

app.use(
    session({
        secret: process.env.SESSION_SECRET || "change-me",
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production"
        }
    })
);

app.use(passport.initialize());
app.use(passport.session());

const asyncHandler = (handler) => (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);

passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID || "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
            callbackURL: `${backendOrigin}/auth/google/callback`
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                const googleId = profile.id;
                const email = profile.emails?.[0]?.value || null;
                const name = profile.displayName || "Unknown";
                const avatarUrl = profile.photos?.[0]?.value || null;

                const existing = await pool.query(
                    `SELECT id, google_id, email, name, avatar_url
                     FROM users
                     WHERE google_id = $1`,
                    [googleId]
                );

                if (existing.rows.length > 0) {
                    return done(null, existing.rows[0]);
                }

                if (email) {
                    const byEmail = await pool.query(
                        `SELECT id, google_id, email, name, avatar_url
                         FROM users
                         WHERE email = $1`,
                        [email]
                    );

                    if (byEmail.rows.length > 0) {
                        const linked = await pool.query(
                            `UPDATE users
                             SET google_id = $1, avatar_url = COALESCE($2, avatar_url)
                             WHERE id = $3
                             RETURNING id, google_id, email, name, avatar_url`,
                            [googleId, avatarUrl, byEmail.rows[0].id]
                        );
                        return done(null, linked.rows[0]);
                    }
                }

                const created = await pool.query(
                    `INSERT INTO users (google_id, email, name, avatar_url)
                     VALUES ($1, $2, $3, $4)
                     RETURNING id, google_id, email, name, avatar_url`,
                    [googleId, email, name, avatarUrl]
                );

                return done(null, created.rows[0]);
            } catch (err) {
                return done(err);
            }
        }
    )
);

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const result = await pool.query(
            `SELECT id, google_id, email, name, avatar_url FROM users WHERE id = $1`,
            [id]
        );
        done(null, result.rows[0] || null);
    } catch (err) {
        done(err);
    }
});

const requireAuth = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    next();
};

app.get(
    "/auth/google",
    passport.authenticate("google", { scope: ["profile", "email"] })
);

app.get(
    "/auth/google/callback",
    passport.authenticate("google", {
        failureRedirect: `${frontendOrigin}/login?error=oauth`
    }),
    (req, res) => {
        res.redirect(frontendOrigin);
    }
);

app.post("/auth/logout", (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        req.session.destroy(() => {
            res.clearCookie("connect.sid");
            res.json({ ok: true });
        });
    });
});

app.get("/auth/me", (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    res.json(req.user);
});

app.post("/auth/signup", asyncHandler(async (req, res, next) => {
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
}));

app.post("/auth/login", asyncHandler(async (req, res, next) => {
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
}));

/**
 * Create expense
 */
app.post("/expenses", requireAuth, asyncHandler(async (req, res) => {
    const { amount, category, notes } = req.body;

    if (!amount || !category) {
        return res.status(400).json({ error: "amount and category are required" });
    }

    const result = await pool.query(
        `INSERT INTO expenses (amount, category, notes, user_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
        [amount, category, notes || null, req.user.id]
    );

    res.json(result.rows[0]);
}));

/**
 * Get all expenses (most recent first)
 */
app.get("/expenses", requireAuth, asyncHandler(async (req, res) => {
    const result = await pool.query(
        `SELECT id, amount, category, notes, created_at
     FROM expenses
     WHERE user_id = $1
     ORDER BY created_at DESC`,
        [req.user.id]
    );
    res.json(result.rows);
}));

/**
 * Summary
 */
app.get("/summary", requireAuth, asyncHandler(async (req, res) => {
    const totalResult = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM expenses
         WHERE user_id = $1`,
        [req.user.id]
    );

    const byCategoryResult = await pool.query(
        `SELECT category, SUM(amount) AS total
     FROM expenses
     WHERE user_id = $1
     GROUP BY category`,
        [req.user.id]
    );

    res.json({
        total: totalResult.rows[0].total,
        byCategory: byCategoryResult.rows
    });
}));

/**
 * Delete expense
 */
app.delete("/expenses/:id", requireAuth, asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
        return res.status(400).json({ error: "invalid expense id" });
    }

    const result = await pool.query(
        `DELETE FROM expenses WHERE id = $1 AND user_id = $2 RETURNING *`,
        [id, req.user.id]
    );

    if (result.rows.length === 0) {
        return res.status(404).json({ error: "expense not found" });
    }

    res.json(result.rows[0]);
}));

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
});

app.listen(4000, () => {
    console.log("Backend running on http://localhost:4000");
});

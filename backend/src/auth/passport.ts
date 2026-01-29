import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { pool } from "../db.js";
import { config } from "../config.js";

export const configurePassport = () => {
  passport.use(
    new GoogleStrategy(
      {
        clientID: config.auth.googleClientId,
        clientSecret: config.auth.googleClientSecret,
        callbackURL: `${config.origins.backend}/auth/google/callback`
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          console.log("[OAUTH DEBUG] Google profile received", {
            id: profile.id,
            email: profile.emails?.[0]?.value || null,
            displayName: profile.displayName || null
          });
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

  passport.serializeUser((user: Express.User, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number | string, done) => {
    try {
      const result = await pool.query(
        `SELECT id, google_id, email, name, avatar_url FROM users WHERE id = $1`,
        [Number(id)]
      );
      done(null, result.rows[0] || null);
    } catch (err) {
      done(err);
    }
  });
};

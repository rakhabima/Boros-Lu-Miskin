-- Users table for Google OAuth identities
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  google_id TEXT UNIQUE,
  email TEXT UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE users
  ALTER COLUMN google_id DROP NOT NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Emails are matched case-insensitively (Gmail and friends ignore case), so
-- enforce uniqueness the same way and keep LOWER(email) lookups indexed.
-- Without this, Rakha@x.com and rakha@x.com would be two separate accounts.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx
  ON users (LOWER(email)) WHERE email IS NOT NULL;

-- Expenses table
CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  amount NUMERIC NOT NULL,
  category TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  user_id INTEGER REFERENCES users(id)
);

-- Add user ownership to expenses
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);

-- Every expense must have an owner. An ownerless row is invisible to every
-- query (they all filter by user_id) and undeletable through the API.
-- Applied 2026-08-30 after removing 11 pre-auth rows; see
-- orphaned-expenses-backup.sql for those rows.
ALTER TABLE expenses ALTER COLUMN user_id SET NOT NULL;

-- Track daily AI usage per user
CREATE TABLE IF NOT EXISTS ai_usage (
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);

-- Retained for its existing rows; the Telegram integration was removed in the
-- Next.js migration and no code reads this table. Drop it, or rebuild the
-- feature, at your discretion.
-- Telegram link codes for chat-to-account mapping
CREATE TABLE IF NOT EXISTS telegram_links (
  telegram_id BIGINT PRIMARY KEY,
  app_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  confirmed BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure existing column allows null before confirmation
ALTER TABLE telegram_links ALTER COLUMN app_user_id DROP NOT NULL;
ALTER TABLE telegram_links ALTER COLUMN expires_at DROP NOT NULL;

CREATE INDEX IF NOT EXISTS telegram_links_code_idx ON telegram_links (code);

-- Every expense query filters by owner; without this Postgres seq-scans.
CREATE INDEX IF NOT EXISTS expenses_user_id_created_at_idx
  ON expenses (user_id, created_at DESC);

-- Session store. This used to be created automatically by connect-pg-simple;
-- that dependency was removed in the Next.js migration, so it must be declared
-- here or a fresh database 500s on the first login. Column shape is kept
-- identical to connect-pg-simple's so existing rows keep working.
CREATE TABLE IF NOT EXISTS user_sessions (
  sid TEXT PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS user_sessions_expire_idx ON user_sessions (expire);

-- Fixed-window rate limit counters, shared across serverless instances.
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limits_expires_at_idx ON rate_limits (expires_at);

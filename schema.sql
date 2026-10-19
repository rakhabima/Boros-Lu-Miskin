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

-- iPhone Shortcut receipt capture. A device is a long-lived bearer token
-- minted by exchanging a single-use connect code; only SHA-256 hashes of either
-- are stored, so a DB leak does not leak working credentials.
CREATE TABLE IF NOT EXISTS devices (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS devices_user_id_idx ON devices (user_id);

CREATE TABLE IF NOT EXISTS device_connect_codes (
  code_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

-- One row per authenticated /api/receipts request. Never holds the image.
CREATE TABLE IF NOT EXISTS receipt_attempts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  error_code TEXT,
  model TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS receipt_attempts_user_id_created_at_idx
  ON receipt_attempts (user_id, created_at DESC);

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'web';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS dedupe_key TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS extraction JSONB;
-- Real insert time. created_at can be a past receipt date (noon Jakarta), so
-- "saved in the last 10 minutes" needs its own column.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS inserted_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE UNIQUE INDEX IF NOT EXISTS expenses_user_id_dedupe_key_idx
  ON expenses (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

-- One-tap connect (device-code flow). Codes are now consumed, not deleted,
-- so a conditional UPDATE can make single use race-safe. Tokens get a short
-- display prefix and a scope; the only scope today is receipts:create.
ALTER TABLE device_connect_codes ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ;
ALTER TABLE device_connect_codes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE devices ADD COLUMN IF NOT EXISTS token_prefix TEXT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'receipts:create';

-- Per-user opt-in: mirror receipt expenses to the Google Sheets webhook.
ALTER TABLE users ADD COLUMN IF NOT EXISTS sheets_mirror BOOLEAN NOT NULL DEFAULT FALSE;

-- Per-user Google Sheets mirror (separate OAuth grant, drive.file scope).
-- One connection per user. The refresh token is AES-256-GCM ciphertext
-- (iv + tag + ciphertext, key from SHEETS_TOKEN_ENC_KEY); no raw tokens.
-- Mirroring needs users.sheets_mirror AND a usable connection.
CREATE TABLE IF NOT EXISTS sheets_connections (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  google_email TEXT,
  spreadsheet_id TEXT NOT NULL,
  spreadsheet_url TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'needs_reconnect', 'error')),
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

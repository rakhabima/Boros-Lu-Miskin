-- Receipt feature (iPhone Shortcut -> /api/receipts), phase 1.
--
-- Adds:
--   tables   devices, device_connect_codes, receipt_attempts, sheets_connections
--   columns  expenses.source, needs_review, dedupe_key, device_id, extraction,
--            inserted_at
--            device_connect_codes.consumed_at, created_at
--            devices.token_prefix, scope
--            users.sheets_mirror
--   indexes  devices_user_id_idx, receipt_attempts_user_id_created_at_idx,
--            expenses_user_id_dedupe_key_idx (unique, partial)
--
-- Additive only: no DROP, no DELETE, no change to any existing column, and
-- telegram_links / ai_usage are not touched. The only pre-existing table that
-- gains a column is users (sheets_mirror, NOT NULL DEFAULT FALSE, no rewrite). Every statement is IF NOT EXISTS,
-- so running it twice is a no-op the second time.
--
-- Run once, all or nothing:
--   psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 \
--        -f migrations/2026-10-receipt-feature.sql
--
-- Locking: each ALTER on expenses takes a brief ACCESS EXCLUSIVE lock (the
-- NOT NULL DEFAULT columns use constant/stable defaults, so Postgres 11+ adds
-- them without rewriting the table). The unique index is built non-concurrently
-- inside the transaction, blocking writes to expenses for the build; every
-- existing row has dedupe_key NULL, so the partial index is empty and the
-- build is instant. CONCURRENTLY is therefore unnecessary.

-- Fail fast instead of queueing all app traffic behind a long-running query.
-- SET LOCAL only takes effect inside a transaction (--single-transaction).
SET LOCAL lock_timeout = '5s';

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

-- Existing rows receive the defaults: source 'web', needs_review false,
-- inserted_at = migration time; the rest stay NULL.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'web';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS dedupe_key TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS extraction JSONB;
-- Real insert time; created_at can be a past receipt date. Used by the
-- "possible duplicate in the last 10 minutes" check.
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

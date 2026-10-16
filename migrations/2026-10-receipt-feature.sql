-- Receipt feature (iPhone Shortcut -> /api/receipts), phase 1.
--
-- Adds:
--   tables   devices, device_connect_codes, receipt_attempts
--   columns  expenses.source, needs_review, dedupe_key, device_id, extraction,
--            inserted_at
--   indexes  devices_user_id_idx, receipt_attempts_user_id_created_at_idx,
--            expenses_user_id_dedupe_key_idx (unique, partial)
--
-- Additive only: no DROP, no DELETE, no change to any existing column, and
-- telegram_links / ai_usage are not touched. Every statement is IF NOT EXISTS,
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

-- Mandatory onboarding gate (connect Google Sheets + iPhone before the dashboard).
--
-- Adds:
--   column  users.onboarding_completed_at TIMESTAMPTZ (NULL = not onboarded yet)
--
-- Every user that exists when the column is created is marked onboarded (now()),
-- so only accounts created afterwards are ever gated. The backfill sits in the
-- same IF NOT EXISTS branch as the ALTER: running the file again is a no-op and
-- never marks a new, still-unonboarded user as done.
--
-- Additive only: no DROP, no change to any existing column.
--
-- Run once, all or nothing:
--   psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 \
--        -f migrations/2026-10-onboarding-gate.sql
--
-- Check afterwards (expect 0):
--   SELECT count(*) FROM users WHERE onboarding_completed_at IS NULL;
-- The gate itself stays off until ONBOARDING_GATE_ENABLED=true.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'users' AND column_name = 'onboarding_completed_at'
  ) THEN
    ALTER TABLE users ADD COLUMN onboarding_completed_at TIMESTAMPTZ;
    UPDATE users SET onboarding_completed_at = NOW();
  END IF;
END $$;

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

-- Optional: backfill or enforce non-null once all expenses have owners
-- ALTER TABLE expenses ALTER COLUMN user_id SET NOT NULL;

-- Track daily AI usage per user
CREATE TABLE IF NOT EXISTS ai_usage (
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);

-- Telegram link codes for chat-to-account mapping
CREATE TABLE IF NOT EXISTS telegram_links (
  telegram_id BIGINT PRIMARY KEY,
  app_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL
  confirmed BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure existing column allows null before confirmation
ALTER TABLE telegram_links ALTER COLUMN app_user_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS telegram_links_code_idx ON telegram_links (code);

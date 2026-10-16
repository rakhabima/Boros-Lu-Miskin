# Receipt feature migration: production checklist

Files: `2026-10-receipt-feature.sql` (the change), `verify-receipt-feature.sql`
(read-only checks, safe before and after). `$DATABASE_URL` below means the
production **direct** (non-pooled) connection string. Schema changes and
`pg_dump` are best run outside the pooler.

## Order matters

**Migrate first, deploy second.** The new app code selects and writes
`expenses.needs_review`, so deploying it before the migration makes the
expenses page fail. The old code ignores the new columns, so running the
migration while the old code is live is safe.

## Steps

- [ ] **1. Backup.** Neon: create a branch (instant snapshot). Supabase: confirm
      a recent backup under Database → Backups. Plus a local dump:
      `pg_dump "$DATABASE_URL" -Fc -f backup-$(date +%F).dump`
- [ ] **2. Record "before".**
      `psql "$DATABASE_URL" -f migrations/verify-receipt-feature.sql > before.txt`
      (Sections 1, 2 and 4 will be empty or show `ok` blank; that is expected.)
- [ ] **3. Migrate.**
      `psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 -f migrations/2026-10-receipt-feature.sql`
      Expect `NOTICE ... skipping` only if something already existed. If it
      fails on `lock_timeout`, nothing was applied; rerun at a quieter moment.
- [ ] **4. Verify.**
      `psql "$DATABASE_URL" -f migrations/verify-receipt-feature.sql > after.txt`
      3 tables, 6 columns all `ok = t`, 3 indexes.
- [ ] **5. Compare counts.** `diff before.txt after.txt`. Section 5
      (expenses, users) must be identical.
- [ ] **6. Set env vars on Vercel** (`NINEROUTER_URL`, `NINEROUTER_KEY`,
      `NINEROUTER_MODEL`, `RECEIPT_DAILY_CAP`), then deploy the new code.

## Rollback

Only if you must. It **deletes all receipt data** (devices, attempts,
receipt metadata on expenses; the receipt expenses themselves stay as normal
rows). Redeploy the **old** app code first, or the expenses page breaks.
Every line is commented out on purpose: copy it into a file, uncomment
deliberately, and run with `--single-transaction -v ON_ERROR_STOP=1`.

Order: the index first, then the expenses columns (`device_id` references
`devices`), then the tables that reference `devices`, then `devices`.

```sql
-- DROP INDEX IF EXISTS expenses_user_id_dedupe_key_idx;
-- ALTER TABLE expenses DROP COLUMN IF EXISTS inserted_at;
-- ALTER TABLE expenses DROP COLUMN IF EXISTS extraction;
-- ALTER TABLE expenses DROP COLUMN IF EXISTS device_id;
-- ALTER TABLE expenses DROP COLUMN IF EXISTS dedupe_key;
-- ALTER TABLE expenses DROP COLUMN IF EXISTS needs_review;
-- ALTER TABLE expenses DROP COLUMN IF EXISTS source;
-- DROP TABLE IF EXISTS receipt_attempts;
-- DROP TABLE IF EXISTS device_connect_codes;
-- DROP TABLE IF EXISTS devices;
```

Do not touch `telegram_links`, `ai_usage` or anything else; this migration
did not create them. (Rows the receipt feature added to `ai_usage` and
`rate_limits` are harmless counters and can stay.)

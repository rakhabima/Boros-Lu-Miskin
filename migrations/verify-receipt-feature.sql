-- Read-only checks for 2026-10-receipt-feature.sql. Safe to run before and
-- after the migration (it only reads catalogs and counts rows).
--   psql "$DATABASE_URL" -f migrations/verify-receipt-feature.sql
BEGIN TRANSACTION READ ONLY;

\echo '--- 1. new tables (expect 3 rows)'
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('devices', 'device_connect_codes', 'receipt_attempts')
ORDER BY table_name;

\echo '--- 2. new expenses columns (expect 6 rows, all ok = t)'
WITH expected(column_name, data_type, is_nullable, column_default) AS (
  VALUES
    ('source',       'text',                     'NO',  '''web''::text'),
    ('needs_review', 'boolean',                  'NO',  'false'),
    ('dedupe_key',   'text',                     'YES', NULL),
    ('device_id',    'integer',                  'YES', NULL),
    ('extraction',   'jsonb',                    'YES', NULL),
    ('inserted_at',  'timestamp with time zone', 'NO',  'now()')
)
SELECT e.column_name,
       c.data_type, c.is_nullable, c.column_default,
       (c.data_type = e.data_type
        AND c.is_nullable = e.is_nullable
        AND c.column_default IS NOT DISTINCT FROM e.column_default) AS ok
FROM expected e
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public' AND c.table_name = 'expenses'
 AND c.column_name = e.column_name
ORDER BY e.column_name;

\echo '--- 3. all expenses columns (expect the 6 original + the 6 above, nothing else)'
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'expenses'
ORDER BY ordinal_position;

\echo '--- 4. indexes (expect 3 rows; the expenses one UNIQUE ... WHERE dedupe_key IS NOT NULL)'
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN ('expenses_user_id_dedupe_key_idx', 'devices_user_id_idx',
                    'receipt_attempts_user_id_created_at_idx')
ORDER BY indexname;

\echo '--- 5. row counts (compare before vs after; must be equal)'
SELECT (SELECT count(*) FROM expenses) AS expenses,
       (SELECT count(*) FROM users)    AS users;

ROLLBACK;

# Deploying Boros Lu Miskin to a VPS (no Docker)

Next.js app run by systemd, Postgres on the same machine, and Nginx or Caddy in
front for HTTPS. The domain's A record must already point to the VPS.

Needs: Node 20.9 or newer (22 recommended), Postgres, git, and Nginx or Caddy.

## 1. Postgres

Skip the install line if Postgres is already running on the VPS.

```bash
sudo apt install -y postgresql

# pick your own password, and use the same one in .env
sudo -u postgres psql -c "CREATE ROLE boros LOGIN PASSWORD 'change_me_long_random';"
sudo -u postgres createdb -O boros expense_tracker
```

## 2. Get the code and configure

```bash
git clone https://github.com/rakhabima/boros-lu-miskin.git
cd boros-lu-miskin

cp deploy/env.production.example .env
chmod 600 .env
nano .env        # secrets, DB password, and the domain everywhere

# create the tables (safe to run again, it is idempotent)
set -a; . ./.env; set +a
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
  -v ON_ERROR_STOP=1 -f schema.sql
```

`schema.sql` already contains every migration, so a fresh database needs only
this file.

## 3. Build and start

```bash
chmod +x deploy/*.sh
./deploy/deploy.sh                    # npm ci + build
sudo ./deploy/install-service.sh      # creates and starts the systemd service

curl -I http://127.0.0.1:3000/privacy
journalctl -u boros-lu-miskin -f      # logs
```

The service runs as the user who owns the project directory and listens on
127.0.0.1 only.

## 4. Reverse proxy and HTTPS

Pick one:

- Caddy: add `deploy/Caddyfile` to `/etc/caddy/Caddyfile`, then
  `sudo systemctl reload caddy`. Certificates are automatic.
- Nginx: use `deploy/nginx.conf`, then `sudo certbot --nginx -d boros.rakhbim-project.my.id`.

Keep the `Host`, `X-Forwarded-For` and `X-Forwarded-Proto` headers as in those
files: the app uses them for the CSRF origin check, the HTTPS-only receipt
endpoints and per-IP rate limits. If the domain sits behind Cloudflare's proxy,
rate limits will see Cloudflare's IP, because only the last `X-Forwarded-For`
entry is trusted. If `PORT` in `.env` is not 3000, change it in the proxy too.

## 5. Google OAuth

In Google Cloud Console, add to the OAuth client:

- `https://boros.rakhbim-project.my.id/api/auth/google/callback`
- `https://boros.rakhbim-project.my.id/api/sheets/callback`

## 6. Updating

```bash
./deploy/deploy.sh
```

It pulls, installs, rebuilds with the values from `.env` and restarts the
service. Rebuilding matters when you change `PRIVACY_CONTACT_EMAIL`, because
`/privacy` is prerendered.

`schema.sql` is not re-run on updates. When a release adds a file under
`migrations/`, apply it before running `deploy.sh`:

```bash
set -a; . ./.env; set +a
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
  --single-transaction -v ON_ERROR_STOP=1 -f migrations/<file>.sql
```

## 7. Backup

```bash
set -a; . ./.env; set +a
PGPASSWORD="$DB_PASSWORD" pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
  | gzip > backup-$(date +%F).sql.gz
```

Put that in a daily cron job and copy the files off the VPS.

## 8. Moving existing data from Neon or Supabase

Do this after step 2, before the first start. Use the old database's direct
(non-pooled) URL:

```bash
pg_dump "$OLD_DATABASE_URL" --no-owner --no-privileges --data-only -Fc -f old.dump
set -a; . ./.env; set +a
PGPASSWORD="$DB_PASSWORD" pg_restore -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
  --no-owner --data-only old.dump
```

Keep using the external database instead? Set `DATABASE_URL` in `.env` (the app
then forces SSL and a single connection) and skip step 1.

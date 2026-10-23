#!/usr/bin/env bash
# Install the systemd service for this checkout. Run once, after the first
# build:   sudo ./deploy/install-service.sh
#
# It runs the app as the user who owns the project directory (not root), using
# the node binary that user has on PATH. Set DRY_RUN=1 to print the unit
# instead of installing it.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_USER="${SERVICE_USER:-$(stat -c %U "$DIR")}"
NODE_BIN="${NODE_BIN:-$(sudo -u "$APP_USER" -i bash -lc 'command -v node' 2>/dev/null | tail -n1 || true)}"
NODE_BIN="${NODE_BIN:-$(command -v node || true)}"

if [ "$APP_USER" = "root" ]; then
  echo "Warning: the project directory is owned by root, so the service will run as root." >&2
  echo "Prefer a normal user (set SERVICE_USER=name and chown the directory)." >&2
fi

if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
  echo "Could not find node for user $APP_USER. Install Node 20.9+ (22 recommended)." >&2
  exit 1
fi
if [ ! -f "$DIR/.env" ]; then
  echo "Missing $DIR/.env" >&2
  exit 1
fi
if [ ! -d "$DIR/.next" ]; then
  echo "No build found. Run ./deploy/deploy.sh first." >&2
  exit 1
fi

UNIT="[Unit]
Description=Boros Lu Miskin (Next.js)
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$DIR
Environment=NODE_ENV=production
Environment=HOSTNAME=127.0.0.1
Environment=PORT=3000
Environment=TZ=Asia/Jakarta
EnvironmentFile=$DIR/.env
ExecStart=$NODE_BIN $DIR/node_modules/next/dist/bin/next start
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
"

if [ "${DRY_RUN:-0}" = "1" ]; then
  printf '%s' "$UNIT"
  exit 0
fi

printf '%s' "$UNIT" > /etc/systemd/system/boros-lu-miskin.service
systemctl daemon-reload
systemctl enable --now boros-lu-miskin
systemctl --no-pager --lines=5 status boros-lu-miskin || true

echo "Installed. Logs: journalctl -u boros-lu-miskin -f"

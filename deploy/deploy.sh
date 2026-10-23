#!/usr/bin/env bash
# Build and (re)start the app. Run from anywhere, as the user that owns the
# project directory:   ./deploy/deploy.sh
#
# Needs .env in the project root. The build reads it on purpose: /privacy is
# prerendered and bakes in PRIVACY_CONTACT_EMAIL, and lib/config.ts refuses to
# load without the required variables.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [ ! -f .env ]; then
  echo "Missing .env. Create it from deploy/env.production.example first." >&2
  exit 1
fi

git pull --ff-only
npm ci

set -a
# shellcheck disable=SC1091
. ./.env
set +a

npm run build

if systemctl cat boros-lu-miskin.service >/dev/null 2>&1; then
  sudo systemctl restart boros-lu-miskin
  echo "Restarted boros-lu-miskin."
else
  echo "Build done. Service not installed yet: run  sudo ./deploy/install-service.sh"
fi

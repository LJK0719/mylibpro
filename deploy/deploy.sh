#!/usr/bin/env bash
# One-shot update for the bare-metal deploy (no Docker).
# Pulls latest source, installs deps, rebuilds, and restarts the systemd service.
#
#   ssh root@<vps> "bash /opt/mylibpro/app/deploy/deploy.sh"
#
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/mylibpro/app}"
SERVICE="${SERVICE:-mylibpro}"

cd "$APP_DIR"

echo "==> git pull"
git pull --ff-only

echo "==> npm ci"
npm ci

echo "==> npm run build"
npm run build

echo "==> restart $SERVICE"
sudo systemctl restart "$SERVICE"
sleep 2
sudo systemctl --no-pager --full status "$SERVICE" | head -n 12

echo "==> done"

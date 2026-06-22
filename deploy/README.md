# Deploy (bare-metal: Node + systemd + Caddy)

This app runs directly on the host (no Docker) behind [Caddy](https://caddyserver.com)
for automatic HTTPS. Suited to a small single-app VPS.

Layout on the server:

```
/opt/mylibpro/
├── app/            # this git checkout (build + run here)
├── .env            # runtime config (API keys, DATA_ROOT, DB_PATH) — NOT in git
├── db/library.db   # SQLite database (persisted on host)
└── libdata/        # markdown/PDF data root (DATA_ROOT)
```

## First-time setup

```bash
# 1. Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs build-essential python3   # build tools: better-sqlite3 fallback

# 2. Source
git clone https://github.com/LJK0719/mylibpro.git /opt/mylibpro/app

# 3. Runtime env (host paths, not container paths)
cat > /opt/mylibpro/.env <<'EOF'
AGENT_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_MODEL=deepseek-v4-pro
DEEPSEEK_BASE_URL=https://api.deepseek.com
DATA_ROOT=/opt/mylibpro/libdata
DB_PATH=/opt/mylibpro/db/library.db
EOF

# 4. Build
cd /opt/mylibpro/app && npm ci && npm run build

# 5. systemd service
cp deploy/mylibpro.service /etc/systemd/system/mylibpro.service
systemctl daemon-reload && systemctl enable --now mylibpro

# 6. Caddy (host) for HTTPS
apt-get install -y caddy
cp deploy/Caddyfile /etc/caddy/Caddyfile
systemctl reload caddy
```

## Updates

```bash
bash /opt/mylibpro/app/deploy/deploy.sh
```

(`git pull` → `npm ci` → `npm run build` → `systemctl restart mylibpro`.)

## Notes

- The app listens on `127.0.0.1:3000`; Caddy terminates TLS on 80/443 and proxies to it.
- `DATA_ROOT` / `DB_PATH` must point at the host paths above (see `lib/config.ts`).
- The 2 GB box builds in place; a swapfile is recommended if the build is ever OOM-killed:
  `fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`.

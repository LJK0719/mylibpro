import type { NextConfig } from "next";

// Deployed bare-metal (Node + systemd) behind host Caddy — run with `next start`.
// No `output: 'standalone'` needed; see deploy/ for the systemd unit & Caddyfile.
const nextConfig: NextConfig = {};

export default nextConfig;

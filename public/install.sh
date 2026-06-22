#!/usr/bin/env bash
# One-command installer for the MyLibPro library skill + remote MCP.
#
#   curl -fsSL https://lib.jk0719.online/install.sh | bash -s -- <API_KEY>
#   # or:  MYLIBPRO_KEY=<API_KEY> bash <(curl -fsSL https://lib.jk0719.online/install.sh)
#
# Drops the SKILL.md into ~/.claude/skills/mylibpro and (if the Claude Code CLI
# is present) registers the remote MCP server so your AI can use the library.
set -euo pipefail

BASE="https://lib.jk0719.online"
ENDPOINT="$BASE/api/mcp"
KEY="${1:-${MYLIBPRO_KEY:-}}"

if [ -z "$KEY" ]; then
  echo "✗ Missing API key."
  echo "  Usage: curl -fsSL $BASE/install.sh | bash -s -- <API_KEY>"
  exit 1
fi

SKILL_DIR="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}/mylibpro"
mkdir -p "$SKILL_DIR"
curl -fsSL "$BASE/skill/SKILL.md" | sed "s|__ENDPOINT__|$ENDPOINT|g" > "$SKILL_DIR/SKILL.md"
echo "✓ Skill installed → $SKILL_DIR/SKILL.md"

if command -v claude >/dev/null 2>&1; then
  if claude mcp add --transport http mylibpro "$ENDPOINT" --header "X-API-Key: $KEY" >/dev/null 2>&1; then
    echo "✓ MCP server 'mylibpro' registered with Claude Code"
  else
    echo "• Could not auto-register (maybe already added). Add it manually below."
  fi
else
  echo "• Claude Code CLI not found — add the MCP server manually:"
fi

cat <<EOF

  Remote MCP endpoint : $ENDPOINT
  Auth header         : X-API-Key: $KEY

  Claude Code : claude mcp add --transport http mylibpro $ENDPOINT --header "X-API-Key: $KEY"
  Other clients (JSON):
    { "mcpServers": { "mylibpro": {
        "url": "$ENDPOINT",
        "headers": { "X-API-Key": "$KEY" } } } }

Done. Ask your AI a question in your fields — it will consult the library first.
EOF

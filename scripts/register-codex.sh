#!/usr/bin/env bash
# Register the Web Picker MCP server with Codex.
# Codex reads MCP servers from ~/.codex/config.toml (CODEX_HOME overrides ~/.codex).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CFG="${CODEX_HOME:-$HOME/.codex}/config.toml"

mkdir -p "$(dirname "$CFG")"
touch "$CFG"

if grep -q "mcp_servers.web-picker" "$CFG" 2>/dev/null; then
  echo "'web-picker' already registered in $CFG"
  exit 0
fi

cat >> "$CFG" <<EOF

[mcp_servers.web-picker]
command = "node"
args = ["$ROOT/scripts/run.cjs"]
EOF

echo "Registered 'web-picker' with Codex at $CFG"
echo "In a Codex session, call the tool: connect_web_picker"

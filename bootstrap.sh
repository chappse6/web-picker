#!/usr/bin/env bash
# One-shot setup: install deps, build, and print the next steps.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "error: Node.js >= 18 is required." >&2
  exit 1
fi

echo "[web-picker] installing dependencies..."
npm install

echo "[web-picker] building..."
npm run build

cat <<EOF

Done. Next steps (no API keys or accounts required):

1) Load the Chrome extension:
   chrome://extensions  ->  enable "Developer mode"  ->  "Load unpacked"
   ->  select:  $ROOT/extension

2) Register the MCP server with your agent:
   Claude Code:  ./scripts/register-claude-code.sh
   Codex:        ./scripts/register-codex.sh

3) Serve the demo page on localhost:
   python3 -m http.server 3000 --directory test-page
   (then open http://localhost:3000 )

4) In your agent, call the tool:  connect_web_picker
EOF

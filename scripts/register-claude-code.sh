#!/usr/bin/env bash
# Register the Web Picker MCP server with Claude Code.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if ! command -v claude >/dev/null 2>&1; then
  echo "error: 'claude' CLI not found. Install Claude Code first." >&2
  exit 1
fi

# Agent-neutral server; only the registration differs per agent.
claude mcp add web-picker --scope user -- node "$ROOT/scripts/run.cjs"

echo "Registered 'web-picker' with Claude Code."
echo "In a Claude Code session, call the tool: connect_web_picker"

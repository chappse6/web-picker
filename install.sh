#!/usr/bin/env bash
# One-command install for Web Picker.
#
#   curl -fsSL https://raw.githubusercontent.com/chappse6/web-picker/master/install.sh | bash
#
# Or, inside a checkout:  ./install.sh
set -euo pipefail

REPO_URL="${WEB_PICKER_REPO:-https://github.com/chappse6/web-picker.git}"
DEST="${WEB_PICKER_DIR:-$HOME/web-picker}"
BRANCH="${WEB_PICKER_BRANCH:-master}"

is_checkout() {
  local dir="$1"
  [[ -f "$dir/package.json" && -f "$dir/extension/manifest.json" && -f "$dir/scripts/run.cjs" ]]
}

resolve_root() {
  local src="${BASH_SOURCE[0]:-}"
  if [[ -n "$src" && -f "$src" && "$src" != /dev/fd/* && "$src" != /proc/self/fd/* ]]; then
    local dir
    dir="$(cd "$(dirname "$src")" && pwd)"
    if is_checkout "$dir"; then
      printf '%s\n' "$dir"
      return 0
    fi
  fi
  return 1
}

need_node() {
  if ! command -v node >/dev/null 2>&1; then
    echo "error: Node.js >= 20.18.0 is required. Install it from https://nodejs.org" >&2
    exit 1
  fi
  if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>20||(a===20&&b>=18)?0:1)'; then
    echo "error: Node.js >= 20.18.0 is required; found $(node --version)." >&2
    exit 1
  fi
  if ! command -v npm >/dev/null 2>&1; then
    echo "error: npm is required." >&2
    exit 1
  fi
}

ensure_clone() {
  if ! command -v git >/dev/null 2>&1; then
    echo "error: git is required to download Web Picker." >&2
    exit 1
  fi
  if is_checkout "$DEST"; then
    echo "[web-picker] updating $DEST ..."
    git -C "$DEST" fetch --depth 1 origin "$BRANCH"
    git -C "$DEST" checkout --force "$BRANCH"
    git -C "$DEST" pull --ff-only origin "$BRANCH" || git -C "$DEST" reset --hard "origin/$BRANCH"
  else
    echo "[web-picker] cloning into $DEST ..."
    rm -rf "$DEST"
    git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$DEST"
  fi
}

ROOT="$(resolve_root || true)"
if [[ -z "$ROOT" ]]; then
  ensure_clone
  ROOT="$DEST"
fi

cd "$ROOT"
need_node

echo "[web-picker] installing dependencies..."
npm install

echo "[web-picker] building..."
npm run build

if command -v claude >/dev/null 2>&1; then
  echo "[web-picker] registering Claude Code MCP..."
  ./scripts/register-claude-code.sh || echo "[web-picker] Claude Code register skipped."
else
  echo "[web-picker] Claude Code CLI not found; skip MCP register."
fi

echo "[web-picker] registering Codex MCP config (safe if unused)..."
./scripts/register-codex.sh || echo "[web-picker] Codex register skipped."

if [[ "$(uname -s)" == Darwin ]]; then
  open -R "$ROOT/extension" >/dev/null 2>&1 || true
fi

cat <<EOF

Web Picker is ready at:
  $ROOT

One remaining click (Chrome cannot be fully automated):
  1. chrome://extensions  →  Developer mode  →  Load unpacked
  2. Select:  $ROOT/extension

Then open a localhost page and click the webpicker chip.
In Claude Code / Codex, call:  connect_web_picker

EOF

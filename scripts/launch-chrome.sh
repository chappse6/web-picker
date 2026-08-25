#!/usr/bin/env bash
# Open a dedicated Chrome profile with the unpacked extension already loaded.
# Chrome does not allow silent install into the user's everyday profile.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXT="$ROOT/extension"
PROFILE="${WEB_PICKER_CHROME_PROFILE:-$HOME/.web-picker/chrome-dev-profile}"

if [[ ! -f "$EXT/manifest.json" ]]; then
  echo "error: extension not found at $EXT" >&2
  exit 1
fi

find_chrome() {
  if [[ -n "${CHROME_PATH:-}" && -x "${CHROME_PATH}" ]]; then
    printf '%s\n' "$CHROME_PATH"
    return 0
  fi
  local candidates=()
  case "$(uname -s)" in
    Darwin)
      candidates=(
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        "/Applications/Chromium.app/Contents/MacOS/Chromium"
      )
      ;;
    *)
      candidates=(
        google-chrome-stable
        google-chrome
        chromium
        chromium-browser
      )
      ;;
  esac
  local c
  for c in "${candidates[@]}"; do
    if [[ -x "$c" ]]; then
      printf '%s\n' "$c"
      return 0
    fi
    if command -v "$c" >/dev/null 2>&1; then
      command -v "$c"
      return 0
    fi
  done
  return 1
}

CHROME="$(find_chrome || true)"
if [[ -z "$CHROME" ]]; then
  echo "error: Google Chrome not found. Install Chrome, then load $EXT unpacked." >&2
  exit 1
fi

mkdir -p "$PROFILE"
echo "[web-picker] launching Chrome with extension $EXT"
exec "$CHROME" \
  --user-data-dir="$PROFILE" \
  --no-first-run \
  --no-default-browser-check \
  --disable-extensions-except="$EXT" \
  --load-extension="$EXT" \
  "http://localhost:3000/"

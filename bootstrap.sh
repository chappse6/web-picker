#!/usr/bin/env bash
# Back-compat entry: same as ./install.sh inside a checkout.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
exec "$ROOT/install.sh"

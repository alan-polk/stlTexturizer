#!/usr/bin/env bash
# Run the BumpMesh static server in the foreground (manual use).
# For auto-start at login, use scripts/install-launchagent.sh instead.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
exec python3 -m http.server 8000 --bind 0.0.0.0

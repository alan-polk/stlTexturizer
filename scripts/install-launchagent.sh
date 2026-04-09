#!/usr/bin/env bash
# Install BumpMesh (stlTexturizer) static server as a Launch Agent — runs at login, restarts if it dies.
# Run once from Terminal.app (not inside a sandboxed IDE):  ./scripts/install-launchagent.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PLIST_IN="$SCRIPT_DIR/com.stltexturizer.http.plist.in"
DEST="$HOME/Library/LaunchAgents/com.stltexturizer.http.plist"

if [[ ! -f "$PLIST_IN" ]]; then
  echo "Missing $PLIST_IN" >&2
  exit 1
fi

PYTHON3="$(command -v python3 || true)"
if [[ -z "$PYTHON3" ]]; then
  echo "python3 not found in PATH. Install Python 3 or add it to PATH." >&2
  exit 1
fi

mkdir -p "$HOME/Library/Logs"
sed -e "s|@REPO_ROOT@|$REPO_ROOT|g" \
    -e "s|@HOME@|$HOME|g" \
    -e "s|@PYTHON3@|$PYTHON3|g" \
    "$PLIST_IN" > "$DEST"

launchctl bootout "gui/$(id -u)/com.stltexturizer.http" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$DEST"

echo "Installed Launch Agent: com.stltexturizer.http"
echo "  Repo: $REPO_ROOT"
echo "  URL:  http://127.0.0.1:8000/"
echo "Logs: $HOME/Library/Logs/stltexturizer-http.log"

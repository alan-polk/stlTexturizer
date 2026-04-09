#!/usr/bin/env bash
# Remove the BumpMesh HTTP Launch Agent.
set -euo pipefail
launchctl bootout "gui/$(id -u)/com.stltexturizer.http" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/com.stltexturizer.http.plist"
echo "Removed com.stltexturizer.http Launch Agent."

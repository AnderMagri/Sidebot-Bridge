#!/bin/bash
# ═══════════════════════════════════════
#  Sidebot Bridge — Mac Launcher
#  Double-click this file to start the bridge.
#  Keep this file in the same folder as the bridge binary.
# ═══════════════════════════════════════

DIR="$(cd "$(dirname "$0")" && pwd)"

# Auto-detect Mac architecture
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  BINARY="$DIR/sidebot-bridge-mac-arm64"
else
  BINARY="$DIR/sidebot-bridge-mac-x64"
fi

# Check binary exists
if [ ! -f "$BINARY" ]; then
  echo ""
  echo "ERROR: Bridge binary not found."
  echo "Expected: $BINARY"
  echo ""
  echo "Make sure this .command file is in the same folder"
  echo "as the bridge binary you downloaded from GitHub."
  echo ""
  read -p "Press Enter to close this window..."
  exit 1
fi

# Ensure it's executable (macOS may strip permissions on download)
chmod +x "$BINARY"

echo "Starting Sidebot Bridge..."
echo ""

# Run the bridge
"$BINARY"

# If it exits, pause so the user can read any error messages
echo ""
read -p "Bridge stopped. Press Enter to close this window..."

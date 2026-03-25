#!/bin/bash
# install-bundy.sh — Install Bundy on macOS without Gatekeeper blocking
#
# WHY THIS SCRIPT IS NEEDED:
#   Bundy is not distributed through the Mac App Store and is not notarized with
#   Apple. macOS attaches a "quarantine" flag to any file downloaded from the
#   internet, which causes it to show "app is damaged" or "unidentified developer"
#   errors. This script removes that flag so the app opens normally.
#
# HOW TO RUN:
#   1. Download the correct DMG for your Mac:
#        • Apple Silicon (M1/M2/M3/M4): Bundy-1.0.0-arm64.dmg
#        • Intel Mac:                   Bundy-1.0.0-x64.dmg
#   2. Open Terminal (press Cmd+Space, type "Terminal", press Enter)
#   3. Paste this command and press Enter:
#        bash ~/Downloads/install-bundy.sh
#      (or drag-and-drop this script file into Terminal and press Enter)

set -e

# ── Find the DMG ──────────────────────────────────────────────────────────────

DMG="$1"

if [ -z "$DMG" ]; then
  # Detect Apple Silicon vs Intel automatically
  ARCH=$(uname -m)
  if [ "$ARCH" = "arm64" ]; then
    DMG=$(ls -t ~/Downloads/Bundy-*arm64.dmg 2>/dev/null | head -1)
  else
    DMG=$(ls -t ~/Downloads/Bundy-*x64.dmg 2>/dev/null | head -1)
  fi

  # Fall back to any Bundy DMG
  if [ -z "$DMG" ]; then
    DMG=$(ls -t ~/Downloads/Bundy-*.dmg 2>/dev/null | head -1)
  fi

  if [ -z "$DMG" ]; then
    echo ""
    echo "❌  Could not find a Bundy DMG in ~/Downloads."
    echo "    Please download the DMG first, then run this script again."
    echo ""
    echo "    Usage: $0 /path/to/Bundy-1.0.0-arm64.dmg"
    exit 1
  fi
  echo "→ Found: $DMG"
fi

if [ ! -f "$DMG" ]; then
  echo "❌  File not found: $DMG"
  exit 1
fi

# ── Remove quarantine from DMG itself ─────────────────────────────────────────

echo "→ Removing macOS quarantine from DMG..."
xattr -c "$DMG"

# ── Mount, copy, unmount ───────────────────────────────────────────────────────

echo "→ Mounting DMG..."
MOUNT_POINT=$(hdiutil attach "$DMG" -nobrowse -quiet | awk 'END {print $NF}')

if [ -z "$MOUNT_POINT" ]; then
  echo "❌  Failed to mount DMG."
  exit 1
fi

echo "→ Copying Bundy.app to /Applications..."
# Remove old version first if present
rm -rf /Applications/Bundy.app
cp -R "$MOUNT_POINT/Bundy.app" /Applications/

echo "→ Removing quarantine from installed app (all nested binaries)..."
xattr -cr /Applications/Bundy.app

echo "→ Unmounting DMG..."
hdiutil detach "$MOUNT_POINT" -quiet

# ── Done ───────────────────────────────────────────────────────────────────────

echo ""
echo "✅  Bundy installed successfully at /Applications/Bundy.app"
echo ""
echo "━━━  First-run checklist  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  1. Open Bundy from Applications (or Spotlight: Cmd+Space → 'Bundy')"
echo ""
echo "  2. Grant ACCESSIBILITY access:"
echo "     System Settings → Privacy & Security → Accessibility → toggle Bundy ON"
echo "     (needed for keyboard/mouse activity tracking)"
echo ""
echo "  3. Grant SCREEN RECORDING access:"
echo "     System Settings → Privacy & Security → Screen Recording → toggle Bundy ON"
echo "     (needed for automatic screenshots)"
echo ""
echo "  4. Log in with your 6-character token from:"
echo "     https://bundy.40h.studio"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

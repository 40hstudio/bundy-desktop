#!/usr/bin/env bash
#
# setup-codesign.sh
#
# Ensures a stable local code-signing identity exists for Bundy builds.
# Called automatically by `npm run dist` via the `predist` hook — you
# never need to run this manually.
#
# Why it exists:
#   Ad-hoc signing changes identity every build, so macOS TCC re-prompts for
#   accessibility permission on every reinstall.  A stable self-signed cert
#   keeps the same identity across builds — permission granted once, kept forever.
#
# First run: asks for your admin password once (to add the cert to System trust).
# Subsequent runs: exits immediately, no prompts.
#
set -euo pipefail

CERT_NAME="Bundy Signing"
KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"

# Already set up — nothing to do.
if security find-identity -v -p codesigning 2>/dev/null | grep -q "\"$CERT_NAME\""; then
  exit 0
fi

echo "[bundy] Setting up code-signing certificate (one-time — keeps accessibility permission across reinstalls)..."

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Generate key + self-signed cert with the key usages macOS requires for codesigning.
openssl req -x509 -newkey rsa:2048 \
  -keyout "$TMP/key.pem" \
  -out "$TMP/cert.pem" \
  -days 3650 -nodes \
  -subj "/CN=$CERT_NAME/O=Local Development" \
  -addext "keyUsage=critical,digitalSignature" \
  -addext "extendedKeyUsage=codeSigning" \
  -addext "basicConstraints=critical,CA:FALSE" \
  2>/dev/null

# OpenSSL 3.x uses PBES2 by default which macOS security CLI rejects — use -legacy.
P12_PASS=$(openssl rand -hex 16)
openssl pkcs12 -export -legacy \
  -out "$TMP/signing.p12" -inkey "$TMP/key.pem" -in "$TMP/cert.pem" \
  -passout "pass:$P12_PASS" 2>/dev/null

# Import key into login keychain.
security import "$TMP/signing.p12" \
  -k "$KEYCHAIN" -T /usr/bin/codesign -P "$P12_PASS" 2>/dev/null

# Trust the cert for code signing (requires admin password — first time only).
echo "[bundy] Trusting certificate (requires your admin password)..."
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain "$TMP/cert.pem"

# Allow codesign to access the key silently (no per-build keychain popups).
security set-key-partition-list \
  -S "apple-tool:,apple:,codesign:" -s -k "" \
  "$KEYCHAIN" > /dev/null 2>&1 || true

echo "[bundy] Code-signing certificate ready."


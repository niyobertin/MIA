#!/bin/zsh
set -euo pipefail
cd /Users/apple/Desktop/MIA

echo "=== MIA Android preview APK ==="
eas whoami

if ! grep -q '"projectId"' app.json 2>/dev/null; then
  echo "Linking/creating EAS project..."
  eas init --non-interactive || eas build:configure -p android
fi

echo "Starting preview APK build (cloud)..."
eas build --platform android --profile preview --non-interactive

echo "Done. Check the build URL above for the APK download."

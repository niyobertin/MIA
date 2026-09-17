#!/bin/zsh
cd /Users/apple/Desktop/MIA || exit 1
echo "=== MIA Android preview APK ==="
eas whoami || { echo "Not logged in. Run: eas login"; read -k 1; exit 1; }

if ! grep -q '"projectId"' app.json 2>/dev/null; then
  echo "Creating/linking EAS project (may prompt once)..."
  eas init || true
fi

eas build --platform android --profile preview
echo ""
echo "Build submitted. Press any key to close."
read -k 1

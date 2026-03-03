#!/bin/bash
set -e

if [ ! -f "icon.png" ]; then
  echo "❌ icon.png not found."
  echo "   Put your 1024x1024 PNG icon in this folder as 'icon.png', then run this script again."
  exit 1
fi

rm -rf AppIcon.iconset
mkdir AppIcon.iconset

sips -z 16 16     icon.png --out AppIcon.iconset/icon_16x16.png
sips -z 32 32     icon.png --out AppIcon.iconset/icon_16x16@2x.png
sips -z 32 32     icon.png --out AppIcon.iconset/icon_32x32.png
sips -z 64 64     icon.png --out AppIcon.iconset/icon_32x32@2x.png
sips -z 128 128   icon.png --out AppIcon.iconset/icon_128x128.png
sips -z 256 256   icon.png --out AppIcon.iconset/icon_128x128@2x.png
sips -z 256 256   icon.png --out AppIcon.iconset/icon_256x256.png
sips -z 512 512   icon.png --out AppIcon.iconset/icon_256x256@2x.png
sips -z 512 512   icon.png --out AppIcon.iconset/icon_512x512.png
sips -z 1024 1024 icon.png --out AppIcon.iconset/icon_512x512@2x.png

iconutil -c icns AppIcon.iconset

rm -rf AppIcon.iconset

echo "✅ AppIcon.icns created! Commit it with: git add AppIcon.icns && git commit -m 'Add custom bridge icon'"

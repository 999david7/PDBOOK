#!/usr/bin/env bash
# Builds PDBOOK.app (universal: Apple silicon + Intel) and a drag-to-install
# .dmg into build/macos/.
#
# Optional environment:
#   SIGN_IDENTITY   codesigning identity, e.g. "Developer ID Application: …"
#                   (default: ad-hoc signature, fine for your own Mac)
#   NOTARY_PROFILE  notarytool keychain profile; when set (with a Developer ID
#                   identity) the .dmg is notarized and stapled
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
OUT="$ROOT/build/macos"
APP="$OUT/PDBOOK.app"
VERSION="$(node -p "require('./package.json').version")"
BUILD_NUMBER="$(date +%Y%m%d%H%M)"
DMG="$OUT/PDBOOK-$VERSION.dmg"
SIGN_IDENTITY="${SIGN_IDENTITY:--}"

# Update feed: package.json "updates.feed", or derived from "updates.github".
FEED_URL="$(node -p "const u=require('./package.json').updates||{}; u.feed || (u.github ? 'https://github.com/'+u.github+'/releases/latest/download/update.json' : '')")"
PUBLIC_KEY="$(tr -d '[:space:]' < macos/update-public-key.txt 2>/dev/null || true)"

step() { printf '\n\033[1;33m==> %s\033[0m\n' "$1"; }

step "Building web app"
npm run build --silent

step "Compiling native shell"
rm -rf "$OUT"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" "$OUT/obj"
SDK="$(xcrun --sdk macosx --show-sdk-path)"
for ARCH in arm64 x86_64; do
  xcrun swiftc -O -swift-version 5 -sdk "$SDK" \
    -target "$ARCH-apple-macos13.0" \
    macos/Sources/*.swift -o "$OUT/obj/PDBOOK-$ARCH"
done
lipo -create "$OUT"/obj/PDBOOK-* -output "$APP/Contents/MacOS/PDBOOK"

step "Assembling bundle"
sed -e "s/__VERSION__/$VERSION/" -e "s/__BUILD__/$BUILD_NUMBER/" \
    -e "s|__FEED_URL__|$FEED_URL|" -e "s|__PUBLIC_KEY__|$PUBLIC_KEY|" \
    macos/Info.plist > "$APP/Contents/Info.plist"
if [ -z "$FEED_URL" ] || [ -z "$PUBLIC_KEY" ]; then
  echo "warning: updates disabled in this build (set updates.github in package.json and run npm run update-keys)"
fi
printf 'APPL????' > "$APP/Contents/PkgInfo"
cp -R dist "$APP/Contents/Resources/web"

step "Rendering icon"
ICONSET="$OUT/obj/AppIcon.iconset"
mkdir -p "$ICONSET"
xcrun swift macos/make-icon.swift "$OUT/obj/icon-1024.png" >/dev/null
for S in 16 32 128 256 512; do
  sips -z $S $S "$OUT/obj/icon-1024.png" --out "$ICONSET/icon_${S}x${S}.png" >/dev/null
  sips -z $((S * 2)) $((S * 2)) "$OUT/obj/icon-1024.png" --out "$ICONSET/icon_${S}x${S}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"

step "Signing ($([ "$SIGN_IDENTITY" = "-" ] && echo ad-hoc || echo "$SIGN_IDENTITY"))"
codesign --force --deep --options runtime --timestamp=none -s "$SIGN_IDENTITY" "$APP"
codesign --verify --deep --strict "$APP"

step "Creating disk image"
STAGE="$OUT/obj/dmg"
mkdir -p "$STAGE"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
hdiutil create -quiet -volname "PDBOOK" -srcfolder "$STAGE" -fs HFS+ -format UDZO -ov "$DMG"
if [ "$SIGN_IDENTITY" != "-" ]; then
  codesign --force -s "$SIGN_IDENTITY" "$DMG"
fi

if [ -n "${NOTARY_PROFILE:-}" ]; then
  step "Notarizing"
  xcrun notarytool submit "$DMG" --keychain-profile "$NOTARY_PROFILE" --wait
  xcrun stapler staple "$DMG"
fi

rm -rf "$OUT/obj"
step "Done"
echo "App: $APP"
echo "DMG: $DMG ($(du -h "$DMG" | cut -f1))"

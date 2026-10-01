#!/usr/bin/env bash
# Builds PDBOOK.app (universal: Apple silicon + Intel) once per language and
# a drag-to-install disk image for each:
#
#   build/macos/PDBOOK-en.dmg   (English)    app: build/macos/en/PDBOOK.app
#   build/macos/PDBOOK-de.dmg   (German)     app: build/macos/de/PDBOOK.app
#
# Each build has its language fixed (menus, dialogs, library, sample books)
# and follows its own update feed (update-<lang>.json).
#
# Optional environment:
#   LANGS           languages to build (default: "en de")
#   SIGN_IDENTITY   codesigning identity, e.g. "Developer ID Application: …"
#                   (default: ad-hoc signature, fine for your own Mac)
#   NOTARY_PROFILE  notarytool keychain profile; when set (with a Developer ID
#                   identity) each .dmg is notarized and stapled
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
OUT="$ROOT/build/macos"
OBJ="$OUT/obj"
LANGS="${LANGS:-en de}"
VERSION="$(node -p "require('./package.json').version")"
BUILD_NUMBER="$(date +%Y%m%d%H%M)"
SIGN_IDENTITY="${SIGN_IDENTITY:--}"
PUBLIC_KEY="$(tr -d '[:space:]' < macos/update-public-key.txt 2>/dev/null || true)"

# Feed base: package.json "updates.feedBase", or the latest GitHub release.
FEED_BASE="$(node -p "const u=require('./package.json').updates||{}; u.feedBase || (u.github ? 'https://github.com/'+u.github+'/releases/latest/download' : '')")"

step() { printf '\n\033[1;33m==> %s\033[0m\n' "$1"; }

step "Building web app"
npm run build --silent

step "Compiling native shell"
rm -rf "$OUT"
mkdir -p "$OBJ"
SDK="$(xcrun --sdk macosx --show-sdk-path)"
for ARCH in arm64 x86_64; do
  xcrun swiftc -O -swift-version 5 -sdk "$SDK" \
    -target "$ARCH-apple-macos13.0" \
    macos/Sources/*.swift -o "$OBJ/PDBOOK-$ARCH"
done
lipo -create "$OBJ"/PDBOOK-* -output "$OBJ/PDBOOK"

step "Rendering icon"
ICONSET="$OBJ/AppIcon.iconset"
mkdir -p "$ICONSET"
xcrun swift macos/make-icon.swift "$OBJ/icon-1024.png" >/dev/null
for S in 16 32 128 256 512; do
  sips -z $S $S "$OBJ/icon-1024.png" --out "$ICONSET/icon_${S}x${S}.png" >/dev/null
  sips -z $((S * 2)) $((S * 2)) "$OBJ/icon-1024.png" --out "$ICONSET/icon_${S}x${S}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$OBJ/AppIcon.icns"

if [ -z "$FEED_BASE" ] || [ -z "$PUBLIC_KEY" ]; then
  echo "warning: updates disabled in this build (set updates.github in package.json and run npm run update-keys)"
fi

for LANG_CODE in $LANGS; do
  APP="$OUT/$LANG_CODE/PDBOOK.app"
  DMG="$OUT/PDBOOK-$LANG_CODE.dmg"
  FEED_URL="${FEED_BASE:+$FEED_BASE/update-$LANG_CODE.json}"

  step "Assembling $LANG_CODE app"
  mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/$LANG_CODE.lproj"
  cp "$OBJ/PDBOOK" "$APP/Contents/MacOS/PDBOOK"
  cp "$OBJ/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"
  sed -e "s/__VERSION__/$VERSION/" -e "s/__BUILD__/$BUILD_NUMBER/" -e "s/__LANG__/$LANG_CODE/g" \
      -e "s|__FEED_URL__|${FEED_URL:-}|" -e "s|__PUBLIC_KEY__|$PUBLIC_KEY|" \
      macos/Info.plist > "$APP/Contents/Info.plist"
  # A real .lproj makes AppKit's own texts (open panels, alerts, Services…)
  # use this language too.
  printf '/* PDBOOK */\n"CFBundleDisplayName" = "PDBOOK";\n' > "$APP/Contents/Resources/$LANG_CODE.lproj/InfoPlist.strings"
  printf 'APPL????' > "$APP/Contents/PkgInfo"
  cp -R dist "$APP/Contents/Resources/web"
  # Ship only this language's sample books.
  for OTHER in "$APP/Contents/Resources/web/samples"/*; do
    [ "$(basename "$OTHER")" = "$LANG_CODE" ] || rm -rf "$OTHER"
  done

  step "Signing $LANG_CODE ($([ "$SIGN_IDENTITY" = "-" ] && echo ad-hoc || echo "$SIGN_IDENTITY"))"
  codesign --force --deep --options runtime --timestamp=none -s "$SIGN_IDENTITY" "$APP"
  codesign --verify --deep --strict "$APP"

  step "Creating $(basename "$DMG")"
  STAGE="$OBJ/dmg-$LANG_CODE"
  mkdir -p "$STAGE"
  cp -R "$APP" "$STAGE/"
  ln -s /Applications "$STAGE/$([ "$LANG_CODE" = de ] && echo Programme || echo Applications)"
  hdiutil create -quiet -volname "PDBOOK" -srcfolder "$STAGE" -fs HFS+ -format UDZO -ov "$DMG"
  if [ "$SIGN_IDENTITY" != "-" ]; then
    codesign --force -s "$SIGN_IDENTITY" "$DMG"
  fi
  if [ -n "${NOTARY_PROFILE:-}" ]; then
    step "Notarizing $LANG_CODE"
    xcrun notarytool submit "$DMG" --keychain-profile "$NOTARY_PROFILE" --wait
    xcrun stapler staple "$DMG"
  fi
done

rm -rf "$OBJ"
step "Done (version $VERSION)"
for LANG_CODE in $LANGS; do
  DMG="$OUT/PDBOOK-$LANG_CODE.dmg"
  echo "$LANG_CODE: $DMG ($(du -h "$DMG" | cut -f1))"
done

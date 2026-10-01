#!/usr/bin/env bash
# Publishes a new PDBOOK version that installed copies will offer to install.
#
#   npm run release -- <version> ["release notes" | notes-file.md] [--yes]
#
# 1. sets the version in package.json
# 2. builds the app + .dmg (macos/build.sh)
# 3. signs the .dmg with your private update key
# 4. writes update.json (the feed the app checks)
# 5. creates a GitHub release with both files, after asking you to confirm
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="${1:-}"
NOTES_ARG="${2:-}"
ASSUME_YES=false
for a in "$@"; do [ "$a" = "--yes" ] && ASSUME_YES=true; done
[ "$NOTES_ARG" = "--yes" ] && NOTES_ARG=""

die() { printf '\033[1;31merror:\033[0m %s\n' "$1" >&2; exit 1; }
step() { printf '\n\033[1;33m==> %s\033[0m\n' "$1"; }

[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "usage: npm run release -- <x.y.z> [\"notes\" | notes.md] [--yes]"

if [ -f "$NOTES_ARG" ]; then NOTES="$(cat "$NOTES_ARG")"; else NOTES="$NOTES_ARG"; fi
[ -n "$NOTES" ] || NOTES="Bug fixes and improvements."

REPO="$(node -p "(require('./package.json').updates||{}).github || ''")"
[ -n "$REPO" ] || die "set \"updates\": { \"github\": \"owner/repo\" } in package.json"
CURRENT="$(node -p "require('./package.json').version")"

# --- preflight -------------------------------------------------------------
[ -s macos/update-public-key.txt ] || die "no update key yet — run: npm run update-keys"
command -v gh >/dev/null || die "the GitHub CLI (gh) is required: brew install gh"
gh auth status >/dev/null 2>&1 || die "not logged in to GitHub — run: gh auth login"
gh repo view "$REPO" >/dev/null 2>&1 || die "GitHub repo $REPO doesn't exist or isn't accessible.
  Create it (it must be public so the app can download updates without a login), e.g.:
    git init && git add -A && git commit -m 'Initial commit'
    gh repo create $REPO --public --source . --push"
if gh release view "v$VERSION" --repo "$REPO" >/dev/null 2>&1; then die "release v$VERSION already exists"; fi
node -e "
  const [a,b]=['$VERSION','$CURRENT'].map(v=>v.split('.').map(Number));
  for (let i=0;i<3;i++){ if(a[i]>b[i]) process.exit(0); if(a[i]<b[i]) break; }
  if ('$VERSION'!=='$CURRENT') process.exit(1);
" || die "$VERSION is older than the current version $CURRENT"

# --- build -----------------------------------------------------------------
step "Setting version $VERSION"
npm version "$VERSION" --no-git-tag-version --allow-same-version >/dev/null

bash macos/build.sh

DMG="build/macos/PDBOOK-$VERSION.dmg"
FEED="build/macos/update.json"

step "Signing update"
SIGNATURE="$(xcrun swift macos/update-tool.swift sign "$DMG")"
xcrun swift macos/update-tool.swift verify "$DMG" "$SIGNATURE"

URL="https://github.com/$REPO/releases/download/v$VERSION/PDBOOK-$VERSION.dmg"
VERSION="$VERSION" URL="$URL" SIGNATURE="$SIGNATURE" NOTES="$NOTES" DMG="$DMG" FEED="$FEED" node -e '
  const fs = require("fs");
  const e = process.env;
  fs.writeFileSync(e.FEED, JSON.stringify({
    version: e.VERSION,
    notes: e.NOTES,
    pubDate: new Date().toISOString(),
    url: e.URL,
    size: fs.statSync(e.DMG).size,
    signature: e.SIGNATURE,
    minimumSystemVersion: "13.0",
  }, null, 2) + "\n");
'
cat "$FEED"

# --- publish ---------------------------------------------------------------
step "Ready to publish PDBOOK $VERSION to github.com/$REPO"
if ! $ASSUME_YES; then
  read -r -p "Publish this release now? Installed copies will offer it to users. [y/N] " ok
  [[ "$ok" =~ ^[Yy]$ ]] || { echo "Not published. Files are in build/macos/."; exit 0; }
fi

gh release create "v$VERSION" "$DMG" "$FEED" \
  --repo "$REPO" --title "PDBOOK $VERSION" --notes "$NOTES" --latest

step "Published"
echo "https://github.com/$REPO/releases/tag/v$VERSION"
echo "Installed copies will offer this update within a few hours (or via PDBOOK ▸ Check for Updates…)."

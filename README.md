# PDBOOK

Open any PDF as a book with realistic page-folding animations.

- **Page curl that follows you**: grab a page anywhere and the page follows the pointer smoothly. Flick it to turn, or let go early and it settles back. Two-finger trackpad swipes curl the page live. Clicks, the arrows and ← / → turn the page along an eased arc. Home/End, Space and PageUp/PageDown also work.
- **Auto-fit**: the book resizes to the window. It shows two pages side by side when that fits, and a single page on narrow or portrait screens.
- **Automatic cover detection**:
  - Skips blank leading and trailing pages.
  - Scores the first and last real pages on background colour, ink coverage, colour saturation and amount of text, to decide whether they are a front or back cover. Covers become hard, rigid pages.
  - If the PDF has no cover, generates a cloth-bound cover from the PDF title, or from the file name when there is no title.
  - Splits PDFs that store two-page spreads on one sheet back into single pages. Slide decks stay as they are.
  - Pads the inside pages so every spread is complete.
- **Lazy, sharp rendering**: only pages near the current one are rendered, at the screen's pixel density, and they are re-rendered when the size changes.

## Run

```bash
npm install
npm run dev
```

Then drop a PDF on the page, or click **Try a sample**. You can also open `?pdf=<url>` directly.

`npm run build` produces a static site in `dist/`. `npm run sample` regenerates `public/sample.pdf`.

## macOS app

```bash
npm run mac
```

This builds `build/macos/PDBOOK.app` and `build/macos/PDBOOK-<version>.dmg`, a universal app for Apple silicon and Intel on macOS 13 or later. To install, open the `.dmg` and drag PDBOOK into Applications.

The app is a native Swift/AppKit shell around the web app (`macos/Sources`). It adds:

- Native menus, including File ▸ Open Recent and View ▸ Next/Previous/First/Last Page.
- Back/forward and Open buttons in the toolbar.
- The book title and current page in the title bar, with a proxy icon for the file.
- One window per book, with system window tabs.
- "Open With ▸ PDBOOK" from Finder, and opening PDFs by dropping them on the Dock icon.
- Each book reopens at the page where you left off.

By default the app gets an ad-hoc signature, which is fine on the Mac that built it. To share it with other people, sign and notarize it with an Apple Developer ID:

```bash
SIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)" NOTARY_PROFILE=my-profile npm run mac
```

## Publishing updates

Installed copies check for new versions in the background, every few hours. They can also check from **PDBOOK ▸ Check for Updates…**. When a new version is available, the app shows its release notes and asks whether to install it, with three choices: **Install Update**, **Not Now** and **Skip This Version**. If you choose Install, the app:

1. downloads the update,
2. checks its Ed25519 signature,
3. replaces itself,
4. relaunches.

You set this up once:

```bash
npm run update-keys
```

That command creates:

- your private signing key at `~/.config/pdbook/update_signing_key`. **Back it up and never commit it.** Without it you can't publish updates to existing installs.
- the matching public key at `macos/update-public-key.txt`. Commit this file; it's built into the app.

Updates are hosted on GitHub Releases for the repo set in `package.json` under `"updates": { "github": "owner/repo" }`. The repo must be public so the app can download updates without a login.

To publish a version:

```bash
npm run release -- 1.1.0 "• What changed"
```

The release script:

1. bumps the version,
2. builds and signs the `.dmg`,
3. writes `update.json`,
4. asks for confirmation,
5. creates GitHub release `v1.1.0` with both files.

The app reads its update feed from `…/releases/latest/download/update.json`.

To point a build at a test feed, run:

```bash
defaults write app.pdbook.PDBOOK UpdateFeedURL <url>
```

Built with [pdf.js](https://mozilla.github.io/pdf.js/) and [StPageFlip](https://github.com/Nodlik/StPageFlip).

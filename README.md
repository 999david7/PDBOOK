# PDBOOK

Open any PDF as a book with realistic page-folding animations. PDBOOK is made for young readers and classrooms. It has a bright, friendly design with rounded fonts, big buttons that are easy to hit, and a bookshelf for your books. The fonts are bundled, so it also works offline.

- **Page curl that follows you**: grab a page anywhere and the page follows the pointer smoothly. Flick it to turn, or let go early and it settles back. Two-finger trackpad swipes curl the page live. Clicks, the arrows and ← / → turn the page along an eased arc. Home/End, Space and PageUp/PageDown also work.
- **Auto-fit**: the book resizes to the window. It shows two pages side by side when that fits, and a single page on narrow or portrait screens.
- **Automatic cover detection**:
  - Skips blank leading and trailing pages.
  - Scores the first and last real pages on background colour, ink coverage, colour saturation and amount of text, to decide whether they are a front or back cover. Covers become hard, rigid pages.
  - If the PDF has no cover, generates a cloth-bound cover from the PDF title, or from the file name when there is no title.
  - Splits PDFs that store two-page spreads on one sheet back into single pages. Slide decks stay as they are.
  - Pads the inside pages so every spread is complete.
- **Books from pictures**: turn photos or scans of pages into a book. PDBOOK crops each page out of the photo, spots double pages and sorts them for you (see below).
- **Lazy, sharp rendering**: only pages near the current one are rendered, at the screen's pixel density, and they are re-rendered when the size changes.

## Make a book from pictures

Click **Book from Pictures** on the shelf, use File ▸ New Book from Pictures… (⇧⌘N), or drop pictures (or a folder of them) onto the window. PDBOOK puts them in order automatically:

1. **Printed page numbers.** The Mac app reads the top and bottom of each picture with macOS text recognition (Vision), so photos of a book's pages end up in page order even if they were taken out of order. Pages without a number, such as the cover, stay next to the page they came after; if the photos were badly shuffled, they go to the front.
2. **Numbers in the file names**, such as `scan-001.jpg` or `page 10.png`, in natural order (2 before 10).
3. **When the photos were taken**, from their EXIF data.
4. **The file date**, as a last resort.

Photos of a book lying on a table are cropped to the page first. The Mac app finds the page with macOS document detection, straightens it and turns sideways photos upright by the direction their text runs. A browser crops to the part that stands out from the table. Pictures about twice as wide as the single pages are **double pages**. In the book they fill a left and a right page together, and a filler page is added before one where needed so it always starts on the left. Filler pages are decorated, so they don't look like a mistake. The last picture only becomes the back cover if it clearly looks like one; otherwise PDBOOK makes a back cover to match the book.

A sheet then shows the pictures in that order, with double pages as wide tiles. Drag a picture to move it, or use Shift+← / → on a selected picture. Click × to leave a picture out, the book button to switch a picture between single and double page, or the arrow to turn it. Change the title if you like. **Make Book** writes a PDF with one picture per page. Every page has the same size, and double pages are twice as wide. The Mac app saves it in your library and opens it. In a browser it opens straight away; page-number reading and turning photos upright automatically need the Mac app.

JPEG, PNG, HEIC, TIFF, GIF and WebP all work in the Mac app. A browser can only use the formats it can display.

## Library

The Mac app keeps your books in a **“PDBOOK Library”** folder, in a location you choose the first time you open it. The library opens as a bookshelf showing each book's real cover.

- **Five free sample books are pre-installed:** a short story, a picture book, a field guide, a cookbook and a poetry collection. They come in English and German editions, and each app installs its own language. They are original works; the text is in `scripts/sample-text.mjs`, and `npm run samples` generates them.
- **To add books,** use one of these:
  - the **Add Books** button
  - File ▸ Add Books to Library… (⇧⌘O)
  - drop PDFs onto the window
  - copy them into the folder in Finder

  The shelf updates live.
- **To keep a PDF you opened from elsewhere,** use **Add to Library** (⌘D).
- **To rename a book,** hover over it, click the pencil, type the new name and press Return (Esc cancels). The file in the library folder is renamed too. The new name replaces the title stored inside the PDF on the shelf and in the reader, without changing the PDF itself. In a browser, the new names are remembered in that browser.
- **To remove a book,** hover over it and click the trash icon. The file goes to the macOS Trash, so it can be restored. Deleted samples stay deleted; File ▸ Restore Sample Books brings them back.
- **To move the library,** use File ▸ Change Library Location…. To open the folder, use File ▸ Show Library in Finder.
- **To return to the shelf** from a book, use ⌘L.

In a browser, the shelf shows the sample books.

## Run

```bash
npm install
npm run dev
```

Then drop a PDF on the page, or click **Try a sample**. You can also open `?pdf=<url>` directly.

`npm run build` produces a static site in `dist/`. `npm run sample` regenerates `public/sample.pdf`.

## macOS app (English & German)

```bash
npm run mac
```

This builds two separate apps, each fixed to one language. Each language has its own menus, dialogs, library and sample books, and its own update feed.

| File | Language | App |
| --- | --- | --- |
| `build/macos/PDBOOK-en.dmg` | English | `build/macos/en/PDBOOK.app` |
| `build/macos/PDBOOK-de.dmg` | German (Deutsch) | `build/macos/de/PDBOOK.app` |

Both are universal apps for Apple silicon and Intel, on macOS 13 or later. To install, open the `.dmg` and drag PDBOOK into Applications. To switch language, install the other `.dmg`; your library and reading positions are kept. To build only one language, run `LANGS=de npm run mac`.

Download links for the latest release:

- English: https://github.com/999david7/PDBOOK/releases/latest/download/PDBOOK-en.dmg
- Deutsch: https://github.com/999david7/PDBOOK/releases/latest/download/PDBOOK-de.dmg

In a browser, add `?lang=de` or `?lang=en` to the URL to pick the language; otherwise the browser's language is used.

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
npm run release -- 1.1.0 "• What changed
---
• Was sich geändert hat"
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

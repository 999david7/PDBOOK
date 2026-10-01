// UI text in English and German.
// The macOS app fixes the language per build (window.PDBOOK_LANG, injected
// from Info.plist). In a browser: ?lang=de|en, else the browser language.

const STRINGS = {
  en: {
    library: 'Library',
    backToLibrary: 'Back to library',
    openPdf: 'Open PDF (O)',
    openPdfLabel: 'Open PDF',
    fullscreen: 'Fullscreen (F)',
    fullscreenLabel: 'Toggle fullscreen',
    changeLocation: 'Change library location…',
    showInFinder: 'Show in Finder',
    addBooks: 'Add Books',
    setupTitle: 'Choose where to keep your books',
    setupText: 'PDBOOK creates a “PDBOOK Library” folder there, with five free sample books to get you started.',
    setupButton: 'Choose Library Folder…',
    emptyTitle: 'Your library is empty',
    emptyText: 'Add PDFs with <strong>Add Books</strong>, make one with <strong>Book from Pictures</strong>, or drop files onto this window.',
    restoreSamples: 'Restore the free sample books',
    previousPage: 'Previous page',
    nextPage: 'Next page',
    page: 'Page',
    opening: 'Opening…',
    dropToOpen: 'Drop a PDF or pictures',
    dropToAdd: 'Drop to add to your library',
    measuring: 'Measuring pages…',
    findingCover: 'Looking for the cover…',
    cover: 'Cover',
    backCover: 'Back cover',
    untitled: 'Untitled',
    coverFound: 'Cover found on page {page}',
    coverMade: 'No cover in the PDF — made one from the title',
    spreadsSplit: 'two-page spreads split',
    blanksSkipped: '{n} blank page skipped',
    blanksSkippedPlural: '{n} blank pages skipped',
    openFailed: 'Couldn’t open that file: {error}',
    notPdf: 'That doesn’t look like a PDF or a picture.',
    bookCount: '{n} book',
    bookCountPlural: '{n} books',
    moveToTrash: 'Move to Trash',
    removeFromShelf: 'Remove from shelf',
    openBook: 'Open {title}',
    confirmRemove: 'Remove “{title}” from your shelf?',
    browserNote:
      'In the browser your shelf holds the free sample books. Get the Mac app to keep your own books in a library folder.',
    restoreRemoved: 'Restore {n} removed sample',
    restoreRemovedPlural: 'Restore {n} removed samples',
    picturesButton: 'Book from Pictures',
    arrangeTitle: 'Make a book from your pictures',
    arrangeHint: 'Drag a picture to move it.',
    sortedBy_pages: 'Sorted by the page numbers on the pictures.',
    sortedBy_name: 'Sorted by file name.',
    sortedBy_taken: 'Sorted by when the photos were taken.',
    sortedBy_modified: 'Sorted by file date.',
    bookTitle: 'Title',
    cancel: 'Cancel',
    makeBook: 'Make Book',
    pictureCount: '{n} picture',
    pictureCountPlural: '{n} pictures',
    removePicture: 'Remove picture',
    pageShort: 'p. {n}',
    makingBook: 'Making your book… {n} / {total}',
    pictureBookTitle: 'Picture Book {date}',
    noPictures: 'None of the pictures could be read.',
    picturesSkipped: '{n} picture couldn’t be read and was left out',
    picturesSkippedPlural: '{n} pictures couldn’t be read and were left out',
    dropPictures: 'Drop pictures to make a book',
  },
  de: {
    library: 'Bibliothek',
    backToLibrary: 'Zurück zur Bibliothek',
    openPdf: 'PDF öffnen (O)',
    openPdfLabel: 'PDF öffnen',
    fullscreen: 'Vollbild (F)',
    fullscreenLabel: 'Vollbild umschalten',
    changeLocation: 'Speicherort der Bibliothek ändern …',
    showInFinder: 'Im Finder zeigen',
    addBooks: 'Bücher hinzufügen',
    setupTitle: 'Wo sollen deine Bücher liegen?',
    setupText: 'PDBOOK legt dort einen Ordner „PDBOOK Bibliothek“ an – mit fünf kostenlosen Beispielbüchern für den Anfang.',
    setupButton: 'Ordner für die Bibliothek wählen …',
    emptyTitle: 'Deine Bibliothek ist leer',
    emptyText: 'Füge PDFs mit <strong>Bücher hinzufügen</strong> hinzu, mach eins mit <strong>Buch aus Bildern</strong> oder zieh Dateien in dieses Fenster.',
    restoreSamples: 'Kostenlose Beispielbücher wiederherstellen',
    previousPage: 'Vorherige Seite',
    nextPage: 'Nächste Seite',
    page: 'Seite',
    opening: 'Wird geöffnet …',
    dropToOpen: 'PDF oder Bilder hier ablegen',
    dropToAdd: 'Ablegen, um es zur Bibliothek hinzuzufügen',
    measuring: 'Seiten werden vermessen …',
    findingCover: 'Cover wird gesucht …',
    cover: 'Cover',
    backCover: 'Rückseite',
    untitled: 'Ohne Titel',
    coverFound: 'Cover auf Seite {page} gefunden',
    coverMade: 'Kein Cover im PDF – eines aus dem Titel erstellt',
    spreadsSplit: 'Doppelseiten aufgeteilt',
    blanksSkipped: '{n} leere Seite übersprungen',
    blanksSkippedPlural: '{n} leere Seiten übersprungen',
    openFailed: 'Die Datei konnte nicht geöffnet werden: {error}',
    notPdf: 'Das scheint weder ein PDF noch ein Bild zu sein.',
    bookCount: '{n} Buch',
    bookCountPlural: '{n} Bücher',
    moveToTrash: 'In den Papierkorb legen',
    removeFromShelf: 'Aus dem Regal entfernen',
    openBook: '{title} öffnen',
    confirmRemove: '„{title}“ aus dem Regal entfernen?',
    browserNote:
      'Im Browser enthält dein Regal die kostenlosen Beispielbücher. Mit der Mac-App kannst du eigene Bücher in einem Bibliotheksordner speichern.',
    restoreRemoved: '{n} entferntes Beispiel wiederherstellen',
    restoreRemovedPlural: '{n} entfernte Beispiele wiederherstellen',
    picturesButton: 'Buch aus Bildern',
    arrangeTitle: 'Mach ein Buch aus deinen Bildern',
    arrangeHint: 'Zieh ein Bild, um es zu verschieben.',
    sortedBy_pages: 'Nach den Seitenzahlen auf den Bildern sortiert.',
    sortedBy_name: 'Nach Dateinamen sortiert.',
    sortedBy_taken: 'Nach Aufnahmezeit sortiert.',
    sortedBy_modified: 'Nach Dateidatum sortiert.',
    bookTitle: 'Titel',
    cancel: 'Abbrechen',
    makeBook: 'Buch machen',
    pictureCount: '{n} Bild',
    pictureCountPlural: '{n} Bilder',
    removePicture: 'Bild entfernen',
    pageShort: 'S. {n}',
    makingBook: 'Dein Buch wird gemacht … {n} / {total}',
    pictureBookTitle: 'Bilderbuch {date}',
    noPictures: 'Keines der Bilder konnte gelesen werden.',
    picturesSkipped: '{n} Bild konnte nicht gelesen werden und wurde weggelassen',
    picturesSkippedPlural: '{n} Bilder konnten nicht gelesen werden und wurden weggelassen',
    dropPictures: 'Bilder ablegen, um ein Buch zu machen',
  },
};

function detect() {
  const forced = window.PDBOOK_LANG || new URLSearchParams(location.search).get('lang');
  if (forced && STRINGS[forced]) return forced;
  return (navigator.language || 'en').toLowerCase().startsWith('de') ? 'de' : 'en';
}

export const lang = detect();

/** Translate `key`, filling {placeholders}. Pass `n` to pick the plural form. */
export function t(key, vars = {}) {
  const table = STRINGS[lang];
  const plural = typeof vars.n === 'number' && vars.n !== 1 && table[`${key}Plural`];
  let text = (plural ? table[`${key}Plural`] : table[key]) ?? STRINGS.en[key] ?? key;
  for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
  return text;
}

/** Fill static markup: data-i18n (text), data-i18n-html, -title, -aria. */
export function translateDocument(root = document) {
  document.documentElement.lang = lang;
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
}

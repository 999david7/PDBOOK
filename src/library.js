// The library screen: a bookshelf of covers.
//  - In the macOS app the books come from the library folder (pushed by the
//    native side via window.pdbook.library(payload)); removing moves the file
//    to the Trash after a native confirmation.
//  - In a browser there is no folder to save to, so the shelf shows the
//    bundled sample books; removing one hides it (and it can be restored).
import { openPdf, readTitle, renderLogicalPage, closePdf } from './pdf.js';
import { findFrontCover } from './layout.js';
import { makeCover } from './covers.js';
import { native } from './native.js';
import { t, lang } from './i18n.js';

const BASE = import.meta.env.BASE_URL;
const THUMB_WIDTH = 320;
const HIDDEN_KEY = 'pdbook:hiddenSamples';
const THUMB_PREFIX = 'pdbook:thumb:';

export function createLibrary({ root, onOpen, onAddInBrowser }) {
  const $ = (sel) => root.querySelector(sel);
  const els = {
    shelf: $('#shelf'),
    count: $('#libCount'),
    location: $('#libLocation'),
    add: $('#libAdd'),
    reveal: $('#libReveal'),
    choose: $('#libChoose'),
    setup: $('#libSetup'),
    empty: $('#libEmpty'),
    note: $('#libNote'),
  };

  let books = [];
  let configured = true;
  const thumbs = new Map(); // key -> { img, title, author }
  const queue = [];
  let working = false;

  /* ------------------------------------------------------------- data */

  const keyOf = (b) => `${b.name}|${b.size}|${b.mtime}`;

  function titleFromName(name) {
    return name
      .replace(/\.pdf$/i, '')
      .replace(/^\d+[-_ ]+/, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function readJSON(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or unavailable; thumbnails just get re-rendered.
    }
  }

  async function loadBrowserShelf() {
    let list = [];
    try {
      list = await (await fetch(`${BASE}samples/${lang}/index.json`)).json();
    } catch {
      // No samples available.
    }
    const hidden = new Set(readJSON(HIDDEN_KEY, []));
    books = list
      .filter((b) => !hidden.has(b.file))
      .map((b) => ({ name: b.file, title: b.title, author: b.author, url: `${BASE}samples/${lang}/${b.file}`, size: 0, mtime: 0 }));
    const removed = list.filter((b) => hidden.has(b.file)).length;
    els.note.replaceChildren(t('browserNote'));
    if (removed) {
      const restore = document.createElement('button');
      restore.className = 'link';
      restore.textContent = t('restoreRemoved', { n: removed });
      restore.addEventListener('click', () => {
        writeJSON(HIDDEN_KEY, []);
        loadBrowserShelf();
      });
      els.note.append(' ', restore);
    }
    render();
  }

  /** Called by the macOS app whenever the library folder changes. */
  function update(payload) {
    configured = Boolean(payload.configured);
    books = (payload.books || []).map((b) => ({ ...b, url: `${BASE}${b.url.replace(/^\//, '')}` }));
    // LRM marks keep the slashes in place: the element truncates right-to-left
    // so the folder name stays visible.
    els.location.textContent = payload.location ? `\u200E${payload.location}\u200E` : '';
    render();
  }

  /* ------------------------------------------------------------- view */

  function render() {
    els.setup.hidden = configured;
    els.reveal.hidden = !configured;
    els.location.parentElement.hidden = !configured || !els.location.textContent;
    els.count.textContent = configured ? t('bookCount', { n: books.length }) : '';
    els.empty.hidden = !configured || books.length > 0;
    els.shelf.hidden = !configured || books.length === 0;
    els.shelf.replaceChildren(...books.map(card));
    pump();
  }

  function card(book) {
    const key = keyOf(book);
    const el = document.createElement('article');
    el.className = 'book-card';
    el.tabIndex = 0;
    el.dataset.key = key;
    el.setAttribute('role', 'button');

    const wrap = document.createElement('div');
    wrap.className = 'book-cover-wrap';
    const cover = document.createElement('div');
    cover.className = 'book-cover is-loading';
    wrap.append(cover);

    const title = document.createElement('div');
    title.className = 'book-title';

    const remove = document.createElement('button');
    remove.className = 'book-remove';
    remove.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>';
    const verb = native.active ? t('moveToTrash') : t('removeFromShelf');
    remove.title = verb;

    el.append(wrap, title, remove);
    const label = () => thumbs.get(key)?.title || book.title || titleFromName(book.name);
    const setText = () => {
      title.textContent = label();
      el.setAttribute('aria-label', t('openBook', { title: label() }));
      remove.setAttribute('aria-label', `${verb}: ${label()}`);
    };
    setText();

    el.addEventListener('click', (e) => {
      if (e.target.closest('.book-remove')) return;
      onOpen(book);
    });
    el.addEventListener('keydown', (e) => {
      if (e.target !== el) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onOpen(book);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        removeBook(book, label());
      }
    });
    remove.addEventListener('click', (e) => {
      e.stopPropagation();
      removeBook(book, label());
    });

    el._apply = () => {
      const t = thumbs.get(key);
      if (!t) return;
      cover.classList.remove('is-loading');
      if (t.img) {
        const img = new Image();
        img.alt = '';
        img.src = t.img;
        cover.replaceChildren(img);
      } else {
        cover.replaceChildren(makeCover(t.title, t.author));
        cover.classList.add('is-generated');
      }
      setText();
    };

    if (!thumbs.has(key)) {
      const stored = readJSON(THUMB_PREFIX + key, null);
      if (stored) thumbs.set(key, stored);
    }
    if (thumbs.has(key)) el._apply();
    else if (!queue.some((q) => keyOf(q) === key)) queue.push(book);
    return el;
  }

  function removeBook(book, title) {
    if (native.active) {
      native.post('library.remove', { name: book.name, title });
      return;
    }
    if (!confirm(t('confirmRemove', { title }))) return;
    const hidden = new Set(readJSON(HIDDEN_KEY, []));
    hidden.add(book.name);
    writeJSON(HIDDEN_KEY, [...hidden]);
    loadBrowserShelf();
  }

  /* ------------------------------------------------------------- thumbnails */

  async function pump() {
    if (working) return;
    working = true;
    while (queue.length) {
      const book = queue.shift();
      const key = keyOf(book);
      if (thumbs.has(key) || !books.some((b) => keyOf(b) === key)) continue;
      try {
        const t = await makeThumb(book);
        thumbs.set(key, t);
        writeJSON(THUMB_PREFIX + key, t);
      } catch (err) {
        console.warn('thumbnail failed', book.name, err);
        thumbs.set(key, { img: null, title: book.title || titleFromName(book.name), author: '' });
      }
      for (const el of els.shelf.querySelectorAll('.book-card')) {
        if (el.dataset.key === key) el._apply?.();
      }
    }
    working = false;
  }

  async function makeThumb(book) {
    const data = new Uint8Array(await (await fetch(book.url)).arrayBuffer());
    const pdf = await openPdf(data);
    try {
      const meta = await readTitle(pdf, book.name);
      const title = book.title || meta.title;
      const lp = await findFrontCover(pdf);
      if (!lp) return { img: null, title, author: meta.author };
      const canvas = await renderLogicalPage(pdf, lp, THUMB_WIDTH);
      const img = canvas.toDataURL('image/jpeg', 0.82);
      canvas.width = 0;
      return { img, title, author: meta.author };
    } finally {
      closePdf(pdf);
    }
  }

  /* ------------------------------------------------------------- actions */

  els.add.addEventListener('click', () => {
    if (native.active) native.post('library.add');
    else onAddInBrowser();
  });
  els.reveal.addEventListener('click', () => native.post('library.reveal'));
  els.location.addEventListener('click', () => native.post('library.change'));
  els.choose.addEventListener('click', () => native.post('library.choose'));
  root.querySelector('#libRestore')?.addEventListener('click', () => native.post('library.restore'));

  if (!native.active) loadBrowserShelf();

  return { update };
}

import { PageFlip } from 'page-flip/dist/js/page-flip.module.js';
import { openPdf, readTitle, renderLogicalPage } from './pdf.js';
import { buildBook } from './layout.js';
import { PageTurner, FORWARD, BACK } from './turner.js';
import { native } from './native.js';
import './style.css';

const $ = (id) => document.getElementById(id);
const els = {
  stage: $('stage'),
  welcome: $('welcome'),
  bookArea: $('bookArea'),
  bookShift: $('bookShift'),
  bookBed: $('bookBed'),
  bookHost: $('bookHost'),
  prev: $('prevBtn'),
  next: $('nextBtn'),
  loading: $('loading'),
  loadingText: $('loadingText'),
  bottombar: $('bottombar'),
  scrubber: $('scrubber'),
  indicator: $('indicator'),
  docTitle: $('docTitle'),
  fileInput: $('fileInput'),
  dropOverlay: $('dropOverlay'),
  toast: $('toast'),
};

const MAX_RENDER_WIDTH = 2400;
const RENDER_AHEAD = 6;
const RENDER_BEHIND = 3;
const KEEP_RADIUS = 12;

const state = {
  pdf: null,
  meta: null,
  book: null, // { pages, aspect, ... } from buildBook
  flip: null,
  mode: null, // 'spread' | 'single'
  pageEls: [],
  rendered: new Map(), // book index -> { canvas, width }
  renderGen: 0,
  loadId: 0,
};

/* ------------------------------------------------------------------------ */
/* Loading                                                                  */
/* ------------------------------------------------------------------------ */

async function loadDocument(source) {
  const loadId = ++state.loadId;
  setLoading('Opening…');
  try {
    const data = source.file
      ? new Uint8Array(await source.file.arrayBuffer())
      : new Uint8Array(await (await fetch(source.url)).arrayBuffer());
    const name =
      source.file?.name || source.name || decodeURIComponent(source.url.split('/').pop() || 'document.pdf');

    const size = data.length; // pdf.js may transfer (detach) the buffer
    const pdf = await openPdf(data);
    if (loadId !== state.loadId) return pdf.destroy();
    const meta = await readTitle(pdf, name);
    const book = await buildBook(pdf, setLoading);
    if (loadId !== state.loadId) return pdf.destroy();

    teardown();
    state.pdf = pdf;
    state.meta = meta;
    state.book = book;
    els.docTitle.textContent = meta.title;
    document.title = `${meta.title} · PDBOOK`;

    els.welcome.hidden = true;
    els.bookArea.hidden = false;
    els.prev.hidden = els.next.hidden = false;
    els.bottombar.hidden = false;
    els.scrubber.max = String(book.pages.length - 1);

    state.posKey = `pdbook:pos:${meta.title}:${pdf.numPages}:${size}`;
    const saved = Number(source.start ?? readStore(state.posKey)) || 0;
    buildFlip(Math.min(saved, book.pages.length - 1));
    setLoading(null);
    announceLayout(book);
    native.post('document', { title: meta.title, pages: pdf.numPages });
  } catch (err) {
    console.error(err);
    setLoading(null);
    toast(`Couldn't open that file: ${err?.message || err}`, 5000);
  }
}

function announceLayout(book) {
  const notes = [];
  if (book.frontCover) {
    notes.push(`Cover found on page ${book.frontCover.pdfIndex + 1}`);
  } else {
    notes.push('No cover in the PDF — made one from the title');
  }
  if (book.spreads) notes.push('two-page spreads split');
  if (book.skipped) notes.push(`${book.skipped} blank page${book.skipped > 1 ? 's' : ''} skipped`);
  toast(notes.join(' · '), 3800);
}

function teardown() {
  state.renderGen++;
  if (state.flip) {
    state.flip.destroy();
    state.flip = null;
  }
  for (const { canvas } of state.rendered.values()) canvas.width = 0;
  state.rendered.clear();
  state.pageEls = [];
  state.pdf?.destroy();
  state.pdf = null;
}

/* ------------------------------------------------------------------------ */
/* Book                                                                     */
/* ------------------------------------------------------------------------ */

/** Show two pages side by side unless a single page would be much bigger. */
function chooseMode() {
  // Measured on the stage (not the book area, whose insets depend on the mode)
  // so the decision can't oscillate.
  const r = els.stage.getBoundingClientRect();
  const a = state.book.aspect;
  const spreadH = Math.min(r.height - 20, (r.width - 144) / (2 * a));
  const singleH = Math.min(r.height - 16, (r.width - 32) / a);
  return spreadH >= singleH * 0.72 ? 'spread' : 'single';
}

function buildFlip(startPage) {
  state.renderGen++;
  turner.reset();
  if (state.flip) {
    state.flip.destroy();
    state.flip = null;
  }
  const mode = chooseMode();
  state.mode = mode;
  els.stage.dataset.mode = mode;

  const host = document.createElement('div');
  host.className = 'book';
  els.bookHost.replaceChildren(host);

  state.pageEls = state.book.pages.map((p, i) => createPageEl(p, i, mode));

  const a = state.book.aspect;
  const flip = new PageFlip(host, {
    width: Math.round(1000 * a),
    height: 1000,
    size: 'stretch',
    // In "single" mode a huge minWidth forces the library into portrait.
    minWidth: mode === 'single' ? 100000 : 1,
    maxWidth: 100000,
    minHeight: 1,
    maxHeight: 100000,
    usePortrait: mode === 'single',
    showCover: true,
    drawShadow: true,
    maxShadowOpacity: 0.55,
    flippingTime: 850,
    mobileScrollSupport: false,
    // Input is handled by PageTurner (src/turner.js), which drives the
    // library's fold physics with smoothing, easing and flick velocity.
    useMouseEvents: false,
    showPageCorners: true,
    startPage,
    autoSize: true,
  });
  flip.loadFromHTML(state.pageEls);
  // The library pins min/max widths on the host; we size it with CSS instead.
  host.style.minWidth = '0';
  host.style.maxWidth = 'none';
  host.style.minHeight = '0';
  flip.update();
  state.flip = flip;

  flip.on('flip', () => onPageChange(true));
  flip.on('changeState', (e) => {
    if (e.data === 'flipping' || e.data === 'user_fold') {
      // Opening the closed book or closing it: slide it to center as it moves.
      const idx = flip.getCurrentPageIndex();
      if (mode === 'spread' && (idx === 0 || idx === state.book.pages.length - 1)) {
        setShift(0, true);
      }
    } else if (e.data === 'read') {
      onPageChange(true);
    }
  });

  requestAnimationFrame(() => onPageChange(false));
}

function createPageEl(p, i, mode) {
  const el = document.createElement('div');
  el.className = 'page';
  const isCover = i === 0 || i === state.book.pages.length - 1;
  if (isCover) el.dataset.density = 'hard';
  if (mode === 'spread' && !isCover) el.classList.add(i % 2 === 1 ? 'side-left' : 'side-right');
  if (mode === 'single') el.classList.add('side-right');

  const inner = document.createElement('div');
  inner.className = 'page-inner';
  el.append(inner);

  if (p.kind === 'pdf') {
    inner.classList.add('paper');
    if (p.role) inner.classList.add('pdf-cover');
    const cached = state.rendered.get(i);
    if (cached) inner.append(cached.canvas);
    else inner.append(spinner());
  } else if (p.kind === 'cover') {
    inner.append(generatedCover());
  } else if (p.kind === 'back') {
    inner.append(generatedBack());
  } else {
    inner.classList.add('paper', 'blank');
  }
  return el;
}

function spinner() {
  const s = document.createElement('div');
  s.className = 'page-spinner';
  return s;
}

const CLOTH = [
  ['#1f3a5f', '#d9b36a'],
  ['#5a1f2b', '#e0c27a'],
  ['#20463a', '#d8bf7c'],
  ['#2d2a4a', '#c9b37e'],
  ['#3b2f25', '#d6ae62'],
];

function clothFor(title) {
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CLOTH[h % CLOTH.length];
}

function generatedCover() {
  const { title, author } = state.meta;
  const [bg, fg] = clothFor(title);
  const el = document.createElement('div');
  el.className = 'gen-cover';
  el.style.setProperty('--cloth', bg);
  el.style.setProperty('--foil', fg);
  const frame = document.createElement('div');
  frame.className = 'gen-frame';
  const h = document.createElement('h2');
  h.textContent = title;
  h.style.fontSize = `${title.length > 60 ? 0.75 : title.length > 30 ? 0.95 : 1.2}em`;
  const rule = document.createElement('div');
  rule.className = 'gen-rule';
  frame.append(rule, h);
  if (author) {
    const a = document.createElement('p');
    a.textContent = author;
    frame.append(a);
  }
  const orn = document.createElement('div');
  orn.className = 'gen-ornament';
  orn.textContent = '❦';
  frame.append(orn);
  el.append(frame);
  return el;
}

function generatedBack() {
  const [bg, fg] = clothFor(state.meta.title);
  const el = document.createElement('div');
  el.className = 'gen-cover gen-back';
  el.style.setProperty('--cloth', bg);
  el.style.setProperty('--foil', fg);
  const orn = document.createElement('div');
  orn.className = 'gen-ornament';
  orn.textContent = '❦';
  el.append(orn);
  return el;
}

/* ------------------------------------------------------------------------ */
/* Position, centring and UI state                                          */
/* ------------------------------------------------------------------------ */

function visibleIndexes(idx) {
  const n = state.book.pages.length;
  if (state.mode === 'single') return [idx];
  if (idx === 0) return [0];
  const left = idx % 2 === 1 ? idx : idx - 1;
  return left + 1 < n ? [left, left + 1] : [left];
}

function setShift(px, animate) {
  els.bookShift.classList.toggle('animate', animate);
  els.bookShift.style.transform = `translateX(${px}px)`;
}

function updateBed() {
  if (!state.flip) return;
  const rect = state.flip.getRender().getRect();
  const idx = state.flip.getCurrentPageIndex();
  const n = state.book.pages.length;
  let left = rect.left;
  let width = rect.width;
  if (state.mode === 'single') {
    left = rect.left + rect.pageWidth;
    width = rect.pageWidth;
  } else if (idx === 0) {
    left = rect.left + rect.pageWidth;
    width = rect.pageWidth;
  } else if (visibleIndexes(idx).length === 1 && idx === n - 1) {
    width = rect.pageWidth;
  }
  Object.assign(els.bookBed.style, {
    left: `${left}px`,
    top: `${rect.top}px`,
    width: `${width}px`,
    height: `${rect.height}px`,
  });
}

function closedShift() {
  if (state.mode !== 'spread' || !state.flip) return 0;
  const idx = state.flip.getCurrentPageIndex();
  const n = state.book.pages.length;
  const pw = state.flip.getRender().getRect().pageWidth;
  if (idx === 0) return -pw / 2;
  if (idx === n - 1 && visibleIndexes(idx).length === 1) return pw / 2;
  return 0;
}

function onPageChange(animate) {
  if (!state.flip) return;
  const idx = state.flip.getCurrentPageIndex();
  const n = state.book.pages.length;
  setShift(closedShift(), animate);
  updateBed();
  els.prev.disabled = idx <= 0;
  els.next.disabled = visibleIndexes(idx).at(-1) >= n - 1;
  els.scrubber.value = String(idx);
  els.indicator.textContent = describe(visibleIndexes(idx));
  native.post('page', { label: els.indicator.textContent.replace(/\s+/g, ' '), index: idx });
  writeStore(state.posKey, idx);
  scheduleRender();
}

function label(i) {
  const p = state.book.pages[i];
  if (i === 0) return 'Cover';
  if (i === state.book.pages.length - 1) return 'Back cover';
  if (p.kind === 'blank') return '';
  return String(p.pdfIndex + 1) + (p.half === 'left' ? 'a' : p.half === 'right' ? 'b' : '');
}

function describe(indexes) {
  const total = state.pdf?.numPages ?? 0;
  const labels = indexes.map(label).filter(Boolean);
  const text = labels.length > 1 ? `${labels[0]} – ${labels[1]}` : labels[0] || '';
  return /^\d/.test(text) ? `${text}  /  ${total}` : text;
}

/* ------------------------------------------------------------------------ */
/* Lazy, resolution-aware rendering                                         */
/* ------------------------------------------------------------------------ */

function targetRenderWidth() {
  const pw = state.flip.getRender().getRect().pageWidth;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  return Math.min(MAX_RENDER_WIDTH, Math.ceil(pw * dpr));
}

async function scheduleRender() {
  if (!state.flip || !state.pdf) return;
  const gen = ++state.renderGen;
  const idx = state.flip.getCurrentPageIndex();
  const n = state.book.pages.length;
  const want = targetRenderWidth();

  const order = [];
  for (const i of visibleIndexes(idx)) order.push(i);
  for (let d = 1; d <= RENDER_AHEAD; d++) {
    order.push(idx + d);
    if (d <= RENDER_BEHIND) order.push(idx - d);
  }

  for (const i of order) {
    if (i < 0 || i >= n || gen !== state.renderGen) continue;
    const page = state.book.pages[i];
    if (page.kind !== 'pdf') continue;
    const have = state.rendered.get(i);
    if (have && have.width >= want * 0.92) continue;
    // Pages further away get a lighter render; they'll sharpen when reached.
    const near = Math.abs(i - idx) <= 2;
    const width = near ? want : Math.min(want, 900);
    if (have && have.width >= width * 0.92) continue;
    try {
      const pdf = state.pdf;
      const canvas = await renderLogicalPage(pdf, page, width);
      if (pdf !== state.pdf) return;
      installCanvas(i, canvas, width);
    } catch (err) {
      if (err?.name !== 'RenderingCancelledException') console.warn('render failed', i, err);
    }
  }

  if (gen === state.renderGen) evictFar(idx);
}

function installCanvas(i, canvas, width) {
  const old = state.rendered.get(i);
  state.rendered.set(i, { canvas, width });
  const inner = state.pageEls[i]?.querySelector('.page-inner');
  if (inner) {
    inner.querySelector('.page-spinner')?.remove();
    if (old?.canvas.parentNode === inner) inner.replaceChild(canvas, old.canvas);
    else inner.append(canvas);
  }
  if (old && old.canvas !== canvas) old.canvas.width = 0;
}

function evictFar(idx) {
  for (const [i, { canvas }] of state.rendered) {
    if (Math.abs(i - idx) > KEEP_RADIUS) {
      const inner = canvas.parentNode;
      canvas.remove();
      canvas.width = 0;
      state.rendered.delete(i);
      if (inner && !inner.querySelector('.page-spinner')) inner.append(spinner());
    }
  }
}

/* ------------------------------------------------------------------------ */
/* Navigation & input                                                       */
/* ------------------------------------------------------------------------ */

const turner = new PageTurner({
  host: els.bookHost,
  getFlip: () => state.flip,
  canTurn: (dir) => {
    if (!state.flip) return false;
    const idx = state.flip.getCurrentPageIndex();
    const n = state.book.pages.length;
    return dir === FORWARD ? visibleIndexes(idx).at(-1) < n - 1 : idx > 0;
  },
});

const next = () => turner.turn(FORWARD);
const prev = () => turner.turn(BACK);

function goTo(index) {
  if (!state.flip) return;
  turner.reset();
  state.flip.turnToPage(Math.max(0, Math.min(index, state.book.pages.length - 1)));
  onPageChange(true);
}

els.next.addEventListener('click', next);
els.prev.addEventListener('click', prev);

els.scrubber.addEventListener('input', () => {
  els.indicator.textContent = describe(visibleIndexes(Number(els.scrubber.value)));
});
els.scrubber.addEventListener('change', () => {
  if (!state.flip) return;
  const target = Number(els.scrubber.value);
  const current = state.flip.getCurrentPageIndex();
  // Animate single-spread hops, jump for long ones.
  const step = state.mode === 'spread' ? 2 : 1;
  if (target !== current && Math.abs(target - current) <= step) {
    if (target > current) next();
    else prev();
  } else goTo(target);
});

document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (k === 'o' || k === 'O') return openFile();
  if (k === 'f' || k === 'F') return toggleFullscreen();
  if (!state.flip) return;
  if (k === 'ArrowRight' || k === 'PageDown' || k === ' ') {
    e.preventDefault();
    next();
  } else if (k === 'ArrowLeft' || k === 'PageUp') {
    e.preventDefault();
    prev();
  } else if (k === 'Home') {
    goTo(0);
  } else if (k === 'End') {
    goTo(state.book.pages.length - 1);
  }
});

// Re-fit on any size change; rebuild only when spread/single should change.
let resizeTimer = 0;
new ResizeObserver(() => {
  if (!state.flip) return;
  // Keep the closed book centred while the library re-fits.
  requestAnimationFrame(() => {
    setShift(closedShift(), false);
    updateBed();
  });
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!state.flip) return;
    if (chooseMode() !== state.mode) buildFlip(state.flip.getCurrentPageIndex());
    else {
      state.flip.update();
      onPageChange(false);
    }
  }, 160);
}).observe(els.stage);

/* ------------------------------------------------------------------------ */
/* Files                                                                    */
/* ------------------------------------------------------------------------ */

function openFile() {
  if (native.active) native.post('open');
  else els.fileInput.click();
}

$('openBtn').addEventListener('click', openFile);
$('chooseBtn').addEventListener('click', openFile);
$('sampleBtn').addEventListener('click', () =>
  loadDocument({ url: `${import.meta.env.BASE_URL}sample.pdf` }),
);
$('fsBtn').addEventListener('click', toggleFullscreen);

els.fileInput.addEventListener('change', () => {
  const file = els.fileInput.files?.[0];
  if (file) loadDocument({ file });
  els.fileInput.value = '';
});

let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
window.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth++;
  els.dropOverlay.hidden = false;
});
window.addEventListener('dragover', (e) => {
  if (hasFiles(e)) e.preventDefault();
});
window.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) {
    dragDepth = 0;
    els.dropOverlay.hidden = true;
  }
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  els.dropOverlay.hidden = true;
  const file = [...(e.dataTransfer?.files || [])].find(
    (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name),
  );
  if (file) loadDocument({ file });
  else toast('That doesn’t look like a PDF.');
});

function toggleFullscreen() {
  if (native.active) native.post('fullscreen');
  else if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

/* ------------------------------------------------------------------------ */
/* Bits                                                                     */
/* ------------------------------------------------------------------------ */

function setLoading(text) {
  els.loading.hidden = !text;
  if (text) els.loadingText.textContent = text;
}

let toastTimer = 0;
function toast(text, ms = 3000) {
  els.toast.textContent = text;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), ms);
}

function readStore(key) {
  try {
    return key ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function writeStore(key, value) {
  try {
    if (key) localStorage.setItem(key, String(value));
  } catch {
    // Storage unavailable (private mode etc.) — position just isn't remembered.
  }
}

// API used by the macOS app's menus and Finder "Open With".
window.pdbook = {
  open: (url, name, start) => loadDocument({ url, name, start }),
  next,
  prev,
  first: () => goTo(0),
  last: () => state.book && goTo(state.book.pages.length - 1),
};

// ?pdf=<url> opens a document directly.
const initial = new URLSearchParams(location.search).get('pdf');
if (initial) loadDocument({ url: initial });
native.post('ready');

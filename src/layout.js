// Turns a PDF into a book layout: splits two-page spreads, finds the front
// and back covers, drops blank leading/trailing pages and pads the interior
// so every spread is complete.
import { readPageSizes, renderLogicalPage, countTextChars } from './pdf.js';
import { t } from './i18n.js';

const COVER_THRESHOLD = 0.7;
const SCAN_FRONT = 4; // how many leading pages to inspect for a cover
const SCAN_BACK = 3;

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 1;
};

/**
 * A PDF is treated as a "spread" PDF when its interior pages are landscape
 * and roughly twice as wide as its portrait pages (typically the covers).
 * Pure landscape documents such as slide decks are left alone.
 */
function detectSpreads(sizes) {
  const aspects = sizes.map((s) => s.w / s.h);
  const portrait = aspects.filter((a) => a < 0.95);
  const interior = aspects.slice(1, -1);
  if (!portrait.length || interior.length < 2) return false;
  const p = median(portrait);
  const wide = interior.filter((a) => Math.abs(a / (2 * p) - 1) < 0.12);
  return wide.length >= interior.length * 0.6;
}

function buildLogicalPages(sizes) {
  const spreads = detectSpreads(sizes);
  const pages = [];
  sizes.forEach((s, i) => {
    const isWide = s.w / s.h > 1.15;
    if (spreads && isWide) {
      pages.push({ kind: 'pdf', pdfIndex: i, half: 'left', w: s.w / 2, h: s.h });
      pages.push({ kind: 'pdf', pdfIndex: i, half: 'right', w: s.w / 2, h: s.h });
    } else {
      pages.push({ kind: 'pdf', pdfIndex: i, half: null, w: s.w, h: s.h });
    }
  });
  return { pages, spreads };
}

/** Pixel + text statistics used to decide if a page is blank or cover-like. */
async function analyze(pdf, lp) {
  const canvas = await renderLogicalPage(pdf, lp, 72);
  const { width, height } = canvas;
  const data = canvas.getContext('2d').getImageData(0, 0, width, height).data;
  const total = width * height;

  // Background = most frequent quantised colour.
  const hist = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    hist.set(key, (hist.get(key) || 0) + 1);
  }
  let bgKey = 0;
  let bgCount = -1;
  for (const [k, c] of hist) if (c > bgCount) [bgKey, bgCount] = [k, c];
  const bg = [((bgKey >> 8) & 15) * 16 + 8, ((bgKey >> 4) & 15) * 16 + 8, (bgKey & 15) * 16 + 8];

  let inkPx = 0;
  let satSum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const d = Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]);
    if (d > 60) inkPx++;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    satSum += max === 0 ? 0 : (max - min) / max;
  }
  canvas.width = 0;

  const ink = inkPx / total;
  const sat = satSum / total;
  const bgMax = Math.max(...bg), bgMin = Math.min(...bg);
  const bgLum = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2];
  const paperLike = bgLum > 205 && (bgMax - bgMin) / bgMax < 0.15;

  let chars = await countTextChars(pdf, lp.pdfIndex);
  if (lp.half) chars /= 2;

  let score = 0;
  if (!paperLike) score += 0.7; // full-bleed colour or dark background
  score += ink * 0.8;
  score += sat * 1.5;
  if (chars < 150) score += 0.25;
  if (chars > 600) score -= 0.5;

  return {
    blank: paperLike && ink < 0.004 && chars < 3,
    cover: score >= COVER_THRESHOLD,
    score,
  };
}

/**
 * Quick front-cover lookup for library thumbnails: checks only the first few
 * pages. Returns the logical page to render, or null when the PDF has no
 * cover-like first page (a cover is then generated from the title).
 */
export async function findFrontCover(pdf) {
  const n = Math.min(SCAN_FRONT, pdf.numPages);
  for (let i = 0; i < n; i++) {
    const page = await pdf.getPage(i + 1);
    const vp = page.getViewport({ scale: 1 });
    const lp = { kind: 'pdf', pdfIndex: i, half: null, w: vp.width, h: vp.height };
    const s = await analyze(pdf, lp);
    if (s.blank) continue;
    return s.cover ? lp : null;
  }
  return null;
}

/**
 * Returns the ordered list of book pages:
 *   { kind: 'pdf' | 'cover' | 'back' | 'blank', ...}
 * The first page is always the front cover and the last the back cover.
 */
export async function buildBook(pdf, onProgress = () => {}) {
  onProgress(t('measuring'));
  const sizes = await readPageSizes(pdf);
  let { pages, spreads } = buildLogicalPages(sizes);

  onProgress(t('findingCover'));
  const cache = new Map();
  const stats = async (i) => {
    if (!cache.has(i)) cache.set(i, await analyze(pdf, pages[i]));
    return cache.get(i);
  };

  // Front: skip leading blanks; the first real page is the cover if it looks
  // like one. Otherwise a cover is generated from the document title.
  let start = 0;
  let frontCover = null;
  for (let i = 0; i < Math.min(SCAN_FRONT, pages.length); i++) {
    const s = await stats(i);
    if (s.blank) {
      start = i + 1;
      continue;
    }
    if (s.cover) frontCover = i;
    break;
  }

  // Back: skip trailing blanks; last real page is the back cover if cover-like.
  let end = pages.length - 1;
  let backCover = null;
  for (let i = pages.length - 1; i > Math.max(start, pages.length - 1 - SCAN_BACK); i--) {
    const s = await stats(i);
    if (s.blank) {
      end = i - 1;
      continue;
    }
    if (s.cover && i !== frontCover && pages.length > 2) backCover = i;
    break;
  }

  const interior = [];
  for (let i = start; i <= end; i++) {
    if (i === frontCover || i === backCover) continue;
    interior.push(pages[i]);
  }
  if (interior.length % 2 === 1) interior.push({ kind: 'blank' });

  const book = [
    frontCover !== null ? { ...pages[frontCover], role: 'cover' } : { kind: 'cover' },
    ...interior,
    backCover !== null ? { ...pages[backCover], role: 'back' } : { kind: 'back' },
  ];

  // Book page proportions come from the interior (covers are fitted inside).
  const sample = interior.filter((p) => p.kind === 'pdf');
  const ref = sample.length ? sample : pages;
  const aspect = median(ref.map((p) => p.w / p.h));

  return {
    pages: book,
    aspect,
    spreads,
    frontCover: frontCover !== null ? pages[frontCover] : null,
    backCover: backCover !== null ? pages[backCover] : null,
    skipped: pages.length - (end - start + 1),
  };
}

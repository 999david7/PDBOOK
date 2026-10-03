// Turns a pile of pictures (photos or scans of pages, or just photos) into a
// book: puts them in the right order, spots double pages, guesses a title and
// writes a PDF that the rest of the app opens like any other book.
//
// A picture is { name, src (File/Blob or URL), modified, taken, pageNumber,
// aspect, spread }, where `taken` is the capture time from the photo's EXIF
// data, `pageNumber` a page number printed on it (found by the macOS app with
// Vision text recognition), `aspect` the width / height of the page in it and
// `spread` whether it shows two pages side by side. The macOS app crops the
// page out of the photo and turns it upright before the page sees it; in a
// browser `findPage` crops it. Missing values are null.
import { t, lang } from './i18n.js';

const MAX_EDGE = 2000; // longest side of a page in the PDF, in pixels (twice that for a double page)
const JPEG_QUALITY = 0.86;
const PAGE_HEIGHT = 842; // PDF points (A4 height)

/** In a PDF's keywords: its wide pages are double pages to split. */
export const SPREADS_KEYWORD = 'pdbook-spreads';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const stem = (name) => name.replace(/\.[^.]+$/, '');
const has = (v) => v !== null && v !== undefined && Number.isFinite(v);
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

export const isPicture = (file) =>
  file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif|tiff?|bmp|avif)$/i.test(file.name);

/**
 * Sorts pictures into reading order:
 *  1. by the page numbers printed on them, when most pictures have one
 *     (pictures without a number, like a cover, stay next to their neighbours);
 *  2. otherwise by the numbers in the file names (scan-001, IMG_0042, page 3…);
 *  3. otherwise by when the photos were taken;
 *  4. otherwise by file date.
 * Returns { items, method } with method 'pages' | 'name' | 'taken' | 'modified'.
 */
export function sortPictures(pictures) {
  const byName = [...pictures].sort((a, b) => collator.compare(a.name, b.name));
  const distinct = (key) => new Set(pictures.map(key)).size === pictures.length;

  let base = byName;
  let method = 'name';
  const numberedNames = pictures.filter((p) => /\d/.test(stem(p.name))).length;
  if (numberedNames < pictures.length * 0.8) {
    if (pictures.every((p) => has(p.taken)) && distinct((p) => p.taken)) {
      method = 'taken';
      base = sortBy(byName, (p) => p.taken);
    } else if (pictures.every((p) => has(p.modified)) && distinct((p) => p.modified)) {
      method = 'modified';
      base = sortBy(byName, (p) => p.modified);
    }
  }

  const numbered = base.filter((p) => has(p.pageNumber));
  const unique = new Set(numbered.map((p) => p.pageNumber)).size;
  if (numbered.length >= 2 && numbered.length >= base.length * 0.5 && unique >= numbered.length * 0.85) {
    // Pages without a number (cover, title page, often page 1) stay after the
    // numbered page they followed — if the old order was any good, i.e. the
    // numbers mostly ran upwards in it. Otherwise they go to the front.
    let rising = 0;
    for (let i = 1; i < numbered.length; i++) if (numbered[i].pageNumber > numbered[i - 1].pageNumber) rising++;
    const trusted = rising >= (numbered.length - 1) * 0.7;
    let anchor = -1e9;
    const keyed = base.map((p, i) => {
      const own = has(p.pageNumber);
      if (own) anchor = p.pageNumber;
      return { p, i, key: own ? p.pageNumber : trusted ? anchor : -1e9, after: own ? 0 : 1 };
    });
    keyed.sort((a, b) => a.key - b.key || a.after - b.after || a.i - b.i);
    return { items: keyed.map((k) => k.p), method: 'pages' };
  }
  return { items: base, method };
}

/**
 * Marks the double pages: pictures about twice as wide as the single pages
 * (or, with no portrait pages to compare with, clearly landscape ones).
 * Pass `only` to decide just for that picture, comparing it with the rest.
 */
export function markSpreads(pictures, only = null) {
  const narrow = pictures.map((p) => p.aspect).filter((a) => has(a) && a < 1);
  const single = narrow.length ? median(narrow) : null;
  for (const p of only ? [only] : pictures) {
    p.spread = has(p.aspect) && (single ? p.aspect > single * 1.55 : p.aspect > 1.25);
  }
  return pictures;
}

/** Turns a picture a quarter clockwise (its src becomes a new JPEG). */
export async function turnPicture(p) {
  const original = p.src;
  const url = typeof original === 'string' ? original : URL.createObjectURL(original);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, (MAX_EDGE * 1.5) / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = h;
    canvas.height = w;
    const ctx = canvas.getContext('2d');
    ctx.translate(h, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    canvas.width = 0;
    if (!blob) return;
    p.src = blob;
    p.aspect = h / w;
  } finally {
    if (url !== original) URL.revokeObjectURL(url);
  }
}

/** Stable sort by a numeric key (ties keep their current order). */
function sortBy(list, key) {
  return list
    .map((p, i) => ({ p, i }))
    .sort((a, b) => key(a.p) - key(b.p) || a.i - b.i)
    .map((x) => x.p);
}

const GENERIC =
  /^(img|image|dsc|dscn|dcim|pxl|photo|foto|bild|picture|scan|screenshot|bildschirmfoto|whatsapp|signal|telegram|page|seite|untitled|pictures|bilder|fotos|photos|downloads|desktop|schreibtisch|documents|dokumente|tmp|temp)\b/i;

/** A title from the shared start of the file names or the folder name. */
export function guessTitle(pictures, folder = '') {
  const stems = pictures.map((p) => stem(p.name));
  let prefix = stems[0] || '';
  for (const s of stems) {
    let i = 0;
    while (i < prefix.length && i < s.length && prefix[i].toLowerCase() === s[i].toLowerCase()) i++;
    prefix = prefix.slice(0, i);
  }
  const clean = (s) =>
    s
      .replace(/[\d_\-.()[\]#]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  for (const candidate of [clean(prefix), folder.replace(/[_]+/g, ' ').trim()]) {
    if (candidate.length >= 3 && !GENERIC.test(candidate)) {
      return candidate.charAt(0).toUpperCase() + candidate.slice(1);
    }
  }
  return t('pictureBookTitle', { date: new Date().toLocaleDateString(lang) });
}

/* ------------------------------------------------------------------------ */
/* EXIF capture time (browser only; the macOS app reads it natively)        */
/* ------------------------------------------------------------------------ */

/** DateTimeOriginal from a JPEG's EXIF block, as ms since 1970, or null. */
export async function readTakenTime(file) {
  if (!/jpe?g/i.test(file.type) && !/\.jpe?g$/i.test(file.name)) return null;
  try {
    const v = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
    if (v.getUint16(0) !== 0xffd8) return null;
    let off = 2;
    while (off + 10 < v.byteLength) {
      const marker = v.getUint16(off);
      if ((marker & 0xff00) !== 0xff00) return null;
      if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) return exifDate(v, off + 10);
      off += 2 + v.getUint16(off + 2);
    }
  } catch {
    // Truncated or unusual file: no capture time.
  }
  return null;
}

function exifDate(v, tiff) {
  const le = v.getUint16(tiff) === 0x4949;
  const u16 = (o) => v.getUint16(o, le);
  const u32 = (o) => v.getUint32(o, le);
  const find = (dir, tag) => {
    const n = u16(dir);
    for (let i = 0; i < n; i++) if (u16(dir + 2 + i * 12) === tag) return dir + 2 + i * 12;
    return null;
  };
  const ifd0 = tiff + u32(tiff + 4);
  const exifPtr = find(ifd0, 0x8769);
  const entry = (exifPtr !== null && find(tiff + u32(exifPtr + 8), 0x9003)) || find(ifd0, 0x0132);
  if (!entry) return null;
  const at = tiff + u32(entry + 8);
  let s = '';
  for (let i = 0; i < 19; i++) s += String.fromCharCode(v.getUint8(at + i));
  const m = /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)$/.exec(s);
  return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : null;
}

/* ------------------------------------------------------------------------ */
/* Finding the page (browser only; the macOS app uses Vision)               */
/* ------------------------------------------------------------------------ */

/**
 * Crops a photo of a page lying on a table down to the page: the colour all
 * round the edge is taken as the table, and the page is the block of rows
 * and columns that mostly differ from it. Pictures that already look like a
 * scan (or where nothing clear stands out) are kept whole.
 * Returns { src, aspect } — src is the cropped JPEG or the original file.
 */
export async function findPage(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { src: file, aspect: null }; // a format this browser can't read
  }
  const { width: W, height: H } = bitmap;
  const whole = { src: file, aspect: W / H };
  try {
    const box = pageBox(bitmap);
    if (!box) return whole;
    const scale = Math.min(1, (MAX_EDGE * 1.5) / Math.max(box.w * W, box.h * H));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(box.w * W * scale));
    canvas.height = Math.max(1, Math.round(box.h * H * scale));
    canvas.getContext('2d').drawImage(bitmap, box.x * W, box.y * H, box.w * W, box.h * H, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    const aspect = canvas.width / canvas.height;
    canvas.width = 0;
    return blob ? { src: blob, aspect } : whole;
  } finally {
    bitmap.close();
  }
}

/** The page's bounding box in normalised coordinates, or null for "keep it all". */
function pageBox(bitmap) {
  const scale = 320 / Math.max(bitmap.width, bitmap.height);
  const w = Math.max(8, Math.round(bitmap.width * scale));
  const h = Math.max(8, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  canvas.width = 0;

  // The table: the median colour of a ring round the edge.
  const ring = Math.max(2, Math.round(Math.min(w, h) * 0.03));
  const edge = [[], [], []];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= ring && x < w - ring && y >= ring && y < h - ring) continue;
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) edge[c].push(data[i + c]);
    }
  }
  const bg = edge.map(median);
  const lum = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2];
  if (lum > 200 && Math.max(...bg) - Math.min(...bg) < 30) return null; // white all round: a scan

  const dist = (i) => Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]);
  const spread = median(edge[0].map((_, k) => Math.abs(edge[0][k] - bg[0]) + Math.abs(edge[1][k] - bg[1]) + Math.abs(edge[2][k] - bg[2])));
  const limit = Math.max(45, spread * 3);
  const rows = new Array(h).fill(0);
  const cols = new Array(w).fill(0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (dist((y * w + x) * 4) > limit) {
        rows[y]++;
        cols[x]++;
      }
    }
  }
  const span = (counts, size) => {
    const full = counts.map((n) => n > size * 0.5);
    const first = full.indexOf(true);
    return first < 0 ? null : [first, full.lastIndexOf(true) + 1];
  };
  const ys = span(rows, w);
  const xs = span(cols, h);
  if (!ys || !xs) return null;
  const box = { x: xs[0] / w, y: ys[0] / h, w: (xs[1] - xs[0]) / w, h: (ys[1] - ys[0]) / h };
  const area = box.w * box.h;
  return area > 0.2 && area < 0.95 ? box : null;
}

/* ------------------------------------------------------------------------ */
/* PDF                                                                      */
/* ------------------------------------------------------------------------ */

/** Decodes a picture (any format the browser reads, EXIF-rotated) to a JPEG. */
async function toJpeg(src, maxEdge) {
  const url = typeof src === 'string' ? src : URL.createObjectURL(src);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // transparent PNGs go on white paper
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    const { width: w, height: h } = canvas;
    canvas.width = 0;
    if (!blob) throw new Error('encode failed');
    return { bytes: new Uint8Array(await blob.arrayBuffer()), w, h };
  } finally {
    if (url !== src) URL.revokeObjectURL(url);
  }
}

/**
 * Writes the pictures, in order, into a PDF with one picture per page.
 * All pages share one size (the most common page shape) so the book lines
 * up; double pages get a page twice as wide, which the book splits into a
 * left and a right page (the PDF is marked so it knows to). Pictures of a
 * different shape sit centred on white paper.
 * Returns { bytes, skipped } — pictures that can't be decoded are skipped.
 */
export async function makePictureBook(pictures, title, onProgress = () => {}) {
  const images = [];
  let skipped = 0;
  for (const [i, p] of pictures.entries()) {
    onProgress(t('makingBook', { n: i + 1, total: pictures.length }));
    try {
      const spread = Boolean(p.spread);
      images.push({ ...(await toJpeg(p.src, spread ? MAX_EDGE * 2 : MAX_EDGE)), spread });
    } catch {
      skipped++;
    }
  }
  if (!images.length) throw new Error(t('noPictures'));

  const singles = images.filter((im) => !im.spread).map((im) => im.w / im.h);
  const aspect = singles.length ? median(singles) : median(images.map((im) => im.w / im.h)) / 2;
  const H = PAGE_HEIGHT;
  const W = Math.round(H * aspect);
  const spreads = images.some((im) => im.spread);

  const { PDFDocument } = await import('pdf-lib'); // only needed here; keeps the main bundle small
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setCreator('PDBOOK');
  pdf.setProducer('PDBOOK');
  if (spreads) pdf.setKeywords([SPREADS_KEYWORD]);
  for (const im of images) {
    const jpg = await pdf.embedJpg(im.bytes);
    const pw = im.spread ? 2 * W : W;
    const page = pdf.addPage([pw, H]);
    // Nearly the page's shape: fill it (the overhang is cropped). Otherwise fit.
    const close = Math.abs(im.w / im.h / (pw / H) - 1) < 0.06;
    const s = (close ? Math.max : Math.min)(pw / im.w, H / im.h);
    const w = im.w * s;
    const h = im.h * s;
    page.drawImage(jpg, { x: (pw - w) / 2, y: (H - h) / 2, width: w, height: h });
  }
  return { bytes: await pdf.save(), skipped };
}

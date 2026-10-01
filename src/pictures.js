// Turns a pile of pictures (photos or scans of pages, or just photos) into a
// book: puts them in the right order, guesses a title and writes a PDF that
// the rest of the app opens like any other book.
//
// A picture is { name, src (File/Blob or URL), modified, taken, pageNumber },
// where `taken` is the capture time from the photo's EXIF data and
// `pageNumber` a page number printed on it (found by the macOS app with
// Vision text recognition). Missing values are null.
import { t, lang } from './i18n.js';

const MAX_EDGE = 2000; // longest side of a picture in the PDF, in pixels
const JPEG_QUALITY = 0.86;
const PAGE_HEIGHT = 842; // PDF points (A4 height)

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const stem = (name) => name.replace(/\.[^.]+$/, '');
const has = (v) => v !== null && v !== undefined && Number.isFinite(v);

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
/* PDF                                                                      */
/* ------------------------------------------------------------------------ */

/** Decodes a picture (any format the browser reads, EXIF-rotated) to a JPEG. */
async function toJpeg(src) {
  const url = typeof src === 'string' ? src : URL.createObjectURL(src);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
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
 * All pages share one size (the most common picture shape) so the book
 * lines up; pictures of a different shape sit centred on white paper.
 * Returns { bytes, skipped } — pictures that can't be decoded are skipped.
 */
export async function makePictureBook(pictures, title, onProgress = () => {}) {
  const images = [];
  let skipped = 0;
  for (const [i, p] of pictures.entries()) {
    onProgress(t('makingBook', { n: i + 1, total: pictures.length }));
    try {
      images.push(await toJpeg(p.src));
    } catch {
      skipped++;
    }
  }
  if (!images.length) throw new Error(t('noPictures'));

  const aspects = images.map((im) => im.w / im.h).sort((a, b) => a - b);
  const aspect = aspects[Math.floor(aspects.length / 2)];
  const H = PAGE_HEIGHT;
  const W = Math.round(H * aspect);

  const { PDFDocument } = await import('pdf-lib'); // only needed here; keeps the main bundle small
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setCreator('PDBOOK');
  pdf.setProducer('PDBOOK');
  for (const im of images) {
    const jpg = await pdf.embedJpg(im.bytes);
    const page = pdf.addPage([W, H]);
    // Nearly the page's shape: fill it (the overhang is cropped). Otherwise fit.
    const close = Math.abs(im.w / im.h / aspect - 1) < 0.06;
    const s = (close ? Math.max : Math.min)(W / im.w, H / im.h);
    const w = im.w * s;
    const h = im.h * s;
    page.drawImage(jpg, { x: (W - w) / 2, y: (H - h) / 2, width: w, height: h });
  }
  return { bytes: await pdf.save(), skipped };
}

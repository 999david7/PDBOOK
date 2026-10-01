import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const assets = `${import.meta.env.BASE_URL}pdfjs/`;

export async function openPdf(data) {
  const task = pdfjs.getDocument({
    data,
    cMapUrl: `${assets}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${assets}standard_fonts/`,
    wasmUrl: `${assets}wasm/`,
    iccUrl: `${assets}iccs/`,
  });
  return task.promise;
}

export async function readTitle(pdf, fileName) {
  let title = '';
  let author = '';
  try {
    const { info } = await pdf.getMetadata();
    title = (info?.Title || '').trim();
    author = (info?.Author || '').trim();
  } catch {
    // Metadata is optional.
  }
  // Ignore auto-generated junk titles like "Microsoft Word - draft3.docx".
  if (!title || /^(untitled|microsoft word|document\d*$)|\.(docx?|pages|indd|tex)$/i.test(title)) {
    title = fileName
      .replace(/\.pdf$/i, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return { title: title || 'Untitled', author };
}

/** Size (in PDF points) of every page, respecting /Rotate. */
export async function readPageSizes(pdf) {
  const sizes = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    sizes.push({ w: vp.width, h: vp.height });
  }
  return sizes;
}

/**
 * Renders a logical page (a whole PDF page, or the left/right half of a
 * two-page spread) into a new canvas whose width is `targetWidth` pixels.
 */
export async function renderLogicalPage(pdf, lp, targetWidth) {
  const page = await pdf.getPage(lp.pdfIndex + 1);
  const base = page.getViewport({ scale: 1 });
  const fullWidth = lp.half ? targetWidth * 2 : targetWidth;
  const viewport = page.getViewport({ scale: fullWidth / base.width });

  const full = document.createElement('canvas');
  full.width = Math.round(viewport.width);
  full.height = Math.round(viewport.height);
  await page.render({ canvas: full, viewport }).promise;

  if (!lp.half) return full;

  const half = document.createElement('canvas');
  half.width = Math.round(full.width / 2);
  half.height = full.height;
  const sx = lp.half === 'left' ? 0 : full.width - half.width;
  half.getContext('2d').drawImage(full, sx, 0, half.width, half.height, 0, 0, half.width, half.height);
  full.width = 0; // release memory early
  return half;
}

export async function countTextChars(pdf, pdfIndex) {
  try {
    const page = await pdf.getPage(pdfIndex + 1);
    const content = await page.getTextContent();
    let n = 0;
    for (const item of content.items) n += (item.str || '').replace(/\s/g, '').length;
    return n;
  } catch {
    return 0;
  }
}

/** Frees a document and its worker resources (pdf.js v6 moved destroy() to the loading task). */
export function closePdf(pdf) {
  pdf?.loadingTask?.destroy().catch(() => {});
}

// Generates public/sample.pdf: a small illustrated "book" used by the
// "Try a sample" button. Run with `npm run sample`.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const W = 396;
const H = 612;

const doc = await PDFDocument.create();
doc.setTitle('The Cartographer of Small Islands');
doc.setAuthor('PDBOOK Sample Press');

const serif = await doc.embedFont(StandardFonts.TimesRoman);
const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold);
const serifItalic = await doc.embedFont(StandardFonts.TimesRomanItalic);

const ink = rgb(0.13, 0.12, 0.11);
const navy = rgb(0.09, 0.16, 0.27);
const gold = rgb(0.86, 0.68, 0.33);

function centered(page, text, font, size, y, color) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (W - w) / 2, y, size, font, color });
}

function drawWaves(page, baseY, color, amp, count) {
  for (let i = 0; i < count; i++) {
    const y = baseY - i * 14;
    let d = `M 0 ${y}`;
    for (let x = 0; x <= W; x += 22) d += ` Q ${x + 11} ${y + (i % 2 ? amp : -amp)} ${x + 22} ${y}`;
    page.drawSvgPath(d, { borderColor: color, borderWidth: 1.2, borderOpacity: 0.55 });
  }
}

// ---- Front cover -------------------------------------------------------
{
  const p = doc.addPage([W, H]);
  p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: navy });
  // Sun
  p.drawCircle({ x: W / 2, y: 330, size: 70, color: gold, opacity: 0.95 });
  p.drawCircle({ x: W / 2, y: 330, size: 88, borderColor: gold, borderWidth: 1, opacity: 0 });
  // Islands
  p.drawEllipse({ x: 120, y: 250, xScale: 70, yScale: 22, color: rgb(0.2, 0.45, 0.38) });
  p.drawEllipse({ x: 285, y: 236, xScale: 50, yScale: 16, color: rgb(0.16, 0.38, 0.33) });
  drawWaves(p, 215, rgb(0.55, 0.75, 0.85), 5, 6);
  centered(p, 'THE CARTOGRAPHER', serifBold, 30, 510, gold);
  centered(p, 'of Small Islands', serifItalic, 24, 474, rgb(0.95, 0.92, 0.85));
  centered(p, 'A SAMPLE BOOK FOR PDBOOK', serif, 10, 60, rgb(0.75, 0.78, 0.85));
}

// ---- Interior ------------------------------------------------------------
const paragraphs = [
  'The harbour master kept a drawer of maps that nobody had asked for. Each one showed an island no larger than a kitchen table, drawn with the same care as a continent.',
  'He measured them at low tide with a knotted rope and a borrowed compass, then sat by the lamp and inked every rock, every tuft of grass, every place where a gull had decided to nest.',
  'Visitors laughed at first. Then they began to notice how the small maps made the sea feel smaller too, as if the whole horizon could be folded and carried home in a coat pocket.',
  'In winter the islands vanished under grey water and he redrew them from memory, which was not the same as drawing them wrong.',
];

function wrap(text, font, size, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

const chapters = ['The Drawer', 'Low Tide', 'Ink and Lamp', 'Gulls', 'Winter Maps', 'The Visitor'];
let folio = 1;
for (let c = 0; c < chapters.length; c++) {
  for (let side = 0; side < 2; side++) {
    const p = doc.addPage([W, H]);
    p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(0.995, 0.99, 0.975) });
    let y = H - 80;
    if (side === 0) {
      centered(p, `CHAPTER ${c + 1}`, serif, 10, y, rgb(0.5, 0.45, 0.4));
      y -= 30;
      centered(p, chapters[c], serifBold, 22, y, ink);
      y -= 40;
    } else if (c % 2 === 0) {
      // Illustration plate
      p.drawRectangle({ x: 48, y: y - 170, width: W - 96, height: 170, color: rgb(0.93, 0.95, 0.96) });
      p.drawEllipse({ x: W / 2, y: y - 100, xScale: 90, yScale: 28, color: rgb(0.62, 0.74, 0.62) });
      drawWaves(p, y - 135, rgb(0.35, 0.55, 0.7), 4, 2);
      centered(p, `Plate ${c / 2 + 1}. An island, surveyed at low tide.`, serifItalic, 9, y - 186, rgb(0.4, 0.4, 0.4));
      y -= 215;
    }
    for (let i = 0; y > 90; i++) {
      const para = paragraphs[(i + c + side) % paragraphs.length];
      for (const line of wrap(para, serif, 11.5, W - 110)) {
        if (y < 90) break;
        p.drawText(line, { x: 55, y, size: 11.5, font: serif, color: ink });
        y -= 16.5;
      }
      y -= 8;
    }
    centered(p, String(folio++), serif, 9, 40, rgb(0.45, 0.42, 0.4));
  }
}

// ---- Back cover --------------------------------------------------------
{
  const p = doc.addPage([W, H]);
  p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: navy });
  drawWaves(p, 200, rgb(0.55, 0.75, 0.85), 5, 4);
  centered(p, '"A map is a promise that', serifItalic, 16, 420, rgb(0.95, 0.92, 0.85));
  centered(p, 'somewhere is worth returning to."', serifItalic, 16, 398, rgb(0.95, 0.92, 0.85));
  p.drawCircle({ x: W / 2, y: 120, size: 18, color: gold });
}

mkdirSync(join(root, 'public'), { recursive: true });
writeFileSync(join(root, 'public', 'sample.pdf'), await doc.save());
console.log('Wrote public/sample.pdf');

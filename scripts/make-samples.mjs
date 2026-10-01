// Generates the five free sample books in public/samples/<lang>/ (plus an
// index.json per language). Original works written for PDBOOK; the text
// lives in sample-text.mjs. Run with `npm run samples`.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { TEXT } from './sample-text.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'samples');

const hex = (h) => rgb(((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255);
const PAPER = hex(0xfdfbf6);
const INK = hex(0x221f1c);
const MUTED = hex(0x7a7068);

/** Small toolkit shared by all books. */
let LANG = 'en';

async function makeBook({ title, author, width, height }) {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setAuthor(author);
  doc.setCreator('PDBOOK sample books');
  const f = {
    serif: await doc.embedFont(StandardFonts.TimesRoman),
    bold: await doc.embedFont(StandardFonts.TimesRomanBold),
    italic: await doc.embedFont(StandardFonts.TimesRomanItalic),
    sans: await doc.embedFont(StandardFonts.Helvetica),
    sansBold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const W = width;
  const H = height;
  let folio = 0;

  const t = {
    doc,
    f,
    W,
    H,
    page(bg = PAPER) {
      const p = doc.addPage([W, H]);
      p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: bg });
      return p;
    },
    centered(p, text, font, size, y, color = INK) {
      const w = font.widthOfTextAtSize(text, size);
      p.drawText(text, { x: (W - w) / 2, y, size, font, color });
    },
    wrap(text, font, size, maxWidth) {
      const lines = [];
      for (const para of text.split('\n')) {
        let line = '';
        for (const word of para.split(' ')) {
          const test = line ? `${line} ${word}` : word;
          if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
            lines.push(line);
            line = word;
          } else line = test;
        }
        lines.push(line);
      }
      return lines;
    },
    /** Draws wrapped text; returns the y below it. */
    text(p, text, { x = 50, y, size = 11.5, font = f.serif, color = INK, width = W - 100, leading = 1.45, center = false }) {
      for (const line of t.wrap(text, font, size, width)) {
        const lx = center ? (W - font.widthOfTextAtSize(line, size)) / 2 : x;
        p.drawText(line, { x: lx, y, size, font, color });
        y -= size * leading;
      }
      return y;
    },
    folio(p, color = MUTED) {
      folio += 1;
      t.centered(p, String(folio), f.serif, 9, 30, color);
    },
    async save(file) {
      writeFileSync(join(outDir, LANG, file), await doc.save());
    },
  };
  return t;
}

function waves(p, W, y0, color, amp, count, gap = 14, opacity = 0.55) {
  for (let i = 0; i < count; i++) {
    const y = y0 - i * gap;
    let d = `M 0 ${y}`;
    for (let x = 0; x <= W; x += 22) d += ` Q ${x + 11} ${y + (i % 2 ? amp : -amp)} ${x + 22} ${y}`;
    p.drawSvgPath(d, { borderColor: color, borderWidth: 1.2, borderOpacity: opacity });
  }
}

/* ======================================================================== */
/* 1. The Cartographer of Small Islands — a short story                    */
/* ======================================================================== */
async function cartographer(T) {
  const C = T.cartographer;
  const b = await makeBook({
    title: C.title,
    author: T.publisher,
    width: 396,
    height: 612,
  });
  const { f, W, H } = b;
  const navy = hex(0x172942);
  const gold = hex(0xdbae54);

  const cover = b.page(navy);
  cover.drawCircle({ x: W / 2, y: 330, size: 70, color: gold });
  cover.drawCircle({ x: W / 2, y: 330, size: 88, borderColor: gold, borderWidth: 1, opacity: 0 });
  cover.drawEllipse({ x: 120, y: 250, xScale: 70, yScale: 22, color: hex(0x33735f) });
  cover.drawEllipse({ x: 285, y: 236, xScale: 50, yScale: 16, color: hex(0x2a6154) });
  waves(cover, W, 215, hex(0x8cbfd9), 5, 6);
  b.centered(cover, C.coverTop, f.bold, 30, 510, gold);
  b.centered(cover, C.coverBottom, f.italic, 24, 474, hex(0xf2ebd9));
  b.centered(cover, C.kicker, f.serif, 10, 60, hex(0xbfc7d9));

  const chapters = C.chapters;

  chapters.forEach(([name, paras], c) => {
    const p = b.page();
    b.centered(p, `${C.chapter} ${c + 1}`, f.serif, 10, H - 90, MUTED);
    b.centered(p, name, f.bold, 22, H - 122, hex(0x222222));
    let y = H - 170;
    for (const para of paras) y = b.text(p, para, { x: 55, y, width: W - 110 }) - 10;
    b.folio(p);

    const q = b.page();
    let qy = H - 80;
    if (c % 2 === 0) {
      q.drawRectangle({ x: 48, y: qy - 170, width: W - 96, height: 170, color: hex(0xedf2f5) });
      q.drawEllipse({ x: W / 2, y: qy - 100, xScale: 90 - c * 8, yScale: 26, color: hex(0x9ebd9e) });
      waves(q, W, qy - 135, hex(0x598cb3), 4, 2);
      b.centered(q, C.plate.replace('{n}', c / 2 + 1), f.italic, 9, qy - 186, MUTED);
      qy -= 225;
    }
    const more = C.more;
    for (const para of more) qy = b.text(q, para, { x: 55, y: qy, width: W - 110 }) - 10;
    b.folio(q);
  });

  const back = b.page(navy);
  waves(back, W, 200, hex(0x8cbfd9), 5, 4);
  b.centered(back, C.backQuote[0], f.italic, 16, 420, hex(0xf2ebd9));
  b.centered(back, C.backQuote[1], f.italic, 16, 398, hex(0xf2ebd9));
  back.drawCircle({ x: W / 2, y: 120, size: 18, color: gold });
  await b.save(C.file);
  return { file: C.file, title: C.title, author: T.publisher };
}

/* ======================================================================== */
/* 2. The Clockmaker's Fox — a picture book                                */
/* ======================================================================== */
async function clockmakersFox(T) {
  const C = T.fox;
  const b = await makeBook({ title: C.title, author: T.publisher, width: 540, height: 540 });
  const { f, W, H } = b;
  const orange = hex(0xe07a2f);
  const dark = hex(0x2b1d14);
  const cream = hex(0xfbf3e4);

  function fox(p, cx, cy, s, tail = true) {
    if (tail) p.drawEllipse({ x: cx + 55 * s, y: cy - 10 * s, xScale: 45 * s, yScale: 18 * s, color: orange, rotate: { type: 'degrees', angle: 25 } });
    p.drawEllipse({ x: cx, y: cy - 20 * s, xScale: 42 * s, yScale: 30 * s, color: orange });
    p.drawCircle({ x: cx - 30 * s, y: cy + 18 * s, size: 22 * s, color: orange });
    p.drawSvgPath(`M ${-46 * s} ${-28 * s} L ${-40 * s} ${-58 * s} L ${-26 * s} ${-34 * s} Z`, { x: cx, y: cy, color: orange });
    p.drawSvgPath(`M ${-24 * s} ${-34 * s} L ${-14 * s} ${-60 * s} L ${-8 * s} ${-30 * s} Z`, { x: cx, y: cy, color: orange });
    p.drawCircle({ x: cx - 38 * s, y: cy + 22 * s, size: 3 * s, color: dark });
    p.drawCircle({ x: cx - 52 * s, y: cy + 12 * s, size: 3.5 * s, color: dark });
    p.drawEllipse({ x: cx + 85 * s, y: cy - 2 * s, xScale: 10 * s, yScale: 7 * s, color: cream, rotate: { type: 'degrees', angle: 25 } });
  }

  function clock(p, cx, cy, r, hour = 3) {
    p.drawCircle({ x: cx, y: cy, size: r, color: cream, borderColor: dark, borderWidth: r / 12 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      p.drawCircle({ x: cx + Math.sin(a) * r * 0.8, y: cy + Math.cos(a) * r * 0.8, size: r / 22, color: dark });
    }
    const ha = (hour / 12) * Math.PI * 2;
    p.drawLine({ start: { x: cx, y: cy }, end: { x: cx + Math.sin(ha) * r * 0.45, y: cy + Math.cos(ha) * r * 0.45 }, thickness: r / 14, color: dark });
    p.drawLine({ start: { x: cx, y: cy }, end: { x: cx, y: cy + r * 0.68 }, thickness: r / 20, color: dark });
  }

  const cover = b.page(hex(0x203a4c));
  for (let i = 0; i < 40; i++) {
    cover.drawCircle({ x: (i * 97) % W, y: 300 + ((i * 61) % 230), size: 1.4, color: cream, opacity: 0.7 });
  }
  clock(cover, W / 2, 300, 95, 10);
  fox(cover, W / 2 - 10, 140, 1.25);
  b.centered(cover, C.coverTitle, f.bold, C.coverTitle.length > 22 ? 34 : 40, 450, hex(0xf5c27a));
  b.centered(cover, C.kicker, f.sansBold, 11, 40, cream);

  const arts = ['clock', 'fox', 'both', 'fox', 'clock', 'both', 'fox', 'both'];
  const story = C.pages.map((text, i) => [text, arts[i]]);
  story.forEach(([text, art], i) => {
    const p = b.page(i % 2 ? hex(0xfdf6ea) : hex(0xf4f0e6));
    p.drawRectangle({ x: 40, y: 200, width: W - 80, height: 290, color: i % 2 ? hex(0xe8dcc6) : hex(0xdfe6dc) });
    if (art === 'clock' || art === 'both') clock(p, art === 'both' ? W / 2 + 110 : W / 2, 350, art === 'both' ? 70 : 100, 2 + i);
    if (art === 'fox' || art === 'both') fox(p, art === 'both' ? W / 2 - 70 : W / 2, 300, art === 'both' ? 1.1 : 1.5);
    b.text(p, text, { x: 60, y: 160, size: 17, width: W - 120, leading: 1.4, center: true });
    b.folio(p);
  });

  const end = b.page(hex(0xfdf6ea));
  b.centered(end, C.end, f.italic, 34, 290, dark);
  fox(end, W / 2, 200, 0.8);
  b.folio(end);

  const back = b.page(hex(0x203a4c));
  clock(back, W / 2, 300, 60, 6);
  b.centered(back, C.back, f.italic, 16, 180, cream);
  await b.save(C.file);
  return { file: C.file, title: C.title, author: T.publisher };
}

/* ======================================================================== */
/* 3. A Field Guide to Imaginary Birds                                     */
/* ======================================================================== */
async function fieldGuide(T) {
  const C = T.birds;
  const b = await makeBook({ title: C.title, author: T.publisher, width: 360, height: 576 });
  const { f, W, H } = b;
  const green = hex(0x2f4a3a);
  const sand = hex(0xe9dfc8);

  function bird(p, cx, cy, s, body, wing, beak = hex(0xe0a030), crest = false) {
    p.drawEllipse({ x: cx + 38 * s, y: cy - 6 * s, xScale: 26 * s, yScale: 8 * s, color: wing, rotate: { type: 'degrees', angle: -20 } });
    p.drawEllipse({ x: cx, y: cy, xScale: 42 * s, yScale: 30 * s, color: body });
    p.drawEllipse({ x: cx + 6 * s, y: cy + 4 * s, xScale: 24 * s, yScale: 14 * s, color: wing, rotate: { type: 'degrees', angle: -15 } });
    p.drawCircle({ x: cx - 38 * s, y: cy + 24 * s, size: 18 * s, color: body });
    p.drawCircle({ x: cx - 44 * s, y: cy + 28 * s, size: 3 * s, color: hex(0x111111) });
    p.drawSvgPath(`M ${-54 * s} ${-24 * s} L ${-72 * s} ${-20 * s} L ${-54 * s} ${-16 * s} Z`, { x: cx, y: cy, color: beak });
    if (crest) {
      for (let i = 0; i < 3; i++) {
        p.drawEllipse({ x: cx - (32 - i * 6) * s, y: cy + (46 + i * 3) * s, xScale: 3 * s, yScale: 12 * s, color: wing, rotate: { type: 'degrees', angle: -20 + i * 15 } });
      }
    }
    p.drawLine({ start: { x: cx - 6 * s, y: cy - 28 * s }, end: { x: cx - 10 * s, y: cy - 46 * s }, thickness: 2 * s, color: hex(0x5a4a3a) });
    p.drawLine({ start: { x: cx + 8 * s, y: cy - 28 * s }, end: { x: cx + 6 * s, y: cy - 46 * s }, thickness: 2 * s, color: hex(0x5a4a3a) });
  }

  const cover = b.page(green);
  cover.drawRectangle({ x: 24, y: 24, width: W - 48, height: H - 48, borderColor: sand, borderWidth: 1, opacity: 0 });
  bird(cover, W / 2 + 10, 260, 1.6, hex(0xd9614c), hex(0x8c2f2a), hex(0xf2c14e), true);
  b.centered(cover, C.coverTop, f.sansBold, 13, 460, sand);
  b.centered(cover, C.coverTitle, f.bold, 34, 420, hex(0xf6efe0));
  b.centered(cover, C.coverSub, f.italic, 12, 395, sand);

  const intro = b.page();
  b.centered(intro, C.introTitle, f.bold, 20, H - 90);
  b.text(intro, C.intro, { x: 40, y: H - 130, width: W - 80, size: 11.5 });
  b.folio(intro);

  const colors = [
    [0x88b0c8, 0x4a7590], [0x9a9a9a, 0x555a66], [0xd9614c, 0x8c2f2a], [0xb08a5a, 0x6e5233],
    [0xe0a030, 0xa86a1a], [0xf0ece0, 0xb8b0a0], [0x2d3550, 0x151a2b], [0x9c8160, 0x6b543a],
    [0x5b3c7a, 0x341f4d], [0x7fa36b, 0x4d6e3d], [0xc0c4cc, 0x80848c], [0xd8b4a0, 0x9a7260],
  ];
  const species = C.species.map(([name, habitat, call, notes], i) => [name, ...colors[i], habitat, call, notes]);
  species.forEach(([name, body, wing, habitat, call, notes], i) => {
    const p = b.page();
    p.drawRectangle({ x: 30, y: H - 290, width: W - 60, height: 230, color: hex(0xf1ece0) });
    bird(p, W / 2 + 10, H - 180, 1.2, hex(body), hex(wing), hex(0xe0a030), i % 3 === 2);
    b.centered(p, `No. ${String(i + 1).padStart(2, '0')}`, f.sans, 9, H - 315, MUTED);
    b.centered(p, name, f.bold, 19, H - 340);
    let y = H - 380;
    for (const [label, value] of [[C.labels[0], habitat], [C.labels[1], call], [C.labels[2], notes]]) {
      p.drawText(label.toUpperCase(), { x: 40, y, size: 8.5, font: f.sansBold, color: hex(0x5a7a62) });
      y = b.text(p, value, { x: 40, y: y - 15, width: W - 80, size: 12 }) - 10;
    }
    p.drawLine({ start: { x: 40, y: 70 }, end: { x: W - 40, y: 70 }, thickness: 0.5, color: hex(0xc9c0b0) });
    p.drawText(C.sightings, { x: 40, y: 55, size: 9, font: f.italic, color: MUTED });
    b.folio(p);
  });

  const back = b.page(green);
  bird(back, W / 2 + 10, H / 2, 0.8, hex(0xf0ece0), hex(0xb8b0a0));
  b.centered(back, C.back, f.italic, 15, H / 2 - 90, sand);
  await b.save(C.file);
  return { file: C.file, title: C.title, author: T.publisher };
}

/* ======================================================================== */
/* 4. Bread & Salt — simple recipes                                        */
/* ======================================================================== */
async function breadAndSalt(T) {
  const C = T.bread;
  const b = await makeBook({ title: C.title, author: T.publisher, width: 420, height: 595 });
  const { f, W, H } = b;
  const red = hex(0xa8382c);
  const cream = hex(0xf6ead2);

  const cover = b.page(red);
  cover.drawEllipse({ x: W / 2, y: 280, xScale: 120, yScale: 62, color: hex(0xd9a35f) });
  cover.drawEllipse({ x: W / 2, y: 292, xScale: 110, yScale: 48, color: hex(0xe8b874) });
  for (let i = -2; i <= 2; i++) {
    cover.drawLine({ start: { x: W / 2 + i * 38 - 14, y: 270 }, end: { x: W / 2 + i * 38 + 14, y: 318 }, thickness: 4, color: hex(0xb97e3e) });
  }
  b.centered(cover, C.coverTitle, f.sansBold, 38, 470, cream);
  b.centered(cover, C.coverSub, f.italic, 15, 438, cream);
  b.centered(cover, C.kicker, f.sans, 9, 50, hex(0xf0c9b8));

  const contents = b.page(cream);
  b.centered(contents, C.contents, f.bold, 24, H - 90, red);

  const recipes = C.recipes;

  let cy = H - 140;
  recipes.forEach(([name], i) => {
    contents.drawText(`${i + 1}.  ${name}`, { x: 70, y: cy, size: 14, font: f.serif, color: INK });
    const pg = String(i * 2 + 2);
    contents.drawText(pg, { x: W - 80, y: cy, size: 14, font: f.serif, color: MUTED });
    cy -= 32;
  });
  b.text(contents, C.contentsNote, { x: 70, y: cy - 30, width: W - 140, font: f.italic, size: 12, color: MUTED });
  b.folio(contents);

  recipes.forEach(([name, serves, ingredients, steps], i) => {
    const p = b.page(cream);
    p.drawRectangle({ x: 0, y: H - 150, width: W, height: 150, color: i % 2 ? hex(0xe3b56b) : hex(0xc9573f) });
    p.drawEllipse({ x: W - 90, y: H - 75, xScale: 50, yScale: 40, color: hex(0xffffff), opacity: 0.25 });
    p.drawText(name, { x: 40, y: H - 100, size: 26, font: f.bold, color: hex(0xffffff) });
    p.drawText(serves.toUpperCase(), { x: 40, y: H - 125, size: 10, font: f.sansBold, color: hex(0xfff3e0) });
    p.drawText(C.ingredients, { x: 40, y: H - 190, size: 9, font: f.sansBold, color: red });
    let y = H - 212;
    for (const ing of ingredients) {
      p.drawCircle({ x: 44, y: y + 4, size: 2, color: red });
      y = b.text(p, ing, { x: 54, y, width: W - 100, size: 12 }) - 4;
    }
    b.folio(p);

    const q = b.page(cream);
    q.drawText(C.method, { x: 40, y: H - 70, size: 9, font: f.sansBold, color: red });
    let qy = H - 100;
    steps.forEach((step, n) => {
      q.drawText(String(n + 1), { x: 40, y: qy, size: 18, font: f.bold, color: red });
      qy = b.text(q, step, { x: 70, y: qy, width: W - 110, size: 12.5 }) - 14;
    });
    b.folio(q);
  });

  const back = b.page(red);
  b.centered(back, C.back, f.italic, 18, H / 2, cream);
  await b.save(C.file);
  return { file: C.file, title: C.title, author: T.publisher };
}

/* ======================================================================== */
/* 5. Small Hours — poems                                                  */
/* ======================================================================== */
async function smallHours(T) {
  const C = T.poems;
  const b = await makeBook({ title: C.title, author: T.publisher, width: 360, height: 576 });
  const { f, W, H } = b;
  const plum = hex(0x2c2140);
  const moon = hex(0xf2e6c4);

  const cover = b.page(plum);
  for (let i = 0; i < 60; i++) {
    cover.drawCircle({ x: (i * 73) % W, y: 120 + ((i * 131) % 430), size: (i % 3) * 0.6 + 0.6, color: moon, opacity: 0.8 });
  }
  cover.drawCircle({ x: W / 2 + 40, y: 330, size: 60, color: moon });
  cover.drawCircle({ x: W / 2 + 62, y: 344, size: 52, color: plum });
  b.centered(cover, C.coverTitle, f.italic, 42, 180, moon);
  b.centered(cover, C.kicker, f.sans, 10, 150, hex(0xb9aed0));

  const poems = C.poems;
  poems.forEach(([title, body], i) => {
    const p = b.page(hex(0xfaf7f1));
    if (i % 4 === 0) {
      p.drawCircle({ x: W / 2, y: H - 70, size: 8, color: hex(0xd8cfe6) });
    }
    b.centered(p, title, f.italic, 20, H - 130, plum);
    p.drawLine({ start: { x: W / 2 - 20, y: H - 148 }, end: { x: W / 2 + 20, y: H - 148 }, thickness: 0.6, color: hex(0xb9aed0) });
    let y = H - 190;
    for (const line of body.split('\n')) {
      p.drawText(line, { x: 60, y, size: 13, font: f.serif, color: INK });
      y -= 22;
    }
    b.folio(p);
  });

  const back = b.page(plum);
  back.drawCircle({ x: W / 2, y: H / 2 + 40, size: 26, color: moon });
  b.centered(back, C.back, f.italic, 15, H / 2 - 30, moon);
  await b.save(C.file);
  return { file: C.file, title: C.title, author: T.publisher };
}

rmSync(outDir, { recursive: true, force: true });
for (const lang of Object.keys(TEXT)) {
  LANG = lang;
  mkdirSync(join(outDir, lang), { recursive: true });
  const books = [];
  for (const make of [cartographer, clockmakersFox, fieldGuide, breadAndSalt, smallHours]) books.push(await make(TEXT[lang]));
  writeFileSync(join(outDir, lang, 'index.json'), JSON.stringify(books, null, 2) + '\n');
  console.log(`Wrote ${books.length} ${lang} sample books to public/samples/${lang}/`);
}

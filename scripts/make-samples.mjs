// Generates the five free sample books in public/samples/ (plus index.json).
// They are original works written for PDBOOK. Run with `npm run samples`.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'samples');

const hex = (h) => rgb(((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255);
const PAPER = hex(0xfdfbf6);
const INK = hex(0x221f1c);
const MUTED = hex(0x7a7068);

/** Small toolkit shared by all books. */
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
      writeFileSync(join(outDir, file), await doc.save());
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
async function cartographer() {
  const b = await makeBook({
    title: 'The Cartographer of Small Islands',
    author: 'PDBOOK Sample Press',
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
  b.centered(cover, 'THE CARTOGRAPHER', f.bold, 30, 510, gold);
  b.centered(cover, 'of Small Islands', f.italic, 24, 474, hex(0xf2ebd9));
  b.centered(cover, 'A SHORT STORY', f.serif, 10, 60, hex(0xbfc7d9));

  const chapters = [
    ['The Drawer', [
      'The harbour master kept a drawer of maps that nobody had asked for. Each one showed an island no larger than a kitchen table, drawn with the same care as a continent.',
      'He had started the habit as a boy, when his father let him hold the end of the measuring chain. Now the drawer would barely close, and he had begun a second one.',
      'There were islands shaped like spoons and islands shaped like sleeping dogs. One, which he loved most, was the exact outline of his late wife’s left hand.',
    ]],
    ['Low Tide', [
      'He measured them at low tide with a knotted rope and a borrowed compass, wading out with his trousers rolled and his notebook tucked inside his hat.',
      'Low tide was honest. It showed the rocks the sea preferred to hide, and the long ribs of sand that joined one small island to the next for an hour or two each day.',
      'On those mornings the harbour looked less like water and more like a sentence that had not been finished.',
    ]],
    ['Ink and Lamp', [
      'In the evenings he sat by the lamp and inked every rock, every tuft of grass, every place where a gull had decided to nest.',
      'He used three nibs and one bottle of ink a year. The fine nib was for coastlines, the broad one for names, and the middle one for everything he was not yet sure about.',
      'He never used colour. Colour, he said, was a promise the weather would break.',
    ]],
    ['Visitors', [
      'Visitors laughed at first. A map of a rock, they said, was just a rock with extra steps.',
      'Then they began to notice how the small maps made the sea feel smaller too, as if the whole horizon could be folded and carried home in a coat pocket.',
      'A schoolteacher asked for a copy for her classroom. A fisherman asked for the one with the sunken wall, because his nets kept tearing there and now he knew why.',
    ]],
    ['Winter Maps', [
      'In winter the islands vanished under grey water and he redrew them from memory, which was not the same as drawing them wrong.',
      'Memory added a tree where there had only been a hope of one. It moved a rock a little closer to its neighbour, as if the two had grown fond of each other over the summer.',
      'He kept these winter maps in a separate folder, labelled in small letters: Possible.',
    ]],
    ['The Last Island', [
      'The spring he turned eighty, a new island rose a little north of the breakwater: a hump of shingle the storms had built and forgotten.',
      'He measured it slowly, resting between knots. He named it after nobody, which was the kindest name he knew, and he left a corner of the map blank on purpose.',
      'Somewhere, he wrote beneath it, there should always be a little room for the sea to change its mind.',
    ]],
  ];

  chapters.forEach(([name, paras], c) => {
    const p = b.page();
    b.centered(p, `CHAPTER ${c + 1}`, f.serif, 10, H - 90, MUTED);
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
      b.centered(q, `Plate ${c / 2 + 1}. An island, surveyed at low tide.`, f.italic, 9, qy - 186, MUTED);
      qy -= 225;
    }
    const more = [
      'The sea did not care for his maps, and he did not ask it to. A map, he believed, was a way of paying attention, and attention was the only rent he could afford.',
      'By the time the tide turned, he would be back on the quay with wet ankles and a page full of numbers, already arguing with himself about the shape of a single stone.',
      'Some days he drew nothing at all. He only watched, which he said was also a kind of drawing, only slower.',
    ];
    for (const para of more) qy = b.text(q, para, { x: 55, y: qy, width: W - 110 }) - 10;
    b.folio(q);
  });

  const back = b.page(navy);
  waves(back, W, 200, hex(0x8cbfd9), 5, 4);
  b.centered(back, '“A map is a promise that', f.italic, 16, 420, hex(0xf2ebd9));
  b.centered(back, 'somewhere is worth returning to.”', f.italic, 16, 398, hex(0xf2ebd9));
  back.drawCircle({ x: W / 2, y: 120, size: 18, color: gold });
  await b.save('01-the-cartographer-of-small-islands.pdf');
  return { file: '01-the-cartographer-of-small-islands.pdf', title: 'The Cartographer of Small Islands', author: 'PDBOOK Sample Press' };
}

/* ======================================================================== */
/* 2. The Clockmaker's Fox — a picture book                                */
/* ======================================================================== */
async function clockmakersFox() {
  const b = await makeBook({ title: 'The Clockmaker’s Fox', author: 'PDBOOK Sample Press', width: 540, height: 540 });
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
  b.centered(cover, 'The Clockmaker’s Fox', f.bold, 40, 450, hex(0xf5c27a));
  b.centered(cover, 'A PICTURE BOOK', f.sansBold, 11, 40, cream);

  const story = [
    ['In a town where every roof had a weathervane, there lived an old clockmaker named Ada, who mended clocks that had forgotten how to tick.', 'clock'],
    ['One winter night, a small red fox crept into her workshop. It was not looking for food. It was looking for the sound.', 'fox'],
    ['Tick, went the clocks on the wall. Tock, went the clocks on the shelf. The fox sat very still and listened with both ears.', 'both'],
    ['“You may stay,” said Ada, “if you help me listen.” So the fox learned which clocks were healthy and which ones limped.', 'fox'],
    ['A clock with a sticky spring went tick... ...tock. A clock with a loose gear went ticktickticktock. The fox could hear them all.', 'clock'],
    ['Soon people came from every street. “The fox can hear what’s wrong,” they said, and they brought their quiet, broken clocks.', 'both'],
    ['When spring came, the fox stood at the open door for a long time. The forest was ticking too, in its own green way.', 'fox'],
    ['“Go on,” said Ada. “But come back when something stops.” And every winter, when the town clocks grew slow, the fox came home.', 'both'],
  ];
  story.forEach(([text, art], i) => {
    const p = b.page(i % 2 ? hex(0xfdf6ea) : hex(0xf4f0e6));
    p.drawRectangle({ x: 40, y: 200, width: W - 80, height: 290, color: i % 2 ? hex(0xe8dcc6) : hex(0xdfe6dc) });
    if (art === 'clock' || art === 'both') clock(p, art === 'both' ? W / 2 + 110 : W / 2, 350, art === 'both' ? 70 : 100, 2 + i);
    if (art === 'fox' || art === 'both') fox(p, art === 'both' ? W / 2 - 70 : W / 2, 300, art === 'both' ? 1.1 : 1.5);
    b.text(p, text, { x: 60, y: 160, size: 17, width: W - 120, leading: 1.4, center: true });
    b.folio(p);
  });

  const end = b.page(hex(0xfdf6ea));
  b.centered(end, 'The End', f.italic, 34, 290, dark);
  fox(end, W / 2, 200, 0.8);
  b.folio(end);

  const back = b.page(hex(0x203a4c));
  clock(back, W / 2, 300, 60, 6);
  b.centered(back, 'For everyone who listens closely.', f.italic, 16, 180, cream);
  await b.save('02-the-clockmakers-fox.pdf');
  return { file: '02-the-clockmakers-fox.pdf', title: 'The Clockmaker’s Fox', author: 'PDBOOK Sample Press' };
}

/* ======================================================================== */
/* 3. A Field Guide to Imaginary Birds                                     */
/* ======================================================================== */
async function fieldGuide() {
  const b = await makeBook({ title: 'A Field Guide to Imaginary Birds', author: 'PDBOOK Sample Press', width: 360, height: 576 });
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
  b.centered(cover, 'A FIELD GUIDE TO', f.sansBold, 13, 460, sand);
  b.centered(cover, 'Imaginary Birds', f.bold, 34, 420, hex(0xf6efe0));
  b.centered(cover, 'Twelve species you will never see', f.italic, 12, 395, sand);

  const intro = b.page();
  b.centered(intro, 'How to Use This Guide', f.bold, 20, H - 90);
  b.text(intro,
    'Every bird in this book has been observed by at least one person who was not quite paying attention. Each entry lists where the bird is said to live, what it is said to sound like, and the best time to fail to see it.\nReaders are encouraged to keep their own notes in the margins. Sightings cannot be confirmed, but they can be enjoyed.',
    { x: 40, y: H - 130, width: W - 80, size: 11.5 });
  b.folio(intro);

  const species = [
    ['Teacup Warbler', 0x88b0c8, 0x4a7590, 'Kitchen windowsills, early morning.', 'A soft clink, like a spoon set down.', 'Only sings when the kettle is about to boil.'],
    ['Lesser Umbrella Heron', 0x9a9a9a, 0x555a66, 'Bus stops during light drizzle.', 'A papery flap.', 'Stands on one leg and pretends to be closed.'],
    ['Crested Daydream', 0xd9614c, 0x8c2f2a, 'The last row of any classroom.', 'A long, unfinished hum.', 'Vanishes the moment it is named aloud.'],
    ['Library Owl', 0xb08a5a, 0x6e5233, 'Between the shelves of unread books.', 'A disapproving “hush”.', 'Nests in returned books with bent corners.'],
    ['Copper Lantern Finch', 0xe0a030, 0xa86a1a, 'Harbours at dusk.', 'A low, warm whistle.', 'Its feathers are said to glow when someone is late home.'],
    ['Paper Swift', 0xf0ece0, 0xb8b0a0, 'Above desks near open windows.', 'The rustle of a page turning.', 'Migrates every time a letter is sent.'],
    ['Midnight Plover', 0x2d3550, 0x151a2b, 'Empty beaches under a new moon.', 'Two notes, then a long pause.', 'Visible only out of the corner of the eye.'],
    ['Common Somewhere Sparrow', 0x9c8160, 0x6b543a, 'Everywhere you are not.', 'A cheerful, distant chirp.', 'The most widespread imaginary bird.'],
    ['Velvet Thunderbird', 0x5b3c7a, 0x341f4d, 'Hilltops before a storm.', 'A rumble felt in the chest.', 'Children report it more often than adults.'],
    ['Garden Muddle', 0x7fa36b, 0x4d6e3d, 'Under hedges, near lost gloves.', 'A confused, three-note question.', 'Often found sitting on the thing you are looking for.'],
    ['Silver-Tongued Rumourbird', 0xc0c4cc, 0x80848c, 'Markets, staircases, doorways.', 'A whisper that changes each time.', 'No two reports agree, which proves its existence.'],
    ['Quiet Hour Wren', 0xd8b4a0, 0x9a7260, 'Wherever someone is reading.', 'None. It is the silence itself.', 'You are probably near one now.'],
  ];
  species.forEach(([name, body, wing, habitat, call, notes], i) => {
    const p = b.page();
    p.drawRectangle({ x: 30, y: H - 290, width: W - 60, height: 230, color: hex(0xf1ece0) });
    bird(p, W / 2 + 10, H - 180, 1.2, hex(body), hex(wing), hex(0xe0a030), i % 3 === 2);
    b.centered(p, `No. ${String(i + 1).padStart(2, '0')}`, f.sans, 9, H - 315, MUTED);
    b.centered(p, name, f.bold, 19, H - 340);
    let y = H - 380;
    for (const [label, value] of [['Habitat', habitat], ['Call', call], ['Field notes', notes]]) {
      p.drawText(label.toUpperCase(), { x: 40, y, size: 8.5, font: f.sansBold, color: hex(0x5a7a62) });
      y = b.text(p, value, { x: 40, y: y - 15, width: W - 80, size: 12 }) - 10;
    }
    p.drawLine({ start: { x: 40, y: 70 }, end: { x: W - 40, y: 70 }, thickness: 0.5, color: hex(0xc9c0b0) });
    p.drawText('My sightings:', { x: 40, y: 55, size: 9, font: f.italic, color: MUTED });
    b.folio(p);
  });

  const back = b.page(green);
  bird(back, W / 2 + 10, H / 2, 0.8, hex(0xf0ece0), hex(0xb8b0a0));
  b.centered(back, 'Keep looking up.', f.italic, 15, H / 2 - 90, sand);
  await b.save('03-a-field-guide-to-imaginary-birds.pdf');
  return { file: '03-a-field-guide-to-imaginary-birds.pdf', title: 'A Field Guide to Imaginary Birds', author: 'PDBOOK Sample Press' };
}

/* ======================================================================== */
/* 4. Bread & Salt — simple recipes                                        */
/* ======================================================================== */
async function breadAndSalt() {
  const b = await makeBook({ title: 'Bread & Salt: Simple Recipes', author: 'PDBOOK Sample Press', width: 420, height: 595 });
  const { f, W, H } = b;
  const red = hex(0xa8382c);
  const cream = hex(0xf6ead2);

  const cover = b.page(red);
  cover.drawEllipse({ x: W / 2, y: 280, xScale: 120, yScale: 62, color: hex(0xd9a35f) });
  cover.drawEllipse({ x: W / 2, y: 292, xScale: 110, yScale: 48, color: hex(0xe8b874) });
  for (let i = -2; i <= 2; i++) {
    cover.drawLine({ start: { x: W / 2 + i * 38 - 14, y: 270 }, end: { x: W / 2 + i * 38 + 14, y: 318 }, thickness: 4, color: hex(0xb97e3e) });
  }
  b.centered(cover, 'BREAD & SALT', f.sansBold, 38, 470, cream);
  b.centered(cover, 'Simple recipes for ordinary days', f.italic, 15, 438, cream);
  b.centered(cover, 'A PDBOOK SAMPLE', f.sans, 9, 50, hex(0xf0c9b8));

  const contents = b.page(cream);
  b.centered(contents, 'Contents', f.bold, 24, H - 90, red);

  const recipes = [
    ['Skillet Flatbread', 'Makes 6', ['250 g plain flour', '1 tsp salt', '1 tsp baking powder', '150 ml warm water', '2 tbsp olive oil'],
      ['Mix the flour, salt and baking powder in a bowl.', 'Add the water and oil and stir until a soft dough forms.', 'Knead for two minutes, then rest it under a towel for 15 minutes.', 'Divide into six balls and roll each one thin.', 'Cook in a dry, hot pan for about a minute per side, until puffed and spotted brown.']],
    ['Plain Tomato Soup', 'Serves 4', ['2 tbsp olive oil', '1 onion, chopped', '2 cloves garlic, sliced', '800 g canned tomatoes', '500 ml vegetable stock', 'Salt and pepper'],
      ['Soften the onion in the oil over medium heat for 8 minutes.', 'Add the garlic and cook one minute more.', 'Add the tomatoes and stock and simmer for 20 minutes.', 'Blend until smooth and season to taste.', 'Serve with flatbread for dipping.']],
    ['Lemon Rice', 'Serves 3', ['200 g long-grain rice', '1 tbsp butter or oil', '1 lemon, zest and juice', 'A handful of parsley', 'Salt'],
      ['Rinse the rice until the water runs clear.', 'Cook it with 400 ml salted water, covered, on low heat for 12 minutes.', 'Turn off the heat and leave it covered for 5 minutes.', 'Fork through the butter, lemon zest and juice.', 'Finish with chopped parsley.']],
    ['Roasted Vegetables', 'Serves 4', ['1 kg mixed vegetables (carrots, peppers, onions, potatoes)', '3 tbsp olive oil', '1 tsp salt', '1 tsp dried thyme'],
      ['Heat the oven to 220 °C.', 'Cut the vegetables into similar-sized pieces.', 'Toss with the oil, salt and thyme on a large tray.', 'Roast for 35 to 40 minutes, turning once, until browned at the edges.']],
    ['Sunday Pancakes', 'Makes 8', ['150 g plain flour', '1 tbsp sugar', '2 tsp baking powder', 'A pinch of salt', '1 egg', '200 ml milk', '1 tbsp melted butter'],
      ['Whisk the dry ingredients together.', 'Beat the egg, milk and butter in a jug.', 'Pour the wet into the dry and stir until just combined; a few lumps are fine.', 'Cook ladlefuls in a lightly oiled pan until bubbles appear, then flip.', 'Keep warm in a low oven until all are cooked.']],
    ['Oat Biscuits', 'Makes 16', ['100 g butter', '75 g brown sugar', '1 tbsp honey', '125 g rolled oats', '100 g plain flour', '1/2 tsp baking soda'],
      ['Heat the oven to 180 °C and line a tray.', 'Melt the butter, sugar and honey together.', 'Stir in the oats, flour and baking soda.', 'Roll into walnut-sized balls and flatten slightly on the tray.', 'Bake for 12 minutes, until golden. Cool before eating.']],
  ];

  let cy = H - 140;
  recipes.forEach(([name], i) => {
    contents.drawText(`${i + 1}.  ${name}`, { x: 70, y: cy, size: 14, font: f.serif, color: INK });
    const pg = String(i * 2 + 2);
    contents.drawText(pg, { x: W - 80, y: cy, size: 14, font: f.serif, color: MUTED });
    cy -= 32;
  });
  b.text(contents, 'Nothing here is difficult. These are the recipes you make when you want something good without making a fuss about it.', { x: 70, y: cy - 30, width: W - 140, font: f.italic, size: 12, color: MUTED });
  b.folio(contents);

  recipes.forEach(([name, serves, ingredients, steps], i) => {
    const p = b.page(cream);
    p.drawRectangle({ x: 0, y: H - 150, width: W, height: 150, color: i % 2 ? hex(0xe3b56b) : hex(0xc9573f) });
    p.drawEllipse({ x: W - 90, y: H - 75, xScale: 50, yScale: 40, color: hex(0xffffff), opacity: 0.25 });
    p.drawText(name, { x: 40, y: H - 100, size: 26, font: f.bold, color: hex(0xffffff) });
    p.drawText(serves.toUpperCase(), { x: 40, y: H - 125, size: 10, font: f.sansBold, color: hex(0xfff3e0) });
    p.drawText('INGREDIENTS', { x: 40, y: H - 190, size: 9, font: f.sansBold, color: red });
    let y = H - 212;
    for (const ing of ingredients) {
      p.drawCircle({ x: 44, y: y + 4, size: 2, color: red });
      y = b.text(p, ing, { x: 54, y, width: W - 100, size: 12 }) - 4;
    }
    b.folio(p);

    const q = b.page(cream);
    q.drawText('METHOD', { x: 40, y: H - 70, size: 9, font: f.sansBold, color: red });
    let qy = H - 100;
    steps.forEach((step, n) => {
      q.drawText(String(n + 1), { x: 40, y: qy, size: 18, font: f.bold, color: red });
      qy = b.text(q, step, { x: 70, y: qy, width: W - 110, size: 12.5 }) - 14;
    });
    b.folio(q);
  });

  const back = b.page(red);
  b.centered(back, 'Cook simply. Share generously.', f.italic, 18, H / 2, cream);
  await b.save('04-bread-and-salt.pdf');
  return { file: '04-bread-and-salt.pdf', title: 'Bread & Salt: Simple Recipes', author: 'PDBOOK Sample Press' };
}

/* ======================================================================== */
/* 5. Small Hours — poems                                                  */
/* ======================================================================== */
async function smallHours() {
  const b = await makeBook({ title: 'Small Hours: Twelve Short Poems', author: 'PDBOOK Sample Press', width: 360, height: 576 });
  const { f, W, H } = b;
  const plum = hex(0x2c2140);
  const moon = hex(0xf2e6c4);

  const cover = b.page(plum);
  for (let i = 0; i < 60; i++) {
    cover.drawCircle({ x: (i * 73) % W, y: 120 + ((i * 131) % 430), size: (i % 3) * 0.6 + 0.6, color: moon, opacity: 0.8 });
  }
  cover.drawCircle({ x: W / 2 + 40, y: 330, size: 60, color: moon });
  cover.drawCircle({ x: W / 2 + 62, y: 344, size: 52, color: plum });
  b.centered(cover, 'Small Hours', f.italic, 42, 180, moon);
  b.centered(cover, 'TWELVE SHORT POEMS', f.sans, 10, 150, hex(0xb9aed0));

  const poems = [
    ['Kettle', 'Before the house is quite awake\nthe kettle clears its throat,\nand everything I meant to say\nturns into steam and floats.'],
    ['Lighthouse', 'All night it says one word\nto ships it will not meet:\nhere, here, here—\nas if that were enough to keep.'],
    ['Inventory', 'One cup, one chair, one window,\none slow and patient plant.\nI count them like a sleepless child\nwho counts what she still can’t.'],
    ['Snow', 'The snow came down to listen.\nIt settled on the street\nand held its breath so long that\nthe town forgot its feet.'],
    ['Train', 'A train goes by at two a.m.\nwith no one, I suppose, aboard—\njust lit-up windows, carrying\nthe dark from town to town, toward.'],
    ['Library', 'The books are mostly sleeping.\nA few are reading me.\nI turn a page, and somewhere\na sentence turns to see.'],
    ['Small Hours', 'These are the hours too small for clocks,\nthe ones you hold, not keep:\nthe space between a thought and word,\nthe hallway into sleep.'],
    ['Letter', 'I wrote to you and didn’t send it.\nIt waits inside a drawer,\nwhere unsent letters learn the things\nthat letters are for.'],
    ['Rain on a Skylight', 'Someone is typing on the roof\nin a language made of glass.\nI cannot read a word of it.\nI let the paragraphs pass.'],
    ['Moth', 'The moth is in love with the lamp\nthe way I am with June:\nfoolishly, completely,\nand far too soon.'],
    ['Map', 'My grandfather drew islands\nno bigger than a shoe.\nHe said the smallest places\nare where the sea speaks true.'],
    ['Morning', 'And then the light comes, ordinary,\nand pours itself like tea.\nThe night puts down what it was holding.\nSo, finally, do we.'],
  ];
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
  b.centered(back, 'Read slowly. It’s late.', f.italic, 15, H / 2 - 30, moon);
  await b.save('05-small-hours.pdf');
  return { file: '05-small-hours.pdf', title: 'Small Hours: Twelve Short Poems', author: 'PDBOOK Sample Press' };
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const books = [];
for (const make of [cartographer, clockmakersFox, fieldGuide, breadAndSalt, smallHours]) books.push(await make());
writeFileSync(join(outDir, 'index.json'), JSON.stringify(books, null, 2) + '\n');
console.log(`Wrote ${books.length} sample books to public/samples/`);

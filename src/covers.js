// Colourful covers generated for PDFs that don't have a cover of their own.
// Bright, friendly colours: [cover, lettering]
const CLOTH = [
  ['#ff6b6b', '#fffaf0'],
  ['#4aa8ff', '#fffbe6'],
  ['#1fb5a8', '#fff8dc'],
  ['#8c6cf2', '#fff3c4'],
  ['#ff9f43', '#fffdf5'],
  ['#5cbf4a', '#fffef2'],
];

function clothFor(title) {
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CLOTH[h % CLOTH.length];
}

function ornament() {
  const orn = document.createElement('div');
  orn.className = 'gen-ornament';
  orn.textContent = '★';
  return orn;
}

export function makeCover(title, author = '') {
  const [bg, fg] = clothFor(title);
  const el = document.createElement('div');
  el.className = 'gen-cover';
  el.style.setProperty('--cloth', bg);
  el.style.setProperty('--foil', fg);
  const frame = document.createElement('div');
  frame.className = 'gen-frame';
  const rule = document.createElement('div');
  rule.className = 'gen-rule';
  const h = document.createElement('h2');
  h.textContent = title;
  // Shrink for long titles, and for long single words so they don't split.
  const longest = Math.max(...title.split(/\s+/).map((w) => w.length));
  const bySize = title.length > 60 ? 0.75 : title.length > 30 ? 0.95 : 1.2;
  const byWord = longest > 14 ? 0.6 : longest > 11 ? 0.72 : longest > 8 ? 0.9 : 1.2;
  h.style.fontSize = `${Math.min(bySize, byWord)}em`;
  frame.append(rule, h);
  if (author) {
    const a = document.createElement('p');
    a.textContent = author;
    frame.append(a);
  }
  frame.append(ornament());
  el.append(frame);
  return el;
}

export function makeBackCover(title) {
  const [bg, fg] = clothFor(title);
  const el = document.createElement('div');
  el.className = 'gen-cover gen-back';
  el.style.setProperty('--cloth', bg);
  el.style.setProperty('--foil', fg);
  el.append(ornament());
  return el;
}

/** Fills a page the layout had to leave empty, so it looks meant to be. */
export function makeFiller() {
  const el = document.createElement('div');
  el.className = 'filler';
  const badge = document.createElement('div');
  badge.className = 'filler-badge';
  badge.textContent = '★';
  el.append(badge);
  return el;
}

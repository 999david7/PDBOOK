// Cloth-bound covers generated for PDFs that don't have a cover of their own.
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

function ornament() {
  const orn = document.createElement('div');
  orn.className = 'gen-ornament';
  orn.textContent = '❦';
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

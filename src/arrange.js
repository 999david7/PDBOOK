// The "make a book from pictures" sheet: shows the pictures in the order
// they were sorted into, lets you drag them around (or Shift+←/→), remove
// ones you don't want, switch a picture between single and double page and
// name the book.
import { t } from './i18n.js';
import { markSpreads, turnPicture } from './pictures.js';

const $ = (id) => document.getElementById(id);
const els = {
  root: $('arrange'),
  how: $('arrangeHow'),
  name: $('arrangeName'),
  grid: $('arrangeGrid'),
  count: $('arrangeCount'),
  cancel: $('arrangeCancel'),
  make: $('arrangeMake'),
};

let session = null; // { items, urls, resolve }

export const isArranging = () => session !== null;

/**
 * Opens the sheet. Resolves with { items, title } when the user clicks
 * "Make Book", or null when they cancel.
 */
export function arrange(items, { method, title }) {
  session?.resolve(null);
  return new Promise((resolve) => {
    session = { items: [...items], urls: new Map(), resolve };
    const spreads = items.filter((p) => p.spread).length;
    els.how.textContent = [t(`sortedBy_${method}`), spreads && t('spreadsFound', { n: spreads }), t('arrangeHint')]
      .filter(Boolean)
      .join(' ');
    els.name.value = title;
    els.root.hidden = false;
    render();
    els.make.focus();
  });
}

function close(result) {
  if (!session) return;
  for (const [src, url] of session.urls) if (url !== src) URL.revokeObjectURL(url);
  const { resolve } = session;
  session = null;
  els.root.hidden = true;
  els.grid.replaceChildren();
  resolve(result);
}

function urlFor(src) {
  if (!session.urls.has(src)) session.urls.set(src, typeof src === 'string' ? src : URL.createObjectURL(src));
  return session.urls.get(src);
}

function render(focusIndex = -1) {
  const { items } = session;
  els.count.textContent = t('pictureCount', { n: items.length });
  els.make.disabled = items.length === 0;
  els.grid.replaceChildren(...items.map(tile));
  if (focusIndex >= 0) els.grid.children[Math.min(focusIndex, items.length - 1)]?.focus();
}

function tile(p, i) {
  const li = document.createElement('li');
  li.className = p.spread ? 'pic spread' : 'pic';
  li.tabIndex = 0;
  li.draggable = true;
  li.title = p.name;
  li.dataset.index = String(i);

  const img = document.createElement('img');
  img.src = urlFor(p.src);
  img.alt = p.name;
  img.draggable = false;
  img.decoding = 'async';
  img.loading = 'lazy';
  // Pictures the browser can't show (e.g. HEIC outside Safari) can't go in the book.
  img.addEventListener('error', () => {
    const at = session?.items.indexOf(p) ?? -1;
    if (at >= 0) {
      session.items.splice(at, 1);
      render();
    }
  });

  const num = document.createElement('span');
  num.className = 'pic-num';
  num.textContent = String(i + 1);

  const remove = document.createElement('button');
  remove.className = 'pic-remove';
  remove.type = 'button';
  remove.title = t('removePicture');
  remove.setAttribute('aria-label', remove.title);
  remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>';
  remove.addEventListener('click', (e) => {
    e.stopPropagation();
    session.items.splice(i, 1);
    render(i);
  });

  const spread = document.createElement('button');
  spread.className = 'pic-spread';
  spread.type = 'button';
  spread.title = t(p.spread ? 'spreadOn' : 'spreadOff');
  spread.setAttribute('aria-label', spread.title);
  spread.setAttribute('aria-pressed', String(Boolean(p.spread)));
  spread.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.5C10 5 7 4.5 3 5v13c4-.5 7 0 9 1.5 2-1.5 5-2 9-1.5V5c-4-.5-7 0-9 1.5zM12 6.5v13" /></svg>';
  spread.addEventListener('click', (e) => {
    e.stopPropagation();
    p.spread = !p.spread;
    render(i);
  });

  const turn = document.createElement('button');
  turn.className = 'pic-turn';
  turn.type = 'button';
  turn.title = t('turnPicture');
  turn.setAttribute('aria-label', turn.title);
  turn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12a7 7 0 1 1-2.05-4.95M19 4v4h-4" /></svg>';
  turn.addEventListener('click', async (e) => {
    e.stopPropagation();
    turn.disabled = true;
    await turnPicture(p);
    if (!session?.items.includes(p)) return;
    markSpreads(session.items, p);
    render(session.items.indexOf(p));
  });

  li.append(img, num, remove, spread, turn);
  if (Number.isFinite(p.pageNumber)) {
    const page = document.createElement('span');
    page.className = 'pic-page';
    page.textContent = t('pageShort', { n: p.pageNumber });
    li.append(page);
  }
  return li;
}

function move(from, to) {
  const { items } = session;
  if (from === to || to < 0 || to > items.length) return;
  const [p] = items.splice(from, 1);
  items.splice(to > from ? to - 1 : to, 0, p);
}

/* Drag to reorder. Dropping on the left half of a tile puts it before. */
let dragFrom = -1;

els.grid.addEventListener('dragstart', (e) => {
  const li = e.target.closest?.('.pic');
  if (!li) return;
  dragFrom = Number(li.dataset.index);
  li.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', li.title);
});

els.grid.addEventListener('dragend', () => {
  dragFrom = -1;
  for (const el of els.grid.querySelectorAll('.dragging, .drop-before, .drop-after')) {
    el.classList.remove('dragging', 'drop-before', 'drop-after');
  }
});

function dropTarget(e) {
  const li = e.target.closest?.('.pic');
  if (!li) return null;
  const r = li.getBoundingClientRect();
  const before = e.clientX < r.left + r.width / 2;
  const index = Number(li.dataset.index) + (before ? 0 : 1);
  return { li, before, index };
}

els.grid.addEventListener('dragover', (e) => {
  if (dragFrom < 0) return;
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'move';
  for (const el of els.grid.querySelectorAll('.drop-before, .drop-after')) el.classList.remove('drop-before', 'drop-after');
  const target = dropTarget(e);
  target?.li.classList.add(target.before ? 'drop-before' : 'drop-after');
});

els.grid.addEventListener('drop', (e) => {
  if (dragFrom < 0) return;
  e.preventDefault();
  e.stopPropagation();
  const target = dropTarget(e);
  const from = dragFrom;
  dragFrom = -1;
  if (!target) return render();
  move(from, target.index);
  render();
});

els.grid.addEventListener('keydown', (e) => {
  const li = e.target.closest?.('.pic');
  if (!li) return;
  const i = Number(li.dataset.index);
  if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    e.preventDefault();
    const to = e.key === 'ArrowLeft' ? i - 1 : i + 2;
    if (to < 0 || to > session.items.length) return;
    move(i, to);
    render(e.key === 'ArrowLeft' ? i - 1 : i + 1);
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    els.grid.children[i + (e.key === 'ArrowLeft' ? -1 : 1)]?.focus();
  } else if (e.key === 'Backspace' || e.key === 'Delete') {
    e.preventDefault();
    session.items.splice(i, 1);
    render(i);
  }
});

els.cancel.addEventListener('click', () => close(null));
els.make.addEventListener('click', () => {
  if (!session?.items.length) return;
  const title = els.name.value.trim() || els.name.placeholder;
  close({ items: session.items, title });
});
els.root.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') close(null);
  else if (e.key === 'Enter' && e.target === els.name) els.make.click();
});

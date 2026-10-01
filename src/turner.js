// Drives StPageFlip's fold physics directly so page turns feel continuous:
//  - drag from anywhere on a page; the corner follows the pointer (smoothed)
//  - release decides by position *and* flick velocity, then eases out
//  - clicks, keys and arrows turn along an eased arc instead of a straight,
//    constant-speed line
//  - trackpad two-finger swipes curl the page live, momentum included
//
// All coordinates handed to the library are "global" (relative to its
// .stf__block element). Internally we work in the library's page space:
// origin on the spine, x = +pageWidth at the outer edge of the turning page,
// x <= 0 once the page has passed the spine.

export const FORWARD = 0;
export const BACK = 1;

const FULL_TURN_MS = 820;
const QUEUED_TURN_MS = 480;
const DRAG_GAIN = 1.15;
const WHEEL_GAIN = 1.5;
const FOLLOW = 0.32; // per-frame smoothing toward the pointer at 60 fps
const TAP_SLOP = 5;

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

export class PageTurner {
  /**
   * @param {object} o
   * @param {HTMLElement} o.host    element containing the PageFlip block
   * @param {() => any}   o.getFlip current PageFlip instance (or null)
   * @param {(dir:number) => boolean} o.canTurn
   */
  constructor({ host, getFlip, canTurn }) {
    this.host = host;
    this.getFlip = getFlip;
    this.canTurn = canTurn;
    this.mode = null; // null | 'drag' | 'wheel' | 'tween'
    this.queued = null;
    this.gesture = null;
    this.raf = 0;
    this.wheel = { locked: false, quiet: 0, end: 0, acc: 0, vAcc: 0, vReset: 0 };
    this.bind();
  }

  get busy() {
    return this.mode !== null;
  }

  /** Turn one page with an eased, arcing animation. */
  turn(dir, corner = 'bottom') {
    if (this.mode) {
      this.queued = { dir, corner };
      return;
    }
    if (!this.begin(dir, corner)) return;
    const { pw, h } = this.geom();
    const fast = this.fastNext;
    this.fastNext = false;
    const ms = reduceMotion?.matches ? 1 : fast ? QUEUED_TURN_MS : FULL_TURN_MS;
    const lift = (corner === 'bottom' ? -1 : 1) * h * 0.16;
    this.mode = 'tween';
    this.tween({ x: -pw + 1, y: this.p0.y }, ms, easeInOutCubic, lift, () => this.release(true));
  }

  /** Cancel anything in flight (e.g. before the book is rebuilt). */
  reset() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.mode = null;
    this.queued = null;
    this.gesture = null;
  }

  /* ---------------------------------------------------------------- core */

  geom() {
    const r = this.getFlip().getRender().getRect();
    return { r, pw: r.pageWidth, h: r.height };
  }

  toGlobal(p) {
    const { r } = this.geom();
    const x = this.dir === FORWARD ? p.x + r.left + r.width / 2 : r.width / 2 - p.x + r.left;
    return { x, y: p.y + r.top };
  }

  local(e) {
    const el = this.host.querySelector('.stf__block') || this.host;
    const b = el.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  }

  begin(dir, corner) {
    const flip = this.getFlip();
    if (!flip || !this.canTurn(dir)) return false;
    if (flip.getState() === 'flipping') return false;
    const { pw, h } = this.geom();
    this.dir = dir;
    this.corner = corner;
    this.p0 = { x: pw - 2, y: corner === 'top' ? 2 : h - 2 };
    this.cur = { ...this.p0 };
    this.target = { ...this.p0 };
    flip.startUserTouch(this.toGlobal(this.p0));
    return true;
  }

  move(p) {
    this.getFlip()?.userMove(this.toGlobal(p), false);
  }

  /** Ease from the current point to the end (complete) or back (cancel). */
  release(complete, fromGesture = false) {
    const flip = this.getFlip();
    if (!flip) return this.done();
    const { pw } = this.geom();
    // A cancel must end >5px from the start point, or the library treats the
    // release as a click and turns the page anyway.
    const end = complete ? { x: -pw + 1, y: this.p0.y } : { x: pw - 10, y: this.p0.y };

    if (fromGesture) {
      cancelAnimationFrame(this.raf);
      const dist = Math.abs(end.x - this.cur.x) / (2 * pw);
      const ms = reduceMotion?.matches ? 1 : 140 + 520 * dist;
      this.mode = 'tween';
      this.tween(end, ms, easeOutCubic, complete ? (this.corner === 'bottom' ? -1 : 1) * this.geom().h * 0.06 : 0, () =>
        this.release(complete),
      );
      return;
    }

    this.move(end);
    flip.userStop(this.toGlobal(end));
    this.done();
  }

  done() {
    this.mode = null;
    this.gesture = null;
    const q = this.queued;
    this.queued = null;
    if (q) {
      this.fastNext = true;
      // Let the library settle its page swap first.
      requestAnimationFrame(() => this.turn(q.dir, q.corner));
    }
  }

  /** Quadratic-bezier tween in page space with an optional arc. */
  tween(to, ms, ease, lift, onDone) {
    cancelAnimationFrame(this.raf);
    const from = { ...this.cur };
    const ctrl = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 + lift };
    const t0 = performance.now();
    const step = (now) => {
      if (this.mode !== 'tween') return;
      const t = Math.min(1, (now - t0) / ms);
      const e = ease(t);
      const u = 1 - e;
      this.cur = {
        x: u * u * from.x + 2 * u * e * ctrl.x + e * e * to.x,
        y: u * u * from.y + 2 * u * e * ctrl.y + e * e * to.y,
      };
      this.move(this.cur);
      if (t < 1) this.raf = requestAnimationFrame(step);
      else onDone();
    };
    this.raf = requestAnimationFrame(step);
  }

  /** Follow loop for drags and wheel gestures: glide toward the target. */
  follow() {
    cancelAnimationFrame(this.raf);
    let last = performance.now();
    const step = (now) => {
      if (this.mode !== 'drag' && this.mode !== 'wheel') return;
      const k = 1 - Math.pow(1 - FOLLOW, (now - last) / 16.67);
      last = now;
      this.cur = {
        x: this.cur.x + (this.target.x - this.cur.x) * k,
        y: this.cur.y + (this.target.y - this.cur.y) * k,
      };
      this.move(this.cur);
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  /** Page-space x velocity (px/ms) over the last ~100 ms of samples. */
  velocity(samples) {
    const now = performance.now();
    const recent = samples.filter((s) => now - s.t < 100);
    if (recent.length < 2) return 0;
    const a = recent[0];
    const b = recent[recent.length - 1];
    return (b.x - a.x) / Math.max(1, b.t - a.t);
  }

  shouldComplete(v) {
    const { pw } = this.geom();
    if (v < -0.35) return true; // flicked toward the spine
    if (v > 0.35) return false; // flicked back
    return this.target.x < pw * 0.3;
  }

  /* ---------------------------------------------------------------- input */

  bind() {
    const h = this.host;
    h.style.touchAction = 'none';
    h.addEventListener('pointerdown', (e) => this.onDown(e));
    h.addEventListener('pointermove', (e) => this.onMove(e));
    h.addEventListener('pointerup', (e) => this.onUp(e));
    h.addEventListener('pointercancel', (e) => this.onUp(e, true));
    h.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && !this.gesture) this.hover(null);
    });
    h.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
  }

  pickSide(p) {
    const { r, pw } = this.geom();
    const portrait = this.getFlip().getOrientation() === 'portrait';
    const split = portrait ? r.left + pw * 1.5 : r.left + r.width / 2;
    return {
      dir: p.x < split ? BACK : FORWARD,
      corner: p.y < r.top + r.height / 2 ? 'top' : 'bottom',
      inside: p.x >= r.left + (portrait ? pw : 0) && p.x <= r.left + r.width && p.y >= r.top && p.y <= r.top + r.height,
    };
  }

  onDown(e) {
    if (e.button !== 0 || this.gesture || !this.getFlip()) return;
    if (this.mode === 'tween') return;
    const p = this.local(e);
    const side = this.pickSide(p);
    if (!side.inside) return;
    e.preventDefault();
    try {
      this.host.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic or already-released pointer.
    }
    this.gesture = { id: e.pointerId, x0: e.clientX, y0: e.clientY, ...side, started: false, samples: [] };
  }

  onMove(e) {
    const g = this.gesture;
    if (!g) {
      if (e.pointerType === 'mouse' && !this.mode) this.hover(this.local(e));
      return;
    }
    if (e.pointerId !== g.id) return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    if (!g.started) {
      if (Math.hypot(dx, dy) < TAP_SLOP) return;
      if (!this.begin(g.dir, g.corner)) {
        this.gesture = null;
        return;
      }
      g.started = true;
      this.mode = 'drag';
      this.follow();
    }
    const { pw, h } = this.geom();
    const sx = this.dir === FORWARD ? 1 : -1;
    this.target = {
      x: clamp(this.p0.x + sx * dx * DRAG_GAIN, -pw + 1, pw - 1),
      y: clamp(this.p0.y + dy * 0.6, 0, h),
    };
    g.samples.push({ t: performance.now(), x: this.target.x });
    if (g.samples.length > 12) g.samples.shift();
  }

  onUp(e, cancelled = false) {
    const g = this.gesture;
    if (!g || e.pointerId !== g.id) return;
    try {
      this.host.releasePointerCapture(e.pointerId);
    } catch {
      // Not captured.
    }
    if (!g.started) {
      this.gesture = null;
      if (!cancelled) this.turn(g.dir, g.corner);
      return;
    }
    const v = this.velocity(g.samples);
    this.release(!cancelled && this.shouldComplete(v), true);
  }

  /** Let the library peel the corner under the mouse. */
  hover(p) {
    const flip = this.getFlip();
    if (!flip) return;
    const s = flip.getState();
    if (s !== 'read' && s !== 'fold_corner') return;
    flip.userMove(p || { x: -1e4, y: -1e4 }, false);
  }

  onWheel(e) {
    if (!this.getFlip() || e.ctrlKey) return; // ctrl+wheel = pinch zoom
    e.preventDefault();
    const w = this.wheel;
    const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const dx = e.deltaX * scale;
    const dy = e.deltaY * scale;

    // After a gesture ends, swallow its momentum tail until things go quiet.
    if (w.locked) {
      clearTimeout(w.quiet);
      w.quiet = setTimeout(() => (w.locked = false), 220);
      return;
    }

    if (Math.abs(dy) > Math.abs(dx) && this.mode !== 'wheel') {
      // Vertical wheel / scroll: discrete page turns.
      w.vAcc += dy;
      clearTimeout(w.vReset);
      w.vReset = setTimeout(() => (w.vAcc = 0), 200);
      if (Math.abs(w.vAcc) > 60) {
        this.turn(w.vAcc > 0 ? FORWARD : BACK);
        w.vAcc = 0;
        this.lockWheel();
      }
      return;
    }

    if (this.mode && this.mode !== 'wheel') return;
    if (!this.mode) {
      if (Math.abs(dx) < 1) return;
      if (!this.begin(dx > 0 ? FORWARD : BACK, 'bottom')) {
        this.lockWheel();
        return;
      }
      this.mode = 'wheel';
      w.acc = 0;
      w.samples = [];
      this.follow();
    }

    const { pw, h } = this.geom();
    w.acc += this.dir === FORWARD ? dx : -dx;
    const x = clamp(this.p0.x - w.acc * WHEEL_GAIN, -pw + 1, pw - 1);
    const progress = (this.p0.x - x) / (2 * pw);
    this.target = { x, y: this.p0.y - h * 0.12 * Math.sin(progress * Math.PI) };
    w.samples.push({ t: performance.now(), x });
    if (w.samples.length > 12) w.samples.shift();

    clearTimeout(w.end);
    w.end = setTimeout(() => {
      if (this.mode !== 'wheel') return;
      const v = this.velocity(w.samples);
      this.lockWheel();
      this.release(this.target.x < pw * 0.45 || v < -0.3, true);
    }, 140);
  }

  lockWheel() {
    const w = this.wheel;
    w.locked = true;
    clearTimeout(w.quiet);
    w.quiet = setTimeout(() => (w.locked = false), 220);
  }
}

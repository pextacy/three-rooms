/**
 * Three lit windows, cut into a sheet of paper.
 *
 * The List is printed and the games are lit. So the door does not describe the
 * three rooms in a paragraph each — it cuts three holes in the page and shows
 * them, each under its own light, drawn by the same model the games are drawn
 * by (`shared/render/light.ts`).
 *
 * **These are not the games.** They import no game logic, no paytable and no
 * dynamic program — only the shared light and grain. A door that had to know how
 * a broker's fee works would be a door that breaks when the fee changes, and the
 * repo's one architectural rule is that `shared/` never learns who is calling
 * it. What is here is the smallest true likeness of each room: what is lighting
 * it, from which direction, and what it falls on.
 */
import {
  CANDLELIGHT,
  DAYLIGHT,
  LAMPLIGHT,
  LEVEL_FLOOR,
  LEVEL_FULL,
  css,
  cssAlpha,
  paletteAtWax,
  type Palette,
  type Rgb,
  type Room,
} from '../shared/render/light';
import { drawGrain, SOOT, DAMP, SLATE, type GrainSpec } from '../shared/render/grain';

export type WindowId = 'candle' | 'roads' | 'floor';

type Pane = {
  readonly id: WindowId;
  readonly room: Room;
  readonly grain: GrainSpec;
  /** The level this room is shown at. Each is caught mid-round, not at full. */
  readonly level: number;
  readonly draw: (ctx: CanvasRenderingContext2D, w: number, h: number, p: Palette, lit: number) => void;
};

/**
 * `lit` runs 0 → 1 as the window comes up on page load: the light rises, and
 * nothing else moves. It is the only animation on this page, it lasts under a
 * second, and `prefers-reduced-motion` starts it at 1.
 */

/** CANDLE — a flame, a stem, five pins, and the last inch about to go. */
/**
 * Each pane is a MINIATURE OF ITS ROOM, drawn in the same language the room
 * uses. They were drawn in an older one — a bare candle with tick marks, a
 * trapezoid with three sticks for a ship, a board with nothing on it — so the
 * door promised one thing and the room behind it delivered another. A window
 * cut into the sheet has to show what is through it.
 */

/** A fill that falls off from this pane's own light, and from nothing else. */
function lit(
  ctx: CanvasRenderingContext2D,
  lx: number,
  ly: number,
  reach: number,
  near: Rgb,
  nearA: number,
  far: Rgb,
  farA: number,
): CanvasGradient {
  const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, reach);
  g.addColorStop(0, cssAlpha(near, nearA));
  g.addColorStop(0.55, cssAlpha(near, nearA * 0.6 + farA * 0.4));
  g.addColorStop(1, cssAlpha(far, farA));
  return g;
}

function candlePane(ctx: CanvasRenderingContext2D, w: number, h: number, p: Palette, l: number): void {
  const x = w * 0.42;
  const flameY = h * 0.3;
  const table = h * 0.8;
  const reach = Math.max(w, h) * 0.62;

  // The panelling and the table, so the candle stands IN something.
  ctx.fillStyle = lit(ctx, x, flameY, reach, p.tallow, 0.09 * l, p.tallow, 0.012 * l);
  ctx.fillRect(0, 0, w, table);
  ctx.fillStyle = lit(ctx, x, flameY, reach * 1.2, p.brass, 0.22 * l, p.tallow, 0.03 * l);
  ctx.fillRect(0, table, w, h - table);
  ctx.fillStyle = lit(ctx, x, flameY, reach, p.brass, 0.5 * l, p.ink, 0);
  ctx.fillRect(0, table, w, Math.max(1, h * 0.005));

  drawGrain(ctx, w, h, SOOT);

  // The stick: a foot, a stem and a drip pan, the same three parts as the room.
  const stemW = Math.max(4, w * 0.05);
  const panY = table - h * 0.03;
  ctx.fillStyle = lit(ctx, x, flameY, reach, p.brass, 0.95 * l, p.oxblood, 0.4 * l);
  ctx.fillRect(x - w * 0.055, table - h * 0.02, w * 0.11, Math.max(2, h * 0.018));
  ctx.fillRect(x - stemW * 0.34, panY, stemW * 0.68, table - panY);
  ctx.fillRect(x - w * 0.042, panY - h * 0.012, w * 0.084, Math.max(2, h * 0.016));

  // The candle, and the pins down its side.
  const top = h * 0.36;
  ctx.fillStyle = lit(ctx, x, flameY, reach, p.tallow, 1 * l, p.oxblood, 0.5 * l);
  ctx.fillRect(x - stemW / 2, top, stemW, panY - top);
  for (let i = 0; i < 4; i++) {
    const y = top + ((panY - top) / 5) * (i + 1);
    ctx.fillStyle = cssAlpha(p.tallow, (i === 0 ? 0.9 : 0.55) * l);
    ctx.fillRect(x + stemW * 0.5, y, Math.max(2, w * 0.016), Math.max(1, h * 0.007));
  }

  // The flame, in the room's three layers.
  const fh = h * 0.105;
  const drop = (hh: number, ww: number, a: number, ink: Rgb) => {
    ctx.beginPath();
    ctx.moveTo(x, top - hh);
    ctx.quadraticCurveTo(x + ww, top - hh * 0.32, x, top + h * 0.006);
    ctx.quadraticCurveTo(x - ww, top - hh * 0.32, x, top - hh);
    ctx.closePath();
    ctx.fillStyle = cssAlpha(ink, a * l);
    ctx.fill();
  };
  drop(fh * 1.35, stemW * 0.7, 0.24, p.brass);
  drop(fh, stemW * 0.36, 0.9, p.tallow);
  drop(fh * 0.5, stemW * 0.16, 1, p.tallow);

  // A crate on the table: the thing the whole game is about.
  const cx = w * 0.76;
  const cw = w * 0.2;
  const ch = h * 0.11;
  ctx.fillStyle = cssAlpha(p.ink, 0.6 * l);
  ctx.fillRect(cx - cw / 2, table - ch, cw, ch);
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = lit(ctx, x, flameY, reach * 1.6, p.brass, 0.8 * l, p.ink, 0.06);
    ctx.fillRect(cx - cw / 2, table - ch + (ch / 3) * i + h * 0.006, cw, ch / 3 - h * 0.009);
  }
  // Corner battens. Three horizontal bands alone read as bullion, not as a
  // crate — it is the uprights that say the boards are nailed to something.
  ctx.fillStyle = lit(ctx, x, flameY, reach * 1.6, p.brass, 0.95 * l, p.ink, 0.08);
  ctx.fillRect(cx - cw / 2, table - ch, cw * 0.1, ch);
  ctx.fillRect(cx + cw / 2 - cw * 0.1, table - ch, cw * 0.1, ch);
  ctx.fillRect(cx - cw / 2, table - ch, cw, Math.max(1, h * 0.006));
}

function roadsPane(ctx: CanvasRenderingContext2D, w: number, h: number, p: Palette, l: number): void {
  const horizon = h * 0.46;

  // Daylight is a SHEET from the horizon, not a pool — the room's own rule.
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, cssAlpha(p.ink, 0));
  sky.addColorStop(1, cssAlpha(p.tallow, 0.16 * l));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon);

  ctx.fillStyle = cssAlpha(p.ink, 0.55 * l);
  ctx.fillRect(0, horizon, w, h - horizon);
  ctx.fillStyle = cssAlpha(p.tallow, 0.26 * l);
  ctx.fillRect(0, horizon, w, Math.max(1, h * 0.003));

  drawGrain(ctx, w, h, DAMP);

  // Her, at anchor: a hull with a raised stern, three masts carrying furled
  // canvas, and a reflection broken into bands.
  const x = w * 0.52;
  const hullW = w * 0.34;
  const hullH = h * 0.06;
  const deck = horizon + h * 0.04;

  ctx.beginPath();
  ctx.moveTo(x - hullW / 2, deck - hullH);
  ctx.quadraticCurveTo(x, deck - hullH * 1.2, x + hullW * 0.4, deck - hullH);
  ctx.lineTo(x + hullW * 0.44, deck - hullH * 1.5);
  ctx.lineTo(x + hullW * 0.52, deck - hullH * 1.45);
  ctx.lineTo(x + hullW * 0.5, deck);
  ctx.quadraticCurveTo(x, deck + hullH * 0.45, x - hullW * 0.48, deck - hullH * 0.2);
  ctx.closePath();
  ctx.fillStyle = cssAlpha(p.tallow, 0.85 * l);
  ctx.fill();
  ctx.fillStyle = cssAlpha(p.tallow, 0.55 * l);
  ctx.fillRect(x - hullW * 0.46, deck - hullH * 0.52, hullW * 0.94, hullH * 0.52);

  for (let i = 0; i < 3; i++) {
    const mx = x - hullW * 0.24 + i * hullW * 0.24;
    const mh = h * (0.24 - i * 0.032);
    ctx.fillStyle = cssAlpha(p.tallow, 0.8 * l);
    ctx.fillRect(mx - Math.max(1, w * 0.004), deck - hullH - mh, Math.max(1, w * 0.008), mh);
    for (const t of [0.8, 0.52]) {
      const yw = w * 0.05 * (1 - i * 0.12);
      const yy = deck - hullH - mh * t;
      ctx.fillRect(mx - yw, yy, yw * 2, Math.max(1, h * 0.004));
      ctx.beginPath();
      ctx.moveTo(mx - yw * 0.92, yy);
      ctx.quadraticCurveTo(mx, yy + h * 0.02, mx + yw * 0.92, yy);
      ctx.closePath();
      ctx.fillStyle = cssAlpha(p.tallow, 0.4 * l);
      ctx.fill();
      ctx.fillStyle = cssAlpha(p.tallow, 0.8 * l);
    }
  }

  for (let i = 0; i < 4; i++) {
    const rw = hullW * (0.6 - i * 0.09);
    ctx.fillStyle = cssAlpha(p.tallow, (0.14 - i * 0.03) * l);
    ctx.fillRect(x - rw / 2, deck + hullH * (0.35 + i * 0.3), rw, Math.max(1, hullH * 0.14));
  }
}

function floorPane(ctx: CanvasRenderingContext2D, w: number, h: number, p: Palette, l: number): void {
  const lx = w * 0.5;
  const ly = h * 0.07;
  const reach = Math.max(w, h) * 0.95;
  const top = h * 0.1;
  const bottom = h * 0.78;

  ctx.fillStyle = lit(ctx, lx, ly, reach, p.tallow, 0.08 * l, p.tallow, 0.012 * l);
  ctx.fillRect(0, 0, w, h);

  // The slate in its frame, with the ledge under it.
  ctx.fillStyle = lit(ctx, lx, ly, reach, p.oxblood, 0.75 * l, p.oxblood, 0.12 * l);
  ctx.fillRect(w * 0.02, top - h * 0.02, w * 0.96, bottom - top + h * 0.045);
  ctx.fillStyle = lit(ctx, lx, ly, reach, p.ink, 0.94, p.ink, 0.99);
  ctx.fillRect(w * 0.045, top, w * 0.91, bottom - top);

  drawGrain(ctx, w, h, SLATE);

  // The lamp over it, seen from below.
  ctx.fillStyle = cssAlpha(p.oxblood, 0.85 * l);
  ctx.beginPath();
  ctx.moveTo(lx - w * 0.075, ly + h * 0.02);
  ctx.lineTo(lx + w * 0.075, ly + h * 0.02);
  ctx.lineTo(lx + w * 0.026, ly - h * 0.022);
  ctx.lineTo(lx - w * 0.026, ly - h * 0.022);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = cssAlpha(p.tallow, 0.9 * l);
  ctx.fillRect(lx - w * 0.02, ly + h * 0.02, w * 0.04, Math.max(2, h * 0.012));

  // Chalked rules, and three prices pinned at their own heights.
  for (const t of [0.26, 0.5, 0.74]) {
    const y = top + (bottom - top) * t;
    const step = Math.max(5, w * 0.03);
    ctx.fillStyle = cssAlpha(p.tallow, 0.26 * l);
    for (let x = w * 0.06; x < w * 0.94; x += step) {
      ctx.fillRect(x, y, step * 0.75, Math.max(1, h * 0.003));
    }
  }

  const slips: readonly [number, number, boolean][] = [
    [0.2, 0.62, false],
    [0.45, 0.34, true],
    [0.72, 0.7, false],
  ];
  for (const [sx, sy, best] of slips) {
    const x = w * sx;
    const y = top + (bottom - top) * sy;
    const sw = w * 0.13;
    const sh = h * 0.08;
    ctx.beginPath();
    ctx.moveTo(x - sw / 2, y);
    ctx.lineTo(x + sw / 2, y);
    ctx.lineTo(x + sw / 2, y + sh * 0.8);
    ctx.lineTo(x + sw * 0.3, y + sh);
    ctx.lineTo(x - sw / 2, y + sh * 0.94);
    ctx.closePath();
    ctx.fillStyle = cssAlpha(p.tallow, (best ? 0.62 : 0.4) * l);
    ctx.fill();
    ctx.fillStyle = cssAlpha(best ? p.brass : p.oxblood, 0.9 * l);
    ctx.fillRect(x - Math.max(1, w * 0.005), y, Math.max(2, w * 0.01), Math.max(2, h * 0.014));
  }

  // The line in hand: the one blue thing on this floor, because it is money.
  const bestY = top + (bottom - top) * 0.34;
  ctx.fillStyle = cssAlpha(p.brass, 0.95 * l);
  ctx.fillRect(w * 0.045, bestY, w * 0.91, Math.max(1, h * 0.005));
}

const PANES: readonly Pane[] = [
  { id: 'candle', room: CANDLELIGHT, grain: SOOT, level: 7_000, draw: candlePane },
  { id: 'roads', room: DAYLIGHT, grain: DAMP, level: 8_500, draw: roadsPane },
  { id: 'floor', room: LAMPLIGHT, grain: SLATE, level: 9_100, draw: floorPane },
];

export function paneFor(id: WindowId): Pane {
  const found = PANES.find(pane => pane.id === id);
  if (!found) throw new Error(`no window called ${id}`);
  return found;
}

/**
 * The level a room rests at when nothing is asking for it: each caught
 * mid-round rather than at full, so three cuts in a sheet read as three rooms
 * someone is already in.
 */
export function restingLevel(id: WindowId): number {
  return paneFor(id).level;
}

/**
 * Where a room goes when it is the one being attended to, and where the other
 * two go while it is.
 *
 * These are not opacities. They are positions on the SAME wax ladder the games
 * dim along and `npm run verify:light` checks — so the door raising one room and
 * lowering two is the identical physical operation as a candle burning down,
 * run in both directions. A CSS fade would have been three lines shorter and
 * would have meant the door lit its rooms by a rule nothing else in the repo
 * obeys.
 */
export const ATTENDED = LEVEL_FULL;
export const UNATTENDED = LEVEL_FLOOR;

/**
 * Paint one window at a given stage of being lit, and at a given level on the
 * wax ladder.
 *
 * `lit` is the page-load sequence — 0 → 1, once, as the room comes up. `level`
 * is where on its own ladder the room is standing, which is what the pointer and
 * the keyboard move. They are different axes and they compose: a room can be
 * half-lit on load AND standing at its floor.
 */
export function drawWindow(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  id: WindowId,
  lit: number,
  level?: number,
): void {
  const pane = paneFor(id);
  const palette = paletteAtWax(level ?? pane.level, pane.room);
  const clamped = lit < 0 ? 0 : lit > 1 ? 1 : lit;

  ctx.fillStyle = css(palette.ink);
  ctx.fillRect(0, 0, width, height);
  pane.draw(ctx, width, height, palette, clamped);
}

/** The ink each room is to be labelled in, at full flame. */
export function accentFor(id: WindowId): string {
  return css(paletteAtWax(LEVEL_FULL, paneFor(id).room).brass);
}

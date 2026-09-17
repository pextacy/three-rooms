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
function candlePane(ctx: CanvasRenderingContext2D, w: number, h: number, p: Palette, lit: number): void {
  const x = w * 0.5;
  const flameY = h * 0.3;

  const glow = ctx.createRadialGradient(x, flameY, 0, x, flameY, Math.max(w, h) * 0.72);
  glow.addColorStop(0, cssAlpha(p.tallow, 0.34 * lit));
  glow.addColorStop(0.25, cssAlpha(p.brass, 0.13 * lit));
  glow.addColorStop(1, cssAlpha(p.ink, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  drawGrain(ctx, w, h, SOOT);

  // The stem, standing on the table. Two inches gone, three left.
  const stemW = Math.max(4, w * 0.055);
  const top = h * 0.36;
  const table = h * 0.86;
  ctx.fillStyle = cssAlpha(p.tallow, 0.5 * lit);
  ctx.fillRect(x - stemW / 2, top, stemW, table - top);

  // The pins: an inch is worth less than the one before it, so they are the
  // scale the whole game is read from.
  for (let i = 0; i < 4; i++) {
    const y = top + ((table - top) / 4) * (i + 1);
    ctx.fillStyle = cssAlpha(p.tallow, (i === 0 ? 0.75 : 0.4) * lit);
    ctx.fillRect(x + stemW * 0.75, y, Math.max(2, w * 0.018), Math.max(1, h * 0.008));
  }

  // The flame.
  const fh = h * 0.1 * (0.9 + 0.1 * lit);
  ctx.beginPath();
  ctx.moveTo(x, flameY - fh);
  ctx.quadraticCurveTo(x + stemW * 0.5, flameY - fh * 0.3, x, flameY + h * 0.06);
  ctx.quadraticCurveTo(x - stemW * 0.5, flameY - fh * 0.3, x, flameY - fh);
  ctx.fillStyle = cssAlpha(p.tallow, 0.95 * lit);
  ctx.fill();

  ctx.fillStyle = cssAlpha(p.brass, 0.22 * lit);
  ctx.fillRect(0, table, w, Math.max(1, h * 0.004));
}

/** THE SURVEY — a horizon, a hull, and the day coming in flat over the water. */
function roadsPane(ctx: CanvasRenderingContext2D, w: number, h: number, p: Palette, lit: number): void {
  const horizon = h * 0.46;

  // Daylight is a sheet, not a pool. Same direction as the game's own room.
  const sheet = ctx.createLinearGradient(0, horizon - h * 0.34, 0, h);
  sheet.addColorStop(0, cssAlpha(p.tallow, 0.24 * lit));
  sheet.addColorStop(0.4, cssAlpha(p.tallow, 0.08 * lit));
  sheet.addColorStop(1, cssAlpha(p.ink, 0));
  ctx.fillStyle = sheet;
  ctx.fillRect(0, 0, w, h);

  drawGrain(ctx, w, h, DAMP);

  ctx.fillStyle = cssAlpha(p.tallow, 0.3 * lit);
  ctx.fillRect(0, horizon, w, Math.max(1, h * 0.003));

  // Her hull and three masts, at the distance a surveyor is sent over.
  const beam = w * 0.34;
  const cx = w * 0.54;
  const deck = horizon + h * 0.12;
  ctx.beginPath();
  ctx.moveTo(cx - beam / 2, deck);
  ctx.lineTo(cx + beam / 2, deck);
  ctx.lineTo(cx + beam * 0.34, deck + h * 0.07);
  ctx.lineTo(cx - beam * 0.4, deck + h * 0.07);
  ctx.closePath();
  ctx.fillStyle = cssAlpha(p.tallow, 0.62 * lit);
  ctx.fill();

  for (const at of [-0.3, 0, 0.3]) {
    ctx.fillStyle = cssAlpha(p.tallow, 0.45 * lit);
    ctx.fillRect(cx + beam * at, deck - h * 0.2, Math.max(1, w * 0.007), h * 0.2);
  }

  // Her reflection, because the water is what makes this room cold.
  ctx.fillStyle = cssAlpha(p.tallow, 0.08 * lit);
  ctx.fillRect(cx - beam / 2, deck + h * 0.09, beam, Math.max(1, h * 0.05));
}

/** THE BROKERS — a slate board, chalk rules, and one price standing above them. */
function floorPane(ctx: CanvasRenderingContext2D, w: number, h: number, p: Palette, lit: number): void {
  drawGrain(ctx, w, h, SLATE);

  // An Argand lamp hangs over the board, so the light arrives from directly
  // above and falls off down the slate. The cut is portrait and the fall-off is
  // read across its whole height, which is why this is a steeper gradient than
  // the one the thumbnail used to need.
  const glow = ctx.createRadialGradient(w * 0.5, 0, 0, w * 0.5, 0, Math.max(w, h) * 1.05);
  glow.addColorStop(0, cssAlpha(p.tallow, 0.26 * lit));
  glow.addColorStop(0.35, cssAlpha(p.brass, 0.085 * lit));
  glow.addColorStop(1, cssAlpha(p.ink, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // Chalked, so the rules break and vary — the same hand as the game's board.
  for (const at of [0.24, 0.42, 0.6, 0.78]) {
    const y = h * at;
    const step = Math.max(5, w * 0.05);
    ctx.fillStyle = cssAlpha(p.tallow, 0.1 * lit);
    for (let x = 0; x < w; x += step) {
      ctx.globalAlpha = ((Math.sin((x + y) * 0.07) + 1) / 2) * 0.5 + 0.5;
      ctx.fillRect(x, y, Math.min(step * 0.78, w - x), Math.max(1, h * 0.004));
    }
    ctx.globalAlpha = 1;
  }

  // Four slips at four prices, and the best one in hand: the whole game is the
  // one line that says which of them you are holding.
  const slips = [0.62, 0.42, 0.68, 0.22];
  for (const [i, at] of slips.entries()) {
    const x = w * (0.11 + i * 0.22);
    const y = h * (0.88 - at * 0.72);
    ctx.fillStyle = cssAlpha(p.tallow, (at > 0.6 ? 0.55 : 0.26) * lit);
    ctx.fillRect(x, y, w * 0.15, Math.max(2, h * 0.016));
  }

  const best = h * (0.88 - 0.68 * 0.72);
  ctx.fillStyle = cssAlpha(p.brass, 0.75 * lit);
  ctx.fillRect(0, best, w, Math.max(1, h * 0.006));
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

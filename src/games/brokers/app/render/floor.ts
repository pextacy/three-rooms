/**
 * The floor (THE BROKERS). ONE canvas. Nothing else draws.
 *
 * CANDLE's claim is *brightness is the multiplier*; THE SURVEY's is *the fog is
 * the doubt*. This game's is the plainest of the three, and the one a player
 * uses most:
 *
 *   **Distance is the ratio.** Every price named is pinned on one fixed scale
 *   that runs from the lowest number this floor can name to the highest, and the
 *   scale is LOGARITHMIC: equal distances are equal multiples. A slip a
 *   thumb's width above the brass line beats it by the same factor wherever on
 *   the board the two of them are, so "how much better is this?" is answerable
 *   without reading anything.
 *
 *   A linear scale was the first try and it was the wrong claim: the top of this
 *   market is 5.00x and the middle of it is around 1.00x, so four fifths of the
 *   board sat empty and every ordinary price was crushed into the bottom inch.
 *   Prices are ratios; a ratio scale is what they are read on.
 *
 * That is the whole reason the scene exists: the game is a comparison, and a
 * comparison is a picture.
 *
 * The room dims with what the day has cost — the fees paid, through the shared
 * light model — so spending is visible too. It is a small range (a full four
 * fees is 14.7% of the stake) and it is stated as what it is rather than sold as
 * the product.
 *
 * Exactly one gradient in the whole build: the lamp's own falloff.
 *
 * This file owns pixels only. It computes no game state, reaches for no host,
 * and is handed everything it draws.
 */
import { BROKER_LIST, TOTAL_FEES_BP, PRICE_DENOM } from '../../core/market';
import { LEVEL_FULL, LEVEL_DENOM, cssAlpha, paletteAtWax, css, type Rgb, LAMPLIGHT } from '../../../../shared/render/light';
import { drawGrain, SLATE } from '../../../../shared/render/grain';

type Palette = Record<'tallow' | 'brass' | 'oxblood' | 'ink', Rgb>;

/** One price on the board. */
export type Slip = {
  /** Null is the house's own man. */
  readonly brokerId: number | null;
  readonly name: string;
  readonly priceBp: number;
  readonly priceText: string;
  /** True for the best price in hand — the one TAKE would pay. */
  readonly isBest: boolean;
};

/** A broker who has not been asked: a desk with nothing pinned to it. */
export type Desk = {
  readonly brokerId: number;
  readonly name: string;
  readonly feeText: string;
  /** True while his word is in flight. */
  readonly looking: boolean;
};

export type FloorState = {
  readonly slips: readonly Slip[];
  readonly desks: readonly Desk[];
  /** Basis points of the stake spent on fees so far. Drives the light. */
  readonly feesBp: number;
  /** What TAKE would pay right now, already formatted. */
  readonly payoutText: string | null;
  readonly settled: boolean;
  /** 0..1 per slip, so a price can animate on to the board. */
  readonly slipFall: readonly number[];
  readonly time: number;
  readonly reducedMotion: boolean;
};

export type FloorMetrics = {
  readonly lastFrameMs: number;
  readonly frames: number;
};

/** The top of the price scale: the largest number this floor can name. */
export const SCALE_TOP_BP = BROKER_LIST.reduce(
  (top, broker) => broker.quotes.reduce((inner, quote) => (quote.priceBp > inner ? quote.priceBp : inner), top),
  0,
);

const BOARD_TOP = 0.08;
const BOARD_BOTTOM = 0.62;
const LAMP_X = 0.06;
const LAMP_Y = 0.66;
/**
 * Nothing is drawn below this. The readout is DOM and sits over the bottom of
 * the same box (`table.css`), so anything painted down there lands on real text
 * — which is how the payout line ended up printed through it on the first pass.
 * The board and the desks are both laid out to finish above it.
 */
export const READOUT_Y = 0.72;

/** The lowest price anybody on this floor names — the bottom of the scale. */
export const SCALE_FLOOR_BP = BROKER_LIST.reduce(
  (low, broker) => broker.quotes.reduce((inner, quote) => (quote.priceBp < inner ? quote.priceBp : inner), low),
  Number.POSITIVE_INFINITY,
);

/**
 * The light level for a round that has spent `feesBp`.
 *
 * Full flame at nothing spent, down to 70% of it with every fee paid. A modest
 * range, honestly reported: the fees are a modest cost. CANDLE's wax and THE
 * SURVEY's daylight both run to 40%, and this one deliberately does not pretend
 * to.
 */
export function levelFor(feesBp: number): number {
  const spent = Math.max(0, Math.min(TOTAL_FEES_BP, feesBp));
  const share = TOTAL_FEES_BP > 0 ? spent / TOTAL_FEES_BP : 0;
  return Math.round(LEVEL_FULL - share * (LEVEL_FULL - 7_000));
}

/**
 * Where a price sits on the board, 0 (bottom) to 1 (top).
 *
 * Logarithmic between the lowest and highest numbers this floor can name, so a
 * given DISTANCE is a given MULTIPLE anywhere on the board. `test/brokers-scene`
 * checks exactly that: two pairs of prices in the same ratio are the same
 * distance apart, wherever they sit.
 */
export function heightOf(priceBp: number): number {
  if (!(SCALE_TOP_BP > SCALE_FLOOR_BP)) return 0;
  const span = Math.log(SCALE_TOP_BP / SCALE_FLOOR_BP);
  const position = Math.log(Math.max(priceBp, 1) / SCALE_FLOOR_BP) / span;
  return clamp01(position);
}

/**
 * The columns, left to right: the house's man, then the brokers in the order
 * they stand on the floor. A man keeps his column whether or not he has named
 * anything, so the board never reshuffles under the player — an earlier version
 * packed the slips to the left and the empty desks to the right, and every ask
 * moved everything.
 */
const COLUMNS = BROKER_LIST.length + 1;
const columnX = (width: number, index: number) => (width / COLUMNS) * (index + 0.5);

export function drawFloor(ctx: CanvasRenderingContext2D, width: number, height: number, state: FloorState): void {
  const palette = paletteAtWax(levelFor(state.feesBp), LAMPLIGHT);

  ctx.fillStyle = css(palette.ink);
  ctx.fillRect(0, 0, width, height);

  // The board is a MINERAL, so it is mottled before it is lit — grain first,
  // then the lamp over it, which is the order the two things happen in.
  drawGrain(ctx, width, height, SLATE);
  drawLamp(ctx, width, height, palette);
  drawBoard(ctx, width, height, state, palette);
  drawSlips(ctx, width, height, state, palette);
  drawDesks(ctx, width, height, state, palette);
}

/** The lamp's own falloff. THE one gradient in the whole build. */
function drawLamp(ctx: CanvasRenderingContext2D, width: number, height: number, palette: Palette): void {
  const x = width * LAMP_X;
  const y = height * LAMP_Y;
  const glow = ctx.createRadialGradient(x, y, 0, x, y, Math.max(width, height) * 0.75);
  glow.addColorStop(0, cssAlpha(palette.tallow, 0.24));
  glow.addColorStop(0.3, cssAlpha(palette.brass, 0.1));
  glow.addColorStop(1, cssAlpha(palette.ink, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
  // The lamp itself is off the frame; its light is not. Drawing the flame put a
  // candle through the name of the first man on the floor.
}

/**
 * The board, and the line across it.
 *
 * The line is the best price in hand. Everything on the board is measured
 * against it: a slip above the line is a price worth taking, a slip below it is
 * a fee already spent. That is the whole game, and it is one horizontal rule.
 */
function drawBoard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: FloorState,
  palette: Palette,
): void {
  const top = height * BOARD_TOP;
  const bottom = height * BOARD_BOTTOM;

  // Rules at the multiples a player thinks in, so the ratio scale can be read.
  //
  // Chalked, not printed. A rule on a slate board is laid down by a hand with a
  // straight edge, so it breaks: this draws it as a run of short strokes whose
  // gaps and weights come from the line's own height, which makes it repeatable
  // frame to frame and still not mechanical. A crisp 1px rule here was the last
  // thing on this canvas that looked typeset rather than written.
  for (const multiple of [0.5, 1, 2, 5]) {
    const y = bottom - (bottom - top) * heightOf(Math.round(multiple * PRICE_DENOM));
    const thickness = Math.max(1, height * 0.001);
    const step = Math.max(6, width * 0.016);
    ctx.fillStyle = cssAlpha(palette.tallow, 0.09);
    for (let x = 0; x < width; x += step) {
      const wobble = ((Math.sin((x + y) * 0.07) + 1) / 2) * 0.5 + 0.5; // 0.5 .. 1
      ctx.globalAlpha = wobble;
      // The last stroke is cut at the frame rather than allowed to overhang it.
      // It overhung, and `brokers-scene.spec.ts` is what said so.
      ctx.fillRect(x, y, Math.min(step * 0.82, width - x), thickness);
    }
    ctx.globalAlpha = 1;
    ctx.font = `${Math.max(9, height * 0.022)}px ui-monospace, Menlo, monospace`;
    ctx.textAlign = 'left';
    ctx.fillStyle = cssAlpha(palette.tallow, 0.22);
    ctx.fillText(`${multiple}x`, width * 0.012, y - height * 0.006);
  }

  const best = state.slips.find(slip => slip.isBest);
  if (!best) return;

  // The line in hand, in brass: the number TAKE pays, drawn as a height.
  const y = bottom - (bottom - top) * heightOf(best.priceBp);
  ctx.fillStyle = cssAlpha(palette.brass, 0.55);
  ctx.fillRect(0, y, width, Math.max(1, height * 0.003));
}

function drawSlips(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: FloorState,
  palette: Palette,
): void {
  const top = height * BOARD_TOP;
  const bottom = height * BOARD_BOTTOM;
  const slotWidth = width / COLUMNS;

  for (const [i, slip] of state.slips.entries()) {
    const fall = clamp01(state.slipFall[i] ?? 1);
    // The house keeps the first column; a broker keeps his own, always.
    const column = slip.brokerId === null ? 0 : slip.brokerId + 1;
    const x = columnX(width, column);
    const y = bottom - (bottom - top) * heightOf(slip.priceBp) * fall;

    const ink = slip.isBest ? palette.brass : palette.tallow;
    const alpha = slip.isBest ? 0.95 : 0.38;

    // The slip itself: a pinned scrap of paper, at the height of its number.
    const slipW = slotWidth * 0.66;
    const slipH = Math.max(3, height * 0.018);
    ctx.fillStyle = cssAlpha(ink, alpha * 0.32);
    ctx.fillRect(x - slipW / 2, y, slipW, slipH);

    ctx.font = `${Math.max(12, height * 0.048)}px ui-serif, Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = cssAlpha(ink, alpha);
    ctx.fillText(slip.priceText, x, y - height * 0.012);
  }
}

/** The desks of the men nobody has asked yet: a name, a fee, and no price. */
/**
 * The foot of every column: who stands there, and what he charges.
 *
 * Drawn for all five men — the house's and the four brokers' — so the floor is
 * always the same shape and a price arriving never moves anybody.
 */
function drawDesks(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: FloorState,
  palette: Palette,
): void {
  const bottom = height * BOARD_BOTTOM;
  const slotWidth = width / COLUMNS;
  const asked = new Set(state.slips.map(slip => slip.brokerId));

  ctx.textAlign = 'center';

  for (let column = 0; column < COLUMNS; column++) {
    const brokerId = column === 0 ? null : column - 1;
    const desk = state.desks.find(entry => entry.brokerId === brokerId);
    const named = asked.has(brokerId);
    const looking = desk?.looking === true;
    const x = columnX(width, column);

    // The desk itself: a rule under the column.
    ctx.fillStyle = cssAlpha(palette.tallow, looking ? 0.4 : named ? 0.22 : 0.12);
    ctx.fillRect(x - slotWidth * 0.33, bottom, slotWidth * 0.66, Math.max(1, height * 0.0018));

    const name = column === 0 ? 'the house' : (desk?.name ?? BROKER_LIST[column - 1]?.name ?? '');
    const fee = column === 0 ? 'no fee' : (desk?.feeText ?? '');

    ctx.font = `${Math.max(9, height * 0.021)}px ui-monospace, Menlo, monospace`;
    ctx.fillStyle = cssAlpha(palette.tallow, looking ? 0.75 : named ? 0.45 : 0.3);
    ctx.fillText(name, x, bottom + height * 0.042);
    // The house charges nothing, so he is never "paid" — he is just there.
    const owed = named && column > 0;
    ctx.fillStyle = cssAlpha(owed ? palette.oxblood : palette.tallow, owed ? 0.5 : 0.22);
    ctx.fillText(owed ? 'paid' : fee, x, bottom + height * 0.072);

    if (looking) {
      // He is reading it: a pen moving, with no number attached to it yet.
      const t = state.reducedMotion ? 0.5 : (Math.sin(state.time * 6) + 1) / 2;
      ctx.fillStyle = cssAlpha(palette.brass, 0.5);
      ctx.fillRect(x - slotWidth * 0.22 + slotWidth * 0.44 * t, bottom - height * 0.022, slotWidth * 0.05, height * 0.014);
    }
  }
}

// ---------------------------------------------------------------------------
//  The loop
// ---------------------------------------------------------------------------

export type FloorHandle = {
  update(state: Omit<FloorState, 'time' | 'slipFall' | 'reducedMotion'>): void;
  metrics(): FloorMetrics;
  destroy(): void;
};

export function mountFloor(canvas: HTMLCanvasElement): FloorHandle {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('this browser has no 2D canvas context');

  let raf = 0;
  let started = 0;
  let lastFrameMs = 0;
  let frames = 0;
  let destroyed = false;

  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  let game: Omit<FloorState, 'time' | 'slipFall' | 'reducedMotion'> = {
    slips: [],
    desks: [],
    feesBp: 0,
    payoutText: null,
    settled: false,
  };
  const slipFall: number[] = [];

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * ratio));
    const h = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  };

  const frame = (now: number) => {
    if (destroyed) return;
    if (started === 0) started = now;
    const t0 = now;

    resize();
    const time = (now - started) / 1000;

    // A new slip rises to its height rather than appearing at it.
    while (slipFall.length < game.slips.length) slipFall.push(0);
    while (slipFall.length > game.slips.length) slipFall.pop();
    for (let i = 0; i < slipFall.length; i++) {
      slipFall[i] = (slipFall[i] ?? 0) + (1 - (slipFall[i] ?? 0)) * 0.18;
    }

    drawFloor(ctx, canvas.width, canvas.height, { ...game, slipFall, time, reducedMotion });

    lastFrameMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    frames += 1;
    raf = window.requestAnimationFrame(frame);
  };

  raf = window.requestAnimationFrame(frame);

  return {
    update(next) {
      game = next;
    },
    metrics: () => ({ lastFrameMs, frames }),
    destroy() {
      destroyed = true;
      window.cancelAnimationFrame(raf);
    },
  };
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export { LEVEL_DENOM };

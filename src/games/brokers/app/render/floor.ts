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
import { readoutTopOf } from '../../../../shared/render/readout';

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
  /**
   * Where the DOM readout begins, as a fraction of canvas height.
   *
   * The floor used to reserve a FIXED fraction for it, and a fraction cannot
   * know how tall that block is — it depends on how its words wrap, which
   * depends on the width and the type scale. Every time either moved, the
   * lecterns and the price slips were drawn through the words again. The mount
   * measures the block and the floor lays itself out against the answer.
   */
  readonly readoutTop?: number;
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
/*
 * The board ends higher than it used to (0.62). Framing the slate and putting a
 * ledge under it added real height below the last rule, and with the lecterns
 * under that the floor ran past READOUT_Y into the words — visible the moment
 * the game is rendered in the gallery's 420px cartridge.
 */
const BOARD_BOTTOM = 0.55;
const LAMP_X = 0.5;
const LAMP_Y = 0.055;
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

type Lamp = { readonly x: number; readonly y: number; readonly reach: number };

/**
 * A fill that falls off from the lamp, and from nothing else.
 *
 * Same rule as CANDLE's room: a gradient may only come from the light. The
 * board used to be drawn with flat alphas in the 0.09–0.22 range, which is
 * where chalk on slate stops being dim and starts being invisible — the names
 * of the men on the floor could not be read at all.
 */
function litFill(
  ctx: CanvasRenderingContext2D,
  lamp: Lamp,
  near: Rgb,
  nearAlpha: number,
  far: Rgb,
  farAlpha: number,
  reachScale = 1,
): CanvasGradient {
  const g = ctx.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, lamp.reach * reachScale);
  g.addColorStop(0, cssAlpha(near, nearAlpha));
  g.addColorStop(0.5, cssAlpha(near, nearAlpha * 0.6 + farAlpha * 0.4));
  g.addColorStop(1, cssAlpha(far, farAlpha));
  return g;
}

/** The band the desks, the names and the fees need under the board. */
const DESK_BAND = 0.17;

/** The board's own bottom, kept clear of wherever the readout actually starts. */
export function boardBottomFor(readoutTop: number): number {
  return Math.max(0.3, Math.min(BOARD_BOTTOM, readoutTop - DESK_BAND));
}

export function drawFloor(ctx: CanvasRenderingContext2D, width: number, height: number, state: FloorState): void {
  const palette = paletteAtWax(levelFor(state.feesBp), LAMPLIGHT);
  const boardBottom = boardBottomFor(state.readoutTop ?? READOUT_Y);
  const lamp: Lamp = { x: width * LAMP_X, y: height * LAMP_Y, reach: Math.max(width, height) * 0.92 };

  ctx.fillStyle = css(palette.ink);
  ctx.fillRect(0, 0, width, height);

  drawWall(ctx, width, height, lamp, palette);
  drawSlate(ctx, width, height, lamp, palette, boardBottom);

  // The board is a MINERAL, so it is mottled before it is lit — grain first,
  // then the lamp over it, which is the order the two things happen in.
  drawGrain(ctx, width, height, SLATE);
  drawLamp(ctx, width, height, lamp, palette);
  drawBoard(ctx, width, height, state, palette, boardBottom);
  drawSlips(ctx, width, height, state, lamp, palette, boardBottom);
  drawDesks(ctx, width, height, state, lamp, palette, boardBottom);
}

/** The room the board is hung in. */
function drawWall(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  lamp: Lamp,
  palette: Palette,
): void {
  ctx.fillStyle = litFill(ctx, lamp, palette.tallow, 0.07, palette.tallow, 0.012, 1.1);
  ctx.fillRect(0, 0, width, height);
}

/**
 * The slate itself, in its frame.
 *
 * Without this the whole canvas was "the board", which meant it was nothing:
 * there was no edge, no surface and no object, just chalk floating on the page.
 */
function drawSlate(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  lamp: Lamp,
  palette: Palette,
  boardBottom: number,
): void {
  const top = height * (BOARD_TOP - 0.05);
  const bottom = height * (boardBottom + 0.055);
  const inset = width * 0.012;

  // The frame: worn wood around the slate.
  ctx.fillStyle = litFill(ctx, lamp, palette.oxblood, 0.7, palette.oxblood, 0.12, 1.25);
  ctx.fillRect(inset * 0.5, top - inset, width - inset, bottom - top + inset * 2);

  // The slate: darker than the wall it hangs on, so the board reads as a plane.
  ctx.fillStyle = litFill(ctx, lamp, palette.ink, 0.92, palette.ink, 0.99, 1.3);
  ctx.fillRect(inset, top, width - inset * 2, bottom - top);

  // The ledge along the bottom, where the chalk and the rag live.
  ctx.fillStyle = litFill(ctx, lamp, palette.oxblood, 0.85, palette.oxblood, 0.16, 1.25);
  ctx.fillRect(inset * 0.5, bottom, width - inset, height * 0.012);
}

/**
 * The Argand lamp over the board, and its falloff.
 *
 * It used to be off the frame — "the lamp itself is off the frame; its light is
 * not". That left the brightest thing in the room invisible and the top of the
 * board empty. It hangs where its light comes from now.
 */
function drawLamp(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  lamp: Lamp,
  palette: Palette,
): void {
  const glow = ctx.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, lamp.reach * 0.8);
  glow.addColorStop(0, cssAlpha(palette.tallow, 0.3));
  glow.addColorStop(0.3, cssAlpha(palette.brass, 0.11));
  glow.addColorStop(1, cssAlpha(palette.ink, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  const s = Math.min(width, height * 1.5);
  // The rod it hangs from, the shade, and the chimney under it.
  ctx.fillStyle = cssAlpha(palette.oxblood, 0.75);
  ctx.fillRect(lamp.x - s * 0.004, 0, s * 0.008, lamp.y - s * 0.03);

  ctx.beginPath();
  ctx.moveTo(lamp.x - s * 0.062, lamp.y);
  ctx.lineTo(lamp.x + s * 0.062, lamp.y);
  ctx.lineTo(lamp.x + s * 0.022, lamp.y - s * 0.034);
  ctx.lineTo(lamp.x - s * 0.022, lamp.y - s * 0.034);
  ctx.closePath();
  ctx.fillStyle = cssAlpha(palette.oxblood, 0.92);
  ctx.fill();
  // The rim of the shade, catching its own burner from underneath.
  ctx.fillStyle = cssAlpha(palette.tallow, 0.5);
  ctx.fillRect(lamp.x - s * 0.062, lamp.y - Math.max(1, s * 0.003), s * 0.124, Math.max(1, s * 0.003));

  // The burner, which is the one genuinely bright thing on this floor.
  ctx.fillStyle = cssAlpha(palette.tallow, 0.85);
  ctx.fillRect(lamp.x - s * 0.016, lamp.y, s * 0.032, s * 0.016);
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
  boardBottom: number,
): void {
  const top = height * BOARD_TOP;
  const bottom = height * boardBottom;

  // Rules at the multiples a player thinks in, so the ratio scale can be read.
  //
  // Chalked, not printed. A rule on a slate board is laid down by a hand with a
  // straight edge, so it breaks: this draws it as a run of short strokes whose
  // gaps and weights come from the line's own height, which makes it repeatable
  // frame to frame and still not mechanical.
  for (const multiple of [0.5, 1, 2, 5]) {
    const y = bottom - (bottom - top) * heightOf(Math.round(multiple * PRICE_DENOM));
    const thickness = Math.max(1, height * 0.0016);
    const step = Math.max(6, width * 0.016);
    ctx.fillStyle = cssAlpha(palette.tallow, 0.3);
    for (let x = 0; x < width; x += step) {
      const wobble = ((Math.sin((x + y) * 0.07) + 1) / 2) * 0.5 + 0.5; // 0.5 .. 1
      ctx.globalAlpha = wobble;
      // The last stroke is cut at the frame rather than allowed to overhang it.
      ctx.fillRect(x, y, Math.min(step * 0.82, width - x), thickness);
    }
    ctx.globalAlpha = 1;
    ctx.font = `${Math.max(9, height * 0.022)}px ui-monospace, Menlo, monospace`;
    // On the RIGHT margin. The house keeps the leftmost column, so a label on
    // the left sat underneath his price — "1.02x" printed over "1x".
    ctx.textAlign = 'right';
    ctx.fillStyle = cssAlpha(palette.tallow, 0.55);
    ctx.fillText(`${multiple}x`, width - width * 0.014, y - height * 0.008);
  }

  const best = state.slips.find(slip => slip.isBest);
  if (!best) return;

  // The line in hand, in brass: the number TAKE pays, drawn as a height.
  const y = bottom - (bottom - top) * heightOf(best.priceBp);
  ctx.fillStyle = cssAlpha(palette.brass, 0.95);
  ctx.fillRect(0, y, width, Math.max(1, height * 0.0035));
}

function drawSlips(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: FloorState,
  lamp: Lamp,
  palette: Palette,
  boardBottom: number,
): void {
  const top = height * BOARD_TOP;
  const bottom = height * boardBottom;
  const slotWidth = width / COLUMNS;

  for (const [i, slip] of state.slips.entries()) {
    const fall = clamp01(state.slipFall[i] ?? 1);
    // The house keeps the first column; a broker keeps his own, always.
    const column = slip.brokerId === null ? 0 : slip.brokerId + 1;
    const x = columnX(width, column);
    const y = bottom - (bottom - top) * heightOf(slip.priceBp) * fall;

    const ink = slip.isBest ? palette.brass : palette.tallow;
    const alpha = slip.isBest ? 1 : 0.72;

    // The slip itself: a pinned scrap of paper, at the height of its number.
    const slipW = slotWidth * 0.42;
    const slipH = Math.max(6, height * 0.05);
    // Pinned at the top and hanging, with the bottom corner turned up the way a
    // scrap of paper does.
    ctx.beginPath();
    ctx.moveTo(x - slipW / 2, y);
    ctx.lineTo(x + slipW / 2, y);
    ctx.lineTo(x + slipW / 2, y + slipH * 0.82);
    ctx.lineTo(x + slipW * 0.3, y + slipH);
    ctx.lineTo(x - slipW / 2, y + slipH * 0.94);
    ctx.closePath();
    ctx.fillStyle = litFill(ctx, lamp, palette.tallow, alpha * 0.42, palette.ink, 0.1, 1.4);
    ctx.fill();
    // A pin through the top of it.
    ctx.fillStyle = cssAlpha(slip.isBest ? palette.brass : palette.oxblood, 0.9);
    ctx.fillRect(x - Math.max(1, width * 0.002), y, Math.max(2, width * 0.004), Math.max(2, height * 0.006));

    ctx.font = `${Math.max(12, height * 0.05)}px ui-serif, Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = cssAlpha(ink, alpha);
    ctx.fillText(slip.priceText, x, y - height * 0.014);
  }
}

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
  lamp: Lamp,
  palette: Palette,
  boardBottom: number,
): void {
  const bottom = height * boardBottom;
  const slotWidth = width / COLUMNS;
  const asked = new Set(state.slips.map(slip => slip.brokerId));

  ctx.textAlign = 'center';

  for (let column = 0; column < COLUMNS; column++) {
    const brokerId = column === 0 ? null : column - 1;
    const desk = state.desks.find(entry => entry.brokerId === brokerId);
    const named = asked.has(brokerId);
    const looking = desk?.looking === true;
    const x = columnX(width, column);

    // His desk: a sloped lectern under his column, so the floor has men at it
    // rather than five labels in a row.
    const dw = slotWidth * 0.58;
    const dy = bottom + height * 0.075;
    const dh = height * 0.04;
    ctx.beginPath();
    ctx.moveTo(x - dw / 2, dy + dh);
    ctx.lineTo(x + dw / 2, dy + dh);
    ctx.lineTo(x + dw * 0.42, dy);
    ctx.lineTo(x - dw * 0.42, dy + dh * 0.28);
    ctx.closePath();
    ctx.fillStyle = litFill(ctx, lamp, palette.oxblood, looking ? 0.95 : named ? 0.78 : 0.5, palette.ink, 0.1, 1.4);
    ctx.fill();

    const name = column === 0 ? 'the house' : (desk?.name ?? BROKER_LIST[column - 1]?.name ?? '');
    const fee = column === 0 ? 'no fee' : (desk?.feeText ?? '');

    ctx.font = `${Math.max(9, height * 0.023)}px ui-monospace, Menlo, monospace`;
    ctx.fillStyle = cssAlpha(palette.tallow, looking ? 0.95 : named ? 0.78 : 0.6);
    ctx.fillText(name, x, bottom + height * 0.135);
    // The house charges nothing, so he is never "paid" — he is just there.
    const owed = named && column > 0;
    ctx.fillStyle = cssAlpha(owed ? palette.oxblood : palette.tallow, owed ? 0.85 : 0.5);
    ctx.fillText(owed ? 'paid' : fee, x, bottom + height * 0.16);

    if (looking) {
      // He is reading it: a pen moving, with no number attached to it yet.
      const t = state.reducedMotion ? 0.5 : (Math.sin(state.time * 6) + 1) / 2;
      ctx.fillStyle = cssAlpha(palette.brass, 0.85);
      ctx.fillRect(x - slotWidth * 0.22 + slotWidth * 0.44 * t, dy - height * 0.012, slotWidth * 0.05, height * 0.012);
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

    drawFloor(ctx, canvas.width, canvas.height, {
      ...game,
      slipFall,
      time,
      reducedMotion,
      readoutTop: readoutTopOf(canvas, READOUT_Y),
    });

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

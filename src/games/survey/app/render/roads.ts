/**
 * The roads (THE SURVEY). ONE canvas. Nothing else draws.
 *
 * CANDLE's claim is *brightness is the multiplier*. This game's is the same idea
 * applied to the thing it actually sells:
 *
 *   **The fog is the doubt.** The ship is drawn over the water at an opacity of
 *   exactly `P(the better call is right | the reports so far)` — the posterior
 *   confidence, straight out of `core/belief.ts`. At the outset she is 60% there
 *   because the prior leaves you 60% sure; after three reports for rot she is
 *   97.6% there, because you are. Pick her hull out of the frame, measure it,
 *   and the number is the belief. Not "looks foggier".
 *
 *   **And two reports that disagree put the fog back exactly where it was**,
 *   because the margin is the whole state. That is the game's one mathematical
 *   claim, made visible.
 *
 * Her attitude carries the DIRECTION of the belief, which opacity cannot: she
 * rides high and upright when the reports say sound, and settles by the head
 * with a list when they say rot. Both are functions of the same posterior, so
 * the picture cannot disagree with the number.
 *
 * Scene luminance is the DAYLIGHT ladder through `shared/render/light.ts`, the
 * same light model CANDLE burns on and the same 100 → 40% range: every surveyor
 * costs an hour of daylight, so what you have spent is legible without reading
 * a number. `app/daylight.ts` says why the light follows the day and not the
 * premium.
 *
 * Exactly one gradient in the whole build: the lamp's own falloff.
 *
 * This file owns pixels only. It computes no game state, reaches for no host,
 * and is handed everything it draws.
 */
import { MAX_SURVEYS } from '../../core/vessel';
import { daylightAt } from '../daylight';
import { posteriorSound, bestCallConfidence } from '../../core/belief';
import { toNumber } from '../../../../shared/math/rational';
import { cssAlpha, paletteAtWax, css, type Rgb } from '../../../../shared/render/light';

type Palette = Record<'tallow' | 'brass' | 'oxblood' | 'ink', Rgb>;

/** What the manifest says this voyage carries. */
export type Manifest = {
  readonly name: string;
  readonly valueText: string;
};

/** Everything the scene needs to draw a frame. Nothing it can derive itself. */
export type RoadsState = {
  /** 0..MAX_SURVEYS. Drives the light, through the premium ladder. */
  readonly surveys: number;
  /** Reports for sound minus reports for rot. Drives the fog and her attitude. */
  readonly margin: number;
  /** The cargo on the manifest, or null while the opening word is in flight. */
  readonly manifest: Manifest | null;
  /** True while a surveyor is aboard and his report has not come back. */
  readonly surveyorOut: boolean;
  /** What underwriting right now would pay, already formatted. */
  readonly payoutText: string | null;
  /** True once the voyage is over. */
  readonly settled: boolean;
  /** Set once she is known: true if she was sound. Null on a decline. */
  readonly wasSound: boolean | null;
  /** 0..1 per slip, so a report can animate into place. */
  readonly slipFall: readonly number[];
  /** Seconds since the scene started, for the swell. */
  readonly time: number;
  /** Honour `prefers-reduced-motion`: a flat sea, the same light. */
  readonly reducedMotion: boolean;
};

export type RoadsMetrics = {
  /** ms spent in the last frame's draw call. The frame budget is p95 < 12 ms. */
  readonly lastFrameMs: number;
  readonly frames: number;
};

const LAMP_X = 0.16;
const LAMP_Y = 0.2;
/** Where the sea meets the sky. */
const HORIZON_Y = 0.52;
/** The desk the manifest lies on. */
const DESK_Y = 0.82;

/**
 * How clearly she can be seen: the confidence that the better call is the right
 * one. THE claim of this scene, in one line.
 */
export function shipOpacity(margin: number): number {
  return toNumber(bestCallConfidence(margin));
}

/**
 * The light level for a voyage `surveys` deep: the daylight ladder, exactly.
 *
 * Every surveyor costs an hour of daylight (see `app/daylight.ts` for why the
 * light follows the day rather than the premium).
 */
export function levelFor(surveys: number): number {
  return daylightAt(surveys);
}

export function drawRoads(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: RoadsState,
): void {
  const palette = paletteAtWax(levelFor(state.surveys));
  const p = toNumber(posteriorSound(state.margin));

  // --- the room ----------------------------------------------------------
  ctx.fillStyle = css(palette.ink);
  ctx.fillRect(0, 0, width, height);

  const lampX = width * LAMP_X;
  const lampY = height * LAMP_Y;
  // The lamp's own falloff. THE one gradient.
  const reach = Math.max(width, height) * 0.78;
  const glow = ctx.createRadialGradient(lampX, lampY, 0, lampX, lampY, reach);
  glow.addColorStop(0, cssAlpha(palette.tallow, 0.26));
  glow.addColorStop(0.3, cssAlpha(palette.brass, 0.1));
  glow.addColorStop(1, cssAlpha(palette.ink, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  drawSea(ctx, width, height, state, palette);
  drawShip(ctx, width, height, state, palette, p);
  drawSlips(ctx, width, height, state, palette);
  drawManifest(ctx, width, height, state, palette);
}

// ---------------------------------------------------------------------------

function drawSea(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: RoadsState,
  palette: Palette,
): void {
  const y = height * HORIZON_Y;
  ctx.fillStyle = cssAlpha(palette.ink, 0.9);
  ctx.fillRect(0, y, width, height * DESK_Y - y);

  // The horizon: one hairline catching the lamp, no gradient.
  ctx.fillStyle = cssAlpha(palette.tallow, 0.14);
  ctx.fillRect(0, y, width, Math.max(1, height * 0.0015));

  // Three lines of swell, detuned so the water never visibly repeats. A player
  // who asked for less motion gets a flat sea and loses nothing readable.
  const swell = state.reducedMotion ? 0 : 1;
  for (let i = 0; i < 3; i++) {
    const depth = (i + 1) / 4;
    const lineY = y + (height * DESK_Y - y) * depth;
    const drift = swell * Math.sin(state.time * (0.7 + i * 0.23) + i) * width * 0.01;
    ctx.fillStyle = cssAlpha(palette.tallow, 0.06 - i * 0.015);
    ctx.fillRect(width * (0.12 + depth * 0.1) + drift, lineY, width * (0.5 - depth * 0.15), Math.max(1, height * 0.0012));
  }

  // The desk in front: where the manifest lies.
  const deskY = height * DESK_Y;
  ctx.fillStyle = cssAlpha(palette.ink, 0.96);
  ctx.fillRect(0, deskY, width, height - deskY);
  ctx.fillStyle = cssAlpha(palette.brass, 0.2);
  ctx.fillRect(0, deskY, width, Math.max(1, height * 0.0015));
}

/**
 * The ship, at the opacity the evidence earns.
 *
 * Everything about her is a function of the posterior and nothing is a function
 * of taste: opacity is the confidence, the list and how deep she floats are the
 * belief itself. A settled voyage draws her at full strength — by then she is
 * not a belief any more, she is a fact.
 */
function drawShip(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: RoadsState,
  palette: Palette,
  p: number,
): void {
  // The fog carries ALL of the doubt and the ship's own inks carry none of it,
  // so `1 - alpha` is exactly what is drawn over her and nothing scales twice.
  const alpha = state.settled && state.wasSound !== null ? 1 : shipOpacity(state.margin);
  const scale = Math.min(width, height * 1.4);
  const x = width * 0.62;
  const waterline = height * (HORIZON_Y + 0.12);

  // She settles by the head as the case for rot hardens: `p` is 0.4 at the
  // prior, so she already floats a little low before anyone goes aboard.
  const draught = (1 - p) * scale * 0.02;
  const list = (0.5 - p) * 0.22; // radians
  const hullY = waterline + draught;
  const hullW = scale * 0.34;
  const hullH = scale * 0.055;

  // A settled voyage is drawn as what she turned out to be: home in tallow,
  // lost in oxblood. Never in colour alone — the readout says it in words.
  const ink =
    state.settled && state.wasSound !== null ? (state.wasSound ? palette.tallow : palette.oxblood) : palette.tallow;

  ctx.save();
  ctx.translate(x, hullY);
  ctx.rotate(list);

  // --- the hull: a flat sheer with a raked bow ---
  ctx.beginPath();
  ctx.moveTo(-hullW / 2, -hullH);
  ctx.lineTo(hullW / 2, -hullH);
  ctx.lineTo(hullW * 0.36, 0);
  ctx.lineTo(-hullW * 0.42, 0);
  ctx.closePath();
  ctx.fillStyle = cssAlpha(ink, 0.85);
  ctx.fill();

  // --- three masts, shortening aft ---
  ctx.fillStyle = cssAlpha(ink, 0.7);
  for (let i = 0; i < 3; i++) {
    const mx = -hullW * 0.28 + i * hullW * 0.28;
    const mh = scale * (0.16 - i * 0.022);
    ctx.fillRect(mx, -hullH - mh, Math.max(1, scale * 0.004), mh);
    // One yard each, so she reads as a ship and not a comb.
    ctx.fillRect(mx - scale * 0.028, -hullH - mh * 0.78, scale * 0.06, Math.max(1, scale * 0.003));
  }

  ctx.restore();

  // --- the fog ---
  // Drawn as the room's own ink over her, at exactly what is NOT known. The
  // ship's visible strength is therefore the confidence, to the digit.
  if (alpha < 1) {
    ctx.fillStyle = cssAlpha(palette.ink, 1 - alpha);
    ctx.fillRect(width * 0.34, height * (HORIZON_Y - 0.14), width * 0.62, height * 0.34);
  }

  // A surveyor is aboard: his boat crosses the water while his report is out.
  if (state.surveyorOut) {
    const t = state.reducedMotion ? 0.5 : (Math.sin(state.time * 1.6) + 1) / 2;
    const bx = width * (0.4 + 0.16 * t);
    ctx.fillStyle = cssAlpha(palette.brass, 0.5);
    ctx.fillRect(bx, waterline + scale * 0.03, scale * 0.03, Math.max(1, scale * 0.008));
  }
}

/**
 * The surveyors' slips: five slots, one per surveyor who may be sent.
 *
 * A report for SOUND sits above the line, one for ROT below it. They are stacked
 * from the line outward rather than left to right on purpose — a pair that
 * disagrees visibly cancels, which is exactly what it does to the belief.
 */
function drawSlips(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: RoadsState,
  palette: Palette,
): void {
  const lineY = height * (DESK_Y + 0.09);
  const left = width * 0.08;
  const slot = width * 0.055;
  const slipW = slot * 0.62;
  const slipH = Math.max(2, height * 0.012);

  // The tally, from the margin: two reports that disagree occupy one slot each
  // above and below the line, which is what cancelling looks like.
  const sound = (state.surveys + state.margin) / 2;

  // The line the tally is read against.
  ctx.fillStyle = cssAlpha(palette.tallow, 0.14);
  ctx.fillRect(left, lineY, slot * MAX_SURVEYS, Math.max(1, height * 0.0012));

  for (let i = 0; i < MAX_SURVEYS; i++) {
    const x = left + i * slot;
    const fall = clamp01(state.slipFall[i] ?? 1);

    if (i < sound) {
      ctx.fillStyle = cssAlpha(palette.tallow, 0.8 * fall);
      ctx.fillRect(x, lineY - slipH * 1.6, slipW, slipH);
    } else if (i < state.surveys) {
      ctx.fillStyle = cssAlpha(palette.oxblood, 0.8 * fall);
      ctx.fillRect(x, lineY + slipH * 0.6, slipW, slipH);
    } else {
      // A surveyor not yet sent: an empty slot, still there to be bought.
      ctx.fillStyle = cssAlpha(palette.tallow, 0.12);
      ctx.fillRect(x, lineY - slipH * 0.5, slipW, Math.max(1, height * 0.0012));
    }
  }

}

/** The manifest on the desk: what she carries, and what it pays. */
function drawManifest(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: RoadsState,
  palette: Palette,
): void {
  if (!state.manifest) return;

  const scale = Math.min(width, height * 1.3);
  const x = width * 0.62;
  const y = height * (DESK_Y + 0.1);

  // The value, in the same weight CANDLE gives a face value. Hierarchy by
  // luminance, never by size — the type scale is fixed (claude.md §5).
  ctx.font = `${Math.max(18, scale * 0.085)}px ui-serif, Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = cssAlpha(state.settled ? palette.oxblood : palette.tallow, state.settled ? 0.55 : 1);
  ctx.fillText(state.manifest.valueText, x, y);

  ctx.font = `${Math.max(11, scale * 0.028)}px ui-serif, Georgia, serif`;
  ctx.fillStyle = cssAlpha(state.settled ? palette.oxblood : palette.brass, state.settled ? 0.5 : 0.9);
  ctx.fillText(state.manifest.name, x, y + scale * 0.032);

  if (state.payoutText) {
    ctx.font = `${Math.max(12, scale * 0.032)}px ui-monospace, Menlo, monospace`;
    ctx.fillStyle = cssAlpha(palette.brass, state.settled ? 0.7 : 0.95);
    ctx.fillText(state.payoutText, x, y + scale * 0.075);
  }
}

// ---------------------------------------------------------------------------
//  The loop
// ---------------------------------------------------------------------------

export type RoadsHandle = {
  /** Hand the scene a new game state. It keeps animating from there. */
  update(state: Omit<RoadsState, 'time' | 'slipFall' | 'reducedMotion'>): void;
  metrics(): RoadsMetrics;
  destroy(): void;
};

/**
 * Mounts the scene on a canvas and runs it.
 *
 * Device pixel ratio is capped at 2: past that the lamp's gradient costs more
 * than it shows, and the frame budget is 12 ms (prd.md §7).
 */
export function mountRoads(canvas: HTMLCanvasElement): RoadsHandle {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('this browser has no 2D canvas context');

  let raf = 0;
  let started = 0;
  let lastFrameMs = 0;
  let frames = 0;
  let destroyed = false;

  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  let game: Omit<RoadsState, 'time' | 'slipFall' | 'reducedMotion'> = {
    surveys: 0,
    margin: 0,
    manifest: null,
    surveyorOut: false,
    payoutText: null,
    settled: false,
    wasSound: null,
  };
  /** Animated slip positions, eased toward whether that surveyor has reported. */
  const slipFall = new Array<number>(MAX_SURVEYS).fill(0);

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

    for (let i = 0; i < MAX_SURVEYS; i++) {
      const target = i < game.surveys ? 1 : 0;
      const current = slipFall[i] ?? 0;
      slipFall[i] = current + (target - current) * 0.16;
    }

    drawRoads(ctx, canvas.width, canvas.height, { ...game, slipFall, time, reducedMotion });

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

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

/**
 * The composition, top to bottom, in fractions of the canvas height:
 *
 *   0.00          the window on to the roads
 *   HORIZON_Y     where the sea meets the sky
 *   WATERLINE_Y   where she floats
 *   DESK_Y        the underwriter's desk, with the lamp on it
 *   READOUT_Y     NOTHING is drawn below this line
 *
 * That last one is the rule this layout exists to keep. The accessible readout
 * is DOM and sits over the bottom of the same box (`table.css`), so anything the
 * canvas paints down there collides with real text. It did, until a screenshot
 * showed the manifest printed straight through the payout line.
 */
const LAMP_X = 0.12;
/** On the desk, and above the line the readout owns. */
const LAMP_Y = 0.64;
const HORIZON_Y = 0.3;
const WATERLINE_Y = 0.42;
const DESK_Y = 0.5;
/**
 * Nothing is drawn below this. The readout is DOM and wraps to more lines on a
 * narrow screen, so the reserved band is generous rather than exact — a canvas
 * that draws into it collides with real text, and a canvas that stops a little
 * early costs nothing.
 */
const READOUT_Y = 0.7;

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

  // The order is the point. The fog goes over the WINDOW and stops at the desk,
  // so its only edges are the frame's own — a hard-edged rectangle of ink in the
  // middle of the water reads as a mistake, however exact its alpha is. The lamp
  // is drawn after it, because a lamp on this side of the glass is not fogged.
  drawSea(ctx, width, height, state, palette);
  drawShip(ctx, width, height, state, palette, p);
  drawFog(ctx, width, height, state, palette);
  drawDesk(ctx, width, height, palette);
  drawLamp(ctx, width, height, palette);
  drawSlips(ctx, width, height, state, palette);
  drawManifest(ctx, width, height, state, palette);
}

/** The lamp's own falloff. THE one gradient in the whole build. */
function drawLamp(ctx: CanvasRenderingContext2D, width: number, height: number, palette: Palette): void {
  const x = width * LAMP_X;
  const y = height * LAMP_Y;
  const reach = Math.max(width, height) * 0.7;
  const glow = ctx.createRadialGradient(x, y, 0, x, y, reach);
  glow.addColorStop(0, cssAlpha(palette.tallow, 0.3));
  glow.addColorStop(0.25, cssAlpha(palette.brass, 0.12));
  glow.addColorStop(1, cssAlpha(palette.ink, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  // The lamp itself: a flame on the desk, at the edge of the frame.
  const flameH = height * 0.05;
  const flameW = Math.max(3, width * 0.012);
  ctx.beginPath();
  ctx.moveTo(x, y - flameH);
  ctx.quadraticCurveTo(x + flameW, y - flameH * 0.35, x, y);
  ctx.quadraticCurveTo(x - flameW, y - flameH * 0.35, x, y - flameH);
  ctx.fillStyle = cssAlpha(palette.tallow, 0.9);
  ctx.fill();
}

/**
 * The fog, over the window and nothing else.
 *
 * Its alpha is exactly what is NOT known, and it covers everything beyond the
 * glass — sky, sea and ship together, the way weather actually works. Because it
 * stops at the desk and runs to the frame on three sides, it has no edge of its
 * own to give the game away.
 */
function drawFog(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: RoadsState,
  palette: Palette,
): void {
  const alpha = state.settled && state.wasSound !== null ? 1 : shipOpacity(state.margin);
  if (alpha >= 1) return;
  ctx.fillStyle = cssAlpha(palette.ink, 1 - alpha);
  ctx.fillRect(0, 0, width, height * DESK_Y);
}

/** The desk in front of the window: where the manifest lies. */
function drawDesk(ctx: CanvasRenderingContext2D, width: number, height: number, palette: Palette): void {
  const y = height * DESK_Y;
  ctx.fillStyle = css(palette.ink);
  ctx.fillRect(0, y, width, height - y);
  // Its edge catches the lamp. One hairline, no gradient.
  ctx.fillStyle = cssAlpha(palette.brass, 0.3);
  ctx.fillRect(0, y, width, Math.max(1, height * 0.002));
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
  const bottom = height * DESK_Y;

  // The sky beyond the glass, in two flat bands rather than a gradient — the
  // lamp's falloff is the only gradient in the build. The upper band is barely
  // there; the lower one is the last of the light along the horizon, which is
  // what makes the roads read as a place with weather in them rather than a
  // black rectangle.
  ctx.fillStyle = cssAlpha(palette.tallow, 0.02);
  ctx.fillRect(0, 0, width, y);
  ctx.fillStyle = cssAlpha(palette.tallow, 0.04);
  ctx.fillRect(0, height * (HORIZON_Y - 0.1), width, height * 0.1);

  // The water: darker than the sky, which is what makes the horizon a line at
  // all. The four inks only — this is `ink`, over the room's own ink.
  ctx.fillStyle = cssAlpha(palette.ink, 0.75);
  ctx.fillRect(0, y, width, bottom - y);

  // The horizon: one hairline catching the light, no gradient.
  ctx.fillStyle = cssAlpha(palette.tallow, 0.22);
  ctx.fillRect(0, y, width, Math.max(1, height * 0.0018));

  // Four lines of swell, detuned so the water never visibly repeats, and each
  // one wider and fainter as it comes toward the desk. A player who asked for
  // less motion gets a flat sea and loses nothing readable.
  const swell = state.reducedMotion ? 0 : 1;
  for (let i = 0; i < 4; i++) {
    const depth = (i + 1) / 5;
    const lineY = y + (bottom - y) * depth;
    const drift = swell * Math.sin(state.time * (0.7 + i * 0.23) + i) * width * 0.012;
    const length = width * (0.34 + depth * 0.3);
    ctx.fillStyle = cssAlpha(palette.tallow, 0.1 - i * 0.02);
    ctx.fillRect(
      Math.max(0, width * (0.1 + depth * 0.06) + drift),
      lineY,
      Math.min(length, width - Math.max(0, width * (0.1 + depth * 0.06) + drift)),
      Math.max(1, height * 0.0014),
    );
  }
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
  // so `1 - alpha` is exactly what is drawn over her (in `drawFog`) and nothing
  // is scaled twice.
  const scale = Math.min(width, height * 1.1);
  const x = width * 0.6;
  const waterline = height * WATERLINE_Y;

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

  // Her reflection: one short streak under the hull, so she sits IN the water
  // rather than on top of it.
  ctx.fillStyle = cssAlpha(ink, 0.12);
  ctx.fillRect(x - hullW * 0.3, hullY + hullH * 0.35, hullW * 0.6, Math.max(1, hullH * 0.3));

  // A surveyor is aboard: his boat crosses the water while his report is out.
  if (state.surveyorOut) {
    const t = state.reducedMotion ? 0.5 : (Math.sin(state.time * 1.6) + 1) / 2;
    const bx = width * (0.3 + 0.22 * t);
    const by = waterline + scale * 0.06;
    ctx.fillStyle = cssAlpha(palette.brass, 0.55);
    ctx.fillRect(bx, by, scale * 0.035, Math.max(1, scale * 0.01));
    // One oar out of each side, so it reads as a boat being rowed.
    ctx.fillStyle = cssAlpha(palette.brass, 0.3);
    ctx.fillRect(bx - scale * 0.012, by - scale * 0.006, scale * 0.06, Math.max(1, scale * 0.003));
  }
}

/**
 * The surveyors' slips: five slots, one per surveyor who may be sent.
 *
 * A report for SOUND sits above the line, one for ROT below it. They are stacked
 * from the line outward rather than left to right on purpose — a pair that
 * disagrees visibly cancels, which is exactly what it does to the belief.
 *
 * Anchored UP from the bottom edge, like everything else on the desk: a layout
 * measured down from the top runs off the canvas on a short viewport, and the
 * gallery renders this page as a miniature.
 */
function drawSlips(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: RoadsState,
  palette: Palette,
): void {
  // On the desk, and above the line the DOM readout owns.
  const lineY = height * (DESK_Y + (READOUT_Y - DESK_Y) * 0.62);
  // Clear of the lamp, which stands at the left-hand edge of the desk.
  const left = width * 0.22;
  const slot = width * 0.05;
  const slipW = slot * 0.6;
  const slipH = Math.max(2, height * 0.014);

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

/**
 * The manifest on the desk: what she carries, and what it pays.
 *
 * Three lines, laid out UPWARD from the bottom edge — the payout nearest the
 * player, the cargo above it, the value above that. Measured down from the desk
 * instead, the payout fell off the bottom of the canvas at ordinary aspect
 * ratios and nothing said so.
 */
function drawManifest(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: RoadsState,
  palette: Palette,
): void {
  if (!state.manifest) return;

  const scale = Math.min(width, height * 1.1);
  const x = width * 0.62;
  // Everything on the desk is laid out UP from the readout line, never down
  // from the top: the DOM readout owns the bottom of this box.
  const bottom = height * READOUT_Y;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  if (state.payoutText) {
    ctx.font = `${Math.max(12, scale * 0.032)}px ui-monospace, Menlo, monospace`;
    ctx.fillStyle = cssAlpha(palette.brass, state.settled ? 0.7 : 0.95);
    ctx.fillText(state.payoutText, x, bottom);
  }

  const nameY = bottom - Math.max(16, scale * 0.045);
  ctx.font = `${Math.max(11, scale * 0.028)}px ui-serif, Georgia, serif`;
  ctx.fillStyle = cssAlpha(state.settled ? palette.oxblood : palette.brass, state.settled ? 0.5 : 0.9);
  ctx.fillText(state.manifest.name, x, nameY);

  // The value, in the same weight CANDLE gives a face value. Hierarchy by
  // luminance, never by size — the type scale is fixed (claude.md §5).
  ctx.font = `${Math.max(18, scale * 0.085)}px ui-serif, Georgia, serif`;
  ctx.fillStyle = cssAlpha(state.settled ? palette.oxblood : palette.tallow, state.settled ? 0.55 : 1);
  ctx.fillText(state.manifest.valueText, x, nameY - Math.max(14, scale * 0.032));
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

/**
 * The scene (docs.md §6.1). ONE canvas. Nothing else draws.
 *
 * One emitter — the flame — at a fixed position, and scene luminance is a direct
 * function of `WAX_BP[k]` through `light.ts`. The room at the fifth inch is
 * genuinely dim, so the player reads the decay without reading text.
 *
 * Exactly one gradient in the whole build: the flame's own falloff.
 *
 * This file owns pixels only. It computes no game state, reaches for no host,
 * and is handed everything it draws.
 */
import { INCHES, waxBpAt } from '../../games/candle/core/wax';
import { cssAlpha, paletteAtWax, css, type Rgb } from './light';

/** Everything the scene needs to draw a frame. Nothing it can derive itself. */
export type SceneState = {
  /** 1..INCHES. Drives the light. */
  readonly inch: number;
  /** The lot on the table, or null while a word is in flight. */
  readonly lot: LotFace | null;
  /**
   * The lot the player just refused. It goes oxblood and RECEDES while the next
   * word is in flight, so a burn leaves a visible trace of what was given up.
   */
  readonly burnedLot: LotFace | null;
  /** 0..1, how far the refused lot has receded. */
  readonly burnedFade: number;
  /** What claiming right now would pay, already formatted. */
  readonly payoutText: string | null;
  /** Pins that have fallen, as a fraction 0..1 each, so a fall can animate. */
  readonly pinFall: readonly number[];
  /** 0..1. The wick's flare just before it dies — Pepys' tell. */
  readonly flare: number;
  /** True once the round has settled; the lot recedes into oxblood. */
  readonly settled: boolean;
  /** Seconds since the scene started, for the flame's idle motion. */
  readonly time: number;
  /** Honour `prefers-reduced-motion`: a steady flame, same light. */
  readonly reducedMotion: boolean;
};

export type LotFace = {
  readonly name: string;
  readonly faceText: string;
  readonly isEmpty: boolean;
};

export type SceneMetrics = {
  /** ms spent in the last frame's draw call. The frame budget is p95 < 12 ms. */
  readonly lastFrameMs: number;
  readonly frames: number;
};

const CANDLE_X = 0.26; // fraction of width
const FLAME_Y = 0.22;
const TABLE_Y = 0.78;

export function drawScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: SceneState,
): void {
  const waxBp = waxBpAt(clampInch(state.inch));
  const palette = paletteAtWax(waxBp);
  const flareBoost = 1 + state.flare * 0.9;

  // --- the room ----------------------------------------------------------
  ctx.fillStyle = css(palette.ink);
  ctx.fillRect(0, 0, width, height);

  const flameX = width * CANDLE_X;
  const flameY = height * FLAME_Y;
  // The flame's own falloff. THE one gradient (docs.md §6.1).
  const reach = Math.max(width, height) * (0.62 + state.flare * 0.12);
  const glow = ctx.createRadialGradient(flameX, flameY, 0, flameX, flameY, reach);
  glow.addColorStop(0, cssAlpha(palette.tallow, 0.3 * flareBoost));
  glow.addColorStop(0.25, cssAlpha(palette.brass, 0.12 * flareBoost));
  glow.addColorStop(1, cssAlpha(palette.ink, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  drawTable(ctx, width, height, palette.ink, palette.brass);
  drawCandle(ctx, width, height, state, palette, flareBoost);
  drawBurnedLot(ctx, width, height, state, palette);
  drawLot(ctx, width, height, state, palette);
}

// ---------------------------------------------------------------------------

function drawTable(ctx: CanvasRenderingContext2D, width: number, height: number, ink: Rgb, brass: Rgb): void {
  const y = height * TABLE_Y;
  ctx.fillStyle = cssAlpha(ink, 0.85);
  ctx.fillRect(0, y, width, height - y);
  // The table edge catches the light. One hairline, no gradient.
  ctx.fillStyle = cssAlpha(brass, 0.22);
  ctx.fillRect(0, y, width, Math.max(1, height * 0.0015));
}

function drawCandle(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: SceneState,
  palette: Record<'tallow' | 'brass' | 'oxblood' | 'ink', Rgb>,
  flareBoost: number,
): void {
  const x = width * CANDLE_X;
  const flameY = height * FLAME_Y;
  const tableY = height * TABLE_Y;
  const bodyWidth = Math.max(8, width * 0.045);

  // How much wax is left, as a length. The candle physically shortens.
  const burned = (state.inch - 1) / INCHES;
  const topY = flameY + height * 0.05 + burned * (tableY - flameY) * 0.55;

  // --- the body ---
  ctx.fillStyle = cssAlpha(palette.tallow, 0.55);
  ctx.fillRect(x - bodyWidth / 2, topY, bodyWidth, tableY - topY);
  // The lit side, facing the flame.
  ctx.fillStyle = cssAlpha(palette.tallow, 0.28);
  ctx.fillRect(x - bodyWidth / 2, topY, bodyWidth * 0.35, tableY - topY);

  // --- the five pins ---
  // A pin marks each inch. When an inch burns, its pin FALLS: the animation and
  // the sound are the same event (docs.md §6.1).
  const pinRadius = Math.max(2, width * 0.006);
  const span = tableY - topY;
  for (let i = 0; i < INCHES; i++) {
    const fall = clamp01(state.pinFall[i] ?? 0);
    const restY = topY + (span * (i + 1)) / (INCHES + 1);
    const y = restY + fall * fall * (tableY - restY + height * 0.06);
    const alpha = fall > 0 ? 0.25 * (1 - fall) : 0.95;

    ctx.beginPath();
    ctx.arc(x + bodyWidth * 0.62, y, pinRadius, 0, Math.PI * 2);
    ctx.fillStyle = fall > 0 ? cssAlpha(palette.oxblood, Math.max(alpha, 0.12)) : cssAlpha(palette.tallow, alpha);
    ctx.fill();
  }

  // --- the wick and the flame ---
  // Two detuned sines, so the flicker never visibly repeats. A player who has
  // asked for reduced motion gets a steady flame; the light model is unchanged,
  // so they lose nothing they need to read.
  const flicker = state.reducedMotion
    ? 0
    : Math.sin(state.time * 7.3) * 0.04 + Math.sin(state.time * 11.7) * 0.02;
  const flameH = height * (0.055 + state.flare * 0.05) * (1 + flicker);
  const flameW = bodyWidth * (0.55 + state.flare * 0.25);

  ctx.beginPath();
  ctx.moveTo(x, topY - flameH);
  ctx.quadraticCurveTo(x + flameW, topY - flameH * 0.35, x, topY);
  ctx.quadraticCurveTo(x - flameW, topY - flameH * 0.35, x, topY - flameH);
  ctx.fillStyle = cssAlpha(palette.tallow, Math.min(1, 0.85 * flareBoost));
  ctx.fill();
}

function drawLot(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: SceneState,
  palette: Record<'tallow' | 'brass' | 'oxblood' | 'ink', Rgb>,
): void {
  if (!state.lot) return;

  const x = width * 0.52;
  const y = height * TABLE_Y;
  const scale = Math.min(width, height * 1.3);

  // A let-burn or settled lot goes oxblood and recedes. The recede is carried by
  // position and weight as well as colour — nothing is said in colour alone.
  const receded = state.settled;
  const bodyInk = receded ? palette.oxblood : state.lot.isEmpty ? palette.oxblood : palette.brass;
  const lift = receded ? scale * 0.012 : 0;

  // The lot itself: a crate on the table.
  const w = scale * 0.2;
  const h = scale * 0.12;
  ctx.fillStyle = cssAlpha(bodyInk, receded ? 0.3 : 0.5);
  ctx.fillRect(x - w / 2, y - h + lift, w, h);
  ctx.fillStyle = cssAlpha(bodyInk, receded ? 0.45 : 0.85);
  ctx.fillRect(x - w / 2, y - h + lift, w, Math.max(1, scale * 0.004));

  // Its face value, in brass, above the crate. Hierarchy by luminance, never by
  // size — the type scale is fixed (claude.md §5).
  const faceSize = Math.max(18, scale * 0.085);
  ctx.font = `${faceSize}px ui-serif, Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = cssAlpha(receded ? palette.oxblood : palette.tallow, receded ? 0.55 : 1);
  ctx.fillText(state.lot.faceText, x, y - h - scale * 0.045 + lift);

  const nameSize = Math.max(11, scale * 0.028);
  ctx.font = `${nameSize}px ui-serif, Georgia, serif`;
  ctx.fillStyle = cssAlpha(receded ? palette.oxblood : bodyInk, receded ? 0.5 : 0.9);
  ctx.fillText(state.lot.name, x, y - h - scale * 0.018 + lift);

  if (state.payoutText) {
    ctx.font = `${Math.max(12, scale * 0.032)}px ui-monospace, Menlo, monospace`;
    ctx.fillStyle = cssAlpha(palette.brass, receded ? 0.7 : 0.95);
    ctx.fillText(state.payoutText, x, y + scale * 0.05);
  }
}

/** The refused lot, sliding back into the dark in oxblood. */
function drawBurnedLot(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: SceneState,
  palette: Record<'tallow' | 'brass' | 'oxblood' | 'ink', Rgb>,
): void {
  if (!state.burnedLot || state.burnedFade >= 1) return;

  const fade = clamp01(state.burnedFade);
  const scale = Math.min(width, height * 1.3);
  const x = width * 0.52 + scale * 0.06 * fade;
  const y = height * TABLE_Y - scale * 0.04 * fade;
  const alpha = (1 - fade) * 0.5;

  ctx.font = `${Math.max(12, scale * 0.05 * (1 - fade * 0.3))}px ui-serif, Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = cssAlpha(palette.oxblood, alpha);
  ctx.fillText(state.burnedLot.faceText, x, y);
}

// ---------------------------------------------------------------------------
//  The loop
// ---------------------------------------------------------------------------

export type SceneHandle = {
  /** Hand the scene a new game state. It keeps animating from there. */
  update(state: Omit<SceneState, 'time' | 'pinFall' | 'flare' | 'burnedFade' | 'reducedMotion'>): void;
  metrics(): SceneMetrics;
  destroy(): void;
};

/**
 * Mounts the scene on a canvas and runs it.
 *
 * Device pixel ratio is capped at 2: past that the flame's gradient costs more
 * than it shows, and the frame budget is 12 ms (prd.md §7).
 */
export function mountScene(canvas: HTMLCanvasElement): SceneHandle {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('this browser has no 2D canvas context');

  let raf = 0;
  let started = 0;
  let lastFrameMs = 0;
  let frames = 0;
  let destroyed = false;

  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  let game: Omit<SceneState, 'time' | 'pinFall' | 'flare' | 'burnedFade' | 'reducedMotion'> = {
    inch: 1,
    lot: null,
    burnedLot: null,
    payoutText: null,
    settled: false,
  };
  let burnedFade = 1;
  let lastBurned: LotFace | null = null;
  /** Animated pin positions, eased toward whether their inch has burned. */
  const pinFall = new Array<number>(INCHES).fill(0);
  let flare = 0;

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

    // Pins fall for every inch already burned, one behind the current inch.
    for (let i = 0; i < INCHES; i++) {
      const target = i < game.inch - 1 ? 1 : 0;
      const current = pinFall[i] ?? 0;
      pinFall[i] = current + (target - current) * 0.14;
    }

    // The flare: the wick brightens just before it dies, at the fifth inch.
    const flareTarget = game.inch >= INCHES && !game.settled ? 1 : 0;
    flare += (flareTarget - flare) * 0.08;

    // A refused lot recedes over about half a second, then stops being drawn.
    if (game.burnedLot !== lastBurned) {
      lastBurned = game.burnedLot;
      burnedFade = game.burnedLot ? 0 : 1;
    }
    if (burnedFade < 1) burnedFade = Math.min(1, burnedFade + 0.035);

    drawScene(ctx, canvas.width, canvas.height, { ...game, pinFall, flare, time, burnedFade, reducedMotion });

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

// ---------------------------------------------------------------------------

function clampInch(inch: number): number {
  return inch < 1 ? 1 : inch > INCHES ? INCHES : Math.round(inch);
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

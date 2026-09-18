/**
 * The scene (docs.md §6.1). ONE canvas. Nothing else draws.
 *
 * One emitter — the flame — at a fixed position, and scene luminance is a direct
 * function of `WAX_BP[k]` through `light.ts`. The room at the fifth inch is
 * genuinely dim, so the player reads the decay without reading text.
 *
 * **Every gradient in this file is centred on the flame.** That is the rule, and
 * it is stricter than the one it replaces. The scene used to allow exactly one
 * gradient, which sounded disciplined and was actually the reason every object
 * in the room was a flat rectangle: with only alpha to work with, a crate and a
 * candle and a table are all the same slab at different opacities. Shading a
 * surface by its distance from the flame is not decoration — it is the light
 * model applied per surface instead of once for the whole room. `litFill` is the
 * only way a surface gets its colour here, so a gradient that did not come from
 * the flame cannot be written by accident.
 *
 * This file owns pixels only. It computes no game state, reaches for no host,
 * and is handed everything it draws.
 */
import { INCHES, waxBpAt } from '../../core/wax';
import { cssAlpha, paletteAtWax, css, type Rgb } from '../../../../shared/render/light';
import { drawGrain, SOOT } from '../../../../shared/render/grain';

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
  /** Which of the six the auctioneer put down. Decides what is DRAWN. */
  readonly id: number;
  readonly name: string;
  readonly faceText: string;
  readonly isEmpty: boolean;
};

export type SceneMetrics = {
  /** ms spent in the last frame's draw call. The frame budget is p95 < 12 ms. */
  readonly lastFrameMs: number;
  readonly frames: number;
};

const CANDLE_X = 0.22; // fraction of width
const FLAME_Y = 0.3;
/**
 * The table is higher than it was (0.78) because the room below it was empty
 * and the room above it was emptier. Goods now stand ON a surface with depth
 * behind them rather than floating in a vignette.
 */
const TABLE_Y = 0.66;
const LOT_X = 0.56;

type Palette = Record<'tallow' | 'brass' | 'oxblood' | 'ink', Rgb>;

// ---------------------------------------------------------------------------
//  Lighting — every surface takes its colour from the flame, or not at all
// ---------------------------------------------------------------------------

type Lamp = { readonly x: number; readonly y: number; readonly reach: number };

/**
 * A fill that falls off from the flame.
 *
 * `near` is the colour of the surface where the light strikes it, `far` where it
 * has run out. Both are palette inks, so nothing can introduce a fifth colour by
 * shading. The gradient's origin is ALWAYS the lamp — that is what makes this
 * lighting rather than styling.
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
  g.addColorStop(0.45, cssAlpha(near, nearAlpha * 0.55 + farAlpha * 0.45));
  g.addColorStop(1, cssAlpha(far, farAlpha));
  return g;
}

/**
 * The same light, ramped across ONE OBJECT rather than across the room.
 *
 * `litFill` sizes its ramp to the whole room, which is right for walls and
 * tables and wrong for anything standing away from the candle: the goods sat so
 * far down the falloff that every one of them sampled the dark end and read as a
 * smudge. This keeps the origin at the flame — the direction of the shading is
 * still where the light comes from — and sets the radius from the object's own
 * distance, so its lit face is lit and its far face is not.
 */
function objectFill(
  ctx: CanvasRenderingContext2D,
  lamp: Lamp,
  x: number,
  y: number,
  near: Rgb,
  nearAlpha: number,
  far: Rgb,
  farAlpha: number,
): CanvasGradient {
  const d = Math.max(Math.hypot(x - lamp.x, y - lamp.y), 1);
  const g = ctx.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, d * 1.85);
  g.addColorStop(0, cssAlpha(near, nearAlpha));
  g.addColorStop(0.62, cssAlpha(near, nearAlpha * 0.72 + farAlpha * 0.28));
  g.addColorStop(1, cssAlpha(far, farAlpha));
  return g;
}

/** How strongly the flame reaches a point, 0..1. For picking a flat ink. */
function reachAt(lamp: Lamp, x: number, y: number): number {
  const d = Math.hypot(x - lamp.x, y - lamp.y) / lamp.reach;
  return d >= 1 ? 0 : (1 - d) * (1 - d);
}

// ---------------------------------------------------------------------------

export function drawScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: SceneState,
): void {
  const waxBp = waxBpAt(clampInch(state.inch));
  const palette = paletteAtWax(waxBp);
  const flareBoost = 1 + state.flare * 0.9;

  const lamp: Lamp = {
    x: width * CANDLE_X,
    y: height * FLAME_Y,
    reach: Math.max(width, height) * (0.42 + state.flare * 0.1),
  };

  // --- the room ----------------------------------------------------------
  ctx.fillStyle = css(palette.ink);
  ctx.fillRect(0, 0, width, height);

  drawWall(ctx, width, height, lamp, palette, flareBoost);
  drawTable(ctx, width, height, lamp, palette);

  // Smoke in the air the flame is lighting: over the room, under everything
  // solid, so the room has a surface and the goods never do.
  drawGrain(ctx, width, height, SOOT);

  drawBurnedLot(ctx, width, height, state, palette);
  drawLot(ctx, width, height, state, lamp, palette);
  drawCandlestick(ctx, width, height, state, lamp, palette, flareBoost);
}

// ---------------------------------------------------------------------------
//  The room
// ---------------------------------------------------------------------------

/**
 * Oak panelling behind the table.
 *
 * The wall exists so the goods have something to stand in front of. Without it
 * the upper half of the frame was pure black and the scene read as an object
 * floating in a void rather than a room with a table in it.
 */
function drawWall(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  lamp: Lamp,
  palette: Palette,
  flareBoost: number,
): void {
  const tableY = height * TABLE_Y;

  // The wall itself, warmed where the flame reaches it.
  ctx.fillStyle = litFill(ctx, lamp, palette.tallow, 0.085 * flareBoost, palette.tallow, 0.012, 1.15);
  ctx.fillRect(0, 0, width, tableY);

  // Panel stiles. Each one is a plain fill; the LIGHT is what varies across
  // them, so the wall recedes without a second gradient doing the work.
  const panels = 7;
  const panelW = width / panels;
  for (let i = 0; i < panels; i++) {
    const x = i * panelW;
    const lit = reachAt(lamp, x + panelW / 2, tableY * 0.55);
    // A groove between panels, and the raised face beside it.
    ctx.fillStyle = cssAlpha(palette.ink, 0.55);
    ctx.fillRect(x, 0, Math.max(1, panelW * 0.045), tableY);
    ctx.fillStyle = cssAlpha(palette.tallow, 0.03 * lit);
    ctx.fillRect(x + panelW * 0.045, 0, Math.max(1, panelW * 0.02), tableY);
  }

  // The rail the panels die into, just above the table.
  const railY = tableY - height * 0.055;
  ctx.fillStyle = litFill(ctx, lamp, palette.brass, 0.1, palette.tallow, 0.018);
  ctx.fillRect(0, railY, width, height * 0.055);
  ctx.fillStyle = litFill(ctx, lamp, palette.brass, 0.2, palette.ink, 0);
  ctx.fillRect(0, railY, width, Math.max(1, height * 0.004));
}

/** The auctioneer's table: oak boards running away from the reader. */
function drawTable(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  lamp: Lamp,
  palette: Palette,
): void {
  const y = height * TABLE_Y;
  const depth = height - y;

  ctx.fillStyle = litFill(ctx, lamp, palette.brass, 0.2, palette.tallow, 0.03, 1.2);
  ctx.fillRect(0, y, width, depth);

  // Board seams. They converge slightly, which is all the perspective a table
  // seen from one end needs.
  const boards = 5;
  for (let i = 1; i < boards; i++) {
    const t = i / boards;
    const xTop = width * (0.12 + t * 0.76);
    const xBottom = width * (t * 1.0 - 0.02);
    ctx.beginPath();
    ctx.moveTo(xTop, y);
    ctx.lineTo(xBottom, height);
    ctx.lineTo(xBottom + Math.max(1, width * 0.0016), height);
    ctx.lineTo(xTop + Math.max(1, width * 0.0016), y);
    ctx.closePath();
    ctx.fillStyle = cssAlpha(palette.ink, 0.5);
    ctx.fill();
  }

  // The far edge of the table catches the flame. One hairline.
  ctx.fillStyle = litFill(ctx, lamp, palette.brass, 0.5, palette.ink, 0);
  ctx.fillRect(0, y, width, Math.max(1, height * 0.0035));
}

// ---------------------------------------------------------------------------
//  The candle
// ---------------------------------------------------------------------------

function drawCandlestick(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: SceneState,
  lamp: Lamp,
  palette: Palette,
  flareBoost: number,
): void {
  const x = width * CANDLE_X;
  const tableY = height * TABLE_Y;
  const s = Math.min(width, height * 1.4);
  const bodyW = s * 0.052;

  // --- the stick: foot, stem, drip pan ---
  const footY = tableY + s * 0.055;
  const panY = tableY - s * 0.02;

  ellipse(ctx, x, footY, s * 0.075, s * 0.018);
  ctx.fillStyle = litFill(ctx, lamp, palette.brass, 1, palette.oxblood, 0.4);
  ctx.fill();

  ctx.fillStyle = litFill(ctx, lamp, palette.brass, 0.95, palette.oxblood, 0.35);
  ctx.fillRect(x - s * 0.016, panY, s * 0.032, footY - panY);
  // A knop halfway down the stem — the one thing that says "turned metal".
  ellipse(ctx, x, (panY + footY) / 2, s * 0.024, s * 0.014);
  ctx.fillStyle = litFill(ctx, lamp, palette.brass, 1, palette.oxblood, 0.45);
  ctx.fill();

  ellipse(ctx, x, panY, s * 0.062, s * 0.015);
  ctx.fillStyle = litFill(ctx, lamp, palette.brass, 1, palette.oxblood, 0.5);
  ctx.fill();

  // --- the candle body: it shortens as the wax goes ---
  const burned = (state.inch - 1) / INCHES;
  const topY = lamp.y + s * 0.035 + burned * (panY - lamp.y) * 0.62;

  ctx.fillStyle = litFill(ctx, lamp, palette.tallow, 1, palette.oxblood, 0.55);
  ctx.fillRect(x - bodyW / 2, topY, bodyW, panY - topY);

  // Wax that has run down the side. More of it the longer it has burned, which
  // is the same fact the light is telling, said in a second way.
  const drips = 3;
  for (let i = 0; i < drips; i++) {
    const t = (i + 1) / (drips + 1);
    const dx = x + bodyW * (i % 2 === 0 ? -0.34 : 0.34);
    const len = (panY - topY) * (0.12 + burned * 0.38) * (0.7 + t * 0.6);
    const w = bodyW * 0.15;
    ctx.beginPath();
    ctx.moveTo(dx - w, topY + (panY - topY) * 0.08 * (i + 1));
    ctx.lineTo(dx + w, topY + (panY - topY) * 0.08 * (i + 1));
    ctx.lineTo(dx + w * 0.7, topY + (panY - topY) * 0.08 * (i + 1) + len);
    ctx.quadraticCurveTo(dx, topY + (panY - topY) * 0.08 * (i + 1) + len + w, dx - w * 0.7, topY + (panY - topY) * 0.08 * (i + 1) + len);
    ctx.closePath();
    ctx.fillStyle = litFill(ctx, lamp, palette.tallow, 0.92, palette.oxblood, 0.4);
    ctx.fill();
  }

  // The lip at the top, where the wax has melted back around the wick.
  ellipse(ctx, x, topY, bodyW * 0.62, bodyW * 0.2);
  ctx.fillStyle = litFill(ctx, lamp, palette.tallow, 0.9, palette.tallow, 0.5);
  ctx.fill();

  // --- the five pins ---
  // A pin marks each inch. When an inch burns, its pin FALLS: the animation and
  // the sound are the same event (docs.md §6.1).
  const pinR = Math.max(2, s * 0.007);
  const span = panY - topY;
  for (let i = 0; i < INCHES; i++) {
    const fall = clamp01(state.pinFall[i] ?? 0);
    const restY = topY + (span * (i + 1)) / (INCHES + 1);
    // A fallen pin lands in the drip pan rather than leaving the frame.
    const y = restY + fall * fall * (panY - restY);
    const alpha = fall > 0 ? 0.3 * (1 - fall) + 0.25 : 0.95;

    // The pin's head, and the shaft that holds it in the wax.
    ctx.fillStyle = fall > 0 ? cssAlpha(palette.oxblood, alpha) : cssAlpha(palette.tallow, alpha);
    ctx.fillRect(x + bodyW * 0.3, y - Math.max(1, pinR * 0.25), bodyW * 0.5, Math.max(1, pinR * 0.5));
    ctx.beginPath();
    ctx.arc(x + bodyW * 0.82, y, pinR, 0, Math.PI * 2);
    ctx.fill();
  }

  drawFlame(ctx, x, topY, s, state, palette, flareBoost);
}

/**
 * The flame, in layers: a halo, the body, and a hot core.
 *
 * One shape was a teardrop with no inside. A real flame is brightest where the
 * wick is and fades outward, so it is drawn as three nested shapes rather than
 * one — and because the colour of each comes from the same tallow ink at
 * different strengths, the room's palette still governs it.
 */
function drawFlame(
  ctx: CanvasRenderingContext2D,
  x: number,
  topY: number,
  s: number,
  state: SceneState,
  palette: Palette,
  flareBoost: number,
): void {
  // Two detuned sines, so the flicker never visibly repeats. A player who has
  // asked for reduced motion gets a steady flame; the light model is unchanged,
  // so they lose nothing they need to read.
  const flicker = state.reducedMotion
    ? 0
    : Math.sin(state.time * 7.3) * 0.05 + Math.sin(state.time * 11.7) * 0.025;
  const lean = state.reducedMotion ? 0 : Math.sin(state.time * 2.9) * s * 0.004;

  const h = s * (0.062 + state.flare * 0.055) * (1 + flicker);
  const w = s * (0.019 + state.flare * 0.008);

  const teardrop = (hh: number, ww: number) => {
    ctx.beginPath();
    ctx.moveTo(x + lean, topY - hh);
    ctx.quadraticCurveTo(x + ww, topY - hh * 0.32, x, topY + s * 0.004);
    ctx.quadraticCurveTo(x - ww, topY - hh * 0.32, x + lean, topY - hh);
    ctx.closePath();
  };

  teardrop(h * 1.35, w * 1.9);
  ctx.fillStyle = cssAlpha(palette.brass, Math.min(0.35, 0.22 * flareBoost));
  ctx.fill();

  teardrop(h, w);
  ctx.fillStyle = cssAlpha(palette.tallow, Math.min(1, 0.8 * flareBoost));
  ctx.fill();

  teardrop(h * 0.52, w * 0.42);
  ctx.fillStyle = cssAlpha(palette.tallow, 1);
  ctx.fill();
}

// ---------------------------------------------------------------------------
//  The lot — six goods, six silhouettes
// ---------------------------------------------------------------------------

function drawLot(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: SceneState,
  lamp: Lamp,
  palette: Palette,
): void {
  if (!state.lot) return;

  const x = width * LOT_X;
  const baseY = height * TABLE_Y + (height - height * TABLE_Y) * 0.42;
  const s = Math.min(width, height * 1.4);

  // A settled lot goes oxblood and lifts away. The recede is carried by position
  // and weight as well as colour — nothing is said in colour alone.
  const receded = state.settled;
  const lift = receded ? -s * 0.012 : 0;
  const ink = receded ? palette.oxblood : palette.brass;
  const strength = receded ? 0.45 : 1;

  ctx.save();
  ctx.translate(0, lift);

  // What every object standing on a table has and no rectangle had: a shadow.
  ellipse(ctx, x, baseY + s * 0.004, s * 0.14, s * 0.022);
  ctx.fillStyle = cssAlpha(palette.ink, 0.55);
  ctx.fill();

  // The subject of the frame. Lit harder than the room it stands in, because a
  // player decides about the GOODS, not about the table.
  const goods = GOODS[state.lot.id] ?? drawCrate;
  goods(ctx, x, baseY, s, lamp, palette, ink, strength);

  ctx.restore();

  // Its face value, in tallow, above the goods. Hierarchy by luminance, never by
  // size — the type scale is fixed (claude.md §5).
  const faceSize = Math.max(18, s * 0.075);
  ctx.font = `${faceSize}px ui-serif, Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = cssAlpha(receded ? palette.oxblood : palette.tallow, receded ? 0.55 : 1);
  ctx.fillText(state.lot.faceText, x, height * TABLE_Y - s * 0.075 + lift);

  const nameSize = Math.max(11, s * 0.026);
  ctx.font = `${nameSize}px ui-serif, Georgia, serif`;
  ctx.fillStyle = cssAlpha(receded ? palette.oxblood : ink, receded ? 0.5 : 0.9);
  ctx.fillText(state.lot.name, x, height * TABLE_Y - s * 0.045 + lift);

  if (state.payoutText) {
    ctx.font = `${Math.max(12, s * 0.03)}px ui-monospace, Menlo, monospace`;
    ctx.fillStyle = cssAlpha(palette.brass, receded ? 0.7 : 0.95);
    ctx.fillText(state.payoutText, x, baseY + s * 0.075 + lift);
  }
}

type Goods = (
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  s: number,
  lamp: Lamp,
  palette: Palette,
  ink: Rgb,
  strength: number,
) => void;

/** An open crate with nothing in it. The commonest lot, and the emptiest. */
const drawCrate: Goods = (ctx, x, baseY, s, lamp, palette, ink, strength) => {
  const w = s * 0.2;
  const h = s * 0.115;
  const top = baseY - h;

  // The dark inside, seen over the front boards.
  ctx.fillStyle = cssAlpha(palette.ink, 0.9);
  ctx.fillRect(x - w / 2, top, w, h);

  // Front boards, with gaps you can see the dark through.
  const boards = 4;
  for (let i = 0; i < boards; i++) {
    const by = top + (h / boards) * i + s * 0.004;
    ctx.fillStyle = objectFill(ctx, lamp, x, baseY, ink, 0.82 * strength, palette.ink, 0.06);
    ctx.fillRect(x - w / 2, by, w, h / boards - s * 0.006);
  }
  // Corner battens, top and bottom rails.
  ctx.fillStyle = objectFill(ctx, lamp, x, baseY, ink, 1.0 * strength, palette.ink, 0.08);
  ctx.fillRect(x - w / 2, top, w * 0.07, h);
  ctx.fillRect(x + w / 2 - w * 0.07, top, w * 0.07, h);
  ctx.fillRect(x - w / 2, top, w, s * 0.008);

  // The lid, leaning against the side — the reason you can see it is empty.
  ctx.save();
  ctx.translate(x - w * 0.62, baseY);
  ctx.rotate(-0.22);
  ctx.fillStyle = objectFill(ctx, lamp, x, baseY, ink, 0.66 * strength, palette.ink, 0.05);
  ctx.fillRect(-w * 0.1, -h * 0.92, w * 0.2, h * 0.92);
  ctx.restore();
};

/** Ship's stores: a barrel and a sack. */
const drawStores: Goods = (ctx, x, baseY, s, lamp, palette, ink, strength) => {
  const bw = s * 0.11;
  const bh = s * 0.125;
  const top = baseY - bh;

  // The barrel, bellied out at the middle.
  ctx.beginPath();
  ctx.moveTo(x - bw * 0.38, top);
  ctx.quadraticCurveTo(x - bw * 0.58, baseY - bh / 2, x - bw * 0.38, baseY);
  ctx.lineTo(x + bw * 0.38, baseY);
  ctx.quadraticCurveTo(x + bw * 0.58, baseY - bh / 2, x + bw * 0.38, top);
  ctx.closePath();
  ctx.fillStyle = objectFill(ctx, lamp, x, baseY, ink, 0.86 * strength, palette.ink, 0.06);
  ctx.fill();

  // Two hoops, which is what turns a shape into a barrel.
  for (const t of [0.26, 0.72]) {
    ctx.fillStyle = objectFill(ctx, lamp, x, baseY, palette.brass, 0.95 * strength, palette.ink, 0.08);
    ctx.fillRect(x - bw * 0.56, top + bh * t, bw * 1.12, s * 0.006);
  }
  // The head of the barrel.
  ellipse(ctx, x, top, bw * 0.38, bw * 0.12);
  ctx.fillStyle = objectFill(ctx, lamp, x, baseY, ink, 1.0 * strength, palette.ink, 0.1);
  ctx.fill();

  // A sack slumped beside it.
  ctx.beginPath();
  ctx.moveTo(x + bw * 0.62, baseY);
  ctx.quadraticCurveTo(x + bw * 0.6, baseY - bh * 0.62, x + bw * 1.0, baseY - bh * 0.58);
  ctx.quadraticCurveTo(x + bw * 1.4, baseY - bh * 0.5, x + bw * 1.34, baseY);
  ctx.closePath();
  ctx.fillStyle = objectFill(ctx, lamp, x, baseY, ink, 0.62 * strength, palette.ink, 0.05);
  ctx.fill();
};

/** Cordage: a coil of rope, which is all arcs. */
const drawCordage: Goods = (ctx, x, baseY, s, lamp, palette, ink, strength) => {
  const r = s * 0.082;
  const cy = baseY - r * 0.52;

  for (let i = 0; i < 4; i++) {
    const rr = r * (1 - i * 0.2);
    ellipse(ctx, x, cy + i * s * 0.002, rr, rr * 0.42);
    ctx.fillStyle = objectFill(ctx, lamp, x, baseY, ink, (0.62 + i * 0.1) * strength, palette.ink, 0.05);
    ctx.fill();
  }
  // The dark eye at the middle of the coil.
  ellipse(ctx, x, cy + s * 0.006, r * 0.2, r * 0.09);
  ctx.fillStyle = cssAlpha(palette.ink, 0.85);
  ctx.fill();

  // A loose end running off the coil, so it reads as rope and not as a stack.
  ctx.beginPath();
  ctx.moveTo(x + r * 0.9, cy + r * 0.2);
  ctx.quadraticCurveTo(x + r * 1.7, cy + r * 0.5, x + r * 1.5, baseY);
  ctx.lineTo(x + r * 1.32, baseY);
  ctx.quadraticCurveTo(x + r * 1.5, cy + r * 0.55, x + r * 0.85, cy + r * 0.38);
  ctx.closePath();
  ctx.fillStyle = objectFill(ctx, lamp, x, baseY, ink, 0.82 * strength, palette.ink, 0.05);
  ctx.fill();
};

/** Sailcloth: a bolt of canvas, folded. */
const drawSailcloth: Goods = (ctx, x, baseY, s, lamp, palette, ink, strength) => {
  const w = s * 0.19;
  const foldH = s * 0.026;
  const folds = 5;

  for (let i = 0; i < folds; i++) {
    const y = baseY - foldH * (i + 1);
    const inset = i * s * 0.004;
    ctx.beginPath();
    ctx.moveTo(x - w / 2 + inset, y + foldH);
    ctx.lineTo(x + w / 2 - inset, y + foldH);
    ctx.lineTo(x + w / 2 - inset - s * 0.012, y);
    ctx.lineTo(x - w / 2 + inset - s * 0.012, y);
    ctx.closePath();
    ctx.fillStyle = objectFill(ctx, lamp, x, baseY, ink, (0.55 + i * 0.1) * strength, palette.ink, 0.05);
    ctx.fill();
    // The lit crease along the top of each fold.
    ctx.fillStyle = objectFill(ctx, lamp, x, baseY, palette.tallow, 0.4 * strength, palette.ink, 0);
    ctx.fillRect(x - w / 2 + inset - s * 0.012, y, w - inset * 2, Math.max(1, s * 0.0025));
  }
};

/** Ordnance: a gun barrel on its bed, and a pyramid of shot. */
const drawOrdnance: Goods = (ctx, x, baseY, s, lamp, palette, ink, strength) => {
  const len = s * 0.2;
  const bore = s * 0.032;
  const cy = baseY - bore * 0.85;

  // The bed it rests on.
  ctx.fillStyle = objectFill(ctx, lamp, x, baseY, palette.brass, 0.5 * strength, palette.ink, 0.06);
  ctx.fillRect(x - len * 0.42, baseY - s * 0.016, len * 0.84, s * 0.016);

  // The barrel: breech, chase, muzzle swell.
  ctx.beginPath();
  ctx.moveTo(x - len / 2, cy - bore * 0.62);
  ctx.lineTo(x + len * 0.3, cy - bore * 0.4);
  ctx.lineTo(x + len * 0.3, cy - bore * 0.52);
  ctx.lineTo(x + len / 2, cy - bore * 0.52);
  ctx.lineTo(x + len / 2, cy + bore * 0.52);
  ctx.lineTo(x + len * 0.3, cy + bore * 0.52);
  ctx.lineTo(x + len * 0.3, cy + bore * 0.4);
  ctx.lineTo(x - len / 2, cy + bore * 0.62);
  ctx.closePath();
  ctx.fillStyle = objectFill(ctx, lamp, x, baseY, ink, 0.9 * strength, palette.ink, 0.07);
  ctx.fill();

  // The dark of the bore, and the cascabel at the breech.
  ellipse(ctx, x + len / 2, cy, bore * 0.16, bore * 0.5);
  ctx.fillStyle = cssAlpha(palette.ink, 0.9);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x - len / 2 - bore * 0.22, cy, bore * 0.26, 0, Math.PI * 2);
  ctx.fillStyle = objectFill(ctx, lamp, x, baseY, ink, 0.95 * strength, palette.ink, 0.08);
  ctx.fill();

  // Shot, stacked the way shot is stacked.
  const shotR = s * 0.012;
  for (let row = 0; row < 3; row++) {
    const count = 3 - row;
    for (let i = 0; i < count; i++) {
      const sx = x - len * 0.62 - shotR * (count - 1) + shotR * 2 * i;
      const sy = baseY - shotR * (1 + row * 1.7);
      ctx.beginPath();
      ctx.arc(sx, sy, shotR, 0, Math.PI * 2);
      ctx.fillStyle = objectFill(ctx, lamp, x, baseY, ink, (0.68 + row * 0.1) * strength, palette.ink, 0.06);
      ctx.fill();
    }
  }
};

/** The Sarah Christiana herself — the lot worth twenty-five times the stake. */
const drawShip: Goods = (ctx, x, baseY, s, lamp, palette, ink, strength) => {
  const hullW = s * 0.26;
  const hullH = s * 0.055;
  const deckY = baseY - hullH;

  // The stand she sits on.
  ctx.fillStyle = objectFill(ctx, lamp, x, baseY, palette.brass, 0.46 * strength, palette.ink, 0.05);
  ctx.fillRect(x - hullW * 0.3, baseY - s * 0.008, hullW * 0.6, s * 0.008);

  // The hull, with a raised stern the way a period merchantman had one.
  ctx.beginPath();
  ctx.moveTo(x - hullW / 2, deckY);
  ctx.lineTo(x + hullW * 0.42, deckY);
  ctx.lineTo(x + hullW / 2, deckY - hullH * 0.55);
  ctx.lineTo(x + hullW * 0.54, deckY - hullH * 0.55);
  ctx.lineTo(x + hullW * 0.5, baseY);
  ctx.quadraticCurveTo(x, baseY + hullH * 0.28, x - hullW * 0.46, baseY - hullH * 0.1);
  ctx.closePath();
  ctx.fillStyle = objectFill(ctx, lamp, x, baseY, ink, 0.95 * strength, palette.ink, 0.08);
  ctx.fill();

  // A wale along her side, and the gunports under it.
  ctx.fillStyle = objectFill(ctx, lamp, x, baseY, palette.brass, 0.8 * strength, palette.ink, 0.05);
  ctx.fillRect(x - hullW * 0.44, deckY + hullH * 0.3, hullW * 0.92, Math.max(1, s * 0.003));
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = cssAlpha(palette.ink, 0.8);
    ctx.fillRect(x - hullW * 0.36 + i * hullW * 0.135, deckY + hullH * 0.5, s * 0.01, s * 0.012);
  }

  // Three masts, with yards across them and a courses-furled look.
  const masts: readonly [number, number][] = [
    [-0.26, 0.82],
    [0.04, 1.0],
    [0.32, 0.72],
  ];
  for (const [dx, scale] of masts) {
    const mx = x + hullW * dx;
    const mh = s * 0.17 * scale;
    ctx.fillStyle = objectFill(ctx, lamp, x, baseY, ink, 1.0 * strength, palette.ink, 0.1);
    ctx.fillRect(mx - s * 0.0025, deckY - mh, Math.max(1, s * 0.005), mh);
    for (const yt of [0.36, 0.66]) {
      const yw = s * 0.05 * scale * (1 - yt * 0.35);
      ctx.fillRect(mx - yw, deckY - mh * (1 - yt), yw * 2, Math.max(1, s * 0.0035));
      // Canvas furled on the yard: a shallow bundle, not a billowing sail.
      ctx.beginPath();
      ctx.moveTo(mx - yw * 0.92, deckY - mh * (1 - yt));
      ctx.quadraticCurveTo(mx, deckY - mh * (1 - yt) + s * 0.014, mx + yw * 0.92, deckY - mh * (1 - yt));
      ctx.closePath();
      ctx.fillStyle = objectFill(ctx, lamp, x, baseY, palette.tallow, 0.62 * strength, palette.ink, 0.04);
      ctx.fill();
      ctx.fillStyle = objectFill(ctx, lamp, x, baseY, ink, 1.0 * strength, palette.ink, 0.1);
    }
  }
};

const GOODS: readonly Goods[] = [drawCrate, drawStores, drawCordage, drawSailcloth, drawOrdnance, drawShip];

/** The refused lot, sliding back into the dark in oxblood. */
function drawBurnedLot(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: SceneState,
  palette: Palette,
): void {
  if (!state.burnedLot || state.burnedFade >= 1) return;

  const fade = clamp01(state.burnedFade);
  const s = Math.min(width, height * 1.4);
  const x = width * LOT_X + s * 0.07 * fade;
  const y = height * TABLE_Y - s * 0.05 - s * 0.04 * fade;
  const alpha = (1 - fade) * 0.5;

  ctx.font = `${Math.max(12, s * 0.05 * (1 - fade * 0.3))}px ui-serif, Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = cssAlpha(palette.oxblood, alpha);
  ctx.fillText(state.burnedLot.faceText, x, y);
}

// ---------------------------------------------------------------------------

/** An ellipse, from arcs — the 2D context this runs in has no `ellipse`. */
function ellipse(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  // `scale` is not in the recorded surface, so the ellipse is built from a
  // circle stretched by hand: four quadratic sections, which every context has.
  const k = 0.5523;
  ctx.moveTo(rx, 0);
  ctx.quadraticCurveTo(rx, ry * k * 1.35, rx * k * 1.35, ry);
  ctx.quadraticCurveTo(0, ry, -rx * k * 1.35, ry);
  ctx.quadraticCurveTo(-rx, ry * k * 1.35, -rx, 0);
  ctx.quadraticCurveTo(-rx, -ry * k * 1.35, -rx * k * 1.35, -ry);
  ctx.quadraticCurveTo(0, -ry, rx * k * 1.35, -ry);
  ctx.quadraticCurveTo(rx, -ry * k * 1.35, rx, 0);
  ctx.closePath();
  ctx.restore();
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

function clampInch(inch: number): number {
  if (!Number.isFinite(inch)) return 1;
  return Math.min(INCHES, Math.max(1, Math.round(inch)));
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

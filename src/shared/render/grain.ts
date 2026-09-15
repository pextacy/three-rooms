/**
 * Surface grain — the thing that stops three dark rooms looking like three CSS
 * gradients.
 *
 * A perfectly smooth radial falloff is the single most recognisable tell of a
 * scene that was described rather than drawn. Real tallow smoke, real wet
 * daylight and real slate all have a surface, and the surface is what the eye
 * reads as *material* before it reads anything else.
 *
 * So: one deterministic noise tile per room, baked once into an offscreen
 * canvas and painted as a repeating pattern. It costs one `fillRect` a frame and
 * no image file (I12 — nothing here is fetched, everything is computed).
 *
 * Deterministic on purpose. A random tile would shimmer between frames and
 * could not be tested; this one is a pure function of its arguments, which is
 * why `test/grain.spec.ts` can pin it.
 */

/** How the grain sits on the room beneath it. */
export type GrainSpec = {
  /** Tile edge in device pixels. Bigger reads as coarser material. */
  readonly tile: number;
  /** How many specks per tile, as a fraction of its pixels. */
  readonly density: number;
  /** Peak alpha of a speck. Kept low: grain is felt, not seen. */
  readonly strength: number;
  /**
   * How much of the grain is DARKER than the room rather than lighter.
   *
   * 0 is smoke lit from below — light specks only. 0.5 is a mottled mineral
   * surface like slate, which is pitted as well as flecked.
   */
  readonly dark: number;
  /** Changes the speck layout without changing its character. */
  readonly seed: number;
};

/** Soot in the air above a candle: fine, sparse, and lit. */
export const SOOT: GrainSpec = { tile: 96, density: 0.1, strength: 0.05, dark: 0.15, seed: 0x1728 };

/** Wet light through weather: coarser, softer, and it pits as well as lifts. */
export const DAMP: GrainSpec = { tile: 128, density: 0.14, strength: 0.045, dark: 0.45, seed: 0x5ea5 };

/** Slate: a mineral surface, pitted as much as flecked. */
export const SLATE: GrainSpec = { tile: 112, density: 0.2, strength: 0.06, dark: 0.55, seed: 0xb0a2d };

/**
 * A 32-bit integer hash. Deterministic, cheap, and with no visible lattice —
 * `Math.random()` cannot be used here because the tile has to be the same every
 * time it is baked, and a moving grain reads as video noise rather than matter.
 */
function hash(x: number): number {
  let h = x | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 0x1_0000_0000;
}

const cache = new Map<string, CanvasPattern | null>();

/** The tile itself, for the test — an alpha map, one byte a pixel. */
export function grainTile(spec: GrainSpec): Uint8ClampedArray {
  const { tile, density, strength, dark, seed } = spec;
  const pixels = new Uint8ClampedArray(tile * tile * 4);
  const specks = Math.round(tile * tile * density);

  for (let i = 0; i < specks; i++) {
    const x = Math.floor(hash(seed + i * 2) * tile);
    const y = Math.floor(hash(seed + i * 2 + 1) * tile);
    const roll = hash(seed * 3 + i);
    const isDark = roll < dark;
    // Alpha varies per speck so the grain has depth rather than reading as a
    // single-value screen door.
    const alpha = strength * (0.35 + 0.65 * hash(seed * 7 + i));
    const at = (y * tile + x) * 4;
    const level = isDark ? 0 : 255;
    pixels[at] = level;
    pixels[at + 1] = level;
    pixels[at + 2] = level;
    // Specks may land on one another; the brighter one wins rather than summing,
    // so density cannot quietly push the grain past its own strength.
    pixels[at + 3] = Math.max(pixels[at + 3] ?? 0, Math.round(alpha * 255));
  }

  return pixels;
}

/**
 * The pattern, baked once per spec and reused.
 *
 * Returns null where an offscreen canvas is unavailable (jsdom without a 2D
 * context, some very old embedded webviews). Every caller must treat a missing
 * grain as *no grain* and draw the room anyway — the surface is a finish, never
 * information, so a scene without it is plainer and never wrong.
 */
export function grainPattern(ctx: CanvasRenderingContext2D, spec: GrainSpec): CanvasPattern | null {
  const key = `${spec.tile}:${spec.density}:${spec.strength}:${spec.dark}:${spec.seed}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  let pattern: CanvasPattern | null = null;
  try {
    const canvas =
      typeof OffscreenCanvas === 'function'
        ? new OffscreenCanvas(spec.tile, spec.tile)
        : Object.assign(document.createElement('canvas'), { width: spec.tile, height: spec.tile });
    const tileCtx = (canvas as HTMLCanvasElement).getContext('2d');
    if (tileCtx) {
      const image = tileCtx.createImageData(spec.tile, spec.tile);
      image.data.set(grainTile(spec));
      tileCtx.putImageData(image, 0, 0);
      pattern = ctx.createPattern(canvas as CanvasImageSource, 'repeat');
    }
  } catch {
    pattern = null; // no offscreen canvas here; the room draws without a finish
  }

  cache.set(key, pattern);
  return pattern;
}

/** Lay the grain over whatever has been drawn so far. One fill, no state left behind. */
export function drawGrain(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  spec: GrainSpec,
): void {
  const pattern = grainPattern(ctx, spec);
  if (!pattern) return;
  ctx.save();
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

/** Only for tests, which need a cold cache between cases. */
export function forgetGrain(): void {
  cache.clear();
}

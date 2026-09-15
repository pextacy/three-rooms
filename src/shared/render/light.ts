/**
 * The light model (docs.md §6.1, claude.md §5).
 *
 * This is the product. Everything the player reads about decay, they read from
 * the light — the number is confirmation, not information.
 *
 * Pure and measurable on purpose. "Brightness is the multiplier" is only a real
 * claim if a reviewer can check it, so the scene's brightness is **relative
 * luminance in linear light**, scaled by exactly `WAX_BP[k] / 10000`. Pick any
 * colour out of the scene at the fifth inch, measure it, and it is 40.00% of the
 * same colour at the first — not "looks dimmer".
 *
 * Working in linear light matters. Scaling an sRGB byte by 0.4 does NOT make
 * something 40% as bright; sRGB is encoded with a ~2.2 gamma, so the naive
 * version lands near 69% of the light and the claim would be false.
 */
/**
 * The light model is SHARED, so it must not know which game is lighting it.
 *
 * Each game hands it a level in basis points out of `LEVEL_DENOM` — CANDLE the
 * wax ladder (100 -> 40%), THE SURVEY the day (100 -> 40%), THE BROKERS the fees
 * (100 -> 70%) — and a ROOM, which says what is doing the lighting and what the
 * four inks are made of in it.
 *
 * One model, three light sources. A tallow candle is not a window at dawn and
 * neither is an oil lamp over a slate board; lighting all three amber was the
 * tell that these were one page with three sets of nouns. What is shared is the
 * PHYSICS and the four ROLES, which is the part that was ever worth sharing.
 */

/** Brightness is expressed in basis points of full flame. 100% = 10000. */
export const LEVEL_DENOM = 10_000;

/** A full flame: the brightest any scene gets. */
export const LEVEL_FULL = 10_000;

/**
 * The dimmest a room is allowed to get, and the anchor of the blackbody walk.
 *
 * It is CANDLE's gutter (40%) rather than a free choice: the two games share one
 * room, so a survey lit at 70% has to be visibly brighter than a candle at its
 * last inch, and it is — the same ladder measures both.
 */
export const LEVEL_FLOOR = 4_000;

export type Rgb = { readonly r: number; readonly g: number; readonly b: number };

/**
 * The four ROLES. Every room has exactly these four and no fifth (claude.md §5)
 * — what changes between rooms is what they are made of, never how many there
 * are.
 *
 *  - `ink`     the room itself
 *  - `tallow`  the light source, and every live value
 *  - `brass`   the money: the figure the player is deciding about
 *  - `oxblood` the past tense — a mark that RECEDES, and never carries text
 *              that has to be read. Nothing is ever said in it alone.
 *
 * The money role's lightness is not free choice: it has to clear WCAG AA against
 * its own room at that room's DIMMEST level. `npm run verify:light` is what
 * holds that, for all three.
 */
export type InkName = 'tallow' | 'brass' | 'oxblood' | 'ink';

/**
 * A room: four inks, and what is lighting them.
 *
 * `sourceFull` and `sourceFloor` are the source's colour temperature at
 * `LEVEL_FULL` and `LEVEL_FLOOR` — the ends of the shared level scale, not of
 * this room's own ladder, so two rooms that dim over different ranges still
 * measure against one another.
 */
export type Room = {
  /** For `verify:light` and nothing else. */
  readonly label: string;
  /** What is doing the lighting, in the room's own words. */
  readonly source: string;
  readonly inks: Record<InkName, Rgb>;
  readonly sourceFull: number;
  readonly sourceFloor: number;
  /**
   * How strongly the source's colour is allowed to pull each ink. The light
   * source itself takes most of it; the room takes hardly any, because a dark
   * surface reflecting amber is still dark.
   */
  readonly pull: Record<InkName, number>;
};

const FLAME_PULL: Record<InkName, number> = { tallow: 0.55, brass: 0.45, oxblood: 0.2, ink: 0.1 };

/**
 * CANDLE — a tallow candle on a coffee-house table. The reference room: warm,
 * and it COOLS as it dies, which is what a real wick does.
 */
export const CANDLELIGHT: Room = {
  label: 'CANDLE — a tallow candle on the table',
  source: 'tallow candle',
  inks: {
    tallow: { r: 246, g: 230, b: 196 },
    brass: { r: 224, g: 180, b: 99 },
    oxblood: { r: 141, g: 58, b: 48 },
    ink: { r: 12, g: 10, b: 7 },
  },
  sourceFull: 2000,
  sourceFloor: 1500,
  pull: FLAME_PULL,
};

/**
 * THE SURVEY — the roads at dawn, seen through an open window.
 *
 * No flame at all: the light is the SKY. It starts at the blue end of the curve
 * where no fire ever reaches, and it walks down it as the day is spent, so the
 * room goes from a cold dawn to a low afternoon instead of from amber to red.
 * Bone paper, the verdigris of her copper sheathing, and the rust of her
 * ironwork — the only warm thing in a cold room, and it is the past tense.
 */
export const DAYLIGHT: Room = {
  label: 'THE SURVEY — the roads, by the day itself',
  source: 'overcast daylight',
  inks: {
    tallow: { r: 220, g: 228, b: 234 },
    brass: { r: 121, g: 201, b: 138 },
    oxblood: { r: 126, g: 70, b: 52 },
    ink: { r: 7, g: 11, b: 16 },
  },
  sourceFull: 6500,
  sourceFloor: 4300,
  // Daylight is diffuse: it tints the room more evenly than a point flame does.
  pull: { tallow: 0.45, brass: 0.35, oxblood: 0.25, ink: 0.2 },
};

/**
 * THE BROKERS — an Argand lamp over a slate board.
 *
 * Warmer than the sky and cooler than a candle, and it does not gutter: it is
 * TURNED DOWN as the day costs more. Chalk on slate, dusted umber for a man
 * already paid, and the prices in the smalt-blue ink the slips are written in —
 * the one cold thing inside a warm pool of lamplight, which is what makes a
 * figure on this floor findable at a glance.
 *
 * A red was tried first and could not be kept: at this room's dimmest, no red
 * dark enough to look like ledger lead still clears WCAG AA against the slate.
 * `verify:light` is where that was found, not taste.
 */
export const LAMPLIGHT: Room = {
  label: 'THE BROKERS — the floor, by an Argand lamp',
  source: 'Argand oil lamp',
  inks: {
    tallow: { r: 234, g: 230, b: 220 },
    brass: { r: 110, g: 155, b: 216 },
    oxblood: { r: 110, g: 88, b: 67 },
    ink: { r: 16, g: 14, b: 12 },
  },
  sourceFull: 2900,
  sourceFloor: 2500,
  pull: FLAME_PULL,
};

/** Every room, for the scripts that have to walk all of them. */
export const ROOMS: readonly Room[] = [CANDLELIGHT, DAYLIGHT, LAMPLIGHT];

/**
 * CANDLE's four inks, under a full flame.
 *
 * Kept as its own export because it is the reference palette the other two are
 * measured against, and because it reads better than `CANDLELIGHT.inks` at the
 * call sites that only ever meant the candle.
 */
export const INKS = CANDLELIGHT.inks;

// ---------------------------------------------------------------------------
//  sRGB <-> linear light
// ---------------------------------------------------------------------------

/** sRGB channel (0..1) -> linear light (0..1). The IEC 61966-2-1 transfer curve. */
export function srgbToLinear(channel: number): number {
  const c = clamp01(channel);
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Linear light (0..1) -> sRGB channel (0..1). */
export function linearToSrgb(value: number): number {
  const v = clamp01(value);
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
}

/** WCAG relative luminance. This is the number the exit gate is measured in. */
export function relativeLuminance(rgb: Rgb): number {
  return (
    0.2126 * srgbToLinear(rgb.r / 255) +
    0.7152 * srgbToLinear(rgb.g / 255) +
    0.0722 * srgbToLinear(rgb.b / 255)
  );
}

/** WCAG contrast ratio, so legibility at the gutter is checkable, not hoped for. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------------------
//  Blackbody
// ---------------------------------------------------------------------------

/**
 * Planckian locus -> sRGB, by the standard piecewise approximation.
 *
 * A real flame cools as it dies, so the tallow shifts down the curve rather than
 * simply dimming. An LED-like constant hue is the visible tell of a fake light
 * model, and this costs nothing to get right.
 */
export function blackbody(kelvin: number): Rgb {
  const t = clamp(kelvin, 1000, 40_000) / 100;

  const red = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const green =
    t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492;
  const blue = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;

  return { r: clampByte(red), g: clampByte(green), b: clampByte(blue) };
}

/** A fat, healthy wick. CANDLE's, and the default everywhere it is not said. */
export const FLAME_KELVIN_FULL = CANDLELIGHT.sourceFull;
/** A wick drowning in its own wax. */
export const FLAME_KELVIN_GUTTER = CANDLELIGHT.sourceFloor;

/**
 * Colour temperature at a given brightness. Linear in the level, so the hue
 * walks the curve at the same pace the room dims.
 *
 * Which DIRECTION it walks is the room's own: a candle cools as it dies, and
 * the day warms as it ends.
 */
export function temperatureForWax(waxBp: number, room: Room = CANDLELIGHT): number {
  const t = (waxBp - LEVEL_FLOOR) / (LEVEL_FULL - LEVEL_FLOOR); // 0 at the floor, 1 at full
  return room.sourceFloor + clamp01(t) * (room.sourceFull - room.sourceFloor);
}

// ---------------------------------------------------------------------------
//  The scene
// ---------------------------------------------------------------------------

/**
 * Scene brightness as a fraction of full flame — EXACTLY the wax ladder.
 * This is the whole "brightness is the multiplier" claim, in one line.
 */
export function sceneLuminance(waxBp: number): number {
  return waxBp / LEVEL_DENOM;
}

type Linear = readonly [number, number, number];

const toLinear = (rgb: Rgb): Linear => [srgbToLinear(rgb.r / 255), srgbToLinear(rgb.g / 255), srgbToLinear(rgb.b / 255)];
const luminanceOf = (c: Linear): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** The flame's colour rescaled to unit luminance, so mixing it adds hue, not light. */
function flameHue(kelvin: number): Linear {
  const linear = toLinear(blackbody(kelvin));
  const lum = luminanceOf(linear);
  if (lum <= 0) return [1, 1, 1];
  return [linear[0] / lum, linear[1] / lum, linear[2] / lum];
}

/**
 * An ink as it appears at a given wax level.
 *
 * Three steps, all in linear light, and the order is the whole point:
 *
 *  1. **Shift the hue** by how far the flame has cooled SINCE the first inch.
 *     The shift is a ratio against the full-flame hue, so at the first inch it
 *     is exactly 1 and the ink is returned untouched.
 *  2. **Restore the ink's own luminance**, so the shift changed colour and not
 *     brightness.
 *  3. **Scale by the wax ladder.** Only now does anything get darker.
 *
 * The result: `relativeLuminance` is exactly `baseLuminance x waxBp / 10000`, at
 * every inch, for every ink. That is the "brightness is the multiplier" claim,
 * and it is measurable rather than asserted.
 *
 * If a channel would clip past the top of sRGB, the colour is desaturated toward
 * its own luminance-grey until it fits. Desaturation preserves luminance
 * exactly, so gamut mapping cannot break the claim either.
 */
export function inkAtWax(name: InkName, waxBp: number, room: Room = CANDLELIGHT): Rgb {
  const base = toLinear(room.inks[name]);
  const baseLuminance = luminanceOf(base);
  const pull = room.pull[name];
  const scale = sceneLuminance(waxBp);

  const now = flameHue(temperatureForWax(waxBp, room));
  const full = flameHue(temperatureForWax(LEVEL_FULL, room));

  // 1. hue shift, relative to the first inch
  const shifted: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const reference = full[i] ?? 1;
    const ratio = reference > 0 ? (now[i] ?? 0) / reference : 0;
    shifted[i] = (base[i] ?? 0) * (1 + pull * (ratio - 1));
  }

  // 2. restore the ink's own luminance
  const shiftedLuminance = luminanceOf(shifted);
  if (shiftedLuminance > 0) {
    const correction = baseLuminance / shiftedLuminance;
    shifted[0] *= correction;
    shifted[1] *= correction;
    shifted[2] *= correction;
  }

  // 3. the wax ladder
  const lit: [number, number, number] = [shifted[0] * scale, shifted[1] * scale, shifted[2] * scale];

  // gamut: desaturate toward grey, which leaves luminance untouched
  const litLuminance = baseLuminance * scale;
  const peak = Math.max(lit[0], lit[1], lit[2]);
  if (peak > 1 && peak > litLuminance) {
    const t = (1 - litLuminance) / (peak - litLuminance);
    lit[0] = litLuminance + (lit[0] - litLuminance) * t;
    lit[1] = litLuminance + (lit[1] - litLuminance) * t;
    lit[2] = litLuminance + (lit[2] - litLuminance) * t;
  }

  return {
    r: clampByte(linearToSrgb(lit[0]) * 255),
    g: clampByte(linearToSrgb(lit[1]) * 255),
    b: clampByte(linearToSrgb(lit[2]) * 255),
  };
}

export type Palette = Record<InkName, Rgb>;

/** Every ink at a given level, in a given room, ready for CSS or a canvas. */
export function paletteAtWax(waxBp: number, room: Room = CANDLELIGHT): Palette {
  return {
    tallow: inkAtWax('tallow', waxBp, room),
    brass: inkAtWax('brass', waxBp, room),
    oxblood: inkAtWax('oxblood', waxBp, room),
    ink: inkAtWax('ink', waxBp, room),
  };
}

/**
 * The same ink, dark enough to hold on paper.
 *
 * The three rooms are lit; the List that fronts them is PRINTED, and an ink
 * chosen to glow at 4.85:1 against a black room is far too pale at 4.5:1
 * against a sheet. Rather than picking three new colours by eye — which is how a
 * palette stops being derived and starts being decoration — each room's money
 * ink is walked down its own luminance until it clears the ratio asked for.
 *
 * Hue and chroma are preserved: only luminance moves, in linear light, so what
 * comes back is recognisably the same pigment seen on paper instead of in a
 * dark room. Returns the ink untouched if it already clears.
 */
export function inkOnPaper(ink: Rgb, sheet: Rgb, ratio = 4.5): Rgb {
  if (contrastRatio(ink, sheet) >= ratio) return ink;

  const base = toLinear(ink);
  // 64 halvings takes any ink to black, which clears any ratio a light sheet can
  // ask for, so this cannot fail to terminate or fall out without an answer.
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 64; i++) {
    const mid = (lo + hi) / 2;
    const tried = {
      r: clampByte(linearToSrgb((base[0] ?? 0) * mid) * 255),
      g: clampByte(linearToSrgb((base[1] ?? 0) * mid) * 255),
      b: clampByte(linearToSrgb((base[2] ?? 0) * mid) * 255),
    };
    if (contrastRatio(tried, sheet) >= ratio) lo = mid;
    else hi = mid;
  }

  return {
    r: clampByte(linearToSrgb((base[0] ?? 0) * lo) * 255),
    g: clampByte(linearToSrgb((base[1] ?? 0) * lo) * 255),
    b: clampByte(linearToSrgb((base[2] ?? 0) * lo) * 255),
  };
}

/** `rgb(246 230 196)`, the form CSS and canvas both take. */
export function css(rgb: Rgb): string {
  return `rgb(${rgb.r} ${rgb.g} ${rgb.b})`;
}

export function cssAlpha(rgb: Rgb, alpha: number): string {
  return `rgb(${rgb.r} ${rgb.g} ${rgb.b} / ${clamp01(alpha)})`;
}

// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clampByte(value: number): number {
  return Math.round(clamp(value, 0, 255));
}

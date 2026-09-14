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
import { WAX_DENOM, waxBpAt } from '../../games/candle/core/wax';

export type Rgb = { readonly r: number; readonly g: number; readonly b: number };

/**
 * The four inks **as they appear at the first inch**, under a full flame. No
 * fifth colour is approved (claude.md §5). Every other inch is derived.
 *
 * Their lightness is not free choice: brass carries the lot's face value, so it
 * has to clear WCAG AA against the room at the FIFTH inch, where there is only
 * 40% of the light left. `npm run verify:light` is what holds that.
 */
export const INKS = {
  /** The flame and every live value. Warm white. */
  tallow: { r: 246, g: 230, b: 196 },
  /** The lot on the table and its face value. */
  brass: { r: 224, g: 180, b: 99 },
  /**
   * A lot you let burn. Deliberately the darkest ink after the room: it is a
   * past-tense mark that RECEDES, so it must never carry text that has to be
   * read. Nothing is ever said in oxblood alone.
   */
  oxblood: { r: 141, g: 58, b: 48 },
  /** The room. */
  ink: { r: 12, g: 10, b: 7 },
} as const satisfies Record<string, Rgb>;

export type InkName = keyof typeof INKS;

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

/** A fat, healthy wick. */
export const FLAME_KELVIN_FULL = 2000;
/** A wick drowning in its own wax. */
export const FLAME_KELVIN_GUTTER = 1500;

/**
 * Colour temperature at a given wax level. Linear in the wax, so the hue walks
 * down the curve at the same pace the room dims.
 */
export function temperatureForWax(waxBp: number): number {
  const full = waxBpAt(1);
  const gutter = waxBpAt(5);
  const t = (waxBp - gutter) / (full - gutter); // 0 at the gutter, 1 at full
  return FLAME_KELVIN_GUTTER + clamp01(t) * (FLAME_KELVIN_FULL - FLAME_KELVIN_GUTTER);
}

// ---------------------------------------------------------------------------
//  The scene
// ---------------------------------------------------------------------------

/**
 * Scene brightness as a fraction of full flame — EXACTLY the wax ladder.
 * This is the whole "brightness is the multiplier" claim, in one line.
 */
export function sceneLuminance(waxBp: number): number {
  return waxBp / WAX_DENOM;
}

/**
 * How strongly the blackbody shift is allowed to pull an ink. Tallow is the
 * flame itself so it takes most of it; the room takes hardly any, because a dark
 * surface reflecting amber is still dark.
 */
const HUE_PULL: Record<InkName, number> = {
  tallow: 0.55,
  brass: 0.45,
  oxblood: 0.2,
  ink: 0.1,
};

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
export function inkAtWax(name: InkName, waxBp: number): Rgb {
  const base = toLinear(INKS[name]);
  const baseLuminance = luminanceOf(base);
  const pull = HUE_PULL[name];
  const scale = sceneLuminance(waxBp);

  const now = flameHue(temperatureForWax(waxBp));
  const full = flameHue(temperatureForWax(waxBpAt(1)));

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

/** Every ink at a given wax level, ready to hand to CSS or a canvas. */
export function paletteAtWax(waxBp: number): Record<InkName, Rgb> {
  return {
    tallow: inkAtWax('tallow', waxBp),
    brass: inkAtWax('brass', waxBp),
    oxblood: inkAtWax('oxblood', waxBp),
    ink: inkAtWax('ink', waxBp),
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

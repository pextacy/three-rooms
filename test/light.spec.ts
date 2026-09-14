/**
 * The light model (docs.md §6.1, claude.md §5).
 *
 * "Brightness is the multiplier" is a claim a reviewer can check with a colour
 * picker, so it is tested as a measurement, not as a vibe: relative luminance at
 * every inch must be exactly the wax ladder.
 */
import { describe, it, expect } from 'vitest';
import {
  INKS,
  inkAtWax,
  paletteAtWax,
  relativeLuminance,
  contrastRatio,
  srgbToLinear,
  linearToSrgb,
  blackbody,
  temperatureForWax,
  sceneLuminance,
  css,
  cssAlpha,
  FLAME_KELVIN_FULL,
  FLAME_KELVIN_GUTTER,
  type InkName,
} from '../src/shared/render/light';
import { INCHES, WAX_BP, WAX_DENOM, waxBpAt } from '../src/games/candle/core/wax';

const NAMES: InkName[] = ['tallow', 'brass', 'oxblood', 'ink'];
const FULL = waxBpAt(1);

describe('sRGB and linear light', () => {
  it('round-trips every channel value', () => {
    for (let byte = 0; byte <= 255; byte++) {
      const back = linearToSrgb(srgbToLinear(byte / 255)) * 255;
      expect(Math.abs(back - byte), `byte ${byte}`).toBeLessThan(0.5);
    }
  });

  it('is not the same as scaling the sRGB byte — which is the whole point', () => {
    // 40% of the LIGHT is not 40% of the encoded value. If these agreed, the
    // wax-ladder claim could be made with a naive multiply and would be false.
    const naive = relativeLuminance({ r: Math.round(246 * 0.4), g: Math.round(230 * 0.4), b: Math.round(196 * 0.4) });
    const correct = relativeLuminance(inkAtWax('tallow', waxBpAt(INCHES)));
    expect(naive).toBeLessThan(correct * 0.6);
  });

  it('puts white at luminance 1 and black at 0', () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5);
  });
});

describe('brightness IS the multiplier', () => {
  it('returns the ink untouched at the first inch', () => {
    for (const name of NAMES) expect(inkAtWax(name, FULL), name).toEqual(INKS[name]);
  });

  it('lands on exactly the wax ladder at every inch, for every ink that carries light', () => {
    for (let inch = 1; inch <= INCHES; inch++) {
      const waxBp = waxBpAt(inch);
      const want = sceneLuminance(waxBp);
      for (const name of NAMES) {
        if (name === 'ink') continue; // near-black; byte rounding dominates the ratio
        const ratio = relativeLuminance(inkAtWax(name, waxBp)) / relativeLuminance(INKS[name]);
        expect(Math.abs(ratio - want), `${name} at inch ${inch}: ${ratio} vs ${want}`).toBeLessThan(0.01);
      }
    }
  });

  it('scene luminance is literally WAX_BP over its denominator', () => {
    for (const bp of WAX_BP) expect(sceneLuminance(bp)).toBe(bp / WAX_DENOM);
  });

  it('the room only ever gets darker', () => {
    for (let inch = 1; inch < INCHES; inch++) {
      expect(
        relativeLuminance(inkAtWax('tallow', waxBpAt(inch + 1))),
        `inch ${inch} -> ${inch + 1}`,
      ).toBeLessThan(relativeLuminance(inkAtWax('tallow', waxBpAt(inch))));
    }
  });

  it('the gutter is a 2.5x drop from the first inch — visible without reading', () => {
    const first = relativeLuminance(inkAtWax('tallow', waxBpAt(1)));
    const last = relativeLuminance(inkAtWax('tallow', waxBpAt(INCHES)));
    expect(last / first).toBeLessThan(0.45);
    expect(last / first).toBeGreaterThan(0.35);
  });
});

describe('warm light cools as it dims', () => {
  it('walks the blackbody curve from 2000K to 1500K', () => {
    expect(temperatureForWax(waxBpAt(1))).toBeCloseTo(FLAME_KELVIN_FULL, 6);
    expect(temperatureForWax(waxBpAt(INCHES))).toBeCloseTo(FLAME_KELVIN_GUTTER, 6);
    for (let inch = 1; inch < INCHES; inch++) {
      expect(temperatureForWax(waxBpAt(inch + 1))).toBeLessThan(temperatureForWax(waxBpAt(inch)));
    }
  });

  it('is a real Planckian locus, not a hand-picked ramp', () => {
    // Pinned red across the amber end, green rising with temperature, blue
    // arriving only once the flame is hot enough to have any.
    expect(blackbody(1500).r).toBe(255);
    expect(blackbody(2000).r).toBe(255);
    expect(blackbody(2000).g).toBeGreaterThan(blackbody(1500).g);
    expect(blackbody(1500).b).toBe(0);
    expect(blackbody(6500).b).toBeGreaterThan(200);
  });

  it('makes tallow relatively more amber, not merely darker', () => {
    const hot = inkAtWax('tallow', waxBpAt(1));
    const cold = inkAtWax('tallow', waxBpAt(INCHES));
    expect((cold.r - cold.b) / cold.r).toBeGreaterThan((hot.r - hot.b) / hot.r);
  });

  it('clamps rather than extrapolating off the end of the curve', () => {
    expect(blackbody(-1)).toEqual(blackbody(1000));
    expect(blackbody(1e9)).toEqual(blackbody(40_000));
  });
});

describe('still readable at the gutter', () => {
  it('tallow on ink clears WCAG AA at every inch', () => {
    for (let inch = 1; inch <= INCHES; inch++) {
      const palette = paletteAtWax(waxBpAt(inch));
      expect(contrastRatio(palette.tallow, palette.ink), `inch ${inch}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('brass carries the face value, so it clears AA at the gutter too', () => {
    const palette = paletteAtWax(waxBpAt(INCHES));
    expect(contrastRatio(palette.brass, palette.ink)).toBeGreaterThanOrEqual(4.5);
  });

  it('oxblood is deliberately below AA — it recedes, and never carries text', () => {
    // Documented, not accidental: a refused lot is PAST TENSE. Anything it would
    // say is also said in words elsewhere, so nothing is lost to the low contrast.
    const palette = paletteAtWax(waxBpAt(INCHES));
    expect(contrastRatio(palette.oxblood, palette.ink)).toBeLessThan(4.5);
  });
});

describe('four inks, no fifth', () => {
  it('has exactly four', () => {
    expect(Object.keys(INKS).sort()).toEqual(['brass', 'ink', 'oxblood', 'tallow']);
  });

  it('gives a full palette at any inch', () => {
    for (let inch = 1; inch <= INCHES; inch++) {
      const palette = paletteAtWax(waxBpAt(inch));
      for (const name of NAMES) {
        const { r, g, b } = palette[name];
        for (const channel of [r, g, b]) {
          expect(Number.isInteger(channel)).toBe(true);
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(255);
        }
      }
    }
  });

  it('formats for CSS and canvas alike', () => {
    expect(css({ r: 1, g: 2, b: 3 })).toBe('rgb(1 2 3)');
    expect(cssAlpha({ r: 1, g: 2, b: 3 }, 0.5)).toBe('rgb(1 2 3 / 0.5)');
    expect(cssAlpha({ r: 1, g: 2, b: 3 }, 9)).toBe('rgb(1 2 3 / 1)');
  });
});

/**
 * The roads (THE SURVEY's scene), and the two claims it makes in pixels.
 *
 *   1. **The fog is the doubt.** The ink drawn over the ship is exactly
 *      `1 - P(the better call is right)`. Not "looks foggier" — the alpha in the
 *      fill style is the number, and a disagreeing pair of reports puts it back
 *      exactly where it was.
 *   2. **The light is the day.** Scene luminance is the daylight ladder through
 *      the same light model CANDLE burns on, over the same 100 → 40% range: every
 *      surveyor costs an hour, so what you have spent is legible without reading
 *      a number. `src/games/survey/app/daylight.ts` says why the light follows
 *      the day rather than the premium.
 *
 * jsdom has no 2D context, so the scene is drawn into a RECORDING stub: every
 * call and every fill style is captured and then asserted on. That is enough to
 * hold the rules that actually matter without pretending to check pixels.
 */
import { describe, it, expect } from 'vitest';
import { drawRoads, shipOpacity, levelFor, type RoadsState, type Manifest } from '../src/games/survey/app/render/roads';
import { paletteAtWax, relativeLuminance, INKS, css } from '../src/shared/render/light';
import { MAX_SURVEYS } from '../src/games/survey/core/vessel';
import { DAYLIGHT_BP, DAYLIGHT_DENOM, daylightAt } from '../src/games/survey/app/daylight';
import { bestCallConfidence, posteriorSound } from '../src/games/survey/core/belief';
import * as R from '../src/shared/math/rational';

type Call = { readonly op: string; readonly style: string };

function recorder() {
  const calls: Call[] = [];
  let gradients = 0;
  let fillStyle: unknown = '#000';

  const stub = {
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(value: unknown) {
      fillStyle = value;
    },
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    createRadialGradient() {
      gradients += 1;
      const stops: string[] = [];
      return { addColorStop: (_o: number, c: string) => stops.push(c), __stops: stops };
    },
    createLinearGradient() {
      gradients += 1;
      return { addColorStop: () => {} };
    },
    save: () => {},
    restore: () => {},
    translate: () => {},
    rotate: (angle: number) => calls.push({ op: `rotate:${angle.toFixed(4)}`, style: String(fillStyle) }),
    fillRect: () => calls.push({ op: 'fillRect', style: String(fillStyle) }),
    fillText: (text: string) => calls.push({ op: `fillText:${text}`, style: String(fillStyle) }),
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    arc: () => calls.push({ op: 'arc', style: String(fillStyle) }),
    quadraticCurveTo: () => {},
    fill: () => calls.push({ op: 'fill', style: String(fillStyle) }),
  };

  return { stub: stub as unknown as CanvasRenderingContext2D, calls, gradientCount: () => gradients };
}

const MANIFEST: Manifest = { name: 'Wine', valueText: '2.50×' };

function state(overrides: Partial<RoadsState> = {}): RoadsState {
  return {
    surveys: 0,
    margin: 0,
    manifest: MANIFEST,
    surveyorOut: false,
    payoutText: '250',
    settled: false,
    wasSound: null,
    slipFall: [1, 1, 1, 1, 1],
    time: 0,
    reducedMotion: true,
    ...overrides,
  };
}

/** The alpha of the ink veil drawn over the ship, as the scene actually set it. */
function fogAlpha(surveys: number, margin: number): number | null {
  const { stub, calls } = recorder();
  drawRoads(stub, 800, 500, state({ surveys, margin }));
  const ink = paletteAtWax(levelFor(surveys)).ink;
  const prefix = `rgb(${ink.r} ${ink.g} ${ink.b} / `;
  // The fog is the only ink fill whose alpha is not one of the scene's fixed
  // furniture values; take the one drawn right after the hull.
  const fogs = calls
    .filter(call => call.style.startsWith(prefix))
    .map(call => Number.parseFloat(call.style.slice(prefix.length)))
    .filter(alpha => alpha !== 0.9 && alpha !== 0.96 && alpha !== 0);
  return fogs.length > 0 ? (fogs[fogs.length - 1] ?? null) : null;
}

describe('the fog is the doubt', () => {
  it('is drawn at exactly 1 - the confidence, at every reachable margin', () => {
    for (let margin = -MAX_SURVEYS; margin <= MAX_SURVEYS; margin++) {
      const expected = 1 - R.toNumber(bestCallConfidence(margin));
      const drawn = fogAlpha(Math.abs(margin), margin);
      expect(drawn, `margin ${margin}`).not.toBeNull();
      expect(drawn as number, `margin ${margin}`).toBeCloseTo(expected, 10);
    }
  });

  it('lifts as the case hardens, in either direction', () => {
    const atZero = fogAlpha(0, 0) as number;
    expect(fogAlpha(3, 3) as number, 'three reports for sound').toBeLessThan(atZero);
    expect(fogAlpha(3, -3) as number, 'three reports for rot').toBeLessThan(atZero);
  });

  it('A DISAGREEING PAIR PUTS IT BACK EXACTLY WHERE IT WAS', () => {
    // The scene's version of the game's one mathematical claim. Two reports that
    // cancel leave the player where they started, and the picture says so to the
    // last decimal place — not approximately.
    expect(fogAlpha(2, 0)).toBe(fogAlpha(0, 0));
    expect(fogAlpha(4, 0)).toBe(fogAlpha(0, 0));
  });

  it('is gone once the voyage is settled, because she is a fact by then', () => {
    const { stub, calls } = recorder();
    drawRoads(stub, 800, 500, state({ surveys: 1, margin: 1, settled: true, wasSound: true }));
    const ink = paletteAtWax(levelFor(1)).ink;
    const veils = calls.filter(call => call.style.startsWith(`rgb(${ink.r} ${ink.g} ${ink.b} / `) && call.style.includes('/ 0.'));
    // Only the sea and the desk remain, both at their own fixed alphas.
    for (const veil of veils) expect(['0.9', '0.96']).toContain(veil.style.split('/ ')[1]?.replace(')', ''));
  });

  it('shipOpacity is the confidence itself, not a curve fitted to it', () => {
    for (let margin = -MAX_SURVEYS; margin <= MAX_SURVEYS; margin++) {
      expect(shipOpacity(margin)).toBeCloseTo(R.toNumber(bestCallConfidence(margin)), 12);
    }
  });
});

describe('her attitude carries the direction the fog cannot', () => {
  it('she heels one way on rot and the other on sound', () => {
    const list = (margin: number) => {
      const { stub, calls } = recorder();
      drawRoads(stub, 800, 500, state({ surveys: Math.abs(margin), margin }));
      const rotate = calls.find(call => call.op.startsWith('rotate:'));
      return Number(rotate?.op.split(':')[1]);
    };
    expect(list(-3), 'the case for rot: down by the head').toBeGreaterThan(0);
    expect(list(3), 'the case for sound: riding high').toBeLessThan(0);
    // And it is the posterior, not a flag: the angle moves monotonically.
    expect(list(1)).toBeLessThan(list(0));
    expect(list(0)).toBeLessThan(list(-1));
  });

  it('at the prior she is already a little down by the head', () => {
    // P(sound) is 0.4 before anyone goes aboard, and the picture is honest
    // about that rather than starting her level.
    expect(R.toNumber(posteriorSound(0))).toBeLessThan(0.5);
    const { stub, calls } = recorder();
    drawRoads(stub, 800, 500, state());
    const rotate = calls.find(call => call.op.startsWith('rotate:'));
    expect(Number(rotate?.op.split(':')[1])).toBeGreaterThan(0);
  });
});

describe('the light is the day', () => {
  it('scene luminance is the daylight remaining, at every rung', () => {
    // The same measurable claim CANDLE makes, on this game's own ladder, and
    // held to the same tolerance: the residual is 8-bit channel rounding, which
    // is why `ink` — near-black, where a single byte is a large relative step —
    // is excluded there and here.
    for (let k = 0; k <= MAX_SURVEYS; k++) {
      const share = daylightAt(k) / DAYLIGHT_DENOM;
      for (const name of ['tallow', 'brass', 'oxblood'] as const) {
        const ratio = relativeLuminance(paletteAtWax(levelFor(k))[name]) / relativeLuminance(INKS[name]);
        expect(Math.abs(ratio - share), `${name} after ${k} surveys: ${ratio} vs ${share}`).toBeLessThan(0.01);
      }
    }
  });

  it('and the ladder itself is exact, whatever a byte can represent', () => {
    for (let k = 0; k <= MAX_SURVEYS; k++) {
      expect(levelFor(k) / DAYLIGHT_DENOM).toBe(DAYLIGHT_BP[k]! / 10_000);
    }
  });

  it('the day is 60% gone by the time the fifth man reports', () => {
    const first = relativeLuminance(paletteAtWax(levelFor(0)).tallow);
    const last = relativeLuminance(paletteAtWax(levelFor(MAX_SURVEYS)).tallow);
    expect(last).toBeLessThan(first);
    expect(Math.abs(last / first - daylightAt(MAX_SURVEYS) / DAYLIGHT_DENOM)).toBeLessThan(0.01);
  });

  it('the ladder ends exactly where CANDLE\'s does: the same room, the same lamp', () => {
    expect(DAYLIGHT_BP[0]).toBe(10_000);
    expect(DAYLIGHT_BP[MAX_SURVEYS]).toBe(4_000);
    for (let k = 1; k <= MAX_SURVEYS; k++) {
      expect(DAYLIGHT_BP[k]!).toBeLessThan(DAYLIGHT_BP[k - 1]!);
    }
  });

  it('a level outside the ladder is clamped rather than throwing mid-frame', () => {
    expect(levelFor(-1)).toBe(daylightAt(0));
    expect(levelFor(99)).toBe(daylightAt(MAX_SURVEYS));
  });
});

describe('the scene obeys the design law', () => {
  it('draws exactly one gradient: the lamp', () => {
    const { stub, gradientCount } = recorder();
    drawRoads(stub, 800, 500, state());
    expect(gradientCount()).toBe(1);
  });

  it('uses the four inks and no fifth colour', () => {
    const { stub, calls } = recorder();
    drawRoads(stub, 800, 500, state({ surveys: 2, margin: -2 }));
    const palette = paletteAtWax(levelFor(2));
    const allowed = new Set(Object.values(palette).map(rgb => `rgb(${rgb.r} ${rgb.g} ${rgb.b}`));
    for (const call of calls) {
      if (call.style.startsWith('[object')) continue; // the gradient itself
      const head = call.style.split(' /')[0]?.replace(/\)$/, '') ?? '';
      expect(allowed.has(head), `${call.op} used ${call.style}`).toBe(true);
    }
  });

  it('draws the manifest and the payout, so the canvas carries the facts too', () => {
    const { stub, calls } = recorder();
    drawRoads(stub, 800, 500, state());
    const texts = calls.filter(call => call.op.startsWith('fillText:')).map(call => call.op.slice('fillText:'.length));
    expect(texts).toContain(MANIFEST.valueText);
    expect(texts).toContain(MANIFEST.name);
    expect(texts).toContain('250');
  });

  it('draws nothing of the manifest before the opening word lands', () => {
    const { stub, calls } = recorder();
    drawRoads(stub, 800, 500, state({ manifest: null, payoutText: null }));
    expect(calls.filter(call => call.op.startsWith('fillText:'))).toHaveLength(0);
    // But the room, the sea and the ship are already there: the page is never blank.
    expect(calls.filter(call => call.op === 'fillRect').length).toBeGreaterThan(3);
  });

  it('paints the room in the ink itself, not in a theme colour', () => {
    const { stub, calls } = recorder();
    drawRoads(stub, 800, 500, state());
    const ink = paletteAtWax(levelFor(0)).ink;
    expect(calls[0]?.style).toBe(css(ink));
  });
});

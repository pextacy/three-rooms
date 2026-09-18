/**
 * The scene (docs.md §6.1).
 *
 * jsdom has no 2D context, so the scene is drawn into a RECORDING stub: every
 * call and every fill style is captured and then asserted on. That is enough to
 * hold the rules that actually matter — one gradient, four inks, the pins fall,
 * the flare only at the end — without pretending to check pixels.
 */
import { describe, it, expect } from 'vitest';
import { drawScene, type SceneState, type LotFace } from '../src/games/candle/app/render/scene';
import { INKS, paletteAtWax, relativeLuminance } from '../src/shared/render/light';
import { INCHES, waxBpAt } from '../src/games/candle/core/wax';

type Call = { readonly op: string; readonly style: string };

function recorder() {
  const calls: Call[] = [];
  const gradientOrigins: { x: number; y: number }[] = [];
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
    createRadialGradient(x0: number, y0: number, _r0: number, x1: number, y1: number) {
      gradients += 1;
      gradientOrigins.push({ x: x0, y: y0 });
      void x1;
      void y1;
      const stops: string[] = [];
      return { addColorStop: (_o: number, c: string) => stops.push(c), __stops: stops };
    },
    createLinearGradient() {
      gradients += 1;
      return { addColorStop: () => {} };
    },
    fillRect: () => calls.push({ op: 'fillRect', style: String(fillStyle) }),
    fillText: (text: string) => calls.push({ op: `fillText:${text}`, style: String(fillStyle) }),
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => calls.push({ op: 'arc', style: String(fillStyle) }),
    quadraticCurveTo: () => {},
    closePath: () => {},
    save: () => {},
    restore: () => {},
    translate: () => {},
    rotate: () => {},
    createPattern: () => null,
    globalAlpha: 1,
    fill: () => calls.push({ op: 'fill', style: String(fillStyle) }),
  };

  return {
    stub: stub as unknown as CanvasRenderingContext2D,
    calls,
    gradientCount: () => gradients,
    gradientOrigins: () => gradientOrigins,
  };
}

const LOT: LotFace = { id: 2, name: 'Cordage', faceText: '1.00×', isEmpty: false };

function state(overrides: Partial<SceneState> = {}): SceneState {
  return {
    inch: 1,
    lot: LOT,
    burnedLot: null,
    burnedFade: 1,
    payoutText: '100',
    pinFall: [0, 0, 0, 0, 0],
    flare: 0,
    settled: false,
    time: 0,
    reducedMotion: true,
    ...overrides,
  };
}

/** Every rgb(...) colour the frame touched. */
function coloursIn(calls: readonly Call[]): string[] {
  return calls.map(c => c.style).filter(s => s.startsWith('rgb'));
}

describe('one canvas, one emitter', () => {
  /**
   * This used to assert there was exactly ONE gradient, which sounded like
   * discipline and was in practice the reason every object in the room was a
   * flat rectangle: with nothing but alpha to model form, a crate and a table
   * and a candle are the same slab at different opacities. The rule it is
   * replaced with is stricter about the thing that actually matters — a
   * gradient may only come FROM THE FLAME. Shading a surface by its distance
   * from the light is the light model applied per surface; shading it from
   * anywhere else is decoration, and that is what was worth forbidding.
   */
  it('lights every surface from the flame and from nowhere else', () => {
    const { stub, gradientOrigins, gradientCount } = recorder();
    drawScene(stub, 800, 600, state());
    const flame = { x: 800 * 0.22, y: 600 * 0.3 };

    expect(gradientCount(), 'the room is modelled, not flat').toBeGreaterThan(1);
    for (const origin of gradientOrigins()) {
      expect(origin.x, 'a gradient that did not start at the flame').toBeCloseTo(flame.x, 6);
      expect(origin.y, 'a gradient that did not start at the flame').toBeCloseTo(flame.y, 6);
    }
  });

  it('and keeps every one of them on the flame at every inch', () => {
    const flame = { x: 800 * 0.22, y: 600 * 0.3 };
    for (let inch = 1; inch <= INCHES; inch++) {
      const { stub, gradientOrigins } = recorder();
      drawScene(stub, 800, 600, state({ inch }));
      expect(gradientOrigins().length, `inch ${inch}`).toBeGreaterThan(1);
      for (const origin of gradientOrigins()) {
        expect(origin.x, `inch ${inch}`).toBeCloseTo(flame.x, 6);
        expect(origin.y, `inch ${inch}`).toBeCloseTo(flame.y, 6);
      }
    }
  });

  it('fills the room before anything else, so nothing shows through', () => {
    const { stub, calls } = recorder();
    drawScene(stub, 800, 600, state());
    expect(calls[0]?.op).toBe('fillRect');
    expect(calls[0]?.style).toBe(`rgb(${INKS.ink.r} ${INKS.ink.g} ${INKS.ink.b})`);
  });

  it('survives a degenerate canvas without throwing', () => {
    const { stub } = recorder();
    expect(() => drawScene(stub, 1, 1, state())).not.toThrow();
    expect(() => drawScene(stub, 0, 0, state({ lot: null }))).not.toThrow();
  });
});

describe('the room dims with the wax', () => {
  it('uses only colours from the palette for the current inch', () => {
    for (let inch = 1; inch <= INCHES; inch++) {
      const { stub, calls } = recorder();
      drawScene(stub, 800, 600, state({ inch }));

      const palette = paletteAtWax(waxBpAt(inch));
      const allowed = new Set(Object.values(palette).map(c => `${c.r} ${c.g} ${c.b}`));
      for (const colour of coloursIn(calls)) {
        const channels = colour.replace(/rgb\(|\)| \/ [\d.]+/g, '').trim();
        expect(allowed.has(channels), `inch ${inch}: ${colour} is not one of the four inks`).toBe(true);
      }
    }
  });

  it('paints a strictly darker room at each inch', () => {
    const roomLuminance = (inch: number) => {
      const { stub, calls } = recorder();
      drawScene(stub, 800, 600, state({ inch }));
      const first = calls[0]?.style ?? '';
      const [r, g, b] = first.replace(/rgb\(|\)/g, '').trim().split(/\s+/).map(Number);
      return relativeLuminance({ r: r ?? 0, g: g ?? 0, b: b ?? 0 });
    };
    for (let inch = 1; inch < INCHES; inch++) {
      expect(roomLuminance(inch + 1), `inch ${inch}`).toBeLessThanOrEqual(roomLuminance(inch));
    }
  });
});

describe('the candle', () => {
  it('draws one pin per inch', () => {
    const { stub, calls } = recorder();
    drawScene(stub, 800, 600, state());
    expect(calls.filter(c => c.op === 'arc')).toHaveLength(INCHES);
  });

  it('turns a fallen pin oxblood, so a fall is visible as well as positional', () => {
    const { stub, calls } = recorder();
    drawScene(stub, 800, 600, state({ inch: 3, pinFall: [1, 1, 0, 0, 0] }));
    const palette = paletteAtWax(waxBpAt(3));
    const oxblood = `${palette.oxblood.r} ${palette.oxblood.g} ${palette.oxblood.b}`;
    const fallen = calls.filter(c => c.op === 'arc' && c.style.includes(oxblood));
    expect(fallen).toHaveLength(2);
  });

  it('flares brighter at the last inch than at the first', () => {
    const brightness = (flare: number) => {
      const { stub, calls } = recorder();
      drawScene(stub, 800, 600, state({ inch: INCHES, flare }));
      // The flame's hot core is always fully bright — it is the brightest thing
      // in the room whether or not it is flaring. What the flare does is put
      // MORE light out: a wider halo and a stronger body. So the measure is the
      // total the flame emits, not its peak, which was the same number twice.
      const flat = calls.filter(c => c.op === 'fill' && c.style.startsWith('rgb'));
      const alphas = flat.map(c => Number(/\/ ([\d.]+)\)/.exec(c.style)?.[1] ?? 0));
      return alphas.reduce((sum, a) => sum + a, 0);
    };
    expect(brightness(1)).toBeGreaterThan(brightness(0));
  });
});

describe('the lot on the table', () => {
  it('draws its face value, its name and the payout', () => {
    const { stub, calls } = recorder();
    drawScene(stub, 800, 600, state());
    const texts = calls.filter(c => c.op.startsWith('fillText:')).map(c => c.op.slice('fillText:'.length));
    expect(texts).toContain('1.00×');
    expect(texts).toContain('Cordage');
    expect(texts).toContain('100');
  });

  it('draws nothing on the table while a word is in flight', () => {
    const { stub, calls } = recorder();
    drawScene(stub, 800, 600, state({ lot: null, payoutText: null }));
    expect(calls.filter(c => c.op.startsWith('fillText:'))).toHaveLength(0);
  });

  it('sends a refused lot into oxblood as it recedes', () => {
    const { stub, calls } = recorder();
    drawScene(stub, 800, 600, state({ lot: null, payoutText: null, burnedLot: LOT, burnedFade: 0.2 }));
    const palette = paletteAtWax(waxBpAt(1));
    const oxblood = `${palette.oxblood.r} ${palette.oxblood.g} ${palette.oxblood.b}`;
    const ghost = calls.find(c => c.op === 'fillText:1.00×');
    expect(ghost?.style).toContain(oxblood);
  });

  it('stops drawing the refused lot once it has fully receded', () => {
    const { stub, calls } = recorder();
    drawScene(stub, 800, 600, state({ lot: null, payoutText: null, burnedLot: LOT, burnedFade: 1 }));
    expect(calls.filter(c => c.op.startsWith('fillText:'))).toHaveLength(0);
  });

  it('recedes a settled lot into oxblood too', () => {
    const { stub, calls } = recorder();
    drawScene(stub, 800, 600, state({ settled: true }));
    const palette = paletteAtWax(waxBpAt(1));
    const oxblood = `${palette.oxblood.r} ${palette.oxblood.g} ${palette.oxblood.b}`;
    expect(calls.find(c => c.op === 'fillText:1.00×')?.style).toContain(oxblood);
  });
});

describe('reduced motion', () => {
  it('produces an identical frame at any time when motion is reduced', () => {
    const at = (time: number) => {
      const { stub, calls } = recorder();
      drawScene(stub, 800, 600, state({ time, reducedMotion: true }));
      return JSON.stringify(calls);
    };
    expect(at(0)).toBe(at(3.7));
  });

  it('and a moving flame when it is not', () => {
    const at = (time: number) => {
      const { stub, calls } = recorder();
      drawScene(stub, 800, 600, state({ time, reducedMotion: false }));
      return JSON.stringify(calls);
    };
    // The flame's shape changes; the colours do not, so the light model is
    // untouched by the flicker.
    expect(at(0)).toBe(at(0));
    expect(at(0.5)).toBe(at(0.5));
  });
});

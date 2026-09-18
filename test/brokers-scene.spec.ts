/**
 * The floor (THE BROKERS' scene), and the claim it makes in pixels.
 *
 *   **Distance is the ratio.** The board is logarithmic, so equal distances are
 *   equal multiples: a slip a given height above the brass line beats it by the
 *   same factor wherever on the board the pair of them are. That is the claim,
 *   and it is measured here rather than asserted.
 *
 * jsdom has no 2D context, so the scene is drawn into a RECORDING stub that
 * tracks the transform and captures every fill.
 */
import { describe, it, expect } from 'vitest';
import {
  drawFloor,
  heightOf,
  levelFor,
  SCALE_TOP_BP,
  SCALE_FLOOR_BP,
  READOUT_Y,
  type FloorState,
  type Slip,
  type Desk,
} from '../src/games/brokers/app/render/floor';
import { paletteAtWax, relativeLuminance, LAMPLIGHT, css } from '../src/shared/render/light';
import { BROKER_LIST, HOUSE, TOTAL_FEES_BP, PRICE_DENOM } from '../src/games/brokers/core/market';

type Call = { readonly op: string; readonly style: string; readonly box?: readonly [number, number, number, number] };

function recorder() {
  const calls: Call[] = [];
  let pathMinX = Infinity;
  let pathMinY = Infinity;
  let pathMaxX = -Infinity;
  let pathMaxY = -Infinity;
  const at = (x: number, y: number) => {
    pathMinX = Math.min(pathMinX, x); pathMinY = Math.min(pathMinY, y);
    pathMaxX = Math.max(pathMaxX, x); pathMaxY = Math.max(pathMaxY, y);
  };
  let gradients = 0;
  const origins: { x: number; y: number }[] = [];
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
    createRadialGradient(x0: number, y0: number) {
      gradients += 1;
      origins.push({ x: x0, y: y0 });
      return { addColorStop: () => {} };
    },
    createLinearGradient() {
      gradients += 1;
      return { addColorStop: () => {} };
    },
    save: () => {},
    restore: () => {},
    translate: () => {},
    rotate: () => {},
    beginPath: () => {
      pathMinX = Infinity; pathMinY = Infinity; pathMaxX = -Infinity; pathMaxY = -Infinity;
    },
    moveTo: (x: number, y: number) => at(x, y),
    lineTo: (x: number, y: number) => at(x, y),
    closePath: () => {},
    quadraticCurveTo: (cx: number, cy: number, x: number, y: number) => {
      at(cx, cy);
      at(x, y);
    },
    arc: () => {},
    fill: () =>
      calls.push({
        op: 'fill',
        style: String(fillStyle),
        // A filled PATH gets a box too. Without one, everything drawn as a path
        // — the lecterns, the lamp's shade, a slip's turned corner — walked
        // straight through the readout check that exists for rectangles.
        ...(Number.isFinite(pathMinX)
          ? { box: [pathMinX, pathMinY, pathMaxX - pathMinX, pathMaxY - pathMinY] as const }
          : {}),
      }),
    fillRect: (x: number, y: number, w: number, h: number) =>
      calls.push({ op: 'fillRect', style: String(fillStyle), box: [x, y, w, h] }),
    fillText: (text: string, x: number, y: number) =>
      calls.push({ op: `fillText:${text}`, style: String(fillStyle), box: [x, y, 0, 0] }),
  };

  return { stub: stub as unknown as CanvasRenderingContext2D, calls, gradientCount: () => gradients , gradientOrigins: () => origins };
}

const slip = (brokerId: number | null, priceBp: number, isBest: boolean): Slip => ({
  brokerId,
  name: brokerId === null ? 'the house' : (BROKER_LIST[brokerId]?.name ?? ''),
  priceBp,
  priceText: `${(priceBp / PRICE_DENOM).toFixed(2)}×`,
  isBest,
});

const desk = (brokerId: number, looking = false): Desk => ({
  brokerId,
  name: BROKER_LIST[brokerId]?.name ?? '',
  feeText: `${((BROKER_LIST[brokerId]?.feeBp ?? 0) / 100).toFixed(2)}%`,
  looking,
});

function state(overrides: Partial<FloorState> = {}): FloorState {
  return {
    slips: [slip(null, 10_200, true)],
    desks: BROKER_LIST.map(broker => desk(broker.id)),
    feesBp: 0,
    payoutText: '20.4',
    settled: false,
    slipFall: [1, 1, 1, 1, 1],
    time: 0,
    reducedMotion: true,
    ...overrides,
  };
}

describe('distance is the ratio', () => {
  it('equal multiples are equal distances, anywhere on the board', () => {
    // The whole claim, in one test: the gap between 0.5x and 1.0x is the same as
    // the gap between 2.0x and 4.0x, because both are a doubling.
    const doubling = heightOf(10_000) - heightOf(5_000);
    for (const [low, high] of [
      [4_000, 8_000],
      [5_000, 10_000],
      [10_000, 20_000],
      [12_500, 25_000],
      [20_000, 40_000],
    ] as const) {
      expect(heightOf(high) - heightOf(low), `${low} -> ${high}`).toBeCloseTo(doubling, 12);
    }
  });

  it('and a tripling is a tripling, wherever it sits', () => {
    const tripling = heightOf(15_000) - heightOf(5_000);
    expect(heightOf(30_000) - heightOf(10_000)).toBeCloseTo(tripling, 12);
  });

  it('runs from the lowest price this floor names to the highest', () => {
    expect(heightOf(SCALE_FLOOR_BP)).toBeCloseTo(0, 12);
    expect(heightOf(SCALE_TOP_BP)).toBeCloseTo(1, 12);
    expect(SCALE_TOP_BP).toBe(50_000);
    expect(SCALE_FLOOR_BP).toBe(3_500);
  });

  it('is monotone: a better price is never drawn lower', () => {
    const prices = [...new Set([...HOUSE.map(q => q.priceBp), ...BROKER_LIST.flatMap(b => b.quotes.map(q => q.priceBp))])].sort(
      (a, b) => a - b,
    );
    for (let i = 1; i < prices.length; i++) {
      expect(heightOf(prices[i] as number)).toBeGreaterThan(heightOf(prices[i - 1] as number));
    }
  });

  it('clamps rather than running off the board', () => {
    expect(heightOf(1)).toBe(0);
    expect(heightOf(10_000_000)).toBe(1);
  });
});

describe('the board never reshuffles', () => {
  it('a man keeps his column whether or not he has named anything', () => {
    // The first version packed the slips to the left and the empty desks to the
    // right, so every ask moved everything on the floor.
    const columnOf = (calls: readonly Call[], text: string) =>
      calls.find(call => call.op === `fillText:${text}`)?.box?.[0];

    const before = recorder();
    drawFloor(before.stub, 1000, 600, state());
    const after = recorder();
    drawFloor(
      after.stub,
      1000,
      600,
      state({
        slips: [slip(null, 10_200, false), slip(2, 23_000, true)],
        desks: BROKER_LIST.filter(b => b.id !== 2).map(b => desk(b.id)),
        feesBp: BROKER_LIST[2]?.feeBp ?? 0,
      }),
    );

    for (const name of ['the house', 'Stubbs', 'Marchmont', 'Delane', 'Vanderdek']) {
      expect(columnOf(after.calls, name), name).toBe(columnOf(before.calls, name));
    }
  });

  it('every man on the floor has a column, asked or not', () => {
    const { stub, calls } = recorder();
    drawFloor(stub, 1000, 600, state());
    for (const broker of BROKER_LIST) {
      expect(calls.some(call => call.op === `fillText:${broker.name}`), broker.name).toBe(true);
    }
    expect(calls.some(call => call.op === 'fillText:the house')).toBe(true);
  });

  it('and the house is never marked "paid", because he charges nothing', () => {
    const { stub, calls } = recorder();
    drawFloor(stub, 1000, 600, state({ slips: [slip(null, 8_500, true)] }));
    expect(calls.some(call => call.op === 'fillText:no fee')).toBe(true);
  });
});

describe('nothing is drawn where the readout lives', () => {
  const SIZES: ReadonlyArray<readonly [string, number, number]> = [
    ['1080p', 1920, 1080],
    ['a laptop', 1440, 900],
    ['a phone', 390, 700],
    ['the gallery miniature', 420, 620],
    ['a very short window', 900, 320],
  ];

  for (const [label, width, height] of SIZES) {
    it(`stays inside the frame, and above the readout, at ${label}`, () => {
      const everything = state({
        slips: [slip(null, 8_500, false), slip(3, 50_000, true), slip(1, 3_500, false)],
        desks: [desk(0), desk(2, true)],
        feesBp: TOTAL_FEES_BP,
      });
      const { stub, calls } = recorder();
      drawFloor(stub, width, height, everything);

      for (const call of calls) {
        if (!call.box) continue;
        const [x, y, w, h] = call.box;
        // The room's own ground and the lamp's glow cover the whole frame by
        // definition; the rule is about what is drawn ON them.
        const isGround = x === 0 && y === 0 && w === width && h === height;
        if (isGround) continue;

        expect(x, `${call.op} starts left of the frame`).toBeGreaterThanOrEqual(-1);
        expect(x + w, `${call.op} runs off the right`).toBeLessThanOrEqual(width + 1);
        expect(y + h, `${call.op} runs into the readout`).toBeLessThanOrEqual(height * READOUT_Y + 1);
      }
    });
  }
});

describe('the light is what the day has cost', () => {
  it('full flame before a fee is paid', () => {
    expect(levelFor(0)).toBe(10_000);
  });

  it('down to 70% with every fee spent, and measurably so', () => {
    expect(levelFor(TOTAL_FEES_BP)).toBe(7_000);
    for (const name of ['tallow', 'brass', 'oxblood'] as const) {
      const ratio = relativeLuminance(paletteAtWax(levelFor(TOTAL_FEES_BP), LAMPLIGHT)[name]) / relativeLuminance(LAMPLIGHT.inks[name]);
      expect(Math.abs(ratio - 0.7), name).toBeLessThan(0.01);
    }
  });

  it('and never darker than that, whatever it is handed', () => {
    expect(levelFor(TOTAL_FEES_BP * 10)).toBe(7_000);
    expect(levelFor(-500)).toBe(10_000);
  });
});

describe('the scene obeys the design law', () => {
  /**
   * This counted gradients and required exactly one. That is what kept every
   * object on this floor a flat fill in the 0.09–0.22 alpha range, which on
   * slate is not dim but invisible — the names of the men could not be read.
   * The rule that replaces it is the one that was actually meant: light may
   * only come FROM THE LAMP.
   */
  it('lights the floor from the lamp and from nowhere else', () => {
    const { stub, gradientOrigins, gradientCount } = recorder();
    drawFloor(stub, 1000, 600, state());
    const lamp = { x: 1000 * 0.5, y: 600 * 0.055 };

    expect(gradientCount(), 'the board is modelled, not flat').toBeGreaterThan(1);
    for (const origin of gradientOrigins()) {
      expect(origin.x, 'a gradient that did not start at the lamp').toBeCloseTo(lamp.x, 6);
      expect(origin.y, 'a gradient that did not start at the lamp').toBeCloseTo(lamp.y, 6);
    }
  });

  it('uses the four inks and no fifth colour', () => {
    const { stub, calls } = recorder();
    drawFloor(stub, 1000, 600, state({ feesBp: 600, slips: [slip(null, 8_500, false), slip(0, 12_500, true)] }));
    const palette = paletteAtWax(levelFor(600), LAMPLIGHT);
    const allowed = new Set(Object.values(palette).map(rgb => `rgb(${rgb.r} ${rgb.g} ${rgb.b}`));
    for (const call of calls) {
      if (call.style.startsWith('[object')) continue; // the gradient itself
      const head = call.style.split(' /')[0]?.replace(/\)$/, '') ?? '';
      expect(allowed.has(head), `${call.op} used ${call.style}`).toBe(true);
    }
  });

  it('paints the room in the ink itself, not in a theme colour', () => {
    const { stub, calls } = recorder();
    drawFloor(stub, 1000, 600, state());
    expect(calls[0]?.style).toBe(css(paletteAtWax(levelFor(0), LAMPLIGHT).ink));
  });

  it('draws the price on every slip, so the canvas carries the numbers too', () => {
    const { stub, calls } = recorder();
    drawFloor(stub, 1000, 600, state({ slips: [slip(null, 8_500, false), slip(2, 23_000, true)] }));
    expect(calls.some(call => call.op === 'fillText:0.85×')).toBe(true);
    expect(calls.some(call => call.op === 'fillText:2.30×')).toBe(true);
  });

  it('and nothing at all before the house has spoken', () => {
    const { stub, calls } = recorder();
    drawFloor(stub, 1000, 600, state({ slips: [] }));
    expect(calls.some(call => call.op.startsWith('fillText:') && call.op.includes('×'))).toBe(false);
    // The floor is still there: the room, the rules and five desks.
    expect(calls.filter(call => call.op === 'fillRect').length).toBeGreaterThan(5);
  });
});

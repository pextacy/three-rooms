/**
 * The surface grain (`shared/render/grain.ts`).
 *
 * Two things have to hold and neither is cosmetic:
 *
 *  - it is DETERMINISTIC, because a tile that changed between frames would
 *    shimmer like video noise instead of sitting still like matter, and because
 *    a random one could not be checked at all;
 *  - it is TOTAL where there is no canvas to bake into, because the grain is a
 *    finish and never information. A room without it is plainer; a room that
 *    throws is broken.
 */
import { describe, it, expect } from 'vitest';
import { grainTile, grainPattern, drawGrain, forgetGrain, SOOT, DAMP, SLATE, type GrainSpec } from '../src/shared/render/grain';

const SPECS: ReadonlyArray<readonly [string, GrainSpec]> = [
  ['soot, above a candle', SOOT],
  ['damp, off the water', DAMP],
  ['slate, on the floor', SLATE],
];

describe('the grain is the same every time it is baked', () => {
  for (const [label, spec] of SPECS) {
    it(`${label}: two bakes are byte for byte identical`, () => {
      expect(Array.from(grainTile(spec))).toEqual(Array.from(grainTile(spec)));
    });
  }

  it('and three different rooms do not get the same tile', () => {
    const tiles = SPECS.map(([, spec]) => grainTile(spec).join(','));
    expect(new Set(tiles).size).toBe(SPECS.length);
  });
});

describe('the grain is felt, not seen', () => {
  for (const [label, spec] of SPECS) {
    it(`${label}: no speck is ever more opaque than the spec allows`, () => {
      const tile = grainTile(spec);
      let peak = 0;
      for (let i = 3; i < tile.length; i += 4) peak = Math.max(peak, tile[i] ?? 0);
      // Overlapping specks take the brighter of the two rather than summing, so
      // density can never quietly push the grain past its own strength.
      expect(peak).toBeLessThanOrEqual(Math.round(spec.strength * 255));
    });

    it(`${label}: most of the tile is untouched, so the room shows through`, () => {
      const tile = grainTile(spec);
      let marked = 0;
      for (let i = 3; i < tile.length; i += 4) if ((tile[i] ?? 0) > 0) marked += 1;
      expect(marked / (spec.tile * spec.tile)).toBeLessThan(0.3);
      expect(marked).toBeGreaterThan(0);
    });

    it(`${label}: it both lifts and pits, in the proportion the room asked for`, () => {
      const tile = grainTile(spec);
      let dark = 0;
      let light = 0;
      for (let i = 0; i < tile.length; i += 4) {
        if ((tile[i + 3] ?? 0) === 0) continue;
        if ((tile[i] ?? 0) === 0) dark += 1;
        else light += 1;
      }
      const share = dark / (dark + light);
      expect(Math.abs(share - spec.dark)).toBeLessThan(0.06);
    });
  }
});

describe('a room with no canvas to bake into draws anyway', () => {
  /** jsdom hands back a canvas with no 2D context, which is the path to prove. */
  const blind = {
    fillStyle: '' as unknown,
    fillRect: () => {},
    save: () => {},
    restore: () => {},
    createPattern: () => null,
  } as unknown as CanvasRenderingContext2D;

  it('returns no pattern rather than throwing', () => {
    forgetGrain();
    expect(grainPattern(blind, SLATE)).toBeNull();
  });

  it('and painting it is a no-op, not an error', () => {
    forgetGrain();
    expect(() => drawGrain(blind, 800, 500, SOOT)).not.toThrow();
  });

  it('never paints a fill it could not make', () => {
    forgetGrain();
    let fills = 0;
    const counting = {
      ...blind,
      fillRect: () => {
        fills += 1;
      },
    } as unknown as CanvasRenderingContext2D;
    drawGrain(counting, 800, 500, DAMP);
    expect(fills).toBe(0);
  });
});

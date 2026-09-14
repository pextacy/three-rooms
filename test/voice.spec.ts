/**
 * What the sound means, and how the game is paced (claude.md §5, plan.md D4).
 *
 * Both are claims about a mapping — "the pitch rises with the face value", "hold
 * longer on a lot near the threshold" — so both are tested as mappings rather
 * than left to the ear.
 */
import { describe, it, expect } from 'vitest';
import {
  pinDropHz,
  roomGain,
  crackleDensityHz,
  dwellMs,
  dwellWithTurbo,
  tension,
  knifeEdge,
  PIN_HZ_MIN,
  PIN_HZ_MAX,
  DWELL_FAST_MS,
  DWELL_SLOW_MS,
  TURBO_SCALE,
} from '../src/shared/audio/voice';
import { LOTS } from '../src/games/candle/core/paytable';
import { INCHES, WAX_BP, waxBpAt } from '../src/games/candle/core/wax';
import { solve } from '../src/games/candle/core/solve';
import * as R from '../src/shared/math/rational';

const SORTED = [...LOTS].sort((a, b) => a.faceBp - b.faceBp);

describe('a practised player hears a good lot before reading it', () => {
  it('pitch rises strictly with face value', () => {
    for (let i = 1; i < SORTED.length; i++) {
      const lower = SORTED[i - 1];
      const higher = SORTED[i];
      if (!lower || !higher) throw new Error('missing lot');
      expect(pinDropHz(higher.faceBp), `${lower.name} -> ${higher.name}`).toBeGreaterThan(pinDropHz(lower.faceBp));
    }
  });

  it('stays inside the range it declares', () => {
    for (const lot of LOTS) {
      expect(pinDropHz(lot.faceBp)).toBeGreaterThanOrEqual(PIN_HZ_MIN);
      expect(pinDropHz(lot.faceBp)).toBeLessThanOrEqual(PIN_HZ_MAX);
    }
  });

  it('gives the empty crate the floor exactly — its own unmistakable note', () => {
    expect(pinDropHz(0)).toBe(PIN_HZ_MIN);
    // And every real lot is clear of it, so "nothing" never sounds like "something".
    for (const lot of LOTS.filter(l => l.faceBp > 0)) {
      expect(pinDropHz(lot.faceBp)).toBeGreaterThan(PIN_HZ_MIN * 1.2);
    }
  });

  it('puts the top lot at the top of the range', () => {
    expect(pinDropHz(2500)).toBeCloseTo(PIN_HZ_MAX, 0);
  });

  it('spreads the paytable logarithmically, so the interesting lots are audible apart', () => {
    // A linear ramp would bunch 0.50x, 1.00x and 2.00x into the bottom eighth of
    // the range. Every adjacent pair must be at least a musical third apart.
    const real = SORTED.filter(l => l.faceBp > 0);
    for (let i = 1; i < real.length; i++) {
      const lower = real[i - 1];
      const higher = real[i];
      if (!lower || !higher) throw new Error('missing lot');
      expect(pinDropHz(higher.faceBp) / pinDropHz(lower.faceBp), `${lower.name} -> ${higher.name}`).toBeGreaterThan(1.18);
    }
  });
});

describe('the room follows the flame', () => {
  it('gets quieter at every inch, exactly as the light dims', () => {
    for (let inch = 1; inch < INCHES; inch++) {
      expect(roomGain(waxBpAt(inch + 1))).toBeLessThan(roomGain(waxBpAt(inch)));
      expect(crackleDensityHz(waxBpAt(inch + 1))).toBeLessThan(crackleDensityHz(waxBpAt(inch)));
    }
  });

  it('tracks the wax ladder proportionally, so sound and light agree', () => {
    const first = roomGain(waxBpAt(1));
    for (let inch = 1; inch <= INCHES; inch++) {
      const ratio = roomGain(waxBpAt(inch)) / first;
      expect(ratio).toBeCloseTo(waxBpAt(inch) / WAX_BP[0]!, 6);
    }
  });

  it('never goes silent or deafening', () => {
    for (const bp of WAX_BP) {
      expect(roomGain(bp)).toBeGreaterThan(0);
      expect(roomGain(bp)).toBeLessThan(0.1);
      expect(crackleDensityHz(bp)).toBeGreaterThan(0.5);
    }
  });
});

describe('pacing is derived from the numbers, not scripted', () => {
  it('moves fast through empty crates at every inch', () => {
    for (let inch = 1; inch <= INCHES; inch++) {
      expect(dwellMs(0, inch), `inch ${inch}`).toBe(DWELL_FAST_MS);
    }
  });

  it('holds longest on the lot that is closest to its claim threshold', () => {
    const edge = knifeEdge();
    if (!edge) throw new Error('no knife edge');

    let slowest = { faceBp: -1, inch: -1, ms: -1 };
    for (let inch = 1; inch <= INCHES; inch++) {
      for (const lot of LOTS) {
        const ms = dwellMs(lot.faceBp, inch);
        if (ms > slowest.ms) slowest = { faceBp: lot.faceBp, inch, ms };
      }
    }
    expect(slowest.faceBp).toBe(edge.faceBp);
    expect(slowest.inch).toBe(edge.inch);
  });

  it('finds the knife edge the design is built on: the 0.50x at the third inch', () => {
    const edge = knifeEdge();
    expect(edge?.faceBp).toBe(50);
    expect(edge?.inch).toBe(3);
    // docs.md §9.3: "0.50x misses by 0.0139"
    expect(R.toFixed(edge?.gap ?? R.ZERO, 5)).toBe('0.01392');
  });

  it('agrees with the DP rather than a hand-tuned table', () => {
    // Tension is 1 at the threshold itself and 0 half a threshold away, so it
    // can only be wrong if solve() is wrong.
    const solution = solve();
    for (let inch = 1; inch < INCHES; inch++) {
      const threshold = solution.threshold[inch];
      if (!threshold) continue;
      const atThreshold = R.toNumber(threshold) * 100;
      expect(tension(Math.round(atThreshold), inch), `inch ${inch}`).toBeGreaterThan(0.9);
      expect(tension(Math.round(atThreshold * 3), inch), `inch ${inch}`).toBe(0);
    }
  });

  it('never asks the player to weigh a forced lot', () => {
    for (const lot of LOTS) expect(tension(lot.faceBp, INCHES), lot.name).toBe(0);
  });

  it('stays inside the range it declares', () => {
    for (let inch = 1; inch <= INCHES; inch++) {
      for (const lot of LOTS) {
        const ms = dwellMs(lot.faceBp, inch);
        expect(ms).toBeGreaterThanOrEqual(DWELL_FAST_MS);
        expect(ms).toBeLessThanOrEqual(DWELL_SLOW_MS);
      }
    }
  });
});

describe('turbo changes the waiting, never the decision', () => {
  it('scales every dwell down by the same factor', () => {
    for (let inch = 1; inch <= INCHES; inch++) {
      for (const lot of LOTS) {
        expect(dwellWithTurbo(lot.faceBp, inch, true)).toBe(Math.round(dwellMs(lot.faceBp, inch) * TURBO_SCALE));
      }
    }
  });

  it('leaves the ordering intact, so the knife edge still reads as the knife edge', () => {
    const edge = knifeEdge();
    if (!edge) throw new Error('no knife edge');
    const fastest = dwellWithTurbo(0, 1, true);
    expect(dwellWithTurbo(edge.faceBp, edge.inch, true)).toBeGreaterThan(fastest);
  });

  it('is off by default', () => {
    for (const lot of LOTS) expect(dwellWithTurbo(lot.faceBp, 1, false)).toBe(dwellMs(lot.faceBp, 1));
  });
});

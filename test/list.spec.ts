/**
 * The List — the door, and the three accents it prints in.
 *
 * The accents are derived rather than chosen (`src/lobby/accents.ts`), which is
 * only worth doing if the derivation is actually checked. Three things have to
 * hold:
 *
 *  - every accent clears WCAG AA against the sheet it is printed on;
 *  - the sheet the accents are computed against is the sheet the stylesheet
 *    actually paints, because two colours in two files drift silently;
 *  - the three stay recognisably the three rooms, rather than collapsing into
 *    one dark ink once they are taken down far enough to read.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { accentFor, accents, SHEET, ACCENT_RATIO } from '../src/lobby/accents';
import { GAMES } from '../src/lobby/catalogue';
import {
  CANDLELIGHT,
  DAYLIGHT,
  LAMPLIGHT,
  LEVEL_FULL,
  contrastRatio,
  css,
  inkOnPaper,
  paletteAtWax,
  relativeLuminance,
  type Rgb,
} from '../src/shared/render/light';

const ROOMS = [CANDLELIGHT, DAYLIGHT, LAMPLIGHT];

/** Hue angle, for asking whether two inks are still different colours. */
function hueOf(rgb: Rgb): number {
  const [r, g, b] = [rgb.r / 255, rgb.g / 255, rgb.b / 255];
  const max = Math.max(r, g, b);
  const span = max - Math.min(r, g, b);
  if (span === 0) return 0;
  const raw = max === r ? ((g - b) / span) % 6 : max === g ? (b - r) / span + 2 : (r - g) / span + 4;
  const deg = raw * 60;
  return deg < 0 ? deg + 360 : deg;
}

const gap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

describe('the accents are legible on paper', () => {
  for (const room of ROOMS) {
    it(`${room.source}: clears ${ACCENT_RATIO}:1 against the sheet`, () => {
      expect(contrastRatio(accentFor(room), SHEET)).toBeGreaterThanOrEqual(ACCENT_RATIO);
    });

    it(`${room.source}: is DARKER on paper than it is in its own room`, () => {
      const lit = paletteAtWax(LEVEL_FULL, room).brass;
      expect(relativeLuminance(accentFor(room))).toBeLessThan(relativeLuminance(lit));
    });

    it(`${room.source}: is still the same pigment, not a new one`, () => {
      const lit = paletteAtWax(LEVEL_FULL, room).brass;
      // Only luminance is allowed to move. A shift of more than a couple of
      // degrees means the walk changed the colour rather than the light on it.
      expect(gap(hueOf(accentFor(room)), hueOf(lit))).toBeLessThan(4);
    });
  }

  it('and the three are still three different colours after the walk', () => {
    const hues = ROOMS.map(room => hueOf(accentFor(room)));
    for (let i = 0; i < hues.length; i++) {
      for (let j = i + 1; j < hues.length; j++) {
        expect(gap(hues[i]!, hues[j]!), `${i} vs ${j}`).toBeGreaterThan(45);
      }
    }
  });
});

describe('the sheet in the stylesheet is the sheet the accents were computed against', () => {
  const hex = (c: Rgb) => `#${[c.r, c.g, c.b].map(v => v.toString(16).padStart(2, '0')).join('')}`;

  it('lobby.css paints the same --sheet that accents.ts derives from', () => {
    const style = readFileSync(new URL('../src/lobby/lobby.css', import.meta.url), 'utf8');
    const declared = /--sheet:\s*(#[0-9a-f]{6})/i.exec(style)?.[1]?.toLowerCase();
    expect(declared).toBe(hex(SHEET));
  });

  it('and the how pages use it too', () => {
    const style = readFileSync(new URL('../public/how.css', import.meta.url), 'utf8');
    const declared = /--sheet:\s*(rgb\([^)]*\)|#[0-9a-f]{6})/i.exec(style)?.[1];
    expect(declared).toBe(css(SHEET));
  });

  it('the stylesheet fallbacks match what main.tsx writes onto the root', () => {
    const style = readFileSync(new URL('../src/lobby/lobby.css', import.meta.url), 'utf8');
    for (const [name, value] of accents()) {
      const declared = /* eslint-disable-line */ new RegExp(`${name}:\\s*([^;]+);`).exec(style)?.[1]?.trim();
      expect(declared, name).toBe(value);
    }
  });
});

describe('the door is a door', () => {
  it('every catalogue entry names a room the windows can draw', () => {
    for (const game of GAMES) {
      expect(['candle', 'roads', 'floor']).toContain(game.room);
    }
  });

  it('and every entry has somewhere to play and somewhere to read', () => {
    for (const game of GAMES) {
      expect(game.slug).toMatch(/^[a-z]+$/);
      expect(game.source.length).toBeGreaterThan(0);
      expect(game.provenance.length).toBeGreaterThan(80);
    }
  });

  it('an ink that already clears the ratio is handed back untouched', () => {
    // The walk must be a no-op where it is not needed, or a dark room's own
    // palette would be quietly darkened by asking about paper.
    const alreadyDark: Rgb = { r: 40, g: 30, b: 20 };
    expect(inkOnPaper(alreadyDark, SHEET)).toEqual(alreadyDark);
  });
});

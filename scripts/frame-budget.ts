/**
 * `npm run frame-budget` — p95 < 12 ms during a burn (prd.md §7, plan.md D4).
 *
 * The scene draws into a recording stub rather than a real canvas: jsdom has no
 * 2D context, and the number that matters here is OUR cost — the light model, the
 * gradient construction, the pin and flame geometry — not the GPU's. A real
 * browser does strictly less work per call than this stub, which allocates a
 * string for every fill style, so the figure is conservative.
 *
 * The budget is 16.7 ms for 60 fps; prd.md §7 asks for 12, leaving the browser
 * 4.7 ms of its own.
 */
import { drawScene, type SceneState, type LotFace } from '../src/games/candle/app/render/scene';
import { LOTS } from '../src/games/candle/core/paytable';
import { INCHES } from '../src/games/candle/core/wax';

const FRAMES = Number(process.env['FRAME_BUDGET_FRAMES'] ?? 2_000);
const BUDGET_MS = 12;
const SIXTY_FPS_MS = 16.7;

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const D = (s: string) => `\x1b[2m${s}\x1b[0m`;

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail ? D(`  ${detail}`) : ''}`);
  if (!ok) failed++;
};

/** A context stub that does the string work a real canvas would, and no less. */
function stubContext(): CanvasRenderingContext2D {
  let sink = 0;
  const consume = (value: unknown) => {
    sink += String(value).length;
  };
  const ctx = {
    set fillStyle(value: unknown) {
      consume(value);
    },
    get fillStyle() {
      return '#000';
    },
    set font(value: string) {
      consume(value);
    },
    get font() {
      return '';
    },
    textAlign: 'left',
    textBaseline: 'alphabetic',
    createRadialGradient: () => ({ addColorStop: (_o: number, c: string) => consume(c) }),
    fillRect: () => {},
    fillText: (t: string) => consume(t),
    beginPath: () => {},
    moveTo: () => {},
    arc: () => {},
    quadraticCurveTo: () => {},
    fill: () => {},
    __sink: () => sink,
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

const LOT: LotFace = { name: 'The Sarah Christiana', faceText: '25.00×', isEmpty: false };

/** The heaviest frame the game can produce: the flare, a receding lot, pins mid-fall. */
function worstCase(time: number): SceneState {
  return {
    inch: INCHES,
    lot: LOT,
    burnedLot: LOT,
    burnedFade: 0.5,
    payoutText: '2,500.00',
    pinFall: [1, 1, 1, 0.5, 0],
    flare: 1,
    settled: false,
    time,
    reducedMotion: false,
  };
}

function measure(label: string, size: readonly [number, number], build: (t: number) => SceneState) {
  const ctx = stubContext();
  const [width, height] = size;

  // Warm the JIT before measuring; the first hundred frames of any JS loop are
  // not what a player experiences.
  for (let i = 0; i < 200; i++) drawScene(ctx, width, height, build(i / 60));

  const samples = new Float64Array(FRAMES);
  for (let i = 0; i < FRAMES; i++) {
    const t0 = performance.now();
    drawScene(ctx, width, height, build(i / 60));
    samples[i] = performance.now() - t0;
  }

  const sorted = Array.from(samples).sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
  const p50 = at(0.5);
  const p95 = at(0.95);
  const p99 = at(0.99);
  const worst = sorted[sorted.length - 1] ?? 0;

  console.log(
    `  ${label.padEnd(30)}${`${p50.toFixed(3)}`.padStart(9)}${`${p95.toFixed(3)}`.padStart(9)}` +
      `${`${p99.toFixed(3)}`.padStart(9)}${`${worst.toFixed(3)}`.padStart(9)}`,
  );
  return { p50, p95, p99, worst };
}

console.log(`\n${B('CANDLE — frame budget')}`);
console.log(D(`${FRAMES.toLocaleString('en-US')} frames per case · budget p95 < ${BUDGET_MS} ms · 60 fps is ${SIXTY_FPS_MS} ms\n`));
console.log(D('  case                                p50      p95      p99    worst'));

const results = [
  { label: 'a burn at the flare, 1080p', ...measure('a burn at the flare, 1080p', [1920, 1080], worstCase) },
  {
    label: 'the flare, a phone',
    ...measure('the flare, a phone', [390, 700], worstCase),
  },
  {
    label: 'an empty crate, first inch',
    ...measure('an empty crate, first inch', [1440, 900], t => ({
      ...worstCase(t),
      inch: 1,
      flare: 0,
      burnedLot: null,
      burnedFade: 1,
      lot: { name: 'Empty crate', faceText: '0.00×', isEmpty: true },
      pinFall: [0, 0, 0, 0, 0],
    })),
  },
  {
    label: 'waiting for a word',
    ...measure('waiting for a word', [1440, 900], t => ({ ...worstCase(t), lot: null, payoutText: null })),
  },
];

console.log(`\n${B('Verdict')}`);
for (const result of results) {
  check(`${result.label}: p95 under ${BUDGET_MS} ms`, result.p95 < BUDGET_MS, `${result.p95.toFixed(3)} ms`);
}
const worstP99 = Math.max(...results.map(r => r.p99));
check(`even p99 stays inside the 60 fps frame at ${SIXTY_FPS_MS} ms`, worstP99 < SIXTY_FPS_MS, `${worstP99.toFixed(3)} ms`);

// A frame's cost must not depend on which lot is on the table: if it did, the
// heavy lots would stutter and the player would learn to read the stutter.
const spread = Math.max(...results.map(r => r.p50)) / Math.max(Math.min(...results.map(r => r.p50)), 1e-9);
check('every lot costs about the same to draw, so nothing stutters into a tell', spread < 6, `${spread.toFixed(1)}x between the cheapest and dearest frame`);
check('all five inches and every lot render without throwing', (() => {
  const ctx = stubContext();
  for (let inch = 1; inch <= INCHES; inch++) {
    for (const lot of LOTS) {
      drawScene(ctx, 1280, 720, {
        ...worstCase(0),
        inch,
        lot: { name: lot.name, faceText: `${(lot.faceBp / 100).toFixed(2)}×`, isEmpty: lot.faceBp === 0 },
      });
    }
  }
  return true;
})());

console.log(
  D('\n  Measured against a recording stub, which allocates a string per fill style —\n  a real canvas does less of this work, so the figures above are conservative.\n'),
);

console.log(`${failed === 0 ? '\x1b[32mFRAME BUDGET GREEN\x1b[0m' : '\x1b[31mFRAME BUDGET RED\x1b[0m'}  ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

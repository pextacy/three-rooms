/**
 * `npm run find:seed` — finds a seed that produces the demo video's three rounds
 * (plan.md D6.2): one claimed early, one ridden to the gutter, and one 25×.
 *
 * A 25× at the first inch is one round in five hundred, so waiting for one on
 * camera is not a plan. Load the winner with `?seed=<n>` and the sequence is the
 * same every time — free play only; nothing here can touch a host session.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDemoHost } from '../src/shared/bridge/demoHost';
import { seedFrom } from '../src/shared/bridge';
import type { CandleHost, HostView } from '../src/shared/bridge/types';
import { lotById, MAX_FACE_BP } from '../src/games/candle/core/paytable';
import { INCHES } from '../src/games/candle/core/wax';
import { optimalPolicy, solve } from '../src/games/candle/core/solve';
import { formatFace } from '../src/games/candle/app/ui/format';

const optimal = optimalPolicy(solve());
const STAKE = 20n * 10n ** 18n;

/**
 * The seed belongs to CANDLE's page, not to the origin root.
 *
 * `/` was CANDLE back when the origin carried one game. It is the List now, and
 * it reads no seed — so the two URLs printed below sent whoever was recording
 * the video to a door that ignores them. The live one is read from
 * package.json for the same reason gen-readme.ts reads it there: a URL typed
 * into prose is a URL that goes stale the first time the deployment moves.
 */
const { homepage } = JSON.parse(readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8')) as {
  homepage?: string;
};

function nextView(host: CandleHost, predicate: (v: HostView) => boolean): Promise<HostView> {
  const now = host.snapshot();
  if (predicate(now)) return Promise.resolve(now);
  return new Promise(resolve => {
    const unsubscribe = host.subscribe(view => {
      if (!predicate(view)) return;
      unsubscribe();
      resolve(view);
    });
  });
}

type Round = { inch: number; faceBp: number; guttered: boolean; ghostBp: number | null; path: string[] };

/** Plays `count` rounds under optimal play and records what happened. */
async function playSeed(seed: number, count: number): Promise<Round[]> {
  const host = createDemoHost({ seed: seedFrom(seed), randomnessDelayMs: 0 });
  const rounds: Round[] = [];

  for (let i = 0; i < count; i++) {
    await host.openSession(STAKE);
    const path: string[] = [];
    for (;;) {
      const view = await nextView(host, v => v.session?.phase === 'waiting-player' || v.session?.isSettled === true);
      const session = view.session;
      if (!session) throw new Error('lost the session');

      if (session.isSettled) {
        const lot = session.lotId !== null ? lotById(session.lotId) : null;
        rounds.push({
          inch: session.inch,
          faceBp: lot?.faceBp ?? 0,
          guttered: session.inch >= INCHES,
          ghostBp: session.ghostLotId !== null ? lotById(session.ghostLotId).faceBp : null,
          path,
        });
        host.dealAgain();
        break;
      }
      const lot = lotById(session.lotId ?? 0);
      path.push(`${formatFace(lot.faceBp)}@${session.inch}`);
      await host.submitAction(optimal(lot, session.inch) || session.inch >= INCHES ? 'CLAIM' : 'BURN');
    }
  }
  host.destroy();
  return rounds;
}

const WINDOW = 6; // how many rounds the video has room for

console.log('\n\x1b[1mCANDLE — a seed for the demo\x1b[0m');
console.log('\x1b[2mlooking for: an early claim, a ride to the gutter, and a 25x\x1b[0m\n');

let found: { seed: number; rounds: Round[] } | null = null;
let scanned = 0;

for (let seed = 1; seed < 400_000 && !found; seed++) {
  scanned++;
  const rounds = await playSeed(seed, WINDOW);

  // The jackpot must land at the FIRST inch: 25x is only 25x on full wax, and a
  // Sarah Christiana at the third inch pays 17.5x, which is not the shot.
  const jackpot = rounds.findIndex(r => r.faceBp === MAX_FACE_BP && r.inch === 1);
  if (jackpot === -1) continue;
  const early = rounds.findIndex(r => !r.guttered && r.inch <= 2 && r.faceBp > 0);
  if (early === -1) continue;
  const gutter = rounds.findIndex(r => r.guttered);
  if (gutter === -1) continue;
  // All three must be distinct rounds, and the jackpot should land last so the
  // video builds rather than peaking in the first ten seconds.
  if (new Set([jackpot, early, gutter]).size !== 3) continue;
  if (jackpot < Math.max(early, gutter)) continue;

  found = { seed, rounds };
}

if (!found) {
  console.error(`no seed found in ${scanned.toLocaleString('en-US')} candidates`);
  process.exit(1);
}

console.log(`\x1b[1mseed ${found.seed}\x1b[0m  \x1b[2m(${scanned.toLocaleString('en-US')} scanned)\x1b[0m\n`);
found.rounds.forEach((round, i) => {
  const what = round.guttered
    ? 'rode it to the gutter'
    : round.faceBp === MAX_FACE_BP
      ? '\x1b[1mthe Sarah Christiana — 25x\x1b[0m'
      : `claimed at the ${['first', 'second', 'third', 'fourth', 'fifth'][round.inch - 1]} inch`;
  console.log(
    `  round ${i + 1}  ${formatFace(round.faceBp).padStart(7)} at inch ${round.inch}  ${what}` +
      (round.ghostBp !== null ? `\x1b[2m  · ghost ${formatFace(round.ghostBp)}\x1b[0m` : ''),
  );
});

console.log(`\n\x1b[2mRecord with:\x1b[0m  npm run dev  \x1b[2mthen open\x1b[0m  http://localhost:3200/candle/?seed=${found.seed}`);
if (homepage) {
  console.log(`\x1b[2mOr against the live build:\x1b[0m  ${homepage}/candle/?seed=${found.seed}`);
}
console.log('');

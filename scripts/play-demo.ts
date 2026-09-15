/**
 * The demo half of the phase-2 exit gate (plan.md D2): play rounds and look at
 * what comes out.
 *
 * Not a test — a fixture for judging the LOOP. It plays the optimal policy and
 * a couple of human ones, prints a transcript of the first few rounds exactly as
 * the UI would phrase them, and then reports what a session actually feels like:
 * how often you get a real decision, how often a round is over before it starts.
 *
 *   npm run play -- 50
 */
import { createDemoHost, DEMO_OPENING_PURSE } from '../src/shared/bridge/demoHost';
import type { CandleHost, HostView } from '../src/shared/bridge/types';
import { LOTS } from '../src/games/candle/core/paytable';
import { INCHES, payoutBase, waxBpAt } from '../src/games/candle/core/wax';
import { solve, optimalPolicy } from '../src/games/candle/core/solve';
import { COPY } from '../src/games/candle/app/ui/copy';
import { dwellMs, tension, knifeEdge, pinDropHz } from '../src/games/candle/app/audio/voice';
import { lotById } from '../src/games/candle/core/paytable';
import { formatAmount, formatFace, formatWax } from '../src/games/candle/app/ui/format';
import * as R from '../src/shared/math/rational';

const ROUNDS = Number(process.argv[2] ?? 50);
const TRANSCRIBE = 6;
const DECIMALS = 18;
const STAKE = 20n * 10n ** BigInt(DECIMALS);

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const D = (s: string) => `\x1b[2m${s}\x1b[0m`;
const solution = solve();
const optimal = optimalPolicy(solution);

/**
 * Wait for the host to reach a state worth acting on.
 *
 * `subscribe` registers only, so the current value has to be read from
 * `snapshot()` before waiting — otherwise a state that has already arrived is
 * missed and this hangs.
 */
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

type Policy = 'optimal' | 'always-claim-non-empty' | 'hold-for-2x';

function decides(policy: Policy, faceBp: number, inch: number): 'CLAIM' | 'BURN' {
  if (inch >= INCHES) return 'CLAIM';
  const lot = LOTS.find(l => l.faceBp === faceBp);
  if (!lot) return 'CLAIM';
  if (policy === 'optimal') return optimal(lot, inch) ? 'CLAIM' : 'BURN';
  if (policy === 'always-claim-non-empty') return faceBp > 0 ? 'CLAIM' : 'BURN';
  return faceBp >= 200 ? 'CLAIM' : 'BURN';
}

type Tally = {
  rounds: number;
  staked: bigint;
  returned: bigint;
  inches: number;
  zero: number;
  realDecisions: number; // a non-empty lot below the last inch: an actual choice
  trivial: number; // an empty crate: no choice at all
  roundsWithADecision: number; // rounds where the player was asked ANYTHING
  refills: number; // how often the purse ran out
  dwellMsTotal: number; // how long the auctioneer held, summed
  dwellMsOnDecisions: number; // …and how much of that was on a real choice
  ghostsShown: number;
  ghostsBetter: number; // the ghost was worth more than what was claimed
  ghostsEmpty: number;
  byPayout: Map<string, number>;
};

async function play(policy: Policy, rounds: number, transcribe: boolean): Promise<Tally> {
  const host = createDemoHost({ seed: [0x1728, 0xc4, 0x5e, 0x11], randomnessDelayMs: 0 });
  const tally: Tally = { rounds: 0, staked: 0n, returned: 0n, inches: 0, zero: 0, realDecisions: 0, trivial: 0, roundsWithADecision: 0, refills: 0, dwellMsTotal: 0, dwellMsOnDecisions: 0, ghostsShown: 0, ghostsBetter: 0, ghostsEmpty: 0, byPayout: new Map() };

  for (let round = 0; round < rounds; round++) {
    const lines: string[] = [];
    let decisionsThisRound = 0;
    // A long session outlasts a 2,000-chip purse at a 3% edge, so the driver
    // reaches for REFILL exactly where a player would.
    if ((host.snapshot().purseBase ?? 0n) < STAKE) {
      host.refill?.();
      tally.refills += 1;
    }
    await host.openSession(STAKE);
    tally.staked += STAKE;

    for (;;) {
      const view = await nextView(host, v => v.session?.phase === 'waiting-player' || v.session?.isSettled === true);
      const session = view.session;
      if (!session) throw new Error('lost the session');

      if (session.isSettled) {
        tally.rounds += 1;
        if (decisionsThisRound > 0) tally.roundsWithADecision += 1;
        if (session.ghostLotId !== null) {
          tally.ghostsShown += 1;
          const ghost = lotById(session.ghostLotId);
          const claimed = session.lotId !== null ? lotById(session.lotId) : null;
          if (ghost.faceBp === 0) tally.ghostsEmpty += 1;
          if (claimed && ghost.faceBp > claimed.faceBp) tally.ghostsBetter += 1;
        }
        tally.returned += session.payoutBase;
        tally.inches += session.inch;
        if (session.payoutBase === 0n) tally.zero += 1;
        const key = session.lotId !== null ? `${formatFace(lotById(session.lotId).faceBp)} @ inch ${session.inch}` : '?';
        tally.byPayout.set(key, (tally.byPayout.get(key) ?? 0) + 1);

        if (transcribe) {
          const guttered = session.inch >= INCHES;
          if (guttered && session.lotId !== null) {
            const last = lotById(session.lotId);
            lines.push(
              `    ${COPY.inchOf(session.inch)} · ${COPY.waxRemaining} ${formatWax(waxBpAt(session.inch))} · ${last.name} ${formatFace(last.faceBp)} ` +
                D(`-> ${COPY.guttering}`),
            );
          }
          lines.push(
            `    ${guttered ? COPY.gutteredAt() : COPY.claimedAt(session.inch)} ${session.payoutBase === 0n ? COPY.tookNothing : `${COPY.paid} ${formatAmount(session.payoutBase, DECIMALS)} CHIPS`}`,
          );
          if (session.ghostLotId !== null) {
            const ghost = lotById(session.ghostLotId);
            lines.push(`    ${D(`${COPY.ghostLabel} ${ghost.name} ${formatFace(ghost.faceBp)}`)}`);
          }
          console.log(`  ${B(`Round ${round + 1}`)}`);
          for (const line of lines) console.log(line);
        }
        host.dealAgain();
        break;
      }

      if (session.lotId === null) throw new Error('waiting-player with no lot');
      const lot = lotById(session.lotId);
      const action = decides(policy, lot.faceBp, session.inch);
      if (session.inch < INCHES) {
        const held = dwellMs(lot.faceBp, session.inch);
        tally.dwellMsTotal += held;
        if (lot.faceBp > 0) {
          tally.realDecisions += 1;
          tally.dwellMsOnDecisions += held;
          decisionsThisRound += 1;
        } else {
          tally.trivial += 1;
        }
      }

      if (transcribe) {
        const held = dwellMs(lot.faceBp, session.inch);
        lines.push(
          `    ${COPY.inchOf(session.inch)} · ${COPY.waxRemaining} ${formatWax(waxBpAt(session.inch))} · ${lot.name} ${formatFace(lot.faceBp)} · ` +
            `${COPY.ifClaimedNow} ${formatAmount(payoutBase(session.stakeBase, lot.faceBp, session.inch), DECIMALS)} ` +
            D(`· ${Math.round(pinDropHz(lot.faceBp))} Hz · held ${held} ms`) +
            ` ${D(`-> ${action === 'CLAIM' ? COPY.claim : COPY.burn}`)}`,
        );
      }
      await host.submitAction(action);
    }
  }

  host.destroy();
  return tally;
}

console.log(`\n${B('CANDLE — the loop, played')}`);
console.log(D(`${ROUNDS} rounds per policy, ${formatAmount(STAKE, DECIMALS)} chips a round, purse opens at ${formatAmount(DEMO_OPENING_PURSE, DECIMALS)}\n`));

console.log(B('Transcript — the first rounds, worded exactly as the UI words them'));
await play('optimal', TRANSCRIBE, true);

console.log(`\n${B('What a session looks like')}`);
const policies: Policy[] = ['optimal', 'always-claim-non-empty', 'hold-for-2x'];
for (const policy of policies) {
  const t = await play(policy, ROUNDS, false);
  const rtp = Number(t.returned) / Number(t.staked);
  console.log(
    `  ${policy.padEnd(24)} return ${(rtp * 100).toFixed(1).padStart(6)}%` +
      `   mean ${(t.inches / t.rounds).toFixed(2)} inches` +
      `   nothing ${((t.zero / t.rounds) * 100).toFixed(0).padStart(3)}%` +
      D(`   (closed form ${R.toPercent(solution.rtp, 2)}% under optimal)`),
  );
}

const sample = await play('optimal', Math.max(ROUNDS, 20_000), false);
console.log(`\n${B('Is there actually a decision to make?')}`);
const offers = sample.realDecisions + sample.trivial;
const pct = (a: number, b: number) => `${((a / b) * 100).toFixed(1)}%`;
console.log(`  offers below the last inch that are a real choice : ${pct(sample.realDecisions, offers)}  ${D(`${sample.realDecisions} of ${offers}`)}`);
console.log(`  offers that are an empty crate — no choice at all : ${pct(sample.trivial, offers)}  ${D(`${sample.trivial} of ${offers}`)}`);
console.log(`  ${B('rounds in which the player is asked anything')}     : ${B(pct(sample.roundsWithADecision, sample.rounds))}  ${D(`${sample.roundsWithADecision} of ${sample.rounds}`)}`);
console.log(`  rounds that are pure dead air                     : ${pct(sample.rounds - sample.roundsWithADecision, sample.rounds)}`);
const edge = knifeEdge();
console.log(`\n${B('Did the pacing do its job?')}`);
const heldOnDecisions = sample.dwellMsOnDecisions / Math.max(sample.dwellMsTotal, 1);
console.log(`  ${B('share of the waiting spent on a real choice')} : ${B(pct(sample.dwellMsOnDecisions, sample.dwellMsTotal))}`);
console.log(`  share of the OFFERS that are a real choice   : ${pct(sample.realDecisions, offers)}`);
console.log(
  D(`  The auctioneer spends ${(heldOnDecisions / (sample.realDecisions / offers)).toFixed(2)}x longer per decision than per empty crate.`),
);
console.log(
  D(`  knife edge: ${edge ? `${(edge.faceBp / 100).toFixed(2)}x at inch ${edge.inch}, ${R.toFixed(edge.gap, 5)} from the threshold, held ${dwellMs(edge.faceBp, edge.inch)} ms (tension ${tension(edge.faceBp, edge.inch).toFixed(2)})` : 'none'}`),
);

console.log(`\n${B('The Ghost Lot')}`);
console.log(`  shown after                                 : ${pct(sample.ghostsShown, sample.rounds)} of rounds  ${D('(never after a gutter)')}`);
console.log(`  …and was an empty crate                      : ${pct(sample.ghostsEmpty, sample.ghostsShown)}  ${D('the paytable says 66.9%')}`);
console.log(`  …and was worth more than what was claimed    : ${pct(sample.ghostsBetter, sample.ghostsShown)}`);
console.log(D('  Stated flatly, once, and it changes no payout.'));
console.log(
  D(`  demo RTP over ${sample.rounds.toLocaleString('en-US')} rounds: ${((Number(sample.returned) / Number(sample.staked)) * 100).toFixed(2)}% ` +
    `vs ${R.toPercent(solution.rtp, 2)}% closed form\n`),
);

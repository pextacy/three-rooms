/**
 * THE SURVEY's loop, played in a terminal.
 *
 * Not a test — a fixture for judging the LOOP, the twin of `npm run play`. It
 * plays the DP and a couple of human policies, prints a transcript of the first
 * few voyages exactly as the UI would phrase them, and then reports what a
 * session actually feels like: how often the evidence changes the call, how
 * often the player is asked anything at all, and whether the realised return
 * lands where the closed form says it should.
 *
 *   npm run play:survey -- 200
 */
import { createDemoSurveyHost, DEMO_OPENING_PURSE } from '../src/games/survey/app/bridge/demoHost';
import type { SurveyAction, SurveyHost, SurveyView } from '../src/games/survey/app/bridge/types';
import { CARGOES, MAX_SURVEYS, DECLINE_BP, cargoById, payoutBase, premiumBpAt } from '../src/games/survey/core/vessel';
import { posteriorSound } from '../src/games/survey/core/belief';
import { solve, optimalPolicy, bestCall } from '../src/games/survey/core/solve';
import { COPY, tallyPhrase } from '../src/games/survey/app/ui/copy';
import { dwellMs, tension, knifeEdge, bellHz } from '../src/games/survey/app/audio/voice';
import { formatAmount, formatValue, formatPremium } from '../src/games/survey/app/ui/format';
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
function nextView(host: SurveyHost, predicate: (v: SurveyView) => boolean): Promise<SurveyView> {
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

type Policy = 'optimal' | 'send-one-then-call' | 'call-it-blind' | 'send-everybody';

function decides(policy: Policy, cargoId: number, surveys: number, margin: number): SurveyAction {
  const cargo = cargoById(cargoId as Parameters<typeof cargoById>[0]);
  const call = (): SurveyAction => (bestCall(cargo, surveys, margin).call === 'UNDERWRITE' ? 'UNDERWRITE' : 'DECLINE');
  if (surveys >= MAX_SURVEYS) return call();

  switch (policy) {
    case 'optimal':
      return optimal(cargo, surveys, margin) ? 'SURVEY' : call();
    case 'send-one-then-call':
      return surveys < 1 ? 'SURVEY' : call();
    case 'send-everybody':
      return 'SURVEY';
    case 'call-it-blind':
      return call();
  }
}

type Tally = {
  voyages: number;
  staked: bigint;
  returned: bigint;
  surveys: number;
  underwritten: number;
  declined: number;
  cameHome: number;
  zero: number;
  /** States where one more report could still flip the call: evidence matters. */
  liveDecisions: number;
  /** States where the DP would call the same way whatever the next man said. */
  settledDecisions: number;
  /** States where the best two options are within 2% of each other in value. */
  tornStates: number;
  dwellMsWhenTorn: number;
  voyagesWithADecision: number;
  refills: number;
  dwellMsTotal: number;
  dwellMsOnDecisions: number;
  ghostsShown: number;
  ghostsAgreeing: number;
};

const emptyTally = (): Tally => ({
  voyages: 0, staked: 0n, returned: 0n, surveys: 0, underwritten: 0, declined: 0, cameHome: 0, zero: 0,
  liveDecisions: 0, settledDecisions: 0, tornStates: 0, dwellMsWhenTorn: 0, voyagesWithADecision: 0, refills: 0,
  dwellMsTotal: 0, dwellMsOnDecisions: 0, ghostsShown: 0, ghostsAgreeing: 0,
});

/**
 * Would one more report change the call?
 *
 * The honest measure of whether a state is a decision at all: if the DP calls
 * the same way at m+1 and at m-1, the evidence cannot matter and the player is
 * only being asked to spend a point and a half of premium to confirm it.
 */
function evidenceCouldFlip(cargoId: number, surveys: number, margin: number): boolean {
  if (surveys >= MAX_SURVEYS) return false;
  const cargo = cargoById(cargoId as Parameters<typeof cargoById>[0]);
  const up = bestCall(cargo, surveys + 1, margin + 1).call;
  const down = bestCall(cargo, surveys + 1, margin - 1).call;
  return up !== down;
}

async function play(policy: Policy, voyages: number, transcribe: boolean): Promise<Tally> {
  const host = createDemoSurveyHost({ seed: [0x1728, 0xc4, 0x5e, 0x11], randomnessDelayMs: 0 });
  const tally = emptyTally();

  for (let round = 0; round < voyages; round++) {
    const lines: string[] = [];
    let decisionsThisVoyage = 0;
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
        tally.voyages += 1;
        tally.surveys += session.surveys;
        tally.returned += session.payoutBase;
        if (decisionsThisVoyage > 0) tally.voyagesWithADecision += 1;
        if (session.call === 'UNDERWRITE') tally.underwritten += 1;
        else tally.declined += 1;
        if (session.wasSound === true) tally.cameHome += 1;
        if (session.payoutBase === 0n) tally.zero += 1;
        if (session.ghostReport !== null) {
          tally.ghostsShown += 1;
          // Did the man nobody sent agree with the call that was made?
          const leaned = session.margin >= 0 ? 'SOUND' : 'ROTTEN';
          if (session.ghostReport === leaned) tally.ghostsAgreeing += 1;
        }

        if (transcribe) {
          const declined = session.call === 'DECLINE';
          lines.push(
            `    ${declined ? COPY.declinedAt(session.surveys) : COPY.underwrittenAt(session.surveys)} ` +
              `${declined ? COPY.declineNote : session.wasSound ? COPY.cameHome : COPY.wasRotten} ` +
              `${session.payoutBase > 0n ? `${COPY.paid} ${formatAmount(session.payoutBase, DECIMALS)} CHIPS` : ''}`,
          );
          if (session.ghostReport !== null) {
            lines.push(`    ${D(`${COPY.ghostLabel} ${session.ghostReport}`)}`);
          }
          console.log(`  ${B(`Voyage ${round + 1}`)}`);
          for (const line of lines) console.log(line);
        }
        host.dealAgain();
        break;
      }

      if (session.cargoId === null) throw new Error('waiting-player with no manifest');
      const cargo = cargoById(session.cargoId);
      const action = decides(policy, session.cargoId, session.surveys, session.margin);
      const held = dwellMs(cargo, session.surveys, session.margin);
      const live = evidenceCouldFlip(session.cargoId, session.surveys, session.margin);

      tally.dwellMsTotal += held;
      if (live) {
        tally.liveDecisions += 1;
        tally.dwellMsOnDecisions += held;
        decisionsThisVoyage += 1;
      } else {
        tally.settledDecisions += 1;
      }
      // Torn is a different thing from live, and the pacing follows THIS one.
      if (tension(cargo, session.surveys, session.margin) >= 0.75) {
        tally.tornStates += 1;
        tally.dwellMsWhenTorn += held;
      }

      if (transcribe) {
        const sound = (session.surveys + session.margin) / 2;
        lines.push(
          `    ${cargo.name} ${formatValue(cargo.valueBp)} · ${COPY.surveysBought(session.surveys)} · ` +
            `${COPY.premiumRemaining} ${formatPremium(premiumBpAt(session.surveys))} · ` +
            `${tallyPhrase(sound, session.surveys - sound)} ` +
            D(
              `· P(sound) ${R.toFixed(posteriorSound(session.margin), 3)} · bell ${Math.round(bellHz(session.margin))} Hz · ` +
                `underwrite ${formatAmount(payoutBase(session.stakeBase, cargo.valueBp, session.surveys), DECIMALS)} / ` +
                `decline ${formatAmount(payoutBase(session.stakeBase, DECLINE_BP, session.surveys), DECIMALS)} · held ${held} ms`,
            ) +
            ` ${D(`-> ${action}`)}`,
        );
      }
      await host.submitAction(action);
    }
  }

  host.destroy();
  return tally;
}

console.log(`\n${B('THE SURVEY — the loop, played')}`);
console.log(
  D(`${ROUNDS} voyages per policy, ${formatAmount(STAKE, DECIMALS)} chips a voyage, purse opens at ${formatAmount(DEMO_OPENING_PURSE, DECIMALS)}\n`),
);

console.log(B('Transcript — the first voyages, worded exactly as the UI words them'));
await play('optimal', TRANSCRIBE, true);

console.log(`\n${B('What a session looks like')}`);
const policies: Policy[] = ['optimal', 'send-one-then-call', 'call-it-blind', 'send-everybody'];
for (const policy of policies) {
  const t = await play(policy, ROUNDS, false);
  const rtp = Number(t.returned) / Number(t.staked);
  console.log(
    `  ${policy.padEnd(22)} return ${(rtp * 100).toFixed(1).padStart(6)}%` +
      `   mean ${(t.surveys / t.voyages).toFixed(2)} surveys` +
      `   underwrote ${((t.underwritten / t.voyages) * 100).toFixed(0).padStart(3)}%` +
      `   nothing ${((t.zero / t.voyages) * 100).toFixed(0).padStart(3)}%` +
      D(`   (closed form ${R.toPercent(solution.rtp, 2)}% under optimal)`),
  );
}

const sample = await play('optimal', Math.max(ROUNDS, 20_000), false);
const pct = (a: number, b: number) => `${((a / b) * 100).toFixed(1)}%`;
const states = sample.liveDecisions + sample.settledDecisions;

console.log(`\n${B('Is there actually a decision to make?')}`);
console.log(D('  Two different questions, and they do not have the same answer.'));
console.log(
  `  states where one more report could flip the call : ${pct(sample.liveDecisions, states)}  ${D(`${sample.liveDecisions} of ${states} — the evidence is worth something`)}`,
);
console.log(
  `  states where the best two options are within 2%  : ${pct(sample.tornStates, states)}  ${D('— the player is genuinely torn')}`,
);
console.log(`  ${B('voyages in which the player is asked anything')}    : ${B(pct(sample.voyagesWithADecision, sample.voyages))}`);

console.log(`\n${B('Did the pacing do its job?')}`);
const edge = knifeEdge();
const meanTorn = sample.dwellMsWhenTorn / Math.max(sample.tornStates, 1);
const meanRest = (sample.dwellMsTotal - sample.dwellMsWhenTorn) / Math.max(states - sample.tornStates, 1);
console.log(D('  The hold is on the state where the PLAYER is torn, not on the one where the'));
console.log(D('  DP is loudest: when sending another man is obviously right, the room says so'));
console.log(D('  and gets out of the way. Same rule as CANDLE, same two constants.'));
console.log(`  ${B('mean hold where the two calls are within 2%')}   : ${B(`${meanTorn.toFixed(0)} ms`)}`);
console.log(`  mean hold everywhere else                     : ${meanRest.toFixed(0)} ms`);
console.log(`  ${D(`${(meanTorn / Math.max(meanRest, 1)).toFixed(2)}x longer on a state that is actually a coin toss`)}`);
console.log(
  D(
    `  knife edge: ${
      edge
        ? `${edge.cargo.name} at ${edge.surveys} survey${edge.surveys === 1 ? '' : 's'}, margin ${edge.margin > 0 ? `+${edge.margin}` : edge.margin}, ` +
          `held ${dwellMs(edge.cargo, edge.surveys, edge.margin)} ms (tension ${tension(edge.cargo, edge.surveys, edge.margin).toFixed(3)})`
        : 'none'
    }`,
  ),
);

console.log(`\n${B('The Ghost Report')}`);
console.log(`  shown after                                  : ${pct(sample.ghostsShown, sample.voyages)} of voyages  ${D('(never when all five had reported)')}`);
console.log(`  …and agreed with the way the reports leaned   : ${pct(sample.ghostsAgreeing, sample.ghostsShown)}`);
console.log(D('  Stated flatly, once, and it changes no payout.'));

console.log(`\n${B('And the manifest, as it actually came up')}`);
console.log(D(`  ${CARGOES.map(c => `${c.name} ${formatValue(c.valueBp)}`).join(' · ')}`));
console.log(
  D(
    `  demo RTP over ${sample.voyages.toLocaleString('en-US')} voyages: ${((Number(sample.returned) / Number(sample.staked)) * 100).toFixed(2)}% ` +
      `vs ${R.toPercent(solution.rtp, 2)}% closed form\n`,
  ),
);

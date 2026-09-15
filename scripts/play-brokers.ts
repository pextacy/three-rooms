/**
 * THE BROKERS' loop, played in a terminal.
 *
 * Not a test — a fixture for judging the LOOP, the twin of `npm run play` and
 * `npm run play:survey`. It plays Pandora's rule and three human policies,
 * prints a transcript of the first few claims exactly as the UI would phrase
 * them, and then reports what a session actually feels like: how often the
 * index disagrees with the rule a player would invent, how often the decision
 * is genuinely close, and whether the realised return lands where the closed
 * form says it should.
 *
 *   npm run play:brokers -- 200
 */
import { createDemoBrokersHost, DEMO_OPENING_PURSE } from '../src/games/brokers/app/bridge/demoHost';
import type { BrokersAction, BrokersHost, BrokersView } from '../src/games/brokers/app/bridge/types';
import { BROKER_LIST, PRICE_DENOM, brokerById, feesForMask, type BrokerId } from '../src/games/brokers/core/market';
import { askingOrder, reservationPrice, meanPrice } from '../src/games/brokers/core/weitzman';
import { solve, optimalPolicy, askFixed, askEverybody, takeTheHouse, type Policy } from '../src/games/brokers/core/solve';
import { COPY } from '../src/games/brokers/app/ui/copy';
import { formatPrice, formatFee, formatAmount } from '../src/games/brokers/app/ui/format';
import { dwellMs, tension, knifeEdge, priceHz } from '../src/games/brokers/app/audio/voice';
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
function nextView(host: BrokersHost, predicate: (v: BrokersView) => boolean): Promise<BrokersView> {
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

/**
 * Four ways a person actually plays this. "Ask the best average" is not among
 * them because on this market it collapses into "take the house" exactly — no
 * broker's average beats the house's worst price — and `verify:brokers`
 * already publishes both at 93.500%. A row that is a duplicate of another row
 * teaches nothing here.
 */
const POLICIES: ReadonlyArray<readonly [string, Policy]> = [
  ['the index', optimal],
  ['ask one, by index', askFixed(1)],
  ['ask everybody', askEverybody()],
  ['take the house', takeTheHouse()],
];

function decides(policy: Policy, mask: number, bestBp: number): BrokersAction {
  const broker = policy(mask, bestBp);
  if (broker === null || mask & (1 << broker.id)) return { kind: 'TAKE' };
  return { kind: 'ASK', brokerId: broker.id };
}

type Tally = {
  claims: number;
  staked: bigint;
  returned: bigint;
  asks: number;
  keptTheHouse: number;
  /** Claims that paid back more than was staked. */
  inProfit: number;
  /** States where the index and the obvious rule want different men. */
  disagreements: number;
  /** States where the best two options are within 2% of each other in value. */
  tornStates: number;
  states: number;
  dwellMsTotal: number;
  dwellMsWhenTorn: number;
  claimsWithADecision: number;
  refills: number;
  ghostsShown: number;
  /** Ghosts that would have beaten the price actually taken. */
  ghostsThatBeatIt: number;
};

const emptyTally = (): Tally => ({
  claims: 0, staked: 0n, returned: 0n, asks: 0, keptTheHouse: 0, inProfit: 0,
  disagreements: 0, tornStates: 0, states: 0, dwellMsTotal: 0, dwellMsWhenTorn: 0,
  claimsWithADecision: 0, refills: 0, ghostsShown: 0, ghostsThatBeatIt: 0,
});

/**
 * Does the theorem have teeth here?
 *
 * Only asked where the rule sends for somebody: the question is the ORDER, not
 * the stopping. A player who has decided to ask another man reaches for the one
 * whose prices average highest — and the index sends for somebody else.
 */
function indexDisagrees(mask: number, bestBp: number): boolean {
  const chosen = optimal(mask, bestBp);
  if (chosen === null) return false;
  const obvious = [...BROKER_LIST]
    .filter(broker => (mask & (1 << broker.id)) === 0)
    .sort((a, b) => R.compare(meanPrice(b), meanPrice(a)))[0];
  return obvious !== undefined && obvious.id !== chosen.id;
}

async function play(policy: Policy, claims: number, transcribe: boolean): Promise<Tally> {
  const host = createDemoBrokersHost({ seed: [0x4a11, 0xb0, 0x0c, 0x7d], randomnessDelayMs: 0 });
  const tally = emptyTally();

  for (let round = 0; round < claims; round++) {
    const lines: string[] = [];
    let decisionsThisClaim = 0;
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
      if (!session) throw new Error('lost the claim');

      if (session.isSettled) {
        tally.claims += 1;
        tally.asks += popcount(session.askedMask);
        tally.returned += session.payoutBase;
        if (decisionsThisClaim > 0) tally.claimsWithADecision += 1;

        const sold = session.named.find(n => n.priceBp === session.bestBp);
        if (sold?.brokerId === undefined || sold.brokerId === null) tally.keptTheHouse += 1;
        if (session.payoutBase > session.stakeBase) tally.inProfit += 1;
        if (session.ghost !== null) {
          tally.ghostsShown += 1;
          if (session.ghost.priceBp > session.bestBp) tally.ghostsThatBeatIt += 1;
        }

        if (transcribe) {
          const who = sold?.brokerId === null || sold?.brokerId === undefined ? null : brokerById(sold.brokerId).name;
          lines.push(
            `    ${who === null ? COPY.soldForHouse(formatPrice(session.bestBp)) : COPY.soldFor(formatPrice(session.bestBp), who)} ` +
              `${COPY.afterFees(formatFee(feesForMask(session.askedMask)))} ` +
              `${COPY.paid} ${formatAmount(session.payoutBase, DECIMALS)} CHIPS`,
          );
          if (session.ghost !== null) {
            lines.push(
              `    ${D(`${COPY.ghostLabel} ${formatPrice(session.ghost.priceBp)} ${brokerById(session.ghost.brokerId as BrokerId).name}`)}`,
            );
          } else {
            lines.push(`    ${D(COPY.ghostNone)}`);
          }
          console.log(`  ${B(`Claim ${round + 1}`)}`);
          for (const line of lines) console.log(line);
        }
        host.dealAgain();
        break;
      }

      const mask = session.askedMask;
      const best = session.bestBp;
      const action = decides(policy, mask, best);
      const held = dwellMs(mask, best);
      const torn = tension(mask, best) >= 0.75;

      tally.states += 1;
      tally.dwellMsTotal += held;
      if (torn) {
        tally.tornStates += 1;
        tally.dwellMsWhenTorn += held;
      }
      if (indexDisagrees(mask, best)) tally.disagreements += 1;
      if (action.kind === 'ASK') decisionsThisClaim += 1;

      if (transcribe) {
        const held_ = held;
        lines.push(
          `    ${COPY.holding} ${formatPrice(best)} ${
            session.named.length === 1 ? D(`(${COPY.theHouse})`) : D(`(${session.named.length} named)`)
          } · ${COPY.feesPaid} ${formatFee(feesForMask(mask))} · ${COPY.takeNow} ` +
            `${formatAmount(takeAmount(session.stakeBase, best, mask), DECIMALS)}` +
            D(
              ` · ${COPY.brokersLeft(BROKER_LIST.length - popcount(mask))} · tension ${tension(mask, best).toFixed(3)} · ` +
                `voice ${Math.round(priceHz(best))} Hz · held ${held_} ms`,
            ) +
            ` ${D(`-> ${action.kind === 'TAKE' ? 'SELL' : `${COPY.askPrefix} ${brokerById(action.brokerId).name}`}`)}`,
        );
      }
      await host.submitAction(action);
    }
  }

  host.destroy();
  return tally;
}

function takeAmount(stakeBase: bigint, bestBp: number, mask: number): bigint {
  const net = bestBp - feesForMask(mask);
  return net <= 0 ? 0n : (stakeBase * BigInt(net)) / BigInt(PRICE_DENOM);
}

function popcount(mask: number): number {
  let n = 0;
  for (let m = mask; m !== 0; m &= m - 1) n += 1;
  return n;
}

console.log(`\n${B('THE BROKERS — the loop, played')}`);
console.log(
  D(`${ROUNDS} claims per policy, ${formatAmount(STAKE, DECIMALS)} chips a claim, purse opens at ${formatAmount(DEMO_OPENING_PURSE, DECIMALS)}\n`),
);

console.log(B('Transcript — the first claims, worded exactly as the UI words them'));
await play(optimal, TRANSCRIBE, true);

console.log(`\n${B('What a session looks like')}`);
for (const [name, policy] of POLICIES) {
  const t = await play(policy, ROUNDS, false);
  const rtp = Number(t.returned) / Number(t.staked);
  console.log(
    `  ${name.padEnd(22)} return ${(rtp * 100).toFixed(1).padStart(6)}%` +
      `   mean ${(t.asks / t.claims).toFixed(2)} asked` +
      `   kept the house ${((t.keptTheHouse / t.claims) * 100).toFixed(0).padStart(3)}%` +
      `   in profit ${((t.inProfit / t.claims) * 100).toFixed(0).padStart(3)}%` +
      D(`   (closed form ${R.toPercent(solution.rtp, 2)}% under the index)`),
  );
}

const sample = await play(optimal, Math.max(ROUNDS, 20_000), false);
const pct = (a: number, b: number) => `${((a / Math.max(b, 1)) * 100).toFixed(1)}%`;

console.log(`\n${B('Is there actually a decision to make?')}`);
console.log(D('  Two different questions, and they do not have the same answer.'));
console.log(
  `  states where the index sends for a different man   : ${pct(sample.disagreements, sample.states)}  ${D(`${sample.disagreements} of ${sample.states} — the theorem has teeth`)}`,
);
console.log(
  `  states where the best two options are within 2%    : ${pct(sample.tornStates, sample.states)}  ${D('— the player is genuinely torn')}`,
);
console.log(`  ${B('claims in which the player sends for anybody')}      : ${B(pct(sample.claimsWithADecision, sample.claims))}`);

console.log(`\n${B('Did the pacing do its job?')}`);
const edge = knifeEdge();
const meanTorn = sample.dwellMsWhenTorn / Math.max(sample.tornStates, 1);
const meanRest = (sample.dwellMsTotal - sample.dwellMsWhenTorn) / Math.max(sample.states - sample.tornStates, 1);
console.log(D('  The hold is on the state where the PLAYER is torn, not on the one where the'));
console.log(D('  DP is loudest: when sending for another man is obviously right, the room says'));
console.log(D('  so and gets out of the way. Same rule as CANDLE, same two constants.'));
console.log(`  ${B('mean hold where the two options are within 2%')}   : ${B(`${meanTorn.toFixed(0)} ms`)}`);
console.log(`  mean hold everywhere else                       : ${meanRest.toFixed(0)} ms`);
console.log(`  ${D(`${(meanTorn / Math.max(meanRest, 1)).toFixed(2)}x longer on a state that is actually a coin toss`)}`);
console.log(
  D(
    `  knife edge: ${
      edge
        ? `${popcount(edge.mask)} asked, holding ${formatPrice(edge.bestBp)}, held ${dwellMs(edge.mask, edge.bestBp)} ms (tension ${edge.tension.toFixed(3)})`
        : 'none'
    }`,
  ),
);

console.log(`\n${B('The Ghost Price')}`);
console.log(`  shown after                                     : ${pct(sample.ghostsShown, sample.claims)} of claims  ${D('(never when every man was asked)')}`);
console.log(`  …and would have beaten the price taken           : ${pct(sample.ghostsThatBeatIt, sample.ghostsShown)}`);
console.log(D('  Stated flatly, once, and it changes no payout.'));

console.log(`\n${B('And the floor, in the order the index asks it')}`);
for (const broker of askingOrder()) {
  console.log(
    D(
      `  ${broker.name.padEnd(11)} fee ${formatFee(broker.feeBp).padStart(6)}   index ${R.toFixed(reservationPrice(broker), 4)}×   ` +
        `average ${R.toFixed(meanPrice(broker), 4)}×   ${broker.quotes.map(q => `${formatPrice(q.priceBp)}`).join(' / ')}`,
    ),
  );
}
console.log(
  D(
    `  demo RTP over ${sample.claims.toLocaleString('en-US')} claims: ${((Number(sample.returned) / Number(sample.staked)) * 100).toFixed(2)}% ` +
      `vs ${R.toPercent(solution.rtp, 2)}% closed form\n`,
  ),
);

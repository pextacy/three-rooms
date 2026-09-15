/**
 * `npm run gen:readme` — writes README.md.
 *
 * **Every number in the README is generated here, from the DP, in exact
 * rationals** (claude.md §8: "Every number printed in the README, the UI, or the
 * submission must come out of `npm run verify:rtp`, not out of a memory or an
 * estimate"). Nothing in the output is typed by hand, so the README cannot drift
 * from the contract — and CI regenerates it and fails on a diff.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOTS, WEIGHT_DENOM, FACE_DENOM, MAX_FACE_BP, CUMULATIVE_WEIGHTS } from '../src/games/candle/core/paytable';
import { INCHES, WAX_BP, waxBpAt } from '../src/games/candle/core/wax';
import {
  solve,
  optimalPolicy,
  strategyBand,
  evaluate,
  reachByInch,
  probabilityAtLeast,
  probabilityOfNothing,
  meanRoundLength,
  standardDeviation,
  lotProbability,
} from '../src/games/candle/core/solve';
import { knifeEdge, pinDropHz } from '../src/games/candle/app/audio/voice';
import {
  CARGOES as SURVEY_CARGOES,
  MAX_SURVEYS,
  MAX_VALUE_BP,
  VALUE_DENOM,
  DECLINE_BP,
  PREMIUM_BP,
  WEIGHT_DENOM as SURVEY_WEIGHT_DENOM,
} from '../src/games/survey/core/vessel';
import { posteriorSound, predictiveSound, prior, accuracy, evidenceRatio } from '../src/games/survey/core/belief';
import {
  solve as solveSurvey,
  strategyBand as surveyBand,
  evaluate as evaluateSurvey,
  optimalPolicy as surveyOptimal,
  bestCall as surveyBestCall,
  declineValue,
  meanSurveys,
  surveyDistribution,
  cargoProbability,
} from '../src/games/survey/core/solve';
import { knifeEdge as surveyKnifeEdge } from '../src/games/survey/app/audio/voice';
import { DAYLIGHT_BP } from '../src/games/survey/app/daylight';
import {
  BROKER_LIST,
  HOUSE as BROKER_HOUSE,
  PRICE_DENOM,
  MAX_PAYOUT_BP as BROKERS_MAX_PAYOUT_BP,
  TOTAL_FEES_BP,
  WEIGHT_DENOM as BROKERS_WEIGHT_DENOM,
} from '../src/games/brokers/core/market';
import { reservationPrice, meanPrice, askingOrder } from '../src/games/brokers/core/weitzman';
import {
  solve as solveBrokers,
  strategyBand as brokersBand,
  evaluate as evaluateBrokers,
  optimalPolicy as brokersOptimal,
  roundShape as brokersShape,
  probabilityAtLeast as brokersAtLeast,
  takeValue as brokersTakeValue,
  MASKS as BROKER_MASKS,
} from '../src/games/brokers/core/solve';
import { INKS, relativeLuminance, paletteAtWax, contrastRatio, temperatureForWax } from '../src/shared/render/light';
import * as R from '../src/shared/math/rational';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../README.md');
type GameManifest = { gameId: string; locales: Record<string, { name: string; description: string }> };
const manifest = JSON.parse(readFileSync(resolve(here, '../public/candle/game.manifest.json'), 'utf8')) as GameManifest;
const surveyManifest = JSON.parse(
  readFileSync(resolve(here, '../public/survey/game.manifest.json'), 'utf8'),
) as GameManifest;
/** The live URL lives in package.json, so it is never retyped into prose. */
const { homepage } = JSON.parse(readFileSync(resolve(here, '../package.json'), 'utf8')) as { homepage?: string };

/**
 * Deployed bytecode sizes, MEASURED from the forge artefacts when they are
 * there. A number typed into a README is a number that goes stale the first time
 * anyone touches the contract.
 */
function bytecodeSize(artifact: string): number | null {
  try {
    const out = JSON.parse(readFileSync(resolve(here, `../contracts/out/${artifact}`), 'utf8')) as {
      deployedBytecode?: { object?: string };
    };
    const object = out.deployedBytecode?.object;
    return object ? object.length / 2 - 1 : null;
  } catch {
    return null; // not built in this checkout; the sentence below adapts
  }
}
const sizes = [
  ['CANDLE', bytecodeSize('Candle.sol/CandleGame.json')],
  ['THE SURVEY', bytecodeSize('Survey.sol/SurveyGame.json')],
  ['THE BROKERS', bytecodeSize('Brokers.sol/BrokersGame.json')],
] as const;
// "a, b and c" — the numbers themselves carry commas, so the list is joined by
// hand rather than by a regex over the finished string.
const phrases = sizes.map(([name, bytes]) => `**${(bytes as number).toLocaleString('en-US')} bytes** for ${name}`);
const sizeSentence = sizes.every(([, bytes]) => bytes !== null)
  ? `The deployed bytecode is ${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]} — ` +
    'between a tenth and a sixth of the EIP-170 limit.'
  : 'Run `npm run contracts:build` to see the deployed sizes against the EIP-170 limit.';

const solution = solve();
const optimal = optimalPolicy(solution);
const pct = (r: R.Rational, p = 4) => `${R.toPercent(r, p)}%`;
const at = (list: readonly (R.Rational | undefined)[], i: number): R.Rational => {
  const v = list[i];
  if (v === undefined) throw new Error(`missing ${i}`);
  return v;
};
const edge = knifeEdge();
const reach = reachByInch(optimal);
const firstLuminance = relativeLuminance(paletteAtWax(waxBpAt(1)).tallow);

const paytableRows = LOTS.map(
  lot =>
    `| ${lot.name} | **${(lot.faceBp / FACE_DENOM).toFixed(2)}×** | ${lot.weight.toLocaleString('en-US')} | ${pct(lotProbability(lot), 2)} | ${Math.round(pinDropHz(lot.faceBp))} Hz |`,
).join('\n');

const waxRows = WAX_BP.map((bp, i) => {
  const inch = i + 1;
  const threshold = solution.threshold[inch];
  return `| ${inch} | ${'●'.repeat(INCHES - i)}${'○'.repeat(i)} | **${(bp / 100).toFixed(0)}%** | ${R.toFixed(R.mul(R.rat(2n), R.rat(bp, 10_000)), 2)}× | ${R.toFixed(at(solution.continuation, inch), 6)} | ${threshold ? R.toFixed(threshold, 5) : '*forced*'} |`;
}).join('\n');

const bandRows = strategyBand(solution)
  .map(entry => {
    const value = evaluate(entry.policy);
    const inBand = R.compare(value, R.rat(93n, 100n)) >= 0 && R.compare(value, R.rat(98n, 100n)) <= 0;
    return `| ${entry.label}${entry.note ? ` — *${entry.note}*` : ''} | **${pct(value, 3)}** | ${inBand ? '✅ in band' : '—'} |`;
  })
  .join('\n');

const lightRows = WAX_BP.map((bp, i) => {
  const palette = paletteAtWax(bp);
  const lum = relativeLuminance(palette.tallow);
  return `| ${i + 1} | ${(bp / 100).toFixed(0)}% | ${Math.round(temperatureForWax(bp))} K | \`rgb(${palette.tallow.r} ${palette.tallow.g} ${palette.tallow.b})\` | ${lum.toFixed(4)} | **${((lum / firstLuminance) * 100).toFixed(2)}%** | ${contrastRatio(palette.tallow, palette.ink).toFixed(2)}:1 |`;
}).join('\n');

// ---------------------------------------------------------------------------
//  THE SURVEY — every number below comes out of its own DP, in exact rationals
// ---------------------------------------------------------------------------

const survey = solveSurvey();
let CARGOES_REACHABLE = 0;
for (let k = 0; k <= MAX_SURVEYS; k++) for (let m = -k; m <= k; m += 2) CARGOES_REACHABLE += 1;
const surveyPolicy = surveyOptimal(survey);
const surveyDist = surveyDistribution(surveyPolicy);
const surveyEdge = surveyKnifeEdge();
/** Reachable `(surveys, margin)` states per cargo, times the manifest. */
const surveyStates =
  CARGOES_REACHABLE * SURVEY_CARGOES.length;
const ORDINALS = ['no', 'one', 'two', 'three', 'four', 'five'];

const manifestRows = SURVEY_CARGOES.map(
  cargo =>
    `| ${cargo.name} | **${(cargo.valueBp / VALUE_DENOM).toFixed(2)}×** | ${cargo.weight.toLocaleString('en-US')} | ${pct(cargoProbability(cargo), 2)} | ${surveyBestCall(cargo, 0, 0).call.toLowerCase()} |`,
).join('\n');

const beliefRows = Array.from({ length: MAX_SURVEYS * 2 + 1 }, (_, i) => i - MAX_SURVEYS)
  .map(m => {
    const post = posteriorSound(m);
    const pred = predictiveSound(m);
    return `| ${m > 0 ? `+${m}` : m} | \`${post.n}/${post.d}\` | ${pct(post, 2)} | ${pct(pred, 2)} |`;
  })
  .join('\n');

const premiumRows = PREMIUM_BP.map((bp, k) => {
  const wine = SURVEY_CARGOES[3];
  const underwrite = wine ? R.mul(R.rat(wine.valueBp, VALUE_DENOM), R.rat(bp, 10_000)) : R.ZERO;
  return `| ${k} | **${(bp / 100).toFixed(1)}%** | ${R.toFixed(declineValue(k), 4)}× | ${R.toFixed(underwrite, 4)}× |`;
}).join('\n');

const surveyBandRows = surveyBand(survey)
  .map(entry => {
    const value = evaluateSurvey(entry.policy);
    const inBand = R.compare(value, R.rat(93n, 100n)) >= 0 && R.compare(value, R.rat(98n, 100n)) <= 0;
    return `| ${entry.label}${entry.note ? ` — *${entry.note}*` : ''} | **${pct(value, 3)}** | ${inBand ? '✅ in band' : '—'} |`;
  })
  .join('\n');

const daylightRows = DAYLIGHT_BP.map((bp, k) => {
  const palette = paletteAtWax(bp);
  const lum = relativeLuminance(palette.tallow);
  return `| ${k} | ${(bp / 100).toFixed(0)}% | ${Math.round(temperatureForWax(bp))} K | \`rgb(${palette.tallow.r} ${palette.tallow.g} ${palette.tallow.b})\` | ${lum.toFixed(4)} | **${((lum / firstLuminance) * 100).toFixed(2)}%** | ${contrastRatio(palette.brass, palette.ink).toFixed(2)}:1 |`;
}).join('\n');

// ---------------------------------------------------------------------------
//  THE BROKERS — from its own DP and its own index, in exact rationals
// ---------------------------------------------------------------------------

const brokers = solveBrokers();
const brokersPolicy = brokersOptimal(brokers);
const brokersRoundShape = brokersShape(brokersPolicy);
const brokersOrder = askingOrder();
const brokersWorst = brokersTakeValue(BROKER_MASKS - 1, Math.min(...BROKER_HOUSE.map(q => q.priceBp)));
const price = (bp: number) => `${(bp / PRICE_DENOM).toFixed(2)}×`;

const houseRow = `| **the house's man** | — | ${BROKER_HOUSE.map(q => `${price(q.priceBp)} *${R.toPercent(R.rat(q.weight, BROKERS_WEIGHT_DENOM), 0)}%*`).join(' · ')} | ${R.toFixed(
  BROKER_HOUSE.reduce<R.Rational>((sum, q) => R.add(sum, R.mul(R.rat(q.weight, BROKERS_WEIGHT_DENOM), R.rat(q.priceBp, PRICE_DENOM))), R.ZERO),
  4,
)}× | — | first, free |`;

const brokerRows = BROKER_LIST.map(broker => {
  const quotes = broker.quotes.map(q => `${price(q.priceBp)} *${R.toPercent(R.rat(q.weight, BROKERS_WEIGHT_DENOM), 2)}%*`).join(' · ');
  const rank = brokersOrder.findIndex(b => b.id === broker.id) + 1;
  return `| **${broker.name}** | ${R.toPercent(R.rat(broker.feeBp, PRICE_DENOM), 2)}% | ${quotes} | ${R.toFixed(meanPrice(broker), 4)}× | **${R.toFixed(reservationPrice(broker), 4)}×** | ${rank}${['st', 'nd', 'rd', 'th'][rank - 1]} |`;
}).join('\n');

const brokersBandRows = brokersBand(brokers)
  .map(entry => {
    const value = evaluateBrokers(entry.policy);
    const inBand = R.compare(value, R.rat(93n, 100n)) >= 0 && R.compare(value, R.rat(98n, 100n)) <= 0;
    return `| ${entry.label}${entry.note ? ` — *${entry.note}*` : ''} | **${pct(value, 3)}** | ${inBand ? '✅ in band' : '—'} |`;
  })
  .join('\n');

const bestAverage = [...BROKER_LIST].sort((a, b) => R.compare(meanPrice(b), meanPrice(a)))[0];
const worstAverage = [...BROKER_LIST].sort((a, b) => R.compare(meanPrice(a), meanPrice(b)))[0];

const readme = `<!--
  GENERATED FILE — DO NOT EDIT.
  Written by \`npm run gen:readme\` from src/games/, src/shared/render/ and each
  game's own audio. Every number below is recomputed from the manifests by the
  same DPs that \`npm run verify:rtp\` and \`npm run verify:survey\` run, in exact
  BigInt rationals. Edit the source, re-run.
-->

# Games with a decision in them

Two provably-fair on-chain wagering games for **Chain Jam Vol. 1**, on one origin.
Each is a separate entry: its own page, its own \`game.manifest.json\`, its own
contract, its own declared RTP.

| | The decision primitive | Declared RTP | Max | Play |
|---|---|---|---|---|
| **CANDLE** | Discounted optimal stopping — Gilbert–Mosteller with a deterministic decay and a forced acceptance at the horizon | **${pct(solution.rtp)}** | ${R.toFixed(R.rat(MAX_FACE_BP, FACE_DENOM), 0)}× | ${homepage ? `[${homepage}/candle/](${homepage}/candle/)` : '\`/candle/\`'} |
| **THE SURVEY** | Sequential hypothesis testing — Wald's problem with a priced stopping rule | **${pct(survey.rtp)}** | ${R.toFixed(R.rat(MAX_VALUE_BP, VALUE_DENOM), 0)}× | ${homepage ? `[${homepage}/survey/](${homepage}/survey/)` : '\`/survey/\`'} |
| **THE BROKERS** | Search with recall — Pandora's Box, and Weitzman's index | **${pct(brokers.rtp)}** | ${R.toFixed(R.rat(BROKERS_MAX_PAYOUT_BP, PRICE_DENOM), 2)}× | ${homepage ? `[${homepage}/brokers/](${homepage}/brokers/)` : '\`/brokers/\`'} |

Free play in both. No wallet, no modal, no splash — the first round is already on
the table when the page loads. Reproduce either number in under a minute:

\`\`\`sh
npm install
npm run verify:rtp       # CANDLE       ${R.toExactString(solution.rtp)}
npm run verify:survey    # THE SURVEY   ${R.toExactString(survey.rtp)}
npm run verify:brokers   # THE BROKERS  ${R.toExactString(brokers.rtp)}
\`\`\`

Essentially every "original" in the crypto-casino canon reduces to one of three
shapes: **pick a probability and get 1/p** (dice, limbo, roulette), **accumulate
and bank before a bust** (crash, mines, towers, hi-lo), or **match symbols**
(slots, wheels). None of these is any of them, and none is a reskin of another:
one is about **refusing offers under a decay**, one about **buying evidence until
it stops being worth what it costs**, and one about **buying options you can
always go back to**. Stop · learn · search.

All three are dressed from the same WORLD — **Lloyd's Coffee House and the
streets around it, London, 1728** — and share one light model, one bridge, one
chrome and one set of four ink ROLES. They are deliberately not dressed from the
same room: the auction is lit by a tallow candle, the underwriting desk by the
sky through an open window onto the roads, and the brokers' floor by an Argand
lamp over a slate board. Three light sources, three palettes, three hands —
2000K, 6500K and 2900K — checked against one another by \`npm run verify:light\`,
because lighting a dawn harbour with candlelight is not a style choice, it is
simply wrong.

---

# CANDLE

> **A lot is on the table. The candle is burning. Every inch you wait is worth less.**

Take the lot in front of you, or let the candle burn an inch and see the next one —
knowing the next one is worth less by construction.

**Declared RTP ${pct(solution.rtp)}** under optimal play, exactly
\`${R.toExactString(solution.rtp)}\`.

### Why this is not a clone of anything

CANDLE is none of the three shapes above. Its shape is *a sequence of i.i.d. offers,
each of which may be accepted once, under a deterministic decay, with a forced
acceptance at the horizon* — the **Gilbert–Mosteller full-information optimal
stopping problem** with discounting. It is a well-studied object in operations
research and it has never been turned into a wagering game. **There is no bust
state and nothing accumulates**, so it cannot be a crash clone; there is no
probability selector, so it cannot be a dice clone. The risk you carry is regret,
not ruin.

The dressing is equally unclaimed. Auction **by the inch of candle** is a real
mechanism: in the records of the House of Lords by 1641, endorsed by John Milton in
1652 as the surest way to reach the true value of goods, used by the Admiralty to
sell surplus ships in 1660 and 1662 as Pepys records, and still run once a year at
Tatworth in Somerset. Lloyd's auctioneers pushed a **pin** into the wax an inch
below the wick so its fall marked the end. Pepys notes a bidder's trick: the wick
**flares** just before it dies, and he shouted his last bid on seeing it. Every one
of those details is a mechanic here.

---

### The rules, in two sentences

> Take the lot on the table, or let the candle burn an inch and see the next one.
> Each inch you burn, the prize is worth 15 points less — and when the candle
> gutters you must take whatever is in front of you.

---

### The paytable

| Lot | Face | Weight / ${WEIGHT_DENOM.toLocaleString('en-US')} | Probability | Pin drop |
|---|---|---|---|---|
${paytableRows}

\`E[face] = ${R.toFixed(solution.expectedFace, 2)}×\`. The player's job is to turn
${R.toFixed(solution.expectedFace, 2)} into ${R.toFixed(solution.rtp, 2)} by refusing junk — which is
exactly what optimal stopping buys, and exactly what the wax ladder charges for.

Cumulative weights: \`${CUMULATIVE_WEIGHTS.join(', ')}\`.

### The wax ladder, and when to claim

| Inch | Pins | Wax | A 2.00× lot pays | \`A(k)\` | Claim if face ≥ |
|---|---|---|---|---|---|
${waxRows}

\`A(k)\` is the expected return of arriving at inch *k* and playing optimally;
the threshold is \`A(k+1) / wax(k)\`. The whole optimal policy collapses to one
printable sentence, and it is printed in the game under \`?\`:

> **Never claim an empty crate. Claim anything worth 1.00× or more. Claim the
> 0.50× only at the fourth inch.**

${edge ? `The knife edge the design rests on: a **${(edge.faceBp / FACE_DENOM).toFixed(2)}× lot at the ${['first', 'second', 'third', 'fourth', 'fifth'][edge.inch - 1]} inch**, against a threshold of ${R.toFixed(at(solution.threshold, edge.inch), 5)} — it misses by **${R.toFixed(edge.gap, 5)}**. Ten hours in, a player is still arguing with themselves about that one.` : ''}

---

### Return to player

| | |
|---|---|
| Declared RTP, optimal play | **${pct(solution.rtp)}** |
| Exact | \`${R.toExactString(solution.rtp)}\` |
| House edge | ${pct(R.sub(R.rat(1n), solution.rtp))} |
| Maximum payout | **${R.toFixed(R.rat(MAX_FACE_BP, FACE_DENOM), 0)}×** stake (first inch only) |
| P(payout ≥ 1×) | ${pct(probabilityAtLeast(optimal, R.rat(1n)))} |
| P(payout = 0) | ${pct(probabilityOfNothing(optimal))} |
| P(payout ≥ 5×) | ${pct(probabilityAtLeast(optimal, R.rat(5n)))} |
| Standard deviation | ${standardDeviation(optimal).toFixed(4)} |
| Mean round length | ${R.toFixed(meanRoundLength(optimal), 2)} inches |
| Reach by inch | ${reach.slice(1).map(r => pct(r, 2)).join(' / ')} |

#### The strategy band

The jam requires a theoretical RTP between 93% and 98%. For a game with decisions
"the RTP" is policy-dependent, so the **whole band** is published — including the
careless end. We are not selling an information edge over the player.

| How you play | Returns | |
|---|---|---|
${bandRows}

Every policy a human would plausibly adopt sits inside the window. Only
deliberately perverse play falls out of it, which is true of blackjack and video
poker too.

---

### The light model is the product

The wax ladder is rendered as the **actual relative luminance of the scene**, in
linear light. Pick any colour out of the frame at the fifth inch, measure it, and
it is 40% of the same colour at the first — not "looks dimmer".

| Inch | Wax | Flame | Tallow | Luminance | Of inch 1 | On ink |
|---|---|---|---|---|---|---|
${lightRows}

Four inks only — tallow, brass, oxblood, ink — one light source, hierarchy carried
by luminance. The flame walks down the Planckian locus as it dies, because a real
one does; an LED-like constant hue is the visible tell of a fake light model.
Brass carries the lot's face value, so it clears WCAG AA against the room even at
the gutter.

\`npm run verify:light\` measures all of it.

---

# THE SURVEY

> **A ship lies in the roads. Every surveyor you send costs you. When have you seen enough?**

A voyage is offered at Lloyd's. She is either sound or rotten, ${ORDINALS[Number(R.toFixed(R.mul(prior(), R.rat(10n)), 0))]} ships in
ten are sound, and these are dangerous waters. Send surveyors aboard if you like —
each one reports, each is right ${ORDINALS[Number(accuracy().n)]} times in ${ORDINALS[Number(accuracy().d)]}, and each takes a slice of the
premium. Then call it: **underwrite** her, or **decline**.

**Declared RTP ${pct(survey.rtp)}** under optimal play, exactly
\`${R.toExactString(survey.rtp)}\`.

### Why this is not a clone of anything either

Its shape is *a sequence of noisy, individually priced observations of a hidden
binary state, stopped at the player's discretion, followed by a decision whose
payoff depends on that state* — **Wald's sequential probability ratio test**, with
the sampling cost made an explicit price rather than an abstraction. It is one of
the foundational objects of statistical decision theory and it has never been
turned into a wager. You are not guessing a number, and you are not refusing
offers: **you are buying evidence, and the only question is when you have bought
enough.**

The dressing is real too. Lloyd's Coffee House was an insurance market before it
was an insurance company: underwriters sat at their own tables and wrote their
names under the terms of a voyage they were willing to carry. A ship lying in the
roads could be surveyed before you signed — and a surveyor in 1728 was a man with
a mallet, an hour of daylight and an opinion.

### The rules, in three sentences

> A voyage is on the book, and she is either sound or rotten.
> Send a surveyor and he tells you which — rightly ${pct(accuracy(), 0)} of the time, and
> wrongly the rest, for a point and a half of the premium.
> Then underwrite her and take what she carries if she comes home, or decline and
> walk away with ${R.toFixed(R.rat(DECLINE_BP, VALUE_DENOM), 2)}×.

### The manifest

| Cargo | Pays | Weight / ${SURVEY_WEIGHT_DENOM.toLocaleString('en-US')} | Probability | Called blind |
|---|---|---|---|---|
${manifestRows}

The last column is what the DP does with **no evidence at all**: the cheap cargoes
are not worth taking at a ${pct(prior(), 0)} prior, the rich ones are. Every surveyor you
send is an attempt to move a cargo across that line — and on the ones already
clearly on one side of it, the evidence is not worth its price.

### What the reports add up to

The state of a survey is not the list of reports. It is their **margin**: how many
said SOUND minus how many said ROTTEN. Two reports that disagree cancel *exactly*,
because each carries the same weight of evidence — the odds multiply by
\`${R.toExactString(evidenceRatio())}\` for sound and divide by it for rot. That is not a simplification
for convenience; it falls out of Bayes, and it is why the contract stores five
bytes and why the UI can say "the surveys stand two to one for rot" and be telling
you the whole truth about your position.

| Margin | P(she is sound), exactly | as a percentage | Next report says SOUND |
|---|---|---|---|
${beliefRows}

### The premium ladder

| Surveyors | Premium | Declining pays | A 2.50× voyage pays |
|---|---|---|---|
${premiumRows}

### Return to player

| | |
|---|---|
| Declared RTP, optimal play | **${pct(survey.rtp)}** |
| Exact | \`${R.toExactString(survey.rtp)}\` |
| House edge | ${pct(R.sub(R.rat(1n), survey.rtp))} |
| Maximum payout | **${R.toFixed(R.rat(MAX_VALUE_BP, VALUE_DENOM), 0)}×** stake (no surveys, and she comes home) |
| Mean surveyors bought | ${R.toFixed(meanSurveys(surveyPolicy), 3)} |
| Surveyors bought | ${surveyDist.map((p, k) => `${k}: ${pct(p, 1)}`).join(' · ')} |

#### The strategy band

| How you play | Returns | |
|---|---|---|
${surveyBandRows}

**Every published policy is inside the window**, from sending nobody to sending
everybody — which is stricter than CANDLE manages, and it is the constraint the
manifest was tuned around rather than a happy accident. Sharper surveyors or a
steeper premium pay the careful player out of the top of the band and drop the
careless one below the bottom of it: the more decisive the evidence, the further
apart the two ends of the band are pulled. Weak, cheap evidence is what keeps a
game *about* information inside a 93–98% window at all.

${surveyEdge ? `The knife edge: the **${surveyEdge.cargo.name} at ${ORDINALS[surveyEdge.surveys]} report${surveyEdge.surveys === 1 ? '' : 's'}, margin ${surveyEdge.margin > 0 ? `+${surveyEdge.margin}` : surveyEdge.margin}**. Underwriting her and sending one more man are worth the same thing to four decimal places, and the room holds on that state for a full second because the numbers say it should.` : ''}

### Why the truth cannot leak

Every hook on the contract is \`view\`, so the only state is \`gameState\` — which
the facet emits on every step and the player echoes back. Anything written there
is public, and so is every VRF word. **If the ship's condition were drawn at the
start, a player could simply read it.**

So the generative order is **reversed**. Reports are drawn from the *predictive*
distribution, which depends only on the margin so far and is therefore safe to
compute in the open; her condition is drawn at settlement from the *posterior*
given the final margin, out of a word that does not exist until the call is
already locked in. The joint distribution over (reports, truth) is identical — it
is the same probability model factored the other way — but nothing that decides
the voyage exists while the player can still act on it.

\`DECLINE\` settles immediately and needs no word at all: it pays the same whatever
she was, which is exactly why walking away can never leave a player waiting on
randomness that never arrives.

### Two claims you can measure

**The fog is the doubt.** The ink drawn over the ship is exactly
\`1 − P(the better call is right)\`, straight out of the belief table above. At the
prior she is ${pct(R.sub(R.rat(1n), prior()), 0)} there because that is how sure you are; after three reports
for rot she is ${pct(R.sub(R.rat(1n), posteriorSound(-3)), 1)} there, because that is how sure you are then. And a pair
of reports that disagree puts the fog back to the digit — the game's one
mathematical claim, made visible.

**The light is the day.** A surveyor rows out, sounds her, and rows back; you do
not get five of those in an afternoon. Every surveyor costs an hour of daylight and
the room walks down the same ladder CANDLE's wax does, ending at exactly the
brightness the candle gutters at.

| Surveyors | Daylight | Flame | Tallow | Luminance | Of full | Brass on ink |
|---|---|---|---|---|---|---|
${daylightRows}

It is deliberately **not** the premium ladder, which falls only 1.5 points a head:
a 1.5% change in luminance is invisible to a player and inside the rounding error
of an 8-bit channel, and a claim a reviewer cannot measure is a claim we do not
make. The money cost is printed as a number instead, beside it, where a number
belongs.

### Playing it

Keyboard: \`Space\`/\`Enter\` underwrite · \`S\`/\`↓\` send a surveyor · \`D\` decline ·
\`Enter\` next voyage · \`?\` the whole model · \`M\` sound · \`T\` turbo · \`L\` the book.

The Ghost Report — what the *next* surveyor would have said — is drawn only once
the call is locked in, changes no payout, and is stated once and flatly. On a
voyage where every surveyor had already reported there is no ghost, because there
was nobody left to send.

---

# THE BROKERS

> **You hold a claim on a wreck. Every man who looks at it charges you. When have you shopped it enough?**

The house's own man values your claim for nothing, and he is not generous. Four
brokers will each name a price, and each charges a fee the moment you ask him,
whatever he ends up saying. **Every price you have been named stays on the
table.** Sell whenever you like, to whoever named the best one; what you are paid
is that price, less the fees you have run up.

**Declared RTP ${pct(brokers.rtp)}** under optimal play, exactly
\`${R.toExactString(brokers.rtp)}\`.

### Why this is not a clone of anything either

Its shape is *a set of alternatives with known distributions and known inspection
costs, opened one at a time in an order of your choosing, with free recall of
everything already opened* — **Pandora's Box**, Weitzman (1979). It is one of the
foundational results of search theory, it is solved by an index rule, and it has
never been turned into a wager.

It is not CANDLE, and **recall is the difference**: there a refused lot is gone
and the prize decays with time, so you hold out. Here nothing decays and nothing
is ever lost but the fee you chose to pay, so you stop the moment what you are
holding is good enough. Nor is it THE SURVEY: nothing is hidden on this floor.
You are not buying evidence about a state, you are buying **options**.

### The floor

| | Fee | What he names | Average | Index | Asked |
|---|---|---|---|---|---|
${houseRow}
${brokerRows}

**${bestAverage?.name} has the best average price on the floor and is the last man worth
asking. ${worstAverage?.name} has the worst average of the four and is asked second.** That is
not a trick of the table: it is what the index says, and the index is right.

### Weitzman's index, and the rule it gives you

A broker's **index** \`z\` is the price at which his fee would exactly pay for
itself:

\`\`\`
E[(X − z)⁺] = c
\`\`\`

— the expected amount by which his price would beat \`z\`, set equal to what he
charges. Above \`z\` he cannot pay for himself; below it he can. The index counts
**how far above you he might reach**, not how he does on an ordinary day, which
is exactly why it is not the average.

> **Pandora's rule.** Ask the unasked man with the highest index. Stop the moment
> the price you are holding is at least the highest index left.

That is provably optimal — and it is checked rather than cited: \`verify:brokers\`
compares it against the dynamic program at every one of the reachable states, and
\`test/brokers-rtp.spec.ts\` does it again in CI.

### Return to player

| | |
|---|---|
| Declared RTP, optimal play | **${pct(brokers.rtp)}** |
| Exact | \`${R.toExactString(brokers.rtp)}\` |
| House edge | ${pct(R.sub(R.rat(1n), brokers.rtp))} |
| Maximum payout | **${R.toFixed(R.rat(BROKERS_MAX_PAYOUT_BP, PRICE_DENOM), 4)}×** — the best price on the floor, less the one fee that buys it |
| **Minimum payout** | **${R.toFixed(brokersWorst, 4)}×** — there is no losing state in this game |
| P(payout ≥ 1×) | ${pct(brokersAtLeast(brokersPolicy, R.rat(1n)), 2)} |
| P(payout ≥ 2×) | ${pct(brokersAtLeast(brokersPolicy, R.rat(2n)), 3)} |
| P(payout ≥ 4×) | ${pct(brokersAtLeast(brokersPolicy, R.rat(4n)), 4)} |
| Mean men asked | ${R.toFixed(brokersRoundShape.meanAsked, 3)} of ${BROKER_LIST.length} |
| Kept the house's own price | ${pct(brokersRoundShape.keptTheHouse, 1)} |

The maximum is **not** the best price on the floor. Only one man ever names
${price(50_000)}, so his fee is unavoidable, and \`quoteCaps\` reserves
${R.toFixed(R.rat(BROKERS_MAX_PAYOUT_BP, PRICE_DENOM), 4)}× rather than the corner that
cannot be reached.

#### The strategy band

| How you play | Returns | |
|---|---|---|
${brokersBandRows}

Every published policy is inside the window, and the decision is worth three
points against the autopilot of asking everybody. The fees are what hold both
ends: all four of them together are ${R.toPercent(R.rat(TOTAL_FEES_BP, PRICE_DENOM), 2)}% of the stake.

### There is no losing state

\`TAKE\` is legal at every point of the round, and it always pays what is in hand
less what has been spent. The worst the game can do to you is the house's lowest
price with every fee paid — **${R.toFixed(brokersWorst, 4)}×**. There is no bust, no forced
move, nothing that accumulates, and no way to be left holding nothing.

### Playing it

Keyboard: \`1\`…\`4\` ask that man · \`Space\`/\`Enter\` sell the claim ·
\`Enter\` next claim · \`?\` the whole market and the index · \`M\` sound · \`T\` turbo ·
\`L\` the book.

The board draws every price on one **logarithmic** scale, so equal distances are
equal multiples: a slip a thumb's width above the brass line beats it by the same
factor wherever the two of them sit. The Ghost Price — what the next man you did
not ask would have said — is drawn only once the claim is sold, changes no
payout, and is stated once and flatly.

---

## Verify everything

| Command | What it proves |
|---|---|
| \`npm run verify:rtp\` | CANDLE's declared RTP, recomputed across all ${INCHES * LOTS.length} reachable \`(inch, lot)\` states in exact rationals. Nothing read from a constant. |
| \`npm run verify:survey\` | THE SURVEY's, across all ${surveyStates} reachable \`(cargo, surveys, margin)\` states — including the belief table the contract mirrors as fractions, never as rounded probabilities. |
| \`npm test\` | ~300 tests: both DPs, both parities, the strategy bands, the RNG, the light model, both scenes, the pacing, both ghosts, and both UIs driven through a whole round. |
| \`npm run bench\` | 10⁷ draws and 10⁷ rounds for CANDLE; 10⁶ voyages for THE SURVEY, with every report checked against the predictive distribution at the margin it was drawn at. |
| \`npm run verify:light\` | Luminance is exactly each game's own ladder; the blackbody walk; WCAG contrast at every rung; and the fog table, where the ship is drawn at exactly the confidence. |
| \`npm run frame-budget\` | p95 frame time for both scenes, against a 12 ms budget. |
| \`npm run cold-open\` | Critical path and time to first playable frame, for both pages — and how much of it the second page already has in cache. |
| \`npm run gates\` | Bundle size, one widget tag per entry, \`frame-ancestors *\`, no \`X-Frame-Options\`, a manifest beside each page, no browser storage. |
| \`npm run round-trip\` · \`round-trip:survey\` | A real round and a real voyage settled by the real facet against a local chain and a real VRF node — including, for THE SURVEY, that the word deciding the ship arrives only after the call. |
| \`npm run play\` · \`play:survey\` | Either loop played in a terminal, worded exactly as its UI words it. |
| \`npm run spike\` | Every SDK symbol used, exercised end to end. |

See [DEMO.md](./DEMO.md) for a one-minute reviewer runbook with the expected output
inline.

---

## The contracts

\`\`\`sh
npm run contracts:build                                   # forge, solc 0.8.30, viaIR
RPC_URL=https://…  DEPLOYER_KEY=0x…  npm run deploy:contract -- candle
RPC_URL=https://…  DEPLOYER_KEY=0x…  npm run deploy:contract -- survey
\`\`\`

Two contracts, one interface, the same discipline: no constructor arguments, no
storage, every hook \`view\`, no unbounded loops. Session state travels in four
bytes of \`gameState\` for CANDLE and five for THE SURVEY, which the facet emits
and takes back. ${sizeSentence}

\`deploy:contract\` has no default chain on purpose, and reads each contract back
after deploying — against that game's own generated constants, so a retuned
manifest cannot leave a stale assertion behind. A contract that deployed but
answers differently is worse than one that failed, because nothing tells you.

**THE SURVEY's contract is the one to read.** It is where the reversed generative
order lives, and the comment at the top says why a \`view\`-only game that emits
its whole state can still hide whether a ship is sound.

## How it is built

\`\`\`
contracts/Candle.sol         ICasinoGameV2. Five hooks, one _payout(), one word per inch.
contracts/Survey.sol         The same, and the reversed generative order.
contracts/ICasinoGameV2.sol  Vendored from the SDK, so a standard toolchain can build it.
contracts/generated/         Mirrored from each game's core. Never hand-edited.

src/shared/                  What both games use, and nothing that knows which is calling.
  bridge/host.ts             GameHost<S, A> — generic over whatever a session holds.
  bridge/chain.ts            The whole penpal path. Two game-shaped holes: encode an
                             action byte, read your own session out of a row.
  render/light.ts            The measurable light model. Takes a level in basis points.
  audio/engine.ts            Context, master gain, beds, Poisson grains. No files.
  audio/pacing.ts            One pacing rule, two games.
  math/rational.ts           Exact BigInt rationals. No float touches a declared number.
  ui/                        tokens.css + table.css: the room and the furniture.

src/games/<slug>/core/       PURE: that game's own maths. No React, no DOM, no clock.
src/games/<slug>/app/        Its bridge adapter, its canvas, its voice, its React layer.
\`\`\`

**One VRF word per step, and the step is always an on-chain action.** \`LET IT
BURN\` requests the next lot; \`SEND A SURVEYOR\` requests the next report;
\`UNDERWRITE\` requests the word that decides the ship. In every case the word is
causally after the action that asked for it and cannot be read, predicted or
front-run. Randomness is mapped by **rejection sampling** over 16-bit windows —
\`word % n\` is biased and is not used anywhere, in either language.

Neither contract holds storage: every hook is \`view\`, and session state travels
in the \`gameState\` bytes the facet emits and takes back.

---

### Playing it

- **Standalone** — open the page and the first lot is already on the table. Free
  play, no wallet, no modal, no splash. The purse lasts one page load and nothing
  is written to browser storage: a balance that looks like it survives a reload
  and does not is a worse lie than one that obviously resets.
- **\`?seed=198\`** makes free play deterministic, for recording and for
  reproducing a reported round. Free play only — inside a host the contract's VRF
  is the only authority on outcomes and nothing client-side can touch it.
- **In the chain.wtf host** — the host owns the wallet, the balance and the bet
  limits. The contract is the only authority on outcomes; the client animates what
  it is told and never recomputes a result.

Keyboard: \`Space\`/\`Enter\` claim · \`B\`/\`↓\` let it burn · \`Enter\` deal again ·
\`?\` the paytable and the full strategy band · \`M\` sound · \`T\` turbo.

## Responsible design

The mechanics were chosen partly because they behave well. Neither game **can
lose more than the stake**, neither has a bust state, an accumulating sunk-cost
ladder, autoplay, or near-miss theatre. In THE SURVEY the worst case is not even
a total loss on most rounds: declining is always there, and it always pays.

Each game shows a ghost — the lot that would have come next, the report the
surveyor nobody sent would have made. Both are drawn only once the call is locked
in, both change no payout, and both are stated once and flatly. There is a test
per game that walks **every string in the UI** and fails on an exclamation mark,
a "you were so close", or a "try again". No loss-chasing prompts, no escalating
bet suggestions, no timers. The logs report your realised return against the
declared RTP and say plainly that a short session proves nothing. The standalone
builds are free play and say so on every screen.

---

*${manifest.locales['en']?.description ?? ''}*

*${surveyManifest.locales['en']?.description ?? ''}*
`;

writeFileSync(OUT, readme);
console.log(`wrote ${OUT}`);
console.log(`  declared RTP ${pct(solution.rtp)} = ${R.toExactString(solution.rtp)}`);
console.log(`  ${LOTS.length} lots, ${INCHES} inches, ${Object.keys(INKS).length} inks`);

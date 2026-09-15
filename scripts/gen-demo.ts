/**
 * `npm run gen:demo` — writes DEMO.md, the one-minute reviewer runbook.
 *
 * The expected output is **captured from a real run**, not transcribed: a runbook
 * whose "expected output" was typed from memory is worse than no runbook, because
 * a reviewer who sees a mismatch cannot tell whether the build is broken or the
 * document is stale (claude.md §8).
 */
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const OUT = resolve(ROOT, 'DEMO.md');

/** Strips ANSI colour, so the runbook reads the same in a file as on a terminal. */
const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g');

function capture(args: readonly string[]): string {
  try {
    const out = execFileSync('npm', ['run', '--silent', ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return out.replace(ANSI, '').trimEnd();
  } catch (error) {
    const e = error as { stdout?: string; message?: string };
    return (e.stdout ?? e.message ?? 'failed').replace(ANSI, '').trimEnd();
  }
}

const lines = (text: string, from: number, to: number) => text.split('\n').slice(from, to).join('\n');

console.log('capturing verify:rtp …');
const rtp = capture(['verify:rtp']);
console.log('capturing verify:survey …');
const surveyRtp = capture(['verify:survey']);
console.log('capturing verify:light …');
const light = capture(['verify:light']);
console.log('capturing gates …');
const gates = capture(['gates']);
console.log('capturing frame-budget …');
const frames = capture(['frame-budget']);

const demo = `<!--
  GENERATED FILE — DO NOT EDIT.
  Written by \`npm run gen:demo\`. The expected output below is CAPTURED FROM A
  REAL RUN, so a mismatch means the build changed, not that the document is stale.
-->

# DEMO — the one-minute review

**Two games, one repo, one origin.** CANDLE is at \`/candle/\`, THE SURVEY at
\`/survey/\`, each a separate entry with its own manifest, contract and declared
RTP. Everything here runs offline. No account, no testnet funds, no wallet.

\`\`\`sh
npm install
\`\`\`

---

## 1. The RTP is real · ~10 s

\`\`\`sh
npm run verify:rtp
\`\`\`

Recomputes the declared RTP from the paytable across all 30 reachable
\`(inch, lot)\` states, in exact BigInt rationals. **Nothing is read from a
constant** — change a weight in \`src/game/paytable.ts\` and every number moves.

<details><summary>Expected output — the paytable and the DP</summary>

\`\`\`
${lines(rtp, 0, 40)}
\`\`\`

</details>

It ends with nine assertions and the headline:

\`\`\`
${lines(rtp, -13, Infinity)}
\`\`\`

**The number to check: \`96.9961%\`, exactly \`7577820426157 / 7812500000000\`.**

### …and the same again for THE SURVEY

\`\`\`sh
npm run verify:survey
\`\`\`

Its own DP, over 126 reachable \`(cargo, surveys, margin)\` states, in exact
rationals — including the belief table the contract mirrors as fractions rather
than as rounded probabilities.

<details><summary>Expected output — the manifest, the belief and the band</summary>

\`\`\`
${lines(surveyRtp, 0, 46)}
\`\`\`

</details>

\`\`\`
${lines(surveyRtp, -14, Infinity)}
\`\`\`

**The number to check: \`97.4141%\`, exactly \`60883787 / 62500000\` — and the
strategy band above it, where *every* published policy is inside 93–98%,
including sending nobody and sending everybody.**

---

## 2. The whole test suite · ~15 s

\`\`\`sh
npm test
\`\`\`

Around 300 tests across both games. The ones worth knowing about:

| File | What it holds |
|---|---|
| \`test/rtp.spec.ts\` | CANDLE's declared RTP and every figure in the README, recomputed. |
| \`test/survey-rtp.spec.ts\` | THE SURVEY's, plus the belief identities — and that **every** published policy is in band, not merely the flattering ones. |
| \`test/survey-draw.spec.ts\` | Its reports come from the predictive distribution and her condition from the posterior, at every margin. |
| \`test/survey-host.spec.ts\` | The Ghost Report cannot leak, and her condition is undecided until UNDERWRITE is submitted. |
| \`test/survey-scene.spec.ts\` | The fog is exactly \`1 − confidence\`, and a disagreeing pair of reports puts it back to the digit. |
| \`test/strategy-band.spec.ts\` | Every sensible policy inside 93–98%, and that **no** per-inch policy beats the DP. |
| \`test/rng.spec.ts\` | Chi-square over 10⁶ draws — **and a proof that the forbidden \`word % n\` fails the same test**, so the gate has teeth. |
| \`test/parity.spec.ts\` | The TS core and the deployed Solidity agree on all 30 states and a 4,096-word corpus, including a word that exhausts all sixteen windows. |
| \`test/caps.spec.ts\` | A 25× win lands exactly on the facet's payout cap, with no slack. |
| \`test/light.spec.ts\` | Scene luminance is exactly the wax ladder, in linear light. |
| \`test/ghost.spec.ts\` | The Ghost Lot cannot leak, changes no payout, and is never dramatised. |
| \`test/ui.spec.tsx\` | The real React tree, driven through a whole round plus the keyboard path. |

\`test/parity.spec.ts\` and \`test/caps.spec.ts\` **skip** unless a local chain is
running — see §5. A missing chain is an environment gap, not a defect, and a red
suite that means "you forgot to start something" trains people to ignore red suites.

---

## 3. Play it · ~5 s

\`\`\`sh
npm run dev        # http://localhost:3200
\`\`\`

\`http://localhost:3200/\` is the lobby, \`/candle/\` and \`/survey/\` are the games.
Free play, no wallet, no modal, no splash.

In CANDLE: \`Space\` claims, \`B\` lets it burn. In THE SURVEY: \`Space\` underwrites,
\`S\` sends a surveyor, \`D\` declines. In both, \`?\` opens the full model, \`M\`
toggles sound, \`T\` is turbo and \`L\` is the log.

To watch either loop without a browser:

\`\`\`sh
npm run play -- 100            # CANDLE
npm run play:survey -- 100     # THE SURVEY
\`\`\`

Each prints a transcript worded exactly as its UI words it, then the session
statistics — including how much of the pacing falls on a real decision, and the
ghost's distribution against the model it was drawn from.

---

## 4. The light model · ~2 s

\`\`\`sh
npm run verify:light
\`\`\`

"Brightness is the multiplier" is a measurable claim, so it is measured:

\`\`\`
${lines(light, 3, 13)}
\`\`\`

The last column is the point. Relative luminance at each inch is exactly
\`WAX_BP[k] / 10000\` of the first inch — 40.05% against a ladder that says 40%.

---

## 5. Against a real chain and a real VRF node · ~60 s

\`\`\`sh
npm run sdk:fetch && npm run sdk:install    # first time only
npm run sdk:stack                           # leave this running
\`\`\`

Then, in another terminal:

\`\`\`sh
npm run sync:simulator     # copies contracts/ into the simulator's watch folder
npm run round-trip         # a real round, settled on chain
npm run spike              # every SDK symbol, exercised end to end
npm test                   # parity and caps now RUN instead of skipping
\`\`\`

\`round-trip\` stakes 100 chUSD, burns three inches, claims at the fourth, and
checks the payout **to the base unit** against what the pure TS core computed in
lockstep. \`spike\` drives the full session lifecycle plus the unhappy paths the SDK
asks you to test — stuck randomness, and an abandoned session forfeiting at 90%.

The simulator UI is at \`http://localhost:3300\`; point it at
\`http://localhost:3200\` to play the game inside the host.

---

## 6. The shipping gates · ~5 s

\`\`\`sh
npm run build && npm run gates
\`\`\`

\`\`\`
${gates}
\`\`\`

And the frame budget, against a 12 ms p95:

\`\`\`
${lines(frames, 3, 16)}
\`\`\`

---

## What to look at if you only have a minute

1. \`src/games/candle/core/solve.ts\` and \`src/games/survey/core/solve.ts\` — two
   dynamic programs, both in exact rationals.
2. \`contracts/Survey.sol\` — and the comment on why the generative order is
   reversed, which is the whole reason a \`view\`-only contract can hide anything.
3. \`npm run verify:rtp\` and \`npm run verify:survey\` — check \`96.9961%\` and
   \`97.4141%\` against the README.
4. \`docs/phases.md\` — what each phase found, including the places the
   specification turned out to be wrong and what the measurement said instead.
`;

writeFileSync(OUT, demo);
console.log(`wrote ${OUT}`);

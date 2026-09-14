<!--
  GENERATED FILE — DO NOT EDIT.
  Written by `npm run gen:demo`. The expected output below is CAPTURED FROM A
  REAL RUN, so a mismatch means the build changed, not that the document is stale.
-->

# DEMO — the one-minute review

Everything here runs offline. No account, no testnet funds, no wallet.

```sh
npm install
```

---

## 1. The RTP is real · ~10 s

```sh
npm run verify:rtp
```

Recomputes the declared RTP from the paytable across all 30 reachable
`(inch, lot)` states, in exact BigInt rationals. **Nothing is read from a
constant** — change a weight in `src/game/paytable.ts` and every number moves.

<details><summary>Expected output — the paytable and the DP</summary>

```

CANDLE — RTP verification
every number below is recomputed from the paytable in exact rationals

Paytable
  lot                      face       weight     probability
  Empty crate              0.00x        6690          66.90%
  Ship's stores            0.50x        1000          10.00%
  Cordage                  1.00x        1600          16.00%
  Sailcloth                2.00x         550           5.50%
  Ordnance                 5.00x         140           1.40%
  The Sarah Christiana    25.00x          20           0.20%
  weights sum to 10000 / 10000 ✓
  E[face] = 0.440000x   (hand-check: 0.44)
  cumulative weights: 6690, 7690, 9290, 9840, 9980, 10000

Wax ladder
  inch     wax     payout on a 2.00x lot
     1     100%                2.00x
     2      85%                1.70x
     3      70%                1.40x
     4      55%                1.10x
     5      40%                0.80x

Continuation values and claim thresholds
  inch     wax           A(k)       claim if face >=
     1    1.00       0.969961                0.75418
     2    0.85       0.754176                0.64664
     3    0.70       0.549643                0.51392
     4    0.55       0.359744                0.32000
     5    0.40       0.176000                 forced

Headline figures
  Declared RTP (optimal play)    96.9961%
     exact                       7577820426157 / 7812500000000
  House edge                     3.0039%
  Max payout                     25x stake (first inch only)
  P(payout >= 1x)                36.4741%
  P(payout = 0)                  20.3531%
  P(payout >= 5x)                2.0239%
```

</details>

It ends with nine assertions and the headline:

```

Assertions
  ✓ paytable weights sum to the denominator
  ✓ all 30 (inch, lot) states enumerated
  ✓ settlement probabilities sum to exactly 1  1 / 1
  ✓ RTP equals A(1) from the backward induction
  ✓ the optimal policy beats every fixed threshold policy
  ✓ every sensible policy lands inside the jam band 93–98%
  ✓ A(5) = wax(5) * E[face]  hand-check: 0.40 x 0.44 = 0.176
  ✓ max payout is exactly 25x
  ✓ pass mass at inches 1-3 = P(empty) + P(0.50x)  hand-check: 0.6690 + 0.1000 = 0.7690

VERIFIED  declared RTP 96.9961%  =  7577820426157 / 7812500000000
```

**The number to check: `96.9961%`, exactly `7577820426157 / 7812500000000`.**

---

## 2. The whole test suite · ~15 s

```sh
npm test
```

186 tests. The ones worth knowing about:

| File | What it holds |
|---|---|
| `test/rtp.spec.ts` | The declared RTP and every figure in the README, recomputed. |
| `test/strategy-band.spec.ts` | Every sensible policy inside 93–98%, and that **no** per-inch policy beats the DP. |
| `test/rng.spec.ts` | Chi-square over 10⁶ draws — **and a proof that the forbidden `word % n` fails the same test**, so the gate has teeth. |
| `test/parity.spec.ts` | The TS core and the deployed Solidity agree on all 30 states and a 4,096-word corpus, including a word that exhausts all sixteen windows. |
| `test/caps.spec.ts` | A 25× win lands exactly on the facet's payout cap, with no slack. |
| `test/light.spec.ts` | Scene luminance is exactly the wax ladder, in linear light. |
| `test/ghost.spec.ts` | The Ghost Lot cannot leak, changes no payout, and is never dramatised. |
| `test/ui.spec.tsx` | The real React tree, driven through a whole round plus the keyboard path. |

`test/parity.spec.ts` and `test/caps.spec.ts` **skip** unless a local chain is
running — see §5. A missing chain is an environment gap, not a defect, and a red
suite that means "you forgot to start something" trains people to ignore red suites.

---

## 3. Play it · ~5 s

```sh
npm run dev        # http://localhost:3200
```

Free play, no wallet, no modal, no splash. `Space` claims, `B` lets it burn,
`?` opens the full paytable and strategy band, `M` toggles sound, `T` is turbo.

To watch the loop without a browser:

```sh
npm run play -- 100
```

It prints a transcript worded exactly as the UI words it, then the session
statistics — including how much of the pacing falls on a real decision, and the
Ghost Lot's distribution against the paytable.

---

## 4. The light model · ~2 s

```sh
npm run verify:light
```

"Brightness is the multiplier" is a measurable claim, so it is measured:

```

The room, inch by inch
  inch   wax    flame        tallow            luminance   vs inch 1
     1   100%   2000K         rgb(246 230 196)       0.8017    100.00%
     2    85%   1875K         rgb(237 215 129)       0.6819     85.06%
     3    70%   1750K         rgb(221 196 119)       0.5618     70.08%
     4    55%   1625K         rgb(203 174 107)       0.4403     54.92%
     5    40%   1500K         rgb(181 149 93)        0.3211     40.05%

Brightness IS the multiplier
```

The last column is the point. Relative luminance at each inch is exactly
`WAX_BP[k] / 10000` of the first inch — 40.05% against a ladder that says 40%.

---

## 5. Against a real chain and a real VRF node · ~60 s

```sh
npm run sdk:fetch && npm run sdk:install    # first time only
npm run sdk:stack                           # leave this running
```

Then, in another terminal:

```sh
npm run sync:simulator     # copies contracts/ into the simulator's watch folder
npm run round-trip         # a real round, settled on chain
npm run spike              # every SDK symbol, exercised end to end
npm test                   # parity and caps now RUN instead of skipping
```

`round-trip` stakes 100 chUSD, burns three inches, claims at the fourth, and
checks the payout **to the base unit** against what the pure TS core computed in
lockstep. `spike` drives the full session lifecycle plus the unhappy paths the SDK
asks you to test — stuck randomness, and an abandoned session forfeiting at 90%.

The simulator UI is at `http://localhost:3300`; point it at
`http://localhost:3200` to play the game inside the host.

---

## 6. The shipping gates · ~5 s

```sh
npm run build && npm run gates
```

```

headers — vercel.json
  ✓ Content-Security-Policy is set  frame-ancestors *
  ✓ CSP is exactly "frame-ancestors *"  I8
  ✓ no X-Frame-Options anywhere in vercel.json  a stray SAMEORIGIN silently costs the gallery preview
  ✓ nothing in the repo SETS X-Frame-Options

jam widget — raw HTML
  ✓ index.html contains the widget tag exactly once  1 occurrence(s)
  ✓ the widget tag is a real <script src>, not injected by JS  the gallery reads the served document
  ✓ dist/index.html contains the widget tag exactly once  1 occurrence(s)

document head
  ✓ a favicon is inlined, so nothing 404s in a console a judge has open  806 bytes, no extra request
  ✓ it is well under the 8 KB image budget
  ✓ the page says what it is when its URL is pasted somewhere
  ✓ a theme colour is set, so browser chrome matches the room
  ✓ the document declares a language

browser storage
  ✓ src/ uses no localStorage, sessionStorage or indexedDB

manifest
  ✓ game.manifest.json parses
  ✓ schemaVersion/apiVersion are 1
  ✓ gameId is set and matches the contract name  CandleGame
  ✓ defaultLocale exists in locales
  ✓ capabilities.openSession is true
  ✓ capabilities.submitAction is true (CANDLE is multi-action)  BURN is an on-chain player action

contract
  ✓ the ICasinoGameV2 interface is vendored beside the game  so a standard toolchain can compile it
  ✓ and is byte-identical to the SDK once comments are stripped
  ✓ Candle.sol imports the interface by a path that resolves anywhere
  ✓ the generated paytable is never hand-edited
  ✓ the contract declares no constructor arguments  the SDK deploys it without any
  ✓ every hook is view, so the game holds no storage

generated documents
  ✓ README.md exists and is marked generated
  ✓ README.md carries the declared RTP as an exact rational  the one number a judge will check
  ✓ README.md publishes the whole strategy band, not just the flattering end
  ✓ DEMO.md exists and is marked generated
  ✓ DEMO.md pastes real expected output, not a description of it  the verify:rtp headline and a verify:light row, both as captured
  ✓ a licence is present, so the source can actually be shared

bundle
  ✓ bundle < 150 KB gzipped  88.6 KB gzipped
  ✓ zero audio files (everything synthesised)
  ✓ no image over 8 KB
  ✓ dist/game.manifest.json is served at the origin

GATES GREEN  35 passed, 0 failed
```

And the frame budget, against a 12 ms p95:

```

  case                                p50      p95      p99    worst
  a burn at the flare, 1080p        0.004    0.006    0.009    0.182
  the flare, a phone                0.004    0.009    0.025   10.113
  an empty crate, first inch        0.003    0.009    0.012    1.046
  waiting for a word                0.003    0.003    0.004    0.069

Verdict
  ✓ a burn at the flare, 1080p: p95 under 12 ms  0.006 ms
  ✓ the flare, a phone: p95 under 12 ms  0.009 ms
  ✓ an empty crate, first inch: p95 under 12 ms  0.009 ms
  ✓ waiting for a word: p95 under 12 ms  0.003 ms
  ✓ even p99 stays inside the 60 fps frame at 16.7 ms  0.025 ms
```

---

## What to look at if you only have a minute

1. `src/game/solve.ts` — the dynamic program, in exact rationals.
2. `contracts/Candle.sol` — five hooks, one `_payout()`, one VRF word per inch.
3. `npm run verify:rtp` — and check `96.9961%` against the README.
4. `docs/phases.md` — what each phase found, including the five places the
   specification turned out to be wrong and what the measurement said instead.

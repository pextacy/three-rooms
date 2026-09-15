<!--
  GENERATED FILE — DO NOT EDIT.
  Written by `npm run gen:demo`. The expected output below is CAPTURED FROM A
  REAL RUN, so a mismatch means the build changed, not that the document is stale.
-->

# DEMO — the one-minute review

**Three games, one repo, one origin.** CANDLE is at `/candle/`, THE SURVEY at
`/survey/`, THE BROKERS at `/brokers/` — each a separate entry with its own
manifest, contract and declared RTP, and each built on a different decision
problem: **stop · learn · search**. Everything here runs offline. No account, no
testnet funds, no wallet.

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

### …and the same again for THE SURVEY

```sh
npm run verify:survey
```

Its own DP, over 126 reachable `(cargo, surveys, margin)` states, in exact
rationals — including the belief table the contract mirrors as fractions rather
than as rounded probabilities.

<details><summary>Expected output — the manifest, the belief and the band</summary>

```

THE SURVEY — RTP verification
every number below is recomputed from the manifest in exact rationals

The manifest
  cargo        pays     weight     chance
  Salt         1.10x      3000     30.00%
  Coal         1.40x      2500     25.00%
  Timber       1.80x      2000     20.00%
  Wine         2.50x      1500     15.00%
  Silk         5.00x       800      8.00%
  Indigo      20.00x       200      2.00%
  weights sum to 10000 / 10000 ✓
  cumulative: 3000, 5500, 7500, 9000, 9800, 10000

The ship, and the surveyors
  P(sound) before any survey     0.4000   2/5 — these are dangerous waters
  a surveyor is right            0.6000   3/5
  evidence weight of one report  1.5000   odds multiply by this
  declining hands back           0.60x  of the premium

What the reports add up to
  margin = reports for sound minus reports for rot. Disagreeing reports cancel.
  margin   P(sound)   next report says SOUND
      -5     0.0807               0.4161
      -4     0.1164               0.4233
      -3     0.1649               0.4330
      -2     0.2286               0.4457
      -1     0.3077               0.4615
       0     0.4000               0.4800
       1     0.5000               0.5000
       2     0.6000               0.5200
       3     0.6923               0.5385
       4     0.7714               0.5543
       5     0.8351               0.5670

The premium ladder
  surveys   premium   declining pays
        0      100%           0.6000
        1     98.5%           0.5910
        2       97%           0.5820
        3     95.5%           0.5730
        4       94%           0.5640
        5     92.5%           0.5550

Each voyage, played optimally
```

</details>

```
  21 states per cargo, 126 in all

Assertions
  ✓ manifest weights sum to the denominator
  ✓ the declared RTP sits inside the jam band 93–98%  97.4141%
  ✓ no policy beats the DP
  ✓ the premium ladder has one rung per survey plus the start
  ✓ a disagreeing pair of reports cancels exactly  margin 0 is the prior, whatever was bought
  ✓ the posterior rises with every report for sound
  ✓ declining always pays less than the stake  0.60x
  ✓ the richest cargo is the maximum payout
  ✓ margin is a sufficient statistic

VERIFIED  declared RTP 97.4141%  =  60883787 / 62500000
```

**The number to check: `97.4141%`, exactly `60883787 / 62500000` — and the
strategy band above it, where *every* published policy is inside 93–98%,
including sending nobody and sending everybody.**

### …and the third, which is a theorem

```sh
npm run verify:brokers
```

THE BROKERS is search with recall — Weitzman's Pandora's Box. The optimal rule
is an **index**: give every broker a reservation price `z` solving
`E[(X − z)⁺] = c`, ask in descending `z`, and stop when what you hold beats
the best remaining index. This script solves the index in closed form, then
checks it against the full dynamic program **at all 120 reachable states**.

<details><summary>Expected output — the floor, the index, and the band</summary>

```

THE BROKERS — RTP verification
every number below is recomputed from the market in exact rationals

The house's man — he looks for nothing, and first
  price      chance
    0.85x      50.00%
    1.02x      50.00%
  mean 0.9350x

The brokers
  broker         fee    mean price     index (z)   asked   what he names
  Stubbs        6.00%     0.7490x      0.8975x      4   0.55x@60.00%  0.95x@27.00%  1.25x@13.00%
  Marchmont     4.50%     0.6225x      0.9500x      3   0.35x@60.00%  0.90x@25.00%  1.25x@15.00%
  Delane        3.25%     0.4995x      1.3714x      1   0.40x@80.00%  0.60x@16.50%  2.30x@3.50%
  Vanderdek     0.95%     0.3763x      1.2000x      2   0.35x@90.00%  0.50x@9.75%  5.00x@0.25%

  The order is by INDEX, and the index is not the average: Delane goes first on the
  worst average price but the best upside, and Stubbs — the best average
  price on the floor — is the last man worth asking.

Weitzman's index, checked against its own definition
  z solves E[(X - z)^+] = c. Both sides, exactly, for each broker.
  Stubbs      E[(X-z)^+] = 3 / 50                 c = 3 / 50       ✓
  Marchmont   E[(X-z)^+] = 9 / 200                c = 9 / 200      ✓
  Delane      E[(X-z)^+] = 13 / 400               c = 13 / 400     ✓
  Vanderdek   E[(X-z)^+] = 19 / 2000              c = 19 / 2000    ✓

Headline figures
  Declared RTP (optimal play)  96.9637%
     exact                     1551418623 / 1600000000
  House edge                   3.0363%
  Maximum payout               4.9905x (the best price on the floor, less the fee of the only man who names it)
  Minimum payout               0.7030x — there is no losing state in this game
  P(payout >= 1x)              14.71%
  P(payout >= 2x)              3.741%
  P(payout >= 4x)              0.2413%
  Mean brokers asked           2.735
  Brokers asked                0:0.0%  1:3.5%  2:48.4%  3:19.3%  4:28.9%
  Kept the house’s own price   65.5%

Strategy band
  Every way of playing this that a person would actually adopt — including
  taking the first price offered, and including asking everybody — is inside
  the jam band. The fees are what hold it there.
```

</details>

```
  16 subsets of brokers x 12 prices; 120 of those combinations can actually arise

Assertions
  ✓ every quote table sums to the denominator
  ✓ the declared RTP sits inside the jam band 93–98%  96.9637%
  ✓ and so does EVERY published policy, not merely the flattering ones
  ✓ no policy beats the DP
  ✓ PANDORA'S RULE IS THE DYNAMIC PROGRAM — the same choice at every reachable state  the index rule is a theorem; this is the theorem, checked
  ✓ and it returns exactly the same RTP  96.9637%
  ✓ the maximum payout is what the contract reserves  4.9905x = 49905 bp
  ✓ the fees can never eat a whole stake — there is no losing state  the worst the game can do is 0.7030x
  ✓ the best average price belongs to the LAST broker worth asking  the whole point of the index
  ✓ asking a broker is never compulsory: taking is legal at every state  there is no forced move anywhere in the machine (core/round.ts)

VERIFIED  declared RTP 96.9637%  =  1551418623 / 1600000000
```

**The number to check: `96.9637%`, exactly `1551418623 / 1600000000` — and the
line that says `PANDORA'S RULE IS THE DYNAMIC PROGRAM`. The index is published
in full in the game's `?` panel, asking order included: this game sells the ten
seconds in which you decide whether to believe the theorem, not an information
edge over you.**

---

## 2. The whole test suite · ~15 s

```sh
npm test
```

Around 500 tests across all three games. The ones worth knowing about:

| File | What it holds |
|---|---|
| `test/rtp.spec.ts` | CANDLE's declared RTP and every figure in the README, recomputed. |
| `test/survey-rtp.spec.ts` | THE SURVEY's, plus the belief identities — and that **every** published policy is in band, not merely the flattering ones. |
| `test/survey-draw.spec.ts` | Its reports come from the predictive distribution and her condition from the posterior, at every margin. |
| `test/survey-host.spec.ts` | The Ghost Report cannot leak, and her condition is undecided until UNDERWRITE is submitted. |
| `test/survey-scene.spec.ts` | The fog is exactly `1 − confidence`, and a disagreeing pair of reports puts it back to the digit. |
| `test/brokers-rtp.spec.ts` | THE BROKERS' declared RTP, the index against its own equation, and **Pandora's rule against the DP at every reachable state**. |
| `test/brokers-round.spec.ts` | Taking is legal at every point, and asking the same broker twice is refused. |
| `test/brokers-host.spec.ts` | The Ghost Price cannot leak, and a broker's price does not exist until his fee is committed. |
| `test/brokers-scene.spec.ts` | The floor is logarithmic, so equal distances are equal multiples — and nothing draws over the readout. |
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

`http://localhost:3200/` is the lobby; `/candle/`, `/survey/` and `/brokers/`
are the games. Free play, no wallet, no modal, no splash.

In CANDLE: `Space` claims, `B` lets it burn. In THE SURVEY: `Space` underwrites,
`S` sends a surveyor, `D` declines. In THE BROKERS: `1`–`4` ask that broker,
`Space` sells the claim. In all three, `?` opens the full model, `M` toggles
sound, `T` is turbo and `L` is the log.

To watch any of the loops without a browser:

```sh
npm run play -- 100            # CANDLE
npm run play:survey -- 100     # THE SURVEY
npm run play:brokers -- 100    # THE BROKERS
```

Each prints a transcript worded exactly as its UI words it, then the session
statistics — including how much of the pacing falls on a real decision, and the
ghost's distribution against the model it was drawn from.

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
npm run round-trip           # a real round, settled on chain
npm run round-trip:survey    # a real voyage
npm run round-trip:brokers   # a real claim, shopped and sold
npm run spike                # every SDK symbol, exercised end to end
npm test                     # parity and caps now RUN instead of skipping
```

`round-trip` stakes 100 chUSD, burns three inches, claims at the fourth, and
checks the payout **to the base unit** against what the pure TS core computed in
lockstep. The other two do the same for their own games, and each also checks
that game's security model **on the chain rather than in a comment**: THE
SURVEY's settling word arrives only after UNDERWRITE was submitted, and a
BROKERS quote is drawn by the word that broker's own fee bought. `spike` drives
the full session lifecycle plus the unhappy paths the SDK asks you to test —
stuck randomness, and an abandoned session forfeiting at 90%.

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
  ✓ candle/index.html contains the widget tag exactly once  1 occurrence(s)
  ✓ survey/index.html contains the widget tag exactly once  1 occurrence(s)
  ✓ brokers/index.html contains the widget tag exactly once  1 occurrence(s)
  ✓ the lobby carries NO widget — it is a door, not an entry  a widget there would report engagement for something never submitted
  ✓ candle's widget tag is a real <script src>, not injected by JS  the gallery reads the served document
  ✓ survey's widget tag is a real <script src>, not injected by JS  the gallery reads the served document
  ✓ brokers's widget tag is a real <script src>, not injected by JS  the gallery reads the served document
  ✓ dist/candle/index.html contains the widget tag exactly once  1 occurrence(s)
  ✓ dist/survey/index.html contains the widget tag exactly once  1 occurrence(s)
  ✓ dist/brokers/index.html contains the widget tag exactly once  1 occurrence(s)

document head
  ✓ candle: a favicon is inlined, so nothing 404s in a console a judge has open  806 bytes, no extra request
  ✓ candle: it is well under the 8 KB image budget
  ✓ candle: nothing spilled out of the favicon href
  ✓ candle: the page says what it is when its URL is pasted somewhere
  ✓ candle: a theme colour is set, so browser chrome matches the room
  ✓ candle: the document declares a language
  ✓ survey: a favicon is inlined, so nothing 404s in a console a judge has open  649 bytes, no extra request
  ✓ survey: it is well under the 8 KB image budget
  ✓ survey: nothing spilled out of the favicon href
  ✓ survey: the page says what it is when its URL is pasted somewhere
  ✓ survey: a theme colour is set, so browser chrome matches the room
  ✓ survey: the document declares a language
  ✓ brokers: a favicon is inlined, so nothing 404s in a console a judge has open  781 bytes, no extra request
  ✓ brokers: it is well under the 8 KB image budget
  ✓ brokers: nothing spilled out of the favicon href
  ✓ brokers: the page says what it is when its URL is pasted somewhere
  ✓ brokers: a theme colour is set, so browser chrome matches the room
  ✓ brokers: the document declares a language

browser storage
  ✓ src/ uses no localStorage, sessionStorage or indexedDB

manifests
  ✓ candle: game.manifest.json parses
  ✓ candle: schemaVersion/apiVersion are 1
  ✓ candle: gameId matches the contract name  CandleGame
  ✓ candle: defaultLocale exists in locales
  ✓ candle: capabilities.openSession is true
  ✓ candle: capabilities.submitAction is true (it is multi-action)  BURN is an on-chain player action
  ✓ survey: game.manifest.json parses
  ✓ survey: schemaVersion/apiVersion are 1
  ✓ survey: gameId matches the contract name  SurveyGame
  ✓ survey: defaultLocale exists in locales
  ✓ survey: capabilities.openSession is true
  ✓ survey: capabilities.submitAction is true (it is multi-action)  SEND A SURVEYOR is an on-chain player action
  ✓ brokers: game.manifest.json parses
  ✓ brokers: schemaVersion/apiVersion are 1
  ✓ brokers: gameId matches the contract name  BrokersGame
  ✓ brokers: defaultLocale exists in locales
  ✓ brokers: capabilities.openSession is true
  ✓ brokers: capabilities.submitAction is true (it is multi-action)  ASK is an on-chain player action
  ✓ no two entries claim the same gameId  the host keys a game by it

contract
  ✓ the ICasinoGameV2 interface is vendored beside the game  so a standard toolchain can compile it
  ✓ and is byte-identical to the SDK once comments are stripped
  ✓ Candle.sol imports the interface by a path that resolves anywhere
  ✓ Paytable.sol is generated, never hand-edited
  ✓ Candle.sol declares no constructor arguments  the SDK deploys it without any
  ✓ Candle.sol: every hook is view, so the game holds no storage
  ✓ Candle.sol: no unbounded loop in a settlement path  claude.md §3
  ✓ Survey.sol imports the interface by a path that resolves anywhere
  ✓ Manifest.sol is generated, never hand-edited
  ✓ Survey.sol declares no constructor arguments  the SDK deploys it without any
  ✓ Survey.sol: every hook is view, so the game holds no storage
  ✓ Survey.sol: no unbounded loop in a settlement path  claude.md §3
  ✓ Brokers.sol imports the interface by a path that resolves anywhere
  ✓ Market.sol is generated, never hand-edited
  ✓ Brokers.sol declares no constructor arguments  the SDK deploys it without any
  ✓ Brokers.sol: every hook is view, so the game holds no storage
  ✓ Brokers.sol: no unbounded loop in a settlement path  claude.md §3

generated documents
  ✓ README.md exists and is marked generated
  ✓ README.md carries CANDLE's declared RTP as an exact rational  the one number a judge will check
  ✓ and THE SURVEY's as well  every entry is submitted, so every number is published
  ✓ and THE BROKERS'
  ✓ README.md publishes the whole strategy band, not just the flattering end
  ✓ DEMO.md exists and is marked generated
  ✓ DEMO.md pastes real expected output, not a description of it  the verify:rtp headline and a verify:light row, both as captured
  ✓ a licence is present, so the source can actually be shared

bundle
  ✓ bundle < 150 KB gzipped  126.4 KB gzipped
  ✓ zero audio files (everything synthesised)
  ✓ no image over 8 KB
  ✓ dist/candle/game.manifest.json sits beside its page
  ✓ dist/survey/game.manifest.json sits beside its page
  ✓ dist/brokers/game.manifest.json sits beside its page
  ✓ the lobby exists and is not itself an entry

GATES GREEN  84 passed, 0 failed
```

And the frame budget, against a 12 ms p95:

```

  case                                p50      p95      p99    worst
  a burn at the flare, 1080p        0.004    0.005    0.009    0.224
  the flare, a phone                0.004    0.006    0.012    0.086
  an empty crate, first inch        0.003    0.006    0.007    0.106
  waiting for a word                0.003    0.003    0.005    0.094

  case                                p50      p95      p99    worst
  the roads, fog and a boat, 1080p    0.006    0.010    0.018    0.122
  the roads, a phone                0.006    0.007    0.010    0.096
  a settled voyage, no fog          0.005    0.006    0.009    0.095
  waiting for the manifest          0.005    0.006    0.008    0.067

```

---

## What to look at if you only have a minute

1. `src/games/{candle,survey,brokers}/core/solve.ts` — three dynamic programs
   over three different decision problems, all in exact rationals.
2. `src/games/brokers/core/weitzman.ts` — the reservation price, solved in
   closed form on the piecewise-linear segment it lands in, and then proved
   equal to the DP at every reachable state.
3. `contracts/Survey.sol` — and the comment on why the generative order is
   reversed, which is the whole reason a `view`-only contract can hide anything.
4. `npm run verify:rtp`, `verify:survey` and `verify:brokers` — check
   `96.9961%`, `97.4141%` and `96.9637%` against the README.
5. `docs/phases.md` — what each phase found, including the places the
   specification turned out to be wrong and what the measurement said instead.

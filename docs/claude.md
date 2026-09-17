# CLAUDE.md — working agreement for this repo

> Read this file **before** touching anything. It is the contract between you (the
> coding agent) and the project. `prd.md` is what we are building and why,
> `docs.md` is how it works, `plan.md` is the schedule. This file is the rules.

---

## 1. What this repo is

**Three** provably-fair on-chain wagering games for **Chain Jam Vol. 1**
(<https://jam.chain.wtf>), deadline **2026-09-20 23:59 UTC**, on one origin. Each
is a SEPARATE ENTRY: its own page, its own `game.manifest.json`, its own
contract, its own declared RTP. `/` is a lobby and is not an entry.

**CANDLE** — *a lot is on the table, the candle is burning, and every inch you
wait is worth less.* The bet object is a **discounted optimal-stopping problem**
(Gilbert–Mosteller, with a deterministic decay and a forced acceptance at the
horizon) dressed as a 17th-century English candle auction. There is no bust, no
accumulating multiplier, no ladder to climb. The only thing the player risks by
waiting is the value of the prize itself.

**THE SURVEY** — *a ship lies in the roads, every surveyor you send costs you,
and the only question is when you have seen enough.* The bet object is
**sequential hypothesis testing** — Wald's problem, with the sampling cost made
an explicit price. The player is not guessing a number and not refusing offers:
they are buying evidence. Its security model is the interesting part and it is
written up in `contracts/Survey.sol`: every hook is `view`, so the ship's
condition CANNOT be drawn at the start — it would simply be readable. Reports
come from the predictive distribution and her condition from the posterior, at
settlement, out of a word that does not exist until the call is locked in.

**THE BROKERS** — *you hold a claim on a wreck, every man who looks at it charges
you, and the question is when you have shopped it enough.* The bet object is
**search with recall** — Weitzman's Pandora's Box. Every price named stays
available, so the player never loses an offer by looking at one more; what they
spend is the fee. The optimal rule is an **index**, not a comparison of averages:
each broker gets a reservation price `z` solving `E[(X − z)⁺] = c`, you ask in
descending `z`, and you stop when what you hold beats the best remaining index.
On this floor the index order is the exact REVERSE of the average-price order,
which is the whole reason the theorem is worth publishing — and it is published,
in full, in the game's `?` panel. We are not selling an information edge; we are
selling the ten seconds in which a player decides whether to believe it.

Three decision problems, one sentence: **stop · learn · search**.

All three are dressed from one WORLD — Lloyd's Coffee House and the streets
around it, 1728 — and share a light model, a bridge, a chrome and one set of four
ink roles. They are **not** dressed from one room, and that is deliberate: see
§5.

If you ever find yourself implementing "cash out before it crashes" or "reveal tiles
until you hit a bomb", **stop** — you have drifted into a genre the jam explicitly
excludes.

---

## 2. Hard invariants — never break these

These are the things that make the entry eligible and correct. A change that
violates any of them is a bug, no matter how good it looks.

Where an invariant has a number in it, each game has its own — and all three are
checked. A rule that held for one game and was quietly dropped for the next would
be worse than never having had it.

| # | Invariant | Where it is enforced |
|---|---|---|
| I1 | Theoretical RTP under optimal play = **96.9961%** for CANDLE (`7577820426157 / 7812500000000`), **97.4141%** for THE SURVEY (`60883787 / 62500000`) and **96.9637%** for THE BROKERS (`1551418623 / 1600000000`) | `test/rtp.spec.ts`, `test/survey-rtp.spec.ts`, `test/brokers-rtp.spec.ts` — recomputed from each DP, never hardcoded anywhere else |
| I2 | **Every** reasonable fixed strategy lands inside the jam's 93–98% band. CANDLE's worst sensible policy is 93.577%; THE SURVEY holds it for every way of **buying evidence**, from sending nobody (94.400%) to sending everybody (93.295%); THE BROKERS holds the strictest form — every policy it publishes is in band, from taking the house's first price (93.500%) to asking everybody (93.946%). CANDLE and THE SURVEY each also publish policies BELOW the window on purpose, marked as such: waiting out a 2.00× lot (78.308%), and the two that read no evidence at all (88.600% and 60.000%). A band narrowed until everything fits inside it would not be a constraint | `test/strategy-band.spec.ts`, `test/survey-rtp.spec.ts`, `test/brokers-rtp.spec.ts` |
| I3 | Randomness is drawn by **rejection sampling**, never `word % n` | `Candle.sol`, `Survey.sol`, `Brokers.sol`, `src/shared/rng.ts`, `test/rng.spec.ts` |
| I4 | The player's decision is committed **before** the word that answers it exists — the next inch in CANDLE, the ship's condition in THE SURVEY, a broker's price in THE BROKERS | contract state machines; on chain in every `round-trip:*` |
| I5 | Max payout is exactly **25× stake** (CANDLE) / **20×** (THE SURVEY) / **4.9905×** (THE BROKERS — the best price on the floor, less the fee of the only man who names it), and `onSessionStart` reserves the whole win above the stake so the facet's cap (`escrowedStake + reservedProfit`) meets it with no slack | `Candle.sol`, `Survey.sol`, `Brokers.sol`, `test/caps.spec.ts`, `test/survey-parity.spec.ts`, `test/brokers-parity.spec.ts` |
| I6 | `onSessionStart` is a **pure function of `(wagerBase, gameData)`** and idempotent (production calls it twice, once with `sessionId == 0`) | `Candle.sol` — free, because every hook is `view` and the contract is stateless (`docs.md` §7.3.5) |
| I7 | `onRandomness` and `onPlayerAction` return `reservedProfitDelta = 0` — the reserve is taken **once**, at session start, and released **never** | `Candle.sol`, `docs.md` §7.3.3 |
| I8 | The page serves `Content-Security-Policy: frame-ancestors *` and **no** `X-Frame-Options` | `vercel.json`, checked in CI against the live origin |
| I9 | The jam widget `<script>` appears **exactly once** in the raw HTML (not injected by JS) | `index.html`, grep test in CI |
| I10 | The page is fully playable standalone with no host, no wallet, no modal, no splash | `src/bridge/demoHost.ts` |
| I11 | Contract math and client math agree bit-for-bit on every reachable state | `test/parity.spec.ts`, `test/survey-parity.spec.ts`, `test/brokers-parity.spec.ts`, and live in `npm run round-trip` / `round-trip:survey` / `round-trip:brokers` |
| I13 | THE SURVEY's ship is decided **after** the call, never before: the settling word is requested by `UNDERWRITE` and `DECLINE` needs none at all | `Survey.sol`, `test/survey-host.spec.ts`, and on chain in `npm run round-trip:survey` |
| I14 | THE BROKERS' optimal policy **is** Weitzman's index rule — not approximately, at every one of the 120 reachable states — and the index is published in full, asking order included | `src/games/brokers/core/weitzman.ts`, `npm run verify:brokers`, `test/brokers-rtp.spec.ts` |
| I15 | A broker's price is drawn by the word **his own fee bought**: it does not exist while the player is deciding whether to pay him, and `TAKE` draws nothing at all | `Brokers.sol`, `test/brokers-host.spec.ts`, and on chain in `npm run round-trip:brokers` |
| I12 | Zero audio files, zero image files above 8 KB — everything synthesised or drawn | bundle-size gate in CI |

If you need to change a number, change it in **one** place —
`src/games/candle/core/paytable.ts`, `src/games/survey/core/vessel.ts` or
`src/games/brokers/core/market.ts` — regenerate the Solidity with
`npm run gen:constants` / `gen:survey` / `gen:brokers`, regenerate the documents
with `npm run gen:readme` and `gen:pages`, and let the tests tell you what broke.
Never hand-edit the generated Solidity, and never type a number into a contract
that a DP could have produced: THE SURVEY's and THE BROKERS' declared RTPs are
`RTP_NUM / RTP_DEN` out of their generated libraries for exactly that reason, and
so is `MAX_PAYOUT_BP`.

---

## 3. Repo layout

```
├── contracts/
│   ├── Candle.sol            ICasinoGameV2. Solidity 0.8.30. No constructor
│   ├── Survey.sol            args, no storage, no unbounded loops.
│   ├── Brokers.sol
│   └── generated/            gen:constants / gen:survey / gen:brokers output.
│                             NEVER hand-edited.
├── index.html                the LIST. Not an entry: no jam widget, no metrics.
├── candle/index.html         one entry's page
├── survey/index.html         the next
├── brokers/index.html        and the third
├── src/
│   ├── lobby/                the door. No balance, no deposit, no wallet.
│   ├── shared/               what ALL THREE games use, and nothing that knows
│   │   │                     which game is calling
│   │   ├── bridge/           host.ts (GameHost<S, A>, generic over a session),
│   │   │                     chain.ts (the whole penpal path), prng.ts
│   │   ├── render/light.ts   the measurable light model, in basis points
│   │   ├── audio/            engine.ts (context, beds, grains) + pacing.ts
│   │   ├── math/rational.ts  exact BigInt rationals
│   │   └── ui/               tokens.css + table.css — the room and the furniture
│   └── games/<slug>/
│       ├── core/             the PURE core: this game's own maths
│       └── app/
│           ├── bridge/       its session shape, its demo host, its chain adapter
│           ├── render/       its own canvas. Nothing else draws.
│           ├── audio/        voice.ts (what a sound MEANS) + graphs.ts
│           └── ui/           thin React layer. Holds no game logic.
├── public/<slug>/
│   ├── game.manifest.json    one per entry, beside its page (that EXACT filename)
│   └── how/index.html        that game's OWN page: the model, the numbers, the
│                             band, how to check them. GENERATED by gen:pages,
│                             zero JavaScript, and NOT an entry — no widget.
├── public/how.css            one stylesheet for all three of those
├── test/
├── scripts/                  verify-rtp, verify-survey, verify-brokers, gen-*,
│                             gates, play*, round-trip*
├── spikes/                   throwaway SDK spikes + their .sol. Deleted after use.
├── sdk/casino-sdk/           the downloaded SDK. Not vendored, not committed.
├── docs/                     docs.md  prd.md  plan.md  claude.md
└── vercel.json
```

**The rule for `shared/`:** a file in there must not know which game is calling
it. `light.ts` takes a level in basis points, not an inch; `chain.ts` takes an
`encodeAction` and a `mapSession` and has never heard of a lot or a cargo. When
something in `shared/` needs a game's name to make sense, it belongs under
`games/<slug>/app/`.

> **Two corrections from D0.** The manifest is `game.manifest.json`, not
> `manifest.json` — the SDK reads that exact name. And the four planning documents
> live in `docs/`, not at the root.

**Rule:** every `src/games/<slug>/core/` is pure. No React, no DOM, no `window`,
no randomness of its own, no `Date.now()`. Everything in it must be callable from
a test with fixed inputs and give the same answer forever. This is the part a
judge will read.

---

## 4. How to work

### Before you write code
1. Re-read the relevant section of `docs.md`. If `docs.md` and the code disagree,
   `docs.md` wins until we consciously decide otherwise — then update `docs.md`
   **in the same commit**.
2. If the change touches money (paytable, wax ladder, caps, RNG), write the test
   first.

### While you write code
- **Small commits, conventional format.** `feat(render): blackbody falloff on wax`,
  `fix(rng): reject 16-bit windows >= 60000`.
- **No new dependencies** without a line in `docs.md` §Dependencies explaining why.
  The bundle budget is 150 KB gzipped for the whole game — measured per ENTRY,
  the document plus every chunk it loads, because that is what one player
  downloads and three entries share this origin. The generated documents
  (`/verify/`, `/<slug>/about/`, the four `how` leaves) carry no bundle at all
  and have a budget of their own: 40 KB gzipped for every one of them together,
  which is the gate that governs adding pages.
- **TypeScript strict.** No `any`, no `@ts-ignore`. If the types fight you, the
  design is wrong.
- Prefer a boring 20-line function over a clever 5-line one. A reviewer will read
  this under time pressure.

### Before you say you are done
Run, in this order, and paste the output into the PR/commit body:
```
npm run typecheck
npm test              # unit + parity + strategy band, all three games
npm run verify:rtp    # CANDLE's DP, all 30 reachable (inch, lot) states
npm run verify:survey # THE SURVEY's, all 126 (cargo, surveys, margin) states
npm run verify:brokers # THE BROKERS', all 120 (askedMask, bestPrice) states —
                      # and that Pandora's rule IS the DP at every one of them
npm run gates         # bundle size, CSP, widget tags, manifests, storage
```
A red gate is a failure. Do not "fix" a gate by loosening it.

---

## 5. Design law

One direction sentence, and everything obeys it:

> **Lloyd's Coffee House, London, 1728, lit by a single candle.**

- **Brightness is the multiplier.** In CANDLE the wax ladder (100 / 85 / 70 / 55
  / 40 %) is rendered as the actual luminance of the scene. THE SURVEY uses the
  same model over the same range on its own ladder — the DAY, one hour per
  surveyor — and deliberately not its premium ladder, which falls 1.5 points a
  head: a 1.5% change in luminance is invisible and inside 8-bit rounding, and a
  claim a reviewer cannot measure is one we do not make (`app/daylight.ts`). Its
  second measurable claim is the FOG: the ink over the ship is exactly
  `1 − P(the better call is right)`. THE BROKERS dims on what the day has COST:
  all four fees together are 14.7% of the stake, so the room falls to 70% across
  a whole round and no further — one honest range rather than a dramatic one. Its
  own second measurable claim is the floor itself, which is **logarithmic**, so
  equal distances up the board are equal multiples of the stake (a doubling is
  26.07% of the board wherever it sits).
  The general rule: When the candle is down to its
  last inch the room is genuinely dim. A player must be able to read how much the
  prize has decayed **without reading a number**. The number is there too, but it
  is confirmation, not information.
- **Four ink ROLES, and each game has its own four.** The roles are fixed and
  shared: `ink` is the room, `tallow` is the light source and every live value,
  `brass` is the money the player is deciding about, `oxblood` is the past tense
  and never carries text that has to be read. **No fifth role is approved, in any
  room.** What each role is MADE of belongs to the game:

  | | CANDLE | THE SURVEY | THE BROKERS |
  |---|---|---|---|
  | lit by | a tallow candle | the sky, through an open window | an Argand lamp over a slate board |
  | source | 2000K → 1500K | 6500K → 4300K | 2900K → 2500K |
  | `ink` | soot | wet slate-blue | warm charcoal |
  | `tallow` | tallow | bone | chalk |
  | `brass` | brass | verdigris | smalt blue |
  | `oxblood` | oxblood | rust | umber |

  This was one palette for all three until it was looked at side by side, and
  three near-identical amber pages is what "a template" looks like to a judge —
  lighting a dawn harbour with candlelight was also simply **wrong**. The rooms
  live in `shared/render/light.ts`, `[data-room]` on `<html>` says which one a
  page is, and `npm run verify:light` checks every one of them for WCAG AA
  against its OWN dimmest level. Nothing here is a free choice: a red was tried
  for THE BROKERS and could not be kept, because no red dark enough to read as
  ledger lead clears AA on that slate.

- **One gradient per light source, and it points where the light comes from.**
  A flame is a point, so CANDLE and THE BROKERS get a radial falloff. Daylight
  is not, so THE SURVEY gets a sheet from the horizon and a bar across the sill —
  two, and two is its whole budget. A third would mean something is being shaded
  for effect rather than lit from a source.

- **Every surface has a grain.** A perfectly smooth radial falloff is the single
  most recognisable tell of a scene that was described rather than drawn.
  `shared/render/grain.ts` bakes one deterministic noise tile per room — soot
  above the candle, damp off the water, mineral pitting on the slate — and it is
  a FINISH, never information: a browser that cannot bake it draws the room
  plainer and never wrong.

- **Each room writes in its own hand.** The layout, the grid, the type scale and
  the reading order are shared, so a player who learns one game reads the next in
  a second. The MARK is not: a printer's bill has straight edges and single
  hairlines, an underwriter's slip has a ruled margin and a ledger's double rule,
  and chalk on slate breaks and dusts the edge it is dragged along. Every one of
  those is the mark that room's own trade would leave; none of them is there
  because it looked nice.

- **The games are lit; the site around them is PRINTED.** The List at `/` and the
  three `how` pages are paper — a cool rag sheet, iron-gall type — and the only
  glowing things on the List are three windows cut into it, each showing its own
  room under its own light. That inversion is the whole identity of the door:
  everything a player sees afterwards is a dark room, and the one page that is
  not is the page that sends them there.

  The paper takes the rooms' accents, but **not their values** — an ink chosen to
  glow at 4.85:1 in a black room is far too pale on a sheet. `inkOnPaper()` walks
  each room's money ink down its own luminance until it clears AA against the
  paper, hue and chroma untouched, so the accent stays the same pigment seen in
  different light. Three new colours picked by eye would be the moment the palette
  stopped being derived; `test/list.spec.ts` checks the walk, and checks that the
  sheet the stylesheet paints is the sheet the accents were computed against.

- **The action area's SHAPE is the decision's shape.** All three games stacked
  their choices in one full-width column, which reads as a menu and says nothing
  — and hid the fact that the three decisions are not the same shape, which is
  the whole reason there are three games.

  | | the decision | the layout |
  |---|---|---|
  | CANDLE | two opposed terminal choices | a pair, side by side |
  | THE SURVEY | two terminal calls, plus one thing you BUY to postpone deciding | the purchase above a double rule; the calls paired below it |
  | THE BROKERS | one terminal sale, plus four men you may pay to hear | the sale, then a strip of four **under their own columns on the board** |

  THE BROKERS' strip is the one to protect: the board draws five fixed columns
  and the strip is five columns too, the first left empty because the house has
  already spoken and charges nothing. Pressing `3` asks the man whose slips are
  directly above it. That correspondence is also why his fee is no longer printed
  on his button — his column prints it six inches above, and saying it twice is
  the kind of tidy redundancy that makes an interface feel written by nobody. The
  fee rides on the accessible name instead, which is what a screen reader has in
  place of the column it cannot see.

- **Readings are not controls.** The chrome was six identical outlined pills in
  two wrapped rows — the game's name, a badge, a purse, REFILL, the book and
  three switches, all the same weight and shape. Six equal objects is what a
  toolbar looks like when nobody decided what any of them was. There are three
  kinds and they now look like three: the **identity** (the name, and whether
  this is play money), the **readings** (the purse is a figure the room tells
  you, set like the figures in the readout, because it is one), and the
  **instrument** — the book and the three switches inside one bordered panel,
  ruled apart by hairlines and carrying its room's own edge. A switch that is on
  is lit rather than merely labelled.

- **One page, one job.** A player who wants to play does not scroll past a
  derivation, and a judge who wants the derivation does not hunt for it inside a
  modal. So the model, the tables, the strategy band and the verification
  commands live on `/<slug>/how/` — generated from that game's own DP by
  `npm run gen:pages`, zero JavaScript, no jam widget, not an entry. The `?`
  panel inside a game keeps the same numbers and links out to the full page in a
  NEW TAB, because navigating an iframe away mid-round throws away a staked
  session.
- **Light cools as it is spent.** Every source walks DOWN the Planckian locus as
  it goes, because that is what light does, and the ink shifts with it. A
  reviewer can verify it with a colour picker. The three differ in where they
  START: only the sky begins above 5000K, so only the sky goes from blue-white to
  warm while the two flames go from amber to red. A flame cannot be 6500K and the
  sky cannot be 2000K, which is why this is a fact about the room and not a
  setting.
- **Hierarchy by luminance, never by size.** Type scale is fixed.
- **No AI slop.** No stock gradients, no glassmorphism, no generated textures, no
  emoji in the UI, no purple-to-cyan. If it looks like a template, delete it.
- **Zero clicks to comprehension.** On load the player sees the whole position
  and the switches: in CANDLE the lot, its face value, the candle with five pins
  and the payout if claimed now; in THE SURVEY the manifest, what underwriting
  and declining each pay, and where the reports stand; in THE BROKERS the whole
  floor at once — every man, his fee, and the price in hand against what selling
  it now would pay. No tutorial, no modal, no connect-wallet.

### Audio law
- Three synthesis graphs, no files: **room** (coffee-house noise bed, filtered),
  **wax** (crackle, filtered noise bursts keyed to the flame), **event**
  (pin drop, gavel, the flare).
- Sound must be *informative*: in CANDLE the pitch of the pin drop rises with the
  face value, so an experienced player hears a good lot before they read it. In
  THE SURVEY the bell is the BELIEF — a report rings at a pitch set by the
  posterior the reports now add up to, so a disagreeing pair rings the same note
  twice — and the report's own direction is carried by timbre instead. In THE
  BROKERS the pitch is the PRICE and the interval says whether it beat the one
  you already hold, so a man who names something worthless is heard as such
  before the number lands.
- Muted by default is **not** acceptable — unmuted with a visible, one-key toggle.

---

## 6. Language and copy

- The auctioneer's voice is period-plausible but never twee. "Lot on the table."
  "One inch gone." "The candle is guttering." Short, flat, no exclamation marks.
- Never write "you lose". Write what happened: "Claimed at the fourth inch."
- Never congratulate the player for a bad decision.
- All UI copy lives in each game's `app/ui/copy.ts`. No string literals in
  components. THE SURVEY's voice is the underwriter's, not the auctioneer's:
  "Underwritten after the second survey. She was rotten." THE BROKERS' is the
  floor's: "Sold at 1.02x, the house's own price. 4.2% in fees." Never "you
  lose" — and in THE BROKERS there is no losing state to name: the worst the
  game can do is 0.7030x.

---

## 7. Things that are explicitly out of scope

Do not build these, do not suggest them, do not leave TODOs for them:

- Wallet connection UI (the host owns the wallet)
- Balance persistence in the standalone demo (`localStorage` is forbidden — a
  purse that looks like it survives a reload and does not is worse than one that
  obviously resets)
- Leaderboards, social features, chat, referrals
- Multiple candle lengths / bet-shape selectors in v1 (see `plan.md` stretch list)
- Any "auto-play" or "turbo through 100 rounds" mode. This is a decision game; an
  autoplayer is an admission that the decision is fake.
- Any mechanic where the player can lose more than their stake
- Loss-chasing nudges: no "you were one inch away!" toasts, no escalating
  bet suggestions, no timers that pressure a deposit

---

## 8. Honesty rules

This project's whole pitch is that the math is checkable. That means:

- Every number printed in the README, the UI, or the submission must come out of
  `npm run verify:rtp` or `npm run verify:survey`, not out of a memory or an
  estimate. Both READMEs are one generated file; CI regenerates it and fails on a
  diff.
- The RTP we declare is the **optimal-play** RTP (96.9961%) and we also publish
  the full strategy band, including what a careless player gets. We do not hide
  the worst case.
- The strategy table is published in-game under `?` and in `docs.md`. We are not
  selling an information edge over the player.
- If a claim cannot be reproduced by a reviewer in under a minute, either make it
  reproducible or delete the claim.

---

## 9. When you are stuck

- SDK behaviour you cannot confirm from the downloaded package: **do not guess.**
  Write the smallest possible spike against the local simulator
  (`spikes/spike-*.mjs`, run with `npm run spike`), run it, and record the answer in `docs.md` §SDK notes.
- If a spike proves the SDK cannot do something the design needs, escalate to
  `plan.md` §Risks and take the documented fallback. Do not silently redesign the
  game.
- If you are behind schedule, cut from `plan.md` §Kill list — top down, no
  improvising.

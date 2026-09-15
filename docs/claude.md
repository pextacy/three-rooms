# CLAUDE.md — working agreement for this repo

> Read this file **before** touching anything. It is the contract between you (the
> coding agent) and the project. `prd.md` is what we are building and why,
> `docs.md` is how it works, `plan.md` is the schedule. This file is the rules.

---

## 1. What this repo is

**Two** provably-fair on-chain wagering games for **Chain Jam Vol. 1**
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

Both are dressed from one room — Lloyd's Coffee House, 1728 — and share a light
model, four inks, a bridge and a chrome (§3).

If you ever find yourself implementing "cash out before it crashes" or "reveal tiles
until you hit a bomb", **stop** — you have drifted into a genre the jam explicitly
excludes.

---

## 2. Hard invariants — never break these

These are the things that make the entry eligible and correct. A change that
violates any of them is a bug, no matter how good it looks.

Where an invariant has a number in it, each game has its own — and both are
checked. A rule that held for one game and was quietly dropped for the second
would be worse than never having had it.

| # | Invariant | Where it is enforced |
|---|---|---|
| I1 | Theoretical RTP under optimal play = **96.9961%** for CANDLE (`7577820426157 / 7812500000000`) and **97.4141%** for THE SURVEY (`60883787 / 62500000`) | `test/rtp.spec.ts`, `test/survey-rtp.spec.ts` — recomputed from each DP, never hardcoded anywhere else |
| I2 | **Every** reasonable fixed strategy lands inside the jam's 93–98% band. CANDLE's worst sensible policy is 93.577%; THE SURVEY holds the stricter form — **every policy it publishes** is in band, from sending nobody (94.400%) to sending everybody (93.295%) | `test/strategy-band.spec.ts`, `test/survey-rtp.spec.ts` |
| I3 | Randomness is drawn by **rejection sampling**, never `word % n` | `Candle.sol`, `src/game/rng.ts`, `test/rng.spec.ts` |
| I4 | The player's decision at inch *k* is committed **before** the word for inch *k+1* exists | contract state machine |
| I5 | Max payout is exactly **25× stake** (CANDLE) / **20×** (THE SURVEY), and `onSessionStart` reserves `+24×` / `+19×` so the facet's cap (`escrowedStake + reservedProfit`) meets it with no slack | `Candle.sol`, `Survey.sol`, `test/caps.spec.ts`, `test/survey-parity.spec.ts` |
| I6 | `onSessionStart` is a **pure function of `(wagerBase, gameData)`** and idempotent (production calls it twice, once with `sessionId == 0`) | `Candle.sol` — free, because every hook is `view` and the contract is stateless (`docs.md` §7.3.5) |
| I7 | `onRandomness` and `onPlayerAction` return `reservedProfitDelta = 0` — the reserve is taken **once**, at session start, and released **never** | `Candle.sol`, `docs.md` §7.3.3 |
| I8 | The page serves `Content-Security-Policy: frame-ancestors *` and **no** `X-Frame-Options` | `vercel.json`, checked in CI against the live origin |
| I9 | The jam widget `<script>` appears **exactly once** in the raw HTML (not injected by JS) | `index.html`, grep test in CI |
| I10 | The page is fully playable standalone with no host, no wallet, no modal, no splash | `src/bridge/demoHost.ts` |
| I11 | Contract math and client math agree bit-for-bit on every reachable state | `test/parity.spec.ts`, `test/survey-parity.spec.ts`, and live in `npm run round-trip` / `round-trip:survey` |
| I13 | THE SURVEY's ship is decided **after** the call, never before: the settling word is requested by `UNDERWRITE` and `DECLINE` needs none at all | `Survey.sol`, `test/survey-host.spec.ts`, and on chain in `npm run round-trip:survey` |
| I12 | Zero audio files, zero image files above 8 KB — everything synthesised or drawn | bundle-size gate in CI |

If you need to change a number, change it in **one** place —
`src/games/candle/core/paytable.ts` or `src/games/survey/core/vessel.ts` —
regenerate the Solidity with `npm run gen:constants` / `npm run gen:survey`,
regenerate the documents with `npm run gen:readme`, and let the tests tell you
what broke. Never hand-edit the generated Solidity, and never type a number into
a contract that a DP could have produced: THE SURVEY's declared RTP is
`SurveyManifest.RTP_NUM / RTP_DEN` for exactly that reason.

---

## 3. Repo layout

```
├── contracts/
│   ├── Candle.sol            ICasinoGameV2. Solidity 0.8.30. No constructor
│   ├── Survey.sol            args, no storage, no unbounded loops.
│   └── generated/            gen:constants / gen:survey output. NEVER hand-edited.
├── index.html                the LOBBY. Not an entry: no jam widget, no metrics.
├── candle/index.html         an entry's page
├── survey/index.html         the other entry's page
├── src/
│   ├── lobby/                the door. No balance, no deposit, no wallet.
│   ├── shared/               what BOTH games use, and nothing that knows which
│   │   │                     game is calling
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
│   └── game.manifest.json    one per entry, beside its page (that EXACT filename)
├── test/
├── scripts/                  verify-rtp, verify-survey, gen-*, gates, play*
├── spikes/                   throwaway SDK spikes + their .sol. Deleted after use.
├── sdk/casino-sdk/           the downloaded SDK. Not vendored, not committed.
├── docs/                     docs.md  prd.md  plan.md  phases.md  claude.md
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
  The bundle budget is 150 KB gzipped for the whole game.
- **TypeScript strict.** No `any`, no `@ts-ignore`. If the types fight you, the
  design is wrong.
- Prefer a boring 20-line function over a clever 5-line one. A reviewer will read
  this under time pressure.

### Before you say you are done
Run, in this order, and paste the output into the PR/commit body:
```
npm run typecheck
npm test              # unit + parity + strategy band, both games
npm run verify:rtp    # CANDLE's DP, all 30 reachable (inch, lot) states
npm run verify:survey # THE SURVEY's, all 126 (cargo, surveys, margin) states
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
  `1 − P(the better call is right)`.
  The general rule: When the candle is down to its
  last inch the room is genuinely dim. A player must be able to read how much the
  prize has decayed **without reading a number**. The number is there too, but it
  is confirmation, not information.
- **Four inks only:** tallow (warm white, the flame and live values), brass (the
  lot on the table), oxblood (a lot you let burn), ink (the room). No fifth colour
  is approved. No gradients except the flame's own falloff.
- **Warm light cools as it dims.** Tallow shifts down the blackbody curve as
  luminance drops, because a real flame does. A reviewer can verify it with a
  colour picker. It costs nothing.
- **Hierarchy by luminance, never by size.** Type scale is fixed.
- **No AI slop.** No stock gradients, no glassmorphism, no generated textures, no
  emoji in the UI, no purple-to-cyan. If it looks like a template, delete it.
- **Zero clicks to comprehension.** On load the player sees the whole position
  and the switches: in CANDLE the lot, its face value, the candle with five pins
  and the payout if claimed now; in THE SURVEY the manifest, what underwriting
  and declining each pay, and where the reports stand. No tutorial, no modal, no
  connect-wallet.

### Audio law
- Three synthesis graphs, no files: **room** (coffee-house noise bed, filtered),
  **wax** (crackle, filtered noise bursts keyed to the flame), **event**
  (pin drop, gavel, the flare).
- Sound must be *informative*: in CANDLE the pitch of the pin drop rises with the
  face value, so an experienced player hears a good lot before they read it. In
  THE SURVEY the bell is the BELIEF — a report rings at a pitch set by the
  posterior the reports now add up to, so a disagreeing pair rings the same note
  twice — and the report's own direction is carried by timbre instead.
- Muted by default is **not** acceptable — unmuted with a visible, one-key toggle.

---

## 6. Language and copy

- The auctioneer's voice is period-plausible but never twee. "Lot on the table."
  "One inch gone." "The candle is guttering." Short, flat, no exclamation marks.
- Never write "you lose". Write what happened: "Claimed at the fourth inch."
- Never congratulate the player for a bad decision.
- All UI copy lives in each game's `app/ui/copy.ts`. No string literals in
  components. THE SURVEY's voice is the underwriter's, not the auctioneer's:
  "Underwritten after the second survey. She was rotten." Never "you lose".

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

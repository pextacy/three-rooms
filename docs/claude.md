# CLAUDE.md — working agreement for the CANDLE repo

> Read this file **before** touching anything. It is the contract between you (the
> coding agent) and the project. `prd.md` is what we are building and why,
> `docs.md` is how it works, `plan.md` is the schedule. This file is the rules.

---

## 1. What this repo is

**CANDLE** — a provably-fair on-chain wagering game built for **Chain Jam Vol. 1**
(<https://jam.chain.wtf>), deadline **2026-09-20 23:59 UTC**.

One sentence: *a lot is on the table, the candle is burning, and every inch you
wait is worth less.*

The bet object is a **discounted optimal-stopping problem** dressed as a 17th-century
English candle auction. There is no bust, no accumulating multiplier, no ladder to
climb. The only thing the player risks by waiting is the value of the prize itself.

If you ever find yourself implementing "cash out before it crashes" or "reveal tiles
until you hit a bomb", **stop** — you have drifted into a genre the jam explicitly
excludes.

---

## 2. Hard invariants — never break these

These are the things that make the entry eligible and correct. A change that
violates any of them is a bug, no matter how good it looks.

| # | Invariant | Where it is enforced |
|---|---|---|
| I1 | Theoretical RTP under optimal play = **96.9961%** (exact rational `7577820426157 / 7812500000000`) | `test/rtp.spec.ts`, recomputed from the DP, not hardcoded |
| I2 | **Every** reasonable fixed strategy lands inside the jam's 93–98% band (worst sensible = 93.577%) | `test/strategy-band.spec.ts` |
| I3 | Randomness is drawn by **rejection sampling**, never `word % n` | `Candle.sol`, `src/game/rng.ts`, `test/rng.spec.ts` |
| I4 | The player's decision at inch *k* is committed **before** the word for inch *k+1* exists | contract state machine |
| I5 | Max payout is exactly **25× stake**, and `onSessionStart` **reserves `+24 × wager`** so the facet's cap (`escrowedStake + reservedProfit`) meets it with no slack | `Candle.sol`, `test/caps.spec.ts`, proven end-to-end in `docs.md` §7.3.7 |
| I6 | `onSessionStart` is a **pure function of `(wagerBase, gameData)`** and idempotent (production calls it twice, once with `sessionId == 0`) | `Candle.sol` — free, because every hook is `view` and the contract is stateless (`docs.md` §7.3.5) |
| I7 | `onRandomness` and `onPlayerAction` return `reservedProfitDelta = 0` — the reserve is taken **once**, at session start, and released **never** | `Candle.sol`, `docs.md` §7.3.3 |
| I8 | The page serves `Content-Security-Policy: frame-ancestors *` and **no** `X-Frame-Options` | `vercel.json`, checked in CI against the live origin |
| I9 | The jam widget `<script>` appears **exactly once** in the raw HTML (not injected by JS) | `index.html`, grep test in CI |
| I10 | The page is fully playable standalone with no host, no wallet, no modal, no splash | `src/bridge/demoHost.ts` |
| I11 | Contract math and client math agree bit-for-bit on every reachable state | `test/parity.spec.ts` |
| I12 | Zero audio files, zero image files above 8 KB — everything synthesised or drawn | bundle-size gate in CI |

If you need to change a number in the paytable, change it in **one** place
(`src/game/paytable.ts`), regenerate the constants for Solidity with
`npm run gen:constants`, and let the tests tell you what broke. Never hand-edit
the Solidity constants.

---

## 3. Repo layout

```
candle/
├── contracts/
│   └── Candle.sol            ICasinoGameV2 implementation. Solidity 0.8.30.
│                             No constructor args. No unbounded loops.
├── index.html                the LOBBY. Not an entry: no jam widget, no metrics.
├── candle/index.html         an entry's page
├── src/
│   ├── lobby/                the door. No balance, no deposit, no wallet.
│   ├── shared/               everything a second game reuses unchanged
│   │   ├── bridge/           penpal host + the free-play host, one interface
│   │   ├── render/           light.ts (the measurable light model) + scene.ts
│   │   └── audio/            three Web Audio graphs. No files.
│   └── games/<slug>/
│       ├── core/             the PURE core: the game's own maths
│       └── app/ui/           thin React layer. Holds no game logic.
├── public/<slug>/
│   └── game.manifest.json    one per entry, beside its page (that EXACT filename)
├── contracts/generated/      gen:constants output. NEVER hand-edited.
├── test/
├── scripts/                  verify-rtp, gen-constants, gates
├── spikes/                   throwaway SDK spikes + their .sol. Deleted after use.
├── sdk/casino-sdk/           the downloaded SDK. Not vendored, not committed.
├── docs/                     docs.md  prd.md  plan.md  phases.md  claude.md
└── vercel.json
```

> **Two corrections from D0.** The manifest is `game.manifest.json`, not
> `manifest.json` — the SDK reads that exact name. And the four planning documents
> live in `docs/`, not at the root.

**Rule:** `src/game/` is pure. No React, no DOM, no `window`, no randomness of its
own, no `Date.now()`. Everything in it must be callable from a test with fixed
inputs and give the same answer forever. This is the part a judge will read.

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
npm test            # unit + parity + strategy band
npm run verify:rtp  # exhaustive DP recomputation, all 30 reachable states
npm run gates       # bundle size, CSP, widget-tag, manifest, cold-open budget
```
A red gate is a failure. Do not "fix" a gate by loosening it.

---

## 5. Design law

One direction sentence, and everything obeys it:

> **Lloyd's Coffee House, London, 1728, lit by a single candle.**

- **Brightness is the multiplier.** The wax ladder (100 / 85 / 70 / 55 / 40 %) is
  rendered as the actual luminance of the scene. When the candle is down to its
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
- **Zero clicks to comprehension.** On load the player sees: the lot on the table,
  its face value, the candle with five pins, the payout if claimed now, and two
  buttons. No tutorial, no modal, no connect-wallet.

### Audio law
- Three synthesis graphs, no files: **room** (coffee-house noise bed, filtered),
  **wax** (crackle, filtered noise bursts keyed to the flame), **event**
  (pin drop, gavel, the flare).
- Sound must be *informative*: the pitch of the pin drop rises with the face value
  of the lot being offered, so an experienced player hears a good lot before they
  read it.
- Muted by default is **not** acceptable — unmuted with a visible, one-key toggle.

---

## 6. Language and copy

- The auctioneer's voice is period-plausible but never twee. "Lot on the table."
  "One inch gone." "The candle is guttering." Short, flat, no exclamation marks.
- Never write "you lose". Write what happened: "Claimed at the fourth inch."
- Never congratulate the player for a bad decision.
- All UI copy lives in `src/ui/copy.ts`. No string literals in components.

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
  `npm run verify:rtp`, not out of a memory or an estimate.
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

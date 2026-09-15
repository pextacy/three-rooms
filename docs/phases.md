# PHASES — CANDLE

Execution phases derived from `plan.md`. `plan.md` is the *calendar*; this file is the
*state machine*. A phase is done when its **exit gate** passes — not when its checklist
looks full.

**Rules of engagement**

- Phases are strictly ordered. Do not start phase *n+1* while phase *n*'s gate is red.
- Every phase ends with its findings written into `docs.md` in the **same commit** as the
  code (`claude.md` §4).
- Tests come last *within* a phase, never last within the project: the phase that
  introduces money-touching code writes the test in the same phase (`claude.md` §4).
- If you are behind, cut from `plan.md` §Kill list — top down, never improvised.

**Status legend:** ⬜ not started · 🟡 in progress · ✅ gate passed · ❌ gate failed

**Phases 0–6 closed.** The build is live and audited for production. The video, the contract deployment and the submission are human steps.

---

## Phase 0 — De-risk & skeleton  ·  D0 (Sun 09-14)  ·  ✅

The entire design rested on one unproven assumption: **can a single session consume
more than one VRF word?** It can. `prd.md` §4.1 stands as written.

| # | Deliverable | Status |
|---|---|---|
| 0.1 | SDK v0.2.0 downloaded, unpacked, dependencies installed | ✅ |
| 0.2 | Local stack runs: chain + real ECVRF node + simulator (:3300) + coinflip (:3100) | ✅ |
| 0.3 | Coinflip example driven end to end, unmodified — 3/3 sessions settled | ✅ |
| 0.4 | `ICasinoGameV2` + `LocalCasinoHost` read in full; 10 findings in `docs.md` §7.3 | ✅ |
| 0.5 | **Spike A — multi-draw** — 5 distinct VRF words in one session, a `BURN` between each | ✅ |
| 0.6 | **Spike B — hard timeout** — forfeits at **90 %** of `quoteForfeitPayout` | ✅ |
| 0.7 | Repo skeleton per `claude.md` §3; `vercel.json`, widget tag, CI, gates | ✅ |
| 0.8 | Header gate verified against a served build — CSP present, no `X-Frame-Options` | ✅ |

**Exit gate — result**

1. ✅ Spike A answered in writing (`docs.md` §7.3.1) and backed by code that ran:
   `spikes/spike-multidraw.mjs`, 22/22 green.
2. ✅ Spike B answered (`docs.md` §7.3.2); `docs.md` §3.4 corrected to 90 %.
3. ✅ `npm run build` → 69.0 KB gzipped; `npm run gates` 18/18 green, including a
   live `--origin` read of the served build.
4. ✅ Local stack runs.

**Spike evidence** — `npm run sdk:stack`, then `npm run spike`:

| Spike | Proves | Result |
|---|---|---|
| `spike-multidraw.mjs` | Spike A, Spike B, I4, I5 arithmetic, caps, risk params | 22/22 |
| `spike-maxpayout.mjs` | a **real** 25× settles through the facet cap (R6) | 5/5 |
| `spike-coinflip.mjs` | the reference game works on this stack | 3/3 |

**Four things the spike found that the spec had wrong.** All were cheap here and
expensive later:

| # | Spec said | Reality |
|---|---|---|
| 1 | `payout = stake * faceBp * waxBp / 1e8` (`docs.md` §3.3) | `/ 1e6`. With `1e8` the 25× lot pays 0.25× and `openSession` reverts on an underflow. |
| 2 | `quoteCaps` reserves for the 25× (I5) | It only sets a **ceiling**. `reservedProfit` starts at **0**; `onSessionStart` must return `+24 × wager` or every win above 1× reverts. |
| 3 | A timed-out session claims the lot at **full** value (`docs.md` §3.4) | The facet takes **10 %**, unconditionally. |
| 4 | The manifest is `public/manifest.json`, declaring the contract address and RTP | It is `game.manifest.json`, and the schema **has no such fields**. |

**Carried into phase 1**

- `contracts/Candle.sol` takes its shape from `spikes/CandleSpike.sol`, but its
  constants come from `npm run gen:constants` — never hand-written.
- The fifth inch needs no on-chain `BURN` guard (the session settles inside
  `onRandomness` and never re-enters `WAITING_PLAYER_ACTION`), but keep the explicit
  revert: it is a test case per `docs.md` §2.5.
- `gameState` is 4 bytes — `uint8 inch, uint16 faceBp, uint8 hasLot`. It is emitted,
  hashed and echoed every step at ~30 gas/byte, so it stays small.
- Delete `spikes/` once `test/parity.spec.ts` covers what they proved.

**Not done — needs the user**

`plan.md` D0 also asks for a Vercel project and a blank deploy at the production
URL. That needs a Vercel login this session does not have. The header *config* is
proven (`scripts/serve-with-headers.mjs` applies the same `vercel.json` and
`npm run gates --origin` reads it back over real HTTP), and CI re-reads the live
origin once `PRODUCTION_ORIGIN` is set. **This is the one open item in phase 0.**

---

## Phase 1 — Math & contract  ·  D1 (Mon 09-15)  ·  ✅

The part a judge will actually read. Pure, exact, reproducible.

| # | Deliverable | Status |
|---|---|---|
| 1.1 | `src/game/paytable.ts`, `src/game/wax.ts` — constants from `docs.md` §9 | ✅ |
| 1.2 | `src/game/solve.ts` + `rational.ts` — the DP in exact BigInt rationals, never floats | ✅ |
| 1.3 | `npm run verify:rtp` prints **96.9961%** and the five thresholds, recomputed | ✅ |
| 1.4 | `src/game/rng.ts` — rejection sampling, 16-bit windows, reject ≥ 60000 | ✅ |
| 1.5 | `src/game/round.ts` — the state machine; illegal transitions rejected, not ignored | ✅ |
| 1.6 | `npm run gen:constants` → `contracts/generated/Paytable.sol` | ✅ |
| 1.7 | `contracts/Candle.sol` — five hooks, one `_payout()`, per-inch draws | ✅ |
| 1.8 | Tests: rtp, strategy-band, rng, round, parity, caps — **107 passing** | ✅ |

**Exit gate — result**

✅ A real round settles in the simulator. `npm run round-trip`: stake 100 chUSD in,
three inches burned, claim at the fourth on a 1.00× lot, payout
**55000000000000000000 wei** — `100 × 100 × 5500 / 1e6`, exact to the base unit,
and equal to what the pure core computed in lockstep.

**What the numbers came out at**

```
Declared RTP (optimal play) : 96.9961%   = 7577820426157 / 7812500000000
House edge                  :  3.0039%
Thresholds                  : 0.75418 / 0.64664 / 0.51392 / 0.32000 / forced
P(payout >= 1x)             : 36.4741%     P(payout = 0) : 20.3531%
Standard deviation          :  1.7568      Mean length   : 3.12 inches
Strategy band               : 93.577% … 96.996%, every sensible policy in range
```

Every figure above is reproduced by `npm run verify:rtp` and asserted in
`test/rtp.spec.ts` against the DP, not against a constant.

**One more spec error found and corrected**

`docs.md` §9.5 and `prd.md` §4.5 put the degenerate "claim the first lot
regardless" baseline at **46.500%**. It is **44.000%** — `E[face] × wax(1) = 0.44
× 1.00`. An exhaustive scan over 200,000 per-inch policies found none worth
46.500%, so the old number corresponds to no policy at all. Corrected in both.

**Two deliberate deviations from the spec, both recorded in `docs.md`**

1. The chi-square in `test/rng.spec.ts` runs **10⁶** draws, not 10⁷. At 10⁷ the
   keccak-backed uniformity tests take ~100 s and nobody runs the suite. The 10⁷
   claim moved to `npm run bench`, which does 10⁷ draws **and** 10⁷ rounds in 20 s.
2. `src/game/` carries no hash implementation, because it must stay pure. The
   rehash on window exhaustion (p ≈ 1.4 × 10⁻¹⁸) is injected: keccak in the
   contract and the parity tests, a fresh PRNG word in `demoHost`.

**Carried into phase 2**

- `payoutIfClaimedNow()` and `waxNow()` on the round state are what the UI reads;
  the UI holds no game logic of its own.
- The 4-byte `gameState` codec lives in `test/helpers/chain.ts` today. Phase 2
  needs it in `src/bridge/`, because the guest decodes `raw.gameState` from the
  host snapshot to recover a round after a reload.
- `spikes/` stays as the phase-0 record, and its contracts are out of the
  simulator's watch folder. `test/parity.spec.ts` and `test/caps.spec.ts` now cover
  everything the spikes proved, against the real contract — so phase 2 repurposes
  `npm run spike` into the SDK-symbol exerciser `plan.md` D2 asks for.

---

## Phase 2 — Playable  ·  D2 (Tue 09-16)  ·  ✅

| # | Deliverable | Status |
|---|---|---|
| 2.1 | `src/bridge/useCasinoHost.ts` — penpal, session lifecycle, bet limits, `ui.theme` | ✅ |
| 2.2 | `src/bridge/demoHost.ts` — xoshiro128\*\*, 2,000-chip purse, `REFILL`, **no browser storage** | ✅ |
| 2.3 | `src/ui/` — plain: lot, face value, inch counter, payout-if-claimed-now, two switches | ✅ |
| 2.4 | Full keyboard path (`docs.md` §6.3) | ✅ |
| 2.5 | `src/ui/copy.ts` — all strings; no literals in components | ✅ |
| 2.6 | `?` panel: paytable, wax ladder, thresholds, declared RTP, strategy band | ✅ |
| 2.7 | `npm run spike` — every SDK symbol used, exercised end to end — **28/28** | ✅ |

**Exit gate — the 50-round verdict**

Played through `npm run play` (the demo host, driven by three policies) and
`npm run spike` (the real contract, in the simulator). 124 tests green, including
17 that drive the actual React tree in jsdom.

*Numbers first, because they settle most of the argument:*

```
demo RTP over 20,000 rounds   96.38%   vs 96.9961% closed form   (0.5 sigma)
rounds that ask the player something   80.2%   = 1 - 0.669^4, exactly
offers below the last inch that are a real choice   33.1%   = 1 - 0.669
mean round length   3.13 inches   vs 3.12 closed form
```

**What is boring.** Two thirds of every offer is an empty crate, and an empty
crate is never claimable, so the player is clicking **LET IT BURN** on a decision
that is not a decision. A transcript reads:

```
Inch 1 · 100% · Empty crate 0.00x  -> LET IT BURN
Inch 2 ·  85% · Empty crate 0.00x  -> LET IT BURN
Inch 3 ·  70% · Empty crate 0.00x  -> LET IT BURN
Inch 4 ·  55% · Cordage 1.00x      -> CLAIM
```

Three quarters of that round is dead air. **This is a pacing problem, not a
paytable problem**, and the distinction matters because the fixes are different
and `plan.md` R2's levers are the expensive ones:

- 80.2 % of rounds *do* ask a real question, and the per-round decision rate is
  exactly `1 − 0.669⁴`. The dead air is *within* a round, not across rounds.
- The knife edge the design is built on is real and lands: a 0.50× lot against a
  0.51392 threshold at the third inch.
- So the lever is `plan.md` D4's pacing pass — *"hold longer on a lot that sits
  near the threshold, move fast through empty crates"* — not R2's retune. **The
  paytable is not being changed.** If D4's pacing does not fix it, R2 is still
  open on D3, which is the last honest moment.

**What is broken.** Nothing, now. Four real defects were found and fixed here,
three of them by code that only existed because it was written to be run:

1. **The PRNG emitted negative words.** `x & 0xffffffff` operates on *signed*
   32-bit ints in JS, so every output at or above 2³¹ came back negative. Caught
   by the range guard in `rng.ts` — an assertion that earned its place.
2. **`subscribe` fired synchronously**, which React forbids for an external
   store, and **`snapshot()` returned a fresh object every call**, which makes
   `useSyncExternalStore` re-render forever. Both found by the jsdom test on its
   first run. The store now caches its view and `subscribe` registers only.
3. A `localStorage` gate that matched the *comment forbidding* `localStorage`.
   It now strips comments first — a rule has to be documentable in the files it
   governs.

**What is confusing.** The word *wax* does double duty — the physical candle and
the discount. The UI says "Wax remaining 70%" next to "Claim now and take 14",
and nothing yet connects the two. Phase 3 is exactly where that connection gets
made *without a number*: brightness is the multiplier.

**One structural decision.** The SDK ships raw `.ts`, not `.d.ts`, so importing
it pulled its source into our program and broke our stricter flags on code that
is not ours to fix. `src/types/casino-sdk.d.ts` now declares the exact SDK
surface we depend on; Vite still aliases the real source at build time. Our
`strict` settings are fully intact, and `npm run spike` is what catches drift
when the SDK version moves.

**Carried into phase 3**

- Every burn is an on-chain transaction. Mean round length 3.13 inches means
  ~2.1 extra transactions per round — fine for the 8–15 s budget in `prd.md`
  §4.1, but it is why "move fast through empty crates" cannot mean "skip them".
- `src/ui/table.css` already carries the four inks and a fixed type scale, so the
  scene inherits the palette rather than fighting it.
- The `?` panel computes every number from the DP at render time, so it can never
  drift from the contract. Keep it that way.

---

## Phase 3 — Make it look real  ·  D3 (Wed 09-17)  ·  ✅

| # | Deliverable | Status |
|---|---|---|
| 3.1 | `src/render/scene.ts` — one canvas, one emitter, luminance driven by `WAX_BP[k]` | ✅ |
| 3.2 | Four inks, blackbody cooling on tallow as it dims, exactly one gradient | ✅ |
| 3.3 | The candle: five pins, a pin **falls** on each burn | ✅ |
| 3.4 | The table: the lot in brass; a let-burn lot goes oxblood and recedes | ✅ |
| 3.5 | The **flare** at inch 5 | ✅ |
| 3.6 | Cold-open budget — measured, not hoped | ✅ |
| 3.7 | Responsive to a phone; the gallery miniature checked small | ✅ |

**Exit gate — result**

> *"Screenshot the same round at inches 1 and 5 side by side. If a stranger cannot
> tell which one pays less **without reading a number**, the light model has failed."*

A screenshot is a judgement someone has to make with their eyes, so the two frames
were published as a page that runs the **shipping renderer** — not a mock-up —
with a control to hide every number and walk the candle down:

**https://claude.ai/code/artifact/7c924a3d-d07c-4f0e-bb6d-a0e680a195b3**

The claim underneath it is measurable, so it is measured. `npm run verify:light`:

```
inch   wax    flame              tallow   luminance   of inch 1
   1   100%   2000K    rgb(246 230 196)      0.8017     100.00%
   2    85%   1875K    rgb(237 215 129)      0.6819      85.06%
   3    70%   1750K    rgb(221 196 119)      0.5618      70.08%
   4    55%   1625K    rgb(203 174 107)      0.4403      54.92%
   5    40%   1500K    rgb(181 149  93)      0.3211      40.05%
```

**Brightness is literally the multiplier.** Relative luminance at each inch is
`WAX_BP[k] / 10000` of the first inch, to within byte rounding, for every ink that
carries light. Not "looks dimmer" — 40.05% against a ladder that says 40%.

**The light model is built in linear light, and that is the whole reason the claim
is true.** Scaling an sRGB byte by 0.4 leaves about 69% of the light, so the naive
version would have made the claim false while looking plausible. `inkAtWax` shifts
hue first, restores the ink's own luminance, and scales last; where a channel would
clip it desaturates toward its own luminance-grey, which preserves luminance
exactly, so gamut mapping cannot break the claim either.

**Two real defects, both found by the gate on its first run**

1. **The luminance ratio drifted** — 88.01% where the ladder said 85%. The hue tint
   was changing brightness as well as colour, and the flame's colour changes with
   the wax, so the error grew as the room dimmed. Fixed by making the shift
   relative to the first inch and renormalising to the ink's own luminance.
2. **Brass failed WCAG AA at the gutter** (3.59:1). Brass carries the lot's *face
   value* — that is information, not decoration. The ink was lightened until it
   clears AA at 40% of the light: it is now **4.85:1**.

Oxblood is deliberately *below* AA and stays there. It is a past-tense mark that
recedes, so it never carries text that has to be read; anything it would say is
said in words elsewhere. That is now a test, so it cannot drift into being used for
something load-bearing.

**Cold open — `npm run cold-open`**

| network | transfer | execute | total | |
|---|---|---|---|---|
| fast broadband (25 Mbps, 25 ms) | 77 ms | 70 ms | **147 ms** | within 400 |
| typical broadband (10 Mbps, 50 ms) | 168 ms | 70 ms | **238 ms** | within 400 |
| slow 4G (1.6 Mbps, 150 ms) | 723 ms | 70 ms | **793 ms** | over 400, inside the 1,200 hard budget |

Transfer is *modelled* and says so; execute is *measured* in jsdom; paint is
neither and is excluded. The p95 `prd.md` §7 actually commits to is a browser
number — the app now records it at `window.__candleColdOpenMs`.

**The finding worth a decision: React is the largest single line item.** About
45 KB gz of the 85 KB total, for a UI that is two buttons, a stake field and a
canvas. Aliasing `preact/compat` is a one-line vite change that would take it to
roughly 40 KB and ~200 ms off slow 4G. **Not done** — it is a dependency decision
with a `docs.md` §8 obligation, not a rendering one, and the 400 ms budget is met
on broadband either way. Logged in `LATER.md`.

**Carried into phase 4**

- The pin fall and the flare are already animated state in the scene loop, so the
  audio graphs have something to key off: a pin's fall and its sound are the same
  event (`docs.md` §6.1).
- `prefers-reduced-motion` stops the flame's flicker without touching the light
  model, so a player who asks for less motion loses nothing they need to read.
- The frame budget (p95 < 12 ms) is instrumented on the scene handle
  (`metrics().lastFrameMs`) but not yet asserted — that is a phase-4 gate, because
  it only means anything once the audio graphs are competing for the main thread.

---

## Phase 4 — Make it feel real  ·  D4 (Thu 09-18)  ·  ✅

| # | Deliverable | Status |
|---|---|---|
| 4.1 | `src/audio/graphs.ts` — room, wax, event. **Zero files** | ✅ |
| 4.2 | Pin-drop pitch rises with the face value of the lot being offered | ✅ |
| 4.3 | Gavel on claim, flare at the last inch, `M` to toggle | ✅ |
| 4.4 | **Ghost Lot** — drawn after the decision is locked, stated flatly | ✅ |
| 4.5 | Pacing derived from the numbers, not scripted | ✅ |
| 4.6 | Turbo (`T`) | ✅ |
| 4.7 | Frame budget p95 < 12 ms during a burn | ✅ |

**Exit gate — result**

> *"Play 100 rounds with sound on. If you are still arguing with yourself about
> the 0.50× at the third inch, the game works."*

Whether it sounds right is a judgement for ears, so the standalone build is
published, playable, sound on:
**https://claude.ai/code/artifact/099e5052-86b0-42d0-adcc-c99f60937009**

What can be measured, is. `npm run play -- 100`:

```
share of the waiting spent on a real choice : 45.4%
share of the OFFERS that are a real choice  : 33.0%
knife edge: 0.50x at inch 3, 0.01392 from the threshold, held 1102 ms
empty crate, any inch                       :  260 ms
```

**The pacing answers phase 2's complaint.** The auctioneer now spends 45.4% of its
waiting on the 33.0% of offers that are a real decision, and **4.2× longer** on the
knife edge than on an empty crate. None of it is scripted: `dwellMs` asks the DP
how far this lot sits from its claim threshold at this inch, so the timing cannot
drift from the maths. The 0.50× at the third inch is the longest hold in the
game — found by `knifeEdge()`, not typed in.

**The Ghost Lot, measured over 20,000 rounds**

```
shown after                              : 69.5% of rounds   (never after a gutter)
…and was an empty crate                  : 67.0%             the paytable says 66.9%
…and was worth more than what was claimed:  6.4%
```

It is honest rather than a tease: the ghost's distribution is the paytable's, so
two thirds of the time the lot you passed up was nothing at all. **The regret rate
is 6.4%** — small, true, and stated once.

### The Ghost Lot is drawn in the client, and `prd.md` §2 was wrong to promise otherwise

`prd.md` §2 claims the ghost's randomness is *"drawn after the decision is locked,
so it leaks nothing and is fully verifiable"*. Both halves cannot hold at once:

- Deriving it from the settling VRF word **leaks**. That word is public the moment
  the lot is revealed, so a player could compute the ghost *before* deciding and
  play against it.
- Requesting one more VRF word at settlement **is verifiable and cannot leak** —
  but it puts the payout behind a randomness fulfilment. `cancelStuckRandomness`
  refunds only `session.escrowedStake`, so a stuck word after a 25× claim would
  refund the stake and **destroy the win**. Verified in `LocalCasinoHost.sol:232`.

No retention loop is worth a mechanism that can eat a player's jackpot. So the
ghost is drawn locally, after settlement, from the same paytable and the same
rejection sampler — and the UI says plainly that it changed nothing. `prd.md` §2
corrected; `docs.md` §6.4 records the reasoning.

**Defence in depth on the one mechanic that could turn nasty.** `test/ghost.spec.ts`
asserts the ghost is null at every point before settlement, is null after a gutter
(there was no next lot, and inventing one would be a lie), never alters a payout,
and — walking *every string in `copy.ts`* — that nothing anywhere carries an
exclamation mark, "so close", "almost", "you were", "unlucky" or "try again".
`claude.md` §7 forbids near-miss theatre; now it is enforced rather than intended.

**Audio: three graphs, zero files**

| graph | how | keyed to |
|---|---|---|
| room | brown noise, lowpassed at 620 Hz with a peak at 340 | `roomGain(wax)` — the same ladder as the light |
| wax | bandpassed noise bursts at Poisson intervals | `crackleDensityHz(wax)` |
| event | pin drop, gavel, flare, burn | the round |

The pin drop spreads the paytable **logarithmically** — 196 Hz for an empty crate,
245 / 340 / 473 / 731 / 1568 Hz up to the *Sarah Christiana*. A linear ramp would
bunch every interesting lot into the bottom eighth of the range; the test asserts
each neighbouring pair is at least a musical third apart, so a practised player can
genuinely hear one lot from the next. The empty crate owns the floor exactly, so
"nothing" never sounds like a quiet "something".

**Frame budget — `npm run frame-budget`**

| case | p50 | p95 | p99 | worst |
|---|---|---|---|---|
| a burn at the flare, 1080p | 0.004 | **0.007** | 0.010 | 0.234 |
| the flare, a phone | 0.004 | 0.005 | 0.011 | 0.096 |
| an empty crate, first inch | 0.004 | 0.005 | 0.007 | 0.101 |
| waiting for a word | 0.003 | 0.003 | 0.007 | 0.091 |

Against a 12 ms budget, with three orders of magnitude spare. One check earns its
place beyond the budget: **every lot costs about the same to draw (1.4×)**, so a
rich lot cannot stutter into a tell the way a slow frame would.

**A defect the pacing exposed.** The UI tests slept a fixed 400 ms for each reveal.
Once dwell became a function of the lot, a knife edge took 1,102 ms and the tests
raced it. They now poll for the state they expect, which made the suite both
correct *and* twice as fast (16 s → 8 s) — a fixed sleep was paying the worst case
on every single reveal.

**Carried into phase 5**

- `npm run bundle:single` emits a self-contained HTML build (the jam widget
  stripped, since a preview is not the entry and must not report engagement).
  Useful for the demo video and for anyone without a bundler.
- The bundle is now 86.9 KB gzipped. Still inside the 150 KB budget, but the
  `preact/compat` lever in `LATER.md` is worth more now than it was on D3.

---

## Phase 5 — Ship  ·  D5 (Fri 09-19)  ·  🟡  *live, not yet submitted*

| # | Deliverable | Status |
|---|---|---|
| 5.1 | Jam widget: exactly one `<script>` in the **raw HTML** | ✅ |
| 5.2 | `public/game.manifest.json`; CI fetches it from the live origin | ✅ |
| 5.3 | `vercel.json`: `frame-ancestors *`, nothing else, no `X-Frame-Options` | ✅ |
| 5.4 | Deploy, then **re-read the live origin** | ✅ |
| 5.5 | The production URL renders inside a cross-origin iframe | ✅ |
| 5.6 | `npm run gates` green | ✅ 24/24 local, 25/25 against the live origin |
| 5.7 | `README.md` — every number generated, nothing typed by hand | ✅ |
| 5.8 | `DEMO.md` — a one-minute runbook with expected output inline | ✅ |
| 5.9 | Source access arranged (MIT `LICENSE`, clean history) | ✅ |
| 5.10 | **Submit at jam.chain.wtf** | ⬜ **needs a human** |

### Live

**https://candle-ashen-tau.vercel.app**

```
content-security-policy: frame-ancestors *
x-frame-options:         (absent)
game.manifest.json:      200, parses, submitAction: true
jam widget:              exactly once, in the served document
```

The live bundle is **byte-identical to the locally tested build** —
`47730857922f…` for both — so what is deployed is what the 186 tests ran against.
`penpal` and `maxAllowedReservedProfit` are present in it, which is the proof that
the aliased SDK guest source actually bundled rather than silently resolving to
nothing.

### `npm run ship`

One command: every gate, then the deploy, then **re-read the live origin**. The
order is the point — a framework preset can inject `X-Frame-Options` after the
fact, and the entry then still works at its own URL while the gallery shows pitch
text. Nobody notices until judging.

### What this phase found

1. **The build was not reproducible from a bare clone.** `sdk/` is downloaded, not
   vendored, so the vite alias had nothing to resolve on a clean checkout. The
   first deploy only worked because the local `sdk/` was uploaded with it.
   `vercel-build` now restores the SDK before building, and CI does the same.
2. **The deployment-specific URL sits behind Vercel SSO** and 302s every check.
   `ship.mjs` prefers the *alias*, which is the public one.
3. **The `X-Frame-Options` gate flagged the README generator** for documenting the
   rule — the same defect as the `localStorage` gate in phase 2. It now matches the
   header being **set** (a JSON key, a `setHeader` call, a `_headers` line, a
   `<meta>` tag), strips comments first, and was re-verified by injecting a bad
   preset and watching it fail. **A rule has to be documentable in the files it
   governs.**
4. **A gate that checked its own output.** The doc gate wanted `GATES GREEN` inside
   `DEMO.md`, but `DEMO.md` captures that very command — so it could never pass on
   a first run and never fail afterwards. It now checks for captured evidence that
   does not depend on itself.

### Generated, so it cannot go stale

`README.md` is written by `npm run gen:readme` from the DP; `DEMO.md` by
`npm run gen:demo`, with its expected output **captured from real runs**. CI
regenerates both and fails on a diff. A runbook whose "expected output" was typed
from memory is worse than no runbook: a reviewer who sees a mismatch cannot tell
whether the build is broken or the document is.

### The one open item

**Submitting at jam.chain.wtf.** That is a form, under the entrant's name, and it
is not mine to fill in. Everything it needs is ready:

- live URL — `https://candle-ashen-tau.vercel.app`
- declared RTP — **96.9961%**, exactly `7577820426157 / 7812500000000`
- source — this repository, MIT licensed
- reviewer runbook — `DEMO.md`

---

## Phase 6 — Polish & stop  ·  D6 (Sat 09-20)  ·  🟡  *shipped; the submission is the last step*

| # | Deliverable | Status |
|---|---|---|
| 6.1 | Fresh-eyes test — fix whatever they get wrong in the first thirty seconds | ✅ **found a real one** |
| 6.2 | A 60–90 s demo video: an early claim, a ride to the gutter, a 25× | 🟡 material ready, recording needs a human |
| 6.3 | Final README pass | ✅ |
| 6.4 | Resubmit / update the entry | ⬜ **needs a human** |

### 6.1 — the page opened on a form

The most visible thing in the project was wrong. `claude.md` §5 and `prd.md` §2
both require:

> **Zero clicks to comprehension.** On load the player sees: the lot on the table,
> its face value, the candle with five pins, the payout if claimed now, and two
> buttons. No tutorial, no modal, no connect-wallet.

The build opened on a stake input and a **LIGHT THE CANDLE** button. A judge with
90 seconds and twelve tabs open gets one look, and that look was a form.

Free play now deals the first round itself. The first frame reads:

```
Lot on the table · Cordage 1.00× · Inch 1 of 5 · Wax remaining 100%
Claim now and take 20 CHIPS   [CLAIM  Space]   [LET IT BURN  B]
```

**Only free play.** Inside a host a wager is real money and needs intent, so the
stake control stays the way in there. Between rounds the stake sits on the settled
board beside `DEAL AGAIN` — changing it is a decision and is never hidden. An empty
purse no longer throws; the board stays put with `REFILL` in reach.

`test/ui.spec.tsx` gained an explicit **ZERO CLICKS TO COMPREHENSION** test, so the
law is enforced rather than remembered. Five tests that asserted the old
form-first behaviour now assert the law instead — they had been *certifying the
bug*.

### A second defect, in the tests themselves

`parity` and `caps` checked whether the deployment **file** existed. That file
outlives the stack, so stopping the simulator turned into **24 red tests** —
exactly the failure the skip was built to prevent. They now ping the RPC:

```
with a chain     189 passed
without a chain  161 passed · 28 skipped, and it says why
```

### 6.2 — the material for the video

A 25× at the first inch is one round in five hundred, so waiting for one on camera
is not a plan. `?seed=<n>` makes free play deterministic — free play only; inside a
host the contract's VRF is the only authority and nothing client-side can reach it.

`npm run find:seed` searches for a sequence matching the brief and returns:

```
seed 198
  round 1    2.00× at inch 3   claimed at the third inch
  round 2    5.00× at inch 5   rode it to the gutter
  round 3    1.00× at inch 1   claimed at the first inch
  round 4   25.00× at inch 1   the Sarah Christiana — 25×
```

Four rounds, building to the jackpot at the inch where 25× is actually 25×.
Record at **https://candle-ashen-tau.vercel.app/?seed=198**.

### What is left

**Recording the video, and submitting at jam.chain.wtf.** Both are human steps.
Everything they need exists:

| | |
|---|---|
| Live URL | `https://candle-ashen-tau.vercel.app` |
| Demo sequence | `?seed=198` |
| Declared RTP | **96.9961%** = `7577820426157 / 7812500000000` |
| Source | this repository, MIT |
| Reviewer runbook | `DEMO.md` |

---

## Production readiness — the audit after phase 6

A pass over everything a phase gate does not cover, because "it works on this
machine, in this session" is not the same as production ready. Five real gaps.

### 1. A clean clone did not build

`npm run build` **failed on a fresh clone**. The SDK is downloaded rather than
vendored, and only `vercel-build` fetched it — so the command in the README and in
`DEMO.md` was broken for the first person to try it, which is a reviewer.

`postinstall` now restores the SDK (soft-failing, so no network never breaks
`npm install`), and `build`/`test` fail with a sentence rather than an ENOENT deep
inside rollup. Verified by cloning into a temp directory and running every
documented command: `npm ci` → build → typecheck → test → verify:rtp → verify:light
→ gates → frame-budget → cold-open, all green from nothing.

### 2. The contract could only be compiled by its own simulator

`Candle.sol` imported `../../solidity/ICasinoGameV2.sol` — the path the SDK's local
node resolves, which from this repository points **outside the tree**. No standard
toolchain could build it, which makes it unauditable and undeployable.

The interface is now vendored beside the game, so `./ICasinoGameV2.sol` resolves in
both places, and `npm run gates` diffs it against the SDK's copy so it cannot
drift. `foundry.toml` builds with the same settings the simulator uses (solc
0.8.30, viaIR, optimizer 200), so what is audited is what runs.

**Deployed bytecode: 2,568 bytes** — 10.4% of the EIP-170 limit.

### 3. A forged face value would have been priced

`_decodeState` validated the inch but **not the face value**. The facet's keccak
commitment over the session snapshot is what actually stops a forged `gameState`,
but the game would happily have multiplied a stake by a `65535 bp` lot — 655×,
twenty-six times the declared maximum — if that commitment were ever weakened.

The contract now rejects any face value the paytable never issued, and
`test/adversarial.spec.ts` proves it by calling the contract **directly, bypassing
the facet** — which is exactly the attacker's position. 14 tests: forged faces,
out-of-range inches, malformed lengths, incoherent states, extreme wagers,
unknown action bytes.

### 4. A render throw showed a blank page

No error boundary. One throw anywhere in the tree and a judge sees white — which
is indistinguishable from a site that is down. There is now a boundary that stays
in the room's palette, says what happened in the auctioneer's voice, prints the
error rather than swallowing it, and offers the one action that helps.

### 5. Every host promise was unhandled

`void host.openSession(…)` and friends had no `catch`, so a rejected step became
an unhandled rejection and nothing at all on screen.

### Settled, not found: the double-call of `onSessionStart`

Production calls `onSessionStart` twice, once as a simulation. If both
`reservedProfitDelta` values were applied, the reserve would be 48× against a 24×
cap and **every session would revert at `openSession`**. The SDK's own documented
multi-action pattern does exactly what CANDLE does —
`reservedProfitDelta = int256(maxPayout - wagerBase)`, once, at session start — so
the simulation result is not applied. Checked against the reference rather than
assumed.

### A second pass — five more

**6. An unbounded loop in the settlement path.** `_draw` rehashed with
`while (true)`. `claude.md` §3 forbids unbounded loops and this one is reached on
every settle: a call that never returns reverts the whole settlement, and its gas
cannot be reasoned about for an audit. Both languages now cap the rehash at
**3** (64 windows). Reaching the cap needs every window to be rejected —
`(5536/65536)^64 ≈ 4e-69`, rarer than a keccak collision — and it reverts loudly
rather than spinning. The two bounds are pinned to each other by a test that reads
the constant out of the Solidity, because a bound that differs between the mirror
and the contract is a parity bug on a word neither will ever see.

**7. `aria-modal="true"` was a claim the `?` panel did not honour.** No focus
trap, so Tab walked straight out into a game the player could not see; and no
focus restore, so closing it stranded anyone not using a mouse. Both fixed.

**8. No favicon and no share metadata.** Every console a judge has open showed a
404, and the URL pasted into a gallery or a chat said nothing. The favicon is an
inline SVG candle in the four inks — **806 bytes, no extra request**, so the "no
image over 8 KB" gate stays trivially true.

**9. CI would have passed a broken RTP.** `verify:rtp` still carried
`continue-on-error: true # until phase 1 lands the DP`, five phases after phase 1
landed. The one number a judge checks could have gone wrong silently. Removed —
and CI now has a second job that starts the chain and the VRF node, so `parity`,
`caps` and `adversarial` **run** there instead of skipping, plus `round-trip` and
`spike`.

**10. A broken npm script and dead CSS.** `spike:phase0` pointed at contracts
nothing copies into the simulator any more, and a `prefers-reduced-motion` rule
disabled a CSS animation that does not exist (the flicker is drawn, not animated).
The spikes keep a README saying what they were and how to run them; the CSS says
where reduced motion is actually handled.

### What is left, and it is not code

| | |
|---|---|
| Record the 60–90 s video | `?seed=198` — an early claim, a ride to the gutter, a 25× at the first inch |
| Point CI at a remote | the workflow has never run; it needs a `git remote` and `vars.PRODUCTION_ORIGIN` |
| Deploy BOTH contracts to the target chain | `RPC_URL=… DEPLOYER_KEY=… npm run deploy:contract -- candle`, then `-- survey` — the chain and the gas are the entrant's |
| Submit at jam.chain.wtf | two forms, one per entry, under the entrant's name |

---

# Phase 7 — the second game

THE SURVEY had a contract, a dynamic program and five pure core files. This phase
made it a game: a bridge, a scene, three audio graphs, a desk, a `?` panel, a
book, and 104 tests. Four things are worth writing down, because three of them
were only found by building it.

### 1. The strategy band did not fit, and the reason is structural

The first draft declared 97.0303% and paid a player who skips the evidence
**90.4%**; "survey until the reports are two clear" came out at **89.7%**. I2
says every reasonable fixed strategy sits inside 93–98%, and two obvious ones did
not.

This is not a tuning accident, it is the shape of the problem: **the sharper the
evidence, the further the informed player pulls away from the careless one.** A
game about buying information has a band whose width is set by how much the
information is worth. Raising the floor by raising the decline payout or the
cargo values raises the ceiling with it — a search over the whole space
(prior × accuracy × decline × premium slope × value scale) found nothing that
kept a surveyor accurate 3-in-4 inside the window at any price.

So the evidence got weaker and much cheaper:

| | before | after |
|---|---|---|
| a surveyor is right | 3 in 4 | **3 in 5** — one report multiplies the odds by 3/2 |
| a surveyor costs | 6 points of premium | **1.5 points** |
| declining pays | 0.50× | **0.60×** |
| declared RTP | 97.0303% | **97.4141%** |
| worst published policy | 89.684% | **93.295%** |
| mean surveyors bought | 1.61 | **2.55** |

The game got *better*, not worse: at 3-in-5 no single report settles anything, so
the player is genuinely running a sequence of tests rather than asking an oracle
once, and the DP now buys two and a half surveys a voyage instead of one and a
half. Every number in the repo that depends on these came out of
`npm run gen:survey` and `npm run gen:readme`.

### 2. A parity bug in the fine draw, found by writing the test for it

`drawFine` **threw** at a word boundary where `Survey.sol` rehashes: a draw that
began on the last 16-bit window could not complete in TypeScript and completed
fine in Solidity. Nothing in the game reaches that state today — every call site
starts at cursor 0 with a fresh word — which is exactly what makes it the kind of
gap that surfaces in production and nowhere else. The mirror now matches the
contract window for window, with the same bounded rehash and the same `64 tries`
cap, and `test/survey-draw.spec.ts` pins the bound to the Solidity.

### 3. The light model could not honestly carry the premium ladder

The obvious move was to light THE SURVEY from its money ladder, the way CANDLE is
lit from the wax. It is a bad claim: the premium falls **1.5 points per
surveyor**, a 1.5% change in luminance is invisible to a player, and it is inside
the rounding error of an 8-bit channel — measuring it showed 0.37% of error
against a 1.5% step. A claim a reviewer cannot measure is a claim we do not make.

The light follows the **day** instead: a surveyor rows out, sounds her and rows
back, so each one costs an hour of daylight and the room walks CANDLE's own
100 → 40% ladder, ending at exactly the brightness the candle gutters at. That is
visible, it is measurable, and it is true. The money cost is printed as a number
beside it, where a number belongs.

### 4. Two bugs in CANDLE, found by moving its furniture into `shared/`

- The **type scale and both font stacks were declared inside `[data-theme='light']`**,
  so the dark room — the default, and the one every player sees — had no scale
  and no serif at all. Nothing looked broken enough to notice.
- The candle page's **favicon `href` had raw SVG markup spilled out of it**, loose
  in the `<head>`. There is a gate for it now.

### What the second game shares with the first

One light model, one set of four inks, one `tokens.css` and `table.css`, one
exact-rational library, one PRNG, one audio engine, one pacing rule, and one
bridge: `GameHost<S, A>` plus a `chain.ts` that takes an `encodeAction` and a
`mapSession` and has never heard of a lot or a cargo. Each game's chain adapter
is about a hundred lines, and neither game's core knows the other exists.

---

## Cross-phase invariants

These are checked in **every** phase's gate, not just the one that introduced them
(`claude.md` §2):

- I1 RTP recomputed from each DP — 96.9961% and 97.4141% · I2 sensible band inside 93–98% (and for THE SURVEY, the WHOLE published band)
- I3 rejection sampling, never `word % n` · I4 decision committed before the next word exists
- I5 max payout exactly 25× / 20×, reserved with no slack · I6 `onSessionStart` pure & idempotent
- I7 `onRandomness` returns `reservedProfitDelta = 0` · I8 `frame-ancestors *`, no `X-Frame-Options`
- I9 widget tag exactly once in raw HTML · I10 playable standalone, no host/wallet/modal
- I11 contract and client agree bit-for-bit · I12 zero audio files, no image > 8 KB
- I13 THE SURVEY's ship is decided after the call, never before

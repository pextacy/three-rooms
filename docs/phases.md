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

**Current phase: 3 — Make it look real.** Phases 0–2 closed 2026-09-14.

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

## Phase 3 — Make it look real  ·  D3 (Wed 09-17)  ·  ⬜

| # | Deliverable |
|---|---|
| 3.1 | `src/render/scene.ts` — one canvas, one emitter, luminance driven by `WAX_BP[k]` |
| 3.2 | Four inks; blackbody cooling on tallow as it dims; exactly one gradient |
| 3.3 | The candle: five pins; a pin **falls** on each burn |
| 3.4 | The table: lot in brass; a let-burn lot goes oxblood and recedes |
| 3.5 | The **flare** at inch 5 |
| 3.6 | Cold open p95 < 400 ms to first playable frame — measured |
| 3.7 | Responsive to phone; gallery miniature checked small |

**Exit gate:** screenshot the same round at inch 1 and inch 5 side by side. If a stranger
cannot tell which pays less **without reading a number**, the light model has failed and is
fixed before phase 4.

---

## Phase 4 — Make it feel real  ·  D4 (Thu 09-18)  ·  ⬜

| # | Deliverable |
|---|---|
| 4.1 | `src/audio/graphs.ts` — room, wax, event. Zero files |
| 4.2 | Pin-drop pitch rises with the face value of the lot being offered |
| 4.3 | Gavel on claim, flare sting at inch 5, `M` to toggle |
| 4.4 | **Ghost Lot** — drawn *after* the decision is locked, stated flatly, never dramatised |
| 4.5 | Pacing derived from the numbers: hold on a near-threshold lot, move fast past empties |
| 4.6 | Turbo (`T`) |
| 4.7 | Frame budget p95 < 12 ms during a burn |

**Exit gate:** **play 100 rounds with sound on.** If you are still arguing with yourself
about the 0.50× at the third inch, the game works.

---

## Phase 5 — Ship  ·  D5 (Fri 09-19)  ·  ⬜

| # | Deliverable |
|---|---|
| 5.1 | Jam widget: exactly one `<script>` in the **raw HTML** of `index.html` |
| 5.2 | `public/game.manifest.json` — shape from coinflip, values from `paytable.ts`; CI fetches it live |
| 5.3 | `vercel.json`: `frame-ancestors *`, nothing else, no `X-Frame-Options` |
| 5.4 | Deploy, then **re-read the live origin** and assert widget/CSP/manifest |
| 5.5 | Production URL renders inside a test iframe, not pitch-text fallback |
| 5.6 | `npm run gates` green: bundle < 150 KB gz, no image > 8 KB, zero audio files, cold open |
| 5.7 | `README.md` — every number generated by `verify:rtp`, none typed by hand |
| 5.8 | `DEMO.md` — one-minute reviewer runbook, expected output inline |
| 5.9 | Source access arranged for the review team |
| 5.10 | **Submit at jam.chain.wtf. Today.** |

**Exit gate:** the submission exists and the live URL plays. Everything after this is
improvement, not rescue.

---

## Phase 6 — Polish & stop  ·  D6 (Sat 09-20)  ·  ⬜

| # | Deliverable |
|---|---|
| 6.1 | Fresh-eyes test: hand over the URL, say nothing, watch. Fix the first thirty seconds |
| 6.2 | 60–90 s demo video: one early claim, one ride to the gutter, one 25× |
| 6.3 | Final README pass; link the video |
| 6.4 | Resubmit if anything changed |

**Exit gate: 18:00 UTC — hands off.** Six hours of slack, unspent.

---

## Cross-phase invariants

These are checked in **every** phase's gate, not just the one that introduced them
(`claude.md` §2):

- I1 RTP 96.9961% recomputed from the DP · I2 sensible band inside 93–98%
- I3 rejection sampling, never `word % n` · I4 decision committed before the next word exists
- I5 max payout exactly 25×, reserved with no slack · I6 `onSessionStart` pure & idempotent
- I7 `onRandomness` returns `reservedProfitDelta = 0` · I8 `frame-ancestors *`, no `X-Frame-Options`
- I9 widget tag exactly once in raw HTML · I10 playable standalone, no host/wallet/modal
- I11 contract and client agree bit-for-bit · I12 zero audio files, no image > 8 KB

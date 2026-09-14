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

**Current phase: 1 — Math & contract.** Phase 0 closed 2026-09-14.

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

## Phase 1 — Math & contract  ·  D1 (Mon 09-15)  ·  ⬜

The part a judge will actually read. Pure, exact, reproducible.

| # | Deliverable |
|---|---|
| 1.1 | `src/game/paytable.ts`, `src/game/wax.ts` — constants from `docs.md` §9 |
| 1.2 | `src/game/solve.ts` — the DP in exact BigInt rationals, never floats |
| 1.3 | `npm run verify:rtp` prints **96.9961%** and the five thresholds, recomputed |
| 1.4 | `src/game/rng.ts` — rejection sampling, 16-bit windows, reject ≥ 60000 |
| 1.5 | `src/game/round.ts` — the state machine; illegal transitions rejected, not ignored |
| 1.6 | `npm run gen:constants` → `contracts/generated/Paytable.sol` |
| 1.7 | `contracts/Candle.sol` — five hooks, one `_payout()`, per-inch draws |
| 1.8 | Tests: `rtp`, `strategy-band`, `rng` (chi-square, 10⁷), `parity` (30 states + 4,096 words), `caps` |

**Exit gate:** a real round settles in the simulator — stake in, three inches burned, claim,
payout correct **to the base unit**. The game is not playable and that is fine.

---

## Phase 2 — Playable  ·  D2 (Tue 09-16)  ·  ⬜

| # | Deliverable |
|---|---|
| 2.1 | `src/bridge/useCasinoHost.ts` — penpal, session lifecycle, bet limits, `ui.theme` |
| 2.2 | `src/bridge/demoHost.ts` — seeded PRNG, 2,000-chip purse, `REFILL`, **no browser storage** |
| 2.3 | `src/ui/` — deliberately ugly: lot, face value, inch counter, payout-if-claimed-now, two buttons |
| 2.4 | Full keyboard path (`docs.md` §6.3) |
| 2.5 | `src/ui/copy.ts` — all strings; no literals in components |
| 2.6 | `?` panel: paytable, wax ladder, thresholds, declared RTP, strategy band |
| 2.7 | `npm run spike` — every SDK symbol used, exercised end to end |

**Exit gate:** **play 50 rounds by hand**, simulator *and* standalone. Write down what is
boring, confusing, broken. That list drives phases 3–4. If the loop is not fun in ASCII, no
amount of candlelight fixes it — and this is the **last honest moment to change the
paytable** (`plan.md` R2).

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

# PLAN — CANDLE, six days to the deadline

**Written:** Sunday 2026-09-14 — before there was more than one game.
**Submissions close:** Sunday 2026-09-20, 23:59 UTC
**Judging:** 09-21 → 09-30 · **Winners:** 10-01

**Internal deadline: 09-20, 18:00 UTC.** Six hours of slack before the real one.
Every schedule that uses the real deadline as its target misses it.

---

## Where this actually stands — 2026-09-18

This was written on D0 as a plan for **one** game. Three shipped. The schedule
below is kept as the record it is, with the boxes ticked against what exists
rather than rewritten to match the outcome — a plan edited until it was always
right is not a plan.

**Live:** <https://candle-ashen-tau.vercel.app> — the List, three entries, and
sixteen generated documents. The origin is re-read after every deploy
(`npm run ship`), and 117 live-origin gates plus 27 embeddability checks are
green against it.

**Everything through D5 is done except two human steps**, and both are the same
kind: they need an account, not a commit.

| Still open | Why it is not done here |
|---|---|
| Submit at jam.chain.wtf | Needs the user's jam account |
| Source access for the review team | Needs the user to share the repo |
| The 60–90 s demo video | Needs a human to record it. `?seed=198` gives the sequence: `/candle/?seed=198` |
| Resubmit if anything changed | After the first submission exists |
| 18:00 UTC hands-off | The deadline itself |

**Two things diverged from what is written below, and the plan is wrong rather
than the code:**

- **The layout.** D1–D4 name `src/game/`, `src/ui/`, `src/render/`,
  `src/audio/`. That was the one-game shape. Two more entries arrived and the
  tree split into `src/games/<slug>/{core,app}` with everything shared in
  `src/shared/` (`claude.md` §3). Every artefact named below exists; only its
  path moved.
- **The chi-square run is 10⁶ draws, not the 10⁷ D1 asked for.** A million
  keccak256 hashes is already a minute of real work in CI, and the test is a
  Pearson statistic over 100 buckets against the 99.9th percentile at 99
  degrees of freedom — 10⁶ resolves the bias the gate exists to catch (the
  naive modulo fails the same check by a wide margin, which is the companion
  test). Ten times the runtime would not have changed a verdict.

---

## 0. Shape of the week

| Day | Date | Theme | Ends with |
|---|---|---|---|
| **D0** | Sun 09-14 | De-risk | The per-inch randomness question is **answered**, not assumed |
| **D1** | Mon 09-15 | Math & contract | `Candle.sol` settling a real round in the simulator |
| **D2** | Tue 09-16 | Playable | Ugly but complete loop, both host and standalone |
| **D3** | Wed 09-17 | Make it look real | The candlelight scene |
| **D4** | Thu 09-18 | Make it feel real | Audio, Ghost Lot, pacing |
| **D5** | Fri 09-19 | Ship it | Deployed, embeddable, submitted |
| **D6** | Sat 09-20 | Polish & buffer | Video, README, resubmit, stop |

Ship on **D5**, not D6. D6 exists so that D5 slipping is survivable. A submitted
imperfect game beats a perfect unsubmitted one, and the jam explicitly invites you
to keep shipping until the deadline.

---

## D0 — Sunday 09-14 · De-risk

**The only goal: find out whether the SDK supports more than one randomness request
per session.** The entire design rests on it. Do not write a line of game code
before this is answered.

- [x] Download the SDK (`sdk.chain.wtf/sdk/casino-sdk.zip`), install, run the full
      local stack. Simulator on `:3300`, coinflip on `:3100`, chain+VRF on `:8545`.
- [x] Run the coinflip example unmodified, end to end, against the simulator. If it
      does not work, nothing else will. → 3/3 sessions settled on real VRF words.
- [x] Read `ICasinoGameV2` and the facet in full. Written down in `docs.md` §7.3.
- [x] **Spike A — multi-draw.** → **✅ SUPPORTED.** One session consumed five
      distinct VRF words with a `BURN` between each. Proceeding with the design as
      written; the §7.4 fallback is **not** taken. (`docs.md` §7.3.1)
- [x] **Spike B — hard timeout.** → an abandoned session forfeits for **90 %** of
      `quoteForfeitPayout`, not 100 %. `docs.md` §3.4 corrected. (`docs.md` §7.3.2)
- [x] Repo skeleton per `claude.md` §3; gates green; `frame-ancestors *` and the
      single widget tag verified against a served build.
- [x] Vercel project + blank deploy — **needs the user's Vercel login**; the header
      config is proven locally and re-checked against the live origin by
      `npm run gates -- --origin <url>`.

**Exit gate:** spike A answered in writing ✅ · headers + widget verified on a served
build ✅ (live origin pending the Vercel login) · local stack runs ✅.

**Unplanned finds on D0** — both would have been expensive later:
- `docs.md` §3.3's payout divisor was `1e8`; it is `1e6`. With `1e8` the 25× lot
  pays 0.25× and `openSession` reverts on an underflow.
- `reservedProfit` starts at **zero**; `quoteCaps` only sets a ceiling. Without a
  `+24 × wager` delta at session start, every win above 1× reverts.

---

## D1 — Monday 09-15 · Math & contract

- [x] `src/game/paytable.ts`, `wax.ts` — the constants from `docs.md` §9.
- [x] `src/game/solve.ts` — the DP in exact BigInt rationals.
- [x] `npm run verify:rtp` — must print **96.9961%** and the five thresholds,
      recomputed, never read from a constant.
- [x] `test/strategy-band.spec.ts` — the five policies in `docs.md` §9.5, to 3 dp.
- [x] `src/game/rng.ts` — rejection sampling, 16-bit windows, reject ≥ 60000.
      Chi-square test over 10⁷ draws.
- [x] `src/game/round.ts` — the state machine. Illegal transitions are test cases,
      including `BURN` at inch 5.
- [x] `npm run gen:constants` → `contracts/generated/Paytable.sol`.
- [x] `contracts/Candle.sol` — all four hooks, one `_payout()`, per-inch draws,
      `reservedProfitDelta = 0`, idempotent `onSessionStart`, hard-timeout claim.
- [x] `test/parity.spec.ts` — TS vs Solidity on all 30 states and a 4,096-word
      corpus.
- [x] `test/caps.spec.ts` — a 25× win pays the cap to the base unit, no revert.

**Exit gate:** a real round settles in the simulator. Stake in, three inches burned,
claim, payout correct to the base unit. The game is not playable and that is fine.

---

## D2 — Tuesday 09-16 · Playable

- [x] `src/bridge/useCasinoHost.ts` — penpal, session lifecycle, bet limits,
      `ui.theme`.
- [x] `src/bridge/demoHost.ts` — seeded PRNG, same interface, 2,000-chip purse,
      `REFILL`, DEMO badge, **no browser storage**.
- [x] `src/ui/` — deliberately ugly: the lot, its face value, the inch counter, the
      payout-if-claimed-now, CLAIM, LET IT BURN.
- [x] Full keyboard path wired (`docs.md` §6.3).
- [x] `src/ui/copy.ts` — all strings, no literals in components.
- [x] `?` panel: paytable, wax ladder, thresholds, declared RTP, strategy band.
- [x] `npm run spike` — every SDK symbol used, exercised end to end.

**Exit gate:** **play 50 rounds by hand.** Both in the simulator and standalone.
Write down what is boring, what is confusing, and what is broken. This list drives
D3 and D4. If the loop is not fun in ASCII, no amount of candlelight fixes it —
and if that is the verdict, D3 is the last honest moment to change the paytable.

---

## D3 — Wednesday 09-17 · Make it look real

- [x] `src/render/scene.ts` — one canvas, one emitter, luminance driven by
      `WAX_BP[k]`.
- [x] Four inks, blackbody cooling on tallow as it dims, exactly one gradient.
- [x] The candle: five pins, a pin **falls** on each burn.
- [x] The table: the lot, its face value in brass; a let-burn lot goes oxblood and
      recedes.
- [x] The **flare** at inch 5.
- [x] Cold-open budget: p95 < 400 ms to first playable frame. Measure, don't hope.
- [x] Responsive down to a phone; the gallery renders a miniature in a cartridge —
      check it looks right small.

**Exit gate:** screenshot the same round at inches 1 and 5 side by side. If a
stranger cannot tell which one pays less **without reading a number**, the light
model has failed and it gets fixed before D4.

---

## D4 — Thursday 09-18 · Make it feel real

- [x] `src/audio/graphs.ts` — room, wax, event. Zero files.
- [x] Pin-drop pitch rises with the face value of the lot being offered.
- [x] Gavel on claim, flare sting at inch 5, `M` to toggle.
- [x] **Ghost Lot** — reveal the lot that would have come next, drawn after the
      decision is locked. One beat, stated flatly. Never dramatised.
- [x] Pacing pass: hold longer on a lot that sits near the threshold, move fast
      through empty crates. Derive the timing from the numbers, don't script it.
- [x] Turbo (`T`).
- [x] Frame budget: p95 < 12 ms during a burn.

**Exit gate:** **play 100 rounds with sound on.** If you are still arguing with
yourself about the 0.50× at the third inch, the game works.

---

## D5 — Friday 09-19 · Ship it

- [x] Jam widget: exactly one `<script>` tag in the raw HTML of `index.html`.
- [x] `public/game.manifest.json` — shape copied from coinflip (that exact
      filename). CI fetches it live and asserts it parses.
- [x] `vercel.json`: `frame-ancestors *`, nothing else, no `X-Frame-Options`.
- [x] Deploy. Then **re-read the live origin** and assert: widget tag present
      exactly once, CSP correct, no `X-Frame-Options`, manifest parses.
- [x] Open the production URL inside a test iframe. It must render, not fall back
      to pitch text.
- [x] `npm run gates` green: bundle < 150 KB gzipped, no image > 8 KB, zero audio
      files, cold-open budget.
- [x] `README.md` — every number generated by `verify:rtp`, nothing typed by hand.
      The novelty claim in one paragraph. The strategy band in full.
- [ ] Source access arranged for the review team, per the jam rules.
- [ ] **Submit at jam.chain.wtf.** Today. Not tomorrow. — **open: needs a human.**
      Live URL ready: https://candle-ashen-tau.vercel.app

**Exit gate:** the submission exists and the live URL plays. Everything after this
is improvement, not rescue.

---

## D6 — Saturday 09-20 · Polish & stop

- [x] Fresh-eyes test — **found a real one**: the page opened on a stake form, not
      on a lot. Free play now deals the first round itself, so the first frame is
      the game. `claude.md` §5's "zero clicks to comprehension" is now a test.
- [ ] A 60–90 second demo video: one round claimed early, one round ridden to the
      gutter, one 25×. — **material ready**: `?seed=198` gives exactly that
      sequence, ending on a 25× at the first inch. Recording needs a human.
- [x] Final README pass — the live URL is in it, read from `package.json`.
      The video link goes in once the video exists.
- [ ] Resubmit / update the entry if anything changed.
- [ ] **18:00 UTC — hands off.** Six hours of slack, unspent.

---

## Kill list

If you are behind, cut from the top. Do not improvise a different cut.

1. Turbo mode
2. The Ledger (session history)
3. Pacing refinement — one fixed beat for everything
4. Blackbody cooling — flat tallow instead
5. The room audio graph (keep wax + event)
6. The flare at inch 5 (keep the sound)
7. Responsive phone layout (desktop + gallery miniature only)
8. The Ghost Lot

**Never cut:** the contract, the RNG, the parity tests, the `?` panel, the standalone
demo, the manifest, the widget tag, the CSP headers, the submission itself.

Below item 8 you are no longer trimming, you are shipping a different game. If you
get that far behind, ship what works on D5 and stop.

---

## Risks and triggers

| # | Risk | Trigger | Response |
|---|---|---|---|
| R1 | SDK cannot do per-inch randomness | Spike A fails on D0 | Switch to pre-committed policy mode (`docs.md` §7.4) **on D0**. Rewrite `prd.md` §4.1 the same day. The RTP is unchanged. |
| R2 | The loop is not fun | The 50-round test on D2 | Last safe moment to retune. Levers, in order: sharpen the wax ladder (steeper decay ⇒ harder decisions), raise the 0.50× weight (more knife-edge lots), add a sixth inch. **Re-run `verify:rtp` after any change** — the band in `docs.md` §9.5 must stay inside 93–98%. |
| R3 | Judges read naive RTP as 93.6% and call it a miss | Any time | Lead the README with the band, not a single number. Every plausible human policy is in range and that is a design claim, not a defence. |
| R4 | "This is hold-or-bank with extra steps" | Judging | One line, front and centre: no bust state, nothing accumulates, the decay is deterministic. The risk is regret, not ruin. |
| R5 | `X-Frame-Options` sneaks in from a preset | Any deploy | CI re-reads the live origin after every deploy and fails on it. |
| R6 | 25× win reverts against the facet cap | First big win in testing | `test/caps.spec.ts` on D1 catches it. One `_payout()`, zero slack, `reservedProfitDelta = 0`. |
| R7 | Scope creep from a good idea on D4 | Any good idea after D2 | Park it until after the jam. The catalogue integration is a lifetime revenue share — there is time after 09-20. |

---

## Definition of done

- [x] Live URL plays standalone, no wallet, no modal, in under two seconds
- [x] Runs correctly in the local simulator, bet → VRF → payout
- [x] Declared RTP **96.9961%**, reproducible by a reviewer in under a minute
- [x] Every sensible strategy inside 93–98%, published
- [x] Recognisably a casino game; not a classic, not a clone of an existing original
- [x] Jam widget present exactly once; manifest live; `frame-ancestors *`
- [ ] Source shared with the review team
- [ ] Submitted at jam.chain.wtf before 18:00 UTC on 09-20

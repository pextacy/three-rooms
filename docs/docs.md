# DOCS — technical reference

**v1.2 · 2026-09-15** — three entries on one origin.
Companion to `prd.md` (what & why), `claude.md` (working rules), `plan.md` (schedule).

Sections 1–9 were written for CANDLE and still describe it. **§10 is THE SURVEY**:
what it shares (everything structural), what is its own (its maths, its scene, its
voice), and the one place where it is not merely CANDLE with different nouns — the
reversed generative order, which is why a `view`-only contract that emits its whole
state can still hide whether a ship is sound. **§11 is THE BROKERS**, whose own
such place is the opposite: it hides nothing at all, and its interest is that the
optimal policy is a published theorem the player is invited to disbelieve.

Three decision problems, one sentence: **stop · learn · search**.

---

## 1. System overview

```
┌─ Player browser ────────────────────────────────┐
│  games/<slug>/app/ui/      React shell, no logic│
│  games/<slug>/app/render/  one canvas scene     │
│  games/<slug>/app/audio/   its voice + graphs   │
│  games/<slug>/core/        PURE core (mirror)   │
│  games/<slug>/app/bridge/  its session + adapter│
│  shared/                   light, engine, chain │
└───────────┬─────────────────────────────────────┘
            │ penpal postMessage
┌───────────▼─ chain.wtf host ───────────┐
│  SDK bridge — session lifecycle        │
│  CasinoGameFacet — escrow, risk caps   │
└───────────┬────────────────────────────┘
            │
┌───────────▼─ on-chain ─────────────────┐
│  Candle.sol  (ICasinoGameV2)           │
│  Survey.sol  (ICasinoGameV2)           │
│  Verify Network VRF  ──> bytes32 word  │
└────────────────────────────────────────┘

standalone path:  ui  ──>  demoHost (seeded PRNG, labelled DEMO)  ──>  game/
```

Two absolute rules about where truth lives:

- **With a host present, the contract is the only authority on outcomes.** The
  client never recomputes a result; it animates what it is told.
- **Without a host, `demoHost` synthesises the same message shapes** from a seeded
  PRNG, so the UI has exactly one code path. The demo is visibly labelled.

---

## 2. Game core (`src/game/`)

Pure TypeScript. No React, no DOM, no `window`, no `Date.now()`, no ambient
randomness. Everything is `(state, input) -> state`.

### 2.1 `paytable.ts` — single source of truth

```ts
export const WEIGHT_DENOM = 10_000;

// face value in basis points of the stake (100 bp = 1.00x)
export const LOTS = [
  { id: 0, faceBp:     0, weight: 6690 },  // empty crate
  { id: 1, faceBp:    50, weight: 1000 },  // ship's stores   0.50x
  { id: 2, faceBp:   100, weight: 1600 },  // cordage         1.00x
  { id: 3, faceBp:   200, weight:  550 },  // sailcloth       2.00x
  { id: 4, faceBp:   500, weight:  140 },  // ordnance        5.00x
  { id: 5, faceBp:  2500, weight:   20 },  // the Sarah Christiana 25.00x
] as const;
```

Weights sum to exactly `WEIGHT_DENOM`. This is asserted at module load and in CI.

`npm run gen:constants` emits the matching Solidity constants into
`contracts/generated/Paytable.sol`. **Never hand-edit that file.**

### 2.2 `wax.ts` — the discount ladder

```ts
export const INCHES = 5;
export const WAX_BP = [10_000, 8_500, 7_000, 5_500, 4_000] as const; // per inch
```

Payout in stake basis points at inch `k` (1-indexed) for a lot with face `f`:

```
payoutBp = faceBp * WAX_BP[k-1] / 10_000
```

All integer arithmetic. `faceBp * waxBp` maxes at `2500 * 10000 = 25e6`, nowhere
near overflow in either language.

### 2.3 `solve.ts` — the dynamic program

```
A(INCHES) = WAX_BP[INCHES-1] * E[face]
A(k)      = Σ_lots  p(lot) * max( face(lot) * WAX_BP[k-1] , A(k+1) )
RTP       = A(1)
threshold(k) = A(k+1) / WAX_BP[k-1]
```

Computed in exact rationals (BigInt numerator/denominator) — never floats. This is
what `npm run verify:rtp` runs, and what the tests compare the declared constants
against. The constants in the README and the UI are *generated from this function*,
not typed by hand.

Results are in §9.

### 2.4 `rng.ts` — bytes32 to a uniform lot

**`word % 10000` is forbidden** and is explicitly on the reviewer's checklist.
`2^256` is not a multiple of 10,000, so the modulo is biased. We use rejection
sampling over the sixteen 16-bit windows of the word, mirroring the contract
exactly:

```
draw(word, cursor):
  loop over 16-bit windows starting at `cursor`:
      v = window value                    # uniform on [0, 65536)
      if v < 60000:                       # 60000 = 6 * 10000, a clean multiple
          return (v % 10000, cursor+1)    # exactly uniform on [0, 10000)
      cursor++                            # reject, take the next window
  # all sixteen windows rejected: P = (5536/65536)^16 ≈ 1.4e-18
  # rehash and continue: word = keccak256(word)
```

The rejection probability per window is `5536 / 65536 ≈ 8.45%`, so the expected
number of windows consumed per draw is ≈ 1.09. A single VRF word comfortably
supplies one lot with 16 windows of headroom; exhausting all sixteen has
probability ≈ 1.4 × 10⁻¹⁸ and is handled by rehashing rather than by a `revert`,
so the path is total.

The uniform value `r ∈ [0, 10000)` is mapped to a lot by cumulative weights:

```
r <  6690  -> lot 0 (0.00x)
r <  7690  -> lot 1 (0.50x)
r <  9290  -> lot 2 (1.00x)
r <  9840  -> lot 3 (2.00x)
r <  9980  -> lot 4 (5.00x)
else       -> lot 5 (25.00x)
```

`test/rng.spec.ts` runs a chi-square uniformity test over **10⁶** draws, and
`test/parity.spec.ts` asserts the TS and Solidity implementations agree on a fixed
corpus of **4,096 words** — including a word that rejects all sixteen windows and
forces the keccak rehash.

> **Adjusted on D1.** This said 10⁷ draws inside the spec. At 10⁷ the two
> keccak-backed uniformity tests alone take ~100 s, which is a suite nobody runs.
> The 10⁷ claim now lives in `npm run bench` (§7), which does 10⁷ draws **and**
> 10⁷ simulated rounds in ~20 s by generating its word stream from a fast PRNG
> instead of keccak — the mapping is what is under test there, not the VRF.

**One deliberate asymmetry.** `src/game/` carries no hash implementation, because
it must stay pure (`claude.md` §3). The rehash on window exhaustion is therefore
an **injected** function: the contract uses `keccak256(abi.encodePacked(seed))`,
the parity tests inject exactly that, and `demoHost` injects a fresh word from its
seeded PRNG. Distributionally identical; byte-identical only where keccak is
injected. The path is reached with probability ≈ 1.4 × 10⁻¹⁸.

### 2.5 `round.ts` — the state machine

```
          stake set
              │
              ▼
        ┌───────────┐   word_k
        │    LIT    │──────────────┐
        └───────────┘              ▼
                              ┌──────────┐
              ┌───────────────│ OFFERED  │
              │  CLAIM        │  inch k  │
              ▼               └────┬─────┘
        ┌───────────┐   BURN       │ (k < 5)
        │  CLAIMED  │◀─────────────┘
        └───────────┘        k := k+1, request word_{k+1}
              ▲
              │ (k == 5, automatic)
        ┌───────────┐
        │ GUTTERED  │
        └───────────┘
              │
              ▼
        ghost lot revealed, round SETTLED
```

Legal transitions only. `CLAIM` from `OFFERED` settles at the current inch.
`BURN` from `OFFERED` at `k == 5` is **illegal** — the fifth inch has no exit but a
claim. Every other input is rejected, not ignored, and rejection is a test case.

---

## 3. The contract (`contracts/Candle.sol`)

Solidity 0.8.30. No constructor arguments. No unbounded loops — the heaviest
operation in a session is five iterations.

### 3.1 `ICasinoGameV2` surface

| Hook | Contract obligation |
|---|---|
| `onSessionStart(sessionId, player, wagerBase, gameData)` | **Pure function of `(wagerBase, gameData)`.** Production calls it twice, once as a simulation with `sessionId == 0`, so it must be idempotent. Validates the stake, initialises the session at inch 1, requests the first word. |
| `quoteCaps(...)` | Reports the maximum payout this game can produce: **25 × wager**. |
| `quoteRiskParams(...)` | Reports the reserve the facet must hold. |
| `onRandomness(sessionId, word)` | Consumes a VRF word, draws the lot for the current inch, or — if the session is settling — computes the payout. Returns **`reservedProfitDelta = 0`**. |

Three integration details that are easy to get wrong and expensive to get wrong:

1. **`quoteCaps`, `quoteRiskParams` and `onRandomness` must all route through one
   `_payout()` helper.** The facet caps payout at `escrowedStake + reservedProfit`
   with **zero slack**: an independent re-derivation that differs by a single base
   unit reverts every 25× win. One function, one rounding rule, one truth.
2. **`onRandomness` returns `reservedProfitDelta = 0`.** The host applies the delta
   *before* finalising. Releasing reserve there collapses the cap to the wager and
   reverts every win above 1×.
3. **`onSessionStart` must not write anything that a second identical call would
   corrupt.** Guard on `sessionId == 0` for the simulation path.

### 3.2 Session lifecycle and per-inch randomness

The critical property (invariant **I4** in `claude.md`):

> The player's decision at inch *k* is committed **before** the randomness for
> inch *k+1* exists.

Implementation: one VRF request per inch. `BURN` is an on-chain action that
requests the next word. The word for inch *k+1* is therefore causally after the
burn that asked for it, and cannot be read, predicted or front-run by the player.

**This is the single riskiest assumption in the project.** It must be proven with a
spike against the local simulator before any other contract work starts. See §7.4
for the fallback if the SDK turns out to be single-shot.

### 3.3 Payout

```solidity
// stake in base units, faceBp from the paytable, waxBp from the ladder
payout = stake * faceBp * waxBp / 1e6;   // 1e2 (faceBp) * 1e4 (waxBp)
```

> **Corrected on D0.** This read `/ 1e8  // 1e4 * 1e4` until the phase-0 spike.
> That is wrong: §2.1 defines `faceBp` as the multiplier × **100** ("100 bp =
> 1.00×"), not × 10,000. With `1e8` the 25× lot pays **0.25×**, `quoteCaps`
> returns `maxReservedProfit = 0`, and `onSessionStart` reverts with an
> arithmetic underflow — which is exactly how the spike found it. The two
> denominators are `100` for `faceBp` and `10_000` for `waxBp`, so the product
> is `1e6`. §2.2 was always right; only this line was wrong. See §7.3.

Integer division floors. The stake is an integer and both factors are exact, so the
only value given up is the final floor — at most one base unit per round. Documented
rather than hidden.

Maximum payout: `faceBp = 2500`, `waxBp = 10000` → `25 × stake`. This is the number
`quoteCaps` must reserve, and it is only reachable at the first inch.

### 3.4 Hard timeout

If a session sits in `OFFERED` past the facet's action deadline
(`ACTION_TIMEOUT_BLOCKS`, default **43,200 blocks**), anyone may call
`forfeitExpiredSession`. The facet asks the game for `quoteForfeitPayout(ctx)` and
pays **90 %** of it — `FORFEIT_WINNINGS_CUT_BPS` is 1,000 and is deducted
unconditionally. The game cannot waive it.

CANDLE quotes **the claim value of the lot currently on the table**:

```
quoteForfeitPayout = stake * faceBp * waxBp / 1e6     // at the current inch
```

That is a legitimate quote rather than an adverse-selection hole, because the lot
is *already revealed*: mid-round value depends on no unresolved randomness and no
hidden state, which is exactly the mines-style case the SDK permits. Abandoning can
never beat claiming — 90 % of the claim value is strictly worse — so there is
nothing to farm.

> **Corrected on D0.** This section claimed a timed-out session "settles by
> claiming the lot currently on the table" at **full** value, and called that
> player-favourable. The facet takes 10 % regardless. Measured, not assumed —
> §7.3 Spike B. The design intent survives (an abandoned session with a live lot
> in front of the player never resolves to zero), but any number we print must
> say 90 %.

If the session is instead stuck in `WAITING_RANDOMNESS` past
`RANDOMNESS_TIMEOUT_BLOCKS`, `cancelStuckRandomness` returns the player's **full
escrowed stake**. A slow VRF node cannot cost the player anything.

---

## 4. Bridge (`src/shared/bridge/` + `games/<slug>/app/bridge/`)

Since v1.1 the bridge is generic. `shared/bridge/host.ts` declares
`GameHost<S, A>` — a subscribe/snapshot store, `openSession`, `submitAction`,
`revealOutcome`, `dealAgain` — parameterised by whatever a game keeps in its
session and by its action type. `shared/bridge/chain.ts` implements the whole
penpal path against that interface with exactly two game-shaped holes:

```ts
createChainHost<SurveySessionView, SurveyAction>({
  maxMultiplierX: 20,
  encodeAction,                 // one byte the contract reads
  mapSession({ row, phase, ... }) { /* DECODE the row. Never recompute. */ },
})
```

Each game's adapter is about a hundred lines and holds only its ghost and its
own decoding. Everything below in §4.1 and §4.2 is true of both.

### 4.1 `useCasinoHost.ts`

`penpal`-based guest connection to the chain.wtf host. Responsibilities:

- `openSession(wagerBase, gameData)` → session id
- subscribe to randomness / settlement events
- read the host's **bet limits** and clamp the stake control to them
- read the host's **`ui.theme` snapshot** and follow it

**Theme rule:** inside a dark host, follow the host. Opened directly, keep CANDLE's
own identity. The candlelit scene is dark by nature, so the adaptation is limited to
chrome (frame, buttons, type colour), never to the scene's light model.

**Balance rule:** inside the host, the *host* owns and draws the balance. The game
does not render a second balance. During a reveal the host's display is clamped
downward-only so it cannot leak the result before the animation lands.

### 4.2 `demoHost.ts`

Implements the identical interface with a seeded PRNG (`xoshiro128**`, seeded from
`crypto.getRandomValues` once per page load). Behaviour:

- opens with a **2,000 play-chip purse**, default stake 20
- the purse exists for **one page load**; `localStorage` and `sessionStorage` are
  forbidden (see `claude.md` §7)
- a `REFILL` control restores the opening purse whenever the player is down
- the whole surface is visibly badged **DEMO — PLAY CHIPS**
- draws use the *same* `rng.ts` path, so the demo's distribution is the production
  distribution

---

## 5. Manifest, widget and hosting

### 5.0 One origin, several entries

The host resolves a manifest with `new URL('game.manifest.json', gameUrl)` —
**relative to the game's URL, not the origin root**. So one origin can carry
several entries, each in its own directory with its own manifest beside it:

```
/                       the lobby — NOT an entry, no jam widget, no metrics
/candle/                an entry: its own page, manifest and contract
/candle/game.manifest.json
```

A game's entry URL must therefore end in a slash, or the manifest resolves to the
origin root and the host reads the wrong one.

**The lobby is a door, not a casino.** It lists the games and links to them. It
has no balance, no deposit and no wallet, because inside chain.wtf the host owns
all three (§4.1, `claude.md` §7) — and because a game origin that asks for money
is the exact shape of a phishing page.

### 5.1 Manifest
Served at the origin as **`/game.manifest.json`** — that exact filename, on the
same origin as the iframe. Fork the shape from the coinflip example and do not
invent fields: the host validates it against a zod schema
(`validateCasinoGameManifest`) and **rejects unknown shapes**.

The schema is small — `schemaVersion`, `apiVersion`, `gameId`, `defaultLocale`,
`locales`, `presentation`, `capabilities`, optional `assets`. `capabilities.submitAction`
**must be `true`**: `BURN` is an on-chain player action, and a manifest that says
otherwise describes a different game. CI fetches the manifest from the live origin
after deploy and asserts it parses.

> **Corrected on D0.** Called `public/manifest.json` here, in `claude.md` §3 and
> in `plan.md` D5 — the SDK reads `game.manifest.json`. This section also said the
> manifest "declares the contract address, the declared RTP and the max
> multiplier"; **it has no such fields**. Those numbers live in the README, the
> `?` panel and the contract. The manifest is routing and catalog metadata only.

### 5.2 Jam widget
Exactly **one** `<script>` tag, present in the **raw HTML** of `index.html` — not
injected by JavaScript, because the gallery reads the served document. A CI grep
asserts the count is exactly 1 on the built `dist/index.html` *and* on the live
origin.

### 5.3 Headers — the trap

```json
// vercel.json
{ "headers": [{ "source": "/(.*)", "headers": [
  { "key": "Content-Security-Policy", "value": "frame-ancestors *" }
]}]}
```

Set `frame-ancestors *` and **nothing else**. Do not set `X-Frame-Options` anywhere.
A stray `SAMEORIGIN` from a framework preset wins in some browsers and silently
costs the gallery's live preview — the entry still "works" but shows pitch text
instead of the game. CI re-reads the live origin after every deploy and fails on any
`X-Frame-Options` header.

### 5.4 Build & deploy
Static build (Vite). Any static host. CI pipeline: `typecheck → test → verify:rtp →
gates → build → deploy → re-read live origin`.

---

## 6. Rendering and audio

### 6.1 One renderer
A single canvas scene. Nothing else draws.

The light model is the product. One emitter (the flame) at a fixed position; scene
luminance is a direct function of `WAX_BP[k]`. Consequences that must hold:

- The room at inch 5 is genuinely dim. The player reads decay without reading text.

> **How this is actually done, and why it is checkable (D3).** Scene brightness is
> **relative luminance in linear light**, scaled by exactly `WAX_BP[k] / 10_000`.
> Working in linear light is not pedantry: scaling an sRGB byte by 0.4 leaves about
> **69%** of the light, so the naive version makes the claim false while looking
> plausible. `inkAtWax` shifts the hue by how far the flame has cooled *since the
> first inch*, restores the ink's own luminance so the shift changed colour and not
> brightness, and scales last. Where a channel would clip it desaturates toward its
> own luminance-grey, which preserves luminance exactly. `npm run verify:light`
> measures all of it, and `test/light.spec.ts` asserts it.
>
> Measured: `0.8017 / 0.6819 / 0.5618 / 0.4403 / 0.3211`, which is
> `100.00 / 85.06 / 70.08 / 54.92 / 40.05` percent of the first inch.
- Tallow shifts **down the blackbody curve** as luminance falls (warm white →
  amber → deep amber). An LED-like constant hue is wrong and is a visible tell of
  a fake light model.
- Four inks: **tallow** (flame, live values), **brass** (the lot on the table),
  **oxblood** (a lot let burn), **ink** (the room). No fifth.
- **Legibility is a constraint on the palette, not an afterthought.** Brass carries
  the lot's face value, so it must clear WCAG AA against the room at the *fifth*
  inch, where only 40% of the light is left. It was lightened on D3 until it did
  (3.59:1 → **4.85:1**). Tallow clears AA at every inch (16.04:1 → 7.24:1).
  **Oxblood is deliberately below AA and stays there**: it is a past-tense mark
  that recedes, so it never carries text that has to be read, and that is a test
  rather than an intention.
- Exactly one gradient in the entire build: the flame's own falloff.
- Hierarchy by luminance, never by size; the type scale is fixed.

The five pins in the wax are the inch markers. When an inch burns, a pin **falls**
— the animation and the sound are the same event. At the fifth inch the wick
**flares** before it dies (Pepys' tell): a short, bright, unmistakable telegraph
that this is the last lot.

### 6.2 Audio — three graphs, zero files

| Graph | Content |
|---|---|
| `room` | Filtered noise bed, coffee-house murmur. Gain follows flame intensity. |
| `wax` | Crackle: short filtered noise bursts, density keyed to the flame. |
| `event` | Pin drop, gavel on claim, the flare at inch 5. |

**Sound carries information:** the pitch of the pin drop rises with the face value
of the lot being offered, so a practised player hears a good lot land before reading
it. The spread is **logarithmic**, because pitch is perceived logarithmically and a
linear ramp would bunch every interesting lot into the bottom eighth of the range:

| lot | face | pin drop |
|---|---|---|
| Empty crate | 0.00× | **196 Hz** — the floor, reserved, so "nothing" has its own note |
| Ship's stores | 0.50× | 245 Hz |
| Cordage | 1.00× | 340 Hz |
| Sailcloth | 2.00× | 473 Hz |
| Ordnance | 5.00× | 731 Hz |
| *Sarah Christiana* | 25.00× | 1568 Hz |

`test/voice.spec.ts` asserts every neighbouring pair is at least a musical third
apart, so the difference is audible rather than theoretical.

Unmuted by default with a one-key toggle (`M`). A browser will not start an
`AudioContext` without a gesture, so the context is created on the first key or
click — the *setting* is unmuted, the *context* waits, and nothing that matters is
audio-only.

### 6.2b One light model, two render targets

The canvas draws the scene. The controls, the stake field and the `?` panel are
DOM, because they are controls rather than scenery — "nothing else draws" forbids a
second *visual* system, not the buttons.

There is still only one light model. `applySceneLight` writes `paletteAtWax` onto
the document root as CSS custom properties on every change, so the chrome dims with
the room instead of floating above it in a fixed palette. The values in
`tokens.css` are opening values for the first inch only; from the first frame on
they are overwritten.

The DOM also carries an **accessible layer**: the lot, the inch, the wax and the
payout, in a polite live region. It is visually hidden where the canvas already
draws the same fact, and it is what a screen reader and a canvas-less browser get.
No information in this game is carried by colour alone.

### 6.3 Keyboard
`Space` / `Enter` claim · `B` or `↓` let it burn · `Enter` deal again on a settled
board · `?` the paytable panel · `M` sound · `T` turbo. Every control is printed on
the switch it belongs to.

**Turbo collapses the waiting, never the deciding.** It scales every dwell by
0.35 and changes nothing else. An autoplayer would be an admission that the
decision is fake (`claude.md` §7); this is not one, and there is no "turbo through
100 rounds".

### 6.4 The Ghost Lot — why it is a client draw

After a settled round the game shows the lot that *would* have come next. Three
properties are required and only two of them can be had on chain at once:

| | leaks nothing | verifiable on chain | keeps the payout safe |
|---|---|---|---|
| derive from the settling word | ✗ — the word is public before the decision | ✓ | ✓ |
| one more VRF word at settlement | ✓ | ✓ | **✗** |
| **draw it in the client, after settlement** | ✓ | ✗ | ✓ |

The second row is the trap. Putting the ghost on chain means the session sits in
`WAITING_RANDOMNESS` *after* the player has claimed, and `cancelStuckRandomness`
pays `session.escrowedStake` — the wager, not the claim value
(`LocalCasinoHost.sol:232`). A stuck word after a 25× claim would refund the stake
and wipe out the win. No retention loop is worth that.

So the ghost is drawn locally, once the round is already settled, through the same
`rng.ts` and the same paytable — its distribution is the real one, measured at
67.0% empty crates against a paytable that says 66.9%. It changes no payout, and
the UI states that it changed nothing.

It is **null after a gutter**: at the fifth inch there was no next lot, and showing
one would be an invention.

**It is never dramatised.** No exclamation marks, no "you were one inch away", no
comparison with what was claimed. `test/ghost.spec.ts` walks every string in
`copy.ts` and fails on any of it, so `claude.md` §7 is enforced rather than
intended.

### 6.5 Pacing

> "Hold longer on a lot that sits near the threshold, move fast through empty
> crates. Derive the timing from the numbers, don't script it."

`dwellMs(faceBp, inch)` asks the DP how far this lot's face value sits from the
claim threshold at this inch, and interpolates between 260 ms and 1,150 ms. So the
timing cannot drift from the maths: change the paytable and the pacing follows.

Measured over 20,000 rounds: **45.4%** of the waiting is spent on the **33.0%** of
offers that are a real decision, and the knife edge — the 0.50× at the third inch,
0.01392 from its threshold — is held **4.2×** longer than an empty crate. It is the
longest hold in the game, and it is found by `knifeEdge()` rather than typed in.

---

## 7. Testing and verification

| Gate | What it proves | Command |
|---|---|---|
| Exhaustive DP | The declared RTP is recomputed from the paytable across all 30 reachable `(inch, lot)` states — not read from a constant | `npm run verify:rtp` |
| Strategy band | Every listed policy's RTP matches §9 and the sensible band sits inside 93–98% | `npm test` |
| Parity | TS core and Solidity agree on all 30 states and on a 4,096-word RNG corpus | `npm test` |
| RNG uniformity | Chi-square over 10⁶ draws, **and** a proof that the forbidden `word % n` fails the same test | `npm test` |
| Monte Carlo | 10⁷ draws **and** 10⁷ simulated rounds land within 5σ of the closed form — RTP, P(0), P(≥1×), P(25×), mean length and standard deviation | `npm run bench` |
| Caps | The 25× win pays the facet cap to the base unit and does not revert | `npm test` |
| SDK spike | Every SDK symbol used is exercised end-to-end against the local simulator | `npm run spike` |
| Gates | Bundle size, one widget tag, `frame-ancestors *`, no `X-Frame-Options`, manifest parses, cold-open budget | `npm run gates` |

### 7.1 Local stack
```
cd sdk/casino-sdk && npm install && npm start
#   simulator : http://localhost:3300   (point it at the game URL, pick CandleGame)
#   coinflip  : http://localhost:3100   (the SDK's reference game, for comparison)
#   chain+VRF : http://127.0.0.1:8545   (in-memory hardhat + a REAL ECVRF node)

npm run dev                             # from the repo root
#   game UI   : http://localhost:3200
#   standalone: open http://localhost:3200 directly -> auto DEMO MODE
#   in-host   : http://localhost:3300/?game=http://localhost:3200
```

The local node **watches `sdk/casino-sdk/simulator/contracts/`**: any `.sol`
implementing `ICasinoGameV2` dropped there is compiled with the bundled solc
(`viaIR`, optimizer 200), deployed, registered on the host and added to the game
picker within a couple of seconds — no restart, no external toolchain.
`contracts/Candle.sol` is *copied* there rather than deployed by hand.

### 7.2 Reviewer runbook (`DEMO.md`)
A one-minute path: install, `npm test`, `npm run verify:rtp`, then a full
bet → burn → burn → claim → payout round against the bundled simulator, with the
expected output pasted inline so a mismatch is obvious.

### 7.3 SDK notes

Anything the SDK does that is not obvious from its types gets written down here as
it is discovered, with the spike that proved it. **Do not guess SDK behaviour —
spike it and record it.**

---

#### 7.3.0 Phase 0 — what was run

SDK `@chain/casino-sdk` v0.2.0, downloaded from `sdk.chain.wtf/sdk/casino-sdk.zip`
on 2026-09-14. Sources read in full: `solidity/ICasinoGameV2.sol`,
`simulator/contracts/LocalCasinoHost.sol`, `simulator/contracts/casino/*`,
`src/types.ts`, `src/manifest.ts`, `src/guest.ts`, and all of `docs/`.

Everything below was **executed** against the bundled local stack — an in-memory
hardhat chain, a real ECVRF node, and `LocalCasinoHost`, which the SDK states
reproduces the production facet's session lifecycle and emits byte-identical
events. Spike sources live in `spikes/`; run them with `npm run spike` while
`npm run sdk:stack` is up.

```
spikes/CandleSpike.sol        throwaway ICasinoGameV2 with CANDLE's real shape
spikes/CandleSpikeMax.sol     same, forced-jackpot, to settle a real 25x
spikes/spike-multidraw.mjs    Spike A + B + the caps       -> 22/22 green
spikes/spike-maxpayout.mjs    a real 25x through the facet ->  5/5  green
spikes/spike-coinflip.mjs     the reference game, end to end -> 3/3 green
```

---

#### 7.3.1 Spike A — per-inch randomness: **SUPPORTED** ✅

> **The design as written in `prd.md` §4.1 stands. The §7.4 fallback is NOT taken.**

`StepResult.requestRandomnessNow` may be set from **any non-terminal phase**, any
number of times in one session. `LocalCasinoHost._processStepResult` routes
`nextPhase == WAITING_RANDOMNESS` straight to `router.requestRandomness(...)` with
no per-session counter and no once-only guard. The loop
`onPlayerAction → WAITING_RANDOMNESS → onRandomness → WAITING_PLAYER_ACTION` is a
first-class pattern, and the SDK names it: *"Multi-action (blackjack, mines): the
session stays open across several `onPlayerAction` calls, each optionally
requesting more randomness."* `HostSnapshotV1.sessions.items[].raw.randomnessRequests`
exists precisely to give a guest the full list of words for such a session.

Measured: one session consumed **five distinct VRF words**, with a `BURN` action
between each.

```
inch 1: word 0x0ddfa9d7… -> empty crate 0.00x
inch 2: word 0xda529a4a… -> empty crate 0.00x
inch 3: word 0xc3d928cf… -> ordnance 5.00x
inch 4: word 0x708842bd… -> cordage 1.00x
inch 5: word 0x13b0f7db… -> empty crate 0.00x   (gutters, forced claim)
```

**I4 holds by construction.** The burn is a transaction; the word it requests is
fulfilled by the VRF node in a *later* transaction. Measured burn → fulfilment
blocks: `43249→43250  43251→43252  43253→43254  43255→43256`. The player cannot
read, predict or front-run the word for inch *k+1* at the moment they commit at
inch *k*, because it does not exist yet.

#### 7.3.2 Spike B — the abandoned session

`forfeitExpiredSession` is callable by **anyone** once `block.number >
deadlineBlock`, and only from `WAITING_PLAYER_ACTION`. The facet staticcalls
`quoteForfeitPayout` (gas-capped at 400,000, 32-byte return; any revert or
malformed return pays **0**), clamps it to `escrowedStake + reservedProfit`, then
pays `quote * 9000 / 10000`.

Measured: a 1.00× lot on the table at inch 1 with a 100 chUSD stake quoted **100**
and forfeited for **90**. `docs.md` §3.4 has been corrected accordingly — the
original claim of a full-value timeout claim was wrong.

`cancelStuckRandomness` (from `WAITING_RANDOMNESS`, past
`RANDOMNESS_TIMEOUT_BLOCKS`) returns the **full escrowed stake**.

#### 7.3.3 The reserve — the trap that would have cost every win

`session.reservedProfit` starts at **zero**. `quoteCaps.maxReservedProfit` is only a
*ceiling*; it reserves nothing. At settlement the facet enforces

```
maxAllowedPayout = escrowedStake + reservedProfit      // LocalCasinoHost._finalizeSession
```

so a game that never returns a positive `reservedProfitDelta` has a cap of exactly
**1× the wager** and reverts with `LocalCasinoHost__InvalidPayout` on every win
above evens.

**Therefore `onSessionStart` must return `reservedProfitDelta = +24 × wager`**, and
every later step returns `0`. `docs.md` §3.1 note 2 warned about *releasing* the
reserve but never said to *take* it; that omission is now closed.

| Call | `reservedProfitDelta` | running `reservedProfit` | cap |
|---|---|---|---|
| `onSessionStart` | **`+24 × wager`** | 24× | 25× |
| `onRandomness` (inches 1–4) | `0` | 24× | 25× |
| `onPlayerAction` (`BURN`) | `0` | 24× | 25× |
| `onPlayerAction` (`CLAIM`) / gutter | `0` | 24× | 25× |

Do **not** taper the reserve as the wax burns, even though the reachable maximum
falls with it. The delta is applied *before* the payout is checked, so a step that
both releases reserve and pays out is checked against the already-lowered cap.
One reserve, taken once, released never. (Capital efficiency is noted in `LATER.md`,
not v1.)

#### 7.3.4 `quoteCaps` / `quoteRiskParams` — measured values

For a wager *w*:

| Return | Value | Why |
|---|---|---|
| `maxEscrowStake` | `w` | the player posts the stake once; no mid-round escrow increase |
| `maxReservedProfit` | `24w` | `maxPayout − wager`, no slack (**I5**) |
| `maxPayout` | `25w` | `faceBp 2500 × waxBp 10000 / 1e6`, first inch only |
| `probabilityWad` | `2e15` | **top tier only** = P(payout = 25×) = 0.20%. Not "any win". |
| `expectedPayout` | `w × 7577820426157 / 7812500000000` | optimal play is the supremum over policies, so it is the honest worst case for the vault |
| `subJackpotVarianceScaled` | `0` | see below |

**CANDLE is not heavy-tailed.** `isHeavyTail` needs `maxPayout / wager >` 100 *and*
`probabilityWad <` 1e15. We are `25` and `2e15` — **both** conditions fail, so the
tiered jackpot-reserve path never engages and `subJackpotVarianceScaled` stays 0.
This is a point in the game's favour commercially (`prd.md` §8): a 25× cap does not
threaten the bankroll and needs no special reserve machinery.

`probabilityWad > 1e18` reverts with `InvalidRiskProbability`. `maxEscrowStake <
wager` reverts `openSession` outright.

#### 7.3.5 `onSessionStart` idempotency — free, because the hooks are `view`

Every `ICasinoGameV2` hook is `external view`, reached by `staticcall`. **The game
contract is stateless**: all session state travels in `ctx.gameState` (`bytes`),
which the facet emits on every step and takes back as calldata, committing only
`keccak256(encodedSession)` on chain.

So **I6 costs nothing** — there is no storage a second call could corrupt, and the
`sessionId == 0` guard `docs.md` §3.1 note 3 asks for is unnecessary. Our
`onSessionStart` must simply not read `ctx.sessionId`. (Note the *local* host calls
it once, with a real id; the double-call with `sessionId == 0` is production-only,
so it cannot be observed locally — which is exactly why statelessness, rather than a
guard, is the right answer.)

Keep `gameState` small: it is emitted, hashed and echoed on every step at ~30 gas
per byte. CANDLE uses **4 bytes** — `uint8 inch, uint16 faceBp, uint8 hasLot`.

#### 7.3.6 Timeouts and phases

| Constant | Local | Production default |
|---|---|---|
| `ACTION_TIMEOUT_BLOCKS` | 43,200 | 43,200 |
| `RANDOMNESS_TIMEOUT_BLOCKS` | **15** | 150 |

Phase transitions the facet enforces, which our state machine must not fight:

- `WAITING_RANDOMNESS` **requires** `requestRandomnessNow == true`; omitting it
  reverts `InvalidStepTransition`.
- `WAITING_PLAYER_ACTION` and every terminal phase **require**
  `requestRandomnessNow == false`.
- `submitAction` is only legal from `WAITING_PLAYER_ACTION`, only by the session
  player, only before `deadlineBlock`.
- `escrowDelta > 0` is rejected outright during `onRandomness`
  (`EscrowIncreaseNotAllowed`) — irrelevant to CANDLE, which never raises escrow.

**The fifth inch needs no on-chain guard against `BURN`.** `onRandomness` at inch 5
settles the session in the same call that reveals the lot, so the session never
re-enters `WAITING_PLAYER_ACTION` and `submitAction` cannot be called at all. The
contract still rejects `BURN` at inch 5 explicitly (belt and braces, and it is a
test case per §2.5) — verified reverting with `CandleSpike__BurnAtLastInch`.

#### 7.3.7 The 25× win does not revert (`plan.md` R6 closed)

A forced-jackpot variant settled a **real** 25× through the facet's payout path:
payout `2500` chUSD on a `100` stake, phase `SETTLED`, player balance `+2400` net.
`payout == escrowedStake + reservedProfit` **exactly** — the cap is met, not
exceeded, and there is no slack to lose. R6 is closed; `test/caps.spec.ts` in phase 1
keeps it closed.

#### 7.3.8 Rejection sampling — the SDK agrees with `docs.md` §2.4

`RANDOMNESS_DICE.md` gives the general rule: *"For domain size M and outcome count
n: `limit = floor(M/n)*n`, reject `>= limit`, then `% n`."* For our 16-bit window
and 10,000 lots that is `floor(65536/10000)*10000 = 60000` — exactly the constant in
§2.4. Rehash on exhaustion is `keccak256(abi.encodePacked(seed))` over the raw 32
bytes, in both languages.

One simplification the design permits: **each inch gets its own fresh VRF word**, so
the cursor always starts at 0 and never has to be carried across inches in
`gameState`.

#### 7.3.9 Manifest

Filename is **`game.manifest.json`**, validated by a zod schema that rejects unknown
shapes. `gameId` is canonicalised by `canonicalCasinoGameId` (strip a trailing
"Game", lowercase, alphanumerics only), so contract `CandleGame` and manifest
`CandleGame` both canonicalise to `candle`. `capabilities.submitAction` must be
`true`.

#### 7.3.10 Guest bridge

`connectGameToHost({ setState })` from `@chain/casino-sdk/guest`; `setState` receives
the whole `HostSnapshotV1` on every host update. Match a bet to its session row via
the `sessionKey` returned by `openSession`; the row's `phaseName` going terminal is
the settle signal; `raw.gameState` carries our 4 bytes so the UI can read the inch
and the lot. **Always call `revealOutcome({ sessionId })` when the animation lands**
— until then the host hides the payout so its balance display cannot spoil the
result, which is exactly the "clamped downward-only" behaviour §4.1 asks for.
`computeMaxWager(snapshot, { maxMultiplierX: 25 })` turns the live `snapshot.casino`
risk limits into our stake ceiling. Call `connection.destroy()` on unmount.

### 7.4 Fallback if per-inch randomness is unsupported

> **Not taken.** Spike A passed on D0 (§7.3.1): a session consumes one VRF word per
> inch, with the player's action committed between each. This section is kept as the
> record of the parachute we did not need to open.


If the spike shows a session can only consume **one** VRF word, the design must not
derive all five lots from that word at session start — the word is public, so the
player would see the whole sequence and play perfectly. The documented fallback is:

> **Pre-committed policy mode.** The player sets their thresholds before the
> candle is lit (a five-step "nerve" dial), one word resolves the whole auction,
> and the reveal animates the lots arriving against the policy they set.

This preserves the math and the RTP exactly — the same DP, evaluated under the
player's chosen policy instead of their live choices — but it is a materially worse
game, because the tension moves from the moment to the setup. Treat it as a
parachute, not a plan. See `plan.md` §Risks.

---

## 8. Dependencies

Every dependency needs a line here. Budget: 150 KB gzipped total.

| Package | Why |
|---|---|
| `react`, `react-dom` | UI shell only |
| `penpal` | required by the SDK bridge |
| `@chain/casino-sdk` | the SDK |
| `vite`, `typescript`, `vitest` | toolchain |
| `jsdom` | **devDependency only.** The environment for `test/ui.spec.tsx`, which drives the real React tree through a whole round plus the keyboard path. A render that throws is the kind of break that ships silently; nothing lighter proves it does not. Zero bundle cost. |
| `viem` | **devDependency only.** Drives the spikes and the parity tests against the local chain. Deliberately **not** a runtime dependency: `gameData` is empty and `actionData` is a single byte, so the guest needs no ABI encoder and the bundle pays nothing for this. |

No animation library, no state library, no UI kit, no icon pack, no audio library.

**The SDK is not a dependency, it is an alias.** It ships raw `.ts` rather than
`.d.ts`, so importing it drags its source into our TypeScript program and fails
our stricter flags on code that is not ours to fix. Instead:

- `src/types/casino-sdk.d.ts` declares the exact surface we use, so the boundary
  is explicit and our own `strict` settings stay intact;
- `vite.config.ts` and `vitest.config.ts` alias `@chain/casino-sdk/*` to the real
  source, so the shipped bundle runs the SDK's own bridge and we never
  reimplement 20 lines of penpal wiring;
- `npm run spike` exercises every symbol in that declaration end to end, so a
  drift between the declaration and the SDK is caught rather than assumed.

`penpal` is a direct dependency because the aliased guest source imports it and it
must resolve from our tree.

---

## 9. Math appendix — the authoritative numbers

All values below are produced by `npm run verify:rtp` in exact rational arithmetic.
If the code disagrees with this table, the code is wrong or this table is stale —
either way one commit fixes both.

### 9.1 Paytable

| Lot | Face | Weight /10,000 | Probability |
|---|---|---|---|
| Empty crate | 0.00× | 6,690 | 66.90% |
| Ship's stores | 0.50× | 1,000 | 10.00% |
| Cordage | 1.00× | 1,600 | 16.00% |
| Sailcloth | 2.00× | 550 | 5.50% |
| Ordnance | 5.00× | 140 | 1.40% |
| *Sarah Christiana* | 25.00× | 20 | 0.20% |

`E[face] = 0.44×`

### 9.2 Wax ladder
`[1.00, 0.85, 0.70, 0.55, 0.40]`

### 9.3 Continuation values and thresholds

| Inch | Wax | `A(k)` | Claim if face ≥ | In practice |
|---|---|---|---|---|
| 1 | 1.00 | 0.969961 | 0.75418 | claim ≥ 1.00× |
| 2 | 0.85 | 0.754176 | 0.64664 | claim ≥ 1.00× |
| 3 | 0.70 | 0.549643 | 0.51392 | claim ≥ 1.00× *(0.50× misses by 0.0139)* |
| 4 | 0.55 | 0.359744 | 0.32000 | claim ≥ 0.50× |
| 5 | 0.40 | 0.176000 | — | forced |

### 9.4 Headline figures

```
Declared RTP (optimal play) : 96.9961%
   exact                    : 7577820426157 / 7812500000000
House edge                  :  3.0039%
Max payout                  : 25x stake (first inch only)
P(payout >= 1x)             : 36.4741%
P(payout = 0)               : 20.3531%
P(payout >= 5x)             :  2.0239%
Standard deviation          :  1.7568
Mean round length           :  3.12 inches
Reach probability by inch   : 100% / 76.90% / 59.14% / 45.48% / 30.42%
```

### 9.5 Strategy band

| Policy | RTP |
|---|---|
| Optimal | 96.996% |
| Claim ≥ 1.00× | 96.546% |
| Claim ≥ 0.50× (anything non-empty) | 93.577% |
| Hold for ≥ 2.00× | 78.308% |
| Hold for ≥ 5.00× | 52.959% |
| Claim the first lot regardless (unreachable — nobody claims an empty crate) | **44.000%** |

> **Corrected on D1.** This row read **46.500%**, as does `prd.md` §4.5. Claiming
> whatever is on the table at the first inch is worth `E[face] × wax(1) = 0.44 ×
> 1.00 = 0.44` exactly — 44.000%. An exhaustive scan over 200,000 per-inch
> policies found none worth 46.500%, so the old figure corresponds to no policy at
> all. It is a floor on nothing and the argument does not need it: the row exists
> only to show that the degenerate baseline is unreachable, which 44.000% says
> just as well.

### 9.6 Hand-checkable identities

A reviewer can verify the skeleton without running anything:

- `E[face] = 0.5(0.10) + 1(0.16) + 2(0.055) + 5(0.014) + 25(0.002) = 0.44`
- `A(5) = 0.40 × 0.44 = 0.176`
- Pass probability at inches 1–3 = `P(0×) + P(0.5×) = 0.6690 + 0.1000 = 0.7690`,
  which is exactly the reach probability of inch 2; inch 3 is `0.7690²`, inch 4 is
  `0.7690³`, inch 5 is `0.7690³ × 0.6690`.
- `P(payout = 25×) = P(25× at inch 1) = 0.002 = 0.2000%`

### 9.7 Historical sources for the theme
Candle auctions: House of Lords records, 1641 · John Milton, 1652, recommending
sale "by inch of candle" as the likeliest way to reach the true value of goods ·
Samuel Pepys' diary, November 1660 and September 1662, the Admiralty selling
surplus ships by the inch · the pin pushed into the wax at Lloyd's so its fall
marked the end · the wick's flare just before it dies, which Pepys records a bidder
using as his cue · surviving annual candle auctions at Tatworth and Chedzoy,
Somerset.


---

## 10. THE SURVEY

The second entry. Same origin, same room, same everything structural — and a
different bet object: **sequential hypothesis testing** rather than discounted
optimal stopping.

### 10.1 What it shares, unchanged

`shared/bridge` (the `GameHost` interface, the whole penpal path, the PRNG),
`shared/render/light.ts`, `shared/audio/engine.ts` and `pacing.ts`,
`shared/math/rational.ts`, `shared/rng.ts` (the 16-bit windows, the rejection
limit, the rehash cap), `shared/ui/tokens.css` and `table.css`. Its React shell
is the same shape, its `?` panel is the same shape, its log is the same shape,
and the same rules govern all of it: the contract is the only authority, the host
owns the balance, nothing is written to browser storage.

### 10.2 The core (`src/games/survey/core/`)

| File | What it holds |
|---|---|
| `vessel.ts` | THE MANIFEST: six cargoes, the prior (2/5), the surveyor's accuracy (3/5), the premium ladder, the decline payout, and the one payout rule. |
| `belief.ts` | The posterior and the predictive, in exact rationals. `margin` is a sufficient statistic; two disagreeing reports cancel exactly. |
| `draw.ts` | Where randomness enters, and in which order. Mirrors `Survey.sol` window for window. |
| `round.ts` | `(state, input) -> state`. OFFERED → WEIGHING → COMMITTED → SETTLED, or → DECLINED. |
| `solve.ts` | The DP over `(surveys, margin)` per cargo, the policies, the strategy band. |

### 10.3 The reversed generative order — the security model

Every hook on `Survey.sol` is `view`, so the only state is `ctx.gameState`, which
the facet emits on every step and the player echoes back. It is public, and so is
every VRF word. **If the ship's condition were drawn at the start it could simply
be read.**

So the model is factored the other way:

- a **report** is drawn from the PREDICTIVE distribution, which depends only on
  the margin so far and is therefore safe to compute in the open;
- her **condition** is drawn at SETTLEMENT from the POSTERIOR given the final
  margin, out of a word requested by `UNDERWRITE` — a word that does not exist
  until the call is already locked in.

The joint distribution over (reports, truth) is identical either way; it is the
same probability model, factored so that nothing which decides the voyage exists
while the player can still act on it. `npm run bench` checks the two
factorisations agree over 10⁶ voyages, at every margin a report was drawn at, and
`npm run round-trip:survey` checks on chain that the settling word appears in no
step the player could have acted on.

`DECLINE` settles in the same transaction and needs no word at all: it pays the
same whatever she was. A player who walks away can never be left waiting on
randomness — which is what makes `cancelStuckRandomness` refunding only the
escrowed stake survivable here.

### 10.4 `gameState`, five bytes

`abi.encodePacked(uint16 valueBp, uint8 surveys, uint8 margin + 128, uint8 phase)`.
The margin is signed and the state is bytes, so it travels biased by 128. The
decoder refuses a margin that is impossible for the number of reports — out of
range, or of the wrong parity — and refuses a `valueBp` the manifest never issued.

### 10.5 The scene, and what it claims

Two claims, both measurable, both checked by `npm run verify:light` and
`test/survey-scene.spec.ts`:

- **The fog is the doubt.** The ink over the window is exactly
  `1 − P(the better call is right)`. A disagreeing pair of reports puts it back to
  the digit, which is the game's one mathematical claim made visible.
- **The light is the day.** Every surveyor costs an hour of daylight and the room
  walks CANDLE's own 100 → 40% ladder, ending at the brightness the candle
  gutters at. Deliberately NOT the premium ladder: 1.5 points a head is invisible
  and inside 8-bit rounding, and a claim a reviewer cannot measure is one we do
  not make (`app/daylight.ts`).

The canvas reserves the bottom of its box for the DOM readout and draws nothing
there. That rule exists because it was broken first.

### 10.6 The numbers

| | |
|---|---|
| Declared RTP, optimal play | **97.4141%** = `60883787 / 62500000` |
| House edge | 2.5859% |
| Maximum payout | 20× (no surveys, and she comes home) |
| Prior | 2/5 — four ships in ten |
| A surveyor is right | 3/5 — one report multiplies the odds by 3/2 |
| A surveyor costs | 150 bp of the premium |
| Declining pays | 0.60× of the premium |
| Mean surveyors bought | 2.548 |
| Published band | 93.295% (send everybody) … 97.414% (optimal) |

**Every** published policy is inside the jam's 93–98% window, including sending
nobody and sending everybody. That is a stricter form of I2 than CANDLE manages
and it is the constraint the manifest was tuned around: sharper evidence pays the
careful player out of the top of the band and drops the careless one below the
bottom of it. `docs/phases.md` §7 records the search.

---

## 11. THE BROKERS

The third entry. Same origin, same room, same everything structural — and a third
bet object: **search with recall**, which is Weitzman's Pandora's Box (1979).

### 11.1 What it shares, unchanged

Everything §10.1 lists: `shared/bridge`, `shared/render/light.ts`,
`shared/audio/engine.ts` and `pacing.ts`, `shared/math/rational.ts`,
`shared/rng.ts`, `shared/ui/`. Its React shell, `?` panel and log are the same
shapes as the other two, under the same rules — the contract is the only
authority, the host owns the balance, nothing is written to browser storage.

### 11.2 The core (`src/games/brokers/core/`)

| File | What it holds |
|---|---|
| `market.ts` | THE FLOOR: the house's two opening prices, four brokers, their fees and quote ladders, `MAX_PAYOUT_BP`, and the one payout rule. |
| `weitzman.ts` | The reservation price `z`, solved in CLOSED FORM; the surplus `E[(X − z)⁺]`; the index, the asking order, and `pandoraChoice`. |
| `draw.ts` | Where randomness enters. One word per price named. Mirrors `Brokers.sol` window for window. |
| `round.ts` | `(state, input) -> state`. OPENING → SHOPPING → SETTLED. `TAKE` is legal at every point. |
| `solve.ts` | The DP over `(askedMask, bestPrice)`, the policies, the strategy band, and the round's shape. |

### 11.3 The index, and why it is the whole game

A broker's reservation price `z` is the price at which you are indifferent
between asking him and not:

```
E[(X − z)⁺] = c          X = what he might name, c = his fee
```

Weitzman's theorem: **ask in descending `z`, and stop as soon as what you hold
beats the best remaining `z`.** That rule is optimal — not a heuristic, and not
an approximation of the dynamic program. It IS the dynamic program.

The left-hand side is piecewise linear in `z`, so the solution is closed form on
whichever segment it lands in:

```
z = (Σ_{p > z} w·p − c) / Σ_{p > z} w
```

`npm run verify:brokers` solves it, checks both sides of the defining equation
exactly as rationals, and then checks the rule against the DP **at all 120
reachable states** — the line that reads `PANDORA'S RULE IS THE DYNAMIC
PROGRAM`.

The floor is tuned so the index order is the exact **reverse** of the
average-price order. Delane names the worst average price on the floor (0.4995×)
and goes first; Stubbs names the best (0.7490×) and is the last man worth asking.
That is not decoration: a player who ranks the brokers by what they average — the
rule anyone invents on round three — asks in precisely the wrong order, and that
rule is published in the band at 93.500%, next to the optimal 96.9637%.

### 11.4 Nothing is hidden, and that is the design

THE SURVEY needs its reversed generative order because a `view`-only contract
that emits its whole state cannot hold a secret. THE BROKERS has no secret to
hold. What a broker will say is simply **not yet drawn**: the word for his price
is requested by the action that asks him, so it does not exist while the player
is deciding whether to pay his fee (I4, I15). `TAKE` draws nothing at all and
settles in the same transaction.

So the `?` panel publishes the optimal rule in full — every index, the asking
order, the whole band. The game is not selling an information edge over the
player. It is selling the ten seconds in which they decide whether to believe a
theorem that says the cheapest-looking man is the right one to pay first.

### 11.5 `gameState`, five bytes

`abi.encodePacked(uint16 bestBp, uint8 askedMask, uint8 pending, uint8 phase)`.

`bestBp` is the state, not the list of prices: recall means every price named
stays available, so you would only ever take the best one and what the others
said cannot change a decision. The list is carried in the client for the UI and
never for a decision.

`pending` is the broker whose word is in flight, `0xFF` for nobody. It exists
because asks may come in any order, so the mask alone cannot say who is holding
the claim.

### 11.6 The scene, and what it claims

Two claims, both measurable, both checked by `npm run verify:light` and
`test/brokers-scene.spec.ts`:

- **Distance is the ratio.** The price board is logarithmic, so equal distances
  are equal multiples of the stake: a doubling is 26.07% of the board wherever it
  sits — at 0.40→0.80× and at 2.30→4.60× alike. A linear board wasted 80% of the
  canvas on prices nobody names.
- **The light is what the day has cost.** The room dims with the fees owed, from
  full flame at 0% to 70% once every man has been paid — 30% of the light for
  14.7% of the stake. One honest range rather than a dramatic one.

Five columns, fixed: the house and the four brokers in the order they stand on
the floor, which is the order the keys `1`–`4` ask them in. A man keeps his
column whether or not he has named anything, so the board never reshuffles under
the player — an earlier version packed the slips left and moved everything on
every ask. The canvas reserves the bottom of
its box for the DOM readout and draws nothing there — the same rule as §10.5, and
for the same reason.

### 11.7 The numbers

| | |
|---|---|
| Declared RTP, optimal play | **96.9637%** = `1551418623 / 1600000000` |
| House edge | 3.0363% |
| Maximum payout | 4.9905× — the best price on the floor, less the fee of the only man who names it |
| Minimum payout | 0.7030× — **there is no losing state in this game** |
| The house's opening price | 0.85× or 1.02×, evens, for no fee |
| All four fees together | 14.70% of the stake |
| Mean brokers asked | 2.735 |
| Kept the house's own price | 65.5% |
| Published band | 93.500% (take what the house names) … 96.964% (the index) |

**Every** published policy is inside the jam's 93–98% window — the same stricter
form of I2 that THE SURVEY holds. The fees are what hold it there: they are large
enough that asking everybody is a real mistake (93.946%) and small enough that
taking the first price is not a disaster (93.500%). `docs/phases.md` §8 records
the search, including the version where a flat opening offer made the decision
worthless.

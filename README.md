<!--
  GENERATED FILE — DO NOT EDIT.
  Written by `npm run gen:readme` from src/game/, src/render/ and src/audio/.
  Every number below is recomputed from the paytable by the same DP that
  `npm run verify:rtp` runs, in exact BigInt rationals. Edit the source, re-run.
-->

# CANDLE

> **A lot is on the table. The candle is burning. Every inch you wait is worth less.**

A provably-fair on-chain wagering game for **Chain Jam Vol. 1**. Take the lot in
front of you, or let the candle burn an inch and see the next one — knowing the
next one is worth less by construction.

### ▸ Play it: **https://candle-ashen-tau.vercel.app**

Free play. No wallet, no modal, no splash — the first lot is already on the table
when the page loads.

**Declared RTP 96.9961%** under optimal play, exactly
`7577820426157 / 7812500000000`. Reproduce it in under a minute:

```sh
npm install && npm run verify:rtp
```

---

## Why this is not a clone of anything

Essentially every "original" in the crypto-casino canon reduces to one of three
shapes: **pick a probability and get 1/p** (dice, limbo, roulette), **accumulate
and bank before a bust** (crash, mines, towers, hi-lo), or **match symbols**
(slots, wheels). CANDLE is none of them. Its shape is *a sequence of i.i.d. offers,
each of which may be accepted once, under a deterministic decay, with a forced
acceptance at the horizon* — the **Gilbert–Mosteller full-information optimal
stopping problem** with discounting. It is a well-studied object in operations
research and it has never been turned into a wagering game. **There is no bust
state and nothing accumulates**, so it cannot be a crash clone; there is no
probability selector, so it cannot be a dice clone. The risk you carry is regret,
not ruin.

The dressing is equally unclaimed. Auction **by the inch of candle** is a real
mechanism: in the records of the House of Lords by 1641, endorsed by John Milton in
1652 as the surest way to reach the true value of goods, used by the Admiralty to
sell surplus ships in 1660 and 1662 as Pepys records, and still run once a year at
Tatworth in Somerset. Lloyd's auctioneers pushed a **pin** into the wax an inch
below the wick so its fall marked the end. Pepys notes a bidder's trick: the wick
**flares** just before it dies, and he shouted his last bid on seeing it. Every one
of those details is a mechanic here.

---

## The rules, in two sentences

> Take the lot on the table, or let the candle burn an inch and see the next one.
> Each inch you burn, the prize is worth 15 points less — and when the candle
> gutters you must take whatever is in front of you.

---

## The paytable

| Lot | Face | Weight / 10,000 | Probability | Pin drop |
|---|---|---|---|---|
| Empty crate | **0.00×** | 6,690 | 66.90% | 196 Hz |
| Ship's stores | **0.50×** | 1,000 | 10.00% | 245 Hz |
| Cordage | **1.00×** | 1,600 | 16.00% | 340 Hz |
| Sailcloth | **2.00×** | 550 | 5.50% | 473 Hz |
| Ordnance | **5.00×** | 140 | 1.40% | 731 Hz |
| The Sarah Christiana | **25.00×** | 20 | 0.20% | 1568 Hz |

`E[face] = 0.44×`. The player's job is to turn
0.44 into 0.97 by refusing junk — which is
exactly what optimal stopping buys, and exactly what the wax ladder charges for.

Cumulative weights: `6690, 7690, 9290, 9840, 9980, 10000`.

## The wax ladder, and when to claim

| Inch | Pins | Wax | A 2.00× lot pays | `A(k)` | Claim if face ≥ |
|---|---|---|---|---|---|
| 1 | ●●●●● | **100%** | 2.00× | 0.969961 | 0.75418 |
| 2 | ●●●●○ | **85%** | 1.70× | 0.754176 | 0.64664 |
| 3 | ●●●○○ | **70%** | 1.40× | 0.549643 | 0.51392 |
| 4 | ●●○○○ | **55%** | 1.10× | 0.359744 | 0.32000 |
| 5 | ●○○○○ | **40%** | 0.80× | 0.176000 | *forced* |

`A(k)` is the expected return of arriving at inch *k* and playing optimally;
the threshold is `A(k+1) / wax(k)`. The whole optimal policy collapses to one
printable sentence, and it is printed in the game under `?`:

> **Never claim an empty crate. Claim anything worth 1.00× or more. Claim the
> 0.50× only at the fourth inch.**

The knife edge the design rests on: a **0.50× lot at the third inch**, against a threshold of 0.51392 — it misses by **0.01392**. Ten hours in, a player is still arguing with themselves about that one.

---

## Return to player

| | |
|---|---|
| Declared RTP, optimal play | **96.9961%** |
| Exact | `7577820426157 / 7812500000000` |
| House edge | 3.0039% |
| Maximum payout | **25×** stake (first inch only) |
| P(payout ≥ 1×) | 36.4741% |
| P(payout = 0) | 20.3531% |
| P(payout ≥ 5×) | 2.0239% |
| Standard deviation | 1.7568 |
| Mean round length | 3.12 inches |
| Reach by inch | 100.00% / 76.90% / 59.14% / 45.48% / 30.42% |

### The strategy band

The jam requires a theoretical RTP between 93% and 98%. For a game with decisions
"the RTP" is policy-dependent, so the **whole band** is published — including the
careless end. We are not selling an information edge over the player.

| How you play | Returns | |
|---|---|---|
| Optimal — *the declared RTP* | **96.996%** | ✅ in band |
| Claim >= 1.00x — *the printed rule* | **96.546%** | ✅ in band |
| Claim >= 0.50x (anything non-empty) — *the impatient player* | **93.577%** | ✅ in band |
| Hold for >= 2.00x — *the greedy player* | **78.308%** | — |
| Hold for >= 5.00x | **52.959%** | — |
| Claim the first lot regardless — *unreachable — nobody claims an empty crate* | **44.000%** | — |

Every policy a human would plausibly adopt sits inside the window. Only
deliberately perverse play falls out of it, which is true of blackjack and video
poker too.

---

## The light model is the product

The wax ladder is rendered as the **actual relative luminance of the scene**, in
linear light. Pick any colour out of the frame at the fifth inch, measure it, and
it is 40% of the same colour at the first — not "looks dimmer".

| Inch | Wax | Flame | Tallow | Luminance | Of inch 1 | On ink |
|---|---|---|---|---|---|---|
| 1 | 100% | 2000 K | `rgb(246 230 196)` | 0.8017 | **100.00%** | 16.04:1 |
| 2 | 85% | 1875 K | `rgb(237 215 129)` | 0.6819 | **85.06%** | 13.89:1 |
| 3 | 70% | 1750 K | `rgb(221 196 119)` | 0.5618 | **70.08%** | 11.72:1 |
| 4 | 55% | 1625 K | `rgb(203 174 107)` | 0.4403 | **54.92%** | 9.50:1 |
| 5 | 40% | 1500 K | `rgb(181 149 93)` | 0.3211 | **40.05%** | 7.24:1 |

Four inks only — tallow, brass, oxblood, ink — one light source, hierarchy carried
by luminance. The flame walks down the Planckian locus as it dies, because a real
one does; an LED-like constant hue is the visible tell of a fake light model.
Brass carries the lot's face value, so it clears WCAG AA against the room even at
the gutter.

`npm run verify:light` measures all of it.

---

## Verify everything

| Command | What it proves |
|---|---|
| `npm run verify:rtp` | The declared RTP, recomputed from the paytable across all 30 reachable `(inch, lot)` states in exact rationals. Nothing read from a constant. |
| `npm test` | Unit, parity, strategy band, RNG, light model, scene, pacing, the Ghost Lot, and the UI driven through a whole round. |
| `npm run bench` | 10⁷ draws and 10⁷ simulated rounds, within 5σ of the closed form. |
| `npm run verify:light` | Luminance is exactly the wax ladder; the blackbody walk; WCAG contrast at every inch. |
| `npm run frame-budget` | p95 frame time during a burn, against a 12 ms budget. |
| `npm run cold-open` | Critical path and time to first playable frame. |
| `npm run gates` | Bundle size, one widget tag, `frame-ancestors *`, no `X-Frame-Options`, manifest, no browser storage. |
| `npm run spike` | Every SDK symbol used, exercised end to end against a local chain and a real VRF node. |

See [DEMO.md](./DEMO.md) for a one-minute reviewer runbook with the expected output
inline.

---

## The contract

```sh
npm run contracts:build                                   # forge, solc 0.8.30, viaIR
RPC_URL=https://…  DEPLOYER_KEY=0x…  npm run deploy:contract
```

No constructor arguments, no storage — every hook is `view` and session state
travels in four bytes of `gameState` that the facet emits and takes back. The
deployed bytecode is **2,568 bytes**, a tenth of the EIP-170 limit.

`deploy:contract` has no default chain on purpose, and reads the contract back
after deploying: a contract that deployed but answers differently is worse than
one that failed, because nothing tells you.

## How it is built

```
contracts/Candle.sol      ICasinoGameV2. Five hooks, one _payout(), one VRF word per inch.
contracts/ICasinoGameV2.sol  Vendored from the SDK, so a standard toolchain can build it.
contracts/generated/      Mirrored from src/game/paytable.ts. Never hand-edited.
src/game/                 PURE core: paytable, wax ladder, exact-rational DP, RNG, state machine.
src/render/               The light model, and one canvas. Nothing else draws.
src/audio/                Three Web Audio graphs. Zero audio files.
src/bridge/               The chain.wtf host, and a free-play host with the same interface.
src/ui/                   A thin React layer holding no game logic.
```

**One VRF word per inch.** `LET IT BURN` is an on-chain action that requests the
next word, so the word for inch *k+1* is causally after the burn that asked for it
and cannot be read, predicted or front-run. Randomness is mapped by **rejection
sampling** over 16-bit windows — `word % n` is biased and is not used anywhere.

The contract holds **no storage**: every hook is `view`, and session state travels
in four bytes of `gameState` that the facet emits and takes back.

---

## Playing it

- **Standalone** — open the page and the first lot is already on the table. Free
  play, no wallet, no modal, no splash. The purse lasts one page load and nothing
  is written to browser storage: a balance that looks like it survives a reload
  and does not is a worse lie than one that obviously resets.
- **`?seed=198`** makes free play deterministic, for recording and for
  reproducing a reported round. Free play only — inside a host the contract's VRF
  is the only authority on outcomes and nothing client-side can touch it.
- **In the chain.wtf host** — the host owns the wallet, the balance and the bet
  limits. The contract is the only authority on outcomes; the client animates what
  it is told and never recomputes a result.

Keyboard: `Space`/`Enter` claim · `B`/`↓` let it burn · `Enter` deal again ·
`?` the paytable and the full strategy band · `M` sound · `T` turbo.

## Responsible design

The mechanics were chosen partly because they behave well. The game **cannot lose
more than the stake**, has no bust state, no accumulating sunk-cost ladder, no
autoplay and no near-miss theatre. The Ghost Lot — the lot that would have come
next — is drawn only once the round has settled, changes no payout, and is stated
once and flatly; there is a test that walks every string in the game and fails on
an exclamation mark or a "you were so close". No loss-chasing prompts, no
escalating bet suggestions. The standalone build is free play and says so.

---

*A lot is on the table. The candle is burning. Take it, or let an inch burn and see the next one — knowing the next one is worth less.*

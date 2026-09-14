# PRD — CANDLE

**Chain Jam Vol. 1 entry · v1.0 · 2026-09-14**
Deadline: 2026-09-20 23:59 UTC · Judging 09-21 → 09-30 · Winners 10-01

---

## 1. The one-liner

> **A lot is on the table. The candle is burning. Every inch you wait is worth less.**

CANDLE is a single-player wagering game built on a decision primitive that does not
exist anywhere in the casino industry: **discounted optimal stopping**. You are not
guessing a number, not climbing a multiplier, not avoiding a mine. You are being
shown a concrete offer and asked whether it is better than the one that might come
next — knowing that the next one is worth less by construction.

---

## 2. Why this wins the brief

The jam scores four unweighted criteria. This is how the design answers each one.

### 🆕 Novelty — *is there a similar game on the market?*

No. And the gap is structural, not cosmetic.

Essentially every "original" in the crypto-casino canon reduces to one of three
shapes: **pick a probability and get `1/p`** (dice, limbo, roulette), **accumulate
and bank before a bust** (crash, mines, towers, hi-lo), or **match symbols**
(slots, wheels). CANDLE is none of them. Its shape is:

> a sequence of i.i.d. offers, each of which may be accepted once, under a
> deterministic decay, with a forced acceptance at the horizon.

That is the **Gilbert–Mosteller full-information optimal stopping problem** with
discounting. It is a well-studied object in operations research and it has never
been turned into a wagering game. There is no bust state, so it cannot be a crash
clone; there is no probability selector, so it cannot be a dice clone.

The dressing is equally unclaimed. **Auction by the inch of candle** is a real
historical mechanism: known in the records of the House of Lords by 1641, endorsed
by John Milton in 1652 as the surest way to reach the true value of goods, used by
the Admiralty to sell surplus ships in 1660 and 1662 as recorded by Pepys, still
running once a year on a plot of land in Tatworth, Somerset. Lloyd's auctioneers
pushed a **pin** into the wax an inch below the wick so the pin's fall marked the
end. Pepys records a bidder's trick: the wick **flares** just before it dies, and
he shouted his final bid on seeing it.

Every one of those details is a mechanic or an animation in this game. The primitive
needs no explaining because everyone already understands a candle burning down.

### 😃 Fun — *will someone still play after 10 hours?*

Three things carry it past the novelty window:

1. **A real decision, every single round.** Roughly 36% of lots offered are
   non-empty, and the interesting ones sit right on the knife edge. The claim
   threshold at the third inch is **0.5139×** against a lot whose face is **0.5×** —
   a hair's width. Ten hours in, a player is still arguing with themselves about
   that one.
2. **The Ghost Lot.** After every settled round the game reveals the lot that
   *would* have come next. "You claimed 1.00×. The next lot was 5.00×." The
   randomness for it is drawn after the decision is locked, so it leaks nothing and
   is fully verifiable — it exists purely to produce the feeling that keeps
   optimal-stopping problems alive in people's heads. This is the retention loop.
3. **A skill floor that is real but shallow.** The whole optimal policy fits in one
   sentence, and we print it. But *executing* it while a 5× is sitting there at the
   second inch is a different matter. The spread between playing well and playing on
   nerves is 3.4 percentage points of RTP — enough to matter, small enough that
   nobody is punished for being human.

### 🌀 Simplicity — *understood quickly, no manual needed?*

The entire rule set is two sentences:

> Take the lot on the table, or let the candle burn an inch and see the next one.
> Each inch you burn, the prize is worth 15 points less — and when the candle
> gutters you must take whatever is in front of you.

On load, with zero clicks, the screen shows the lot, its face value, the candle with
its five pins, the exact payout if claimed right now, and two buttons: **CLAIM** and
**LET IT BURN**. There is no splash, no tutorial, no modal, no connect-wallet.

The decay is *shown, not stated*: the scene is lit by the candle, so the room
physically dims as the wax burns. The multiplier is the brightness.

### 🔊 Visual & sound — *does it feel like a real game? No AI slop.*

One direction sentence governs everything: **Lloyd's Coffee House, London, 1728, lit
by a single candle.** Four inks — tallow, brass, oxblood, ink — one light source,
hierarchy carried by luminance. Warm light cools down the blackbody curve as it
dims, because real flame does; it is verifiable with a colour picker and costs
nothing. Zero image assets above 8 KB.

Audio is three Web Audio synthesis graphs and **zero audio files**: a filtered
coffee-house room bed, wax crackle keyed to flame intensity, and events — pin drop,
gavel, flare. The pin drop's pitch rises with the face value of the lot being
offered, so a practised player *hears* a good lot before reading it.

---

## 3. Players

| | Who | What they need |
|---|---|---|
| **P1** | The chain.wtf player, mid-session, bored of dice | Something to actually *decide*. Understands nothing at first glance and everything by round two. |
| **P2** | The jam judge, 90 seconds per entry, twelve tabs open | Comprehension in 5 seconds, a defensible novelty claim, math they can recompute, a build that loads instantly and does not embarrass them. |
| **P3** | The math-curious player who reads paytables | Published thresholds, an exact rational RTP, and a strategy table that respects them. |
| **P4** | Anyone landing on the bare URL with no wallet | A full, honest, free-play round in under two seconds. |

---

## 4. The game

### 4.1 Core loop

1. Player sets a stake and lights the candle. The candle carries **five pins** —
   five inches, five lots.
2. **A lot is placed on the table.** Its face value is drawn from the published
   paytable. Most lots are empty.
3. Player chooses:
   - **CLAIM** → the round settles. Payout = *face value* × *wax remaining* × stake.
   - **LET IT BURN** → one inch burns, the room dims, the next lot is drawn.
4. At the **fifth inch** the wick flares (Pepys' tell) and the candle gutters. The
   lot on the table is claimed automatically, whatever it is.
5. The Ghost Lot is revealed. Deal again.

Average round length is **3.12 inches**; a round is 8–15 seconds of real time.

### 4.2 The wax ladder

| Inch | Pins remaining | Wax | Payout on a 2.00× lot |
|---|---|---|---|
| 1 | ●●●●● | **100%** | 2.00× |
| 2 | ●●●●○ | **85%** | 1.70× |
| 3 | ●●●○○ | **70%** | 1.40× |
| 4 | ●●○○○ | **55%** | 1.10× |
| 5 | ●○○○○ | **40%** | 0.80× — *forced* |

Fifteen points of the prize per inch. Clean enough to do in your head, which is the
point: the player must be able to price patience without a calculator.

### 4.3 The paytable

Face values and their weights, out of 10,000:

| Lot | Face | Weight | Probability |
|---|---|---|---|
| Empty crate | **0.00×** | 6,690 | 66.90% |
| Ship's stores | **0.50×** | 1,000 | 10.00% |
| Cordage | **1.00×** | 1,600 | 16.00% |
| Sailcloth | **2.00×** | 550 | 5.50% |
| Ordnance | **5.00×** | 140 | 1.40% |
| The *Sarah Christiana* | **25.00×** | 20 | 0.20% |

Expected face value of a lot: **0.44×**. The player's job is to convert 0.44 into
0.97 by refusing to accept junk — which is exactly what optimal stopping buys you,
and exactly what the wax ladder charges for.

### 4.4 The math that matters

Let `A(k)` be the expected return of arriving at inch *k* and playing optimally, and
`w(k)` the wax remaining. Then

```
A(5) = w(5) · E[face]                          (forced)
A(k) = E[ max( face · w(k) , A(k+1) ) ]        for k = 1..4
RTP  = A(1)
```

| Inch | Wax | `A(k)` | Claim if face ≥ |
|---|---|---|---|
| 1 | 1.00 | 0.969961 | **0.75418** |
| 2 | 0.85 | 0.754176 | **0.64664** |
| 3 | 0.70 | 0.549643 | **0.51392** |
| 4 | 0.55 | 0.359744 | **0.32000** |
| 5 | 0.40 | 0.176000 | *forced* |

**Declared RTP = 96.9961%** — exactly `7577820426157 / 7812500000000`. House edge
3.0039%. Maximum payout **25×** stake (only available at the first inch).

Because the paytable has only six face values, the whole optimal policy collapses to
one printable sentence:

> **Never claim an empty crate. Claim anything worth 1.00× or more. Claim the 0.50×
> only at the fourth inch.**

### 4.5 The strategy band — why this is compliant

The jam requires a theoretical RTP between 93% and 98%. For a game with decisions,
"the RTP" is a policy-dependent quantity, so we report the whole band. It was
engineered to fit entirely inside the window:

| Policy | RTP |
|---|---|
| **Optimal** (declared) | **96.996%** |
| "Claim anything ≥ 1.00×" — the printed rule | 96.546% |
| "Claim anything non-empty" — the impatient player | 93.577% |
| "Hold out for ≥ 2.00×" — the greedy player | 78.308% |
| "Hold out for ≥ 5.00×" | 52.959% |

Every policy a human being would plausibly adopt sits between **93.58%** and
**97.00%**. Only deliberately perverse play falls out of band, and that is true of
blackjack and video poker too. Nobody claims an empty crate, so the degenerate
"always take the first lot" baseline (46.5%) is unreachable in practice.

### 4.6 Outcome distribution under optimal play

| Payout | Probability | | Payout | Probability |
|---|---|---|---|---|
| 25.00× | 0.2000% | | 1.00× | 16.0000% |
| 21.25× | 0.1538% | | 0.85× | 12.3040% |
| 17.50× | 0.1183% | | 0.80× | 1.6733% |
| 13.75× | 0.0910% | | 0.70× | 9.4618% |
| 10.00× | 0.0608% | | 0.55× | 7.2761% |
| 5.00× | 1.4000% | | 0.40× | 4.8677% |
| 4.25× | 1.0766% | | 0.275× | 4.5476% |
| 3.50× | 0.8279% | | 0.20× | 3.0423% |
| 2.75× | 0.6367% | | **0.00×** | **20.3531%** |
| 2.00× | 5.9259% | | | |
| 1.70× | 4.2295% | | | |
| 1.40× | 3.2525% | | | |
| 1.10× | 2.5012% | | | |

- **P(payout ≥ 1×) = 36.47%** — a return or better better than one round in three.
- **P(payout = 0) = 20.35%** — a fifth of rounds gutter on an empty crate.
- **P(payout ≥ 5×) = 2.02%**
- **Standard deviation = 1.757** — medium-high volatility. Comparable to a video
  slot, well short of a crash tail.
- Probability of reaching each inch: 100% / 76.90% / 59.14% / 45.48% / 30.42%.

---

## 5. Product surfaces

### 5.1 In the chain.wtf iframe (real money)
The host owns the wallet, the balance and the bet limits. The game reads
`ui.theme` from the host and renders to match. All settlement is on-chain through
the SDK bridge; nothing about an outcome is computed client-side when a host is
present — the contract writes the result and the client animates it.

### 5.2 Standalone (the jam gallery, and anyone with the URL)
The same build, no host, no wallet, no modal. Free-play mode is **labelled** as
such, driven by a seeded PRNG, and opens with a play-chip purse. The purse lives
for exactly one page load and nothing is written to browser storage — a balance
that looks like it survives a reload and does not is a worse lie than one that
obviously resets.

---

## 6. Scope

### v1 — must ship by 09-20
- `Candle.sol` implementing `ICasinoGameV2`, five-inch session lifecycle
- Pure TS game core mirroring the contract, 100% covered
- Host bridge + standalone demo host
- Single canvas renderer, candlelight scene, five-pin candle, lot table
- Three audio graphs
- Ghost Lot reveal
- `?` panel with the full paytable, wax ladder and optimal thresholds
- Full keyboard control
- Manifest, jam widget, `frame-ancestors *`, static deploy

### Stretch — only if v1 is green
- **Real-time burn:** the candle burns on a clock, so hesitation itself costs wax.
  (Client-side pacing only; the contract's hard timeout always settles by *claiming*
  the current lot so a player can never be harmed by a slow network.)
- **The Ledger:** a session log of claims against ghosts.
- **Candle lengths:** 3-inch and 7-inch variants at identical RTP, as a volatility
  selector.

### Never
Autoplay, turbo-through-100-rounds, leaderboards, chat, referrals, loss-chasing
toasts, any mechanic that can lose more than the stake.

---

## 7. Non-functional requirements

| | Target |
|---|---|
| Cold open (blank tab → playable) | p95 < 400 ms; hard budget 1,200 ms |
| Frame time during a burn | p95 < 12 ms (60 fps budget 16.7) |
| Bundle | < 150 KB gzipped, zero audio files, no image over 8 KB |
| Embeddability | `frame-ancestors *`, no `X-Frame-Options` anywhere |
| Accessibility | Full keyboard path; no information carried by colour alone; sound is additive |
| Determinism | Contract and client agree on all 30 reachable states, bit-for-bit |

---

## 8. Success criteria

**Eligibility (binary, all must pass):**
SDK implemented exactly (contract, bridge, manifest) · runs in the local simulator ·
declared RTP matches the actual paytable · recognisably a casino game · novel ·
standalone playable · jam widget present · submitted with source access.

**Quality:**
- A judge who has never seen it can state the rules correctly after one round.
- The novelty claim survives a hostile reading: name the game it clones. There
  isn't one.
- Every number in the README is reproducible by `npm run verify:rtp` in under a
  minute.

**Commercial (the part that actually pays):**
The prize pool is 1,000 USDC; the lifetime 25% revenue share on an integrated game
is the real prize. So the bar is not "wins the jam" but **"chain.wtf wants this in
the catalogue"**: correct math, sane volatility, low variance in operational risk,
a 25× cap that does not threaten the bankroll, and a loop short enough to hold a
session.

---

## 9. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| SDK may not support multiple randomness requests in one session | Fatal to the design | **Day-0 spike.** Tug's five-hold structure suggests it does. Fallback in `docs.md` §7.4. |
| Judges test RTP with naive play and read 93.6% | Looks like a miss | The band is published up front in the README and the `?` panel; every sensible policy is in range by construction. |
| "Isn't this just hold-or-bank?" | Novelty score | Answer in one line: there is no bust and nothing accumulates. The decay is deterministic and the risk is regret, not ruin. |
| Framework preset injects `X-Frame-Options: SAMEORIGIN` | Silently loses the gallery preview | CI re-reads the live origin after deploy and fails on it. |
| Six days | Everything | `plan.md` §Kill list, cut top-down. |

---

## 10. Responsible design

Not a compliance checkbox — the mechanics were chosen partly because they behave
well. The game cannot lose more than the stake, has no bust state, no accumulating
"sunk cost" ladder, no autoplay, and no near-miss theatre (the Ghost Lot is honest
information about an already-settled round, shown once, never dramatised into "you
were so close"). There are no loss-chasing prompts and no escalating bet
suggestions. The standalone build is free-play only and clearly labelled. Inside the
host, the host's own limits, age-gating and jurisdiction rules apply and are not
second-guessed by the game.

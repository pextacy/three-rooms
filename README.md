<!--
  GENERATED FILE — DO NOT EDIT.
  Written by `npm run gen:readme` from src/games/, src/shared/render/ and each
  game's own audio. Every number below is recomputed from the manifests by the
  same DPs that `npm run verify:rtp` and `npm run verify:survey` run, in exact
  BigInt rationals. Edit the source, re-run.
-->

# Games with a decision in them

Two provably-fair on-chain wagering games for **Chain Jam Vol. 1**, on one origin.
Each is a separate entry: its own page, its own `game.manifest.json`, its own
contract, its own declared RTP.

| | The decision primitive | Declared RTP | Max | Play |
|---|---|---|---|---|
| **CANDLE** | Discounted optimal stopping — Gilbert–Mosteller with a deterministic decay and a forced acceptance at the horizon | **96.9961%** | 25× | [https://candle-ashen-tau.vercel.app/candle/](https://candle-ashen-tau.vercel.app/candle/) |
| **THE SURVEY** | Sequential hypothesis testing — Wald's problem with a priced stopping rule | **97.4141%** | 20× | [https://candle-ashen-tau.vercel.app/survey/](https://candle-ashen-tau.vercel.app/survey/) |
| **THE BROKERS** | Search with recall — Pandora's Box, and Weitzman's index | **96.9637%** | 4.99× | [https://candle-ashen-tau.vercel.app/brokers/](https://candle-ashen-tau.vercel.app/brokers/) |

Free play in both. No wallet, no modal, no splash — the first round is already on
the table when the page loads. Reproduce either number in under a minute:

```sh
npm install
npm run verify:rtp       # CANDLE       7577820426157 / 7812500000000
npm run verify:survey    # THE SURVEY   60883787 / 62500000
npm run verify:brokers   # THE BROKERS  1551418623 / 1600000000
```

Essentially every "original" in the crypto-casino canon reduces to one of three
shapes: **pick a probability and get 1/p** (dice, limbo, roulette), **accumulate
and bank before a bust** (crash, mines, towers, hi-lo), or **match symbols**
(slots, wheels). None of these is any of them, and none is a reskin of another:
one is about **refusing offers under a decay**, one about **buying evidence until
it stops being worth what it costs**, and one about **buying options you can
always go back to**. Stop · learn · search.

All three are dressed from the same room — **Lloyd's Coffee House, London, 1728,
lit by a single candle** — and share one light model, one set of four inks, one
bridge and one chrome. The auction is at one table, the underwriting desk at the
next, and the brokers are on the floor between them.

---

# CANDLE

> **A lot is on the table. The candle is burning. Every inch you wait is worth less.**

Take the lot in front of you, or let the candle burn an inch and see the next one —
knowing the next one is worth less by construction.

**Declared RTP 96.9961%** under optimal play, exactly
`7577820426157 / 7812500000000`.

### Why this is not a clone of anything

CANDLE is none of the three shapes above. Its shape is *a sequence of i.i.d. offers,
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

### The rules, in two sentences

> Take the lot on the table, or let the candle burn an inch and see the next one.
> Each inch you burn, the prize is worth 15 points less — and when the candle
> gutters you must take whatever is in front of you.

---

### The paytable

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

### The wax ladder, and when to claim

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

### Return to player

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

#### The strategy band

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

### The light model is the product

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

# THE SURVEY

> **A ship lies in the roads. Every surveyor you send costs you. When have you seen enough?**

A voyage is offered at Lloyd's. She is either sound or rotten, four ships in
ten are sound, and these are dangerous waters. Send surveyors aboard if you like —
each one reports, each is right three times in five, and each takes a slice of the
premium. Then call it: **underwrite** her, or **decline**.

**Declared RTP 97.4141%** under optimal play, exactly
`60883787 / 62500000`.

### Why this is not a clone of anything either

Its shape is *a sequence of noisy, individually priced observations of a hidden
binary state, stopped at the player's discretion, followed by a decision whose
payoff depends on that state* — **Wald's sequential probability ratio test**, with
the sampling cost made an explicit price rather than an abstraction. It is one of
the foundational objects of statistical decision theory and it has never been
turned into a wager. You are not guessing a number, and you are not refusing
offers: **you are buying evidence, and the only question is when you have bought
enough.**

The dressing is real too. Lloyd's Coffee House was an insurance market before it
was an insurance company: underwriters sat at their own tables and wrote their
names under the terms of a voyage they were willing to carry. A ship lying in the
roads could be surveyed before you signed — and a surveyor in 1728 was a man with
a mallet, an hour of daylight and an opinion.

### The rules, in three sentences

> A voyage is on the book, and she is either sound or rotten.
> Send a surveyor and he tells you which — rightly 60% of the time, and
> wrongly the rest, for a point and a half of the premium.
> Then underwrite her and take what she carries if she comes home, or decline and
> walk away with 0.60×.

### The manifest

| Cargo | Pays | Weight / 10,000 | Probability | Called blind |
|---|---|---|---|---|
| Salt | **1.10×** | 3,000 | 30.00% | decline |
| Coal | **1.40×** | 2,500 | 25.00% | decline |
| Timber | **1.80×** | 2,000 | 20.00% | underwrite |
| Wine | **2.50×** | 1,500 | 15.00% | underwrite |
| Silk | **5.00×** | 800 | 8.00% | underwrite |
| Indigo | **20.00×** | 200 | 2.00% | underwrite |

The last column is what the DP does with **no evidence at all**: the cheap cargoes
are not worth taking at a 40% prior, the rich ones are. Every surveyor you
send is an attempt to move a cargo across that line — and on the ones already
clearly on one side of it, the evidence is not worth its price.

### What the reports add up to

The state of a survey is not the list of reports. It is their **margin**: how many
said SOUND minus how many said ROTTEN. Two reports that disagree cancel *exactly*,
because each carries the same weight of evidence — the odds multiply by
`3 / 2` for sound and divide by it for rot. That is not a simplification
for convenience; it falls out of Bayes, and it is why the contract stores five
bytes and why the UI can say "the surveys stand two to one for rot" and be telling
you the whole truth about your position.

| Margin | P(she is sound), exactly | as a percentage | Next report says SOUND |
|---|---|---|---|
| -5 | `64/793` | 8.07% | 41.61% |
| -4 | `32/275` | 11.64% | 42.33% |
| -3 | `16/97` | 16.49% | 43.30% |
| -2 | `8/35` | 22.86% | 44.57% |
| -1 | `4/13` | 30.77% | 46.15% |
| 0 | `2/5` | 40.00% | 48.00% |
| +1 | `1/2` | 50.00% | 50.00% |
| +2 | `3/5` | 60.00% | 52.00% |
| +3 | `9/13` | 69.23% | 53.85% |
| +4 | `27/35` | 77.14% | 55.43% |
| +5 | `81/97` | 83.51% | 56.70% |

### The premium ladder

| Surveyors | Premium | Declining pays | A 2.50× voyage pays |
|---|---|---|---|
| 0 | **100.0%** | 0.6000× | 2.5000× |
| 1 | **98.5%** | 0.5910× | 2.4625× |
| 2 | **97.0%** | 0.5820× | 2.4250× |
| 3 | **95.5%** | 0.5730× | 2.3875× |
| 4 | **94.0%** | 0.5640× | 2.3500× |
| 5 | **92.5%** | 0.5550× | 2.3125× |

### Return to player

| | |
|---|---|
| Declared RTP, optimal play | **97.4141%** |
| Exact | `60883787 / 62500000` |
| House edge | 2.5859% |
| Maximum payout | **20×** stake (no surveys, and she comes home) |
| Mean surveyors bought | 2.548 |
| Surveyors bought | 0: 10.0% · 1: 22.8% · 2: 17.8% · 3: 16.9% · 4: 16.8% · 5: 15.7% |

#### The strategy band

| How you play | Returns | |
|---|---|---|
| Optimal — *the declared RTP* | **97.414%** | ✅ in band |
| Send one surveyor, then call — *the printed rule* | **94.639%** | ✅ in band |
| Survey until the reports are 2 clear — *Wald's shape* | **94.572%** | ✅ in band |
| Send two, then call | **94.525%** | ✅ in band |
| Call it blind — send no one — *the impatient player* | **94.400%** | ✅ in band |
| Send all five, always — *the anxious player* | **93.295%** | ✅ in band |

**Every published policy is inside the window**, from sending nobody to sending
everybody — which is stricter than CANDLE manages, and it is the constraint the
manifest was tuned around rather than a happy accident. Sharper surveyors or a
steeper premium pay the careful player out of the top of the band and drop the
careless one below the bottom of it: the more decisive the evidence, the further
apart the two ends of the band are pulled. Weak, cheap evidence is what keeps a
game *about* information inside a 93–98% window at all.

The knife edge: the **Coal at two reports, margin +2**. Underwriting her and sending one more man are worth the same thing to four decimal places, and the room holds on that state for a full second because the numbers say it should.

### Why the truth cannot leak

Every hook on the contract is `view`, so the only state is `gameState` — which
the facet emits on every step and the player echoes back. Anything written there
is public, and so is every VRF word. **If the ship's condition were drawn at the
start, a player could simply read it.**

So the generative order is **reversed**. Reports are drawn from the *predictive*
distribution, which depends only on the margin so far and is therefore safe to
compute in the open; her condition is drawn at settlement from the *posterior*
given the final margin, out of a word that does not exist until the call is
already locked in. The joint distribution over (reports, truth) is identical — it
is the same probability model factored the other way — but nothing that decides
the voyage exists while the player can still act on it.

`DECLINE` settles immediately and needs no word at all: it pays the same whatever
she was, which is exactly why walking away can never leave a player waiting on
randomness that never arrives.

### Two claims you can measure

**The fog is the doubt.** The ink drawn over the ship is exactly
`1 − P(the better call is right)`, straight out of the belief table above. At the
prior she is 60% there because that is how sure you are; after three reports
for rot she is 83.5% there, because that is how sure you are then. And a pair
of reports that disagree puts the fog back to the digit — the game's one
mathematical claim, made visible.

**The light is the day.** A surveyor rows out, sounds her, and rows back; you do
not get five of those in an afternoon. Every surveyor costs an hour of daylight and
the room walks down the same ladder CANDLE's wax does, ending at exactly the
brightness the candle gutters at.

| Surveyors | Daylight | Flame | Tallow | Luminance | Of full | Brass on ink |
|---|---|---|---|---|---|---|
| 0 | 100% | 2000 K | `rgb(246 230 196)` | 0.8017 | **100.00%** | 10.24:1 |
| 1 | 88% | 1900 K | `rgb(239 219 131)` | 0.7065 | **88.13%** | 9.21:1 |
| 2 | 76% | 1800 K | `rgb(228 204 123)` | 0.6111 | **76.22%** | 8.14:1 |
| 3 | 64% | 1700 K | `rgb(214 187 115)` | 0.5107 | **63.71%** | 7.06:1 |
| 4 | 52% | 1600 K | `rgb(199 169 105)` | 0.4154 | **51.81%** | 5.96:1 |
| 5 | 40% | 1500 K | `rgb(181 149 93)` | 0.3211 | **40.05%** | 4.85:1 |

It is deliberately **not** the premium ladder, which falls only 1.5 points a head:
a 1.5% change in luminance is invisible to a player and inside the rounding error
of an 8-bit channel, and a claim a reviewer cannot measure is a claim we do not
make. The money cost is printed as a number instead, beside it, where a number
belongs.

### Playing it

Keyboard: `Space`/`Enter` underwrite · `S`/`↓` send a surveyor · `D` decline ·
`Enter` next voyage · `?` the whole model · `M` sound · `T` turbo · `L` the book.

The Ghost Report — what the *next* surveyor would have said — is drawn only once
the call is locked in, changes no payout, and is stated once and flatly. On a
voyage where every surveyor had already reported there is no ghost, because there
was nobody left to send.

---

# THE BROKERS

> **You hold a claim on a wreck. Every man who looks at it charges you. When have you shopped it enough?**

The house's own man values your claim for nothing, and he is not generous. Four
brokers will each name a price, and each charges a fee the moment you ask him,
whatever he ends up saying. **Every price you have been named stays on the
table.** Sell whenever you like, to whoever named the best one; what you are paid
is that price, less the fees you have run up.

**Declared RTP 96.9637%** under optimal play, exactly
`1551418623 / 1600000000`.

### Why this is not a clone of anything either

Its shape is *a set of alternatives with known distributions and known inspection
costs, opened one at a time in an order of your choosing, with free recall of
everything already opened* — **Pandora's Box**, Weitzman (1979). It is one of the
foundational results of search theory, it is solved by an index rule, and it has
never been turned into a wager.

It is not CANDLE, and **recall is the difference**: there a refused lot is gone
and the prize decays with time, so you hold out. Here nothing decays and nothing
is ever lost but the fee you chose to pay, so you stop the moment what you are
holding is good enough. Nor is it THE SURVEY: nothing is hidden on this floor.
You are not buying evidence about a state, you are buying **options**.

### The floor

| | Fee | What he names | Average | Index | Asked |
|---|---|---|---|---|---|
| **the house's man** | — | 0.85× *50%* · 1.02× *50%* | 0.9350× | — | first, free |
| **Stubbs** | 6.00% | 0.55× *60.00%* · 0.95× *27.00%* · 1.25× *13.00%* | 0.7490× | **0.8975×** | 4th |
| **Marchmont** | 4.50% | 0.35× *60.00%* · 0.90× *25.00%* · 1.25× *15.00%* | 0.6225× | **0.9500×** | 3rd |
| **Delane** | 3.25% | 0.40× *80.00%* · 0.60× *16.50%* · 2.30× *3.50%* | 0.4995× | **1.3714×** | 1st |
| **Vanderdek** | 0.95% | 0.35× *90.00%* · 0.50× *9.75%* · 5.00× *0.25%* | 0.3763× | **1.2000×** | 2nd |

**Stubbs has the best average price on the floor and is the last man worth
asking. Vanderdek has the worst average of the four and is asked second.** That is
not a trick of the table: it is what the index says, and the index is right.

### Weitzman's index, and the rule it gives you

A broker's **index** `z` is the price at which his fee would exactly pay for
itself:

```
E[(X − z)⁺] = c
```

— the expected amount by which his price would beat `z`, set equal to what he
charges. Above `z` he cannot pay for himself; below it he can. The index counts
**how far above you he might reach**, not how he does on an ordinary day, which
is exactly why it is not the average.

> **Pandora's rule.** Ask the unasked man with the highest index. Stop the moment
> the price you are holding is at least the highest index left.

That is provably optimal — and it is checked rather than cited: `verify:brokers`
compares it against the dynamic program at every one of the reachable states, and
`test/brokers-rtp.spec.ts` does it again in CI.

### Return to player

| | |
|---|---|
| Declared RTP, optimal play | **96.9637%** |
| Exact | `1551418623 / 1600000000` |
| House edge | 3.0363% |
| Maximum payout | **4.9905×** — the best price on the floor, less the one fee that buys it |
| **Minimum payout** | **0.7030×** — there is no losing state in this game |
| P(payout ≥ 1×) | 14.71% |
| P(payout ≥ 2×) | 3.741% |
| P(payout ≥ 4×) | 0.2413% |
| Mean men asked | 2.735 of 4 |
| Kept the house's own price | 65.5% |

The maximum is **not** the best price on the floor. Only one man ever names
5.00×, so his fee is unavoidable, and `quoteCaps` reserves
4.9905× rather than the corner that
cannot be reached.

#### The strategy band

| How you play | Returns | |
|---|---|---|
| Optimal — *the declared RTP* | **96.964%** | ✅ in band |
| Pandora's rule — the index, no DP — *provably the same thing* | **96.964%** | ✅ in band |
| Ask the three best by index | **95.732%** | ✅ in band |
| Ask the two best by index | **95.082%** | ✅ in band |
| Ask one, by index — *the printed rule* | **95.028%** | ✅ in band |
| Ask everybody, then take the best — *the restless player* | **93.946%** | ✅ in band |
| Ask the best average, while it beats what you hold — *the natural mistake* | **93.500%** | ✅ in band |
| Take what the house names — *the impatient player* | **93.500%** | ✅ in band |

Every published policy is inside the window, and the decision is worth three
points against the autopilot of asking everybody. The fees are what hold both
ends: all four of them together are 14.70% of the stake.

### There is no losing state

`TAKE` is legal at every point of the round, and it always pays what is in hand
less what has been spent. The worst the game can do to you is the house's lowest
price with every fee paid — **0.7030×**. There is no bust, no forced
move, nothing that accumulates, and no way to be left holding nothing.

### Playing it

Keyboard: `1`…`4` ask that man · `Space`/`Enter` sell the claim ·
`Enter` next claim · `?` the whole market and the index · `M` sound · `T` turbo ·
`L` the book.

The board draws every price on one **logarithmic** scale, so equal distances are
equal multiples: a slip a thumb's width above the brass line beats it by the same
factor wherever the two of them sit. The Ghost Price — what the next man you did
not ask would have said — is drawn only once the claim is sold, changes no
payout, and is stated once and flatly.

---

## Verify everything

| Command | What it proves |
|---|---|
| `npm run verify:rtp` | CANDLE's declared RTP, recomputed across all 30 reachable `(inch, lot)` states in exact rationals. Nothing read from a constant. |
| `npm run verify:survey` | THE SURVEY's, across all 126 reachable `(cargo, surveys, margin)` states — including the belief table the contract mirrors as fractions, never as rounded probabilities. |
| `npm test` | ~300 tests: both DPs, both parities, the strategy bands, the RNG, the light model, both scenes, the pacing, both ghosts, and both UIs driven through a whole round. |
| `npm run bench` | 10⁷ draws and 10⁷ rounds for CANDLE; 10⁶ voyages for THE SURVEY, with every report checked against the predictive distribution at the margin it was drawn at. |
| `npm run verify:light` | Luminance is exactly each game's own ladder; the blackbody walk; WCAG contrast at every rung; and the fog table, where the ship is drawn at exactly the confidence. |
| `npm run frame-budget` | p95 frame time for both scenes, against a 12 ms budget. |
| `npm run cold-open` | Critical path and time to first playable frame, for both pages — and how much of it the second page already has in cache. |
| `npm run gates` | Bundle size, one widget tag per entry, `frame-ancestors *`, no `X-Frame-Options`, a manifest beside each page, no browser storage. |
| `npm run round-trip` · `round-trip:survey` | A real round and a real voyage settled by the real facet against a local chain and a real VRF node — including, for THE SURVEY, that the word deciding the ship arrives only after the call. |
| `npm run play` · `play:survey` | Either loop played in a terminal, worded exactly as its UI words it. |
| `npm run spike` | Every SDK symbol used, exercised end to end. |

See [DEMO.md](./DEMO.md) for a one-minute reviewer runbook with the expected output
inline.

---

## The contracts

```sh
npm run contracts:build                                   # forge, solc 0.8.30, viaIR
RPC_URL=https://…  DEPLOYER_KEY=0x…  npm run deploy:contract -- candle
RPC_URL=https://…  DEPLOYER_KEY=0x…  npm run deploy:contract -- survey
```

Two contracts, one interface, the same discipline: no constructor arguments, no
storage, every hook `view`, no unbounded loops. Session state travels in four
bytes of `gameState` for CANDLE and five for THE SURVEY, which the facet emits
and takes back. The deployed bytecode is **2,614 bytes** for CANDLE, **3,808 bytes** for THE SURVEY and **3,235 bytes** for THE BROKERS — between a tenth and a sixth of the EIP-170 limit.

`deploy:contract` has no default chain on purpose, and reads each contract back
after deploying — against that game's own generated constants, so a retuned
manifest cannot leave a stale assertion behind. A contract that deployed but
answers differently is worse than one that failed, because nothing tells you.

**THE SURVEY's contract is the one to read.** It is where the reversed generative
order lives, and the comment at the top says why a `view`-only game that emits
its whole state can still hide whether a ship is sound.

## How it is built

```
contracts/Candle.sol         ICasinoGameV2. Five hooks, one _payout(), one word per inch.
contracts/Survey.sol         The same, and the reversed generative order.
contracts/ICasinoGameV2.sol  Vendored from the SDK, so a standard toolchain can build it.
contracts/generated/         Mirrored from each game's core. Never hand-edited.

src/shared/                  What both games use, and nothing that knows which is calling.
  bridge/host.ts             GameHost<S, A> — generic over whatever a session holds.
  bridge/chain.ts            The whole penpal path. Two game-shaped holes: encode an
                             action byte, read your own session out of a row.
  render/light.ts            The measurable light model. Takes a level in basis points.
  audio/engine.ts            Context, master gain, beds, Poisson grains. No files.
  audio/pacing.ts            One pacing rule, two games.
  math/rational.ts           Exact BigInt rationals. No float touches a declared number.
  ui/                        tokens.css + table.css: the room and the furniture.

src/games/<slug>/core/       PURE: that game's own maths. No React, no DOM, no clock.
src/games/<slug>/app/        Its bridge adapter, its canvas, its voice, its React layer.
```

**One VRF word per step, and the step is always an on-chain action.** `LET IT
BURN` requests the next lot; `SEND A SURVEYOR` requests the next report;
`UNDERWRITE` requests the word that decides the ship. In every case the word is
causally after the action that asked for it and cannot be read, predicted or
front-run. Randomness is mapped by **rejection sampling** over 16-bit windows —
`word % n` is biased and is not used anywhere, in either language.

Neither contract holds storage: every hook is `view`, and session state travels
in the `gameState` bytes the facet emits and takes back.

---

### Playing it

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

The mechanics were chosen partly because they behave well. Neither game **can
lose more than the stake**, neither has a bust state, an accumulating sunk-cost
ladder, autoplay, or near-miss theatre. In THE SURVEY the worst case is not even
a total loss on most rounds: declining is always there, and it always pays.

Each game shows a ghost — the lot that would have come next, the report the
surveyor nobody sent would have made. Both are drawn only once the call is locked
in, both change no payout, and both are stated once and flatly. There is a test
per game that walks **every string in the UI** and fails on an exclamation mark,
a "you were so close", or a "try again". No loss-chasing prompts, no escalating
bet suggestions, no timers. The logs report your realised return against the
declared RTP and say plainly that a short session proves nothing. The standalone
builds are free play and say so on every screen.

---

*A lot is on the table. The candle is burning. Take it, or let an inch burn and see the next one — knowing the next one is worth less.*

*A ship lies in the roads. Send surveyors aboard — each one reports, each one costs you a slice of the premium — then underwrite her or decline. When have you seen enough?*

# LATER

Good ideas that are **not** v1. Written down so they stop competing for attention
(`plan.md` R7). The catalogue integration is a lifetime revenue share — there is
time after 09-20.

## From phase 0

- **Taper the reserve as the wax burns.** `onSessionStart` reserves `24 × wager`
  for the whole session, but the reachable maximum falls with the wax: at inch 2 it
  is `25 × 0.85 = 21.25×`, at inch 5 only `10×`. Releasing the difference on each
  `BURN` would free vault liquidity and let the platform accept larger stakes under
  `maxBetRiskBps`. Deliberately **not** done in v1: `reservedProfitDelta` is applied
  *before* the payout is checked, so any step that both releases reserve and settles
  is checked against the lowered cap — a subtle way to revert exactly the wins that
  matter most. One reserve, taken once, released never (`docs.md` §7.3.3).

- **Verify the VRF proof in the client.** `HostApiV1.getRandomnessVerification` is
  optional and feature-detectable; the simulator ships a full
  `randomness-verification` panel. Showing "this word was provably fair, here is the
  ECVRF proof" next to the Ghost Lot would make the honesty claim tangible rather
  than asserted.

- **Read `raw.randomnessRequests` for a session replay.** The host hands the guest
  every word of a multi-step session. That is the whole Ledger (stretch item) for
  free, and it survives a page reload — which also answers the SDK's "refresh
  mid-round" unhappy-path test.

## From phase 3

- **Alias `preact/compat` for React.** React and ReactDOM are ~45 KB gzipped of an
  85 KB bundle, for a UI that is two buttons, a stake field and a canvas. A vite
  alias would cut the bundle to roughly 40 KB and take ~200 ms off the slow-4G cold
  open. Not done in v1 because it is a dependency decision (`docs.md` §8) rather
  than a rendering one, and `npm run cold-open` shows the 400 ms budget is already
  met on broadband. Worth doing before the jam gallery, where every entry is an
  iframe preview loading at once.

- **Taper the flare.** The wick flares at the fifth inch and holds. A real wick
  flares and *then* dies, so the flare should decay into the gutter rather than
  sitting at full brightness until the round settles. Cheap; it just needs the
  settle event to drive it, which is phase 4's pacing work anyway.


## From phase 7 (THE SURVEY)

- **A third light claim: the sea state.** The roads are calm whatever the belief
  is. Running the swell harder as the posterior turns against her would be a
  third measurable mapping, and it is the one a player would feel before they
  read anything. Not done because `prefers-reduced-motion` would have to turn it
  off, and a claim that is only true for some players is not one we want to
  publish.

- **Share the two demo hosts' pacing loop.** `demoHost.ts` and
  `survey/app/bridge/demoHost.ts` both hold the same "draw the word now, reveal
  it after a derived dwell" machinery around different state machines. It is
  about thirty lines each and they are not quite the same shape — CANDLE reveals
  one lot per step, THE SURVEY has three different kinds of step — so pulling it
  up would need a third abstraction to earn its place.

- **Let a player see the three games' bands side by side.** Every `?` panel
  publishes its own; nothing publishes the comparison, and the comparison is the
  interesting part — CANDLE's careless end is at 93.577% because the decision is
  about patience, THE SURVEY's at 93.295% because it is about information, THE
  BROKERS' at 93.500% because it is about cost. A lobby page could show all
  three.

## From phase 8 (THE BROKERS)

- **Let the player set the fees.** The index is a closed-form function of the
  fee, so a slider over `c` would move the asking order **live** and show the
  theorem working: raise Vanderdek's fee far enough and he stops being worth
  asking second. It is the clearest possible demonstration that the order is not
  the average order. Not in v1 because the fee is a contract constant and a
  player-chosen one is a different bet shape, with a different declared RTP per
  setting — which the jam's single-number submission has no room for.

- **The Ghost Price could name more than one man.** It draws a price for the
  broker the rule would have asked next. Drawing for *everyone* unasked would
  show the whole counterfactual floor — and it is exactly the kind of thing that
  turns into "you were one man away", which §7 of `claude.md` forbids. Written
  down so it stays refused for a reason rather than by omission.

- **A fourth primitive: the secretary problem proper.** Stop, learn, search —
  the obvious fourth is search **without** recall, where an offer refused is
  gone. It shares almost all of THE BROKERS' machinery and inverts its single
  most important property, which would make a good pair. It needs its own entry,
  its own contract and its own band, so it needs its own jam.

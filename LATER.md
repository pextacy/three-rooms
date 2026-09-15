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

- **Let a player see the two games' bands side by side.** Both `?` panels publish
  their own; nothing publishes the comparison, and the comparison is the
  interesting part — one game's careless end is at 93.577% because the decision
  is about patience, the other's is at 93.295% because the decision is about
  information. A lobby page could show both.

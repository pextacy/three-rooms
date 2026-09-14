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

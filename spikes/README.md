# spikes/ — the phase-0 record

Throwaway code, kept because `docs.md` §7.3 cites it as the evidence that
answered the day-0 question: **can one `ICasinoGameV2` session consume more than
one VRF word?** It can.

Nothing here is part of the game. The contracts are not deployed by
`npm run sync:simulator`, and the drivers will not run until they are:

```sh
cp spikes/CandleSpike.sol spikes/CandleSpikeMax.sol sdk/casino-sdk/simulator/contracts/
node spikes/spike-multidraw.mjs      # spike A + B, the caps  -> 22/22
node spikes/spike-maxpayout.mjs      # a real 25x settlement  ->  5/5
node spikes/spike-coinflip.mjs       # the reference game     ->  3/3
```

Everything they proved is now covered against the **real** contract by
`test/parity.spec.ts`, `test/caps.spec.ts` and `test/adversarial.spec.ts`, which
run in CI. `npm run spike` exercises the SDK surface the game actually uses.

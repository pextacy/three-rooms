/**
 * CANDLE inside the chain.wtf host (docs.md §4.1).
 *
 * The bridge itself — penpal, the session feed, the stake ceiling, the reveal
 * handshake — is `chain.ts` and is shared with THE SURVEY. What is left here is
 * the only part that is CANDLE's: how a session row reads as an inch and a lot,
 * and where the Ghost Lot comes from.
 *
 * The contract is the only authority on outcomes. The inch and the lot are
 * DECODED from `raw.gameState`, which the facet emitted; the payout is read from
 * the session row. Nothing in this file recomputes a result.
 */
import { MAX_FACE_BP, FACE_DENOM, LOTS, lotForDraw, type LotId, drawLot } from '../../games/candle/core/paytable';
import { INCHES } from '../../games/candle/core/wax';
import { createPrng, seedFromCrypto } from './prng';
import { createChainHost } from './chain';
import { decodeGameState, encodeAction, type CandleHost, type SessionView } from './types';

export { isEmbedded } from './chain';

const MAX_MULTIPLIER_X = MAX_FACE_BP / FACE_DENOM; // 25

function lotIdForFaceBp(faceBp: number): LotId | null {
  const lot = LOTS.find(l => l.faceBp === faceBp);
  return lot ? lot.id : null;
}

export type CasinoHostOptions = {
  /** Stake the control opens on, in whole tokens. */
  readonly defaultStakeWhole?: number;
  readonly minStakeWhole?: number;
};

export function createCasinoHost(options: CasinoHostOptions = {}): CandleHost {
  /**
   * The Ghost Lot is drawn HERE, in the client, once a round has already settled.
   * It is not on chain and the UI says so: putting it on chain would mean one
   * more VRF word between the claim and the payout, and `cancelStuckRandomness`
   * refunds only the escrowed stake — a stuck word after a 25x claim would wipe
   * the win out. Same paytable, same rejection sampler, so the distribution is
   * the real one; it just settles nothing (docs.md §6.4).
   */
  const ghostPrng = createPrng(seedFromCrypto());
  const ghosts = new Map<string, LotId | null>();

  const ghostFor = (key: string, settledInch: number): LotId | null => {
    if (settledInch >= INCHES) return null; // the candle was out; there was no next lot
    const existing = ghosts.get(key);
    if (existing !== undefined) return existing;
    const lot = lotForDraw(drawLot(ghostPrng.nextWord(), 0, () => ghostPrng.nextWord()).value).id;
    ghosts.set(key, lot);
    return lot;
  };

  return createChainHost<SessionView, 'CLAIM' | 'BURN'>({
    maxMultiplierX: MAX_MULTIPLIER_X,
    ...options.defaultStakeWhole !== undefined ? { defaultStakeWhole: options.defaultStakeWhole } : {},
    ...options.minStakeWhole !== undefined ? { minStakeWhole: options.minStakeWhole } : {},
    encodeAction,

    mapSession({ sessionKey, row, phase, stakeBase, isSettled, error }) {
      if (!row) {
        // openSession has returned but the row has not reached the feed yet.
        return {
          sessionKey,
          sessionId: null,
          phase,
          inch: 1,
          lotId: null,
          stakeBase,
          payoutBase: 0n,
          isSettled: false,
          ghostLotId: null,
          error,
        };
      }

      // The contract wrote this. We decode, we never recompute.
      const state = decodeGameState(row.raw.gameState);
      let payoutBase = 0n;
      try {
        payoutBase = BigInt(row.payout ?? '0');
      } catch {
        payoutBase = 0n;
      }

      return {
        sessionKey,
        sessionId: row.sessionId,
        phase,
        inch: state?.inch ?? 1,
        lotId: state?.hasLot ? lotIdForFaceBp(state.faceBp) : null,
        stakeBase,
        payoutBase,
        isSettled,
        // Only once the round is over, so it cannot have leaked into the decision.
        ghostLotId: isSettled && phase === 'settled' ? ghostFor(sessionKey, state?.inch ?? 1) : null,
        error,
      };
    },
  });
}

/**
 * THE BROKERS inside the chain.wtf host (docs.md §4.1).
 *
 * The bridge itself — penpal, the session feed, the stake ceiling, the reveal
 * handshake — is `shared/bridge/chain.ts` and is the same code the other two
 * games run. What is left here is the only part that is this game's: how a
 * session row reads as a floor of named prices, and where the Ghost Price comes
 * from.
 *
 * The contract is the only authority. Everything shown is DECODED from the five
 * bytes of `raw.gameState` the facet emitted and from the payout on the row.
 *
 * One thing the chain path cannot recover and does not pretend to: the LIST of
 * prices named earlier in the round. The contract keeps only the best, because
 * only the best can ever be taken — so after a reload the floor shows what is in
 * hand and who has been asked, which is the whole of the position, and not a
 * history it would have to invent.
 */
import { MAX_PAYOUT_BP, PRICE_DENOM } from '../../core/market';
import { askingOrder } from '../../core/weitzman';
import { drawQuote } from '../../core/draw';
import { createPrng, seedFromCrypto } from '../../../../shared/bridge/prng';
import { createChainHost } from '../../../../shared/bridge/chain';
import {
  decodeBrokersState,
  encodeBrokersAction,
  PHASE_SHOPPING,
  type BrokersAction,
  type BrokersHost,
  type BrokersSessionView,
  type NamedPrice,
} from './types';

const MAX_MULTIPLIER_X = MAX_PAYOUT_BP / PRICE_DENOM; // 4.9905

export type BrokersChainOptions = {
  readonly defaultStakeWhole?: number;
  readonly minStakeWhole?: number;
};

export function createBrokersChainHost(options: BrokersChainOptions = {}): BrokersHost {
  /**
   * The Ghost Price is drawn HERE, in the client, once the claim is already
   * sold. It is not on chain and the UI says so: putting it there would mean one
   * more VRF word between the sale and the payout, and `cancelStuckRandomness`
   * refunds only the escrowed stake — a stuck word after a 5x claim would wipe
   * it out. Same tables, same rejection sampler, so the draw is the real one; it
   * just settles nothing (docs.md §6.4).
   */
  const ghostPrng = createPrng(seedFromCrypto());
  const ghosts = new Map<string, NamedPrice | null>();

  const ghostFor = (key: string, askedMask: number): NamedPrice | null => {
    const existing = ghosts.get(key);
    if (existing !== undefined) return existing;

    const left = askingOrder().filter(broker => (askedMask & (1 << broker.id)) === 0);
    const next = left[0];
    const ghost: NamedPrice | null = next
      ? { brokerId: next.id, priceBp: drawQuote(next.id, ghostPrng.nextWord(), 0, () => ghostPrng.nextWord()).priceBp }
      : null;
    ghosts.set(key, ghost);
    return ghost;
  };

  return createChainHost<BrokersSessionView, BrokersAction>({
    maxMultiplierX: MAX_MULTIPLIER_X,
    ...(options.defaultStakeWhole !== undefined ? { defaultStakeWhole: options.defaultStakeWhole } : {}),
    ...(options.minStakeWhole !== undefined ? { minStakeWhole: options.minStakeWhole } : {}),
    encodeAction: encodeBrokersAction,

    mapSession({ sessionKey, row, phase, stakeBase, isSettled, error }) {
      const blank: BrokersSessionView = {
        sessionKey,
        sessionId: row?.sessionId ?? null,
        phase,
        named: [],
        bestBp: 0,
        askedMask: 0,
        waitingOn: null,
        ghost: null,
        stakeBase,
        payoutBase: 0n,
        isSettled: false,
        error,
      };
      if (!row) return blank;

      const state = decodeBrokersState(row.raw.gameState);
      if (!state) return { ...blank, isSettled, error };

      let payoutBase = 0n;
      try {
        payoutBase = BigInt(row.payout ?? '0');
      } catch {
        payoutBase = 0n;
      }

      /**
       * The floor, as the contract can describe it: the best price in hand, and
       * who has been asked. Which man named the best price is not in the state —
       * only the number is — so it is attributed to nobody rather than guessed.
       */
      const named: NamedPrice[] =
        state.phase === PHASE_SHOPPING && state.bestBp > 0 ? [{ brokerId: null, priceBp: state.bestBp }] : [];

      return {
        sessionKey,
        sessionId: row.sessionId,
        phase,
        named,
        bestBp: state.bestBp,
        askedMask: state.askedMask,
        waitingOn: state.pending,
        ghost: isSettled ? ghostFor(sessionKey, state.askedMask) : null,
        stakeBase,
        payoutBase,
        isSettled,
        error,
      };
    },
  });
}

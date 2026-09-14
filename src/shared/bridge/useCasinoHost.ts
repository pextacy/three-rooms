/**
 * The chain.wtf host bridge (docs.md §4.1).
 *
 * Wraps the SDK's own `connectGameToHost` — we do not reimplement the bridge —
 * and maps `HostSnapshotV1` onto the single `CandleHost` shape the UI knows.
 *
 * Two rules this file exists to enforce:
 *
 *  - **The contract is the only authority on outcomes.** Nothing here recomputes
 *    a result. The inch and the lot are DECODED from `raw.gameState`, which the
 *    facet emitted; the payout is read from the session row. The client animates
 *    what it is told.
 *  - **The host owns the balance.** `purseBase` stays null so the game never
 *    draws a second one, and `revealOutcome` is called once the animation lands
 *    so the host's own display cannot spoil the result before it.
 */
import { connectGameToHost, computeMaxWager } from '@chain/casino-sdk/guest';
import type { HostApiV1, HostSnapshotV1, GuestBridgeConnection } from '@chain/casino-sdk/guest';
import {MAX_FACE_BP, FACE_DENOM, LOTS, lotForDraw, type LotId, drawLot} from '../../games/candle/core/paytable';
import { INCHES } from '../../games/candle/core/wax';
import { createPrng, seedFromCrypto } from './prng';
import { decodeGameState, encodeAction, type CandleHost, type HostView, type PlayerAction, type SessionPhase, type SessionView } from './types';

const MAX_MULTIPLIER_X = MAX_FACE_BP / FACE_DENOM; // 25

/** The facet's phase names, as the host reports them on a session row. */
const PHASE_BY_NAME: Record<string, SessionPhase> = {
  WAITING_RANDOMNESS: 'waiting-randomness',
  WAITING_PLAYER_ACTION: 'waiting-player',
  SETTLED: 'settled',
  FORFEITED: 'forfeited',
  CANCELLED: 'cancelled',
};

/** Numeric fallback, for hosts that send `phase` but not `phaseName`. */
const PHASE_BY_INDEX: readonly SessionPhase[] = [
  'opening',
  'waiting-randomness',
  'waiting-player',
  'settled',
  'forfeited',
  'cancelled',
];

function lotIdForFaceBp(faceBp: number): LotId | null {
  const lot = LOTS.find(l => l.faceBp === faceBp);
  return lot ? lot.id : null;
}

function toBigInt(value: string | undefined, fallback = 0n): bigint {
  if (value === undefined) return fallback;
  try {
    return BigInt(value);
  } catch {
    return fallback;
  }
}

export type CasinoHostOptions = {
  /** Stake the control opens on, in whole tokens. */
  readonly defaultStakeWhole?: number;
  readonly minStakeWhole?: number;
};

export function createCasinoHost(options: CasinoHostOptions = {}): CandleHost {
  const listeners = new Set<(view: HostView) => void>();

  let connection: GuestBridgeConnection | null = null;
  let hostApi: HostApiV1 | null = null;
  let snapshot: HostSnapshotV1 | null = null;
  let destroyed = false;
  let fatal: string | null = null;

  /** The row we opened, matched by the key `openSession` handed back. */
  let sessionKey: string | null = null;
  let localError: string | null = null;
  /** Rounds the player has dismissed, so `dealAgain` can clear the board. */
  let dismissedKey: string | null = null;
  /** Session ids we have already told the host to unhide. */
  const revealed = new Set<string>();

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

  const decimals = () => snapshot?.token.decimals ?? 18;
  const one = () => 10n ** BigInt(decimals());

  const currentRow = () => {
    if (!sessionKey || !snapshot) return null;
    return snapshot.sessions.items.find(item => item.sessionKey === sessionKey) ?? null;
  };

  const toSession = (): SessionView | null => {
    if (!sessionKey || sessionKey === dismissedKey) return null;
    const row = currentRow();
    const stakeBase = toBigInt(row?.stake ?? row?.wager);

    if (!row) {
      // openSession has returned but the row has not reached the feed yet.
      return {
        sessionKey,
        sessionId: null,
        phase: 'opening',
        inch: 1,
        lotId: null,
        stakeBase,
        payoutBase: 0n,
        isSettled: false,
        ghostLotId: null,
        error: localError,
      };
    }

    const phase =
      (row.phaseName ? PHASE_BY_NAME[row.phaseName] : undefined) ??
      PHASE_BY_INDEX[row.phase ?? 0] ??
      'opening';

    // The contract wrote this. We decode, we never recompute.
    const state = decodeGameState(row.raw.gameState);
    const lotId = state?.hasLot ? lotIdForFaceBp(state.faceBp) : null;

    const isSettled = row.isSettled || phase === 'settled' || phase === 'forfeited' || phase === 'cancelled';

    return {
      sessionKey,
      sessionId: row.sessionId,
      phase,
      inch: state?.inch ?? 1,
      lotId,
      stakeBase,
      payoutBase: toBigInt(row.payout),
      isSettled,
      // Only once the round is over, so it cannot have leaked into the decision.
      ghostLotId: isSettled && phase === 'settled' ? ghostFor(sessionKey, state?.inch ?? 1) : null,
      error: localError,
    };
  };

  /** Cached so `snapshot()` is reference-stable for `useSyncExternalStore`. */
  let cached: HostView | null = null;

  const build = (): HostView => {
    const minStakeBase = BigInt(options.minStakeWhole ?? 1) * one();
    const maxWager = computeMaxWager(snapshot, { maxMultiplierX: MAX_MULTIPLIER_X });

    return {
      kind: 'chain',
      connected: hostApi !== null || snapshot !== null,
      canBet: !destroyed && !fatal && snapshot?.wallet.status === 'ready',
      walletStatus: snapshot?.wallet.status ?? 'disconnected',
      tokenSymbol: snapshot?.token.symbol ?? '',
      tokenDecimals: decimals(),
      // The HOST owns and draws the balance. We do not render a second one.
      purseBase: null,
      minStakeBase,
      maxStakeBase: maxWager ?? null,
      defaultStakeBase: BigInt(options.defaultStakeWhole ?? 10) * one(),
      theme: snapshot?.ui.theme ?? 'dark',
      session: toSession(),
      fatal,
    };
  };

  const view = (): HostView => (cached ??= build());

  const emit = () => {
    cached = null;
    const next = view();
    for (const listener of listeners) listener(next);
  };

  // -- connect --------------------------------------------------------------
  connection = connectGameToHost({
    async setState(next) {
      snapshot = next;
      emit();
    },
  });

  void connection.promise
    .then(api => {
      hostApi = api;
      emit();
    })
    .catch((error: unknown) => {
      fatal = error instanceof Error ? error.message : 'could not reach the host';
      emit();
    });

  const requireApi = (): HostApiV1 => {
    if (!hostApi) throw new Error('the host bridge is not connected yet');
    return hostApi;
  };

  return {
    kind: 'chain',

    /** Registers only; React forbids a store firing during subscription. */
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    snapshot: view,

    async openSession(stakeBase) {
      const api = requireApi();
      localError = null;
      try {
        const result = await api.openSession({ wager: stakeBase.toString(), gameData: '0x' });
        sessionKey = result.sessionKey;
        dismissedKey = null;
      } catch (error: unknown) {
        localError = error instanceof Error ? error.message : 'the bet was rejected';
        sessionKey = null;
      }
      emit();
    },

    async submitAction(action: PlayerAction) {
      const api = requireApi();
      const row = currentRow();
      if (!row?.sessionId) throw new Error('no open session to act on');
      localError = null;
      try {
        await api.submitAction({ sessionId: row.sessionId, actionData: encodeAction(action) });
      } catch (error: unknown) {
        localError = error instanceof Error ? error.message : 'the action was rejected';
      }
      emit();
    },

    async revealOutcome() {
      const row = currentRow();
      if (!hostApi || !row?.sessionId || revealed.has(row.sessionId)) return;
      revealed.add(row.sessionId);
      // Until this lands the host hides the payout from its balance displays,
      // so the top bar cannot spoil the result before the animation does.
      try {
        await hostApi.revealOutcome({ sessionId: row.sessionId });
      } catch {
        // The host may have navigated away; a missed unhide is not fatal.
      }
    },

    dealAgain() {
      const session = toSession();
      if (session?.isSettled) {
        dismissedKey = session.sessionKey;
        emit();
      }
    },

    destroy() {
      destroyed = true;
      listeners.clear();
      connection?.destroy();
      connection = null;
      hostApi = null;
    },
  };
}

/** True when the page is inside an iframe, i.e. a host may be present. */
export function isEmbedded(): boolean {
  try {
    return window.top !== window.self;
  } catch {
    return true; // cross-origin parent — definitely embedded
  }
}

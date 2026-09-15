/**
 * The chain.wtf host bridge (docs.md §4.1) — the part that is the same for
 * every game.
 *
 * It wraps the SDK's own `connectGameToHost` (we do not reimplement the bridge),
 * tracks the session row the host opened for us, and maps `HostSnapshotV1` onto
 * the game-agnostic half of `HostViewOf`. The game supplies exactly two things:
 * how to encode its action byte, and how to read its own session out of a row.
 *
 * Two rules this file exists to enforce, for both games at once:
 *
 *  - **The contract is the only authority on outcomes.** Nothing here recomputes
 *    a result. A game's `mapSession` is handed the row the facet wrote — it
 *    decodes `raw.gameState` and reads the payout; it never re-draws anything.
 *  - **The host owns the balance.** `purseBase` stays null so the game never
 *    draws a second one, and `revealOutcome` is called once the animation lands
 *    so the host's own display cannot spoil the result before it.
 */
import { connectGameToHost, computeMaxWager } from '@chain/casino-sdk/guest';
import type { HostApiV1, HostSnapshotV1, GuestBridgeConnection } from '@chain/casino-sdk/guest';
import {
  createViewStore,
  type BaseSessionView,
  type GameHost,
  type HostViewOf,
  type SessionPhase,
} from './host';

/** One row of the host's session feed. */
export type SessionRow = HostSnapshotV1['sessions']['items'][number];

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

/** How a row's phase reads, whichever of the two fields the host filled in. */
export function phaseOf(row: SessionRow | null): SessionPhase {
  if (!row) return 'opening';
  return (row.phaseName ? PHASE_BY_NAME[row.phaseName] : undefined) ?? PHASE_BY_INDEX[row.phase ?? 0] ?? 'opening';
}

/** A row counts as over on any terminal phase, not only a clean settle. */
export function isSettledRow(row: SessionRow | null): boolean {
  if (!row) return false;
  const phase = phaseOf(row);
  return row.isSettled || phase === 'settled' || phase === 'forfeited' || phase === 'cancelled';
}

export type ChainHostOptions<S extends BaseSessionView, A> = {
  /** The most this game can pay, as a multiple of the wager. Clamps the stake. */
  readonly maxMultiplierX: number;
  /** Stake the control opens on, in whole tokens. */
  readonly defaultStakeWhole?: number;
  readonly minStakeWhole?: number;
  /** The one action byte the contract reads. */
  readonly encodeAction: (action: A) => `0x${string}`;
  /**
   * The game's own view of its session.
   *
   * Called with the row the host published — `null` while `openSession` has
   * returned but the row has not reached the feed yet — and must DECODE rather
   * than recompute. It is the only game-specific line in the chain path.
   */
  readonly mapSession: (args: {
    readonly sessionKey: string;
    readonly row: SessionRow | null;
    readonly phase: SessionPhase;
    readonly stakeBase: bigint;
    readonly isSettled: boolean;
    readonly error: string | null;
  }) => S;
};

export function createChainHost<S extends BaseSessionView, A>(options: ChainHostOptions<S, A>): GameHost<S, A> {
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

  const decimals = () => snapshot?.token.decimals ?? 18;
  const one = () => 10n ** BigInt(decimals());

  const currentRow = (): SessionRow | null => {
    if (!sessionKey || !snapshot) return null;
    return snapshot.sessions.items.find(item => item.sessionKey === sessionKey) ?? null;
  };

  const toSession = (): S | null => {
    if (!sessionKey || sessionKey === dismissedKey) return null;
    const row = currentRow();
    const raw = row?.stake ?? row?.wager;
    let stakeBase = 0n;
    if (raw !== undefined) {
      try {
        stakeBase = BigInt(raw);
      } catch {
        stakeBase = 0n;
      }
    }
    return options.mapSession({
      sessionKey,
      row,
      phase: phaseOf(row),
      stakeBase,
      isSettled: isSettledRow(row),
      error: localError,
    });
  };

  const store = createViewStore<HostViewOf<S>>(() => ({
    kind: 'chain',
    connected: hostApi !== null || snapshot !== null,
    canBet: !destroyed && !fatal && snapshot?.wallet.status === 'ready',
    walletStatus: snapshot?.wallet.status ?? 'disconnected',
    tokenSymbol: snapshot?.token.symbol ?? '',
    tokenDecimals: decimals(),
    // The HOST owns and draws the balance. We do not render a second one.
    purseBase: null,
    minStakeBase: BigInt(options.minStakeWhole ?? 1) * one(),
    maxStakeBase: computeMaxWager(snapshot, { maxMultiplierX: options.maxMultiplierX }) ?? null,
    defaultStakeBase: BigInt(options.defaultStakeWhole ?? 10) * one(),
    theme: snapshot?.ui.theme ?? 'dark',
    session: toSession(),
    fatal,
  }));

  // -- connect --------------------------------------------------------------
  connection = connectGameToHost({
    async setState(next) {
      snapshot = next;
      store.emit();
    },
  });

  void connection.promise
    .then(api => {
      hostApi = api;
      store.emit();
    })
    .catch((error: unknown) => {
      fatal = error instanceof Error ? error.message : 'could not reach the host';
      store.emit();
    });

  const requireApi = (): HostApiV1 => {
    if (!hostApi) throw new Error('the host bridge is not connected yet');
    return hostApi;
  };

  return {
    kind: 'chain',

    subscribe: store.subscribe,
    snapshot: store.view,

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
      store.emit();
    },

    async submitAction(action: A) {
      const api = requireApi();
      const row = currentRow();
      if (!row?.sessionId) throw new Error('no open session to act on');
      localError = null;
      try {
        await api.submitAction({ sessionId: row.sessionId, actionData: options.encodeAction(action) });
      } catch (error: unknown) {
        localError = error instanceof Error ? error.message : 'the action was rejected';
      }
      store.emit();
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
        store.emit();
      }
    },

    destroy() {
      destroyed = true;
      store.clear();
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

/**
 * Resolves to whichever host is actually there.
 *
 * Standing alone is the common case, so it must not pay for the chain path: if
 * no host answers within the grace window the chain bridge is torn down and the
 * demo takes over. The UI re-subscribes; it never learns which one it got beyond
 * `kind`.
 */
export async function raceForHost<S extends BaseSessionView, A>(
  chain: GameHost<S, A>,
  demo: () => GameHost<S, A>,
  graceMs: number,
): Promise<GameHost<S, A>> {
  const connected = await new Promise<boolean>(resolve => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(false), graceMs);
    const unsubscribe = chain.subscribe(view => {
      if (view.fatal) finish(false);
      else if (view.connected) finish(true);
    });
  });

  if (connected) return chain;
  chain.destroy();
  return demo();
}

/**
 * `?seed=1728` makes FREE PLAY deterministic, and `?host=demo|chain` forces a
 * host. Free play only, and neither can reach the chain path: inside a host the
 * contract's VRF is the only authority on outcomes and nothing here touches it.
 *
 * This exists because some sequences are impractical to reach by luck — a 25x at
 * the first inch is one round in five hundred — and both recording a demo and
 * reproducing a reported bug need to land on the same rounds twice.
 */
export function readSeedParam(): readonly [number, number, number, number] | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('seed');
  if (raw === null) return null;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return null;
  return seedFrom(value);
}

/** Spreads one integer across the PRNG's four words. */
export function seedFrom(value: number): readonly [number, number, number, number] {
  const n = value >>> 0;
  return [n ^ 0x9e3779b9, (n * 0x85ebca6b) >>> 0, (n * 0xc2b2ae35) >>> 0, (n ^ 0x27d4eb2f) >>> 0];
}

export function readForcedHost(): 'chain' | 'demo' | null {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('host');
  return value === 'chain' || value === 'demo' ? value : null;
}

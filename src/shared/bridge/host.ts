/**
 * The shape every game on this origin presents to its UI (docs.md §1).
 *
 * With a host present the contract is the only authority on outcomes; without
 * one, a demo host synthesises the same message shapes from a seeded PRNG. Both
 * implement `GameHost`, so a UI has exactly ONE code path and free play cannot
 * quietly drift into being a different game.
 *
 * Everything here is game-agnostic: a wallet, a token, a purse, a stake and a
 * session that is either open or not. What is IN the session — an inch and a lot,
 * or a manifest and a margin — is the game's own business, so `GameHost` is
 * generic over it. That is the whole reason a second game did not need a second
 * bridge.
 */

export type HostKind = 'chain' | 'demo';

/** Mirrors `SessionPhase` in ICasinoGameV2, plus a local pre-chain state. */
export type SessionPhase =
  | 'opening'
  | 'waiting-randomness'
  | 'waiting-player'
  | 'settled'
  | 'forfeited'
  | 'cancelled';

export type WalletStatus = 'ready' | 'disconnected' | 'setup-required' | 'session-key-mismatch';

/** What every game's session carries, whatever else it carries. */
export type BaseSessionView = {
  readonly sessionKey: string;
  readonly sessionId: string | null;
  readonly phase: SessionPhase;
  readonly stakeBase: bigint;
  /** Meaningful once the phase is terminal. */
  readonly payoutBase: bigint;
  /** True once the round has settled and the payout may be shown. */
  readonly isSettled: boolean;
  /** Set when a step failed; the UI surfaces it instead of hanging. */
  readonly error: string | null;
};

export type HostViewOf<S extends BaseSessionView> = {
  readonly kind: HostKind;
  /**
   * True once a host has actually answered — the penpal handshake resolved, or
   * a snapshot arrived. Distinct from `canBet`: a host can be connected and
   * still have no wallet ready to bet with.
   */
  readonly connected: boolean;
  /** False until the bridge has a host and a wallet that can bet. */
  readonly canBet: boolean;
  readonly walletStatus: WalletStatus;
  readonly tokenSymbol: string;
  readonly tokenDecimals: number;
  /**
   * Play-chip purse. **Demo only.** Inside a host the HOST owns and draws the
   * balance and the game must not render a second one (docs.md §4.1).
   */
  readonly purseBase: bigint | null;
  readonly minStakeBase: bigint;
  /** Clamped to what `openSession` would accept right now, or null if unknown. */
  readonly maxStakeBase: bigint | null;
  readonly defaultStakeBase: bigint;
  readonly theme: 'light' | 'dark' | 'system';
  readonly session: S | null;
  /** Present only when the host cannot be reached at all. */
  readonly fatal: string | null;
};

export type GameHost<S extends BaseSessionView, A> = {
  readonly kind: HostKind;
  /** Pushes a new view on every change. Returns an unsubscribe. */
  subscribe(listener: (view: HostViewOf<S>) => void): () => void;
  snapshot(): HostViewOf<S>;
  openSession(stakeBase: bigint): Promise<void>;
  submitAction(action: A): Promise<void>;
  /**
   * Tell the host the reveal animation has landed. Until this is called the host
   * hides the payout from its balance display so the top bar cannot spoil the
   * result (docs.md §7.3.10). Harmless no-op in demo.
   */
  revealOutcome(): Promise<void>;
  /** Clear a settled round so the next one can be dealt. */
  dealAgain(): void;
  /**
   * Collapse the pacing. Turbo changes how long the game waits, never what the
   * player has to decide — an autoplayer would be an admission that the decision
   * is fake (claude.md §7), and neither of these games is one.
   */
  setTurbo?(turbo: boolean): void;
  /** Demo only — restores the opening purse. Absent inside a host. */
  refill?(): void;
  destroy(): void;
};

/**
 * A view store with a STABLE snapshot reference.
 *
 * `useSyncExternalStore` re-renders forever if `snapshot()` returns a fresh
 * object every call, so the built view is cached until something invalidates it.
 * Both hosts of both games use this; it is the one piece of the bridge that has
 * a subtle failure mode and no visible symptom until the page pins a CPU.
 */
export function createViewStore<V>(build: () => V): {
  view(): V;
  emit(): void;
  subscribe(listener: (view: V) => void): () => void;
  clear(): void;
} {
  const listeners = new Set<(view: V) => void>();
  let cached: V | null = null;

  const view = (): V => (cached ??= build());

  return {
    view,
    emit() {
      cached = null;
      const next = view();
      for (const listener of listeners) listener(next);
    },
    /**
     * Registers only — the listener is NOT called synchronously. Callers read
     * the current value with `snapshot()`; React requires a store's subscribe
     * not to fire during subscription.
     */
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    clear() {
      listeners.clear();
      cached = null;
    },
  };
}

/** `"12345"` -> `12345n`, and anything else -> the fallback. */
export function toBigInt(value: string | undefined, fallback = 0n): bigint {
  if (value === undefined) return fallback;
  try {
    return BigInt(value);
  } catch {
    return fallback;
  }
}

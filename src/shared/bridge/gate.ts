/**
 * One call at a time, for the calls that cost money.
 *
 * `openSession` and `submitAction` each end in a wallet transaction, and
 * neither changes the local view until the host pushes a new snapshot back —
 * which is a network round trip later. Until then the button is still live and
 * `canAct` is still true, so a second click sent a second transaction for the
 * same decision. Nothing could be spent twice: the facet rejects the duplicate
 * against the session commitment. What the player got was a second signing
 * prompt and an error for a move they made once.
 *
 * A held key made that easy rather than unlikely — the three games did not
 * filter `event.repeat`, so Space held down asked at the OS repeat rate.
 *
 * `revealOutcome` had guarded itself from the start with a `revealed` set; this
 * is the same idea, named, for the two that matter more.
 */
export type Gate = {
  /** True while a call is outstanding. */
  readonly busy: boolean;
  /**
   * Runs `fn` unless one is already running, in which case it does nothing and
   * resolves to `undefined` — a refused duplicate is not an error, it is the
   * same decision arriving twice.
   */
  run<T>(fn: () => Promise<T>): Promise<T | undefined>;
};

export function createGate(): Gate {
  let busy = false;
  return {
    get busy() {
      return busy;
    },
    async run<T>(fn: () => Promise<T>): Promise<T | undefined> {
      if (busy) return undefined;
      busy = true;
      try {
        return await fn();
      } finally {
        // Released even when `fn` throws, or one rejected call would wedge the
        // game shut for the rest of the session.
        busy = false;
      }
    },
  };
}

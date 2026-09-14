/**
 * Picks the host (docs.md §1, claude.md I10).
 *
 * Embedded in a page that answers the penpal handshake -> the chain.wtf host.
 * Anything else -> free play, immediately, with no wallet, no modal and no
 * splash. A player who lands on the bare URL gets a full honest round in under
 * two seconds; they never see a connect screen they cannot act on.
 */
import { createCasinoHost, isEmbedded } from './useCasinoHost';
import { createDemoHost } from './demoHost';
import type { CandleHost } from './types';

export * from './types';
export { createCasinoHost, isEmbedded } from './useCasinoHost';
export { createDemoHost, DEMO_OPENING_PURSE, DEMO_DEFAULT_STAKE, DEMO_MIN_STAKE } from './demoHost';

/** How long to wait for a host handshake before falling back to free play. */
const HANDSHAKE_GRACE_MS = 1_200;

export type SelectHostOptions = {
  /** Force a host, for tests and for `?demo=1`. */
  readonly force?: 'chain' | 'demo';
  readonly graceMs?: number;
};

/**
 * Resolves to whichever host is actually there.
 *
 * Standing alone is the common case, so it must not pay for the chain path: if
 * no host answers within the grace window the chain bridge is torn down and the
 * demo takes over. The UI re-subscribes; it never learns which one it got beyond
 * `kind`.
 */
export async function selectHost(options: SelectHostOptions = {}): Promise<CandleHost> {
  const forced = options.force ?? readForcedHost();
  if (forced === 'demo') return createDemoHost();
  if (forced === 'chain') return createCasinoHost();
  if (!isEmbedded()) return createDemoHost();

  const chain = createCasinoHost();
  const connected = await waitForHost(chain, options.graceMs ?? HANDSHAKE_GRACE_MS);
  if (connected) return chain;

  chain.destroy();
  return createDemoHost();
}

function waitForHost(host: CandleHost, graceMs: number): Promise<boolean> {
  return new Promise(resolve => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(false), graceMs);
    const unsubscribe = host.subscribe(view => {
      if (view.fatal) finish(false);
      else if (view.connected) finish(true);
    });
  });
}

function readForcedHost(): 'chain' | 'demo' | null {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('host');
  return value === 'chain' || value === 'demo' ? value : null;
}

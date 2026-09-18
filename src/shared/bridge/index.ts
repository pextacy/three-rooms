/**
 * Picks the host (docs.md §1, claude.md I10).
 *
 * Embedded in a page that answers the penpal handshake -> the chain.wtf host.
 * Anything else -> free play, immediately, with no wallet, no modal and no
 * splash. A player who lands on the bare URL gets a full honest round in under
 * two seconds; they never see a connect screen they cannot act on.
 */
import { createCasinoHost } from './useCasinoHost';
import { createDemoHost } from './demoHost';
import { isEmbedded, raceForHost, readForcedHost, readSeedParam } from './chain';
import type { CandleHost } from './types';

export * from './types';
export type { BaseSessionView, GameHost, HostViewOf } from './host';
export { createCasinoHost } from './useCasinoHost';
export { isEmbedded, seedFrom } from './chain';
export { mayAutoDeal, type AutoDealView } from './autoDeal';
export { createDemoHost, DEMO_OPENING_PURSE, DEMO_DEFAULT_STAKE, DEMO_MIN_STAKE } from './demoHost';

/** How long to wait for a host handshake before falling back to free play. */
const HANDSHAKE_GRACE_MS = 1_200;

export type SelectHostOptions = {
  /** Force a host, for tests and for `?host=demo`. */
  readonly force?: 'chain' | 'demo';
  readonly graceMs?: number;
};

/**
 * Resolves to whichever host is actually there: the chain.wtf host if one
 * answers the handshake, free play otherwise — immediately, with no wallet, no
 * modal and no splash (claude.md I10).
 */
export async function selectHost(options: SelectHostOptions = {}): Promise<CandleHost> {
  const forced = options.force ?? readForcedHost();
  const seed = readSeedParam();
  const demo = () => (seed ? createDemoHost({ seed }) : createDemoHost());

  if (forced === 'demo') return demo();
  if (forced === 'chain') return createCasinoHost();
  if (!isEmbedded()) return demo();

  return raceForHost(createCasinoHost(), demo, options.graceMs ?? HANDSHAKE_GRACE_MS);
}

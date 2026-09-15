/**
 * Picks the host for THE BROKERS (docs.md §1, claude.md I10).
 *
 * Embedded in a page that answers the penpal handshake -> the chain.wtf host.
 * Anything else -> free play, immediately, with no wallet, no modal and no
 * splash.
 */
import { createBrokersChainHost } from './chainHost';
import { createDemoBrokersHost } from './demoHost';
import { isEmbedded, raceForHost, readForcedHost, readSeedParam } from '../../../../shared/bridge/chain';
import type { BrokersHost } from './types';

export * from './types';
export { createBrokersChainHost } from './chainHost';
export { createDemoBrokersHost, DEMO_OPENING_PURSE, DEMO_DEFAULT_STAKE, DEMO_MIN_STAKE } from './demoHost';
export { isEmbedded, seedFrom } from '../../../../shared/bridge/chain';

/** How long to wait for a host handshake before falling back to free play. */
const HANDSHAKE_GRACE_MS = 1_200;

export type SelectBrokersHostOptions = {
  readonly force?: 'chain' | 'demo';
  readonly graceMs?: number;
};

export async function selectBrokersHost(options: SelectBrokersHostOptions = {}): Promise<BrokersHost> {
  const forced = options.force ?? readForcedHost();
  const seed = readSeedParam();
  const demo = () => (seed ? createDemoBrokersHost({ seed }) : createDemoBrokersHost());

  if (forced === 'demo') return demo();
  if (forced === 'chain') return createBrokersChainHost();
  if (!isEmbedded()) return demo();

  return raceForHost(createBrokersChainHost(), demo, options.graceMs ?? HANDSHAKE_GRACE_MS);
}

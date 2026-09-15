/**
 * Picks the host for THE SURVEY (docs.md §1, claude.md I10).
 *
 * Embedded in a page that answers the penpal handshake -> the chain.wtf host.
 * Anything else -> free play, immediately, with no wallet, no modal and no
 * splash. A player who lands on the bare URL gets a full honest voyage in under
 * two seconds; they never see a connect screen they cannot act on.
 */
import { createSurveyChainHost } from './chainHost';
import { createDemoSurveyHost } from './demoHost';
import { isEmbedded, raceForHost, readForcedHost, readSeedParam } from '../../../../shared/bridge/chain';
import type { SurveyHost } from './types';

export * from './types';
export { createSurveyChainHost } from './chainHost';
export {
  createDemoSurveyHost,
  DEMO_OPENING_PURSE,
  DEMO_DEFAULT_STAKE,
  DEMO_MIN_STAKE,
} from './demoHost';
export { isEmbedded, seedFrom } from '../../../../shared/bridge/chain';

/** How long to wait for a host handshake before falling back to free play. */
const HANDSHAKE_GRACE_MS = 1_200;

export type SelectSurveyHostOptions = {
  /** Force a host, for tests and for `?host=demo`. */
  readonly force?: 'chain' | 'demo';
  readonly graceMs?: number;
};

export async function selectSurveyHost(options: SelectSurveyHostOptions = {}): Promise<SurveyHost> {
  const forced = options.force ?? readForcedHost();
  const seed = readSeedParam();
  const demo = () => (seed ? createDemoSurveyHost({ seed }) : createDemoSurveyHost());

  if (forced === 'demo') return demo();
  if (forced === 'chain') return createSurveyChainHost();
  if (!isEmbedded()) return demo();

  return raceForHost(createSurveyChainHost(), demo, options.graceMs ?? HANDSHAKE_GRACE_MS);
}

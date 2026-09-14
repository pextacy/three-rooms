/**
 * Subscribes React to a `CandleHost`.
 *
 * The UI holds no game logic (claude.md §3): this hook only mirrors the host's
 * view into React state and exposes the host's own methods.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { selectHost, type CandleHost, type HostView } from '../bridge';

export function useCandleHost(): { host: CandleHost | null; view: HostView | null } {
  const [host, setHost] = useState<CandleHost | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: CandleHost | null = null;

    void selectHost().then(resolved => {
      if (cancelled) {
        resolved.destroy();
        return;
      }
      created = resolved;
      setHost(resolved);
    });

    return () => {
      cancelled = true;
      created?.destroy();
    };
  }, []);

  const view = useSyncExternalStore(
    onChange => (host ? host.subscribe(() => onChange()) : () => {}),
    () => host?.snapshot() ?? null,
    () => null,
  );

  return { host, view };
}

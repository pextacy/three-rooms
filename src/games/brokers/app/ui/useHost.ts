/**
 * Subscribes React to a `BrokersHost`.
 *
 * The UI holds no game logic (claude.md §3): this hook only mirrors the host's
 * view into React state and exposes the host's own methods.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { selectBrokersHost, type BrokersHost, type BrokersView } from '../bridge';

export function useBrokersHost(): { host: BrokersHost | null; view: BrokersView | null } {
  const [host, setHost] = useState<BrokersHost | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: BrokersHost | null = null;

    void selectBrokersHost().then(resolved => {
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

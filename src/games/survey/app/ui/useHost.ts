/**
 * Subscribes React to a `SurveyHost`.
 *
 * The UI holds no game logic (claude.md §3): this hook only mirrors the host's
 * view into React state and exposes the host's own methods.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { selectSurveyHost, type SurveyHost, type SurveyView } from '../bridge';

export function useSurveyHost(): { host: SurveyHost | null; view: SurveyView | null } {
  const [host, setHost] = useState<SurveyHost | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: SurveyHost | null = null;

    void selectSurveyHost().then(resolved => {
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

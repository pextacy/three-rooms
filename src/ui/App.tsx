import { COPY } from './copy';

/**
 * Phase 0 skeleton (phases.md 0.7). This is the "blank deploy" the D0 exit gate
 * asks for — it exists so the origin, the headers and the widget tag can be
 * verified live before any game code is written. Phase 2 replaces it with the
 * real loop; nothing here is meant to survive.
 */
export function App() {
  return (
    <main className="skeleton">
      <p className="skeleton__mark">{COPY.title}</p>
      <p className="skeleton__line">{COPY.tagline}</p>
      <p className="skeleton__note">{COPY.skeletonNote}</p>
    </main>
  );
}

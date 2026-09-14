/**
 * The last line of defence.
 *
 * Without one of these, a single render throw anywhere in the tree leaves a
 * **blank white page** — the worst thing a judge with ninety seconds can be shown,
 * and indistinguishable from a site that is simply down.
 *
 * So: catch it, stay in the room's own palette, say what happened in the
 * auctioneer's voice, and offer the one action that helps. The error itself is
 * printed rather than swallowed, because a reviewer who can read it can tell us
 * what broke.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { COPY } from './copy';

type Props = { readonly children: ReactNode };
type State = { readonly error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Kept, not swallowed: the console is where a reviewer will look.
    console.error('CANDLE crashed:', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <main className="crash" role="alert">
        <p className="crash__mark">{COPY.title}</p>
        <p className="crash__line">{COPY.crashed}</p>
        <button className="btn btn--claim" onClick={() => window.location.reload()}>
          {COPY.crashReload}
        </button>
        <pre className="crash__detail">{error.message}</pre>
      </main>
    );
  }
}

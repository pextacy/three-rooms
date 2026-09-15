/**
 * The last line of defence.
 *
 * Without one of these, a single render throw anywhere in the tree leaves a
 * blank white page — indistinguishable from a site that is down. So: catch it,
 * stay in the room's palette, say what happened in the floor's own voice, and
 * offer the one action that helps. The error is printed rather than swallowed.
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
    console.error('THE BROKERS crashed:', error, info.componentStack);
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

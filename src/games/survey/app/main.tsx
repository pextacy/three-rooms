import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import '../../../shared/ui/tokens.css';
import '../../../shared/ui/table.css';
import './ui/roads.css';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

/**
 * Cold open, measured rather than hoped (prd.md §7: p95 < 400 ms, hard budget
 * 1,200 ms). The mark lands on the first frame after the tree is interactive —
 * with the free-play host that is a playable frame, since there is no wallet,
 * no modal and no splash to get through (claude.md I10).
 *
 * `npm run cold-open` reads this back; the browser console can too.
 */
declare global {
  interface Window {
    __surveyColdOpenMs?: number;
  }
}

requestAnimationFrame(() => {
  window.__surveyColdOpenMs = performance.now();
  performance.mark?.('survey:playable');
});

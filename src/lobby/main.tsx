import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Lobby } from './Lobby';
import { accents } from './accents';
import '../shared/ui/tokens.css';
import './lobby.css';

/**
 * The three accents are derived, not chosen, so they are written onto the root
 * before the first paint rather than typed into the stylesheet. `accents.ts`
 * says how; the short version is that each is that room's own money ink taken
 * down to whatever luminance clears WCAG AA against paper.
 */
for (const [name, value] of accents()) {
  document.documentElement.style.setProperty(name, value);
}

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');

createRoot(root).render(
  <StrictMode>
    <Lobby />
  </StrictMode>,
);

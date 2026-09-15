import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Lobby } from './Lobby';
import '../shared/ui/tokens.css';
import './lobby.css';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');

createRoot(root).render(
  <StrictMode>
    <Lobby />
  </StrictMode>,
);

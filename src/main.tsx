import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from '@/app/app';

import './index.css';

const container = document.getElementById('root');
if (container === null) throw new Error('#root não existe no index.html');

createRoot(container).render(
  // StrictMode is development-only, and it deliberately mounts every component
  // twice to surface effects that are not safe to run again — a subscription
  // without a cleanup, state mutated during render. It is noise in the console
  // until it catches the bug it exists to catch, and then it is worth it.
  <StrictMode>
    <App />
  </StrictMode>,
);

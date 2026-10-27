import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import { watchUiZoom } from './lib/uiScale.js';
import { watchScanMode } from './lib/mobile.js';
import { explainStaleBuild } from './lib/staleBuild.js';

import './styles/tokens.css';
import './styles/base.css';
import './styles/tabs.css';
import './styles/panels.css';
import './styles/login.css';
import './styles/settings.css';
import './styles/price.css';
import './styles/collections.css';
import './styles/calendar.css';
import './styles/changelog.css';
import './styles/export.css';
import './styles/home.css';
import './styles/help.css';
import './styles/scan.css';

// Smaller on a small screen, down to 80% (lib/uiScale.js).
watchUiZoom();
// A phone (or #/scan) is the scanner: no desktop-only notice, no laptop zoom (lib/mobile.js).
watchScanMode();
// A part loaded only when needed that a push has since replaced (decision 507): the error goes on to its caller,
// as before, in words that say to reload (lib/staleBuild.js).
window.addEventListener('vite:preloadError', (e) => explainStaleBuild(e.payload));
// Localhost on dev wears a faint DEV watermark, so it can't be taken for the live site (decision 382; base.css).
// Written as import.meta.env.DEV itself: a build replaces it with false and drops the line, dev's ref with it.
if (import.meta.env.DEV && import.meta.env.VITE_SUPABASE_URL?.startsWith('https://psucrzljraxeootwnltf.')) {
  document.documentElement.classList.add('dev-db');
}

// HashRouter: GitHub Pages can't rewrite deep links, and #/routes survive a refresh.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';

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

// HashRouter: GitHub Pages can't rewrite deep links, and #/routes survive a refresh.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);

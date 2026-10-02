import { useLocation, useNavigate } from 'react-router-dom';

// The tabs (spec 7.2). Changelog sits apart on the right. Home first, and
// "Buy" for the Price tab (owner, 2026-10-01; its address stays /price).
export const TABS = [
  { key: 'home', label: 'Home', path: '/home' },
  { key: 'price', label: 'Buy', path: '/price' },
  { key: 'collections', label: 'Collections', path: '/collections' },
  { key: 'calendar', label: 'Calendar', path: '/calendar' },
  { key: 'settings', label: 'Settings', path: '/settings' },
  { key: 'changelog', label: 'Changelog', path: '/changelog', apart: true },
];

/** Which tab a route belongs to: the first path segment. */
export function tabKeyFor(pathname) {
  const first = pathname.split('/')[1] || 'home';
  return TABS.some((t) => t.key === first) ? first : 'home';
}

export default function Tabs() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const active = tabKeyFor(pathname);

  return (
    <nav id="tabs">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={`tab${tab.key === active ? ' active' : ''}${tab.apart ? ' tab-apart' : ''}`}
          // Clicking the active tab again returns it to its root view.
          onClick={() => navigate(tab.path)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

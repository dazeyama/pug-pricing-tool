import { Suspense, lazy } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { missingConfig } from './lib/supabase.js';
import { onDevDatabase } from './lib/devDb.js';
import { SessionProvider, useSession } from './state/session.jsx';
import { DeviceProvider, useDevice } from './state/device.jsx';
import { ConnectionProvider } from './state/connection.jsx';
import { StaffProvider } from './state/staff.jsx';
import { PresenceProvider } from './state/presence.jsx';
import { SettingsProvider } from './state/settings.jsx';
import { InventoryProvider } from './state/inventory.jsx';
import { PriceLimitProvider } from './state/priceLimit.jsx';
import { ToastProvider } from './components/Toast.jsx';
import Header, { isPricingScreen } from './components/Header.jsx';
import Banners from './components/Banners.jsx';
import { tabKeyFor } from './components/Tabs.jsx';
import DeviceNameModal from './components/DeviceNameModal.jsx';
import DeviceSaveModal from './components/DeviceSaveModal.jsx';
import LoginPage from './pages/LoginPage.jsx';
import HomePage from './pages/HomePage.jsx';
import PricePage from './pages/PricePage.jsx';
import CollectionsPage from './pages/CollectionsPage.jsx';
import CollectionPage from './pages/CollectionPage.jsx';
import CalendarPage from './pages/CalendarPage.jsx';
import DayPage from './pages/DayPage.jsx';
import BuyEditPage from './pages/BuyEditPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import ChangelogPage from './pages/ChangelogPage.jsx';
import HelpPage from './pages/HelpPage.jsx';
import ScanApp from './scan/ScanApp.jsx';
import { isPhone } from './lib/mobile.js';

// The Crystal Commerce matching audit (decision 547): a temporary secret page, dev only, in its own chunk so the
// live site's bundle doesn't carry it.
const AuditCcPage = lazy(() => import('./pages/export/audit/AuditCcPage.jsx'));

/**
 * Header, then the current tab. The tab's panel is keyed by tab so it fades in
 * on each switch. The pricing screens (the Price tab and a collection) fill
 * the window below the header with no page scroll (spec 8.1, 9.4); every
 * other tab scrolls normally.
 */
function Layout() {
  const { pathname } = useLocation();
  const { label, saved } = useDevice();
  // Home is one centered panel that never scrolls (owner, 2026-10-01); Help's
  // contents and page scroll inside their own panels (owner, 2026-10-09).
  const fullScreen = isPricingScreen(pathname) || pathname === '/home' || pathname.startsWith('/help');
  return (
    // Every desktop tab says it's here, and who's picked (decision 284); the home page counts them.
    <PresenceProvider>
      <div className={`shell${fullScreen ? ' shell-fixed' : ''}`}>
        <Header />
        <main>
          <Banners />
          <section className="panel active" key={tabKeyFor(pathname)}>
            <Outlet />
          </section>
        </main>
        {/* Name this computer, then wait for its row in `devices` (owner's bug, 2026-09-30). */}
        {!label ? <DeviceNameModal /> : !saved && <DeviceSaveModal />}
      </div>
    </PresenceProvider>
  );
}

/** Signed in → the app. Signed out → the password screen. */
function AuthGate() {
  const { session } = useSession();
  if (session === undefined) return null;   // reading the stored session: a blink at most
  if (!session) return <LoginPage />;
  // Shared data loads only once signed in: Row Level Security allows nothing before.
  // A phone gets the scanner and nothing else (docs/SCAN_FUNCTION.md 5.1).
  const phone = isPhone();
  return (
    <ConnectionProvider>
      <StaffProvider>
        <SettingsProvider>
          <InventoryProvider>
            <PriceLimitProvider>
              <Routes>
                {/* The scanner, outside the desktop layout: on a phone, and #/scan anywhere. */}
                <Route path="/scan" element={<ScanApp />} />
                {/* #/audit-cc, the matching audit (decision 547): only on the dev server on dev's database; anywhere
                    else the address falls through to Home like any unknown one. */}
                {onDevDatabase() && (
                  <Route path="/audit-cc" element={<Suspense fallback={null}><AuditCcPage /></Suspense>} />
                )}
                {phone ? <Route path="*" element={<Navigate to="/scan" replace />} /> : (
                <Route element={<Layout />}>
                  <Route path="/home" element={<HomePage />} />
                  {/* #/price/<search>: a search from the address bar (Chrome's Site search). */}
                  <Route path="/price/:search?" element={<PricePage />} />
                  <Route path="/collections" element={<CollectionsPage />} />
                  <Route path="/collections/:id" element={<CollectionPage />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/calendar/:game/:date" element={<DayPage />} />
                  <Route path="/calendar/:game/:date/buy/:id" element={<BuyEditPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/changelog" element={<ChangelogPage />} />
                  <Route path="/help" element={<HelpPage />} />
                  <Route path="/help/:page" element={<HelpPage />} />
                  {/* Home is the first tab and where the app opens (owner, 2026-10-01). */}
                  <Route path="*" element={<Navigate to="/home" replace />} />
                </Route>
                )}
              </Routes>
            </PriceLimitProvider>
          </InventoryProvider>
        </SettingsProvider>
      </StaffProvider>
    </ConnectionProvider>
  );
}

/** The build is missing its Supabase settings (.env.development or the Actions variables). */
function MissingConfig() {
  return (
    <div className="fatal">
      <div className="banner err">
        PUG Pricing Tool can't start: missing {missingConfig.join(', ')}.
        Check <code>.env.development</code> (localhost) or the GitHub Actions
        repository variables (live site).
      </div>
    </div>
  );
}

export default function App() {
  return (
    <>
      <div id="loading-bar" aria-hidden="true" />
      <div className="too-small">
        <p>PUG Pricing Tool is built for store computers. Please use a wider window.</p>
      </div>
      <div className="app">
        {missingConfig.length ? (
          <MissingConfig />
        ) : (
          <ToastProvider>
            <SessionProvider>
              <DeviceProvider>
                <AuthGate />
              </DeviceProvider>
            </SessionProvider>
          </ToastProvider>
        )}
      </div>
    </>
  );
}

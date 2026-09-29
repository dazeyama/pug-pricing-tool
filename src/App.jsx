import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { missingConfig } from './lib/supabase.js';
import { SessionProvider, useSession } from './state/session.jsx';
import { DeviceProvider, useDevice } from './state/device.jsx';
import { ConnectionProvider } from './state/connection.jsx';
import { StaffProvider } from './state/staff.jsx';
import { SettingsProvider } from './state/settings.jsx';
import { InventoryProvider } from './state/inventory.jsx';
import { ToastProvider } from './components/Toast.jsx';
import Header from './components/Header.jsx';
import Banners from './components/Banners.jsx';
import { tabKeyFor } from './components/Tabs.jsx';
import DeviceNameModal from './components/DeviceNameModal.jsx';
import LoginPage from './pages/LoginPage.jsx';
import PricePage from './pages/PricePage.jsx';
import CollectionsPage from './pages/CollectionsPage.jsx';
import CollectionPage from './pages/CollectionPage.jsx';
import CalendarPage from './pages/CalendarPage.jsx';
import DayPage from './pages/DayPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import ChangelogPage from './pages/ChangelogPage.jsx';

/** Header, then the current tab. The tab's panel is keyed by tab so it fades in on each switch. */
function Layout() {
  const { pathname } = useLocation();
  const { label } = useDevice();
  return (
    <>
      <Header />
      <main>
        <Banners />
        <section className="panel active" key={tabKeyFor(pathname)}>
          <Outlet />
        </section>
      </main>
      {!label && <DeviceNameModal />}
    </>
  );
}

/** Signed in → the app. Signed out → the password screen. */
function AuthGate() {
  const { session } = useSession();
  if (session === undefined) return null;   // reading the stored session: a blink at most
  if (!session) return <LoginPage />;
  // Shared data loads only once signed in: Row Level Security allows nothing before.
  return (
    <ConnectionProvider>
      <StaffProvider>
        <SettingsProvider>
          <InventoryProvider>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/price" element={<PricePage />} />
                <Route path="/collections" element={<CollectionsPage />} />
                <Route path="/collections/:id" element={<CollectionPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/calendar/:game/:date" element={<DayPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/changelog" element={<ChangelogPage />} />
                <Route path="*" element={<Navigate to="/price" replace />} />
              </Route>
            </Routes>
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

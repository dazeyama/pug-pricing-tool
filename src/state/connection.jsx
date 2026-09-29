import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';

// Connection required (spec 7.9). Offline means the browser says so, or
// Supabase Realtime has been disconnected for over 10 seconds. When the
// connection comes back, `epoch` ticks and every live table reloads.

const REALTIME_GRACE_MS = 10_000;

const ConnectionContext = createContext({ offline: false, epoch: 0 });

export function ConnectionProvider({ children }) {
  const [browserOnline, setBrowserOnline] = useState(() => navigator.onLine);
  const [realtimeDown, setRealtimeDown] = useState(false);
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    const up = () => setBrowserOnline(true);
    const down = () => setBrowserOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  useEffect(() => {
    // Counts from page load too, so a socket that never connects shows the banner.
    let downSince = Date.now();
    const timer = setInterval(() => {
      if (supabase.realtime.isConnected()) {
        downSince = null;
        setRealtimeDown(false);
      } else {
        downSince ??= Date.now();
        if (Date.now() - downSince > REALTIME_GRACE_MS) setRealtimeDown(true);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const offline = !browserOnline || realtimeDown;

  // Back online: reload what's on screen, since changes may have been missed.
  const wasOffline = useRef(false);
  useEffect(() => {
    if (offline) {
      wasOffline.current = true;
    } else if (wasOffline.current) {
      wasOffline.current = false;
      setEpoch((n) => n + 1);
    }
  }, [offline]);

  return (
    <ConnectionContext.Provider value={{ offline, epoch }}>
      {children}
    </ConnectionContext.Provider>
  );
}

/** @returns {{ offline: boolean, epoch: number }} */
export function useConnection() {
  return useContext(ConnectionContext);
}

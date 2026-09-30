import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { readLocal, writeLocal } from '../lib/local.js';
import { useSession } from './session.jsx';

// This browser on this store computer (spec 2, 7.4). A random ID kept in
// localStorage identifies it, and a friendly name ("Front Counter") labels it
// on drafts and collection locks. Both are copied to the `devices` table
// whenever the app opens signed in, which also stamps last_seen_at.
//
// Drafts, collection locks and the changelog all point at that row, so the
// app waits for it (`saved`) before anything can write with this computer's
// ID; if the save fails, the error shows with a Retry (owner's bug,
// 2026-09-30: a browser whose one save didn't land got "violates foreign key
// constraint buys_draft_device_id_fkey" on its first card).

const ID_KEY = 'pug.deviceId';
const LABEL_KEY = 'pug.deviceLabel';

/** The stored ID; one is made if the name survived without it. */
function initialId() {
  const id = readLocal(ID_KEY);
  if (id || !readLocal(LABEL_KEY)) return id;
  const fresh = crypto.randomUUID();
  writeLocal(ID_KEY, fresh);
  return fresh;
}

const DeviceContext = createContext(null);

export function DeviceProvider({ children }) {
  const { session } = useSession();
  const [deviceId, setDeviceId] = useState(initialId);
  const [label, setLabelState] = useState(() => readLocal(LABEL_KEY));
  // The ID the `devices` table is known to have, and why the last save failed.
  const [savedId, setSavedId] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  const signedIn = Boolean(session);
  useEffect(() => {
    if (!signedIn || !deviceId || !label) return undefined;
    let alive = true;
    setSaveError(null);
    supabase
      .from('devices')
      .upsert({ id: deviceId, label, last_seen_at: new Date().toISOString() })
      .then(({ error }) => {
        if (!alive) return;
        if (error) {
          console.error('Saving this computer failed', error);
          setSaveError(error.message || 'Unknown error');
        } else {
          setSavedId(deviceId);
        }
      });
    return () => {
      alive = false;
    };
  }, [signedIn, deviceId, label, attempt]);

  /** Name (or rename) this computer, creating its ID the first time. */
  function setLabel(next) {
    const clean = next.trim();
    if (!clean) return;
    if (!deviceId) {
      const id = crypto.randomUUID();
      writeLocal(ID_KEY, id);
      setDeviceId(id);
    }
    writeLocal(LABEL_KEY, clean);
    setLabelState(clean);
  }

  const value = {
    deviceId,
    label,
    setLabel,
    saved: Boolean(deviceId) && savedId === deviceId,
    saveError,
    retrySave: () => setAttempt((n) => n + 1),
  };
  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}

export function useDevice() {
  return useContext(DeviceContext);
}

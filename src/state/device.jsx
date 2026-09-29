import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { readLocal, writeLocal } from '../lib/local.js';
import { useSession } from './session.jsx';
import { useToast } from '../components/Toast.jsx';

// This browser on this store computer (spec 2, 7.4). A random ID kept in
// localStorage identifies it, and a friendly name ("Front Counter") labels it
// on drafts and collection locks. Both are copied to the `devices` table
// whenever the app opens signed in, which also stamps last_seen_at.

const ID_KEY = 'pug.deviceId';
const LABEL_KEY = 'pug.deviceLabel';

const DeviceContext = createContext(null);

export function DeviceProvider({ children }) {
  const { session } = useSession();
  const toast = useToast();
  const [deviceId, setDeviceId] = useState(() => readLocal(ID_KEY));
  const [label, setLabelState] = useState(() => readLocal(LABEL_KEY));

  const signedIn = Boolean(session);
  useEffect(() => {
    if (!signedIn || !deviceId || !label) return;
    supabase
      .from('devices')
      .upsert({ id: deviceId, label, last_seen_at: new Date().toISOString() })
      .then(({ error }) => {
        if (error) {
          console.error('Saving this computer failed', error);
          toast("Couldn't save this computer's name to the database.", 'err');
        }
      });
  }, [signedIn, deviceId, label, toast]);

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

  return (
    <DeviceContext.Provider value={{ deviceId, label, setLabel }}>
      {children}
    </DeviceContext.Provider>
  );
}

export function useDevice() {
  return useContext(DeviceContext);
}

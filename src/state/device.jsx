import { createContext, useContext, useState } from 'react';

// This browser on this store computer (spec 2, 7.4). A random ID kept in
// localStorage identifies it, and a friendly name ("Front Counter") labels it
// on drafts and collection locks.
//
// Phase 1 keeps both in this browser only. The `devices` table arrives with
// the Phase 2 migrations, which also start writing this ID and name to it.

const ID_KEY = 'pug.deviceId';
const LABEL_KEY = 'pug.deviceLabel';

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the name lasts for this page load only.
  }
}

const DeviceContext = createContext(null);

export function DeviceProvider({ children }) {
  const [deviceId, setDeviceId] = useState(() => read(ID_KEY));
  const [label, setLabelState] = useState(() => read(LABEL_KEY));

  /** Name this computer, creating its ID the first time. */
  function setLabel(next) {
    const clean = next.trim();
    if (!clean) return;
    let id = deviceId;
    if (!id) {
      id = crypto.randomUUID();
      write(ID_KEY, id);
      setDeviceId(id);
    }
    write(LABEL_KEY, clean);
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

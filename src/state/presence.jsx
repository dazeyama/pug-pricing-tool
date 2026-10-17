import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { whoIsOn } from '../lib/presence.js';
import { useDevice } from './device.jsx';
import { useSession } from './session.jsx';
import { useStaff } from './staff.jsx';

// Who's on the app right now (decision 284): every open desktop tab says, over
// a Supabase Realtime Presence channel, which computer it is and who's picked
// on it; the home page counts the computers and the users. Nothing is written
// anywhere: a tab that closes or loses its connection simply drops out, and a
// tab that comes back says it again. One shared channel name on purpose
// (unlike channelName's, unique per subscription): presence is only shared
// among tabs on the same channel. A phone on the scanner never joins (ScanApp
// is outside the desktop Layout).

const PresenceContext = createContext({ computers: [], users: [] });
const CHANNEL = 'presence:store';

export function PresenceProvider({ children }) {
  const { session } = useSession();
  const { deviceId, label, saved } = useDevice();
  const { current } = useStaff();
  const [state, setState] = useState({});
  const signedIn = Boolean(session);

  // What this tab says about itself, always the latest: sent when the channel is ready, and again when it changes.
  const latest = useRef(null);
  latest.current = {
    device_id: deviceId,
    label: label ?? '',
    user_id: current?.id ?? null,
    user_name: current?.name ?? null,
    user_color: current?.color ?? null,
  };
  const channel = useRef(null);
  const ready = useRef(false);

  useEffect(() => {
    if (!signedIn || !deviceId || !saved) return undefined;
    const ch = supabase.channel(CHANNEL, { config: { presence: { key: deviceId } } });
    channel.current = ch;
    ch.on('presence', { event: 'sync' }, () => setState({ ...ch.presenceState() }));
    ch.subscribe((status) => {
      ready.current = status === 'SUBSCRIBED';
      if (ready.current) ch.track(latest.current);
    });
    return () => {
      ready.current = false;
      channel.current = null;
      supabase.removeChannel(ch);
      setState({});
    };
  }, [signedIn, deviceId, saved]);

  // The user picked or let go, or the computer renamed: said again.
  const said = JSON.stringify(latest.current);
  useEffect(() => {
    if (ready.current) channel.current?.track(latest.current);
  }, [said]);

  const value = useMemo(() => whoIsOn(state), [state]);
  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

/** @returns {ReturnType<typeof whoIsOn>} */
export function usePresence() {
  return useContext(PresenceContext);
}

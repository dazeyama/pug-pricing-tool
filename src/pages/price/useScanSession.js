import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSession } from '../../state/session.jsx';
import { useConnection } from '../../state/connection.jsx';
import { channelName } from '../../lib/channels.js';

// This computer's price screen, open for a phone to scan into
// (docs/SCAN_FUNCTION.md 8.1): a `scan_sessions` row saying what the screen
// is on, touched every 20 seconds and whenever that changes, and ended when
// the screen goes (another tab, a closed browser). A phone lists the fresh
// ones (a beat in the last 60 seconds) and pairs with one.
//
// Every session call from this tab runs in order, one after the other, so a
// screen closing and the next one opening (another collection) can't have
// the end land after the new screen's first touch.

const BEAT_MS = 20_000;
let chain = Promise.resolve();
function inOrder(fn) {
  const next = chain.then(fn, fn);
  chain = next.catch(() => {});
  return next;
}

/** The session row from an RPC's answer, or null. */
const rowOf = (data) => (data && typeof data === 'object' && data.device_id ? data : null);

/**
 * @param {{ deviceId: string, kind: 'walk_in'|'collection', buyId: string|null, name: string,
 *   games: string[], userId: string|null, locked: string|null }|null} target
 *   null: this screen takes no scans (no session)
 * @returns {{ session: object|null, unpair: () => Promise<void> }}
 *   session as scan_sessions_open lists it: phone_device_id, phone_label, paired_at, phone_seen_at, scanned…
 */
export function useScanSession(target) {
  const { session: auth } = useSession();
  const { epoch } = useConnection();
  const [session, setSession] = useState(null);
  const deviceId = target?.deviceId ?? null;
  const latest = useRef(target);
  latest.current = target;
  const token = useRef(null);
  token.current = auth?.access_token ?? null;

  const touch = useCallback(() => inOrder(async () => {
    const t = latest.current;
    if (!t?.deviceId) return;
    const { data, error } = await supabase.rpc('scan_session_touch', {
      p_device: t.deviceId,
      p_kind: t.kind,
      p_buy_id: t.buyId ?? null,
      p_name: t.name ?? '',
      p_games: t.games,
      p_user: t.userId ?? null,
      p_locked: t.locked ?? null,
    });
    if (error) {
      console.warn('scan_session_touch failed', error);
      return;
    }
    if (latest.current?.deviceId === t.deviceId) setSession(rowOf(data));
  }), []);

  /** Read the session again (a phone paired, beat or left). */
  const refresh = useCallback(async () => {
    if (!deviceId) return;
    const { data, error } = await supabase.rpc('scan_sessions_open');
    if (error) return;
    if (latest.current?.deviceId === deviceId) setSession((data ?? []).find((r) => r.device_id === deviceId) ?? null);
  }, [deviceId]);

  // Open while this screen is: a beat every 20 seconds (at once when the tab
  // comes back to the front: a hidden tab's timers slow down), ended on the
  // way out, a closed tab included (a request that outlives the page).
  useEffect(() => {
    if (!deviceId) return undefined;
    const timer = setInterval(touch, BEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') touch();
    };
    const onHide = () => {
      if (!token.current) return;
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/scan_session_end`, {
        method: 'POST',
        keepalive: true,
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${token.current}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_device: deviceId }),
      }).catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pagehide', onHide);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', onHide);
      inOrder(async () => {
        const { error } = await supabase.rpc('scan_session_end', { p_device: deviceId });
        if (error) console.warn('scan_session_end failed', error);
      });
      setSession(null);
    };
  }, [deviceId, touch]);

  // What the screen says changed (a user picked, MTG toggled, a lock): say so
  // now, not at the next beat. Also when the connection comes back.
  const signature = target
    ? JSON.stringify([target.kind, target.buyId, target.name, target.games, target.userId, target.locked])
    : null;
  useEffect(() => {
    if (signature) touch();
  }, [signature, epoch, touch]);

  // A phone pairing, beating or leaving changes the row.
  useEffect(() => {
    if (!deviceId) return undefined;
    const channel = supabase
      .channel(channelName('scan-session', deviceId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scan_sessions' }, (payload) => {
        if ((payload.new?.device_id ?? payload.old?.device_id) === deviceId) refresh();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [deviceId, refresh]);

  /** The chip's ×: let the phone go; the session stays open for the next one. */
  const unpair = useCallback(async () => {
    if (!deviceId) return;
    const { error } = await supabase.rpc('scan_unpair', { p_device: deviceId, p_phone: null });
    if (error) console.warn('scan_unpair failed', error);
    await refresh();
  }, [deviceId, refresh]);

  return { session, unpair, refresh };
}

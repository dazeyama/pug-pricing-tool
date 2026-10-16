import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { channelName } from '../lib/channels.js';
import { useConnection } from '../state/connection.jsx';

// This phone, paired with one computer's price screen (docs/SCAN_FUNCTION.md
// 5.4): a heartbeat every 20 seconds while the scanning screen is up, and an
// eye on that computer's session. When the pairing ends (the computer left
// its price screen or went quiet, unpaired this phone, or another phone
// paired), `onEnd` is told why, once.

const BEAT_MS = 20_000;

/**
 * @param {string} computerId  the paired computer's device id
 * @param {string} phoneId  this phone's device id
 * @param {(message: string|null) => void} onEnd
 * @returns {{ session: object|null, check: () => Promise<void>, unpair: () => Promise<void> }}
 */
export function usePairing(computerId, phoneId, onEnd) {
  const { epoch } = useConnection();
  const [session, setSession] = useState(null);
  const ended = useRef(false);
  const label = useRef('The computer');
  const endRef = useRef(onEnd);
  endRef.current = onEnd;

  const end = useCallback((message) => {
    if (ended.current) return;
    ended.current = true;
    endRef.current(message);
  }, []);

  /** Look at the computer's session: still paired with this phone? */
  const check = useCallback(async () => {
    if (ended.current) return;
    const { data, error } = await supabase.rpc('scan_sessions_open');
    if (error || ended.current) return;   // a hiccup: the next beat looks again
    const row = (data ?? []).find((r) => r.device_id === computerId);
    if (!row) {
      end(`${label.current} stopped: pick a computer to scan into.`);
      return;
    }
    label.current = row.device_label;
    if (row.phone_device_id !== phoneId) {
      end(row.phone_device_id
        ? `${row.device_label} is now scanning with ${row.phone_label ?? 'another phone'}.`
        : `${row.device_label} unpaired this phone.`);
      return;
    }
    setSession(row);
  }, [computerId, phoneId, end]);

  const beat = useCallback(async () => {
    if (ended.current) return;
    const { error } = await supabase.rpc('scan_phone_beat', { p_device: computerId, p_phone: phoneId });
    if (error) console.warn('scan_phone_beat failed', error);
    await check();
  }, [computerId, phoneId, check]);

  useEffect(() => {
    beat();
    const timer = setInterval(beat, BEAT_MS);
    // A locked screen or another app slows or stops the timers: beat at once on the way back.
    const onVisible = () => {
      if (document.visibilityState === 'visible') beat();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [beat, epoch]);

  // The computer's session changing (its user, its list, a phone pairing, its end).
  useEffect(() => {
    const channel = supabase
      .channel(channelName('scan-pairing', computerId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scan_sessions' }, (payload) => {
        if ((payload.new?.device_id ?? payload.old?.device_id) === computerId) check();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [computerId, check]);

  /** The phone's Unpair: back to the landing page. */
  const unpair = useCallback(async () => {
    const { error } = await supabase.rpc('scan_unpair', { p_device: computerId, p_phone: phoneId });
    if (error && error.message !== 'session_gone') console.warn('scan_unpair failed', error);
    end(null);
  }, [computerId, phoneId, end]);

  return { session, check, unpair };
}

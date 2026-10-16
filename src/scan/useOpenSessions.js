import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useConnection } from '../state/connection.jsx';
import { channelName } from '../lib/channels.js';

// The landing page's list (docs/SCAN_FUNCTION.md 5.2): every computer with a
// price screen open, as scan_sessions_open gives them. Read again whenever a
// session changes anywhere, and every 15 seconds besides, since a session
// going stale (a closed laptop) changes nothing in the table.

const RELOAD_MS = 15_000;

/** @returns {{ rows: object[], loaded: boolean, error: string|null, reload: () => Promise<void> }} */
export function useOpenSessions() {
  const { epoch } = useConnection();
  const [state, setState] = useState({ rows: [], loaded: false, error: null });

  const reload = useCallback(async () => {
    const { data, error } = await supabase.rpc('scan_sessions_open');
    if (error) {
      console.warn('scan_sessions_open failed', error);
      setState((s) => ({ ...s, loaded: true, error: error.message }));
    } else {
      setState({ rows: data ?? [], loaded: true, error: null });
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload, epoch]);

  useEffect(() => {
    const channel = supabase
      .channel(channelName('scan-sessions'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scan_sessions' }, () => reload())
      .subscribe();
    const timer = setInterval(reload, RELOAD_MS);
    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [reload]);

  return { ...state, reload };
}

/**
 * Can a phone pair with this session, and if not, why not (5.2)? A computer
 * with Magic off, or whose list is locked, is listed greyed with the reason;
 * one with no user picked can be paired (its phone waits for a pick).
 * @returns {string|null} why not, or null
 */
export function whyNotPairable(row) {
  if (!(row.games ?? []).includes('mtg')) return 'On Pokémon: switch it to Magic first';
  if (row.locked) return row.locked;
  return null;
}

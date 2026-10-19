import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase.js';
import { useConnection } from '../state/connection.jsx';
import { channelName } from './channels.js';

// A load that failed is asked again after these waits, the last one repeating (decision 364).
export const RETRY_MS = [2_000, 5_000, 10_000, 20_000, 30_000];

/**
 * Load a query and reload it whenever its table changes on any computer
 * (Supabase Realtime), and again after the connection comes back.
 * The tables this is used for are small, so a change reloads the whole query.
 *
 * A first load that fails isn't `loaded` (decision 364): read as loaded, its missing data
 * showed as empty or as good news (Home's "Everything's exported", no staff to pick, a
 * Master Crystal Inventory banner). Any failed load is asked again (RETRY_MS) until one
 * works; a later failure keeps the data it had.
 *
 * @param {string} table  public table to watch
 * @param {() => PromiseLike<{ data: any, error: any }>} query
 * @returns {{ data: any, error: any, loaded: boolean, reload: () => Promise<void> }}
 */
export function useLiveTable(table, query) {
  const { epoch } = useConnection();
  const [state, setState] = useState({ data: null, error: null, loaded: false });
  const queryRef = useRef(query);
  queryRef.current = query;
  const latest = useRef(0);
  const retry = useRef(null);
  const failures = useRef(0);
  const mounted = useRef(true);
  const reloadRef = useRef(null);

  const reload = useCallback(async () => {
    const ticket = ++latest.current;
    clearTimeout(retry.current);
    const { data, error } = await queryRef.current();
    if (ticket !== latest.current || !mounted.current) return;   // a newer reload won, or it's gone
    if (error) {
      console.error(`Loading ${table} failed`, error);
      setState((s) => ({ ...s, error }));
      const wait = RETRY_MS[Math.min(failures.current, RETRY_MS.length - 1)];
      failures.current += 1;
      retry.current = setTimeout(() => reloadRef.current?.(), wait);
    } else {
      failures.current = 0;
      setState({ data, error: null, loaded: true });
    }
  }, [table]);
  reloadRef.current = reload;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(retry.current);
    };
  }, []);

  useEffect(() => {
    reload();
  }, [reload, epoch]);

  useEffect(() => {
    const channel = supabase
      .channel(channelName('live', table))
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => reload())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, reload]);

  return { ...state, reload };
}

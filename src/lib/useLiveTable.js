import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase.js';
import { useConnection } from '../state/connection.jsx';

let channelSeq = 0;

/**
 * Load a query and reload it whenever its table changes on any computer
 * (Supabase Realtime), and again after the connection comes back.
 * The tables this is used for are small, so a change reloads the whole query.
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

  const reload = useCallback(async () => {
    const ticket = ++latest.current;
    const { data, error } = await queryRef.current();
    if (ticket !== latest.current) return;          // a newer reload won
    if (error) {
      console.error(`Loading ${table} failed`, error);
      setState((s) => ({ ...s, error, loaded: true }));
    } else {
      setState({ data, error: null, loaded: true });
    }
  }, [table]);

  useEffect(() => {
    reload();
  }, [reload, epoch]);

  useEffect(() => {
    const channel = supabase
      .channel(`live:${table}:${++channelSeq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => reload())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, reload]);

  return { ...state, reload };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { channelName } from '../lib/channels.js';
import { useConnection } from '../state/connection.jsx';
import { isTimeout, withTimeout } from '../lib/timeout.js';

// This phone's scans into the paired computer (docs/SCAN_FUNCTION.md 9.2):
// sending one, watching what became of each, and answering one that needs a
// price. Read again when one changes (Realtime), and every 4 seconds while
// one is still waiting on the computer, in case a message is missed.

const WAITING = new Set(['sent', 'pricing', 'undo', 'undoing']);
const POLL_MS = 4_000;
// A write with no answer by then is given up (owner, 2026-10-18: a slow network left the phone
// waiting for good): `timeout`, which the scanner says as "check the computer's list". A round
// trip to the database took 0.17 s at worst (2026-10-18); 5 s leaves room for the write itself.
const WRITE_MS = 5_000;
const SLOW = 'no answer in time: the connection may be slow';
// A send with no answer is tried this many times in all, with the same scan id.
const SEND_TRIES = 3;

/** A new id for a scan (crypto.randomUUID needs a secure page; the scan page always is, the fallback is for tests). */
function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const b = globalThis.crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** A write through a database function, or { error: { message: 'timeout' } } when it took too long. */
async function call(fn, args) {
  try {
    return await withTimeout(supabase.rpc(fn, args), WRITE_MS);
  } catch (e) {
    if (isTimeout(e)) return { data: null, error: { message: 'timeout' } };
    throw e;
  }
}

/**
 * @returns {{ scans: object[], send: (scan: object) => Promise<{ id?: string, error?: string }>,
 *   answer: (id: string, price: number|null) => Promise<string|null>, undo: (id: string) => Promise<string|null>,
 *   reload: () => Promise<void> }}
 *   scans: this pairing's latest ten, newest first
 */
export function useScans(computerId, phoneId) {
  const { epoch } = useConnection();
  const [scans, setScans] = useState([]);
  const ticket = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++ticket.current;
    const { data, error } = await supabase
      .from('scans')
      .select('*')
      .eq('phone_device_id', phoneId)
      .eq('session_device_id', computerId)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error || mine !== ticket.current) return;
    setScans(data ?? []);
  }, [computerId, phoneId]);

  useEffect(() => {
    reload();
  }, [reload, epoch]);

  useEffect(() => {
    const channel = supabase
      .channel(channelName('scans-out', phoneId))
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'scans', filter: `phone_device_id=eq.${phoneId}`,
      }, () => reload())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [phoneId, reload]);

  const waiting = scans.some((s) => WAITING.has(s.status));
  useEffect(() => {
    if (!waiting) return undefined;
    const timer = setInterval(reload, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, reload]);

  /** Send a card. Its error code when refused (cannot_add, not_paired…). */
  // The list read again after a write, but never waited on for longer than a write is.
  const settle = useCallback(() => withTimeout(reload(), WRITE_MS).catch(() => {}), [reload]);

  // Sent once (owner, 2026-10-18; decision 302): each scan carries its own id, and a send with no
  // answer in time is tried again with the same one, so a send that landed after all isn't saved
  // twice (scan_send returns the scan it has). After SEND_TRIES, `timeout`.
  const send = useCallback(async (scan) => {
    const p_scan = { ...scan, client_id: scan.client_id ?? newId() };
    let result;
    for (let tries = 0; tries < SEND_TRIES; tries++) {
      result = await call('scan_send', { p_device: computerId, p_phone: phoneId, p_scan });
      if (result.error?.message !== 'timeout') break;
    }
    await settle();
    return result.error ? { error: result.error.message } : { id: result.data };
  }, [computerId, phoneId, settle]);

  /** A price for a scan that needs one, or null to skip it. An error message, or null. */
  const answer = useCallback(async (id, price) => {
    const { error } = await call('scan_answer', { p_id: id, p_phone: phoneId, p_price: price });
    await settle();
    return error ? (error.message === 'timeout' ? SLOW : error.message) : null;
  }, [phoneId, settle]);

  /** Undo an added scan: the computer takes one copy off. An error message, or null. */
  const undo = useCallback(async (id) => {
    const { error } = await call('scan_undo', { p_id: id, p_phone: phoneId });
    await settle();
    return error ? (error.message === 'timeout' ? SLOW : error.message) : null;
  }, [phoneId, settle]);

  return { scans, send, answer, undo, reload };
}

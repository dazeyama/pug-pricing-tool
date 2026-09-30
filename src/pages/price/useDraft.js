import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useConnection } from '../../state/connection.jsx';
import { useToast } from '../../components/Toast.jsx';

// This computer's walk-in draft (spec 8.10): one per device, saved on every
// change, so a refresh or crash loses nothing. Only this device edits it, so
// there's no Realtime; it reloads after each write and when the connection
// comes back. Two tabs share it (spec 8.12): a confirm from a stale tab is
// refused ('stale_version') and reloads.

const STALE = 'This buy changed on another computer — reloaded.';

/**
 * @returns {{ buy: object|null, lines: object[], loaded: boolean, busy: boolean,
 *   add: (line: object, userId: string) => Promise<string|null>,
 *   remove: (lineId: string, qty: number, userId: string) => Promise<boolean>,
 *   setRates: (cash: number|null, credit: number|null, userId: string) => Promise<boolean>,
 *   cancel: () => Promise<boolean>,
 *   confirm: (args: object) => Promise<object|null> }}
 */
export function useDraft(deviceId) {
  const { epoch } = useConnection();
  const toast = useToast();
  const [state, setState] = useState({ buy: null, lines: [], loaded: false });
  const [busy, setBusy] = useState(false);
  const ticket = useRef(0);

  const reload = useCallback(async () => {
    if (!deviceId) {
      setState({ buy: null, lines: [], loaded: true });
      return;
    }
    const mine = ++ticket.current;
    const { data, error } = await supabase
      .from('buys')
      .select('*, buy_lines(*)')
      .eq('kind', 'walk_in')
      .eq('status', 'draft')
      .eq('draft_device_id', deviceId)
      .maybeSingle();
    if (mine !== ticket.current) return;
    if (error) {
      console.error('Loading the buy list failed', error);
      toast(`Couldn't load the buy list: ${error.message}`, 'err');
      setState((s) => ({ ...s, loaded: true }));
      return;
    }
    const lines = [...(data?.buy_lines ?? [])].sort((a, b) => a.position - b.position);
    setState({ buy: data ? { ...data, buy_lines: undefined } : null, lines, loaded: true });
  }, [deviceId, toast]);

  useEffect(() => {
    reload();
  }, [reload, epoch]);

  /** Run one write function; errors become a toast. */
  const run = useCallback(async (fn, args, failure) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc(fn, args);
      if (error) {
        if (/stale_version/.test(error.message)) toast(STALE, 'err');
        else {
          console.error(`${fn} failed`, error);
          toast(`${failure}: ${error.message}`, 'err');
        }
        await reload();
        return { ok: false };
      }
      await reload();
      return { ok: true, data };
    } finally {
      setBusy(false);
    }
  }, [reload, toast]);

  const add = useCallback(async (line, userId) => {
    const r = await run('draft_add_line', { p_device: deviceId, p_line: line, p_user: userId, p_merge: true },
      "Couldn't add the card");
    return r.ok ? r.data : null;
  }, [deviceId, run]);

  const remove = useCallback(async (lineId, qty, userId) =>
    (await run('draft_remove_line', { p_line_id: lineId, p_qty: qty, p_user: userId }, "Couldn't remove the card")).ok,
  [run]);

  const setRates = useCallback(async (cash, credit, userId) =>
    (await run('draft_set_custom_rates', { p_device: deviceId, p_cash: cash, p_credit: credit, p_user: userId },
      "Couldn't save the rate")).ok,
  [deviceId, run]);

  const cancel = useCallback(async () => {
    if (!state.buy) return true;
    return (await run('draft_cancel', { p_buy_id: state.buy.id }, "Couldn't cancel the buy")).ok;
  }, [run, state.buy]);

  /** @returns {Promise<{ number: number, games: string[], target_name: string }|null>} */
  const confirm = useCallback(async ({ userId, customerName, notes, cashPct, creditPct, lineTexts }) => {
    if (!state.buy) return null;
    const r = await run('confirm_buy', {
      p_buy_id: state.buy.id,
      p_user: userId,
      p_customer_name: customerName,
      p_notes: notes,
      p_cash_pct: cashPct,
      p_credit_pct: creditPct,
      p_expected_version: state.buy.version,
      p_line_texts: lineTexts,
    }, "Couldn't confirm the buy");
    return r.ok ? r.data : null;
  }, [run, state.buy]);

  return { ...state, busy, add, remove, setRates, cancel, confirm };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useConnection } from '../../state/connection.jsx';
import { useToast } from '../../components/Toast.jsx';
import { DB_MESSAGES, dbErrorCode, knownCode } from '../../lib/dbErrors.js';

// This computer's walk-in draft (spec 8.10): one per device, saved on every
// change, so a refresh or crash loses nothing. Only this device edits it, so
// there's no Realtime; it reloads after each write and when the connection
// comes back. Two tabs share it (spec 8.12): a confirm from a stale tab is
// refused ('stale_version') and reloads.

const STALE = 'This buy changed on another computer — reloaded.';
// CONFIRM BUY's refusals (migration 0020), should the dialog's own checks be bypassed.
const CODES = {
  ...DB_MESSAGES,
  bad_phone: 'Enter a 10-digit phone number.',
  paid_price_needed: 'Enter the purchase price.',
  paid_method_needed: 'Choose Cash or Credit.',
  // A phone's scan for a buy that's been confirmed or cancelled meanwhile (decision 350).
  draft_gone: 'the buy it was scanned for is finished. Scan it again for this one.',
};

/**
 * @returns {{ buy: object|null, lines: object[], loaded: boolean, busy: boolean,
 *   add: (line: object, userId: string, draftId?: string|null) => Promise<string|null>,
 *   update: (lineId: string, line: object, userId: string) => Promise<string|null>,
 *   remove: (lineId: string, qty: number, userId: string) => Promise<boolean>,
 *   setRates: (cash: number|null, credit: number|null, userId: string) => Promise<boolean>,
 *   setLineRate: (lineId: string, cash: number|null, credit: number|null, userId: string) => Promise<boolean>,
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

  /**
   * Run one write function; errors become a toast. `recover(error)`, if given, may find that the
   * write saved after all (its answer lost): its result is then the answer, and no error is shown.
   */
  const run = useCallback(async (fn, args, failure, recover = null) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc(fn, args);
      const saved = error && recover ? await recover(error).catch(() => null) : null;
      if (saved) {
        await reload();
        return { ok: true, data: saved };
      }
      if (error) {
        const code = knownCode(error, CODES);
        if (dbErrorCode(error) === 'stale_version') toast(STALE, 'err');
        else if (code) toast(`${failure}: ${CODES[code]}`, 'err');
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

  // draftId: a phone's scan goes into the buy it was scanned for, or nowhere (decision 350).
  const add = useCallback(async (line, userId, draftId = null) => {
    const r = await run('draft_add_line', {
      p_device: deviceId, p_line: line, p_user: userId, p_merge: true, ...(draftId ? { p_draft_id: draftId } : {}),
    }, "Couldn't add the card");
    return r.ok ? r.data : null;
  }, [deviceId, run]);

  /** Save an edited line over the old one; returns the line's id (another's, if they merged). */
  const update = useCallback(async (lineId, line, userId) => {
    const r = await run('draft_update_line', { p_line_id: lineId, p_line: line, p_user: userId },
      "Couldn't save the changes");
    return r.ok ? r.data : null;
  }, [run]);

  const remove = useCallback(async (lineId, qty, userId) =>
    (await run('draft_remove_line', { p_line_id: lineId, p_qty: qty, p_user: userId }, "Couldn't remove the card")).ok,
  [run]);

  const setRates = useCallback(async (cash, credit, userId) =>
    (await run('draft_set_custom_rates', { p_device: deviceId, p_cash: cash, p_credit: credit, p_user: userId },
      "Couldn't save the rate")).ok,
  [deviceId, run]);

  /** Set Rate (docs/TEAM_FEEDBACK.md 4.3): a card's own rates, either null (cleared). */
  const setLineRate = useCallback(async (lineId, cash, credit, userId) =>
    (await run('draft_set_line_rate', { p_line_id: lineId, p_cash: cash, p_credit: credit, p_user: userId },
      "Couldn't save the card's rate")).ok,
  [run]);

  const cancel = useCallback(async () => {
    if (!state.buy) return true;
    return (await run('draft_cancel', { p_buy_id: state.buy.id }, "Couldn't cancel the buy")).ok;
  }, [run, state.buy]);

  /** @returns {Promise<{ number: number, games: string[], target_name: string }|null>} */
  const confirm = useCallback(async ({
    userId, customerName, phone, notes, paidPrice, paidMethod, cashPct, creditPct, lineTexts,
  }) => {
    if (!state.buy) return null;
    const buyId = state.buy.id;
    // No answer, or a retry refused because the first one saved: the buy, read back, says whether
    // it was confirmed, so BUY COMPLETE and its 🚩 still happen (decision 363).
    const recover = (error) => (!knownCode(error, CODES) || dbErrorCode(error) === 'stale_version'
      ? confirmedBuy(buyId, userId) : Promise.resolve(null));
    const r = await run('confirm_buy', {
      p_buy_id: buyId,
      p_user: userId,
      p_customer_name: customerName,
      p_phone: phone || null,
      p_notes: notes,
      p_cash_pct: cashPct,
      p_credit_pct: creditPct,
      p_expected_version: state.buy.version,
      p_paid_price: paidPrice,
      p_paid_method: paidMethod,
      p_line_texts: lineTexts,
    }, "Couldn't confirm the buy", recover);
    return r.ok ? r.data : null;
  }, [run, state.buy]);

  return { ...state, busy, add, update, remove, setRates, setLineRate, cancel, confirm };
}

/**
 * CONFIRM BUY's answer, read back from the buy when the real one was lost (decision 363): null
 * unless this user confirmed it. Magic before Pokémon, as confirm_buy lists the games.
 * @returns {Promise<{ number: number, games: string[], target_name: null }|null>}
 */
async function confirmedBuy(buyId, userId) {
  const { data, error } = await supabase.from('buys')
    .select('status, number, confirmed_by, buy_lines(game)').eq('id', buyId).maybeSingle();
  if (error || !data || data.status === 'draft' || data.confirmed_by !== userId || data.number == null) return null;
  const games = [...new Set(data.buy_lines.map((l) => l.game))]
    .sort((a, b) => Number(a === 'pokemon') - Number(b === 'pokemon') || a.localeCompare(b));
  return { number: data.number, games, target_name: null };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useConnection } from '../../state/connection.jsx';
import { useToast } from '../../components/Toast.jsx';
import { DB_MESSAGES, dbErrorCode, knownCode } from '../../lib/dbErrors.js';
import { readBack } from './confirmReadBack.js';
import { SECOND_LOOK_MS, pause } from '../../lib/timeout.js';
import { DONE_ONCE, createRequests, requestKey } from '../../lib/requests.js';
import { uuid } from '../../lib/uuid.js';

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
  // A CONFIRM BUY whose answer was lost and couldn't be checked (decision 367): the next press checks it.
  const unsure = useRef(null);

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
        return { ok: false, error };
      }
      await reload();
      return { ok: true, data };
    } finally {
      setBusy(false);
    }
  }, [reload, toast]);

  /**
   * A write a press can repeat (decision 388): sent with a request id, the lost one's when it's
   * pressed again after a lost answer, so it happens once. `fixedId`: the caller's own (a phone's
   * Undo sends its scan's).
   */
  const [requests] = useState(() => createRequests());
  const runOnce = useCallback(async (fn, args, failure, fixedId = null) => {
    const key = requestKey(fn, args);
    const { id: requestId, again } = fixedId ? { id: fixedId, again: false } : requests.idFor(key);
    const r = await run(fn, { ...args, p_request: requestId }, failure);
    if (!fixedId) requests.settle(key, requestId, r.ok ? null : r.error);
    if (again && r.ok) toast(DONE_ONCE, 'ok');
    return r;
  }, [run, requests, toast]);

  // draftId: a phone's scan goes into the buy it was scanned for, or nowhere (decision 350).
  // A scan's add has its own id: lineOfScan already keeps it from going in twice, and it never
  // takes or clears staff's lost one.
  const add = useCallback(async (line, userId, draftId = null) => {
    const r = await runOnce('draft_add_line', {
      p_device: deviceId, p_line: line, p_user: userId, p_merge: true, ...(draftId ? { p_draft_id: draftId } : {}),
    }, "Couldn't add the card", line.price_snapshot?.scan ? uuid() : null);
    return r.ok ? r.data : null;
  }, [deviceId, runOnce]);

  /** Save an edited line over the old one; returns the line's id (another's, if they merged). */
  const update = useCallback(async (lineId, line, userId) => {
    const r = await run('draft_update_line', { p_line_id: lineId, p_line: line, p_user: userId },
      "Couldn't save the changes");
    return r.ok ? r.data : null;
  }, [run]);

  /**
   * `requestId`: the phone's Undo sends its scan's id, so it takes one copy off once (decision 392).
   * Returns true, false (refused), or null when the answer was lost: it may have gone through.
   */
  const remove = useCallback(async (lineId, qty, userId, requestId = null) => {
    const r = await runOnce('draft_remove_line', { p_line_id: lineId, p_qty: qty, p_user: userId },
      "Couldn't remove the card", requestId);
    return r.ok ? true : dbErrorCode(r.error) ? false : null;
  }, [runOnce]);

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
    // A phone's scan can open this computer's buy before the computer has loaded it, and when
    // that scan never adds, the buy is only in the database: it's cancelled too, failing its
    // scans so the phone says so (decision 395).
    // Only an empty one: a buy with cards (another tab's, or one this screen failed to load) is
    // loaded instead, never thrown away unseen.
    let buyId = state.buy?.id ?? null;
    if (!buyId && deviceId) {
      const { data, error } = await supabase.from('buys').select('id, buy_lines(id)')
        .eq('kind', 'walk_in').eq('status', 'draft').eq('draft_device_id', deviceId).maybeSingle();
      if (error) {
        toast(`Couldn't cancel the buy: ${error.message}`, 'err');
        return false;
      }
      if (data?.buy_lines?.length) {
        await reload();
        toast("This computer has a buy with cards in it (from another tab): it's shown now. CANCEL again to discard it.", 'warn');
        return false;
      }
      buyId = data?.id ?? null;
    }
    if (!buyId) return true;
    return (await run('draft_cancel', { p_buy_id: buyId }, "Couldn't cancel the buy")).ok;
  }, [run, reload, state.buy, deviceId, toast]);

  /**
   * CONFIRM BUY. Its answer, plus the buy it confirmed, its cards, what was sent and its 🚩 box: a
   * press after a lost answer may report an earlier press's confirm (decisions 367, 374).
   * @returns {Promise<{ number: number, games: string[], target_name: string|null, buyId: string,
   *   lines: object[], sent: object, flagCondition: boolean }|null>}
   */
  const confirm = useCallback(async ({
    userId, customerName, phone, notes, paidPrice, paidMethod, cashPct, creditPct, lineTexts, flagCondition = false,
  }) => {
    // The last press lost its answer and couldn't tell, and its draft has gone from this screen
    // since (decision 367): this press finds out what happened to it, busy meanwhile (decision 374).
    const last = unsure.current;
    if (last && last.buyId !== state.buy?.id) {
      setBusy(true);
      try {
        let got = null;
        try {
          got = readBack(await readBuy(last.buyId), last);
        } catch {
          // Still no connection: said below.
        }
        if (!got) {
          toast("Couldn't tell whether the buy was confirmed: check the connection, then press Confirm buy again.", 'err');
          return null;
        }
        unsure.current = null;
        if (got.state === 'mine') {
          return { ...got.result, buyId: last.buyId, lines: last.lines, sent: last.sent, flagCondition: last.flagCondition };
        }
        if (got.state === 'draft') {
          await reload();
          toast("It wasn't confirmed: the buy is still open. Press Confirm buy again.", 'err');
        } else {
          toast('This buy was finished on another tab or computer, not by this Confirm: nothing was confirmed here. Close this and look at the day page.', 'err');
        }
        return null;
      } finally {
        setBusy(false);
      }
    }
    if (!state.buy) {
      toast("There's no buy here to confirm: it was confirmed or cancelled on another tab or computer.", 'err');
      return null;
    }
    const attempt = {
      buyId: state.buy.id, userId, lines: state.lines, sent: { customerName, phone, notes, paidPrice, paidMethod },
      flagCondition: Boolean(flagCondition),
    };
    // No answer, or a retry refused because the first one saved: the buy, read back, says whether
    // this tab's confirm went through, so BUY COMPLETE and its 🚩 still happen (decisions 363, 367).
    let known = false;
    let matched = attempt;
    const recover = async (error) => {
      if (knownCode(error, CODES) && dbErrorCode(error) !== 'stale_version') {
        known = true;   // a refusal: nothing was saved
        return null;
      }
      let saved = await readBuy(attempt.buyId);   // a failed read leaves it unknown
      // No answer at all, and still a draft: the confirm may still be running. Looked at once more
      // (decision 371); pressing again is safe, as a buy can't be confirmed twice.
      if (!dbErrorCode(error) && saved?.status === 'draft') {
        await pause(SECOND_LOOK_MS);
        saved = await readBuy(attempt.buyId);
      }
      known = true;
      // This press, or the earlier one whose answer was lost: the dialog may have changed since.
      const mine = [attempt, last].filter((x) => x?.buyId === attempt.buyId)
        .map((a) => ({ a, got: readBack(saved, a) })).filter((m) => m.got.state === 'mine');
      if (!mine.length) return null;
      // Both match when only the 🚩 box changed between them, and which one went through can't be
      // told: either one's 🚩 counts (decision 374).
      matched = { ...mine[0].a, flagCondition: mine.some((m) => m.a.flagCondition) };
      return mine[0].got.result;
    };
    unsure.current = null;
    const r = await run('confirm_buy', {
      p_buy_id: attempt.buyId,
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
    if (r.ok) {
      return { ...r.data, buyId: matched.buyId, lines: matched.lines, sent: matched.sent, flagCondition: matched.flagCondition };
    }
    if (!known) {
      unsure.current = attempt;
      toast('Its answer was lost: it may have gone through. Press Confirm buy again to find out.', 'warn');
    }
    return null;
  }, [run, reload, state.buy, state.lines, toast]);

  // A lost answer waiting for the next press to check it (decision 367): CONFIRM BUY stays open for that press.
  const answerLost = useCallback(() => Boolean(unsure.current), []);

  return { ...state, busy, add, update, remove, setRates, setLineRate, cancel, confirm, answerLost };
}

/** The buy, read back for CONFIRM BUY's lost answer (readBack); throws when it can't be read. */
async function readBuy(buyId) {
  const { data, error } = await supabase.from('buys')
    .select('status, number, confirmed_by, customer_name, phone, notes, paid_price, paid_method, buy_lines(id, game, quantity)')
    .eq('id', buyId).maybeSingle();
  if (error) throw error;
  return data;
}

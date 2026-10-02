import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { lineText } from '../../lib/lineFormat.js';
import { useConnection } from '../../state/connection.jsx';
import { useToast } from '../../components/Toast.jsx';

// One collection and its lines (spec 9.4), kept live through Realtime: every
// write bumps the collection's row, so watching `buys` catches added and
// removed cards too (a view-only computer sees them arrive). Writes go
// through the collection functions (migration 0008) with this computer's ID
// and the version last read.

/** What the database's refusals mean to the person at the counter. */
const MESSAGES = {
  stale_version: 'This collection changed on another computer — reloaded.',
  not_lock_holder: 'Another computer is editing this collection now. Take over to edit.',
  collection_paid: 'This collection is Paid/Ours: unlock it to add or edit cards.',
  collection_completed: 'This collection is Completed: reopen it to edit.',
  offer_needed: 'Set an offer to mark it Priced.',
  paid_price_needed: 'Set the final purchase price to mark it Paid/Ours.',
  paid_method_needed: 'Choose Cash or Credit to mark it Paid/Ours.',
  complete_after_paid: 'Only a Paid/Ours collection can be marked Completed.',
  complete_by_export: 'EXPORT marks a collection Completed: it can’t be set by hand.',
  project_status: 'A project is only ever Paid/Ours, until EXPORT marks it Completed.',
  collection_gone: 'This collection was deleted.',
  line_gone: 'That card was already removed.',
  locked_elsewhere: 'Another computer is editing this collection: take over first.',
  name_mismatch: "The name you typed doesn't match.",
  bad_name: 'The name must be 1 to 80 characters.',
  bad_phone: 'Enter a 10-digit US phone number.',
  bad_last4: 'The Last 4 ID is up to 4 letters or digits.',
  bad_pct: 'Enter a percentage from 0 to 100.',
  no_user: 'Pick a user first.',
};

/** The code in a function's error ("not_lock_holder"), or null. */
export function errorCode(error) {
  return Object.keys(MESSAGES).find((code) => error?.message?.includes(code)) ?? null;
}

/** A toast-ready sentence for a failed collection write. */
export function errorMessage(error, failure) {
  const code = errorCode(error);
  return code ? MESSAGES[code] : `${failure}: ${error.message}`;
}

/**
 * @param {string} id  the collection (a buys row, kind 'collection')
 * @param {{ deviceId: string, onLockLost?: () => void }} opts
 */
export function useCollection(id, { deviceId, onLockLost }) {
  const { epoch } = useConnection();
  const toast = useToast();
  const [state, setState] = useState({ buy: null, lines: [], loaded: false, missing: false });
  const [busy, setBusy] = useState(false);
  const ticket = useRef(0);
  const version = useRef(null);
  const lost = useRef(onLockLost);
  lost.current = onLockLost;

  const reload = useCallback(async () => {
    const mine = ++ticket.current;
    const { data, error } = await supabase
      .from('buys')
      .select('*, buy_lines(*)')
      .eq('id', id)
      .eq('kind', 'collection')
      .maybeSingle();
    if (mine !== ticket.current) return;
    if (error) {
      // A malformed ID is simply not a collection.
      if (error.code === '22P02') {
        setState({ buy: null, lines: [], loaded: true, missing: true });
        return;
      }
      console.error('Loading the collection failed', error);
      toast(`Couldn't load the collection: ${error.message}`, 'err');
      setState((s) => ({ ...s, loaded: true }));
      return;
    }
    if (!data) {
      setState({ buy: null, lines: [], loaded: true, missing: true });
      return;
    }
    const lines = [...(data.buy_lines ?? [])].sort((a, b) => a.position - b.position);
    version.current = data.version;
    setState({ buy: { ...data, buy_lines: undefined }, lines, loaded: true, missing: false });
  }, [id, toast]);

  useEffect(() => {
    reload();
  }, [reload, epoch]);

  // Any change to this collection's row (every write bumps it), or its deletion.
  useEffect(() => {
    const channel = supabase
      .channel(`collection:${id}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'buys' }, (payload) => {
        if ((payload.new?.id ?? payload.old?.id) === id) reload();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, reload]);

  /** Run one write function; a refusal becomes a toast and a reload. */
  const run = useCallback(async (fn, args, failure) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc(fn, args);
      if (error) {
        if (!errorCode(error)) console.error(`${fn} failed`, error);
        toast(errorMessage(error, failure), 'err');
        if (errorCode(error) === 'not_lock_holder') lost.current?.();
        await reload();
        return { ok: false, error };
      }
      await reload();
      return { ok: true, data };
    } finally {
      setBusy(false);
    }
  }, [reload, toast]);

  const mine = (userId) => ({ p_user: userId, p_device: deviceId, p_expected_version: version.current });

  const add = useCallback(async (line, userId) => {
    const r = await run('collection_add_line', {
      p_buy_id: id, p_line: line, p_merge: true, ...mine(userId), p_text: lineText(line),
    }, "Couldn't add the card");
    return r.ok ? r.data : null;
  }, [id, run, deviceId]);

  const update = useCallback(async (old, line, userId) => {
    const r = await run('collection_update_line', {
      p_line_id: old.id, p_line: line, ...mine(userId), p_old_text: lineText(old), p_new_text: lineText(line),
    }, "Couldn't save the edit");
    return r.ok ? r.data : null;
  }, [run, deviceId]);

  const remove = useCallback(async (line, qty, userId) => {
    const r = await run('collection_remove_line', {
      p_line_id: line.id, p_qty: qty, ...mine(userId), p_text: lineText(line, Math.min(qty, line.quantity)),
    }, "Couldn't remove the card");
    return r.ok;
  }, [run, deviceId]);

  /** Name, phone, notes, custom rates: only the fields given. */
  const updateInfo = useCallback(async (fields, userId) => {
    const r = await run('collection_update_info', { p_buy_id: id, p_fields: fields, ...mine(userId) },
      "Couldn't save the change");
    return r.ok;
  }, [id, run, deviceId]);

  const setRates = useCallback((cash, credit, userId) => updateInfo(
    { custom_cash_pct: cash, custom_credit_pct: credit }, userId,
  ), [updateInfo]);

  /**
   * Processing / Priced / Paid/Ours / Completed; `master` is the rates the
   * screen shows. `deal`: the offer for Priced ({ offerCash, offerCredit }),
   * the final price for Paid/Ours ({ paidPrice, paidMethod }).
   */
  const setStatus = useCallback(async (status, userId, master, deal = {}) => {
    const r = await run('collection_set_status', {
      p_buy_id: id,
      p_status: status,
      p_cash_pct: master.cash,
      p_credit_pct: master.credit,
      ...mine(userId),
      p_offer_cash: deal.offerCash ?? null,
      p_offer_credit: deal.offerCredit ?? null,
      p_paid_price: deal.paidPrice ?? null,
      p_paid_method: deal.paidMethod ?? null,
    }, "Couldn't change the status");
    return r.ok;
  }, [id, run, deviceId]);

  /** REPRICE?: today's buy prices for many lines at once (reprice.js); { lines, before, after } or null. */
  const reprice = useCallback(async (updates, userId) => {
    const r = await run('collection_reprice', { p_buy_id: id, p_lines: updates, ...mine(userId) },
      "Couldn't reprice the collection");
    return r.ok ? r.data : null;
  }, [id, run, deviceId]);

  /** Delete forever (spec 9.7); the server checks the typed name. */
  const destroy = useCallback(async (typedName, userId) => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc('collection_delete', {
        p_buy_id: id,
        p_user: userId,
        p_device: deviceId,
        p_typed_name: typedName,
        p_line_texts: Object.fromEntries(state.lines.map((l) => [l.id, lineText(l)])),
      });
      if (error) {
        if (!errorCode(error)) console.error('collection_delete failed', error);
        toast(errorMessage(error, "Couldn't delete the collection"), 'err');
        return false;
      }
      return true;
    } finally {
      setBusy(false);
    }
  }, [id, deviceId, state.lines, toast]);

  return { ...state, busy, reload, add, update, remove, updateInfo, setRates, setStatus, reprice, destroy };
}

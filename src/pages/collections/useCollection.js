import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { lineText } from '../../lib/lineFormat.js';
import { useConnection } from '../../state/connection.jsx';
import { useToast } from '../../components/Toast.jsx';
import { DB_MESSAGES, dbErrorCode, dbMessage, knownCode } from '../../lib/dbErrors.js';
import { channelName } from '../../lib/channels.js';
import { DONE_ONCE, createRequests, requestKey } from '../../lib/requests.js';
import { uuid } from '../../lib/uuid.js';

// One collection and its lines (spec 9.4), kept live through Realtime: every
// write bumps the collection's row, so watching `buys` catches added and
// removed cards too (a view-only computer sees them arrive). Writes go
// through the collection functions (migration 0008) with this computer's ID
// and the version last read.

/** What the database's refusals mean to the person at the counter. */
/**
 * Convert to buy… on a project with exported cards (decision 339): its day would export them again. Undo
 * export doesn't take back a file already uploaded (decision 298), so it says when that's safe.
 */
/** A card that's exported or in Can't upload cards is frozen (decision 345): only Undo export changes it. */
export const LINE_EXPORTED = "That card is exported: Undo export… first to change it.";
/** One with a copy in Can't upload cards wasn't exported: said so (decision 399). */
export const LINE_CANT_UPLOAD = "That card is in Can't upload cards: Undo export… first to change it.";
/**
 * The number of the buy that kept this project's or collection's payment (decision 397), or
 * null: there's none, or that buy is gone since, its payment with it.
 * @param {string|null|undefined} keptBuyId  the collection's `kept_buy_id`
 * @returns {number|null}
 */
export function useKeptBuy(keptBuyId) {
  const [number, setNumber] = useState(null);
  useEffect(() => {
    setNumber(null);
    if (!keptBuyId) return undefined;
    let live = true;
    supabase.from('buys').select('number').eq('id', keptBuyId).eq('status', 'confirmed').maybeSingle()
      .then(({ data }) => {
        if (live) setNumber(data?.number ?? null);
      });
    return () => {
      live = false;
    };
  }, [keptBuyId]);
  return number;
}

/** One pulled from an Export MTG csv (>…) as bulk (decisions 406, 416). */
export const LINE_PULLED = "That card was pulled from an export as bulk: Undo export… first to change it.";
/** The Pulled chip's tooltip (decision 406): bulk at the Export rates for bulk of the day (decision 416). */
export const PULLED_TIP = "Bulk at the export: pulled from the upload. It's in Bulk pulled from exports.";

/** Why a stamped card can't change, in its own words (decisions 345, 399, 406). */
export const frozenNote = (line) => ({ cant_upload: LINE_CANT_UPLOAD, pulled: LINE_PULLED }[line.cc_status] ?? LINE_EXPORTED);

export const PROJECT_EXPORTED = "Part of this project is exported: Undo export… first, only if its file wasn't uploaded to Crystal Commerce.";
/** Convert to buy with cards added while Skip pricing was on (decision 513): a buy is never unpriced. */
// REPRICE? keeps a card that has no price today as it is: an edit gives it one by hand.
export const UNPRICED_CONVERT = 'Some cards here have no price: turn Skip pricing off and REPRICE? first (a card with no price today: click it to price it)';

const MESSAGES = {
  ...DB_MESSAGES,
  stale_version: 'This collection changed on another computer — reloaded.',
  not_lock_holder: 'Another computer is editing this collection now. Take over to edit.',
  collection_paid: 'This collection is Paid/Ours: unlock it to add or edit cards.',
  collection_completed: 'This collection is Completed: reopen it to edit.',
  collection_rejected: 'This collection is Rejected: reopen it to edit.',
  reject_from: 'Only a Processing or Priced collection can be Rejected.',
  rejected_reopen: 'A Rejected collection reopens to Processing or Priced.',
  offer_needed: 'Set an offer to mark it Priced.',
  paid_price_needed: 'Set the final purchase price to mark it Paid/Ours.',
  paid_method_needed: 'Choose Cash or Credit to mark it Paid/Ours.',
  complete_from_paid: 'Mark it Paid/Ours first: Completed comes after.',
  project_status: 'A project is only ever Paid/Ours or Completed.',
  // Undo export… (owner, 2026-10-18; decision 298).
  nothing_to_undo: 'Nothing here is exported.',
  collection_gone: 'This collection was deleted.',
  locked_elsewhere: 'Another computer is editing this collection: take over first.',
  name_mismatch: "The name you typed doesn't match.",
  bad_name: 'The name must be 1 to 80 characters.',
  bad_phone: 'Enter a 10-digit US phone number.',
  bad_last4: 'The Last 4 ID is up to 4 letters or digits.',
  line_completed: "That card is Completed: its rate doesn't change.",
  // Struck cards (owner, 2026-10-16).
  line_struck: 'That card is struck: right-click → Restore it first.',
  // The database doesn't say which (decision 399): both.
  line_exported: "That card is exported, in Can't upload cards or pulled: Undo export… first to change it.",
  strike_paid_only: 'Only a Paid/Ours collection strikes cards: here × removes them.',
  system_collection: "A system collection (Can't upload cards, Bulk pulled from exports) doesn't strike: its × removes the card.",
  project_no_strike: "A project doesn't strike: its × removes the card.",
  project_rates: "A project has no rates of its own: it's the store's own cards.",
  // Convert to buy… (owner, 2026-10-10): a project that can't go (the name and phone CONFIRM BUY
  // asks for are DB_MESSAGES').
  project_completed: 'This project is Completed: reopen it (back to Paid/Ours) first.',
  project_exported: PROJECT_EXPORTED,
  empty_buy: 'There are no cards to convert.',
  // Skip pricing (decision 513): a project's only, and its cards with no price stay in it.
  // The database raises it wherever a card with no price would leave a project; Convert to buy stops before it.
  unpriced_cards: 'A card with no price only goes in a project: price it first.',
  bad_skip_pricing: 'Skip pricing is on or off.',
  skip_pricing_project: 'Only a project can skip pricing.',
  // Import Collection (owner, 2026-10-09).
  not_empty: 'This collection already has cards: a file can only go into an empty one.',
  nothing_to_import: 'There are no cards to import.',
  import_magic_only: 'Only Magic cards can be imported.',
  bad_import_line: 'A card in the file has no quantity or price.',
};

/** The code in a function's error ("not_lock_holder"), or null. */
export function errorCode(error) {
  return knownCode(error, MESSAGES);
}

/** A toast-ready sentence for a failed collection write. */
export function errorMessage(error, failure) {
  return dbMessage(error, failure, MESSAGES);
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
      .channel(channelName('collection', id))
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

  // Who's writing, from where, against which version (read when called, so always the latest).
  const mine = useCallback(
    (userId) => ({ p_user: userId, p_device: deviceId, p_expected_version: version.current }),
    [deviceId],
  );

  const add = useCallback(async (line, userId) => {
    // A card the paired phone scanned says so in the Changelog (owner, 2026-10-16: "sure"):
    // the line's text, then "· 📱 scanned on <the phone's name>".
    const scan = line.price_snapshot?.scan;
    const scanned = scan?.from === 'phone' ? ` · 📱 scanned on ${scan.phone ?? 'the phone'}` : '';
    // A scan's add has its own id (lineOfScan keeps it from going in twice): never staff's lost one.
    const r = await runOnce('collection_add_line', {
      p_buy_id: id, p_line: line, p_merge: true, ...mine(userId), p_text: lineText(line) + scanned,
    }, "Couldn't add the card", scan ? uuid() : null);
    return r.ok ? r.data : null;
  }, [id, runOnce, mine]);

  const update = useCallback(async (old, line, userId) => {
    const r = await run('collection_update_line', {
      p_line_id: old.id, p_line: line, ...mine(userId), p_old_text: lineText(old), p_new_text: lineText(line),
    }, "Couldn't save the edit");
    return r.ok ? r.data : null;
  }, [run, mine]);

  /**
   * `requestId`: the phone's Undo sends its scan's id, so it takes one copy off once (decision 392).
   * Returns true, false (refused), or null when the answer was lost: it may have gone through.
   */
  const remove = useCallback(async (line, qty, userId, requestId = null) => {
    const r = await runOnce('collection_remove_line', {
      p_line_id: line.id, p_qty: qty, ...mine(userId), p_text: lineText(line, Math.min(qty, line.quantity)),
    }, "Couldn't remove the card", requestId);
    return r.ok ? true : dbErrorCode(r.error) ? false : null;
  }, [runOnce, mine]);

  /** × in a Paid/Ours collection or project (owner, 2026-10-16): strike copies, kept crossed out. */
  const strike = useCallback(async (line, qty, userId) => {
    const r = await runOnce('collection_strike_line', {
      p_line_id: line.id, p_qty: qty, ...mine(userId), p_text: lineText(line, Math.min(qty, line.quantity)),
    }, "Couldn't strike the card");
    return r.ok;
  }, [runOnce, mine]);

  /** Right-click → Restore: a struck card back on the list. */
  const restore = useCallback(async (line, userId) => {
    const r = await run('collection_restore_line', {
      p_line_id: line.id, ...mine(userId), p_text: lineText(line),
    }, "Couldn't restore the card");
    return r.ok;
  }, [run, mine]);

  /** Name, phone, notes, custom rates: only the fields given. */
  const updateInfo = useCallback(async (fields, userId) => {
    const r = await run('collection_update_info', { p_buy_id: id, p_fields: fields, ...mine(userId) },
      "Couldn't save the change");
    return r.ok;
  }, [id, run, mine]);

  const setRates = useCallback((cash, credit, userId) => updateInfo(
    { custom_cash_pct: cash, custom_credit_pct: credit }, userId,
  ), [updateInfo]);

  /** Set Rate (docs/TEAM_FEEDBACK.md 4.3): a card's own rates, either null (cleared). */
  const setLineRate = useCallback(async (line, cash, credit, userId) => {
    const r = await run('collection_set_line_rate', {
      p_line_id: line.id, p_cash: cash, p_credit: credit, ...mine(userId), p_text: lineText(line),
    }, "Couldn't save the card's rate");
    return r.ok;
  }, [run, mine]);

  /**
   * Processing / Priced / Paid/Ours / Completed / Rejected; `master` is the
   * rates the screen shows. `deal`: the offer for Priced ({ offerCash,
   * offerCredit }), the final price for Paid/Ours ({ paidPrice, paidMethod }),
   * the optional reason for Rejected ({ reason }).
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
      p_reason: deal.reason ?? null,
    }, "Couldn't change the status");
    return r.ok;
  }, [id, run, mine]);

  /**
   * Undo export… (owner, 2026-10-18; decision 298): the export's stamps off
   * this collection's exported cards, their Can't-upload copies taken back;
   * the status stays. { cards, returned } or null.
   */
  const unexport = useCallback(async (userId) => {
    const r = await run('collection_unexport', { p_buy_id: id, ...mine(userId) }, "Couldn't undo the export");
    return r.ok ? r.data : null;
  }, [id, run, mine]);

  /** REPRICE?: today's buy prices for many lines at once (reprice.js); { lines, before, after } or null. */
  const reprice = useCallback(async (updates, userId) => {
    const r = await run('collection_reprice', { p_buy_id: id, p_lines: updates, ...mine(userId) },
      "Couldn't reprice the collection");
    return r.ok ? r.data : null;
  }, [id, run, mine]);

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

  /**
   * Convert to buy… (owner, 2026-10-10): every card of this project to a new
   * buy on today's page, confirmed now; the project is deleted. The new buy
   * ({ id, number, games, day }) or null.
   * @param {{ customerName: string, phone: string, notes: string, paidPrice: number, paidMethod: string }} deal
   * @param {{ cash: number, credit: number }} rates  the rates the project shows
   */
  const toBuy = useCallback(async (deal, rates, userId) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('project_to_buy', {
        p_buy_id: id,
        p_user: userId,
        p_device: deviceId,
        p_customer_name: deal.customerName,
        p_phone: deal.phone,
        p_paid_price: deal.paidPrice,
        p_paid_method: deal.paidMethod,
        p_notes: deal.notes,
        p_cash_pct: rates.cash,
        p_credit_pct: rates.credit,
        p_expected_version: version.current,
        p_line_texts: Object.fromEntries(state.lines.map((l) => [l.id, lineText(l)])),
      });
      if (error) {
        if (!errorCode(error)) console.error('project_to_buy failed', error);
        toast(errorMessage(error, "Couldn't convert the project"), 'err');
        await reload();
        return null;
      }
      // 🚩 Flag check for condition, ticked in its dialog (owner, 2026-10-14): on the new buy.
      if (deal.flagCondition && data?.id) {
        const { error: flagError } = await supabase.rpc('buy_set_condition_check', {
          p_buy_id: data.id, p_flag: true, p_user: userId, p_device: deviceId,
        });
        if (flagError) toast(`Converted, but it couldn't be flagged: ${flagError.message}`, 'warn');
        else return { ...data, flagged: true };
      }
      return data;
    } finally {
      setBusy(false);
    }
  }, [id, deviceId, state.lines, toast, reload]);

  return {
    ...state, busy, reload, add, update, remove, strike, restore, updateInfo, setRates, setLineRate, setStatus, reprice,
    unexport, destroy, toBuy,
  };
}

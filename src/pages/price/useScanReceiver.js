import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase.js';
import { channelName } from '../../lib/channels.js';
import * as scry from '../../lib/scryfall.js';
import { magicCandidate } from '../../lib/cardSearch.js';
import { buildLine } from '../../lib/buyLine.js';
import { priceLadder } from '../../lib/ladder.js';
import {
  cardmarketPrice, conditionPrices, conditionVariants, fallbackPrice, fetchPrices, lookupsFor, priceResults, resultFor,
} from '../../lib/prices.js';
import { loadEurUsd } from '../../lib/useEurUsd.js';
import { lineOfScan, scanFinish, scanQuote } from '../../lib/scanPrice.js';
import { useConnection } from '../../state/connection.jsx';
import { usePriceLimit } from '../../state/priceLimit.jsx';
import { useSettings } from '../../state/settings.jsx';
import { useStaff } from '../../state/staff.jsx';
import { isTimeout, withTimeout } from '../../lib/timeout.js';
import { createStayAwake } from '../../lib/stayAwake.js';

// Cards from the paired phone (docs/SCAN_FUNCTION.md 8.3). Each scan the
// phone sends is claimed here, one at a time in the order they came, priced
// by the scanner's rule (lib/scanPrice.js: TCGplayer's price from the
// Scryfall card, JustTCG only when that has none, then Cardmarket), built
// as ADD CARD builds a line, and added through the list's own `add`, so
// merging, the draft, a collection's lock and version, the user recorded and
// the flash are exactly ADD CARD's. Then the phone is told how it went.
// The phone's Undo (S5) comes the same way: one copy of that card's line is
// taken off, as × would, and the phone is told.
// Looked for when a scan arrives, every 10 seconds while a phone is paired
// (a missed message), and when the connection comes back.

const POLL_MS = 10_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Time limits (owner, 2026-10-18: "add timers to the PC side as well so we don't get stuck";
// decision 307). The scans are priced one at a time, so one call that never answered held every scan
// after it, and the phone said "pricing…" till the computer was reloaded. Rounded up to 5 s steps
// from what was measured on 2026-10-18 and 19: a database round trip 0.17 s at worst, so 5 s for a
// read or a status; adding a line (a write that does more) 10 s; the exchange rate 0.15 s, so 5 s; the
// JustTCG price function wasn't measurable from here (it needs the store's sign-in), so 15 s; a
// whole scan 30 s. Scryfall's own calls have their limits in lib/transport.js.
const DB_MS = 5_000;
const WRITE_MS = 10_000;
const RATE_MS = 5_000;
const PRICE_MS = 15_000;
const SCAN_MS = 30_000;
/** A call given `ms`, or `fallback` (a value, or a function of the error) when it takes longer. */
const within = (promise, ms, fallback) => withTimeout(Promise.resolve(promise), ms).catch((e) => {
  if (!isTimeout(e)) throw e;
  return typeof fallback === 'function' ? fallback(e) : fallback;
});
/** scan_resolve's own refusals: not a blip, so not tried again. */
const RESOLVE_REFUSALS = new Set(['scan_gone', 'not_session', 'bad_status']);

/**
 * @param {object} p
 * @param {string|null} p.deviceId  this computer
 * @param {string} p.label  its name, for the phone's messages
 * @param {object|null} p.session  its scan session (useScanSession)
 * @param {{ kind: 'walk_in'|'collection', buyId: string|null }|null} p.target  the list open here: only the
 *   scans sent to it are claimed (decision 343)
 * @param {{ busy: boolean, lines: object[], draftId?: string|null,
 *   add: (line: object, userId: string, draftId?: string|null) => Promise<string|null>,
 *   remove: (line: object, qty: number, userId: string) => Promise<unknown> }} p.list
 * @param {boolean} p.roundUp  a project: prices round up
 * @param {(lineId: string, added: { card: object, finish: string }) => void} p.onAdded  flash the line,
 *   and show the card (its Scryfall card and finish) in the Selected card frame
 */
export function useScanReceiver({ deviceId, label, session, target, list, roundUp, onAdded }) {
  const { epoch } = useConnection();
  const { reachedLimit } = usePriceLimit();
  const { values } = useSettings();
  const staff = useStaff();
  const paired = Boolean(session?.phone_device_id);

  // The latest of everything, for the queue's async work.
  const latest = useRef({});
  latest.current = {
    list, user: staff.current, touch: staff.touch, roundUp, onAdded, label, pct: values.fallback_pct_mtg, reachedLimit,
    phone: session?.phone_label ?? 'the phone',
  };
  const running = useRef(false);
  // This screen still open: a batch stops when it goes (Help, another collection), and what's left
  // waits for the list (decision 343) rather than failing on a lock already let go.
  const open = useRef(true);
  useEffect(() => {
    open.current = true;
    return () => {
      open.current = false;
    };
  }, []);
  const again = useRef(false);
  // Awake while cards arrive (decision 320): each one keeps the screen on for ten minutes more.
  const awake = useRef(null);
  useEffect(() => {
    awake.current = createStayAwake();
    return () => awake.current?.stop();
  }, []);

  /**
   * Price one claimed scan and add it; returns how it went, for scan_resolve.
   * `live`: false once the scan's been given up (too long), when it adds nothing.
   */
  const handle = useCallback(async (scan, live = () => true) => {
    const now = latest.current;
    now.touch?.();
    awake.current?.ping();   // a card arriving counts as use, as a keystroke would (decision 320)
    // Claimed again after its "added" was lost (review, 2026-10-16): the line it made is in the
    // list already, under its id. Said so again, nothing added.
    const made = lineOfScan(now.list.lines, scan.id);
    if (made) return { status: 'added', lineId: made.id, price: made.unit_price, source: made.price_source };
    const user = now.user;
    if (!user) return { status: 'failed', note: `Pick a user on ${now.label} first.` };
    const card = await scry.cardById(scan.scryfall_id);
    if (!card) return { status: 'failed', note: "Scryfall doesn't know that card: add it by hand." };
    await scry.loadSets();
    const candidate = magicCandidate(card);
    const finish = scanFinish(card, scan.finish);
    const condition = scan.condition;
    const up = Boolean(now.roundUp);
    const stamp = { from: 'phone', phone: now.phone, tier: scan.tier, scan_id: scan.id, at: new Date().toISOString() };
    const common = {
      candidate, finish, version: null, pokemonCard: null, condition, quantity: 1, imageUrl: null, englishName: null,
    };

    let line;
    if (scan.manual_price != null) {
      // No price anywhere, and the phone typed one: a manual price, as ✎ Manual price.
      const manual = Number(scan.manual_price);
      line = buildLine({
        ...common,
        ladder: priceLadder({}, null, now.pct, 'mtg', { up }),
        manual,
        result: null,
        variant: null,
        snapshot: { manual, override: null, warnings: [], trend: null, scan: stamp },
      });
    } else {
      const tcgplayer = fallbackPrice(candidate, { finish });
      const eur = cardmarketPrice(candidate, { finish });
      // No rate in time: the Cardmarket step just has none, as when the rate can't be had.
      const rate = eur != null ? await within(loadEurUsd(), RATE_MS, null) : null;
      const cardmarketUsd = eur != null && rate != null ? eur * rate : null;
      const ask = (market) => scanQuote({ condition, tcgplayer, market, cardmarketUsd, pct: now.pct, up });
      let quote = ask(undefined);
      let market = {};
      let result = null;
      if (quote.step === 'needs_justtcg') {
        // Scryfall has no TCGplayer price for this finish: ask JustTCG (one lookup, cached 6 hours).
        try {
          const lookups = lookupsFor(candidate, {});
          const missing = lookups.filter((l) => !priceResults.has(l.key));
          if (missing.length) {
            // No answer in time: thrown, so it goes on to Cardmarket as on any JustTCG failure.
            for (const [k, v] of Object.entries(await withTimeout(fetchPrices(missing), PRICE_MS))) priceResults.set(k, v);
          }
          const results = Object.fromEntries(lookups.filter((l) => priceResults.has(l.key)).map((l) => [l.key, priceResults.get(l.key)]));
          result = resultFor(candidate, results, { finish }) ?? null;
          market = conditionPrices(result?.card, { game: 'mtg', lang: candidate.lang, finish });
        } catch (e) {
          for (const [k, v] of Object.entries(e.payload?.results ?? {})) priceResults.set(k, v);
          if (e.code === 'DAILY_LIMIT_EXCEEDED' || e.code === 'REQUEST_LIMIT_EXCEEDED') {
            now.reachedLimit(e.payload?.resetAt ? new Date(e.payload.resetAt) : null);
          }
          console.warn('JustTCG for a scan failed; going on to Cardmarket', e);
        }
        quote = ask(market);
      }
      if (quote.step === 'none') return { status: 'needs_price' };
      const variant = quote.entry.source === 'justtcg'
        ? conditionVariants(result?.card, { game: 'mtg', lang: candidate.lang, finish })[condition] ?? null
        : null;
      line = buildLine({
        ...common,
        ladder: quote.ladder,
        manual: null,
        result,
        variant,
        snapshot: {
          justtcg: market,
          fallback: tcgplayer,
          cardmarket: eur != null ? { eur, rate } : null,
          override: quote.override,
          auto_cardmarket: false,
          manual: null,
          version: null,
          warnings: [],
          trend: null,
          scan: stamp,
        },
      });
    }

    // Someone adding by hand at this moment: wait for the list (up to 5 seconds).
    for (let i = 0; i < 25 && latest.current.list.busy; i++) await sleep(200);
    // Given up meanwhile (too long): nothing added late.
    if (!live()) return null;
    // A walk-in scan goes into the buy it was scanned for, or not at all (decision 350).
    const id = await within(latest.current.list.add(line, user.id, scan.target_draft_id ?? null), WRITE_MS, 'timeout');
    if (id === 'timeout') {
      return { status: 'failed', note: `No answer adding it on ${now.label}: check the list there before scanning it again.` };
    }
    if (!id) return { status: 'failed', note: `${now.label} couldn't add it: its screen says why.` };
    latest.current.onAdded(id, { card, finish });
    return { status: 'added', lineId: id, price: line.unit_price, source: line.price_source };
  }, []);

  /** The phone's Undo: one copy of the scan's line off the list. */
  const undo = useCallback(async (scan) => {
    const now = latest.current;
    now.touch?.();
    if (!now.user) return { status: 'added', note: `Pick a user on ${now.label}, then Undo again.` };
    const line = now.list.lines.find((l) => l.id === scan.line_id);
    if (!line) return { status: 'added', note: 'That card is no longer in the list.' };
    for (let i = 0; i < 25 && latest.current.list.busy; i++) await sleep(200);
    const ok = await within(latest.current.list.remove(line, 1, now.user.id), WRITE_MS, 'timeout');
    if (ok === 'timeout') return { status: 'added', note: `No answer taking it off on ${now.label}: check the list there.` };
    return ok ? { status: 'undone' } : { status: 'added', note: `${now.label} couldn't take it off: its screen says why.` };
  }, []);

  // Only the scans sent to the list open here (decision 343).
  const targetKind = target?.kind ?? null;
  const targetBuy = target?.buyId ?? null;

  /** Every waiting scan (or undo) for this list, oldest first; again if more arrive meanwhile. */
  const pump = useCallback(async () => {
    if (!deviceId || !targetKind) return;
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    try {
      do {
        again.current = false;
        // No answer in time: looked for again on the next message or poll.
        const mine = supabase
          .from('scans')
          .select('id')
          .eq('session_device_id', deviceId)
          .eq('target_kind', targetKind);
        const { data, error } = await within((targetBuy ? mine.eq('target_buy_id', targetBuy) : mine.is('target_buy_id', null))
          .in('status', ['sent', 'pricing', 'undo', 'undoing'])
          .order('created_at')
          .limit(20), DB_MS, { data: null, error: { message: 'timeout' } });
        if (error) {
          console.warn('Looking for scans failed', error);
          break;
        }
        for (const { id } of data ?? []) {
          if (!open.current) break;
          // No answer in time: left as it is, claimed on the next look (one left "pricing" in a minute).
          const { data: scan, error: claimError } = await within(supabase.rpc('scan_claim', {
            p_id: id, p_device: deviceId, p_kind: targetKind, p_buy_id: targetBuy,
            // A walk-in's own buy: scans sent for an earlier one aren't claimed (decision 350).
            p_draft_id: latest.current.list.draftId ?? null,
          }), DB_MS, { data: null, error: { message: 'timeout' } });
          if (claimError || !scan) continue;   // another tab of this computer has it, or it's been answered
          let out;
          let alive = true;
          try {
            const work = scan.status === 'undoing' ? undo(scan) : handle(scan, () => alive && open.current);
            out = await withTimeout(work, SCAN_MS);
          } catch (e) {
            alive = false;   // given up: a late answer adds nothing
            if (isTimeout(e)) {
              console.warn('A scan took too long', scan.id);
              // An undo given up leaves the card added (as a refused undo does); a scan, failed.
              out = scan.status === 'undoing'
                ? { status: 'added', note: `No answer taking it off on ${latest.current.label}: check the list there.` }
                : { status: 'failed', note: `It took too long on ${latest.current.label}: check its list, then scan it again.` };
            } else {
              console.error('A scan failed', e);
              out = { status: 'failed', note: `Something went wrong on ${latest.current.label}: ${e.message}` };
            }
          }
          // The screen went mid-way (decision 343): left "pricing", so its list claims it again later.
          if (!out && !open.current) continue;
          if (!out) out = { status: 'failed', note: `It took too long on ${latest.current.label}: check its list, then scan it again.` };
          // Tried three times on a blip (review, 2026-10-16): a scan left "pricing" or "undoing" is
          // claimed again in a minute, and the card would go in, or come off, twice. The function's
          // own refusals (scan_gone, not_session, bad_status) won't change: no second try.
          let resolveError = null;
          for (let tries = 0; tries < 3; tries++) {
            ({ error: resolveError } = await within(supabase.rpc('scan_resolve', {
              p_id: scan.id,
              p_device: deviceId,
              p_status: out.status,
              p_line_id: out.lineId ?? null,
              p_price: out.price ?? null,
              p_source: out.source ?? null,
              p_note: out.note ?? null,
            }), DB_MS, { error: { message: 'timeout' } }));
            if (!resolveError || RESOLVE_REFUSALS.has(resolveError.message)) break;
            await sleep(1000);
          }
          if (resolveError) console.warn('scan_resolve failed', resolveError);
        }
      } while (again.current && open.current);
    } finally {
      running.current = false;
    }
  }, [deviceId, targetKind, targetBuy, handle, undo]);

  // Cards left waiting when this list was last open (Help, F5, another collection) stay for it
  // (decision 343) and come in once the phone pairs with it again: pairing needs a screen that
  // can add, so they never go into a list that's locked, view-only or still loading.
  useEffect(() => {
    if (!deviceId || !paired) return undefined;
    pump();
    const channel = supabase
      .channel(channelName('scans-in', deviceId))
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'scans', filter: `session_device_id=eq.${deviceId}`,
      }, (payload) => {
        if (payload.new?.status === 'sent' || payload.new?.status === 'undo') pump();
      })
      .subscribe();
    const timer = setInterval(pump, POLL_MS);
    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [deviceId, paired, pump, epoch]);
}

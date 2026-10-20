import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import LinePreview, { previewFor } from '../../components/LinePreview.jsx';
import { lineText } from '../../lib/lineFormat.js';
import { formatMoney } from '../../lib/money.js';
import {
  hasOwnRate, lineRate, otherRate, rateTotals, whyText,
} from '../../lib/rates.js';
import { useToast } from '../../components/Toast.jsx';
import { BULK_ITEMS, bulkItem, bulkShortText, cardCounts, countText, isValuedBulk, perText } from '../../lib/bulk.js';
import CustomRateMark from '../../components/CustomRateMark.jsx';
import RemoveModal from '../../components/RemoveModal.jsx';
import { isStruck, struckNote } from '../../lib/struck.js';
import { frozenNote } from '../collections/useCollection.js';
import { useStaff } from '../../state/staff.jsx';
import { GAMES } from '../../lib/games.js';
import { useDismiss } from '../../lib/useDismiss.js';

/** Where a bulk line's item comes among the bulk suggestions in a search (lib/bulk.js BULK_ITEMS). */
const bulkRank = (l) => BULK_ITEMS.findIndex((item) => item.kind === l.bulk_kind);

const VALID_PCT = /^\d{1,3}(\.\d{1,2})?$/;

/**
 * What a card's rates are and why, for its tooltip (docs/TEAM_FEEDBACK.md
 * 4.3): "Own rate: Credit 75%, Cash 45%", "Low end (cards under $3): …", or
 * null on the list's usual rates.
 */
export function rateNote(line, rates) {
  const r = lineRate(line, rates);
  const both = `Credit ${r.credit}%, Cash ${r.cash}%`;
  const why = [r.why.credit, r.why.cash];
  if (why.includes('own')) return `Own rate: ${both}`;
  if (why.includes('low')) return `Low end (${whyText('low', rates).replace(/^low end: /, '')}): ${both}`;
  if (why.includes('high')) return `High end (${whyText('high', rates).replace(/^high end: /, '')}): ${both}`;
  if (why.includes('fixed')) return `Rates kept when confirmed: ${both}`;
  return null;
}

/** A card's own rate (Set Rate) after its name: ✎ Credit / Cash, in their colours. */
function OwnRateTag({ line, rates }) {
  const r = lineRate(line, rates);
  return (
    <span className="own-rate-tag" title={rateNote(line, rates)}>
      ✎ <span className="is-credit">{r.credit}%</span> / <span className="is-cash">{r.cash}%</span>
    </span>
  );
}

/** A short name for the rate a card would get without its own: beside each box of Set Rate. */
function otherLabel(why, which, rates, master) {
  if (why === 'low') return 'low end';
  if (why === 'high') return 'high end';
  if (why === 'custom') return 'custom';
  return Number(rates[which]) === Number(master[which]) ? 'master' : 'buy rate';
}

/**
 * "Rates for this buy" (spec 8.9.1): a Cash % and a Credit % saved with the
 * buy on blur or Enter; the master value typed back clears that custom rate.
 */
function RatesPanel({ title, rates, master, onSave, onClose }) {
  const [text, setText] = useState({ cash: String(rates.cash), credit: String(rates.credit) });
  const toast = useToast();
  const box = useRef(null);
  // A save (or "Use master rates") comes back as new rates: show them.
  useEffect(() => {
    setText({ cash: String(rates.cash), credit: String(rates.credit) });
  }, [rates.cash, rates.credit]);

  // Its own link (.pct-link) toggles it, so a click there isn't "outside".
  useDismiss(onClose, { ref: box, inside: '.pct-link' });

  function commit(which) {
    const raw = text[which].trim();
    if (!VALID_PCT.test(raw) || Number(raw) > 100) {
      toast('Enter a percentage from 0 to 100, with up to 2 decimals.', 'err');
      setText((t) => ({ ...t, [which]: String(rates[which]) }));
      return;
    }
    const value = Number(raw);
    const custom = value === Number(master[which]) ? null : value;
    const next = { cash: rates.customCash, credit: rates.customCredit, [which]: custom };
    if (next.cash !== rates.customCash || next.credit !== rates.customCredit) onSave(next.cash, next.credit);
  }

  const row = (which, label) => (
    <label className={`rate-row ${which}`}>
      <span className="rate-name">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        aria-label={`${label} % (${title.toLowerCase()})`}
        value={text[which]}
        onChange={(e) => setText((t) => ({ ...t, [which]: e.target.value }))}
        onBlur={() => commit(which)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
      <span className="rate-pct">%</span>
      <span className="rate-master">master {Number(master[which])}%</span>
    </label>
  );

  return (
    <div className="rates-panel" ref={box}>
      <div className="rates-head">{title}</div>
      {/* How custom rates work (owner, 2026-10-15; docs/TEAM_FEEDBACK.md 4.1). */}
      <p className="rates-note">
        Custom rates apply to every card equally, low and high end included; a card's own rate (Set Rate)
        still wins. On the master rates, the low-end and high-end rates apply.
      </p>
      {row('cash', 'Cash')}
      {row('credit', 'Credit')}
      <div className="rates-foot">
        <button type="button" className="btn small ghost" onClick={() => onSave(null, null)}>Use master rates</button>
        <button type="button" className="btn small" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

/** Maintain ratio: Credit is twice Cash (owner, 2026-10-15). */
const RATIO = 2;
const twice = (n) => Math.round(n * RATIO * 100) / 100;
const pctOf = (raw) => (VALID_PCT.test(String(raw).trim()) && Number(raw) <= 100 ? Number(raw) : null);

/**
 * Set Rate (docs/TEAM_FEEDBACK.md 4.3): one card's own Cash and Credit rates,
 * beside the card, saved like the list's rates (on blur or Enter). A box
 * typed back to the rate the card would otherwise get clears that side; Clear
 * clears both.
 *
 * Maintain ratio (owner, 2026-10-15): ticked, only Cash is typed and Credit is
 * twice it, saved together; ticking it on a card off the 2:1 ratio sets its
 * Credit to twice its Cash. It starts ticked when the card is on 2:1 now.
 * Cash above Credit turns the Cash box red, with a warning: allowed, but
 * likely a slip.
 */
function CardRatePanel({ line, rates, master, top, onSave, onClose }) {
  const mine = lineRate(line, rates);
  const other = otherRate(line, rates);
  const [text, setText] = useState({ cash: String(mine.cash), credit: String(mine.credit) });
  const [keep, setKeep] = useState(mine.credit === twice(mine.cash));
  const toast = useToast();
  const box = useRef(null);
  // A save comes back as the card's new rates: show them.
  useEffect(() => {
    setText({ cash: String(mine.cash), credit: String(mine.credit) });
  }, [mine.cash, mine.credit]);

  // A click elsewhere saves what's typed (the box's blur), then closes.
  useDismiss(onClose, { ref: box, blurFirst: true });

  const own = {
    cash: line.custom_cash_pct != null ? Number(line.custom_cash_pct) : null,
    credit: line.custom_credit_pct != null ? Number(line.custom_credit_pct) : null,
  };
  /** Save these rates as the card's own, each side cleared where it's what the card would get anyway. */
  function save(cash, credit) {
    const next = { cash: cash === other.cash ? null : cash, credit: credit === other.credit ? null : credit };
    if (next.cash !== own.cash || next.credit !== own.credit) onSave(next.cash, next.credit);
  }
  /** Cash for Maintain ratio: at most 50%, so Credit stays within 100%. */
  function ratioCash(value) {
    if (twice(value) <= 100) return true;
    toast(`With Maintain ratio, Cash can be at most ${100 / RATIO}% (Credit 100%).`, 'err');
    return false;
  }
  function commit(which) {
    const raw = text[which].trim();
    // Left as shown: nothing to save (a kept rate isn't made the card's own by passing through).
    if (raw === String(mine[which]) && !(keep && which === 'cash' && mine.credit !== twice(mine.cash))) return;
    const value = pctOf(raw);
    if (value == null || (keep && which === 'cash' && !ratioCash(value))) {
      if (value == null) toast('Enter a percentage from 0 to 100, with up to 2 decimals.', 'err');
      setText((t) => ({ ...t, [which]: String(mine[which]) }));
      return;
    }
    if (keep) save(value, twice(value));
    else save(which === 'cash' ? value : (own.cash ?? mine.cash), which === 'credit' ? value : (own.credit ?? mine.credit));
  }
  /** Ticking Maintain ratio sets Credit to twice the Cash shown. */
  function toggleKeep(on) {
    if (!on) {
      setKeep(false);
      return;
    }
    const cash = pctOf(text.cash) ?? mine.cash;
    if (!ratioCash(cash)) return;
    setKeep(true);
    setText({ cash: String(cash), credit: String(twice(cash)) });
    save(cash, twice(cash));
  }
  // What the boxes say now (Credit follows Cash as it's typed while the ratio is kept).
  const shown = {
    cash: text.cash,
    credit: keep && pctOf(text.cash) != null ? String(twice(pctOf(text.cash))) : text.credit,
  };
  const cashHigher = pctOf(shown.cash) != null && pctOf(shown.credit) != null && pctOf(shown.cash) > pctOf(shown.credit);

  const row = (which, label) => (
    <label className={`rate-row ${which}${own[which] != null ? ' own' : ''}`}>
      <span className="rate-name">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        aria-label={`${label} % for ${line.name}`}
        autoFocus={which === 'cash'}
        // Maintain ratio: Credit is worked out, not typed.
        readOnly={keep && which === 'credit'}
        tabIndex={keep && which === 'credit' ? -1 : undefined}
        title={keep && which === 'credit' ? `Twice Cash: untick Maintain ratio to type it` : undefined}
        className={which === 'cash' && cashHigher ? 'is-warn' : undefined}
        aria-invalid={which === 'cash' && cashHigher ? true : undefined}
        value={shown[which]}
        onChange={(e) => setText((t) => ({ ...t, [which]: e.target.value }))}
        onBlur={() => {
          if (!(keep && which === 'credit')) commit(which);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
      <span className="rate-pct">%</span>
      <span className="rate-master" title={`Without its own rate: ${whyText(other.why[which], rates)}`}>
        {otherLabel(other.why[which], which, rates, master)} {other[which]}%
      </span>
    </label>
  );

  return (
    <div className="rates-panel card-rate-panel" ref={box} style={{ top }}>
      <div className="rates-head">Set Rate · <span className="card-rate-name">{line.name_en || line.name}</span></div>
      <label className="rate-keep">
        <input type="checkbox" checked={keep} onChange={(e) => toggleKeep(e.target.checked)} />
        Maintain ratio <span className="rate-keep-note">Credit = {RATIO} × Cash</span>
      </label>
      {row('cash', 'Cash')}
      {row('credit', 'Credit')}
      {cashHigher && <p className="rate-warn" role="alert">⚠ Cash is higher than Credit.</p>}
      <div className="rates-foot">
        <button type="button" className="btn small ghost" disabled={!hasOwnRate(line)} onClick={() => onSave(null, null)}>
          Clear
        </button>
        <button type="button" className="btn small" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

/**
 * Set value (docs/TEAM_FEEDBACK.md 5.6): a bulk line's own value per item in
 * place of Set Rate, beside the line, with its Cash and Credit as it's typed.
 * Saved on blur or Enter; the Settings value typed back, or "Back to $1.50",
 * goes back to it. One clean line each (owner, 2026-10-15): the line in short,
 * the box, what it pays, the buttons.
 */
function BulkValuePanel({ line, rates, value, top, onSave, onClose }) {
  const item = bulkItem(line.bulk_kind);
  const shown = Number(line.unit_price);
  const [text, setText] = useState(shown.toFixed(2));
  const toast = useToast();
  const box = useRef(null);
  useEffect(() => setText(shown.toFixed(2)), [shown]);
  // A click elsewhere saves what's typed (the box's blur), then closes.
  useDismiss(onClose, { ref: box, blurFirst: true });

  const typed = /^\d{1,6}(\.\d{1,2})?$/.test(text.trim().replace(/^\$/, '')) ? Number(text.trim().replace(/^\$/, '')) : null;
  const live = rateTotals([{ ...line, unit_price: typed ?? shown, cc_sell_price: null }], rates);
  function commit() {
    if (typed === shown) return;
    if (typed == null) {
      toast('Enter a dollar amount, with up to 2 decimals.', 'err');
      setText(shown.toFixed(2));
      return;
    }
    onSave(typed === value ? null : typed);
  }

  return (
    <div className="rates-panel card-rate-panel bulk-value-panel" ref={box} style={{ top }}>
      <div className="rates-head" title={lineText(line)}>Set value · <span className="card-rate-name">{bulkShortText(line)}</span></div>
      <label className="rate-row bulk-value-row">
        <span className="rate-pct">$</span>
        <input
          type="text"
          inputMode="decimal"
          aria-label={`Value per ${item.per} for ${lineText(line)}`}
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
        <span className="rate-pct">per {item.per}</span>
      </label>
      <p className="bulk-value-live">
        Pays <span className="is-credit">Credit <strong>{formatMoney(live.credit)}</strong></span>
        {' · '}
        <span className="is-cash">Cash <strong>{formatMoney(live.cash)}</strong></span>
      </p>
      <div className="rates-foot">
        <button
          type="button"
          className="btn small ghost"
          disabled={line.price_source !== 'manual'}
          title="Settings → Bulk values"
          onClick={() => onSave(null)}
        >
          Back to {formatMoney(value)}
        </button>
        <button type="button" className="btn small" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

/**
 * Market, Cash and Credit (spec 8.9), with the clickable percentages that
 * open the custom-rate subpanel (8.9.1) above them. Each card at its own rate
 * (docs/TEAM_FEEDBACK.md 4.4): the labels keep the list's base rates, with a
 * CUSTOM chip when a card has its own (Set Rate).
 */
function Totals({
  lines, rates, master, ratesTitle, canEdit, editBlocked, ratesLocked, onSaveRates, onDone,
}) {
  const [ratesOpen, setRatesOpen] = useState(false);
  const toast = useToast();
  const t = rateTotals(lines, rates);
  const customChip = <CustomRateMark totals={t} />;
  const pct = (which, label) => {
    const custom = which === 'cash' ? rates.customCash : rates.customCredit;
    const value = rates[which];
    // No rate controls (a project's list, owner 2026-10-15): just the rate.
    if (!onSaveRates) return <span>{label} ({Number(value)}%)</span>;
    return (
      <button
        type="button"
        className={`pct-link${custom != null ? ' custom' : ''}`}
        title={custom != null
          ? `Custom rate here. Master rate: ${Number(master[which])}%`
          : `Set a custom ${label} rate here`}
        onClick={() => {
          if (ratesLocked) toast(`${ratesLocked}.`, 'err');
          else if (canEdit) setRatesOpen((o) => !o);
          else editBlocked();
        }}
      >
        {label} ({Number(value)}%{custom != null && ' ✎'})
      </button>
    );
  };
  return (
    <div className="totals">
      <div className="total-row"><span>Market</span><strong>{formatMoney(t.market)}</strong></div>
      <div className="total-row cash"><span>{pct('cash', 'Cash')}{customChip}</span><strong>{formatMoney(t.cash)}</strong></div>
      <div className="total-row credit"><span>{pct('credit', 'Credit')}{customChip}</span><strong>{formatMoney(t.credit)}</strong></div>
      {ratesOpen && (
        <RatesPanel
          title={ratesTitle}
          rates={rates}
          master={master}
          onSave={onSaveRates}
          onClose={() => {
            setRatesOpen(false);
            onDone();
          }}
        />
      )}
    </div>
  );
}

/**
 * The list sidebar (spec 8.9): the walk-in draft ("Buy list") or a
 * collection ("Collection list"), grouped by game in the order added. Its
 * foot holds the page's `details` (a collection's), the totals, and the
 * page's buttons (`footer`). Clicking a line edits it (onEdit; owner,
 * 2026-09-29); its red × removes it. While `locked` (Paid/Ours, view-only)
 * lines can't be edited, and while `removeLocked` (Completed, view-only) the
 * × is hidden too; a Paid/Ours collection keeps it (owner, 2026-09-29).
 *
 * Right-clicking a card (docs/TEAM_FEEDBACK.md 4.3) opens Set Rate
 * (`onSetLineRate`), and Clear Rate on a card with its own rate, blocked like
 * the list's rates (`ratesLocked`, `locked`) and on Completed cards. A card
 * with its own rate is tinted, with a ✎ tag.
 * On a bulk line (docs/TEAM_FEEDBACK.md 5.6) the menu has Set value instead
 * (`onSetLineValue`, `bulkValues`: Settings' values), blocked only like any
 * change to the list.
 *
 * Struck cards (owner, 2026-10-16; lib/struck.js): with `onStrike` (a
 * Paid/Ours list), × strikes a card first: crossed out, kept as a record.
 * A struck card's × removes it for good, and right-clicking it offers
 * Restore (`onRestore`), blocked like removing. It can't be edited or rated.
 *
 * `scanChip`, under the heading: the phone paired with this screen
 * (docs/SCAN_FUNCTION.md 8.2), when there is one.
 */
export default function BuyList({
  title = 'Buy list', lines, loaded, rates, master, ratesTitle, flashId, hits = null, editingId,
  canEdit, locked = null, editBlocked, canRemove = canEdit, removeLocked = locked, removeBlocked = editBlocked,
  onEdit, onRemove, onSaveRates, onSetLineRate = null, onSetLineValue = null, bulkValues = null, onDone, details,
  footer, badge = null, ratesLocked = null, onStrike = null, onRestore = null, scanChip = null,
}) {
  const [removing, setRemoving] = useState(null);  // { line, mode }: the × asking
  const staff = useStaff();
  const [preview, setPreview] = useState(null);   // { src, top, left } while a line is hovered
  const [rateMenu, setRateMenu] = useState(null);  // { line, top, left }: the right-click menu
  const [rateFor, setRateFor] = useState(null);    // the card whose rate is being set (its id)
  const [rateTop, setRateTop] = useState(0);
  const list = useRef(null);
  const aside = useRef(null);
  const toast = useToast();

  const hidePreview = useCallback(() => setPreview(null), []);

  // Real cards and bulk counted apart (docs/TEAM_FEEDBACK.md 5.5).
  const counts = cardCounts(lines);
  const rateLine = rateFor ? lines.find((l) => l.id === rateFor) ?? null : null;

  // A point on the screen, in the sidebar's own px (it may be zoomed: lib/uiScale.js).
  const inAside = (x, y) => {
    const zoom = aside.current?.currentCSSZoom ?? 1;
    const b = aside.current.getBoundingClientRect();
    return { left: (x - b.left) / zoom, top: (y - b.top) / zoom };
  };

  /** Right-click on a card: the Set Rate menu where the pointer is (a struck card's: Restore). */
  function openRateMenu(e, l) {
    if (!(isStruck(l) ? onRestore : isValuedBulk(l) ? onSetLineValue : onSetLineRate)) return;   // none here: the browser's own menu
    e.preventDefault();
    hidePreview();
    setRateMenu({ line: l, ...inAside(e.clientX, e.clientY) });
  }
  // Bulk's value is a price, not a rate: only what blocks any change to the list.
  const rateBlocked = (l) => (isValuedBulk(l) ? null : ratesLocked) ?? locked
    ?? (l.completed_at ? "A Completed card's rate doesn't change" : null);
  function startRate(l) {
    setRateMenu(null);
    const why = rateBlocked(l);
    if (why) toast(`${why}.`, 'err');
    else if (!canEdit) editBlocked();
    else setRateFor(l.id);
  }
  /** Clear Rate (owner, 2026-10-15): straight from the menu, on a card with its own rate. */
  async function clearRate(l) {
    setRateMenu(null);
    const why = rateBlocked(l);
    if (why) toast(`${why}.`, 'err');
    else if (!canEdit) editBlocked();
    else {
      if (isValuedBulk(l)) await onSetLineValue(l, null);
      else await onSetLineRate(l, null, null);
      onDone();
    }
  }
  /** Click on a card: edit it, unless it's struck (Restore first) or exported (frozen, decision 345). */
  function clickLine(l) {
    if (isStruck(l)) return;
    if (!canEdit) editBlocked();
    else if (l.cc_status) toast(frozenNote(l), 'err');
    else onEdit(l);
  }
  /** Restore (owner, 2026-10-16): a struck card back, blocked like removing. */
  async function restore(l) {
    setRateMenu(null);
    if (!canRemove) removeBlocked();
    else if (l.cc_status) toast(frozenNote(l), 'err');
    else {
      await onRestore(l);
      onDone();
    }
  }
  /** ×: strikes first in a Paid/Ours list; a struck card's removes it for good. */
  function startRemove(l) {
    if (!canRemove) removeBlocked();
    else if (l.cc_status) toast(frozenNote(l), 'err');
    else setRemoving({ line: l, mode: isStruck(l) ? 'struck' : onStrike ? 'strike' : 'remove' });
  }
  const closeRate = useCallback(() => {
    setRateFor(null);
    onDone();
  }, [onDone]);

  // The menu goes on any click elsewhere, Esc or a scroll.
  useDismiss(() => setRateMenu(null), { inside: '.rate-menu', when: Boolean(rateMenu), scroll: true });

  /** The right-click menu's items for a line: a struck card's Restore, else its rate or value. */
  const menuItems = (line) => (isStruck(line)
    ? [{ label: 'Restore', blocked: removeLocked, tip: 'Take the strike off: back on the list with its price and rate', run: () => restore(line) }]
    : [
      {
        label: isValuedBulk(line) ? 'Set value' : 'Set Rate',
        blocked: rateBlocked(line),
        tip: isValuedBulk(line) ? 'Give this bulk its own value per item' : 'Give this card its own Cash and Credit rates',
        run: () => startRate(line),
      },
      isValuedBulk(line) && line.price_source === 'manual' && {
        label: 'Clear value', blocked: rateBlocked(line), tip: 'Back to the value in Settings → Bulk values', run: () => clearRate(line),
      },
      hasOwnRate(line) && {
        label: 'Clear Rate',
        blocked: rateBlocked(line),
        tip: `Back to Credit ${otherRate(line, rates).credit}%, Cash ${otherRate(line, rates).cash}%`,
        run: () => clearRate(line),
      },
    ].filter(Boolean));

  // Set Rate sits level with its card, outside the sidebar, and follows it as the list scrolls.
  useLayoutEffect(() => {
    if (!rateFor) return undefined;
    const place = () => {
      const row = list.current?.querySelector(`[data-line="${rateFor}"]`);
      if (!row || !aside.current) return;
      const r = row.getBoundingClientRect();
      const room = aside.current.offsetHeight - 190;
      setRateTop(Math.max(8, Math.min(inAside(r.left, r.top).top - 6, room)));
    };
    place();
    const body = list.current;
    body?.addEventListener('scroll', place);
    window.addEventListener('resize', place);
    return () => {
      body?.removeEventListener('scroll', place);
      window.removeEventListener('resize', place);
    };
  }, [rateFor, lines]);
  // A card removed meanwhile (here or elsewhere): nothing left to set.
  useEffect(() => {
    if (rateFor && loaded && !rateLine) setRateFor(null);
  }, [rateFor, rateLine, loaded]);

  // A new or updated line scrolls into view and flashes (spec 8.8).
  useEffect(() => {
    if (!flashId) return;
    list.current?.querySelector(`[data-line="${flashId}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [flashId, lines]);

  // Lines a header search matched (spec 13): the first scrolls into view once
  // the list has loaded, and all of them stay tinted.
  const hitSet = new Set(hits?.ids ?? []);
  const hitKey = hits?.key ?? null;
  const firstHit = hits?.ids?.[0] ?? null;
  useEffect(() => {
    if (!hitKey || !firstHit || !loaded) return;
    list.current?.querySelector(`[data-line="${firstHit}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [hitKey, firstHit, loaded]);

  return (
    // Any Sell price (an exported collection): the price column widens for its SELL tag.
    <aside
      className={`buy-list${locked ? ' locked' : ''}${removeLocked ? ' no-remove' : ''}`}
      ref={aside}
    >
      <div className="list-head">
        <span className="list-title">{title}</span>
        {badge}
        <span className="list-count">{countText(counts)}</span>
      </div>
      {scanChip && <div className="list-scan">{scanChip}</div>}

      <div className="list-body" ref={list}>
        {loaded && !lines.length && <p className="list-empty">Cards you add will appear here.</p>}
        {GAMES.map((g) => {
          const all = lines.filter((l) => l.game === g.key);
          if (!all.length) return null;
          // Bulk at the top, in the order the bulk suggestions come in a search, a line under it;
          // then the cards (placeholders among them) as added (owner, 2026-10-16: "It's confusing
          // seeing them mixed in").
          const bulk = all.filter(isValuedBulk).sort((a, b) => bulkRank(a) - bulkRank(b));
          const mine = [...bulk, ...all.filter((l) => !isValuedBulk(l))];
          const firstCard = bulk.length < mine.length ? mine[bulk.length].id : null;
          return (
            <section key={g.key} className="list-group">
              <div className="group-head">
                <span className={`group-chip ${g.key}`}>{g.name} ({countText({ ...cardCounts(mine), struck: 0 }, { short: true })})</span>
              </div>
              {mine.map((l) => (
                <Fragment key={l.id}>
                {bulk.length > 0 && l.id === firstCard && <div className="bulk-divider" role="separator" aria-label="Bulk above, cards below" />}
                <div
                  data-line={l.id}
                  className={`buy-line-row${l.id === flashId ? ' flash' : ''}${l.id === editingId ? ' editing' : ''}${hitSet.has(l.id) ? ' search-hit' : ''}${hasOwnRate(l) ? ' own-rate' : ''}${l.id === rateFor ? ' rating' : ''}${isStruck(l) ? ' struck' : ''}`}
                  // A small card picture left of the sidebar, level with the line (owner, 2026-09-29).
                  onMouseEnter={(e) => {
                    if (!rateFor) setPreview(previewFor(l.image_url, e.currentTarget, aside.current, 'left'));
                  }}
                  onMouseLeave={hidePreview}
                  onContextMenu={(e) => openRateMenu(e, l)}
                >
                  {/* The same column before and after an export: a Sell price is green. */}
                  <span
                    className={`line-price${l.cc_sell_price != null ? ' is-sell' : ''}`}
                    title={l.cc_sell_price != null ? `Sell price from the export · bought at ${formatMoney(l.unit_price)}`
                      : isValuedBulk(l) ? `Value per item (${bulkItem(l.bulk_kind)?.per} cards)` : 'Price per card'}
                  >
                    {formatMoney(l.cc_sell_price ?? l.unit_price)}
                  </span>
                  <button
                    type="button"
                    className="buy-line"
                    title={l.id === editingId
                      ? 'Being edited: SAVE EDIT saves the changes, Esc leaves it as it was'
                      : isStruck(l)
                        ? `${struckNote(l, staff.byId)}.${onRestore ? '\nRight-click → Restore puts it back; × removes it for good.' : ''}`
                        : `${l.name_en ? `${l.name} · ` : ''}${formatMoney(l.unit_price)} each${locked || l.cc_status ? '' : ' · click to edit'}${l.cc_status ? `\n${frozenNote(l)}` : ''}${rateNote(l, rates) ? `\n${rateNote(l, rates)}` : ''}`}
                    onClick={() => clickLine(l)}
                  >
                    {lineText(l)}
                    {/* Its own rate (Set Rate): Credit / Cash, in their colours. */}
                    {hasOwnRate(l) && <OwnRateTag line={l} rates={rates} />}
                    {/* Bulk: its value per item beside it, ✎ when it's the line's own (Set value). */}
                    {isValuedBulk(l) && (
                      <span className={`bulk-per${l.price_source === 'manual' ? ' own' : ''}`}>
                        {l.price_source === 'manual' && '✎ '}{perText(bulkItem(l.bulk_kind), Number(l.unit_price))}
                      </span>
                    )}
                    {l.cc_status === 'cant_upload' && (
                      <span className="cant-chip" title="Not matched to Crystal Commerce: pulled from the upload. It's in Can't upload cards.">
                        Can't upload
                      </span>
                    )}
                    {/* A copy in Can't upload cards: where it came from (export spec 9.2). */}
                    {l.source_note && <span className="line-source">{l.source_note}</span>}
                  </button>
                  <button
                    type="button"
                    className="line-x"
                    title={isStruck(l) ? 'Remove for good' : onStrike ? 'Strike: moved elsewhere, kept crossed out' : 'Remove'}
                    aria-label={`${isStruck(l) ? 'Remove for good' : onStrike ? 'Strike' : 'Remove'} ${lineText(l)}`}
                    onClick={() => startRemove(l)}
                  >
                    ×
                  </button>
                </div>
                </Fragment>
              ))}
            </section>
          );
        })}
      </div>

      <div className="list-foot">
        {details}
        <Totals
          lines={lines}
          rates={rates}
          master={master}
          ratesTitle={ratesTitle}
          canEdit={canEdit}
          editBlocked={editBlocked}
          ratesLocked={ratesLocked}
          onSaveRates={onSaveRates}
          onDone={onDone}
        />
        {footer}
      </div>

      <LinePreview preview={preview} onHide={hidePreview} />
      {rateMenu && (
        <div className="rate-menu" role="menu" style={{ top: rateMenu.top, left: rateMenu.left }}>
          {menuItems(rateMenu.line).map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className={it.blocked ? 'is-blocked' : ''}
              title={it.blocked ?? it.tip}
              onClick={it.run}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
      {rateLine && isValuedBulk(rateLine) && (
        <BulkValuePanel
          key={rateLine.id}
          line={rateLine}
          rates={rates}
          value={bulkValues?.[rateLine.bulk_kind] ?? Number(rateLine.market_price ?? rateLine.unit_price)}
          top={rateTop}
          onSave={(value) => onSetLineValue(rateLine, value)}
          onClose={closeRate}
        />
      )}
      {rateLine && !isValuedBulk(rateLine) && (
        <CardRatePanel
          key={rateLine.id}
          line={rateLine}
          rates={rates}
          master={master}
          top={rateTop}
          onSave={(cash, credit) => onSetLineRate(rateLine, cash, credit)}
          onClose={closeRate}
        />
      )}
      {removing && (
        <RemoveModal
          line={removing.line}
          mode={removing.mode}
          onClose={() => {
            setRemoving(null);
            onDone();
          }}
          onRemove={async (line, qty) => {
            const { mode } = removing;
            setRemoving(null);
            if (mode === 'strike') await onStrike(line, qty);
            else await onRemove(line, qty);
            onDone();
          }}
        />
      )}
    </aside>
  );
}

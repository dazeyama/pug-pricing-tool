import { useEffect, useRef, useState } from 'react';
import { formatMoney, payout } from '../../lib/money.js';
import {
  DEFAULT_OWNED, ownedReason, ownedRows, signedPct,
} from '../../lib/ownedRates.js';
import { useDismiss } from '../../lib/useDismiss.js';
import InkStamp from './InkStamp.jsx';

const copies = (n) => `${n} ${n === 1 ? 'copy' : 'copies'}`;

/**
 * The copies we own (owner, 2026-10-22; decision 448), beside the card's details: this printing in its
 * finish, and the card in every printing, each the inventory's Total Qty plus ours not in it yet.
 * Pointing at it shows a box in the price warnings' style, one verdict and one list (decision 518): "We own Y ·
 * X of this printing" with the change and Apply, Credit and Cash, why, and every printing we own. What changes
 * the card's rate: as shipped, 5% off for each copy of
 * the card over 2; 5% on for the first of this printing, 5% more for the first of the card (decision 457; the
 * numbers are Settings → Copies we own's, decision 474); stacked,
 * to apply with a click (it goes on ADD CARD as the card's own rate). Above it, Auto apply rates? for the buy. Nothing changes a rate unless
 * the worker clicks Apply or checks the box.
 * @param {object} p
 * @param {object|null} p.candidate  the selected card, or null
 * @param {{ status: string, counts: object|null, error: string|null }} p.owned  useOwnedCopies
 * @param {string|null} p.finish  the printing's finish (Magic)
 * @param {object|null} p.adjust  ownedAdjust: the first-copy bonuses and the cut, stacked (decision 457)
 * @param {string} [p.lowEndWhy]  "low end: cards under $3", said when a low-end card gets no bonus (decision 458)
 * @param {{ cash: number, credit: number, net: number }|null} p.suggested  the rates they come to, or null
 *   (nothing changes, or a bonus and a cut cancel out)
 * @param {boolean} p.applied  the suggestion goes on with ADD CARD (clicked, or Auto apply rates)
 * @param {string|null} p.applyBlocked  why it can't be applied here, or null
 * @param {number|null} p.price  the card's price, for the amounts
 * @param {() => void} p.onApply  toggles a clicked suggestion
 * @param {{ on: boolean, onChange: (on: boolean) => void, disabled: boolean }|null} p.auto  the box, or none
 * @param {(() => void)|null} [p.onMatch]  opens the matching dialog, for an n/a no product clearly matches (468)
 * @param {() => void} p.onDone  back to the search field
 */
export default function OwnedCounter({
  candidate, owned, finish = null, adjust = null, lowEndWhy = '', suggested, applied, applyBlocked, price, onApply, auto,
  onMatch = null, onDone,
}) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const box = useRef(null);

  // A new card starts closed.
  useEffect(() => {
    setHover(false);
    setPinned(false);
  }, [candidate?.key]);

  useDismiss(() => setPinned(false), { ref: box, when: pinned, escape: false });

  // The stamp switching (decisions 461, 462): which stamp it was, while the new one lands over it
  // (0.3 s); only when the same card's state changes, never as a new card comes up.
  // Only a stamp already showing switches: a card coming up with Auto apply rates on shows APPLIED straight
  // away, though its count arriving turns it on (owner, 2026-10-23; decision 466).
  const [flip, setFlip] = useState(null);   // { from: boolean, n: number } or null
  const shown = Boolean(suggested);
  const last = useRef({ key: null, applied, shown });
  useEffect(() => {
    const key = `${candidate?.key ?? ''}|${owned.key ?? ''}`;
    const was = last.current;
    last.current = { key, applied, shown };
    if (was.key !== key || !was.shown || !shown || was.applied === applied) return undefined;
    setFlip((f) => ({ from: was.applied, n: (f?.n ?? 0) + 1 }));
    const done = setTimeout(() => setFlip(null), 320);
    return () => clearTimeout(done);
  }, [applied, shown, candidate?.key, owned.key]);

  const autoBox = auto && (
    <label className="owned-auto" title="Every card added to this buy goes on at the rate the copies we own suggest: a first copy's bonus, the cut for copies we have plenty of">
      <input
        type="checkbox"
        checked={auto.on}
        disabled={auto.disabled}
        onChange={(e) => {
          auto.onChange(e.target.checked);
          onDone();
        }}
      />
      Auto apply rates?
    </label>
  );

  // Nothing selected: no box, only the buy's Auto apply rates?, which can be set before the first card
  // (owner, 2026-10-23; decision 479).
  if (!candidate) return autoBox ? <div className="owned">{autoBox}</div> : null;
  if (owned.status === 'off') {
    return (
      <div className="owned">
        {autoBox}
        <div className="owned-empty">Copies we own: Magic only for now</div>
      </div>
    );
  }

  const c = owned.counts;
  const ready = owned.status === 'ok';
  const open = ready && (hover || pinned);
  // The inventory can't say which of its products is this printing (or there's none, or no quantities): n/a
  // in both, faded, no chips or stamp, the rate unchanged; the box says why (decision 467).
  const unknown = ready && !c.known;
  // Not known because the match didn't go through: ? rather than n/a, and a click tries again (decision 500).
  const failedMatch = unknown && c.matchFailed;
  const num = (n) => {
    if (owned.status === 'loading') return '…';
    if (!ready || failedMatch) return '?';
    return unknown ? 'n/a' : String(n);
  };
  const retry = () => {
    setHover(false);
    owned.refresh?.();
  };
  let unknownWhy = '';
  if (unknown) {
    if (failedMatch) unknownWhy = 'Matching it to its Crystal Commerce product didn’t go through (the connection, most likely), so its count for this printing isn’t known. Click the boxes to try again.';
    else if (c.inventoryAt == null) unknownWhy = 'No Master Crystal Inventory is uploaded, so what Crystal Commerce holds isn’t known.';
    else if (!c.cardSure) unknownWhy = 'The inventory was uploaded before it kept quantities: upload it again to count it.';
    else unknownWhy = 'Crystal Commerce has this card, but none of its products is clearly this printing (several could be, or none quite matches), so its count for this printing isn’t known. Click the boxes to pick its product (EXPORT asks the same); once one is chosen, the counts show here.';
  }
  // That last case can be settled here: the boxes open the export's choice for this one card (decision 468).
  const matchable = unknown && !failedMatch && c.inventoryAt != null && c.cardSure && Boolean(onMatch);
  // The numbers the answer was worked out with (Settings → Copies we own, decision 474).
  const cfg = adjust?.cfg ?? DEFAULT_OWNED;
  // Under the boxes: a green chip for the bonus, a red one for the cut, side by side when both apply
  // (owner, 2026-10-23; decision 457); ✓ on each once the rate is on.
  const mark = applied ? '✓ ' : '';
  const chips = adjust && (adjust.bonus > 0 || adjust.cut > 0) ? (
    <div className="owned-chips">
      {adjust.bonus > 0 && (
        <span className={`owned-tag bonus${applied ? ' on' : ''}`} title={adjust.firstCard ? 'First of this card' : 'First of this printing'}>
          {mark}+{adjust.bonus}% first
        </span>
      )}
      {adjust.cut > 0 && (
        <span className={`owned-tag cut${applied ? ' on' : ''}`} title={`${copies(adjust.over)} of the card over ${cfg.free}`}>
          {mark}−{adjust.cut}% owned
        </span>
      )}
    </div>
  ) : null;
  const rates = suggested && (
    <>
      <span className="is-credit">Credit {suggested.credit}%</span> /{' '}
      <span className="is-cash">Cash {suggested.cash}%</span>
      {price != null && ` (${formatMoney(payout(price, suggested.credit))} / ${formatMoney(payout(price, suggested.cash))})`}
    </>
  );
  // The box as one verdict and one list (owner, 2026-10-24; decision 518): what we own and what it does to the
  // rate, with Apply, on one line; Credit and Cash; why; then every printing we own (owner, 2026-10-22: "it has
  // to show specifically, which printings we own") in one list.
  const rows = ownedRows(c);
  let verdict;
  if (unknown) verdict = failedMatch ? 'Didn’t go through' : 'Can’t count this printing';
  else if (c?.card === 0) verdict = 'We own none';
  else verdict = <>We own {c?.card} <span className="dim">· {c?.printing || 'none'} of this printing</span></>;
  let pctTone = '';
  if (suggested) pctTone = suggested.net > 0 ? ' bonus' : ' cut';
  const why = unknown
    ? `${unknownWhy} Until then the rate isn’t changed.`
    : ownedReason(adjust, { lowEndWhy, finish });
  // Where a rate can't be applied by hand, a line in the box says why (Auto apply rates on, or blocked here).
  let applyNote = null;
  if (suggested && auto?.on && !applyBlocked) applyNote = 'Auto apply rates is on: this card goes on at this rate.';
  else if (suggested && applyBlocked) applyNote = applyBlocked;
  // Under the boxes, always in view: a plain Apply button (owner, 2026-10-24: "so that the button always visible
  // is more normal looking"; decision 521), the stamp's old place. A click applies or takes off the rate.
  const pct = suggested ? signedPct(suggested.net) : '';
  let applyLabel = `Apply ${pct}`;
  if (auto?.on && !applyBlocked) applyLabel = `✓ ${pct} auto`;
  else if (applied) applyLabel = `✓ ${pct} applied`;
  const applyButton = suggested && (
    <button
      type="button"
      className={`btn small owned-apply ${applied ? 'owned-undo' : 'primary'}`}
      disabled={Boolean(applyBlocked) || Boolean(auto?.on)}
      title={applyBlocked || (auto?.on
        ? 'Auto apply rates is on: every card goes on at this rate. Uncheck it to choose card by card.'
        : applied ? `${pct} goes on with ADD CARD: click to take it off` : `${pct} goes on with ADD CARD`)}
      onClick={() => {
        onApply();
        onDone();
      }}
    >
      {applyLabel}
    </button>
  );
  // In the box: the stamp, applied or not (decision 459), still the switch (461), the new one landing over the old
  // (462, 488); moved here from under the boxes (decision 521).
  const stampButton = suggested && (
    <button
      type="button"
      className="stamp-btn"
      disabled={Boolean(applyBlocked) || Boolean(auto?.on)}
      title={applyBlocked || (auto?.on
        ? 'Auto apply rates is on: every card goes on at this rate. Uncheck it to choose card by card.'
        : applied ? 'Click to take the rate off' : 'Click to apply the rate')}
      onClick={() => {
        onApply();
        onDone();
      }}
    >
      {flip && <InkStamp key={`out-${flip.n}`} applied={flip.from} className="leaving" />}
      <InkStamp key={`in-${flip?.n ?? 0}`} applied={applied} className={flip ? 'landing' : ''} />
    </button>
  );

  return (
    <div className="owned" ref={box} onMouseLeave={() => setHover(false)}>
      {/* Auto apply rates? at the top (owner, 2026-10-22; decision 456). */}
      {autoBox}
      <button
        type="button"
        className={`owned-boxes${adjust?.cut > 0 ? ' hot' : ''}${applied ? ' applied' : ''}${pinned ? ' on' : ''}${unknown ? ' unknown' : ''}`}
        aria-expanded={open}
        aria-label={ready && !unknown ? `We own ${copies(c.printing)} of this printing and ${copies(c.card)} of this card`
          : 'Copies we own'}
        title={owned.status === 'failed' ? owned.error
          : failedMatch ? 'Matching it to Crystal Commerce didn’t go through: click to try again'
            : matchable ? 'Click to pick its Crystal Commerce product' : undefined}
        onMouseEnter={() => setHover(true)}
        onClick={() => {
          if (failedMatch) {
            retry();
            return;
          }
          if (matchable) {
            setHover(false);
            onMatch();
            return;
          }
          setPinned((p) => !p);
          onDone();
        }}
      >
        <span className="owned-box printing">
          <span className="owned-label">This printing</span>
          <b className="owned-num">{num(c?.printing)}</b>
        </span>
        <span className="owned-box card">
          <span className="owned-label">All printings</span>
          <b className="owned-num">{num(c?.card)}</b>
        </span>
      </button>
      {chips}
      {/* n/a that can be matched: a hint under the boxes, which opens the dialog too (owner, 2026-10-23; 470). */}
      {matchable && (
        <button
          type="button"
          className="owned-tag owned-match"
          onClick={() => {
            setHover(false);
            onMatch();
          }}
        >
          (click to match)
        </button>
      )}
      {failedMatch && (
        <button type="button" className="owned-tag owned-match" onClick={retry}>
          (didn&apos;t go through: try again)
        </button>
      )}
      {/* A plain Apply button, always in view (decision 521; the stamp was here, decisions 459–462). */}
      {applyButton}
      {open && (
        <div className="owned-pop">
          <section className="owned-pop-box" aria-label="Copies we own">
            <div className="owned-verdict">
              <span className="owned-say">{verdict}</span>
              <span className={`owned-pct${pctTone}`}>{suggested ? signedPct(suggested.net) : 'no change'}</span>
            </div>
            {/* Credit, Cash and why, with the stamp beside them (decision 521). */}
            <div className="owned-body">
              <div className="owned-body-text">
                {suggested && <p className="owned-rates">{rates}</p>}
                {why && <p className="owned-why">{why}</p>}
                {applyNote && <p className="owned-why">{applyNote}</p>}
              </div>
              {stampButton}
            </div>
            {/* Ours and the inventory's in one list, this printing first (decision 518). */}
            <div className="owned-pop-sub">The printings we own</div>
            {rows.length ? (
              <ul className="owned-rows">
                {rows.map((r) => (
                  <li key={r.key} className={r.this ? 'is-this' : undefined}>
                    <span className="owned-row-name" title={r.title ?? undefined}>{r.text}</span>
                    {r.this && <span className="owned-this">this printing</span>}
                    {r.ours && <span className="owned-this ours">not in CC yet</span>}
                    <b>×{r.qty}</b>
                  </li>
                ))}
              </ul>
            ) : <p className="owned-pop-note">None.</p>}
          </section>
        </div>
      )}
    </div>
  );
}

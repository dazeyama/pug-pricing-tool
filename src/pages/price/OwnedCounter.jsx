import { useEffect, useRef, useState } from 'react';
import { formatMoney, payout } from '../../lib/money.js';
import {
  DEFAULT_OWNED, ccRowText, finishWord, signedPct,
} from '../../lib/ownedRates.js';
import { useDismiss } from '../../lib/useDismiss.js';
import InkStamp from './InkStamp.jsx';

const copies = (n) => `${n} ${n === 1 ? 'copy' : 'copies'}`;

/**
 * The copies we own (owner, 2026-10-22; decision 448), beside the card's details: this printing in its
 * finish, and the card in every printing, each the inventory's Total Qty plus ours not in it yet.
 * Pointing at it shows a box in the price warnings' style: "We own X copies of this printing and Y copies
 * of this card", each printing we own, and what changes the card's rate: as shipped, 5% off for each copy of
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
  const num = (n) => {
    if (owned.status === 'loading') return '…';
    if (!ready) return '?';
    return unknown ? 'n/a' : String(n);
  };
  let unknownWhy = '';
  if (unknown) {
    if (c.inventoryAt == null) unknownWhy = 'No Master Crystal Inventory is uploaded, so what Crystal Commerce holds isn’t known.';
    else if (!c.cardSure) unknownWhy = 'The inventory was uploaded before it kept quantities: upload it again to count it.';
    else unknownWhy = 'Crystal Commerce has this card, but none of its products is clearly this printing (several could be, or none quite matches), so its count for this printing isn’t known. Click the boxes to pick its product (EXPORT asks the same); once one is chosen, the counts show here.';
  }
  // That last case can be settled here: the boxes open the export's choice for this one card (decision 468).
  const matchable = unknown && c.inventoryAt != null && c.cardSure && Boolean(onMatch);
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
  // Which printings (owner, 2026-10-22: "it has to show specifically, which printings we own").
  const thisMark = <span className="owned-this">this printing</span>;
  const ccRows = c?.cc.list.map((p) => (
    <li key={p.product_id ?? `${p.category}|${p.name}`} className={p.this ? 'is-this' : undefined}>
      <span className="owned-row-name" title={`${p.category} · ${p.name}`}>{ccRowText(p)}</span>
      {p.this && thisMark}
      <b>×{p.qty}</b>
    </li>
  ));
  const oursRows = c?.ours.list.map((p) => (
    <li key={`${p.scryfall_id}|${p.set_code}|${p.number}|${p.finish}`} className={p.this ? 'is-this' : undefined}>
      <span className="owned-row-name">
        {p.set_code} #{p.number}{p.set_name ? ` ${p.set_name}` : ''}{finishWord(p.finish) && ` · ${finishWord(p.finish)}`}
      </span>
      {p.this && thisMark}
      <b>×{p.qty}</b>
    </li>
  ));

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
        title={owned.status === 'failed' ? owned.error : matchable ? 'Click to pick its Crystal Commerce product' : undefined}
        onMouseEnter={() => setHover(true)}
        onClick={() => {
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
      {/* Applied or not, stamped (owner, 2026-10-23; decision 459): whenever there's a rate to apply. A click
          switches it, as Apply does (decision 461): the new one drops in over the old and lands, the old one
          fading only at the end (decision 462). */}
      {suggested && (
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
      )}
      {open && (
        <div className="owned-pop">
          <section className="owned-pop-box" aria-label="Copies we own">
            <div className="owned-pop-head">📦 Copies we own</div>
            {unknown ? (
              <>
                <p className="owned-pop-lead">The copies we own can&apos;t be counted for this printing.</p>
                <p className="owned-pop-note">{unknownWhy} Until then the rate isn&apos;t changed.</p>
              </>
            ) : (
              <p className="owned-pop-lead">
                We own {copies(c.printing)} of this printing and {copies(c.card)} of this card.
              </p>
            )}
            <div className="owned-pop-lists">
              <div className="owned-pop-sub">In Crystal Commerce ({c.cc.card ?? '?'})</div>
              {c.inventoryAt == null ? <p className="owned-pop-note">No inventory uploaded.</p>
                : !c.cardSure ? <p className="owned-pop-note">The inventory was uploaded before it kept quantities: upload it again to count it.</p>
                  : ccRows.length ? <ul className="owned-rows">{ccRows}</ul> : <p className="owned-pop-note">None.</p>}
              <div className="owned-pop-sub">Ours, not in it yet ({c.ours.card})</div>
              {oursRows.length ? <ul className="owned-rows">{oursRows}</ul> : <p className="owned-pop-note">None.</p>}
            </div>
            {/* What changes the rate, and why (decision 457); nothing when the counts aren't known (467). */}
            {!unknown && <div className="owned-pop-sub">The rate</div>}
            {unknown ? null : adjust && (adjust.bonus > 0 || adjust.cut > 0 || adjust.lowEndNoBonus) ? (
              <ul className="owned-adjust">
                {adjust.lowEndNoBonus && (
                  <li>No first-copy bonus on a low-end card{lowEndWhy ? ` (${lowEndWhy})` : ''}.</li>
                )}
                {adjust.firstPrinting && (
                  <li className="is-bonus">
                    <b>+{cfg.first_printing}%</b> first of this printing: we own none of it{finishWord(finish) ? ` in ${finishWord(finish)}` : ''}.
                  </li>
                )}
                {adjust.firstCard && (
                  <li className="is-bonus">
                    <b>+{cfg.first_card}% more</b>, first of this card: we own none of it in any printing.
                  </li>
                )}
                {adjust.cut > 0 && (
                  <li className="is-cut">
                    <b>−{adjust.cut}%</b> for {copies(adjust.over)} of the card over {cfg.free}
                    {' '}({cfg.step}% each, up to {cfg.cap}%).
                  </li>
                )}
              </ul>
            ) : (
              <p className="owned-pop-note">No change: we have this printing, and {cfg.free} or fewer of the card.</p>
            )}
            {adjust && adjust.bonus > 0 && adjust.cut > 0 && !suggested && (
              <p className="owned-pop-note">They cancel out: the card keeps its usual rate.</p>
            )}
            {suggested && (
              <>
                <p className="owned-pop-suggest">
                  {adjust.bonus > 0 && adjust.cut > 0 ? 'Together' : 'So'} <b>{signedPct(suggested.net)}</b>: {rates}
                </p>
                {auto?.on && !applyBlocked ? (
                  <p className="owned-pop-note">Auto apply rates is on: this card goes on at this rate.</p>
                ) : applyBlocked ? (
                  <p className="owned-pop-note">{applyBlocked}</p>
                ) : (
                  <button
                    type="button"
                    className={`btn small ${applied ? 'owned-undo' : 'primary'}`}
                    onClick={() => {
                      onApply();
                      onDone();
                    }}
                  >
                    {applied ? `✓ ${signedPct(suggested.net)} on ADD CARD: undo` : `Apply ${signedPct(suggested.net)}`}
                  </button>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

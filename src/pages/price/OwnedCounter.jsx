import { useEffect, useRef, useState } from 'react';
import { formatMoney, payout } from '../../lib/money.js';
import { OWNED_FREE, ccRowText, finishWord } from '../../lib/ownedRates.js';
import { useDismiss } from '../../lib/useDismiss.js';

const copies = (n) => `${n} ${n === 1 ? 'copy' : 'copies'}`;

/**
 * The copies we own (owner, 2026-10-22; decision 448), beside the card's details: this printing in its
 * finish, and the card in every printing, each the inventory's Total Qty plus ours not in it yet.
 * Pointing at it shows a box in the price warnings' style: "We own X copies of this printing and Y copies
 * of this card", and for each copy of the card over 2, 5% off its rate to apply with a click (it goes on
 * ADD CARD as the card's own rate). Above it, Auto apply rates? for the buy. Nothing changes a rate unless
 * the worker clicks Apply or checks the box.
 * @param {object} p
 * @param {object|null} p.candidate  the selected card, or null
 * @param {{ status: string, counts: object|null, error: string|null }} p.owned  useOwnedCopies
 * @param {{ cash: number, credit: number, cut: number }|null} p.suggested  the lower rates, or null (2 or fewer)
 * @param {boolean} p.applied  the suggestion goes on with ADD CARD (clicked, or Auto apply rates)
 * @param {string|null} p.applyBlocked  why it can't be applied here, or null
 * @param {number|null} p.price  the card's price, for the amounts
 * @param {() => void} p.onApply  toggles a clicked suggestion
 * @param {{ on: boolean, onChange: (on: boolean) => void, disabled: boolean }|null} p.auto  the box, or none
 * @param {() => void} p.onDone  back to the search field
 */
export default function OwnedCounter({ candidate, owned, suggested, applied, applyBlocked, price, onApply, auto, onDone }) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const box = useRef(null);

  // A new card starts closed.
  useEffect(() => {
    setHover(false);
    setPinned(false);
  }, [candidate?.key]);

  useDismiss(() => setPinned(false), { ref: box, when: pinned, escape: false });

  const autoBox = auto && (
    <label className="owned-auto" title="Every card added to this buy that we own more than 2 of goes on at the lower rate">
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

  if (!candidate || owned.status === 'off') {
    const why = !candidate ? 'Copies we own appear here' : 'Copies we own: Magic only for now';
    return (
      <div className="owned">
        {autoBox}
        <div className="owned-empty">{why}</div>
      </div>
    );
  }

  const c = owned.counts;
  const ready = owned.status === 'ok';
  const open = ready && (hover || pinned);
  const num = (n, sure) => {
    if (owned.status === 'loading') return '…';
    if (!ready) return '?';
    return `${n}${sure ? '' : '+'}`;
  };
  // Under the boxes (owner, 2026-10-22: the boxes half as tall): the lower rate there is, or that it's on.
  const tag = suggested ? (
    <span className={`owned-tag${applied ? ' on' : ''}`}>
      {applied ? `✓ ${suggested.cut}% lower on` : `${suggested.cut}% lower?`}
    </span>
  ) : null;
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
        className={`owned-boxes${suggested ? ' hot' : ''}${applied ? ' applied' : ''}${pinned ? ' on' : ''}`}
        aria-expanded={open}
        aria-label={ready ? `We own ${copies(c.printing)} of this printing and ${copies(c.card)} of this card` : 'Copies we own'}
        title={owned.status === 'failed' ? owned.error : undefined}
        onMouseEnter={() => setHover(true)}
        onClick={() => {
          setPinned((p) => !p);
          onDone();
        }}
      >
        <span className="owned-box printing">
          <span className="owned-label">This printing</span>
          <b className="owned-num">{num(c?.printing, c?.printingSure)}</b>
        </span>
        <span className="owned-box card">
          <span className="owned-label">All printings</span>
          <b className="owned-num">{num(c?.card, c?.cardSure)}</b>
        </span>
      </button>
      {tag}
      {open && (
        <div className="owned-pop">
          <section className="owned-pop-box" aria-label="Copies we own">
            <div className="owned-pop-head">📦 Copies we own</div>
            <p className="owned-pop-lead">
              We own {copies(c.printing)} of this printing and {copies(c.card)} of this card.
            </p>
            <div className="owned-pop-lists">
              <div className="owned-pop-sub">In Crystal Commerce ({c.cc.card ?? '?'})</div>
              {c.inventoryAt == null ? <p className="owned-pop-note">No inventory uploaded.</p>
                : !c.cardSure ? <p className="owned-pop-note">The inventory was uploaded before it kept quantities: upload it again to count it.</p>
                  : ccRows.length ? <ul className="owned-rows">{ccRows}</ul> : <p className="owned-pop-note">None.</p>}
              {c.inventoryAt != null && c.cardSure && !c.printingSure && (
                <p className="owned-pop-note">No clear Crystal Commerce product for this printing: its copies there aren&apos;t counted in it.</p>
              )}
              <div className="owned-pop-sub">Ours, not in it yet ({c.ours.card})</div>
              {oursRows.length ? <ul className="owned-rows">{oursRows}</ul> : <p className="owned-pop-note">None.</p>}
            </div>
            {suggested ? (
              <>
                <p className="owned-pop-suggest">
                  {copies(c.card - OWNED_FREE)} over {OWNED_FREE}: {suggested.cut}% lower,{' '}
                  <span className="is-credit">Credit {suggested.credit}%</span> /{' '}
                  <span className="is-cash">Cash {suggested.cash}%</span>
                  {price != null && ` (${formatMoney(payout(price, suggested.credit))} / ${formatMoney(payout(price, suggested.cash))})`}
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
                    {applied ? `✓ ${suggested.cut}% lower on ADD CARD: undo` : `Apply ${suggested.cut}% lower`}
                  </button>
                )}
              </>
            ) : (
              <p className="owned-pop-note">No lower rate: we own {OWNED_FREE} or fewer of this card.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

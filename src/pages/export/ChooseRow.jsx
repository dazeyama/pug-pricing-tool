import { useEffect, useState } from 'react';
import { useSellFloor } from '../../state/settings.jsx';
import { formatMoney } from '../../lib/money.js';
import { openPopup, popupName } from '../../lib/popup.js';
import { searchProducts } from '../../lib/ccExport.js';

// One card's choice of Crystal Commerce product (export spec 7.3): the export dialog's Needs a choice and
// Change, and the Price screen's matching of one card from its owned-copies counter (decision 468).

/**
 * The card's exact printing on Scryfall, by its set and collector number
 * (owner, 2026-10-15), for telling look-alike products apart.
 */
const scryfallCardUrl = (line) => (line.set_code && line.collector_number
  ? `https://scryfall.com/card/${encodeURIComponent(line.set_code.toLowerCase())}/${encodeURIComponent(line.collector_number)}`
  : null);

/**
 * One card's choices: its candidates, "None of these", a search and (when
 * exporting) a Sell price box. In Needs a choice nothing is selected yet and
 * a pick applies at once. A matched card opened with Change has its product
 * (`current`) selected and the app's own match (`detected`) marked, and works
 * as a draft: Done applies the pick and the price, Cancel drops them (owner,
 * 2026-10-01). `allowNone` false leaves "None of these" out (the Price screen's matching, decision 468: it only
 * means something to an export). `tagOf` adds chips after a candidate's category (the matching audit's key, stock and
 * score, decision 547); the export dialog passes none.
 */
export default function ChooseRow({
  r, label, price, current = null, detected = null, sell, manual, onManual, always, onAlways, onPick, onNone,
  onDone, onCancel, heldNote = null, allowNone = true, tagOf = null,
}) {
  const draft = Boolean(onDone);
  const [draftPick, setDraftPick] = useState(null);     // a product, or 'none' (Change, until Done)
  const [draftPrice, setDraftPrice] = useState(null);   // { value } typed (Change, until Done)
  const [text, setText] = useState('');
  const [typed, setTyped] = useState(manual != null ? manual.toFixed(2) : '');
  const [typedError, setTypedError] = useState(null);
  const floor = useSellFloor();   // a typed Sell price can't go under it either (decision 417)
  const [found, setFound] = useState([]);
  const [chosen, setChosen] = useState(current?.product_id ?? null);
  useEffect(() => {
    const q = text.trim();
    if (q.length < 2) {
      setFound([]);
      return undefined;
    }
    let alive = true;
    const t = setTimeout(() => {
      searchProducts(q).then((rows) => alive && setFound(rows)).catch(() => alive && setFound([]));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [text]);

  /** The Sell price box (export mode): empty uses the worked-out price. */
  function typePrice(value) {
    setTyped(value);
    const clean = value.replace(/[$,\s]/g, '');
    const n = Number(clean);
    const ok = !clean || (Number.isFinite(n) && n >= floor && n < 100000);
    const price = clean && ok ? Math.round(n * 100) / 100 : null;
    setTypedError(ok ? null : `At least ${formatMoney(floor)}, or leave it empty`);
    if (draft) {
      if (ok) setDraftPrice({ value: price });
    } else {
      onManual(price, ok);
    }
  }

  /** Change's Done: apply the draft (a different product, None, the price). */
  function done() {
    if (typedError) return;
    if (draftPrice) onManual(draftPrice.value, true);
    if (draftPick === 'none') onNone();
    else if (draftPick && draftPick.product_id !== current?.product_id) onPick(draftPick);
    onDone();
  }

  const fits = r.ranked.filter((x) => x.score != null).map((x) => x.product);
  const others = r.ranked.filter((x) => x.score == null).map((x) => x.product);
  // Its product now and the app's own match, listed first if they aren't candidates.
  const listed = (p) => r.ranked.some((x) => x.product.product_id === p.product_id);
  const extra = [current, detected].filter((p, i, all) => p && !listed(p)
    && all.findIndex((q) => q?.product_id === p.product_id) === i);
  const option = (p, note) => (
    <label key={`${p.product_id}`} className={`xd-option${note ? ' off' : ''}`}>
      <input
        type="radio"
        name={`xd-${r.line.id}`}
        checked={chosen === p.product_id}
        onChange={() => {
          setChosen(p.product_id);
          if (draft) setDraftPick(p);
          else onPick(p);
        }}
      />
      <span className="xd-product">
        {p.product_name}
        <span className="xd-cat">{p.category}</span>
        {tagOf?.(p)}
        {note && <span className="xd-note">{note}</span>}
        {detected?.product_id === p.product_id && (
          <span className="xd-tag" title="The product the app matched by itself">detected</span>
        )}
      </span>
    </label>
  );

  const scryfall = scryfallCardUrl(r.line);
  return (
    // Held after its pick (decision 440): greyed, and inert so a click meant for the next card does nothing.
    <div className={`xd-choose${onDone ? ' editing' : ''}${heldNote ? ' held' : ''}`} inert={heldNote ? true : undefined}>
      {heldNote && <span className="xd-held-note">{heldNote}</span>}
      <div className="xd-row">
        {label}
        {/* In the Price screen's reused Scryfall pop-up (lib/popup.js), owner 2026-10-15. */}
        {scryfall && (
          <a
            className="btn small ghost xd-scryfall"
            href={scryfall}
            target={popupName('scryfall')}
            referrerPolicy="no-referrer"
            onClick={(e) => openPopup(e, 'scryfall')}
            title={`${r.line.set_code.toUpperCase()} ${r.line.collector_number} on Scryfall`}
          >
            View on Scryfall ↗
          </a>
        )}
        {price}
        {draft && (
          <span className="xd-edit-buttons">
            <button type="button" className="btn small ghost" title="Leave this card as it was" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="btn small primary"
              disabled={Boolean(typedError)}
              title={typedError ? 'Fix the Sell price first' : 'Keep these changes'}
              onClick={done}
            >
              Done
            </button>
          </span>
        )}
      </div>
      {r.wasLinked && (
        <p className="hint xd-was">
          Used to be {r.wasLinked.product_name} ({r.wasLinked.category}), which isn't in the current inventory.
        </p>
      )}
      <div className="xd-options">
        {extra.map((p) => option(p, null))}
        {fits.map((p) => option(p, null))}
        {others.map((p) => option(p, 'a different finish or number'))}
        {found.filter((p) => !r.ranked.some((x) => x.product.product_id === p.product_id)).map((p) => option(p, 'found by search'))}
        {allowNone && (
          <label className="xd-option none">
            <input
              type="radio"
              name={`xd-${r.line.id}`}
              checked={chosen === 'none'}
              onChange={() => {
                setChosen('none');
                if (draft) setDraftPick('none');
                else onNone();
              }}
            />
            <span>None of these (can't upload)</span>
          </label>
        )}
      </div>
      <input
        type="search"
        className="xd-search"
        placeholder="Find another CC product…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {sell && (
        <label className="xd-manual">
          Sell price $
          <input
            type="text"
            inputMode="decimal"
            className={typedError ? 'bad' : undefined}
            placeholder={sell.price.toFixed(2)}
            aria-label="Sell price, optional"
            value={typed}
            onChange={(e) => typePrice(e.target.value)}
          />
          <span className={typedError ? 'xd-reason' : 'hint'}>
            {typedError ?? `Optional: leave it empty to use ${formatMoney(sell.price)}`}
          </span>
        </label>
      )}
      {!r.category && (
        <label className="inline xd-always">
          <input type="checkbox" checked={always} onChange={(e) => onAlways(e.target.checked)} />
          Always use the picked product's category for {r.set.name} ({String(r.set.code).toUpperCase()})
        </label>
      )}
    </div>
  );
}

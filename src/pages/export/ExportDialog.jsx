import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../../components/Modal.jsx';
import LinePreview, { previewFor } from '../../components/LinePreview.jsx';
import { useStaff } from '../../state/staff.jsx';
import { useSettings } from '../../state/settings.jsx';
import { useDevice } from '../../state/device.jsx';
import { useToast } from '../../components/Toast.jsx';
import { lineTextWithCondition } from '../../lib/lineFormat.js';
import { formatMoney } from '../../lib/money.js';
import { openPopup, popupName } from '../../lib/popup.js';
import { CONDITION_WORDS, customSkuFor, customSkuForDay, massCreateRows, nearMintPrices, productKey } from '../../lib/massCreate.js';
import {
  downloadMassCreate, exportLanded, forgetLink, linkKey, matchLines, saveExport, saveLink, saveSetMap, searchProducts,
  sellPrices,
} from '../../lib/ccExport.js';
import { uuid } from '../../lib/uuid.js';
import { SECOND_LOOK_MS, pause } from '../../lib/timeout.js';

// The export dialog (docs/EXPORT_FUNCTION.md 8.3): Matching, then Review in
// three groups (Needs a choice, Matched, Can't upload). In 'check' mode (the
// dry run, Phase E2) staff's picks are saved as they're made and nothing is
// exported. In 'export' mode (Phase E3) Matching also fetches today's prices
// for the Sell Prices, and Review leads to Confirm (the red pull-out list)
// and the export itself; picks are saved with the export.

/**
 * @param {object} p
 * @param {{ line: object, where: string }[]} p.items  the Magic lines, each with where it's from ("Buy 4")
 * @param {'check'|'export'} [p.mode]
 * @param {string} p.title
 * @param {object} [p.target]  export_lines' target (export mode)
 * @param {string} [p.fileName]  the Mass Create file's name (export mode)
 * @param {(result: object) => void} [p.onExported]  after the export is saved and the file handed over
 * @param {string|null} [p.fileOnly]  the file only, nothing saved (a collection not Paid/Ours, team
 *   feedback 2026-10-16: export "should always" be allowed; the owner: "File only, change nothing"):
 *   its status, as the dialog says it ("Processing")
 * @param {boolean} [p.pullOut]  can't-upload cards must be pulled from the batch (false: Can't upload
 *   cards itself, whose cards are already out of it; spec 9.3)
 * @param {() => void} p.onClose
 */
export default function ExportDialog({
  items: itemsNow, mode = 'check', title, target: targetNow, fileName, onExported, onClose, pullOut = true, fileOnly = null,
}) {
  // The cards and the buys' versions as they were when it opened, kept for
  // as long as it's open (owner, 2026-10-14: an export kept starting over
  // while staff fixed matches by hand). The page behind reloads whenever any
  // buy changes, a card added at the counter on another computer included,
  // and hands over the same cards anew; matching again then threw away every
  // pick and typed price. A buy that really changed meanwhile is caught when
  // saving (stale_version, from these versions).
  const [{ items, target }, setFrozen] = useState(() => ({ items: itemsNow, target: targetNow }));
  // What the page hands over now, for a save refused as stale_version (decision 362).
  const latest = useRef(null);
  latest.current = { items: itemsNow, target: targetNow };
  // Stamped in every card's Sell Price basis, so an export whose answer was lost can be told
  // from another computer's export of the same cards (exportLanded, decision 362).
  const [exportId] = useState(() => uuid());
  const lostAnswer = useRef(false);   // a save failed with no answer: it may have gone through
  const staff = useStaff();
  const toast = useToast();
  const { deviceId } = useDevice();
  const { values: settings } = useSettings();
  const exporting = mode === 'export';
  const [phase, setPhase] = useState('matching');   // matching | review | confirm | saving | error
  const [run, setRun] = useState(0);                // bumped to match again (the inventory changed)
  const [stepText, setStepText] = useState('');
  const [error, setError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [results, setResults] = useState([]);
  const [sells, setSells] = useState(new Map());    // line id → { price, basis } (export mode)
  const [picks, setPicks] = useState(new Map());      // line id → { product } | { none: true }
  const [reopened, setReopened] = useState(new Set()); // matched or can't-upload lines sent back to choose
  const [always, setAlways] = useState(new Map());    // line id → remember its set's category (unknown categories)
  const [editing, setEditing] = useState(new Set());  // matched lines opened with Change
  const [manual, setManual] = useState(new Map());    // line id → a Sell Price typed by staff (export mode)
  const [badManual, setBadManual] = useState(new Set()); // lines whose typed Sell Price isn't valid
  const [pulled, setPulled] = useState(false);
  const [preview, setPreview] = useState(null);
  const hidePreview = useCallback(() => setPreview(null), []);
  const box = useRef(null);
  // Off only where staff unticked it: "always pick this for the set" starts ticked.
  const alwaysOf = (id) => always.get(id) ?? true;

  const lines = useMemo(() => items.map((i) => i.line), [items]);
  const whereOf = useMemo(() => new Map(items.map((i) => [i.line.id, i.where])), [items]);
  const pct = settings.fallback_pct_mtg;
  const pctRef = useRef(pct);
  pctRef.current = pct;

  useEffect(() => {
    let alive = true;
    setPhase('matching');
    (async () => {
      const step = (t) => alive && setStepText(t);
      const { results: r, cards } = await matchLines(lines, step);
      const s = exporting ? await sellPrices(lines, cards, pctRef.current, step) : new Map();
      if (!alive) return;
      setResults(r);
      setSells(s);
      setPicks(new Map());
      setReopened(new Set());
      setEditing(new Set());
      setManual(new Map());
      setBadManual(new Set());
      setPhase('review');
    })().catch((e) => {
      if (!alive) return;
      setError(e.message);
      setPhase('error');
    });
    return () => {
      alive = false;
    };
  }, [lines, exporting, run]);

  /** Where a line stands now: matched (with its product), choose, or cant. */
  const stateOf = (r) => {
    const pick = picks.get(r.line.id);
    if (pick?.product) return { group: 'matched', product: pick.product, by: 'staff' };
    if (pick?.none) return { group: 'cant', reason: 'none' };
    if (reopened.has(r.line.id)) return { group: 'choose' };
    if (r.status === 'auto') return { group: 'matched', product: r.product, by: r.via };
    if (r.status === 'choose') return { group: 'choose' };
    return { group: 'cant', reason: 'nothing' };
  };
  /** A line's Sell Price: typed by staff in Change, else worked out (export spec 5). */
  const sellOf = (id) => {
    const s = sells.get(id);
    const typed = manual.get(id);
    if (!s || typed == null) return s ?? null;
    return { price: typed, basis: { ...s.basis, used: 'staff', staff: typed, worked: s.price } };
  };
  const groups = { choose: [], matched: [], cant: [] };
  for (const r of results) groups[stateOf(r).group].push(r);
  const cardsIn = (rs) => rs.reduce((n, r) => n + r.line.quantity, 0);

  /**
   * Staff pick a product: for every line of the same printing and finish.
   * Picking the product the app found itself is no choice at all: the lines
   * go back to their automatic match, and nothing is remembered as staff's
   * (owner, 2026-10-01: Change is mostly for typing Sell prices).
   */
  async function pick(r, product) {
    const key = linkKey(r.line);
    const same = results.filter((x) => linkKey(x.line) === key);
    const detected = r.status === 'auto' && r.product?.product_id === product.product_id;
    const hadPick = Boolean(picks.get(r.line.id)?.product);
    setPicks((m) => {
      const next = new Map(m);
      for (const x of same) {
        if (detected && x.status === 'auto' && x.product?.product_id === product.product_id) next.delete(x.line.id);
        else next.set(x.line.id, { product });
      }
      return next;
    });
    if (mode !== 'check') return;
    if (detected) {
      // The dry run saved the other pick: put the remembered product back as it was.
      if (!hadPick) return;
      try {
        if (r.via === 'link') await saveLink(r.line, product, r.link?.linked_by ?? staff.current?.id, r.link?.source ?? 'staff');
        else await forgetLink(r.line);
      } catch (e) {
        toast(e.message, 'err');
      }
      return;
    }
    try {
      await saveLink(r.line, product, staff.current?.id);
      if (!r.category && alwaysOf(r.line.id)) {
        await saveSetMap(r.set.code, r.promo, product.category, staff.current?.id);
      }
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  function chooseNone(r) {
    setPicks((m) => new Map(m).set(r.line.id, { none: true }));
    setEditing((s) => {
      const next = new Set(s);
      next.delete(r.line.id);
      return next;
    });
  }

  /** Change on a matched card: its editor opens in place, its product still selected. */
  function edit(r, open) {
    setEditing((s) => {
      const next = new Set(s);
      if (open) next.add(r.line.id);
      else next.delete(r.line.id);
      return next;
    });
  }

  /** "Find a product…" on a can't-upload card: back to Needs a choice. */
  function reopen(r) {
    setPicks((m) => {
      const next = new Map(m);
      next.delete(r.line.id);
      return next;
    });
    setReopened((s) => new Set(s).add(r.line.id));
  }

  // The Custom SKU the server will stamp (0071): a day page's is its day; a single buy's
  // that day with the buy's number; a collection's, project's or Can't upload's is today's.
  const skuText = target?.kind === 'day' ? customSkuForDay(target.day)
    : target?.kind === 'buy' && target.day ? `${customSkuForDay(target.day)}-${target.number}`
      : customSkuFor(new Date());
  /** The matched lines as the file will have them: its rows (the Confirm step's count) and NM prices. */
  const fileLines = groups.matched.map((r) => ({
    cc_status: 'exported',
    quantity: r.line.quantity,
    cc_product_name: stateOf(r).product.product_name,
    cc_category: stateOf(r).product.category,
    cc_condition: CONDITION_WORDS[r.line.condition],
    cc_sell_price: sellOf(r.line.id)?.price,
  }));
  const previewRows = () => massCreateRows(fileLines, pct);
  // Worse-condition cards' products the file prices at Near Mint (owner, 2026-10-11).
  const nearMint = exporting ? nearMintPrices(fileLines, pct) : new Map();

  async function save() {
    // The file only: downloaded as it would be, its Custom SKU today's; nothing saved, so no user needed.
    if (fileOnly) {
      const sku = customSkuFor(new Date());
      const rows = toExport > 0 ? downloadMassCreate(fileLines.map((l) => ({ ...l, cc_custom_sku: sku })), fileName, pct) : 0;
      onExported?.({ fileOnly: true, rows, cards: toExport, sku });
      return;
    }
    if (!staff.current) {
      staff.pulse();
      return;
    }
    setPhase('saving');
    setSaveError(null);
    const matches = groups.matched.map((r) => {
      const s = stateOf(r);
      const sell = sellOf(r.line.id);
      return {
        line_id: r.line.id,
        product_id: s.product.product_id,
        sell_price: sell.price,
        // The condition's percentage, so the same file comes out again later (massCreate.js).
        sell_basis: { ...sell.basis, conditionPct: pct?.[r.line.condition] != null ? Number(pct[r.line.condition]) : null, exportId },
        link: s.by === 'staff' ? 'staff' : s.by === 'match' ? 'auto' : null,
      };
    });
    const setMaps = groups.matched
      .filter((r) => stateOf(r).by === 'staff' && !r.category && alwaysOf(r.line.id))
      .map((r) => ({ scryfall_set: r.set.code, promo_kind: r.promo ?? '', category: stateOf(r).product.category }));
    try {
      const result = await saveExport({
        target,
        matches,
        cant: groups.cant.map((r) => r.line.id),
        setMaps,
        userId: staff.current.id,
        deviceId,
      });
      const rows = result.cards > 0 ? downloadMassCreate(result.lines, fileName, pct) : 0;
      onExported?.({ ...result, rows });
    } catch (e) {
      if (e.code === 'stale_inventory') {
        toast(e.message, 'err');
        setRun((n) => n + 1);
        return;
      }
      // A lost answer (flaky wifi) is no answer at all, or, on the next try, the refusals of an
      // export already saved. The cards say whether this dialog's export went through; if it did,
      // the file comes from them (decision 362). Can't upload cards' exported copies are gone, but
      // the cards they were copied from are restamped with their stamps, this export's id
      // included: those are read instead (decision 387).
      if (!e.code) lostAnswer.current = true;
      const ids = target?.kind === 'cant_upload'
        ? matches.map((m) => lines.find((l) => l.id === m.line_id)?.source_line_id ?? null)
        : matches.map((m) => m.line_id);
      const knowable = matches.length > 0 && ids.every(Boolean);
      let checked = false;
      if (knowable && (!e.code || e.code === 'stale_version' || e.code === 'nothing_to_export')) {
        try {
          let landed = await exportLanded(ids, exportId);
          // No answer at all: the save may still be running. Looked at once more (decision 371).
          if (!landed && !e.code) {
            await pause(SECOND_LOOK_MS);
            landed = await exportLanded(ids, exportId);
          }
          if (landed) {
            const cards = landed.reduce((n, l) => n + l.quantity, 0);
            const rows = cards > 0 ? downloadMassCreate(landed, fileName, pct) : 0;
            onExported?.({ cards, cant: cardsIn(groups.cant), sku: landed[0].cc_custom_sku, lines: landed, rows });
            return;
          }
          checked = true;
        } catch {
          // Still no connection: said below.
        }
      }
      if (e.code === 'stale_version') {
        const now = latest.current;
        const same = sameCards(items, now.items);
        if (lostAnswer.current && !checked) {
          setSaveError('Something changed since this opened (on another computer, or this export, if its answer was lost): Cancel and look at the page before exporting again.');
        } else if (same && JSON.stringify(now.target) !== JSON.stringify(target)) {
          // A buy changed but not its cards (a note, a payment): the picks stand, saved against its version now.
          setFrozen({ items, target: now.target });
          setSaveError('A buy here changed on another computer, but not its cards: nothing was exported yet. Press Export again to go ahead.');
        } else {
          setSaveError(same
            ? 'Something changed on another computer since this opened: nothing was exported. Cancel, then EXPORT again.'
            : 'The cards changed on another computer since this opened: nothing was exported. Cancel, then EXPORT again to see the change.');
        }
      } else if (!e.code) {
        setSaveError(checked
          ? `${e.message}: it didn't go through. Try again: the same cards can't be exported twice.`
          : `${e.message}. If the connection dropped, it may have exported anyway: Cancel and look at the page before trying again.`);
      } else {
        setSaveError(e.message);
      }
      setPhase('confirm');
    }
  }

  const sellNote = (r) => {
    const sell = sellOf(r.line.id);
    if (!sell) return null;
    const st = stateOf(r);
    const nm = r.line.condition !== 'NM' && st.group === 'matched'
      ? nearMint.get(productKey(st.product.product_name, st.product.category)) ?? null
      : null;
    const why = {
      manual: 'the manual price (higher than today’s), rounded up',
      today: 'today’s price, rounded up',
      at_buy: 'no price today: the market price at the buy, rounded up',
      staff: `typed here (worked out: ${formatMoney(sell.basis.worked)})`,
    }[sell.basis.used];
    return (
      <span className="xd-price" title={`Sell Price from ${why}${sell.basis.floored && sell.basis.used !== 'staff' ? ', raised to the $0.40 floor' : ''}`}>
        Bought {formatMoney(r.line.unit_price)} → Sell <strong>{formatMoney(sell.price)}</strong>
        {sell.basis.used === 'at_buy' && <span className="xd-note">no price today</span>}
        {sell.basis.used === 'staff' && <span className="xd-note">set by hand</span>}
        {nm && (
          <span
            className="xd-note"
            title={`Crystal Commerce prices every condition from Near Mint: the file sets Near Mint to ${formatMoney(nm.price)} `
              + `(${nm.from} Sell ${formatMoney(nm.sell)} ÷ ${nm.pct}%, rounded up) and adds this card with no price`}
          >
            sets NM {formatMoney(nm.price)}
          </span>
        )}
      </span>
    );
  };

  /** What every ChooseRow gets: its line, prices, and the pick / price handlers. */
  const rowProps = (r) => ({
    r,
    label: lineLabel(r),
    price: sellNote(r),
    sell: exporting ? sells.get(r.line.id) ?? null : null,
    manual: manual.get(r.line.id) ?? null,
    onManual: (value, ok) => {
      setManual((m) => {
        const next = new Map(m);
        if (ok && value != null) next.set(r.line.id, value);
        else next.delete(r.line.id);
        return next;
      });
      setBadManual((s) => {
        const next = new Set(s);
        if (ok) next.delete(r.line.id);
        else next.add(r.line.id);
        return next;
      });
    },
    always: alwaysOf(r.line.id),
    onAlways: (v) => setAlways((m) => new Map(m).set(r.line.id, v)),
    onPick: (product) => pick(r, product),
    onNone: () => chooseNone(r),
  });

  const lineLabel = (r) => (
    <span
      className="xd-line"
      onMouseEnter={(e) => setPreview(previewFor(r.line.image_url, e.currentTarget, box.current, 'left'))}
      onMouseLeave={hidePreview}
    >
      {lineTextWithCondition(r.line)}
      <span className="xd-where">{whereOf.get(r.line.id)}</span>
    </span>
  );

  const toExport = cardsIn(groups.matched);
  const cantCards = cardsIn(groups.cant);
  const saving = phase === 'saving';
  let footer;
  if (!exporting || phase === 'matching' || phase === 'error') {
    footer = (
      <button type="button" className="btn primary" onClick={onClose} autoFocus>
        {exporting ? 'Cancel' : 'Close'}
      </button>
    );
  } else if (phase === 'review') {
    // A bad typed price only matters while its box is showing (Needs a choice, or Change).
    const badTyped = [...groups.choose, ...groups.matched.filter((r) => editing.has(r.line.id))]
      .some((r) => badManual.has(r.line.id));
    const waiting = groups.choose.length > 0 || badTyped;
    footer = (
      <>
        <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        <button
          type="button"
          className="btn primary"
          disabled={waiting}
          title={badTyped ? 'Fix the Sell price you typed first (at least $0.40, or leave it empty)'
            : waiting ? 'Pick a product (or None of these) for every card in Needs a choice first' : undefined}
          onClick={() => {
            setPulled(false);
            setSaveError(null);
            setPhase('confirm');
          }}
        >
          Continue
        </button>
      </>
    );
  } else {
    const blocked = (pullOut && cantCards > 0 && !pulled) || ((!pullOut || fileOnly) && toExport === 0) || saving;
    footer = (
      <>
        <button type="button" className="btn ghost" disabled={saving} onClick={() => setPhase('review')}>Back</button>
        <button
          type="button"
          className={`btn primary${saving ? ' busy' : ''}`}
          disabled={blocked}
          title={pullOut && cantCards > 0 && !pulled ? 'Tick “I’ve pulled these cards out of the batch” first'
            : (!pullOut || fileOnly) && toExport === 0 ? 'Nothing matched: there’s nothing to export' : undefined}
          onClick={save}
        >
          {fileOnly ? `Download the file (${toExport} card${toExport === 1 ? '' : 's'})`
            : toExport > 0 ? `Export ${toExport} card${toExport === 1 ? '' : 's'}` : 'Mark them Can’t upload'}
        </button>
      </>
    );
  }

  return (
    <Modal wide className="xd-modal" title={title} onClose={saving ? undefined : onClose} footer={footer}>
      <div className="xd" ref={box}>
        {phase === 'matching' && <p className="loading-note xd-step">{stepText || 'Matching…'}</p>}
        {phase === 'error' && <div className="banner err">{error}</div>}
        {phase === 'review' && (
          <>
            {mode === 'check' && (
              <p className="hint xd-intro">
                A dry run: nothing is exported. Products you pick here are remembered for next time.
              </p>
            )}
            {groups.choose.length > 0 && (
              <section className="xd-group choose">
                <h4>Needs a choice <span className="xd-count">{groups.choose.length}</span></h4>
                {groups.choose.map((r) => (
                  <ChooseRow key={r.line.id} {...rowProps(r)} />
                ))}
              </section>
            )}
            <section className="xd-group matched">
              <details open={groups.matched.length <= 8}>
                <summary>
                  <h4>Matched <span className="xd-count">{groups.matched.length}</span></h4>
                </summary>
                {groups.matched.map((r) => {
                  const s = stateOf(r);
                  if (editing.has(r.line.id)) {
                    return (
                      <ChooseRow
                        key={r.line.id}
                        {...rowProps(r)}
                        current={s.product}
                        detected={r.status === 'auto' ? r.product : null}
                        onDone={() => edit(r, false)}
                        onCancel={() => edit(r, false)}
                      />
                    );
                  }
                  return (
                    <div key={r.line.id} className="xd-row">
                      {lineLabel(r)}
                      <span className="xd-arrow">→</span>
                      <span className="xd-product">
                        {s.product.product_name}
                        <span className="xd-cat">{s.product.category}</span>
                        {s.by === 'link' && <span className="xd-tag" title="Remembered from before">remembered</span>}
                        {s.by === 'staff' && <span className="xd-tag">picked</span>}
                      </span>
                      {sellNote(r)}
                      <button
                        type="button"
                        className="btn small ghost xd-change"
                        title={exporting ? 'Set its Sell price by hand, or pick another product' : 'Pick another product'}
                        onClick={() => edit(r, true)}
                      >
                        Change
                      </button>
                    </div>
                  );
                })}
                {!groups.matched.length && <p className="hint">None yet.</p>}
              </details>
            </section>
            {groups.cant.length > 0 && (
              <section className="xd-group cant">
                <h4>Can't upload <span className="xd-count">{groups.cant.length}</span></h4>
                {groups.cant.map((r) => (
                  <div key={r.line.id} className="xd-row">
                    {lineLabel(r)}
                    <span className="xd-reason">
                      {stateOf(r).reason === 'none' ? 'set to “None of these”' : 'no Crystal Commerce product with this name'}
                      {r.category ? ` in ${[r.category, ...(r.also ?? [])].join(' or ')}` : ''}
                    </span>
                    <button type="button" className="btn small ghost xd-change" onClick={() => reopen(r)}>Find a product…</button>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
        {(phase === 'confirm' || phase === 'saving') && (
          <>
            {saveError && <div className="banner err">{saveError}</div>}
            <p className="xd-summary">
              {fileOnly ? (
                <>
                  Download a Crystal Commerce Mass Create file of <strong>{toExport} card{toExport === 1 ? '' : 's'}</strong>{' '}
                  ({previewRows().length} row{previewRows().length === 1 ? '' : 's'}), Custom SKU{' '}
                  <strong>{skuText}</strong>. <strong>Nothing is saved:</strong> it stays {fileOnly}, and its
                  cards aren't marked exported, so they can be exported again.
                </>
              ) : toExport > 0 ? (
                <>
                  Export <strong>{toExport} card{toExport === 1 ? '' : 's'}</strong> ({previewRows().length} row
                  {previewRows().length === 1 ? '' : 's'}) to a Crystal Commerce Mass Create file, Custom SKU{' '}
                  <strong>{skuText}</strong>.{' '}
                  {pullOut ? <>The cards here become <strong>Completed</strong>.</> : <>They leave Can't upload cards.</>}
                </>
              ) : pullOut ? (
                <>Nothing here matched a Crystal Commerce product, so there's no file. The cards become <strong>Completed</strong>.</>
              ) : (
                <>Nothing here matched a Crystal Commerce product, so there's nothing to export.</>
              )}
            </p>
            {!pullOut && cantCards > 0 && (
              <p className="xd-summary">
                <strong>{cantCards}</strong> still can't upload and stay{cantCards === 1 ? 's' : ''} in Can't upload cards.
              </p>
            )}
            {pullOut && cantCards > 0 && (
              <div className="xd-pull" role="alert">
                <h3>Pull {cantCards === 1 ? 'this card' : `these ${cantCards} cards`} out of the batch before uploading.</h3>
                <ul>
                  {groups.cant.map((r) => (
                    <li key={r.line.id}>
                      {lineTextWithCondition(r.line)} <span className="xd-where">{whereOf.get(r.line.id)}</span>
                    </li>
                  ))}
                </ul>
                <p className="hint">
                  They won't be in the file. They'll be marked <strong>Can't upload</strong> here and copied to the{' '}
                  <strong>Can't upload cards</strong> collection.
                </p>
                <label className="xd-pulled">
                  <input type="checkbox" checked={pulled} disabled={saving} onChange={(e) => setPulled(e.target.checked)} />
                  I've pulled {cantCards === 1 ? 'this card' : 'these cards'} out of the batch
                </label>
              </div>
            )}
          </>
        )}
      </div>
      <LinePreview preview={preview} onHide={hidePreview} />
    </Modal>
  );
}

/** The same cards as when the dialog opened, as the page has them now (decision 362). */
const sameCards = (a, b) => a.length === b.length
  && a.every((x, i) => JSON.stringify(x.line) === JSON.stringify(b[i].line));

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
 * 2026-10-01).
 */
function ChooseRow({
  r, label, price, current = null, detected = null, sell, manual, onManual, always, onAlways, onPick, onNone,
  onDone, onCancel,
}) {
  const draft = Boolean(onDone);
  const [draftPick, setDraftPick] = useState(null);     // a product, or 'none' (Change, until Done)
  const [draftPrice, setDraftPrice] = useState(null);   // { value } typed (Change, until Done)
  const [text, setText] = useState('');
  const [typed, setTyped] = useState(manual != null ? manual.toFixed(2) : '');
  const [typedError, setTypedError] = useState(null);
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
    const ok = !clean || (Number.isFinite(n) && n >= 0.4 && n < 100000);
    const price = clean && ok ? Math.round(n * 100) / 100 : null;
    setTypedError(ok ? null : 'At least $0.40, or leave it empty');
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
        {note && <span className="xd-note">{note}</span>}
        {detected?.product_id === p.product_id && (
          <span className="xd-tag" title="The product the app matched by itself">detected</span>
        )}
      </span>
    </label>
  );

  const scryfall = scryfallCardUrl(r.line);
  return (
    <div className={`xd-choose${onDone ? ' editing' : ''}`}>
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

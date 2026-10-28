import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../../components/Modal.jsx';
import LinePreview, { previewFor } from '../../components/LinePreview.jsx';
import { useStaff } from '../../state/staff.jsx';
import { useBulkCut, useSellFloor, useSettings, useSettingsReady } from '../../state/settings.jsx';
import { useDevice } from '../../state/device.jsx';
import { useToast } from '../../components/Toast.jsx';
import { lineTextWithCondition } from '../../lib/lineFormat.js';
import { formatMoney } from '../../lib/money.js';
import { CONDITION_WORDS, confirmSku, customSkuFor, massCreateRows, nearMintPrices, productKey } from '../../lib/massCreate.js';
import {
  downloadMassCreate, exportLanded, forgetLink, linkKey, matchLines, saveExport, saveLink, saveSetMap, sellPrices,
} from '../../lib/ccExport.js';
import { uuid } from '../../lib/uuid.js';
import { boughtAt, boughtPrice, bulkWords, isBulkPrice } from '../../lib/bulkCut.js';
import { SECOND_LOOK_MS, pause } from '../../lib/timeout.js';
import { linkToSave } from '../../lib/ccMatch.js';
import ChooseRow from './ChooseRow.jsx';

// The export dialog (docs/EXPORT_FUNCTION.md 8.3): Matching, then Review in
// three groups (Needs a choice, Matched, Can't upload). In 'check' mode (the
// dry run, Phase E2) staff's picks are saved as they're made and nothing is
// exported. In 'export' mode (Phase E3) Matching also fetches today's prices
// for the Sell Prices, and Review leads to Confirm (the red pull-out list)
// and the export itself; picks are saved with the export.

// A card picked in Needs a choice: held in place this long, then folded away this long (decision 440).
const HOLD_MS = 500;
const FOLD_MS = 300;   // export.css .xd-fold's transition

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
 * @param {boolean} [p.over1]  Export MTG csv (>…) (decision 406): a card bought at a market price up to the
 *   Export rates for bulk' amber (decision 416; its worked-out Sell Price when none was recorded, decision 576)
 *   stays out of the file, pulled from the batch and copied to Bulk pulled from exports
 * @param {() => void} p.onClose
 */
export default function ExportDialog({
  items: itemsNow, mode = 'check', title, target: targetNow, fileName, onExported, onClose, pullOut = true, fileOnly = null,
  over1 = false,
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
  const ready = useSettingsReady();
  const cut = useBulkCut();
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
  const [held, setHeld] = useState(new Map());        // line id → { phase: 'hold' | 'fold', token }, just picked (decision 440)
  const timers = useRef(new Set());
  const [undos, setUndos] = useState([]);             // the picks made in Needs a choice, newest last (decision 441)
  const [remount, setRemount] = useState(new Map());  // line id → n: a card put back by Undo starts with nothing ticked
  // A check run: what cc_product_links holds for a link key now, as far as this dialog knows (Undo puts it back).
  const dbLinks = useRef(new Map());
  const dbQueue = useRef(Promise.resolve());          // its writes, one after another
  const inOrder = (fn) => {
    dbQueue.current = dbQueue.current.then(fn);
  };
  useEffect(() => {
    const live = timers.current;
    return () => live.forEach(clearTimeout);
  }, []);
  const hidePreview = useCallback(() => setPreview(null), []);
  const box = useRef(null);
  // Off only where staff unticked it: "always pick this for the set" starts ticked.
  const alwaysOf = (id) => always.get(id) ?? true;

  const lines = useMemo(() => items.map((i) => i.line), [items]);
  const whereOf = useMemo(() => new Map(items.map((i) => [i.line.id, i.where])), [items]);
  const pct = settings.fallback_pct_mtg;
  const pctRef = useRef(pct);
  pctRef.current = pct;
  // The Export sell floor (decision 417), as the Sell Prices are worked out.
  const sellFloor = useSellFloor();
  const floorRef = useRef(sellFloor);
  floorRef.current = sellFloor;

  useEffect(() => {
    let alive = true;
    setPhase('matching');
    (async () => {
      const step = (t) => alive && setStepText(t);
      const { results: r, cards } = await matchLines(lines, step);
      const s = exporting ? await sellPrices(lines, cards, pctRef.current, step, floorRef.current) : new Map();
      if (!alive) return;
      setResults(r);
      setSells(s);
      setPicks(new Map());
      setReopened(new Set());
      setEditing(new Set());
      setManual(new Map());
      setBadManual(new Set());
      setUndos([]);
      dbLinks.current = new Map();
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

  /** Where a line stands now: matched (with its product), choose, cant, or under1 (pulled, decision 406). */
  const stateOf = (r) => {
    // By the market price it was bought at, as Print MTG (>…) is (decisions 575, 576).
    if (over1 && isBulkPrice(boughtPrice(r.line, sells.get(r.line.id)?.price ?? null) ?? Infinity, cut)) return { group: 'under1' };
    const pick = picks.get(r.line.id);
    if (pick?.product) return { group: 'matched', product: pick.product, by: 'staff' };
    if (pick?.none) return { group: 'cant', reason: 'none' };
    if (reopened.has(r.line.id)) return { group: 'choose' };
    if (r.status === 'auto') return { group: 'matched', product: r.product, by: r.via };
    if (r.status === 'choose') return { group: 'choose' };
    return { group: 'cant', reason: 'nothing' };
  };
  /** What a pulled card was cut on (decision 576): the market price it was bought at, else its Sell Price. */
  const pulledAt = (r) => {
    const at = boughtAt(r.line);
    return at != null ? `Bought at ${formatMoney(at)}` : `Sell ${formatMoney(sells.get(r.line.id)?.price)}`;
  };
  /** A line's Sell Price: typed by staff in Change, else worked out (export spec 5). */
  const sellOf = (id) => {
    const s = sells.get(id);
    const typed = manual.get(id);
    if (!s || typed == null) return s ?? null;
    return { price: typed, basis: { ...s.basis, used: 'staff', staff: typed, worked: s.price } };
  };
  const groups = { choose: [], matched: [], cant: [], under1: [] };
  // A card being held after its pick stays in Needs a choice till it has folded away (decision 440).
  for (const r of results) groups[held.has(r.line.id) ? 'choose' : stateOf(r).group].push(r);
  const choosing = groups.choose.filter((r) => !held.has(r.line.id)).length;
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
    const inChoose = same.filter((x) => stateOf(x).group === 'choose').map((x) => x.line.id);
    if (inChoose.length) {
      const setMap = mode === 'check' && !detected && !r.category && alwaysOf(r.line.id);
      remember(r, same, inChoose, product.product_name, mode === 'check' && !detected, setMap);
    }
    hold(inChoose);
    setPicks((m) => {
      const next = new Map(m);
      for (const x of same) {
        if (detected && x.status === 'auto' && x.product?.product_id === product.product_id) next.delete(x.line.id);
        else next.set(x.line.id, { product });
      }
      return next;
    });
    if (mode !== 'check') return;
    const userId = staff.current?.id;
    const setToo = !r.category && alwaysOf(r.line.id);
    // One after another with Undo's writes, so an Undo pressed at once lands after the pick it undoes.
    inOrder(async () => {
      if (detected) {
        // The dry run saved the other pick: put the remembered product back as it was.
        if (!hadPick) return;
        try {
          if (r.via === 'link') await saveLink(r.line, product, r.link?.linked_by ?? userId, r.link?.source ?? 'staff');
          else await forgetLink(r.line);
          dbLinks.current.set(key, r.via === 'link' ? r.link : null);
        } catch (e) {
          toast(e.message, 'err');
        }
        return;
      }
      try {
        await saveLink(r.line, product, userId);
        dbLinks.current.set(key, { ...product, linked_by: userId ?? null, source: 'staff' });
        if (setToo) await saveSetMap(r.set.code, r.promo, product.category, userId);
      } catch (e) {
        toast(e.message, 'err');
      }
    });
  }

  /**
   * A pick made in Needs a choice, for Undo (decision 441): the picks it replaced on every line
   * it covered and, in a check run, the remembered product it replaced.
   */
  function remember(r, same, ids, what, saved, setMap) {
    const key = linkKey(r.line);
    const link = dbLinks.current.has(key) ? dbLinks.current.get(key) : (r.link ?? r.wasLinked ?? null);
    setUndos((u) => [...u, {
      ids,
      before: new Map(same.map((x) => [x.line.id, picks.get(x.line.id)])),
      card: lineTextWithCondition(r.line),
      what,
      db: saved ? { line: r.line, link } : null,
      set: setMap ? `${r.set.name} (${String(r.set.code).toUpperCase()})` : null,
    }]);
  }

  /** Undo: the last pick in Needs a choice taken back, its cards there again with nothing ticked. */
  function undo() {
    const last = undos.at(-1);
    if (!last) return;
    setUndos((u) => u.slice(0, -1));
    setPicks((m) => {
      const next = new Map(m);
      for (const [id, was] of last.before) {
        if (was) next.set(id, was);
        else next.delete(id);
      }
      return next;
    });
    setHeld((m) => {
      const next = new Map(m);
      for (const id of last.ids) next.delete(id);
      return next;
    });
    setRemount((m) => {
      const next = new Map(m);
      for (const id of last.ids) next.set(id, (next.get(id) ?? 0) + 1);
      return next;
    });
    if (last.db) {
      const { line, link } = last.db;
      inOrder(async () => {
        try {
          if (link) await saveLink(line, link, link.linked_by ?? null, link.source ?? 'staff');
          else await forgetLink(line);
          dbLinks.current.set(linkKey(line), link);
        } catch (e) {
          toast(e.message, 'err');
        }
      });
    }
    // Nothing can take a set's remembered category off (saveSetMap has no undo).
    if (last.set) toast(`Undone. ${last.set} keeps the category it was given.`, 'ok');
  }

  /**
   * Cards just picked in Needs a choice stay where they are, greyed and not clickable, for half
   * a second, then fold away, so the next card doesn't jump under the pointer (decision 440).
   */
  function hold(ids) {
    if (!ids.length) return;
    const each = (fn) => setHeld((m) => {
      const next = new Map(m);
      for (const id of ids) fn(next, id);
      return next;
    });
    // Each hold's own token: an Undo, and a new pick of the same card, aren't cut short by an old timer.
    const token = {};
    const mine = (m, id) => m.get(id)?.token === token;
    each((m, id) => m.set(id, { phase: 'hold', token }));
    later(() => each((m, id) => mine(m, id) && m.set(id, { phase: 'fold', token })), HOLD_MS);
    later(() => each((m, id) => mine(m, id) && m.delete(id)), HOLD_MS + FOLD_MS);
  }
  function later(fn, ms) {
    const t = setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  }

  function chooseNone(r) {
    if (stateOf(r).group === 'choose') {
      remember(r, [r], [r.line.id], 'None of these', false, false);
      hold([r.line.id]);
    }
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

  // The Custom SKU the server will stamp (0071; a collection's number of the day, decision 511).
  const skuText = confirmSku(target, Boolean(fileOnly));
  const skuNumbered = skuText.endsWith('-#');
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
    // Sell Prices from the store's Fallback Percentages, not the built-in ones (decision 389).
    if (!ready()) return;
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
        link: linkToSave(s.by),
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
        pulled: groups.under1.map((r) => r.line.id),
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
      const ids = target?.kind === 'cant_upload' || target?.kind === 'pulled'
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
            onExported?.({
              cards, cant: cardsIn(groups.cant), pulled: cardsIn(groups.under1), sku: landed[0].cc_custom_sku, lines: landed, rows,
            });
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
      <span className="xd-price" title={`Sell Price from ${why}${sell.basis.floored && sell.basis.used !== 'staff' ? `, raised to the ${formatMoney(sell.basis.floor ?? sellFloor)} floor` : ''}`}>
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
  const under1Cards = cardsIn(groups.under1);
  // Every card to pull out of the batch before uploading: can't upload, and bulk (decisions 406, 416).
  const outCards = cantCards + under1Cards;
  const saving = phase === 'saving';
  // Undo (decision 441), in the footer: its showing up never moves the cards under the pointer.
  const lastPick = undos.at(-1);
  const undoBar = phase === 'review' && lastPick ? (
    <span className="xd-undo">
      <button type="button" className="btn ghost" title={`Undo: ${lastPick.card} → ${lastPick.what}`} onClick={undo}>
        Undo last pick
      </button>
      <span className="xd-undo-what">{lastPick.card} → {lastPick.what}</span>
    </span>
  ) : null;
  let footer;
  if (!exporting || phase === 'matching' || phase === 'error') {
    footer = (
      <>
        {undoBar}
        <button type="button" className="btn primary" onClick={onClose} autoFocus>
          {exporting ? 'Cancel' : 'Close'}
        </button>
      </>
    );
  } else if (phase === 'review') {
    // A bad typed price only matters while its box is showing (Needs a choice, or Change).
    const badTyped = [...groups.choose, ...groups.matched.filter((r) => editing.has(r.line.id))]
      .some((r) => badManual.has(r.line.id));
    const waiting = groups.choose.length > 0 || badTyped;
    footer = (
      <>
        {undoBar}
        <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        <button
          type="button"
          className="btn primary"
          disabled={waiting}
          title={badTyped ? `Fix the Sell price you typed first (at least ${formatMoney(sellFloor)}, or leave it empty)`
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
    const mustPull = pullOut && outCards > 0;
    const blocked = (mustPull && !pulled) || ((!pullOut || fileOnly) && toExport === 0) || saving;
    footer = (
      <>
        <button type="button" className="btn ghost" disabled={saving} onClick={() => setPhase('review')}>Back</button>
        <button
          type="button"
          className={`btn primary${saving ? ' busy' : ''}`}
          disabled={blocked}
          title={mustPull && !pulled ? 'Tick “I’ve pulled these cards out of the batch” first'
            : (!pullOut || fileOnly) && toExport === 0 ? 'Nothing matched: there’s nothing to export' : undefined}
          onClick={save}
        >
          {fileOnly ? `Download the file (${toExport} card${toExport === 1 ? '' : 's'})`
            : toExport > 0 ? `Export ${toExport} card${toExport === 1 ? '' : 's'}`
              : under1Cards > 0 ? 'Mark them pulled' : 'Mark them Can’t upload'}
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
                <h4>Needs a choice <span className="xd-count">{choosing}</span></h4>
                {groups.choose.map((r) => {
                  const s = held.has(r.line.id) ? stateOf(r) : null;
                  return (
                    <div key={r.line.id} className={`xd-fold${held.get(r.line.id)?.phase === 'fold' ? ' folding' : ''}`}>
                      <div className="xd-fold-in">
                        <ChooseRow
                          key={remount.get(r.line.id) ?? 0}
                          {...rowProps(r)}
                          heldNote={s && (s.product ? `✓ Picked: ${s.product.product_name}` : '✓ None of these')}
                        />
                      </div>
                    </div>
                  );
                })}
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
                        detected={r.status === 'auto' && r.via === 'match' ? r.product : null}
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
            {groups.under1.length > 0 && (
              <section className="xd-group under1">
                <h4>{bulkWords(cut)}: pulled <span className="xd-count">{groups.under1.length}</span></h4>
                {groups.under1.map((r) => (
                  <div key={r.line.id} className="xd-row">
                    {lineLabel(r)}
                    <span className="xd-reason pulled-text">
                      {pulledAt(r)}: left out of the file, copied to Bulk pulled from exports
                    </span>
                  </div>
                ))}
              </section>
            )}
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
                  <strong>{skuText}</strong>{skuNumbered && ", # the day's next collection number, given when it's saved"}.{' '}
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
            {pullOut && outCards > 0 && (
              <div className="xd-pull" role="alert">
                <h3>Pull {outCards === 1 ? 'this card' : `these ${outCards} cards`} out of the batch before uploading.</h3>
                {cantCards > 0 && (
                  <>
                    <ul>
                      {groups.cant.map((r) => (
                        <li key={r.line.id}>
                          {lineTextWithCondition(r.line)} <span className="xd-where">{whereOf.get(r.line.id)}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="hint">
                      {fileOnly ? <>They won't be in the file. Nothing is saved: they stay as they are.</> : (
                        <>
                          They won't be in the file. They'll be marked <strong>Can't upload</strong> here and copied to the{' '}
                          <strong>Can't upload cards</strong> collection.
                        </>
                      )}
                    </p>
                  </>
                )}
                {/* Bulk (decision 406, its cut decision 416): in amber, to the pulled bulk. */}
                {under1Cards > 0 && (
                  <div className="xd-pull-under1">
                    <ul>
                      {groups.under1.map((r) => (
                        <li key={r.line.id}>
                          {lineTextWithCondition(r.line)} <span className="pulled-text">{pulledAt(r)}</span>
                          {' '}<span className="xd-where">{whereOf.get(r.line.id)}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="hint">
                      {fileOnly ? <>{bulkWords(cut)}: they won't be in the file. Nothing is saved: they stay as they are.</> : (
                        <>
                          {bulkWords(cut)}: they won't be in the file. They'll be marked <strong>Pulled</strong> here and copied to the{' '}
                          <strong>Bulk pulled from exports</strong> collection.
                        </>
                      )}
                    </p>
                  </div>
                )}
                <label className="xd-pulled">
                  <input type="checkbox" checked={pulled} disabled={saving} onChange={(e) => setPulled(e.target.checked)} />
                  I've pulled {outCards === 1 ? 'this card' : 'these cards'} out of the batch
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

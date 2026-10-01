import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../../components/Modal.jsx';
import LinePreview, { previewFor } from '../../components/LinePreview.jsx';
import { useStaff } from '../../state/staff.jsx';
import { useToast } from '../../components/Toast.jsx';
import { lineTextWithCondition } from '../../lib/lineFormat.js';
import { linkKey, matchLines, saveLink, saveSetMap, searchProducts } from '../../lib/ccExport.js';

// The export dialog (docs/EXPORT_FUNCTION.md 8.3): Matching, then Review in
// three groups (Needs a choice, Matched, Can't upload). In 'check' mode (the
// dry run, Phase E2) staff's picks are saved as they're made and nothing is
// exported. 'export' mode (Phase E3) adds the Confirm step and the export.

/**
 * @param {object} p
 * @param {{ line: object, where: string }[]} p.items  the Magic lines, each with where it's from ("Buy 4")
 * @param {'check'|'export'} [p.mode]
 * @param {string} p.title
 * @param {() => void} p.onClose
 */
export default function ExportDialog({ items, mode = 'check', title, onClose }) {
  const staff = useStaff();
  const toast = useToast();
  const [phase, setPhase] = useState('matching');   // matching | review | error
  const [stepText, setStepText] = useState('');
  const [error, setError] = useState(null);
  const [results, setResults] = useState([]);
  const [picks, setPicks] = useState(new Map());      // line id → { product } | { none: true }
  const [reopened, setReopened] = useState(new Set()); // matched or can't-upload lines sent back to choose
  const [always, setAlways] = useState(new Map());    // line id → remember its set's category (unknown categories)
  const [preview, setPreview] = useState(null);
  const hidePreview = useCallback(() => setPreview(null), []);
  const box = useRef(null);

  const lines = useMemo(() => items.map((i) => i.line), [items]);
  const whereOf = useMemo(() => new Map(items.map((i) => [i.line.id, i.where])), [items]);

  useEffect(() => {
    let alive = true;
    matchLines(lines, (t) => alive && setStepText(t))
      .then(({ results: r }) => {
        if (!alive) return;
        setResults(r);
        setPhase('review');
      })
      .catch((e) => {
        if (!alive) return;
        setError(e.message);
        setPhase('error');
      });
    return () => {
      alive = false;
    };
  }, [lines]);

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
  const groups = { choose: [], matched: [], cant: [] };
  for (const r of results) groups[stateOf(r).group].push(r);

  /** Staff pick a product: for every line of the same printing and finish. */
  async function pick(r, product) {
    const key = linkKey(r.line);
    const same = results.filter((x) => linkKey(x.line) === key);
    setPicks((m) => {
      const next = new Map(m);
      for (const x of same) next.set(x.line.id, { product });
      return next;
    });
    if (mode !== 'check') return;
    try {
      await saveLink(r.line, product, staff.current?.id);
      if (!r.category && (always.get(r.line.id) ?? true)) {
        await saveSetMap(r.set.code, r.promo, product.category, staff.current?.id);
      }
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  function chooseNone(r) {
    setPicks((m) => new Map(m).set(r.line.id, { none: true }));
  }

  function reopen(r) {
    setPicks((m) => {
      const next = new Map(m);
      next.delete(r.line.id);
      return next;
    });
    setReopened((s) => new Set(s).add(r.line.id));
  }

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

  const footer = (
    <button type="button" className="btn primary" onClick={onClose} autoFocus>
      {mode === 'check' ? 'Close' : 'Cancel'}
    </button>
  );

  return (
    <Modal wide title={title} onClose={onClose} footer={footer}>
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
                  <ChooseRow
                    key={r.line.id}
                    r={r}
                    label={lineLabel(r)}
                    always={always.get(r.line.id) ?? true}
                    onAlways={(v) => setAlways((m) => new Map(m).set(r.line.id, v))}
                    onPick={(product) => pick(r, product)}
                    onNone={() => chooseNone(r)}
                  />
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
                      <button type="button" className="btn small ghost xd-change" onClick={() => reopen(r)}>Change</button>
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
                      {r.category ? ` in ${r.category}` : ''}
                    </span>
                    <button type="button" className="btn small ghost xd-change" onClick={() => reopen(r)}>Find a product…</button>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </div>
      <LinePreview preview={preview} onHide={hidePreview} />
    </Modal>
  );
}

/** One card in Needs a choice: its candidates, "None of these", and a search. */
function ChooseRow({ r, label, always, onAlways, onPick, onNone }) {
  const [text, setText] = useState('');
  const [found, setFound] = useState([]);
  const [chosen, setChosen] = useState(null);
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

  const fits = r.ranked.filter((x) => x.score != null).map((x) => x.product);
  const others = r.ranked.filter((x) => x.score == null).map((x) => x.product);
  const option = (p, note) => (
    <label key={`${p.product_id}`} className={`xd-option${note ? ' off' : ''}`}>
      <input
        type="radio"
        name={`xd-${r.line.id}`}
        checked={chosen === p.product_id}
        onChange={() => {
          setChosen(p.product_id);
          onPick(p);
        }}
      />
      <span className="xd-product">
        {p.product_name}
        <span className="xd-cat">{p.category}</span>
        {note && <span className="xd-note">{note}</span>}
      </span>
    </label>
  );

  return (
    <div className="xd-choose">
      <div className="xd-row">{label}</div>
      {r.wasLinked && (
        <p className="hint xd-was">
          Used to be {r.wasLinked.product_name} ({r.wasLinked.category}), which isn't in the current inventory.
        </p>
      )}
      <div className="xd-options">
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
              onNone();
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
      {!r.category && (
        <label className="inline xd-always">
          <input type="checkbox" checked={always} onChange={(e) => onAlways(e.target.checked)} />
          Always use the picked product's category for {r.set.name} ({String(r.set.code).toUpperCase()})
        </label>
      )}
    </div>
  );
}

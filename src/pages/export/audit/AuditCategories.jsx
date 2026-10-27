import { useEffect, useRef, useState } from 'react';

// The category-level audit (decision 547), the second screen of #/audit-cc: the inventory's categories the
// matcher's category step reaches from no set (Art Series, Guild Kits, a spelling), each with the sets it looks
// like; and the Scryfall sets whose cards come up with no category, each with the category most of their names'
// products sit in. Every answer is what a `cc_set_map` row holds (a set and promo kind → a category), kept in the
// picks file under setChoices for the import later.

const PROMO_KINDS = [['', 'plain'], ['prerelease', 'prerelease'], ['promopack', 'promo pack']];
const promoGuess = (category) => (/pre-?release/i.test(category) ? 'prerelease' : /promo pack/i.test(category) ? 'promopack' : '');
const n = (x) => Number(x ?? 0).toLocaleString('en-US');

/**
 * @param {{ data: object, picks: object, onChoice: (key: string, choice: object|null) => void, onUndo: () => void }} props
 *   onChoice: null forgets the row's answer
 */
export default function AuditCategories({ data, picks, onChoice, onUndo }) {
  const rows = [
    ...data.unresolvedCategories.map((c) => ({ key: `cat:${c.category}`, kind: 'category', ...c })),
    ...data.noCategorySets.map((s) => ({ key: `set:${s.code}`, kind: 'set', ...s })),
  ];
  const [at, setAt] = useState(0);
  const [typed, setTyped] = useState('');
  const [promo, setPromo] = useState('');
  const list = useRef(null);
  const row = rows[at] ?? null;
  const answer = row ? picks.setChoices[row.key] ?? null : null;

  // A new row: its promo kind guessed from its name, nothing typed.
  useEffect(() => {
    setTyped('');
    setPromo(row?.kind === 'category' ? promoGuess(row.category) : '');
  }, [at, row?.kind, row?.category]);
  useEffect(() => {
    list.current?.querySelector('.acc-cat-row.on')?.scrollIntoView({ block: 'nearest' });
  }, [at]);

  const move = (d) => setAt((i) => Math.max(0, Math.min(rows.length - 1, i + d)));
  const guesses = row?.kind === 'category' ? row.looksLike : [];
  const choose = (choice) => {
    if (!row) return;
    onChoice(row.key, choice);
    move(1);
  };
  const acceptGuess = (i) => {
    if (row.kind === 'category') {
      const g = guesses[i];
      if (g) choose({ scryfall_set: g.code, promo_kind: promo, category: row.category, how: 'guess' });
    } else if (i === 0 && row.topCategory) {
      choose({ scryfall_set: row.code, promo_kind: '', category: row.topCategory, how: 'guess' });
    }
  };
  const acceptTyped = () => {
    const t = typed.trim();
    if (!t) return;
    if (row.kind === 'category') choose({ scryfall_set: t.toLowerCase(), promo_kind: promo, category: row.category, how: 'typed' });
    else {
      const cat = data.categories.find((c) => c.name.toLowerCase() === t.toLowerCase())?.name;
      if (cat) choose({ scryfall_set: row.code, promo_kind: '', category: cat, how: 'typed' });
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
        if (e.key === 'Enter') { e.preventDefault(); acceptTyped(); }
        if (e.key === 'Escape') e.target.blur();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); } else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); } else if (e.key === 'Enter') { e.preventDefault(); acceptGuess(0); } else if (/^[1-4]$/.test(e.key)) acceptGuess(Number(e.key) - 1);
      else if (e.key === 'n' || e.key === 'N') choose({ none: true, how: 'none' });
      else if (e.key === 's' || e.key === 'S') move(1);
      else if (e.key === 'Backspace') { e.preventDefault(); onUndo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const answered = rows.filter((r) => picks.setChoices[r.key]).length;
  return (
    <div className="acc-cats">
      <div className="acc-cats-list" ref={list}>
        <p className="acc-group">
          {n(answered)} of {n(rows.length)} answered · {n(data.unresolvedCategories.length)} categories no set reaches, {n(data.noCategorySets.length)} sets with no category
        </p>
        <table className="acc-cat-table">
          <thead>
            <tr><th>What</th><th>Products / units</th><th>Guess</th><th>Answer</th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const a = picks.setChoices[r.key];
              return (
                <tr key={r.key} className={`acc-cat-row${i === at ? ' on' : ''}${a ? ' done' : ''}`} onClick={() => setAt(i)}>
                  <td>
                    {r.kind === 'category' ? <><span className="acc-kind">category</span> {r.category}</>
                      : <><span className="acc-kind">set</span> {r.name} <span className="acc-code">{String(r.code).toUpperCase()}</span></>}
                  </td>
                  <td className="acc-num">{r.kind === 'category' ? `${n(r.products)} · ${n(r.inStock)} in stock` : `${n(r.units)} units · ${n(r.withProducts)} with a product`}</td>
                  <td>
                    {r.kind === 'category'
                      ? (r.looksLike.length ? r.looksLike.map((g) => `${g.name} (${g.code.toUpperCase()})`).join('; ') : <span className="acc-dim">—</span>)
                      : (r.topCategory ? `${r.topCategory} (${n(r.topCategoryUnits)} of ${n(r.withProducts)})` : <span className="acc-dim">—</span>)}
                  </td>
                  <td className="acc-answer">
                    {!a ? <span className="acc-dim">—</span> : a.none ? <span className="acc-none">none</span>
                      : <>{String(a.scryfall_set).toUpperCase()}{a.promo_kind ? ` (${a.promo_kind})` : ''} → {a.category}</>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {row && (
        <div className="acc-cat-side">
          <h3>{row.kind === 'category' ? row.category : `${row.name} (${String(row.code).toUpperCase()})`}</h3>
          {row.kind === 'category' ? (
            <>
              <p className="acc-hint">Which Scryfall set is this category? A card of that set then files here.</p>
              <ol className="acc-rows">
                {guesses.map((g, i) => (
                  <li key={g.code} className="acc-row" onClick={() => acceptGuess(i)}>
                    <kbd>{i + 1}</kbd><span className="acc-name">{g.name}</span><span className="acc-cat">{g.code.toUpperCase()} · {g.set_type}</span>
                  </li>
                ))}
                {!guesses.length && <li className="acc-dim">No set looks like it: type its code below, or N for none.</li>}
              </ol>
              <label className="acc-field">
                Set code
                <input type="text" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="e.g. sta" spellCheck={false} />
              </label>
              <label className="acc-field">
                Promo kind
                <select value={promo} onChange={(e) => setPromo(e.target.value)}>
                  {PROMO_KINDS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select>
              </label>
            </>
          ) : (
            <>
              <p className="acc-hint">Which category are this set's cards filed in? Enter takes the guess.</p>
              <ol className="acc-rows">
                {row.topCategory && (
                  <li className="acc-row" onClick={() => acceptGuess(0)}>
                    <kbd>1</kbd><span className="acc-name">{row.topCategory}</span><span className="acc-cat">{n(row.topCategoryUnits)} of {n(row.withProducts)} units</span>
                  </li>
                )}
              </ol>
              <label className="acc-field">
                Another category
                <input type="text" list="acc-categories" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="type to search the inventory's categories" />
              </label>
              <datalist id="acc-categories">
                {data.categories.map((c) => <option key={c.name} value={c.name} />)}
              </datalist>
            </>
          )}
          <div className="acc-cat-buttons">
            <button type="button" className="btn small primary" onClick={acceptTyped} disabled={!typed.trim()}>Use what's typed (Enter in the box)</button>
            <button type="button" className="btn small" onClick={() => choose({ none: true, how: 'none' })}>None (N)</button>
            <button type="button" className="btn small ghost" onClick={() => move(1)}>Skip (S)</button>
            {answer && <button type="button" className="btn small ghost" onClick={() => onChoice(row.key, null)}>Forget this answer</button>}
          </div>
          <p className="acc-keys">↑ ↓ move · 1–4 a guess · Enter the first guess · N none · S skip · Backspace undo</p>
        </div>
      )}
    </div>
  );
}

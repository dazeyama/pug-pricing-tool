import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../../../components/Modal.jsx';
import {
  cardLabel, declineRule, emptyPicks, groupUnits, inferRules, isDataFile, isPicksFile, nextStep, picksFileName,
  productHasToken, progress, recordPick, recordSetChoice, settleGroup, skipUnit, undoLast,
} from '../../../lib/auditCc.js';
import { lineText } from '../../../lib/lineFormat.js';
import ChooseRow from '../ChooseRow.jsx';
import { readStored, writeStored } from './auditDb.js';
import AuditCategories from './AuditCategories.jsx';
import '../../../styles/auditcc.css';

// The Crystal Commerce matching audit (decision 547): a temporary secret page, #/audit-cc, only on the dev server
// on dev's database (App.jsx, lib/devDb.js). The whole screen is a picker for the printings today's matcher sends
// to Needs a choice, from the data file the whole-inventory sweep wrote (outside the repo; picked here once and
// kept in this browser): the word groups biggest first, three example cards each, then the rule the picks imply,
// applied on a yes; what no rule covers card by card, in stock first; the "no product left" units last, one key.
// The picks stay in this browser and download as one JSON, which the import into dev and prod reads later (a
// later task); this page writes to no database.

const imageOf = (id) => `https://api.scryfall.com/cards/${encodeURIComponent(id)}?format=image&version=normal`;
const n = (x) => Number(x ?? 0).toLocaleString('en-US');

/** The rows a unit offers: the products left first, then the ones set aside, then the other finish or number. */
function rowsOf(unit) {
  const products = unit.products ?? [];
  return [...products.filter((p) => p.left), ...products.filter((p) => p.passes && !p.left), ...products.filter((p) => !p.passes)];
}

/** A unit's candidate as a cc_products row, the shape ChooseRow and the search's results have. */
const asProduct = (p) => ({ product_id: p.id, product_name: p.name, category: p.category, bracket: p.bracket, foil_kind: p.foil_kind, variants: p.variants });

/**
 * A unit as the export dialog's Needs a choice row sees a matched line (ccExport.js matchLines): its line, and its
 * candidates ranked, the ones failing the finish or number checks with no score (listed last, "a different finish
 * or number").
 */
function chooseRowOf(unit, rows) {
  return {
    line: {
      id: unit.key, quantity: 1, name: unit.name, set_code: String(unit.set).toUpperCase(), collector_number: unit.collector_number,
      finish: unit.finish, treatments: unit.treatments, lang: unit.lang,
    },
    ranked: rows.map((p) => ({ product: asProduct(p), score: p.passes ? p.score : null })),
    category: unit.category,
    set: { code: unit.set, name: unit.set_name },
    wasLinked: null,
  };
}

export default function AuditCcPage() {
  const [data, setData] = useState(null);
  const [picks, setPicks] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [screen, setScreen] = useState('cards');
  const [selected, setSelected] = useState(null);   // a row index chosen with a key; null: the leader
  const [ruleChoice, setRuleChoice] = useState(0);
  const [note, setNote] = useState(null);
  const [stored, setStored] = useState(true);
  const [clearing, setClearing] = useState(false);
  const dataInput = useRef(null);
  const picksInput = useRef(null);

  // What this browser kept: the data file, and the picks so far.
  useEffect(() => {
    let alive = true;
    (async () => {
      const [d, p] = await Promise.all([readStored('data'), readStored('picks')]);
      if (!alive) return;
      if (d) setData(d);
      if (p) setPicks(p); else if (d) setPicks(emptyPicks(d));
      setLoaded(true);
    })();
    return () => { alive = false; };
  }, []);

  const byKey = useMemo(() => new Map((data?.units ?? []).map((u) => [u.key, u])), [data]);
  const groups = useMemo(() => (data ? groupUnits(data.units) : []), [data]);
  const step = useMemo(() => (data && picks ? nextStep(groups, byKey, picks) : null), [data, picks, groups, byKey]);
  const unit = step?.key ? byKey.get(step.key) : null;
  const rows = useMemo(() => (unit ? rowsOf(unit) : []), [unit]);
  const leaderIndex = Math.max(0, rows.findIndex((p) => p.leader));
  const current = selected ?? (step?.phase === 'none' ? null : leaderIndex);
  const done = picks ? progress(groups, picks) : null;

  // The rule a group's example picks imply, when the group reaches its rule step.
  const rules = useMemo(() => {
    if (step?.phase !== 'rule') return [];
    const examples = step.group.examples.map((key) => ({ key, productId: picks.picks[key]?.product_id ?? null }));
    return inferRules(step.group, examples, byKey);
  }, [step, picks, byKey]);

  /** Every change to the picks is kept in this browser at once. */
  const update = (next) => {
    setPicks(next);
    setSelected(null);
    setRuleChoice(0);
    writeStored('picks', next).then((ok) => setStored(ok));
  };
  /** A candidate's id, a product found by the search (a cc_products row), or null for none. */
  const pick = (choice) => unit && update(recordPick(picks, unit, choice));
  const skip = () => unit && update(skipUnit(picks, unit.key));
  const undo = () => picks?.history.length && update(undoLast(picks));
  const applyRule = () => rules[ruleChoice] && update(settleGroup(picks, step.group, rules[ruleChoice], byKey));
  const decline = () => step?.group && update(declineRule(picks, step.group));

  // The keys: numbers select a row, Enter confirms, N none, S skip, Backspace undoes; on the rule step Y / Enter
  // applies, N declines, 1–3 pick an alternative.
  useEffect(() => {
    if (!step || screen !== 'cards' || clearing) return undefined;
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (step.phase === 'rule') {
        if (e.key === 'Enter' || e.key === 'y' || e.key === 'Y') { e.preventDefault(); if (rules.length) applyRule(); else decline(); } else if (e.key === 'n' || e.key === 'N') decline();
        else if (/^[1-3]$/.test(e.key) && rules[Number(e.key) - 1]) setRuleChoice(Number(e.key) - 1);
        else if (e.key === 'Backspace') { e.preventDefault(); undo(); }
        return;
      }
      if (step.phase === 'done') {
        if (e.key === 'Backspace') { e.preventDefault(); undo(); }
        return;
      }
      if (/^[1-9]$/.test(e.key)) {
        const i = Number(e.key) - 1;
        if (rows[i]) setSelected(i);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!rows.length) return;
        const from = current ?? -1;
        setSelected(Math.max(0, Math.min(rows.length - 1, from + (e.key === 'ArrowDown' ? 1 : -1))));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (current == null) pick(null); else if (rows[current]) pick(rows[current].id);
      } else if (e.key === 'n' || e.key === 'N') pick(null);
      else if (e.key === 's' || e.key === 'S') skip();
      else if (e.key === 'Backspace') { e.preventDefault(); undo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /** A file picked: the data file (replaces the units), or a picks file (resumes). */
  async function loadFile(file, kind) {
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      if (kind === 'data') {
        if (!isDataFile(json)) throw new Error('not a data file this page knows (format pug-audit-cc-data)');
        setData(json);
        const ok = await writeStored('data', json);
        setStored(ok);
        if (!picks) {
          const fresh = emptyPicks(json);
          setPicks(fresh);
          await writeStored('picks', fresh);
        }
        setNote(`Loaded ${n(json.units.length)} units from the inventory file of ${json.inventoryFile?.uploaded_at?.slice(0, 10) ?? '?'}.`);
      } else {
        if (!isPicksFile(json)) throw new Error('not a picks file this page wrote (format pug-audit-cc-picks)');
        const other = data && json.dataFile?.generated && json.dataFile.generated !== data.generated;
        update({ ...json, history: json.history ?? [], skipped: json.skipped ?? {}, groups: json.groups ?? {}, setChoices: json.setChoices ?? {}, rules: json.rules ?? [] });
        setNote(`Resumed ${n(Object.keys(json.picks).length)} picks${other ? ' (made from another data file: units that changed are picked again)' : ''}.`);
      }
    } catch (e) {
      setNote(`Couldn't read ${file.name}: ${e.message}`);
    }
  }

  /** The picks as one JSON file. */
  function download() {
    const out = { ...picks, saved: new Date().toISOString(), summary: done, history: undefined };
    const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = picksFileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  if (!loaded) return null;
  return (
    <div className="acc">
      <header className="acc-head">
        <div className="acc-title">
          <strong>Crystal Commerce matching audit</strong>
          <span className="acc-dim">dev only · nothing here writes to a database</span>
          {data && (
            <span className="acc-dim">
              · inventory file of {data.inventoryFile?.uploaded_at?.slice(0, 10)} · {n(data.units.length)} units
            </span>
          )}
        </div>
        {done && (
          <div className="acc-progress">
            <strong>{n(done.answered)}</strong> of {n(done.all)} answered ({n(done.byRule)} by rules, {n(done.byHand)} by hand)
            {Object.keys(picks.skipped).length ? ` · ${n(Object.keys(picks.skipped).length)} skipped` : ''}
            {!stored && <span className="acc-warn"> · not kept by this browser: download before closing</span>}
          </div>
        )}
        <div className="acc-buttons">
          {data && (
            <button type="button" className={`btn small${screen === 'categories' ? ' primary' : ''}`} onClick={() => setScreen(screen === 'cards' ? 'categories' : 'cards')}>
              {screen === 'cards' ? 'Categories' : 'Cards'}
            </button>
          )}
          {picks && <button type="button" className="btn small primary" onClick={download}>Download picks</button>}
          <button type="button" className="btn small" onClick={() => picksInput.current?.click()} disabled={!data}>Load picks…</button>
          <button type="button" className="btn small" onClick={() => dataInput.current?.click()}>Load data…</button>
          {picks && <button type="button" className="btn small ghost" onClick={() => setClearing(true)}>Start over…</button>}
          <Link className="btn small ghost" to="/home">Home</Link>
          <input ref={dataInput} type="file" accept=".json,application/json" hidden onChange={(e) => { loadFile(e.target.files?.[0], 'data'); e.target.value = ''; }} />
          <input ref={picksInput} type="file" accept=".json,application/json" hidden onChange={(e) => { loadFile(e.target.files?.[0], 'picks'); e.target.value = ''; }} />
        </div>
      </header>
      {note && <p className="acc-note" onClick={() => setNote(null)}>{note}</p>}

      {!data && (
        <div className="acc-empty">
          <p>Pick the data file the sweep wrote (<code>audit-cc-data.json</code>, outside the repo). It stays in this browser.</p>
          <button type="button" className="btn primary" onClick={() => dataInput.current?.click()}>Load data…</button>
        </div>
      )}

      {data && picks && screen === 'categories' && (
        <AuditCategories
          data={data}
          picks={picks}
          onChoice={(key, choice) => update(choice ? recordSetChoice(picks, key, choice) : { ...picks, setChoices: Object.fromEntries(Object.entries(picks.setChoices).filter(([k]) => k !== key)) })}
          onUndo={undo}
        />
      )}

      {data && picks && screen === 'cards' && step && (
        <main className="acc-main">
          <section className="acc-card">
            {unit ? (
              <>
                <img key={unit.scryfall_id} src={imageOf(unit.scryfall_id)} alt="" />
                <h2>{unit.name}</h2>
                <p className="acc-facts">
                  {unit.set_name} ({String(unit.set).toUpperCase()}) {unit.collector_number} · {unit.finish}
                  {unit.lang !== 'en' ? ` · ${unit.lang}` : ''}
                </p>
                <p className="acc-chips">
                  {[...(unit.treatments ?? []), ...(unit.evidence ?? []).filter((e) => !(unit.treatments ?? []).includes(e))].map((t) => <span key={t} className="acc-chip">{t}</span>)}
                  {!(unit.treatments ?? []).length && !(unit.evidence ?? []).length && <span className="acc-dim">plain printing</span>}
                </p>
                <dl className="acc-dl">
                  <dt>Category</dt><dd>{unit.category ?? '—'}{unit.how ? <span className="acc-dim"> · by {unit.how}</span> : null}</dd>
                  <dt>Expected name</dt><dd>{unit.expected}</dd>
                  <dt>Why it asks</dt><dd>{unit.cause}{unit.pattern ? <span className="acc-dim"> · {unit.pattern}</span> : null}</dd>
                  <dt>Scryfall</dt>
                  <dd>
                    frame {unit.frame} · border {unit.border_color}
                    {(unit.frame_effects ?? []).length ? ` · ${unit.frame_effects.join(', ')}` : ''}
                    {(unit.promo_types ?? []).length ? ` · ${unit.promo_types.join(', ')}` : ''}
                    {(unit.attraction_lights ?? []).length ? ` · lights ${unit.attraction_lights.join('-')}` : ''}
                    {unit.artist ? ` · ${unit.artist}` : ''}
                    {' · '}
                    <a href={`https://scryfall.com/card/${encodeURIComponent(unit.set)}/${encodeURIComponent(unit.collector_number)}`} target="_blank" rel="noreferrer">open ↗</a>
                  </dd>
                </dl>
              </>
            ) : step.phase === 'rule' ? (
              <div className="acc-rule-examples">
                <h2>“{step.group.display}”</h2>
                <p className="acc-facts">{n(step.group.units.length)} units in this group · the examples you picked:</p>
                <ul>
                  {step.group.examples.map((key) => {
                    const u = byKey.get(key);
                    const p = picks.picks[key];
                    return <li key={key}>{cardLabel(u)} → <strong>{p?.product_id ? p.product_name : p ? 'none' : 'skipped'}</strong></li>;
                  })}
                </ul>
              </div>
            ) : null}
          </section>

          <section className="acc-choices">
            {(step.phase === 'example' || step.phase === 'card' || step.phase === 'none') && unit && (
              // The export dialog's own Needs a choice (ExportDialog.jsx, ChooseRow.jsx): the same rows, "None of
              // these" and "Find another CC product…"; a click picks at once, as there.
              <div className="xd">
                <section className="xd-group choose">
                  <h4>
                    Needs a choice
                    <span className="xd-count">
                      {step.phase === 'example' && <>group {step.groupIndex} of {step.groupCount} · “{step.group.display}” · {n(step.group.units.length)} units · example {step.exampleIndex} of {step.exampleCount}</>}
                      {step.phase === 'card' && <>card by card · {step.group.display} · {n(step.left)} left{step.skippedLeft ? ` (${n(step.skippedLeft)} skipped)` : ''}{unit.anyStock ? ' · in stock' : ''}</>}
                      {step.phase === 'none' && <>no product left · {n(step.left)} left · Enter says none</>}
                    </span>
                  </h4>
                  {/* No radio is preselected (a checked one fires nothing when clicked): the keys' selection is the
                      "Enter" chip instead. */}
                  <ChooseRow
                    key={unit.key}
                    r={chooseRowOf(unit, rows)}
                    label={(
                      <span className="xd-line">
                        {lineText(chooseRowOf(unit, rows).line)}
                        <span className="xd-where">{unit.category}</span>
                      </span>
                    )}
                    onPick={(product) => pick(product)}
                    onNone={() => pick(null)}
                    tagOf={(product) => {
                      const i = rows.findIndex((p) => p.id === product.product_id);
                      const p = rows[i];
                      if (!p) return <span className="xd-tag">found by search</span>;
                      return (
                        <>
                          {i < 9 && <kbd className="acc-key">{i + 1}</kbd>}
                          {i === current && <span className="acc-sel">↵ Enter</span>}
                          {p.qty > 0 && <span className="acc-qty">×{p.qty}</span>}
                          {p.score != null && <span className="acc-score">{p.score}</span>}
                          {p.leader && <span className="xd-tag">leader</span>}
                          {p.passes && !p.left && <span className="xd-tag">set aside</span>}
                          {step.group.token && productHasToken(p, step.group.token, unit) && <span className="xd-tag acc-word">the word</span>}
                        </>
                      );
                    }}
                  />
                </section>
                <p className="acc-keys">
                  Click a product to pick it · 1–9 select · ↑ ↓ move · Enter picks the one marked ↵{current == null ? ' (none now)' : ''} ·
                  N none · S skip · Backspace undo · the search finds any product in the inventory
                </p>
              </div>
            )}

            {step.phase === 'rule' && (
              <div className="acc-rule">
                <p className="acc-group">Group {step.groupIndex} of {step.groupCount} · <strong>“{step.group.display}”</strong> · {n(step.group.units.length)} units · a rule?</p>
                {rules.length ? (
                  <>
                    {rules.map((r, i) => (
                      <div key={`${r.type}:${r.fact ?? r.kind}`} className={`acc-rule-opt${i === ruleChoice ? ' on' : ''}`} onClick={() => setRuleChoice(i)}>
                        <kbd>{i + 1}</kbd>
                        <div>
                          <p className="acc-sentence">{r.sentence}</p>
                          <p className="acc-dim">Settles {n(r.settles)} of the group's {n(step.group.units.length)} units; {n(r.leaves)} stay for card by card.</p>
                        </div>
                      </div>
                    ))}
                    <p className="acc-facts">A sample of what the chosen rule does:</p>
                    <ul className="acc-sample">
                      {rules[ruleChoice].sample.map((s) => <li key={s.key}>{s.card} → <strong>{s.product}</strong></li>)}
                    </ul>
                    <div className="acc-cat-buttons">
                      <button type="button" className="btn primary" onClick={applyRule}>Apply it (Y / Enter)</button>
                      <button type="button" className="btn" onClick={decline}>No rule, pick by hand (N)</button>
                      <button type="button" className="btn ghost" onClick={undo}>Back a pick (Backspace)</button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="acc-sentence">No single Scryfall fact explains these picks, so this group is picked card by card.</p>
                    <div className="acc-cat-buttons">
                      <button type="button" className="btn primary" onClick={decline}>Pick by hand (Enter)</button>
                      <button type="button" className="btn ghost" onClick={undo}>Back a pick (Backspace)</button>
                    </div>
                  </>
                )}
              </div>
            )}

            {step.phase === 'done' && (
              <div className="acc-rule">
                <p className="acc-sentence">Every unit is answered{Object.keys(picks.skipped).some((k) => !(k in picks.picks)) ? ', the twice-skipped ones apart' : ''}.</p>
                <p className="acc-dim">{n(done.byRule)} by {n(picks.rules.length)} rules, {n(done.byHand)} by hand. Download the picks, then the Categories screen if it isn't done.</p>
                <div className="acc-cat-buttons">
                  <button type="button" className="btn primary" onClick={download}>Download picks</button>
                  <button type="button" className="btn" onClick={() => setScreen('categories')}>Categories</button>
                </div>
              </div>
            )}
          </section>
        </main>
      )}

      {clearing && (
        <Modal
          title="Start over?"
          onClose={() => setClearing(false)}
          footer={(
            <>
              <button type="button" className="btn" onClick={() => setClearing(false)}>Keep them</button>
              <button type="button" className="btn danger" onClick={() => { update(emptyPicks(data)); setClearing(false); }}>Forget every pick</button>
            </>
          )}
        >
          <p>Every pick, rule and category answer in this browser goes. Download them first if they're worth keeping.</p>
        </Modal>
      )}
    </div>
  );
}

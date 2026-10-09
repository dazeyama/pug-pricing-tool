import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../../components/Modal.jsx';
import LinePreview, { previewFor } from '../../components/LinePreview.jsx';
import { useStaff } from '../../state/staff.jsx';
import { useDevice } from '../../state/device.jsx';
import { useToast } from '../../components/Toast.jsx';
import { formatMoney } from '../../lib/money.js';
import { formatShortDate } from '../../lib/time.js';
import { cardImage, loadSets } from '../../lib/scryfall.js';
import { magicTraits } from '../../lib/printings.js';
import { defaultName } from '../../lib/importMatch.js';
import {
  findPrintings, importLines, matchImport, readImportFile, rememberPicks, saveImport,
} from '../../lib/importCollection.js';
import { errorMessage } from './useCollection.js';

// Import Collection (owner, 2026-10-09): a Mass Create CSV (CardBot's, or
// our own EXPORT's) read back into cards. Matching, then Review like the
// export's (Needs a choice, Matched, Skipped): staff pick the printing for
// each unclear row, or skip it, and their picks are remembered. Then the
// new project's name, or straight into the empty collection it was dropped on.

const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

/** "Kaldheim (KHM) #123 · Borderless, Showcase", and whether it comes in the row's finish. */
function printingLabel(card, finish) {
  const traits = [...magicTraits(card).values()].join(', ');
  const missing = finish && !(card.finishes ?? []).includes(finish) ? ` · no ${finish === 'nonfoil' ? 'non-foil' : finish}` : '';
  return `${card.set_name} (${card.set.toUpperCase()}) #${card.collector_number}${traits ? ` · ${traits}` : ''}${missing}`;
}

/**
 * @param {object} p
 * @param {File} p.file
 * @param {{ kind: 'project' } | { kind: 'into', buyId: string, version: number, name: string }} p.target
 * @param {(id: string) => void} p.onDone  after the cards are saved
 * @param {() => void} p.onClose
 */
export default function ImportDialog({ file, target, onDone, onClose }) {
  const staff = useStaff();
  const toast = useToast();
  const { deviceId } = useDevice();
  const [phase, setPhase] = useState('reading');   // reading | review | name | saving | error
  const [stepText, setStepText] = useState('');
  const [error, setError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [results, setResults] = useState([]);
  const [picks, setPicks] = useState(new Map());      // row index → { card } | 'skip'
  const [editing, setEditing] = useState(new Set());  // matched rows opened with Change
  const [name, setName] = useState(() => defaultName(file.name, (d) => formatShortDate(d)));
  const [preview, setPreview] = useState(null);
  const hidePreview = useCallback(() => setPreview(null), []);
  const box = useRef(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        setStepText(`Reading ${file.name}…`);
        const { rows, missing } = await readImportFile(file);
        if (missing.length) {
          throw new Error(`This isn't a Mass Create file: it has no ${missing.join(', ')} column${missing.length === 1 ? '' : 's'}. `
            + `It needs ${['Add Qty', 'Product Name', 'Category', 'Condition', 'Language', 'Sell Price'].join(', ')}.`);
        }
        if (!rows.length) throw new Error('The file has no cards in it.');
        const found = await matchImport(rows, (t) => live && setStepText(t));
        if (!live) return;
        setResults(found);
        setPhase('review');
      } catch (e) {
        if (!live) return;
        setError(e.message);
        setPhase('error');
      }
    })();
    return () => {
      live = false;
    };
  }, [file]);

  /** Where a row stands now: matched (how), to choose, or skipped (why). */
  const stateOf = (r) => {
    if (r.status === 'skip') return { kind: 'skip', reason: r.row.problem };
    const pick = picks.get(r.row.index);
    if (pick === 'skip') return { kind: 'skip', reason: 'Skipped' };
    if (pick) return { kind: 'matched', card: pick.card, finish: r.finish, by: 'staff' };
    if (r.status === 'auto') return { kind: 'matched', card: r.card, finish: r.finish, by: r.via };
    return { kind: 'choose' };
  };

  const groups = useMemo(() => ({
    // Rows staff must decide stay here, showing what they picked (as the export's review does).
    choose: results.filter((r) => r.status === 'choose' || r.status === 'none'),
    matched: results.filter((r) => r.status === 'auto'),
    skipped: results.filter((r) => r.status === 'skip'),
  }), [results]);
  const open = groups.choose.filter((r) => !picks.has(r.row.index));
  const going = results.filter((r) => stateOf(r).kind === 'matched');
  const cards = going.reduce((n, r) => n + r.row.qty, 0);
  const value = going.reduce((s, r) => s + r.row.qty * r.row.price, 0);
  const skippedRows = results.filter((r) => stateOf(r).kind === 'skip').length;

  const pick = (r, value) => setPicks((m) => new Map(m).set(r.row.index, value));
  const edit = (r, on) => setEditing((s) => {
    const next = new Set(s);
    if (on) next.add(r.row.index);
    else next.delete(r.row.index);
    return next;
  });

  async function save() {
    if (!staff.current) {
      staff.pulse();
      return;
    }
    const back = phase;
    setPhase('saving');
    setSaveError(null);
    try {
      const chosen = going.map((r) => ({ row: r.row, ...stateOf(r) }));
      const lines = importLines(chosen, await loadSets(), file.name);
      const id = await saveImport({
        target, name: name.trim(), lines, fileName: file.name, userId: staff.current.id, deviceId,
      });
      // Staff's picks, remembered for the next file (and the export) once the cards are in.
      const staffPicks = results.filter((r) => picks.get(r.row.index)?.card)
        .map((r) => ({ row: r.row, card: picks.get(r.row.index).card, finish: r.finish, product: r.product }));
      try {
        await rememberPicks(staffPicks, staff.current.id);
      } catch (e) {
        toast(`The cards are in, but ${e.message.toLowerCase()}`, 'err');
      }
      toast(`Imported ${plural(cards, 'card')}${skippedRows ? `; ${plural(skippedRows, 'row')} skipped` : ''}.`, 'ok');
      onDone(id);
    } catch (e) {
      setSaveError(errorMessage(e, "Couldn't import the cards"));
      setPhase(back);
    }
  }

  const label = (r) => (
    <span className="xd-line">
      {r.row.qty}× {r.row.productName}
      <span className="xd-cat">{r.row.category}</span>
      <span className="xd-where">{r.row.condition} · {formatMoney(r.row.price)}</span>
    </span>
  );
  const rowProps = (r) => ({
    r,
    label: label(r),
    chosen: picks.get(r.row.index),
    onPick: (card) => pick(r, { card }),
    onSkip: () => pick(r, 'skip'),
    onPreview: (card, el) => setPreview(previewFor(cardImage(card, 'normal'), el, box.current)),
    onHide: hidePreview,
  });

  let footer;
  if (phase === 'review') {
    const blocked = open.length ? `Pick or skip ${plural(open.length, 'row')} first` : !cards ? 'Nothing to import' : null;
    footer = (
      <>
        <span className="xd-summary imp-summary">
          {plural(cards, 'card')} · {formatMoney(value)}{skippedRows ? ` · ${plural(skippedRows, 'row')} skipped` : ''}
        </span>
        <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        <button
          type="button"
          className="btn primary"
          disabled={Boolean(blocked)}
          title={blocked ?? undefined}
          onClick={() => (target.kind === 'project' ? setPhase('name') : save())}
        >
          {target.kind === 'project' ? 'Next: name the project' : `Import ${plural(cards, 'card')}`}
        </button>
      </>
    );
  } else if (phase === 'name') {
    footer = (
      <>
        <button type="button" className="btn ghost" onClick={() => setPhase('review')}>Back</button>
        <button type="button" className="btn primary" disabled={!name.trim()} onClick={save}>Create project</button>
      </>
    );
  } else if (phase === 'saving') {
    footer = <button type="button" className="btn primary" disabled>Importing…</button>;
  } else {
    footer = <button type="button" className="btn ghost" onClick={onClose}>{phase === 'error' ? 'Close' : 'Cancel'}</button>;
  }

  const title = target.kind === 'project' ? `Import Collection: ${file.name}` : `Import into ${target.name}: ${file.name}`;
  return (
    <Modal wide className="xd-modal" title={title} onClose={phase === 'saving' ? undefined : onClose} footer={footer}>
      <div className="xd" ref={box}>
        {phase === 'reading' && <p className="loading-note xd-step">{stepText || 'Reading…'}</p>}
        {phase === 'error' && <div className="banner err">{error}</div>}
        {saveError && <div className="banner err">{saveError}</div>}
        {(phase === 'review' || (phase === 'saving' && target.kind !== 'project')) && (
          <>
            <p className="hint xd-intro">
              Magic only: each row is matched to its exact printing. Prices are the file's Sell Prices (REPRICE? updates
              them). Printings you pick are remembered for next time.
            </p>
            {groups.choose.length > 0 && (
              <section className="xd-group choose">
                <h4>Needs a choice <span className="xd-count">{groups.choose.length}</span></h4>
                {groups.choose.map((r) => <ChooseRow key={r.row.index} {...rowProps(r)} />)}
              </section>
            )}
            <section className="xd-group matched">
              <details open={groups.matched.length <= 8}>
                <summary>
                  <h4>Matched <span className="xd-count">{groups.matched.length}</span></h4>
                </summary>
                {groups.matched.map((r) => {
                  const s = stateOf(r);
                  if (editing.has(r.row.index)) {
                    return <ChooseRow key={r.row.index} {...rowProps(r)} detected={r.card} onDone={() => edit(r, false)} />;
                  }
                  return (
                    <div key={r.row.index} className="xd-row">
                      {label(r)}
                      <span className="xd-arrow">→</span>
                      {s.kind === 'skip' ? (
                        <span className="xd-reason">Skipped</span>
                      ) : (
                        <span
                          className="xd-product"
                          onMouseEnter={(e) => setPreview(previewFor(cardImage(s.card, 'normal'), e.currentTarget, box.current))}
                          onMouseLeave={hidePreview}
                        >
                          {printingLabel(s.card, s.finish)}
                          {s.by === 'remembered' && <span className="xd-tag" title="Picked for this row before">remembered</span>}
                          {s.by === 'link' && <span className="xd-tag" title="The printing the export matches to this product">export match</span>}
                          {s.by === 'staff' && <span className="xd-tag">picked</span>}
                          {s.by === 'match' && r.elsewhere && (
                            <span className="xd-note" title="None of the sets this category exports from has this card">another set</span>
                          )}
                        </span>
                      )}
                      <button type="button" className="btn small ghost xd-change" onClick={() => edit(r, true)}>Change</button>
                    </div>
                  );
                })}
                {!groups.matched.length && <p className="hint">None.</p>}
              </details>
            </section>
            {groups.skipped.length > 0 && (
              <section className="xd-group cant">
                <h4>Can't import <span className="xd-count">{groups.skipped.length}</span></h4>
                {groups.skipped.map((r) => (
                  <div key={r.row.index} className="xd-row">
                    {label(r)}
                    <span className="xd-reason">Line {r.row.line}: {r.row.problem}</span>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
        {(phase === 'name' || (phase === 'saving' && target.kind === 'project')) && (
          <>
            <label className="field">
              <span>Project name</span>
              <input
                type="text"
                autoFocus
                maxLength={80}
                value={name}
                disabled={phase === 'saving'}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && name.trim()) save();
                }}
              />
            </label>
            <p className="hint">
              A new project with {plural(cards, 'card')} ({formatMoney(value)} at the file's prices). It opens once it's made.
            </p>
          </>
        )}
      </div>
      <LinePreview preview={preview} onHide={hidePreview} />
    </Modal>
  );
}

/**
 * One row to decide: the printings it could be (best first; ones that don't
 * fit its number or finish after them), any found by searching, or Skip.
 */
function ChooseRow({ r, label, chosen, detected = null, onPick, onSkip, onPreview, onHide, onDone }) {
  const [text, setText] = useState('');
  const [found, setFound] = useState([]);
  const [searching, setSearching] = useState(false);
  const fits = r.ranked.filter((x) => x.score != null).map((x) => x.card);
  const others = r.ranked.filter((x) => x.score == null).map((x) => x.card);
  const listed = new Set(r.ranked.map((x) => x.card.id));
  const current = chosen === 'skip' ? 'skip' : chosen?.card?.id ?? (onDone ? detected?.id : null);

  async function search() {
    setSearching(true);
    try {
      setFound(await findPrintings(text));
    } catch {
      setFound([]);
    } finally {
      setSearching(false);
    }
  }

  const option = (card, note) => (
    <label
      key={card.id}
      className={`xd-option${note ? ' off' : ''}`}
      onMouseEnter={(e) => onPreview(card, e.currentTarget)}
      onMouseLeave={onHide}
    >
      <input type="radio" name={`imp-${r.row.index}`} checked={current === card.id} onChange={() => onPick(card)} />
      <span className="xd-product">
        {printingLabel(card, r.finish)}
        {note && <span className="xd-note">{note}</span>}
        {detected?.id === card.id && <span className="xd-tag" title="The printing the app matched by itself">detected</span>}
      </span>
    </label>
  );

  return (
    <div className={`xd-choose${onDone ? ' editing' : ''}`}>
      <div className="xd-row">
        {label}
        {r.elsewhere && r.ranked.length > 0 && (
          <span className="xd-note" title="None of the sets this category exports from has this card">found in other sets</span>
        )}
        {onDone && (
          <span className="xd-edit-buttons">
            <button type="button" className="btn small primary" onClick={onDone}>Done</button>
          </span>
        )}
      </div>
      <div className="xd-options">
        {fits.map((card) => option(card, null))}
        {others.map((card) => option(card, 'another number or finish'))}
        {found.filter((card) => !listed.has(card.id)).map((card) => option(card, 'found by search'))}
        {!r.ranked.length && !found.length && <p className="hint">No printing with this name was found.</p>}
        <label className="xd-option none">
          <input type="radio" name={`imp-${r.row.index}`} checked={current === 'skip'} onChange={onSkip} />
          <span>Skip this row (not imported)</span>
        </label>
      </div>
      <input
        type="search"
        className="xd-search"
        placeholder={searching ? 'Searching…' : 'Find another printing by name, then Enter…'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            search();
          }
        }}
      />
    </div>
  );
}

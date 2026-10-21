import { useRef, useState } from 'react';
import { useBulkCut, useSettings } from '../../state/settings.jsx';
import { useStaff } from '../../state/staff.jsx';
import { useToast } from '../../components/Toast.jsx';
import GuardButton from '../../components/GuardButton.jsx';
import { CUT_MAX, CUT_MIN, bandWords, cutMoney, keptWords } from '../../lib/bulkCut.js';

const cents = (v) => Math.round(v * 100);
const MIN = cents(CUT_MIN);
const MAX = cents(CUT_MAX);
/** Where a price sits along the track, 0 to 100%. */
const at = (c) => `${((c - MIN) / (MAX - MIN)) * 100}%`;

/**
 * The slider (owner, 2026-10-20): 1¢ to $3, red up to the first dot, amber up to the second, the
 * rest kept. Dragged, or arrow keys a cent at a time (Shift: 10¢), only while editing; each dot
 * stays a cent clear of the other.
 * @param {{ red: number, amber: number }} p.value  in cents
 */
function CutSlider({ value, editing, onChange }) {
  const track = useRef(null);
  const limits = { red: [MIN, value.amber - 1], amber: [value.red + 1, MAX] };
  const move = (dot, c) => {
    const [lo, hi] = limits[dot];
    onChange({ ...value, [dot]: Math.min(hi, Math.max(lo, Math.round(c))) });
  };
  const fromPointer = (e) => {
    const box = track.current.getBoundingClientRect();
    return MIN + ((e.clientX - box.left) / box.width) * (MAX - MIN);
  };
  const dot = (key, label) => (
    <span
      key={key}
      className={`cut-dot cut-dot-${key}`}
      style={{ left: at(value[key]) }}
      role="slider"
      tabIndex={editing ? 0 : -1}
      aria-label={label}
      aria-valuemin={limits[key][0] / 100}
      aria-valuemax={limits[key][1] / 100}
      aria-valuenow={value[key] / 100}
      aria-valuetext={cutMoney(value[key] / 100)}
      aria-disabled={!editing || undefined}
      onPointerDown={editing ? (e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
      } : undefined}
      onPointerMove={editing ? (e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) move(key, fromPointer(e));
      } : undefined}
      onKeyDown={editing ? (e) => {
        const step = e.shiftKey ? 10 : 1;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') move(key, value[key] - step);
        else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') move(key, value[key] + step);
        else return;
        e.preventDefault();
      } : undefined}
    >
      <span className="cut-dot-value">{cutMoney(value[key] / 100)}</span>
    </span>
  );

  return (
    <div className={`cut-slider${editing ? ' is-editing' : ''}`}>
      <div className="cut-track" ref={track}>
        <span className="cut-band cut-band-red" style={{ left: 0, width: at(value.red) }} />
        <span className="cut-band cut-band-amber" style={{ left: at(value.red), right: `calc(100% - ${at(value.amber)})` }} />
        <span className="cut-band cut-band-kept" style={{ left: at(value.amber), right: 0 }} />
        <span className="cut-dot cut-dot-end" style={{ left: 0 }} />
        <span className="cut-dot cut-dot-end" style={{ left: '100%' }} />
        {dot('red', 'Red, true bulk, up to')}
        {dot('amber', 'Amber, a $1 card, up to')}
      </div>
      <div className="cut-ends">
        <span>{cutMoney(CUT_MIN)}</span>
        <span>{cutMoney(CUT_MAX)}</span>
      </div>
    </div>
  );
}

// Settings → Bulk export rates (decision 416): which cards are bulk. Red and amber on Print MTG /
// Print PKM, and everything up to amber pulled from Export MTG csv (>…) and left off Print MTG (>…).
// Shown, not moved, until EDIT; nothing is saved until SAVE; both need a user.
export default function BulkExportRatesPanel() {
  const { loaded, save } = useSettings();
  const cut = useBulkCut();
  const { current } = useStaff();
  const toast = useToast();
  const [draft, setDraft] = useState(null);   // { red, amber } in cents while editing
  const [saving, setSaving] = useState(false);

  const shown = draft ?? { red: cents(cut.red), amber: cents(cut.amber) };
  const asCut = { red: shown.red / 100, amber: shown.amber / 100 };
  const bands = bandWords(asCut);

  async function onSave() {
    setSaving(true);
    const next = { red: draft.red / 100, amber: draft.amber / 100 };
    const error = await save('bulk_export_rates', next, current?.id);
    setSaving(false);
    if (error) {
      toast(`Couldn't save the Bulk export rates: ${error}`, 'err');
      return;
    }
    setDraft(null);
    toast(`Bulk export rates saved: red ${bandWords(next).red}, amber ${bandWords(next).amber}.`, 'ok');
  }

  return (
    <section className="cardpanel settings-panel cut-panel">
      <div className="cardpanel-head"><strong>Bulk export rates</strong></div>
      <div className="cardpanel-body">
        <p className="hint">
          Which cards are bulk, by price: today’s market price on a print, the Sell Price on an
          export. Print MTG and Print PKM show red and amber prices;
          Export MTG csv (&gt;…) pulls every red and amber card to Bulk pulled from exports, and
          Print MTG (&gt;…) leaves them off.
        </p>
        <CutSlider value={shown} editing={Boolean(draft)} onChange={setDraft} />
        {/* The Key half the panel's width, the buttons bottom right beside it (owner, 2026-10-20): the
            panel fits without scrolling. */}
        <div className="cut-bottom">
          <fieldset className="cut-key">
            <legend>Key</legend>
            <div><span className="cut-swatch cut-band-red" /> <strong>Red</strong>, true bulk: {bands.red}</div>
            <div><span className="cut-swatch cut-band-amber" /> <strong>Amber</strong>, a $1 card: {bands.amber}</div>
            <div><span className="cut-swatch cut-band-kept" /> Kept in (&gt;…): {keptWords(asCut)}</div>
          </fieldset>
          <div className="cut-foot">
            {draft ? (
              <>
                <button type="button" className="btn big ghost" disabled={saving} onClick={() => setDraft(null)}>
                  CANCEL
                </button>
                <GuardButton className="btn big primary" disabled={saving} onClick={onSave}>
                  {saving ? 'Saving…' : 'SAVE'}
                </GuardButton>
              </>
            ) : (
              <GuardButton
                className="btn big"
                disabled={!loaded}
                title={loaded ? undefined : "Settings haven't loaded yet"}
                onClick={() => setDraft({ red: cents(cut.red), amber: cents(cut.amber) })}
              >
                EDIT
              </GuardButton>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

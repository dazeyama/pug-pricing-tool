import { useState } from 'react';
import { useBulkCut, useSettings } from '../../state/settings.jsx';
import { useStaff } from '../../state/staff.jsx';
import { useToast } from '../../components/Toast.jsx';
import GuardButton from '../../components/GuardButton.jsx';
import { CUT_MAX, CUT_MIN, bandWords, cutMoney, keptWords } from '../../lib/bulkCut.js';

const cents = (v) => Math.round(v * 100);
const MIN = cents(CUT_MIN);
const MAX = cents(CUT_MAX);
/** Where a price sits along the bar, 0 to 100%. */
const at = (c) => `${((c - MIN) / (MAX - MIN)) * 100}%`;

/**
 * One cut's slider: a standard range control, 1¢ to $3 a cent at a time, on the bar's scale so its
 * thumb sits under the band's end. Kept a cent clear of the other cut.
 */
function CutRange({ id, label, value, lo, hi, editing, onChange }) {
  return (
    <div className={`cut-row cut-row-${id}`}>
      <label htmlFor={`cut-${id}`}>{label}</label>
      <input
        id={`cut-${id}`}
        type="range"
        min={MIN}
        max={MAX}
        step={1}
        value={value}
        disabled={!editing}
        aria-valuetext={cutMoney(value / 100)}
        onChange={(e) => onChange(Math.min(hi, Math.max(lo, Number(e.target.value))))}
      />
      <output htmlFor={`cut-${id}`}>{cutMoney(value / 100)}</output>
    </div>
  );
}

// Settings → Bulk export rates (decision 416): which cards are bulk. Red and amber on Print MTG /
// Print PKM, and everything up to amber pulled from Export MTG csv (>…) and left off Print MTG (>…).
// The sliders are off until EDIT; nothing is saved until SAVE; both need a user (owner, 2026-10-20:
// standard controls for the dots, the buttons bottom right, the colours in a Key box).
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
  const editing = Boolean(draft);

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
          Which cards are bulk: today’s market price on a print, the Sell Price on an export. Red and amber
          cards are pulled from the (&gt;…) exports and left off the (&gt;…) prints.
        </p>
        <div className="cut-row cut-bar-row">
          <span />
          <div className="cut-bar" aria-hidden="true">
            <span className="cut-band-red" style={{ left: 0, width: at(shown.red) }} />
            <span className="cut-band-amber" style={{ left: at(shown.red), width: `calc(${at(shown.amber)} - ${at(shown.red)})` }} />
            <span className="cut-band-kept" style={{ left: at(shown.amber), right: 0 }} />
          </div>
          <span />
        </div>
        <CutRange
          id="red" label="Red up to" value={shown.red} lo={MIN} hi={shown.amber - 1} editing={editing}
          onChange={(red) => setDraft({ ...shown, red })}
        />
        <CutRange
          id="amber" label="Amber up to" value={shown.amber} lo={shown.red + 1} hi={MAX} editing={editing}
          onChange={(amber) => setDraft({ ...shown, amber })}
        />
        <fieldset className="cut-key">
          <legend>Key</legend>
          <div><span className="cut-swatch cut-band-red" /> <strong>Red</strong>, true bulk: {bands.red}</div>
          <div><span className="cut-swatch cut-band-amber" /> <strong>Amber</strong>, a $1 card: {bands.amber}</div>
          <div><span className="cut-swatch cut-band-kept" /> Kept in the (&gt;…) exports and prints: {keptWords(asCut)}</div>
        </fieldset>
      </div>
      <div className="cut-foot">
        {editing ? (
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
    </section>
  );
}

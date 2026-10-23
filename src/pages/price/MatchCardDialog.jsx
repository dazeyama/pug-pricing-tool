import { useEffect, useState } from 'react';
import Modal from '../../components/Modal.jsx';
import ChooseRow from '../export/ChooseRow.jsx';
import { matchPrinting } from '../../lib/owned.js';
import { saveLink, saveSetMap } from '../../lib/ccExport.js';
import { finishWord } from '../../lib/ownedRates.js';
import { useToast } from '../../components/Toast.jsx';

/**
 * Which Crystal Commerce product is this printing? (owner, 2026-10-23; decision 468): from the owned-copies
 * counter's n/a, the export's own choice for one card: its candidates, a search, and "Always use … for this
 * set" when its set has no category yet. A pick is only selected until SAVE (decision 469), then remembered for
 * the printing and finish just as a pick in EXPORT is (cc_product_links), so the next export takes it too, and
 * the counter counts again; CANCEL (or Esc, or a click outside) leaves everything as it was.
 * @param {{ candidate: object, finish: string, userId: string|null, onPicked: () => void, onClose: () => void }} props
 */
export default function MatchCardDialog({ candidate, finish, userId, onPicked, onClose }) {
  const toast = useToast();
  const [match, setMatch] = useState(null);   // the match, or { error }
  const [always, setAlways] = useState(false);
  const [saving, setSaving] = useState(false);
  // The product picked, saved only on SAVE (owner, 2026-10-23: "not apply until save is pressed"; decision 469).
  const [picked, setPicked] = useState(null);

  useEffect(() => {
    let live = true;
    matchPrinting(candidate, finish).then(
      (r) => live && setMatch(r),
      (e) => live && setMatch({ error: e.message }),
    );
    return () => {
      live = false;
    };
  }, [candidate, finish]);

  async function save() {
    const product = picked;
    if (saving || !product || !match?.line) return;
    setSaving(true);
    try {
      await saveLink(match.line, product, userId);
      if (!match.category && always) await saveSetMap(match.set.code, match.promo, product.category, userId);
      toast(`Matched to ${product.product_name} (${product.category}): counted again, and EXPORT will use it.`, 'ok');
      onPicked();
      onClose();
    } catch (e) {
      toast(e.message, 'err');
      setSaving(false);
    }
  }

  const card = candidate.scryfall;
  const label = (
    <span className="xd-card">
      <strong>{card.name}</strong>
      {' '}
      <span className="xd-cat">
        {card.set.toUpperCase()} #{card.collector_number}{finishWord(finish) ? ` · ${finishWord(finish)}` : ''}
      </span>
    </span>
  );

  return (
    <Modal
      title="Which Crystal Commerce product is this?"
      onClose={saving ? undefined : onClose}
      wide
      footer={(
        <>
          <button type="button" className="btn ghost" disabled={saving} onClick={onClose}>CANCEL</button>
          <button
            type="button"
            className={`btn primary${saving ? ' busy' : ''}`}
            disabled={!picked || saving}
            title={picked ? `Remember ${picked.product_name} (${picked.category}) for this printing` : 'Pick a product first'}
            onClick={save}
          >
            SAVE
          </button>
        </>
      )}
    >
      {!match && <p className="hint">Finding its Crystal Commerce products…</p>}
      {match?.error && <p className="status err">{match.error}</p>}
      {match?.line && (
        <>
          <p className="hint">
            Pick the product this printing is filed under, then SAVE. It&apos;s remembered as a pick in EXPORT
            is, so the copies we own count, and the next export takes it without asking. CANCEL leaves it as it was.
          </p>
          <ChooseRow
            r={match}
            label={label}
            price={null}
            sell={null}
            manual={null}
            onManual={() => {}}
            always={always}
            onAlways={setAlways}
            onPick={setPicked}
            onNone={() => {}}
            allowNone={false}
          />
        </>
      )}
    </Modal>
  );
}

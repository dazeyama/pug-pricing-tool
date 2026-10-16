import { useState } from 'react';
import Modal from './Modal.jsx';
import { lineText } from '../lib/lineFormat.js';

// What the × does (owner, 2026-10-16): removes; or, in a Paid/Ours buy,
// collection or project, strikes first (lib/struck.js); on a struck card,
// removes it for good.
const REMOVE_WORDS = {
  remove: { title: 'Remove card?', verb: 'Remove', note: null },
  strike: {
    title: 'Strike card?',
    verb: 'Strike',
    note: 'It stays on the list, crossed out, as a record (moved elsewhere: into the case, say), and is never '
      + 'exported. × again removes it; right-click → Restore puts it back.',
  },
  struck: { title: 'Remove for good?', verb: 'Remove', note: 'The struck card goes from the list; the Changelog keeps a record.' },
};

/**
 * "Remove card?" (spec 8.9): one copy, or how many of several. `note` adds a
 * line under the question (a day page: "This buy was already confirmed.").
 * `mode`: 'remove', 'strike' (the first × in a Paid/Ours list) or 'struck'
 * (a struck card's ×, for good). Used by the buy list and the day pages.
 */
export default function RemoveModal({ line, note = null, mode = 'remove', onRemove, onClose }) {
  const [qty, setQty] = useState(1);
  const many = line.quantity > 1;
  const words = REMOVE_WORDS[mode] ?? REMOVE_WORDS.remove;
  const tail = [note, words.note].filter(Boolean);
  return (
    <Modal
      title={words.title}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn danger" onClick={() => onRemove(line, qty)}>{words.verb}</button>
          {many && (
            <button type="button" className="btn danger" onClick={() => onRemove(line, line.quantity)}>
              {words.verb} all {line.quantity}
            </button>
          )}
        </>
      )}
    >
      {many ? (
        <>
          <p>{words.verb} how many of <strong>{lineText(line)}</strong>?</p>
          <label className="remove-qty">
            <input
              type="number"
              min="1"
              max={line.quantity}
              value={qty}
              autoFocus
              onChange={(e) => setQty(Math.min(line.quantity, Math.max(1, Number(e.target.value) || 1)))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onRemove(line, qty);
              }}
            />
            of {line.quantity}
          </label>
        </>
      ) : (
        <p>{words.verb} <strong>{lineText(line)}</strong>?</p>
      )}
      {tail.map((t) => <p key={t} className="hint">{t}</p>)}
    </Modal>
  );
}

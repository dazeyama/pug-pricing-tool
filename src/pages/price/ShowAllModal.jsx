import { useEffect, useRef, useState } from 'react';
import Modal from '../../components/Modal.jsx';
import { Thumb } from './Suggestions.jsx';
import { PAGE } from '../../lib/cardSearch.js';

/**
 * Every match in a scrollable grid (spec 8.3). Arrow keys move the highlight
 * (←/→ one card, ↑/↓ one row), Enter picks it; clicking picks too. Picking
 * selects the card and closes the modal; Esc just closes it.
 */
export default function ShowAllModal({ candidates, hasMore, selectedKey, onPick, onClose }) {
  const start = Math.max(0, candidates.findIndex((c) => c.key === selectedKey));
  const [cursor, setCursor] = useState(start);
  const grid = useRef(null);

  useEffect(() => {
    grid.current?.focus();
  }, []);

  useEffect(() => {
    grid.current?.children[cursor]?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  function columns() {
    const tracks = getComputedStyle(grid.current).gridTemplateColumns.split(' ').filter(Boolean);
    return Math.max(1, tracks.length);
  }

  function onKeyDown(e) {
    const last = candidates.length - 1;
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns(), ArrowUp: -columns() }[e.key];
    if (step) {
      e.preventDefault();
      setCursor((i) => Math.min(last, Math.max(0, i + step)));
    } else if (e.key === 'Enter' && candidates[cursor]) {
      e.preventDefault();
      onPick(candidates[cursor]);
    }
  }

  return (
    <Modal title={`All matches (${candidates.length}${hasMore ? '+' : ''})`} onClose={onClose} wide>
      {hasMore && (
        <p className="hint">More than {PAGE} printings match. Refine your search to see the rest.</p>
      )}
      <div className="all-grid" ref={grid} tabIndex={0} onKeyDown={onKeyDown} aria-label="All matching cards">
        {candidates.map((c, i) => (
          <Thumb key={c.key} c={c} highlighted={i === cursor} selected={c.key === selectedKey} onPick={onPick} />
        ))}
      </div>
    </Modal>
  );
}

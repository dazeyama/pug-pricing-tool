import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import GameBadge from './GameBadge.jsx';
import { countText, countsByGame } from '../lib/bulk.js';

// The chip's widest likely size, to keep it on screen near the right edge.
const CHIP_ROOM = 300;

/**
 * A collection's or project's name. Pointing at it shows a chip with its
 * cards by game (owner, 2026-10-16, decision 276): "MTG 42 cards + 1,000
 * bulk", "PKM 7 cards · 1 struck", counted as CONFIRM BUY counts them. It
 * floats above the page, as a line's picture does (LinePreview), so a table
 * can't clip it.
 * @param {{ lines: object[]|null|undefined, children: import('react').ReactNode }} props
 *   lines: the collection's buy_lines, each with game, quantity, bulk_kind and struck_at
 */
export default function CardCountsName({ lines, children }) {
  const ref = useRef(null);
  const [at, setAt] = useState(null);   // { top, left } while pointed at
  const hide = useCallback(() => setAt(null), []);
  // It goes away when the page scrolls under it.
  useEffect(() => {
    if (!at) return undefined;
    window.addEventListener('scroll', hide, true);
    return () => window.removeEventListener('scroll', hide, true);
  }, [at, hide]);

  function show() {
    const r = ref.current.getBoundingClientRect();
    setAt({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - CHIP_ROOM)) });
  }

  const games = at ? countsByGame(lines) : [];
  return (
    <span ref={ref} className="counts-name" onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {at && createPortal(
        <span className="counts-chip" role="tooltip" style={{ top: at.top, left: at.left }}>
          {games.length
            ? games.map(({ game, counts }) => (
              <span key={game} className="counts-game"><GameBadge game={game} />{countText(counts)}</span>
            ))
            : <span className="counts-game">No cards yet</span>}
        </span>,
        document.body,
      )}
    </span>
  );
}

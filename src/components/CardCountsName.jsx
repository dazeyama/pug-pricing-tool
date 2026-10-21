import GameBadge from './GameBadge.jsx';
import HoverChip from './HoverChip.jsx';
import { countText, countsByGame } from '../lib/bulk.js';

/**
 * A collection's or project's name. Pointing at it shows a chip with its
 * cards by game (owner, 2026-10-16, decision 276): "MTG 42 cards + 1,000
 * bulk", "PKM 7 cards · 1 struck", counted as CONFIRM BUY counts them. The
 * chip's placement is HoverChip's.
 * @param {{ lines: object[]|null|undefined, children: import('react').ReactNode }} props
 *   lines: the collection's buy_lines, each with game, quantity, bulk_kind and struck_at
 */
export default function CardCountsName({ lines, children }) {
  const chip = () => {
    const games = countsByGame(lines);
    return games.length
      ? games.map(({ game, counts }) => (
        <span key={game} className="counts-game"><GameBadge game={game} />{countText(counts)}</span>
      ))
      : <span className="counts-game">No cards yet</span>;
  };
  return <HoverChip className="counts-name" chip={chip}>{children}</HoverChip>;
}

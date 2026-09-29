// MTG in indigo, PKM in amber with dark text (spec 7.1). `off` greys it out,
// e.g. while that game's source isn't answering.
export default function GameBadge({ game, off = false }) {
  return (
    <span className={`game-badge ${game}${off ? ' off' : ''}`}>
      {game === 'mtg' ? 'MTG' : 'PKM'}
    </span>
  );
}

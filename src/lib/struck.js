import { isBulk } from './bulk.js';
import { formatShortDate } from './time.js';

// Struck cards (owner, 2026-10-16; migration 0059): in a Paid/Ours buy,
// collection or project the first × strikes a card. It stays on the list,
// crossed out, as a record (moved elsewhere: put straight into the case, say),
// but it's treated as gone by everything that moves cards on: exports, Check
// matches, COMPLETE, Mark as completed, printouts, the header search and the
// card counts. It still counts in the totals: it was bought and paid for. A
// second × removes it; right-click → Restore puts it back. Can't upload cards
// doesn't strike: its × removes at once.

/** A struck card. */
export const isStruck = (line) => Boolean(line?.struck_at);

/** A card that goes on with the rest (exported, completed, printed): not bulk, not struck. */
export const movesOn = (line) => !isBulk(line) && !isStruck(line);

/** "Struck by Sam, Oct 16, 2026: …", for its tooltip. `byId`: the staff lookup. */
export function struckNote(line, byId) {
  const who = line.struck_by ? byId?.(line.struck_by)?.name : null;
  return `Struck${who ? ` by ${who}` : ''}, ${formatShortDate(line.struck_at)}: kept as a record, never exported`;
}

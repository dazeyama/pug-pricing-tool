import { isBulk } from './bulk.js';
import { formatShortDate } from './time.js';

// Struck cards (owner, 2026-10-16; migrations 0059, 0060): in a Paid/Ours
// walk-in buy or collection the first × strikes a card. It stays on the list,
// crossed out, as a record (moved elsewhere: put straight into the case, say),
// but it's treated as gone by everything that moves cards on: exports, Check
// matches, COMPLETE, Mark as completed, printouts, the header search (but
// Show all finds it, crossed out: decision 275) and the card counts. It
// still counts in the totals: it was bought and paid for. A second ×
// removes it; right-click → Restore puts it back. Projects and Can't
// upload cards don't strike: their × removes at once, and Convert to project
// leaves a buy's struck cards out (crossed out in its Changelog entry).

/** A struck card. */
export const isStruck = (line) => Boolean(line?.struck_at);

/** A card that goes on with the rest (exported, completed, printed): not bulk, not struck. */
export const movesOn = (line) => !isBulk(line) && !isStruck(line);

/** "Struck by Sam, Oct 16, 2026: …", for its tooltip. `byId`: the staff lookup. */
export function struckNote(line, byId) {
  const who = line.struck_by ? byId?.(line.struck_by)?.name : null;
  return `Struck${who ? ` by ${who}` : ''}, ${formatShortDate(line.struck_at)}: kept as a record, never exported`;
}

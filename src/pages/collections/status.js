// A collection's statuses (spec 9.5), in order. After Paid/Ours comes
// Completed (owner, 2026-09-29): the cards have moved on, so it's locked and
// search leaves it out.
export const STATUSES = [
  { value: 'processing', label: 'Processing' },
  { value: 'priced', label: 'Priced' },
  { value: 'paid', label: 'Paid/Ours' },
  { value: 'completed', label: 'Completed' },
];

/** "Paid/Ours" for 'paid', and so on. */
export const statusLabel = (s) => STATUSES.find((x) => x.value === s)?.label ?? s;

/** Paid/Ours or Completed: locked, with the rates snapshotted. */
export const isClosed = (s) => s === 'paid' || s === 'completed';

/**
 * A collection's colour (owner, 2026-09-29): Processing amber, Priced red,
 * Paid/Ours green for cash or blue for credit (the Cash/Credit colours),
 * Completed grey. A walk-in buy is Paid/Ours until exported, then Completed
 * (owner, 2026-09-30); its Paid/Ours is green or blue by how it was paid, or
 * a neutral light grey for one confirmed before the price was asked for. A CSS
 * class: tone-processing, tone-paid-cash, tone-paid-walkin…
 */
export function statusTone(buy) {
  if (buy.status === 'paid') {
    // Nothing was paid: a walk-in confirmed before the price was asked for,
    // or a project (the store's own cards, owner 2026-10-01).
    if ((buy.kind === 'walk_in' && !buy.paid_method) || buy.project) return 'tone-paid-walkin';
    return `tone-paid-${buy.paid_method === 'credit' ? 'credit' : 'cash'}`;
  }
  return `tone-${buy.status}`;
}

/**
 * A walk-in buy's status for one game's part (owner, 2026-09-30): 'completed'
 * once all its cards in that game are exported, else 'paid' (Paid/Ours).
 */
export function walkInStatus(buy, game) {
  const lines = (buy.buy_lines ?? []).filter((l) => l.game === game);
  return lines.length && lines.every((l) => l.completed_at) ? 'completed' : 'paid';
}

/** The table's filter chips (spec 9.1), Completed last. */
export const FILTERS = [
  { value: 'all', label: 'All', match: () => true },
  { value: 'processing', label: 'Processing', match: (c) => c.status === 'processing' },
  { value: 'priced', label: 'Priced', match: (c) => c.status === 'priced' },
  { value: 'paid-cash', label: 'Paid/Ours Cash', match: (c) => c.status === 'paid' && c.paid_method === 'cash' },
  { value: 'paid-credit', label: 'Paid/Ours Credit', match: (c) => c.status === 'paid' && c.paid_method === 'credit' },
  { value: 'completed', label: 'Completed', match: (c) => c.status === 'completed' },
];

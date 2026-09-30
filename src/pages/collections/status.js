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
 * Completed grey. A CSS class: tone-processing, tone-paid-cash…
 */
export function statusTone(buy) {
  if (buy.status === 'paid') return `tone-paid-${buy.paid_method === 'credit' ? 'credit' : 'cash'}`;
  return `tone-${buy.status}`;
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

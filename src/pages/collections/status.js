// A collection's statuses (spec 9.5), in order.
export const STATUSES = [
  { value: 'processing', label: 'Processing' },
  { value: 'priced', label: 'Priced' },
  { value: 'paid', label: 'Paid/Ours' },
];

/** "Paid/Ours" for 'paid', and so on. */
export const statusLabel = (s) => STATUSES.find((x) => x.value === s)?.label ?? s;

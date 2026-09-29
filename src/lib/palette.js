// The 12 staff-user colours: token names from tokens.css (--pal-*).
export const PALETTE = [
  'pal-crimson', 'pal-orange', 'pal-amber', 'pal-olive', 'pal-green', 'pal-teal',
  'pal-cyan', 'pal-blue', 'pal-indigo', 'pal-violet', 'pal-magenta', 'pal-slate',
];

/** CSS colour for a palette token name, e.g. 'pal-teal' → 'var(--pal-teal)'. */
export function colorVar(color) {
  return `var(--${PALETTE.includes(color) ? color : 'border'})`;
}

/**
 * The colour a new user gets (spec 7.3): the first palette colour no active
 * user has; once all 12 are taken, the least-used one, in palette order.
 * @param {{ color: string }[]} activeUsers
 */
export function nextColor(activeUsers) {
  const counts = new Map(PALETTE.map((c) => [c, 0]));
  for (const u of activeUsers) {
    if (counts.has(u.color)) counts.set(u.color, counts.get(u.color) + 1);
  }
  let best = PALETTE[0];
  for (const c of PALETTE) {
    if (counts.get(c) < counts.get(best)) best = c;
  }
  return best;
}

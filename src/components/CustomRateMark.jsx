import { customNote } from '../lib/rates.js';

/**
 * The CUSTOM chip beside Cash and Credit (owner, 2026-10-15): only when a card
 * in the list has its own rate (Set Rate). The low-end and high-end rates
 * don't show one: almost every trade has some cards on them. `totals` is
 * rates.js rateTotals'.
 */
export default function CustomRateMark({ totals }) {
  if (!totals.off.own) return null;
  return <span className="custom-rate-mark" title={customNote(totals.off)}>custom</span>;
}

// 📈 / 📉 beside a price that rose or fell sharply lately (owner, 2026-10-14):
// quiet, not a warning. From JustTCG's own figures for the price, sent with
// it (no extra request; the `prices` function keeps them): its change over
// 7 and 30 days, in percent (−3.33 is −3.33%: checked 2026-10-14 on
// Sheoldred, the Apocalypse NM, $98.63 against a 30-day average of $100.55).

import { formatMoney } from './money.js';

/** How big a move counts: 20% in a week, or 25% in a month, and $1 either way. */
export const TREND = { week: 20, month: 25, dollars: 1 };

/**
 * A JustTCG price's sharp rise or fall, or null: the week's move when it
 * counts (the more recent), else the month's.
 * @param {{ price?: number|null, priceChange7d?: number|null, priceChange30d?: number|null }|null} variant
 * @returns {{ dir: 'up'|'down', pct: number, days: 7|30, from: number, to: number }|null}
 */
export function priceTrend(variant) {
  const to = variant?.price;
  if (typeof to !== 'number' || !(to > 0)) return null;
  const move = (pct, days, limit) => {
    if (typeof pct !== 'number' || !Number.isFinite(pct) || Math.abs(pct) < limit) return null;
    const from = to / (1 + pct / 100);
    if (!Number.isFinite(from) || from <= 0 || Math.abs(to - from) < TREND.dollars) return null;
    return { dir: pct > 0 ? 'up' : 'down', pct, days, from, to };
  };
  return move(variant.priceChange7d, 7, TREND.week) ?? move(variant.priceChange30d, 30, TREND.month);
}

/** 📈 or 📉 for a trend. */
export const trendIcon = (t) => (t?.dir === 'up' ? '📈' : '📉');

/** "Up 32% in 30 days on JustTCG ($75.10 → $98.63)". */
export function trendText(t) {
  const way = t.dir === 'up' ? 'Up' : 'Down';
  return `${way} ${Math.round(Math.abs(t.pct))}% in ${t.days} days on JustTCG (${formatMoney(t.from)} → ${formatMoney(t.to)})`;
}

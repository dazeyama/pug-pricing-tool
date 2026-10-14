import { formatMoney } from '../../lib/money.js';
import { trendIcon } from '../../lib/priceTrend.js';

/**
 * How the selected price moved lately (lib/priceTrend.js): a box like the
 * price warnings' (PriceWarnings.jsx), green for a rise and red for a fall,
 * floated over Finish & Details by the price panel while its 📈 / 📉 is
 * hovered or clicked (owner, 2026-10-14: not the browser's own tooltip).
 * @param {{ trend: { dir: 'up'|'down', pct: number, days: number, from: number, to: number } }} props
 */
export default function PriceTrendBox({ trend }) {
  const up = trend.dir === 'up';
  return (
    <section className={`price-trend-box ${trend.dir}`} aria-label="Price movement">
      <div className="price-trend-head">{trendIcon(trend)} Price {up ? 'rising' : 'falling'}</div>
      <ul>
        <li>{up ? 'Up' : 'Down'} {Math.round(Math.abs(trend.pct))}% in the last {trend.days} days on JustTCG</li>
        <li>{formatMoney(trend.from)} → {formatMoney(trend.to)}</li>
      </ul>
    </section>
  );
}

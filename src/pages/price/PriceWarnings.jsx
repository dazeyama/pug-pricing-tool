/**
 * Why JustTCG's price for this printing may be wrong (spec 8.7): an amber box
 * under the price panel, one short line per reason (lib/prices
 * priceWarnings). Nothing when there's no reason to doubt it.
 * @param {{ warnings: string[] }} props
 */
export default function PriceWarnings({ warnings }) {
  if (!warnings.length) return null;
  return (
    <section className="price-warnings" aria-label="Price warnings">
      <div className="price-warnings-head">⚠️ Price may be wrong</div>
      <ul>
        {warnings.map((w) => <li key={w}>{w}</li>)}
      </ul>
    </section>
  );
}

/**
 * Why JustTCG's price for this printing may be wrong (spec 8.7): an amber box
 * with one short line per reason (lib/prices priceWarnings). The price panel
 * floats it over Finish & Details while its warning line is hovered or clicked.
 * @param {{ warnings: string[] }} props
 */
export default function PriceWarnings({ warnings }) {
  return (
    <section className="price-warnings" aria-label="Price warnings">
      <div className="price-warnings-head">⚠️ Price may be wrong</div>
      <ul>
        {warnings.map((w) => <li key={w}>{w}</li>)}
      </ul>
    </section>
  );
}

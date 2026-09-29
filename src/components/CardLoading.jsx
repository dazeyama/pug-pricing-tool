/** Fills a card-shaped box while its image is on the way: shimmer, spinner, "Loading…". */
export default function CardLoading() {
  return (
    <span className="card-loading" role="status" aria-label="Loading card image">
      <span className="spinner" aria-hidden="true" />
      <span>Loading…</span>
    </span>
  );
}

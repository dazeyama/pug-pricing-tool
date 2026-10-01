/**
 * The blue EXPORT button (docs/EXPORT_FUNCTION.md 8): on the day pages and a
 * collection's screen; the page's `onClick` runs its export. `blocked`: why
 * it can't run now (today on a day page, Pokémon); it looks disabled, and
 * `onClick` says why.
 */
export default function ExportButton({ className = '', onClick, blocked = null }) {
  return (
    <button
      type="button"
      className={`btn export-btn ${className}${blocked ? ' is-disabled' : ''}`}
      aria-disabled={blocked ? true : undefined}
      title={blocked ?? undefined}
      onClick={onClick}
    >
      EXPORT
    </button>
  );
}

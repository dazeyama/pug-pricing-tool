/**
 * The blue EXPORT button (docs/EXPORT_FUNCTION.md 8): on the day pages and a
 * collection's screen; the page's `onClick` runs its export. `blocked`: why
 * it can't run now (today on a day page, Pokémon); it looks disabled, and
 * `onClick` says why. `count` (with `countTitle`), when given, follows the
 * word: "EXPORT (42)". `label`: COMPLETE on Pokémon days (owner, 2026-10-02).
 */
export default function ExportButton({
  className = '', onClick, blocked = null, count = null, countTitle, label = 'EXPORT',
}) {
  return (
    <button
      type="button"
      className={`btn export-btn ${className}${blocked ? ' is-disabled' : ''}`}
      aria-disabled={blocked ? true : undefined}
      title={blocked ?? (count != null ? countTitle : undefined)}
      onClick={onClick}
    >
      {label}{count != null && ` (${count})`}
    </button>
  );
}

/**
 * A Poké Ball or Master Ball, drawn inline. Marks Poké Ball / Master Ball
 * pattern reverse holos on the selected card.
 * @param {{ kind: 'pokeball'|'masterball', className?: string, title?: string }} props
 */
export default function BallIcon({ kind, className = '', title }) {
  const master = kind === 'masterball';
  return (
    <svg className={className} viewBox="0 0 100 100" role="img" aria-label={title}>
      {title && <title>{title}</title>}
      <circle cx="50" cy="50" r="46" fill="#fff" />
      <path d="M4 50a46 46 0 0 1 92 0z" fill={master ? '#6a3fa0' : '#e3350d'} />
      {master && (
        <>
          <circle cx="27" cy="30" r="8.5" fill="#e5559a" />
          <circle cx="73" cy="30" r="8.5" fill="#e5559a" />
          <path d="M37 40V22l13 11 13-11v18h-6V33l-7 6-7-6v7z" fill="#fff" />
        </>
      )}
      <rect x="4" y="46" width="92" height="8" fill="#161616" />
      <circle cx="50" cy="50" r="46" fill="none" stroke="#161616" strokeWidth="6" />
      <circle cx="50" cy="50" r="14" fill="#fff" stroke="#161616" strokeWidth="6" />
      <circle cx="50" cy="50" r="6" fill="#fff" stroke="#161616" strokeWidth="2" />
    </svg>
  );
}

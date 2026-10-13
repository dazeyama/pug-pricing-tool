import { stampDrawing } from '../lib/firstEditionStamp.js';

const DRAWING = stampDrawing();
const INK = '#141414';

/**
 * The 1st Edition stamp, drawn (lib/firstEditionStamp.js, stampDrawing): put
 * on a vintage card's picture when 1st Edition is picked and the scan has no
 * stamp of its own (owner, 2026-10-12).
 */
export default function FirstEditionStamp({ className = '', style, title = '1st Edition' }) {
  return (
    <svg className={className} style={style} viewBox={DRAWING.viewBox} role="img" aria-label={title}>
      <title>{title}</title>
      <circle cx={DRAWING.disc.cx} cy={DRAWING.disc.cy} r={DRAWING.disc.r} fill={INK} />
      <text
        x={DRAWING.one.x}
        y={DRAWING.one.y}
        fontSize={DRAWING.one.size}
        fill="#fff"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="700"
      >
        1
      </text>
      {DRAWING.letters.map((l, i) => (
        <text
          // The same letter twice (EDITION's I): the place tells them apart.
          key={i}
          transform={l.transform}
          fontSize={DRAWING.letterSize}
          fill={INK}
          textAnchor="middle"
          fontFamily="'Arial Black', Arial, sans-serif"
          fontWeight="900"
        >
          {l.ch}
        </text>
      ))}
    </svg>
  );
}

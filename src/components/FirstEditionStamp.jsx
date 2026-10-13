import { useId } from 'react';
import { stampDrawing } from '../lib/firstEditionStamp.js';

const DRAWING = stampDrawing();
const INK = '#141414';

/**
 * The 1st Edition stamp, drawn (lib/firstEditionStamp.js, stampDrawing): put
 * on a vintage card's picture when 1st Edition is picked and the scan has no
 * stamp of its own (owner, 2026-10-12). The "1" is cut out of the disc with
 * a mask, so the card shows through it.
 */
export default function FirstEditionStamp({ className = '', style, title = '1st Edition' }) {
  const mask = `first-edition-${useId().replace(/[^\w-]/g, '')}`;
  return (
    <svg className={className} style={style} viewBox={DRAWING.viewBox} role="img" aria-label={title}>
      <title>{title}</title>
      <defs>
        <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="135" height="100">
          <rect x="0" y="0" width="135" height="100" fill="#fff" />
          <text
            x={DRAWING.one.x}
            y={DRAWING.one.y}
            fontSize={DRAWING.one.size}
            fill="#000"
            textAnchor="middle"
            fontFamily="'Times New Roman', Times, serif"
            fontWeight="700"
          >
            1
          </text>
        </mask>
      </defs>
      <circle cx={DRAWING.disc.cx} cy={DRAWING.disc.cy} r={DRAWING.disc.r} fill={INK} mask={`url(#${mask})`} />
      {DRAWING.letters.map((l, i) => (
        <text
          // The same letter twice (EDITION's I): the place tells them apart.
          key={i}
          transform={l.transform}
          fontSize={DRAWING.letterSize}
          fill={INK}
          stroke={INK}
          strokeWidth={DRAWING.letterStroke}
          strokeLinejoin="round"
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

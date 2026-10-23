import { useId } from 'react';

/**
 * A rubber-stamp mark (owner, 2026-10-23; decisions 459, 460): "APPLIED" in green or "NOT APPLIED" in red,
 * under the owned-copies chips, drawn to look inked: a double border with roughened edges and speckled ink
 * (SVG noise filters), tilted. The lettering is solid ink with only a slightly rough edge, so it reads
 * easily ("The text on the stamps still isn't readable enough"). Drawn here, not an image, so it's sharp at
 * any size; its colour is `currentColor` (a true red or green, owned.css).
 * @param {{ applied: boolean, className?: string }} props  className: 'landing' or 'leaving' while it switches
 */
export default function InkStamp({ applied, className = '' }) {
  const id = useId().replace(/:/g, '');
  const text = applied ? 'APPLIED' : 'NOT APPLIED';
  return (
    <svg
      className={`ink-stamp ${applied ? 'applied' : 'not-applied'}${className ? ` ${className}` : ''}`}
      viewBox="0 0 170 40"
      role="img"
      aria-label={applied ? 'The rate is applied' : 'The rate is not applied'}
    >
      <defs>
        {/* The border: ragged edges (a coarse noise pushing it about a pixel) and speckles (a fine noise
            turned into a mask with a few small holes where the ink didn't take). */}
        <filter id={`ink-${id}`} x="-5%" y="-10%" width="110%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.12" numOctaves="2" seed="7" result="warp" />
          <feDisplacementMap in="SourceGraphic" in2="warp" scale="1.6" xChannelSelector="R" yChannelSelector="G" result="ragged" />
          <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="1" seed="3" result="grain" />
          <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -3 2.6" result="holes" />
          <feComposite in="ragged" in2="holes" operator="in" />
        </filter>
        {/* The lettering: only a slightly rough edge, no holes. */}
        <filter id={`edge-${id}`} x="-5%" y="-10%" width="110%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.2" numOctaves="1" seed="11" result="warp" />
          <feDisplacementMap in="SourceGraphic" in2="warp" scale="0.9" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <g filter={`url(#ink-${id})`} fill="none" stroke="currentColor">
        <rect x="2.5" y="2.5" width="165" height="35" rx="4" strokeWidth="3" />
        <rect x="7" y="7" width="156" height="26" rx="2" strokeWidth="1.2" />
      </g>
      <text
        filter={`url(#edge-${id})`}
        x="85"
        y={applied ? 27.4 : 26.6}
        textAnchor="middle"
        fill="currentColor"
        fontFamily="'Arial Black', 'Segoe UI Black', Impact, sans-serif"
        fontWeight="900"
        fontSize={applied ? 20 : 16.5}
        letterSpacing={applied ? 2.5 : 0.8}
      >
        {text}
      </text>
    </svg>
  );
}

import { useId } from 'react';

/**
 * A rubber-stamp mark (owner, 2026-10-23; decision 459): "APPLIED" in green or "NOT APPLIED" in red, under
 * the owned-copies chips, drawn to look inked: a double border, its edges roughened (feTurbulence moving
 * them a little) and its ink speckled (a second, finer turbulence eating small holes), tilted. Drawn here,
 * not an image, so it's sharp at any size and takes the app's red and green (`currentColor`).
 * @param {{ applied: boolean }} props
 */
export default function InkStamp({ applied }) {
  const id = useId().replace(/:/g, '');
  const text = applied ? 'APPLIED' : 'NOT APPLIED';
  return (
    <svg
      className={`ink-stamp ${applied ? 'applied' : 'not-applied'}`}
      viewBox="0 0 170 40"
      role="img"
      aria-label={applied ? 'The rate is applied' : 'The rate is not applied'}
    >
      <defs>
        <filter id={`ink-${id}`} x="-5%" y="-10%" width="110%" height="120%">
          {/* Ragged edges: the shapes pushed about a pixel by a coarse noise. */}
          <feTurbulence type="fractalNoise" baseFrequency="0.12" numOctaves="2" seed="7" result="warp" />
          <feDisplacementMap in="SourceGraphic" in2="warp" scale="1.6" xChannelSelector="R" yChannelSelector="G" result="ragged" />
          {/* Speckles: a fine noise turned into a mask with a few small holes where the ink didn't take. */}
          <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="1" seed="3" result="grain" />
          <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -3 2.6" result="holes" />
          <feComposite in="ragged" in2="holes" operator="in" />
        </filter>
      </defs>
      <g filter={`url(#ink-${id})`} fill="none" stroke="currentColor">
        <rect x="3" y="3" width="164" height="34" rx="4" strokeWidth="3" />
        <rect x="7.5" y="7.5" width="155" height="25" rx="2" strokeWidth="1.2" />
        <text
          x="85"
          y={applied ? 26.5 : 25.8}
          textAnchor="middle"
          fill="currentColor"
          fontFamily="Impact, 'Arial Black', 'Segoe UI', sans-serif"
          fontWeight="900"
          fontSize={applied ? 19 : 16}
          letterSpacing={applied ? 3 : 1.6}
          stroke="currentColor"
          strokeWidth="0.6"
        >
          {text}
        </text>
      </g>
    </svg>
  );
}

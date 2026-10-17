import { useEffect, useState } from 'react';

/** A number as the test shows it. */
const num = (v, places = 2) => (typeof v === 'number' ? v.toFixed(places).replace(/\.?0+$/, '') : '—');
/** A capability's range: "0.1–1 (step 0.01)", or its list of choices. */
function range(c) {
  if (c == null) return null;
  if (Array.isArray(c)) return c.length ? c.join(', ') : null;
  if (typeof c === 'object' && 'min' in c) return `${num(c.min)}–${num(c.max)}${c.step ? ` (step ${num(c.step, 3)})` : ''}`;
  return String(c);
}

/**
 * The focus test (owner, 2026-10-16: "the focus test for 5"): what this
 * phone's camera says about itself, whether a page may fix its focus at a
 * distance (and, if it may, a slider to try it), and how sharp the
 * collector strip is right now, against where the scanner calls it blurry.
 * Lies over the bottom of the picture so the card stays in view; auto scan
 * waits while it's open.
 * @param {{ focusInfo: () => object|null, setFocus: (d: number|null) => Promise<string|null>,
 *   measure: () => number|null, blurBelow: number, onClose: () => void }} props
 *   measure: the strip's sharpness now (straighten.js), null till the view is locked
 */
export default function FocusTest({ focusInfo, setFocus, measure, blurBelow, onClose }) {
  const [info, setInfo] = useState(() => focusInfo());
  const [sharp, setSharp] = useState(null);
  const [distance, setDistance] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    const tick = () => {
      setInfo(focusInfo());
      setSharp(measure());
    };
    tick();
    const timer = setInterval(tick, 400);
    return () => clearInterval(timer);
  }, [focusInfo, measure]);

  const caps = info?.capabilities ?? {};
  const settings = info?.settings ?? {};
  const fixable = caps.focusDistance && typeof caps.focusDistance === 'object' && 'min' in caps.focusDistance;
  const blurry = sharp != null && sharp > 0 && sharp < blurBelow;

  async function focusAt(value) {
    setDistance(value);
    setError(await setFocus(value));
  }

  return (
    <div className="scan-focus-test" role="dialog" aria-label="Focus test">
      <div className="scan-focus-head">
        <strong>Focus test</strong>
        <button type="button" className="btn small" onClick={onClose}>Close</button>
      </div>
      {!info ? <p>Start the camera first.</p> : (
        <dl className="scan-focus-facts">
          <dt>Sharpness</dt>
          <dd className={blurry ? 'warn' : sharp ? 'good' : ''}>
            {sharp == null ? 'lock the view on a card first' : sharp === 0 ? 'no card in the strip' : `${num(sharp)} ${blurry ? '(blurry)' : '(sharp)'}`}
            <span> · blurry below {num(blurBelow)}</span>
          </dd>
          <dt>Lens</dt>
          <dd>{info.label || '—'}</dd>
          <dt>Picture</dt>
          <dd>{settings.width && settings.height ? `${settings.width} × ${settings.height}` : '—'}</dd>
          <dt>Focus modes</dt>
          <dd>{range(caps.focusMode) ?? 'not offered'}{settings.focusMode ? ` · now ${settings.focusMode}` : ''}</dd>
          <dt>Focus distance</dt>
          <dd>
            {fixable ? range(caps.focusDistance) : 'not offered: this phone doesn\'t let a page fix the focus'}
            {settings.focusDistance != null ? ` · now ${num(settings.focusDistance, 3)}` : ''}
          </dd>
          <dt>Zoom</dt>
          <dd>{range(caps.zoom) ?? 'not offered'}</dd>
        </dl>
      )}
      {fixable && (
        <div className="scan-focus-set">
          <input
            type="range"
            min={caps.focusDistance.min}
            max={caps.focusDistance.max}
            step={caps.focusDistance.step || (caps.focusDistance.max - caps.focusDistance.min) / 100}
            value={distance ?? settings.focusDistance ?? caps.focusDistance.min}
            onChange={(e) => focusAt(Number(e.target.value))}
            aria-label="Focus distance"
          />
          <button type="button" className="btn small" onClick={() => focusAt(null)}>Auto</button>
        </div>
      )}
      {error && <p className="scan-sheet-error">{error}</p>}
      {info && (
        <details>
          <summary>Everything the camera reports</summary>
          <pre>{JSON.stringify({ capabilities: caps, settings }, null, 1)}</pre>
        </details>
      )}
    </div>
  );
}

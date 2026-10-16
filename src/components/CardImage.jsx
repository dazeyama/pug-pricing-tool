import { useState } from 'react';
import CardLoading from './CardLoading.jsx';

/** .card-wrap's aspect-ratio (price/card.css): a picture of another shape sits inside it, centred. */
const WRAP_ASPECT = 488 / 680;

/**
 * Where a picture of `aspect` (width / height) shows inside the card box,
 * object-fit: contain: full width with a strip above and below when it's
 * wider than the box (TCGdex's scans), full height otherwise.
 */
function pictureBox(aspect) {
  if (aspect >= WRAP_ASPECT) {
    const height = (WRAP_ASPECT / aspect) * 100;
    return { left: 0, width: '100%', top: `${(100 - height) / 2}%`, height: `${height}%` };
  }
  const width = (aspect / WRAP_ASPECT) * 100;
  return { top: 0, height: '100%', left: `${(100 - width) / 2}%`, width: `${width}%` };
}

/**
 * A card image with real-card corners and shadow (Audit Tool .card-wrap), in
 * two stages: the small image, blurred, until the large one has loaded, with
 * "Loading…" until at least the small one has arrived. `loading` shows only
 * that, while the caller is still finding an image (Pokémon backups). With
 * no image at all, or none that loads, the game's card back (`back`,
 * Pokémon) or a plain panel with the name and number. Remount with a `key`
 * per image so each card starts fresh. Never crop or cover a card image
 * (Scryfall's image rules); the overlays are `shine` ('foil', 'pokemon-full',
 * or 'holo' / 'reverse' with a frame era like 'era-2007'), a see-through foil
 * sheen (price/card.css .card-shine), and for a vintage Pokémon card `overlay`,
 * laid on the large picture once it's loaded, under the sheen, in a box the
 * picture's own shape (the 1st Edition stamp, painted out or drawn on).
 */
export default function CardImage({
  thumb, image, alt, name, number, back, loading = false, shine = null, overlay = null, className = '',
}) {
  // 'loading' → 'loaded', or 'large-failed' (show the small one, sharp).
  const [stage, setStage] = useState(image ? 'loading' : 'large-failed');
  const [aspect, setAspect] = useState(null);   // the large picture's width / height, once loaded
  const [thumbFailed, setThumbFailed] = useState(false);
  const [thumbLoaded, setThumbLoaded] = useState(false);
  const hasThumb = thumb && !thumbFailed;

  if (loading) {
    return (
      <div className={`card-wrap ${className}`}>
        <CardLoading />
      </div>
    );
  }

  if (!hasThumb && (!image || stage === 'large-failed')) {
    if (back) {
      return (
        <div className={`card-wrap ${className}`}>
          <img className="card-img" src={back} alt={`${alt} (no picture)`} />
        </div>
      );
    }
    return (
      <div className={`card-wrap card-back ${className}`} role="img" aria-label={alt}>
        <span className="card-back-name">{name}</span>
        {number && <span className="card-back-number">#{number}</span>}
      </div>
    );
  }

  const waiting = stage !== 'loaded' && !(hasThumb && thumbLoaded);
  return (
    <div className={`card-wrap ${className}`}>
      {waiting && <CardLoading />}
      {stage !== 'loaded' && hasThumb && (
        <img
          className={`card-img${stage === 'loading' ? ' card-thumb' : ''}`}
          src={thumb}
          alt={stage === 'loading' ? '' : alt}
          onLoad={() => setThumbLoaded(true)}
          onError={() => setThumbFailed(true)}
        />
      )}
      {image && stage !== 'large-failed' && (
        <img
          className={`card-img${stage === 'loaded' ? '' : ' pending'}`}
          src={image}
          alt={alt}
          onLoad={(e) => {
            setAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight || null);
            setStage('loaded');
          }}
          onError={() => setStage('large-failed')}
        />
      )}
      {overlay && stage === 'loaded' && aspect && (
        <div className="card-overlay" style={pictureBox(aspect)} aria-hidden="true">{overlay}</div>
      )}
      {shine && !waiting && <span className={`card-shine ${shine}`} aria-hidden="true" />}
    </div>
  );
}

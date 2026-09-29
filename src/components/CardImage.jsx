import { useState } from 'react';
import CardLoading from './CardLoading.jsx';

/**
 * A card image with real-card corners and shadow (Audit Tool .card-wrap), in
 * two stages: the small image, blurred, until the large one has loaded, with
 * "Loading…" until at least the small one has arrived. `loading` shows only
 * that, while the caller is still finding an image (Pokémon backups). With
 * no image at all, or none that loads, the game's card back (`back`,
 * Pokémon) or a plain panel with the name and number. Remount with a `key`
 * per image so each card starts fresh. Never crop or cover a card image
 * (Scryfall's image rules); the only overlay is `shine` ('foil', 'holo' or
 * 'reverse', plus 'vintage'), a see-through foil sheen (price.css .card-shine).
 */
export default function CardImage({ thumb, image, alt, name, number, back, loading = false, shine = null, className = '' }) {
  // 'loading' → 'loaded', or 'large-failed' (show the small one, sharp).
  const [stage, setStage] = useState(image ? 'loading' : 'large-failed');
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
          onLoad={() => setStage('loaded')}
          onError={() => setStage('large-failed')}
        />
      )}
      {shine && !waiting && <span className={`card-shine ${shine}`} aria-hidden="true" />}
    </div>
  );
}

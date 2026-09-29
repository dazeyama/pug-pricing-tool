import { useState } from 'react';

/**
 * A card image with real-card corners and shadow (Audit Tool .card-wrap), in
 * two stages: the small image, blurred, until the large one has loaded. With
 * no image at all (older Japanese cards), a plain card back with the name
 * and number. Remount with a `key` per image so each card starts fresh.
 * Never crop or overlay a card image (Scryfall's image rules).
 */
export default function CardImage({ thumb, image, alt, name, number, className = '' }) {
  // 'loading' → 'loaded', or 'large-failed' (show the small one, sharp).
  const [stage, setStage] = useState(image ? 'loading' : 'large-failed');

  if (!thumb && (!image || stage === 'large-failed')) {
    return (
      <div className={`card-wrap card-back ${className}`} role="img" aria-label={alt}>
        <span className="card-back-name">{name}</span>
        {number && <span className="card-back-number">#{number}</span>}
      </div>
    );
  }

  return (
    <div className={`card-wrap ${className}`}>
      {stage !== 'loaded' && thumb && (
        <img className={`card-img${stage === 'loading' ? ' card-thumb' : ''}`} src={thumb} alt={stage === 'loading' ? '' : alt} />
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
    </div>
  );
}

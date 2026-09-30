import { useEffect, useState } from 'react';
import { fallbackImages } from '../../lib/pokemonImages.js';

/**
 * A candidate's images: its own, or for a Pokémon card TCGdex has no picture
 * of, a backup once found: pokemontcg.io or TCGplayer (English), Limitless
 * TCG (Japanese).
 *
 * status: 'ready' (there are image URLs), 'loading' (still looking for a
 * backup) or 'none' (every source tried; show the card back).
 * @returns {{ thumb: string|null, image: string|null, status: 'ready'|'loading'|'none' }}
 */
export function useCardImages(c) {
  const [backup, setBackup] = useState({ key: null, images: null });
  const needsBackup = Boolean(c && c.game === 'pokemon' && !c.thumb && !c.image);

  useEffect(() => {
    if (!needsBackup) return undefined;
    let alive = true;
    fallbackImages(c)
      .then((images) => alive && setBackup({ key: c.key, images }))
      .catch(() => alive && setBackup({ key: c.key, images: null }));
    return () => {
      alive = false;
    };
    // Keyed by the card, not the object: results re-rank into new objects.
  }, [c?.key, needsBackup]);

  if (!c) return { thumb: null, image: null, status: 'none' };
  if (!needsBackup) {
    return { thumb: c.thumb, image: c.image, status: c.thumb || c.image ? 'ready' : 'none' };
  }
  if (backup.key !== c.key) return { thumb: null, image: null, status: 'loading' };
  return backup.images
    ? { thumb: backup.images.thumb, image: backup.images.image, status: 'ready' }
    : { thumb: null, image: null, status: 'none' };
}

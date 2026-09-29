import { useEffect, useState } from 'react';
import { fallbackImages } from '../../lib/pokemonImages.js';

/**
 * A candidate's images: its own, or for a Pokémon card TCGdex has no picture
 * of, a backup from pokemontcg.io or TCGplayer once found.
 * @returns {{ thumb: string|null, image: string|null }}
 */
export function useCardImages(c) {
  const [backup, setBackup] = useState({ key: null, images: null });
  const needsBackup = Boolean(c && c.game === 'pokemon' && !c.thumb && !c.image);

  useEffect(() => {
    if (!needsBackup) return undefined;
    let alive = true;
    fallbackImages(c).then((images) => {
      if (alive) setBackup({ key: c.key, images });
    }).catch(() => {});
    return () => {
      alive = false;
    };
    // Keyed by the card, not the object: results re-rank into new objects.
  }, [c?.key, needsBackup]);

  if (!c) return { thumb: null, image: null };
  if (!needsBackup) return { thumb: c.thumb, image: c.image };
  const found = backup.key === c.key ? backup.images : null;
  return { thumb: found?.thumb ?? null, image: found?.image ?? null };
}

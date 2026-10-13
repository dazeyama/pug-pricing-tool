import { useEffect, useState } from 'react';
import { stampPatch } from '../../lib/firstEditionStamp.js';

/**
 * Whether the selected card's picture has the 1st Edition stamp, and the
 * piece that paints it out (lib/firstEditionStamp.js, stampPatch), for a
 * card that gets the stamp treatment (`layout` set). Null until it's known,
 * and when the picture can't be read: then the card shows as it is.
 */
export function useFirstEditionStamp(image, layout) {
  const key = image && layout ? `${image}|${layout}` : null;
  const [found, setFound] = useState({ key: null, result: null });

  useEffect(() => {
    if (!key) return undefined;
    let alive = true;
    stampPatch(image, layout).then((result) => alive && setFound({ key, result }));
    return () => {
      alive = false;
    };
  }, [key]);

  return found.key === key ? found.result : null;
}

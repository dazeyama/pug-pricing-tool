import { useEffect, useState } from 'react';
import { stampPatch } from '../../lib/firstEditionStamp.js';

/**
 * Whether the selected card's picture has the 1st Edition stamp, and the
 * piece that paints it out (lib/firstEditionStamp.js, stampPatch), for a
 * card that gets the stamp treatment (`layout` set). Null until it's known,
 * and when the picture can't be read: then the card shows as it is.
 */
export function useFirstEditionStamp(image, layout, shift = 0) {
  const key = image && layout ? `${image}|${layout}|${shift}` : null;
  const [found, setFound] = useState({ key: null, result: null });

  useEffect(() => {
    if (!key) return undefined;
    let alive = true;
    stampPatch(image, layout, shift).then((result) => alive && setFound({ key, result }));
    return () => {
      alive = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- key stands for image, layout and shift
  }, [key]);

  return found.key === key ? found.result : null;
}

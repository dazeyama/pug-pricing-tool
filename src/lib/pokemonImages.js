// Backup images for Pokémon cards TCGdex has no picture of. On 2026-09-29
// that was 7% of English cards (whole sets such as Shining Fates' Shiny Vault,
// Dragon Majesty, trainer kits) and 70% of Japanese cards.
//
// English, in order:
//   1. pokemontcg.io's image CDN (images.pokemontcg.io/<set>/<number>.png),
//      with its set IDs matched to TCGdex's by ID or name. A missing card
//      there still answers with a card-back picture (status 404), so each
//      address is checked with a HEAD request first (the CDN allows CORS).
//   2. TCGplayer's product image, by the TCGplayer ID that TCGdex's full card
//      carries (variants_detailed → thirdParty.tcgplayer).
// Japanese: none yet. TCGdex has no TCGplayer IDs for Japanese cards; JustTCG
// (Phase 5) returns one per card, which can point at TCGplayer's image then.
import { createTransport } from './transport.js';
import { DAY, memoryCache, storedOrDownload } from './cache.js';
import * as dex from './tcgdex.js';

const PTCG_API = 'https://api.pokemontcg.io/v2';
const PTCG_IMAGES = 'https://images.pokemontcg.io';
const TCGPLAYER_IMAGES = 'https://tcgplayer-cdn.tcgplayer.com/product';
// pokemontcg.io's API often answers 500/502 and then works on a retry.
const ptcg = createTransport({ spacingMs: 200, tries: 6 });

const setKey = (name) => String(name ?? '').toLowerCase()
  .replace(/&/g, 'and').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

let setsPromise = null;
/** pokemontcg.io's sets, by ID and by folded name. localStorage, 7 days. */
function loadPtcgSets() {
  setsPromise ??= storedOrDownload('pug.ptcg.sets', 7 * DAY, async () => {
    const data = await ptcg.getJson(`${PTCG_API}/sets?pageSize=250&select=id,name`, { priority: 'low' });
    if (!data?.data) throw new Error('pokemontcg.io sets unavailable');
    return data.data.map((s) => ({ id: s.id, name: s.name }));
  }).then((list) => ({
    ids: new Set(list.map((s) => s.id)),
    byName: new Map(list.map((s) => [setKey(s.name), s.id])),
  })).catch((e) => {
    setsPromise = null;
    throw e;
  });
  return setsPromise;
}

const exists = memoryCache(DAY);
/** True if the address serves a real image (not a 404 card back). */
function imageExists(url) {
  return exists.get(url, async () => {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      return res.ok;
    } catch {
      return false;
    }
  });
}

/**
 * pokemontcg.io drops leading zeros from plain numbers only: TCGdex "006" →
 * "6", but "SV001", "TG05" and "GG01" stay as they are (checked 2026-09-29).
 */
function ptcgNumber(localId) {
  const n = String(localId).trim();
  return /^\d+$/.test(n) ? String(Number(n)) : n;
}

/** The TCGplayer product ID on TCGdex's full card (standard size first). */
function tcgplayerId(card) {
  const variants = card?.variants_detailed ?? [];
  const standard = variants.filter((v) => (v.size ?? 'standard') === 'standard');
  for (const v of [...standard, ...variants]) {
    const id = v.thirdParty?.tcgplayer;
    if (id) return id;
  }
  const pricing = card?.pricing?.tcgplayer ?? {};
  for (const v of Object.values(pricing)) if (v && typeof v === 'object' && v.productId) return v.productId;
  return null;
}

const resolved = memoryCache(DAY);
/**
 * Backup images for a Pokémon candidate with none from TCGdex.
 * @param {{ key: string, lang: 'en'|'ja', setId: string, setName: string,
 *   number: string, tcgdexId: string }} c
 * @returns {Promise<{ thumb: string, image: string, source: string } | null>}
 */
export function fallbackImages(c) {
  return resolved.get(c.key, async () => {
    if (c.lang !== 'en') return null;

    try {
      const sets = await loadPtcgSets();
      const setId = sets.ids.has(c.setId) ? c.setId : sets.byName.get(setKey(c.setName));
      if (setId) {
        const base = `${PTCG_IMAGES}/${setId}/${ptcgNumber(c.number)}`;
        if (await imageExists(`${base}.png`)) {
          return { thumb: `${base}.png`, image: `${base}_hires.png`, source: 'pokemontcg.io' };
        }
      }
    } catch {
      // pokemontcg.io is down: try TCGplayer.
    }

    try {
      const id = tcgplayerId(await dex.fetchCard(c.lang, c.tcgdexId));
      if (id) {
        return { thumb: `${TCGPLAYER_IMAGES}/${id}_200w.jpg`, image: `${TCGPLAYER_IMAGES}/${id}_in_1000x1000.jpg`, source: 'TCGplayer' };
      }
    } catch {
      // No full card: the card back it is.
    }
    return null;
  });
}

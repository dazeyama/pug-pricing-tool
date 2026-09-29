// Backup images for Pokémon cards TCGdex has no picture of. On 2026-09-29
// that was 7% of English cards (whole sets such as Shining Fates' Shiny Vault,
// Dragon Majesty, trainer kits) and 70% of Japanese cards.
//
// English, in order:
//   1. pokemontcg.io's image CDN (images.pokemontcg.io/<set>/<number>.png),
//      with its set IDs matched to TCGdex's by ID, name or SET_ALIASES. A
//      missing card there still answers with a card-back picture (status
//      404), so each address is checked with a HEAD request first (the CDN
//      allows CORS). Sets numbered differently (the Classic Collections) are
//      then searched by card name through its API.
//   2. TCGplayer's product image, by the TCGplayer ID that TCGdex's full card
//      carries (variants_detailed → thirdParty.tcgplayer), loaded first to
//      reject its 403s and its landscape "Image Coming Soon" banner.
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

// TCGdex set → pokemontcg.io set, where neither the ID nor the name matches.
const SET_ALIASES = {
  '30th-c': 'me55c',        // "30th Classic Collection" / "30th Celebration: Classic Collection"
};

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

const looksLikeCard = memoryCache(DAY);
/**
 * Load an image to check it's a card: TCGplayer refuses products it has no
 * picture of (403), or answers with a landscape "Image Coming Soon" banner.
 * A card is always taller than wide. (Its CDN doesn't allow CORS, so the
 * image itself is loaded, not a HEAD request.)
 */
function isCardImage(url) {
  return looksLikeCard.get(url, () => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalHeight > img.naturalWidth);
    img.onerror = () => resolve(false);
    img.src = url;
  }));
}

const setCards = memoryCache(DAY);
/** Every card in a pokemontcg.io set (number, name, images), up to 500. */
function ptcgSetCards(setId) {
  return setCards.get(setId, async () => {
    const cards = [];
    for (let page = 1; page <= 2; page++) {
      const data = await ptcg.getJson(`${PTCG_API}/cards?q=${encodeURIComponent(`set.id:${setId}`)}`
        + `&select=number,name,images&pageSize=250&page=${page}`);
      cards.push(...(data?.data ?? []));
      if (!data || cards.length >= (data.totalCount ?? 0)) break;
    }
    return cards;
  });
}

/**
 * A card in a pokemontcg.io set by name, for sets it numbers differently
 * from TCGdex (the Classic Collections keep their original numbers: Pikachu
 * is #014 in TCGdex, #58 there). Names are compared folded, since the two
 * spell some differently ("Zekrom GX" / "Zekrom-GX"), and only a single
 * match counts. The set's list is fetched once rather than searched: its
 * name search treats those spellings as different.
 */
async function ptcgCardByName(setId, name) {
  const want = setKey(name);
  const cards = (await ptcgSetCards(setId)).filter((card) => setKey(card.name) === want);
  return cards.length === 1 && cards[0].images?.small ? cards[0] : null;
}

/** Shown for a Pokémon card no source has a picture of. */
export const POKEMON_CARD_BACK = `${import.meta.env.BASE_URL}pokemon-card-back.webp`;

/**
 * pokemontcg.io drops leading zeros from plain numbers only: TCGdex "006" →
 * "6", but "SV001", "TG05" and "GG01" stay as they are (checked 2026-09-29).
 */
function ptcgNumber(localId) {
  const n = String(localId).trim();
  return /^\d+$/.test(n) ? String(Number(n)) : n;
}

/** The TCGplayer product ID on TCGdex's full card (standard size first). */
export function tcgplayerId(card) {
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

/** The card's Cardmarket product ID from TCGdex (any version), or null. */
export function cardmarketId(card) {
  const variants = card?.variants_detailed ?? [];
  for (const v of variants) {
    const id = v.thirdParty?.cardmarket ?? v.pricing?.cardmarket?.idProduct;
    if (id) return id;
  }
  return card?.pricing?.cardmarket?.idProduct ?? null;
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
      const setId = SET_ALIASES[c.setId]
        ?? (sets.ids.has(c.setId) ? c.setId : sets.byName.get(setKey(c.setName)));
      if (setId) {
        // By number first: one HEAD request, no API call.
        const base = `${PTCG_IMAGES}/${setId}/${ptcgNumber(c.number)}`;
        if (await imageExists(`${base}.png`)) {
          return { thumb: `${base}.png`, image: `${base}_hires.png`, source: 'pokemontcg.io' };
        }
        // Then by name, for sets numbered differently.
        const card = await ptcgCardByName(setId, c.name);
        if (card) {
          return { thumb: card.images.small, image: card.images.large ?? card.images.small, source: 'pokemontcg.io' };
        }
      }
    } catch {
      // pokemontcg.io is down: try TCGplayer.
    }

    try {
      const id = tcgplayerId(await dex.fetchCard(c.lang, c.tcgdexId));
      const thumb = id && `${TCGPLAYER_IMAGES}/${id}_200w.jpg`;
      if (thumb && await isCardImage(thumb)) {
        return { thumb, image: `${TCGPLAYER_IMAGES}/${id}_in_1000x1000.jpg`, source: 'TCGplayer' };
      }
    } catch {
      // No full card: the card back it is.
    }
    return null;
  });
}

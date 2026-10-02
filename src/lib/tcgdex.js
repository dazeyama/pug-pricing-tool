// TCGdex: Pokémon card data, English and Japanese (spec 5.2). Public and
// keyless; one serialized queue, like Scryfall's.
//
// What the Phase 3 check found (2026-09-29), which shapes this file:
// - The printed set code is `abbreviation.official` on a set's *detail*
//   record only; the set list doesn't carry it. So set details are fetched
//   per set (cached 7 days), with a low-priority background fill of every
//   set so typed codes like "OBF" are recognized.
// - Japanese sets have no abbreviation: their IDs are the printed codes
//   ("SV2a", "SV4K"), shown exactly as printed.
// - Name search also returns Pokémon TCG Pocket (digital-only) cards. Those
//   are dropped.
// - The `localId` filter is loose ("6" matches "036"), so numbers are
//   re-checked exactly here.
// - Images: Japanese cards before Sword & Shield often have none.
import { createTransport } from './transport.js';
import { DAY, memoryCache, readStored, storedOrDownload, writeStored } from './cache.js';
import { normNumber } from './query.js';

const API = 'https://api.tcgdex.net/v2';
const transport = createTransport({ spacingMs: 100 });

/** @typedef {'en'|'ja'} Lang */

/**
 * @typedef {{ id: string, name: string, cardCount: { total: number, official: number } }} SetBrief
 * @typedef {{ id: string, name: string, code: string, official: number, total: number,
 *   releaseDate: string|null, serieId: string|null, at: number }} SetInfo
 * @typedef {{ id: string, localId: string, name: string, image?: string }} CardBrief
 */

// ---------------------------------------------------------------- set lists

const listPromises = {};
const listIndex = { en: null, ja: null };

/**
 * Every set in a language, cached 24h. Also indexes list order, which stands
 * in for release order until a set's details (with its date) have loaded.
 * @param {Lang} lang
 * @returns {Promise<SetBrief[]>}
 */
export function loadSetList(lang) {
  listPromises[lang] ??= storedOrDownload(`pug.tcgdex.sets.${lang}`, DAY, () =>
    transport.getJson(`${API}/${lang}/sets`),
  ).then((list) => {
    listIndex[lang] = new Map(list.map((s, i) => [s.id, { set: s, index: i }]));
    return list;
  }).catch((e) => {
    delete listPromises[lang];
    throw e;
  });
  return listPromises[lang];
}

/** A set from the list, with its position in it. */
export function setBrief(lang, id) {
  return listIndex[lang]?.get(id) ?? null;
}

// ---------------------------------------------------------------- set details

const INFO_MAX_AGE = 7 * DAY;
/** @type {Record<Lang, Record<string, SetInfo>>} */
const infoStore = { en: {}, ja: {} };
const infoLoaded = { en: false, ja: false };
const persistTimers = {};

function infoKey(lang) {
  return `pug.tcgdex.setinfo.${lang}`;
}

function ensureInfoLoaded(lang) {
  if (infoLoaded[lang]) return;
  infoLoaded[lang] = true;
  const stored = readStored(infoKey(lang), Infinity);
  if (stored?.value && typeof stored.value === 'object') infoStore[lang] = stored.value;
}

// Written in batches: the background fill adds a set every few hundred ms.
function persistInfo(lang) {
  clearTimeout(persistTimers[lang]);
  persistTimers[lang] = setTimeout(() => writeStored(infoKey(lang), infoStore[lang]), 1500);
}

/** TCG Pocket (digital-only) sets: series "tcgp", IDs like A1, A2b, B1, P-A. */
function isPocketSetId(id) {
  return /^(?:[AB]\d+[a-z]?|P-[AB])$/.test(id);
}

/** The code printed on the card: the abbreviation, or for sets without one the ID. */
function printedCode(lang, detail) {
  if (lang === 'ja') return detail.id;
  return detail.abbreviation?.official || detail.id.toUpperCase();
}

/**
 * A set's details, if cached and fresh.
 * @returns {SetInfo|null}
 */
export function setInfo(lang, id) {
  ensureInfoLoaded(lang);
  const info = infoStore[lang][id];
  return info && Date.now() - info.at < INFO_MAX_AGE ? info : null;
}

// A set detail response includes the set's whole card list. Only lists a
// search actually asked for are kept (memory, 24h), not the background fill's.
const setCardsCache = memoryCache(DAY);
const inflight = new Map();

/**
 * Fetch a set's details (and card list) now.
 * @param {Lang} lang
 * @param {string} id
 * @param {{ signal?: AbortSignal, priority?: 'high'|'low' }} [options]
 * @returns {Promise<{ info: SetInfo, cards: CardBrief[] }>}
 */
export function fetchSetDetail(lang, id, options = {}) {
  const key = `${lang}:${id}`;
  if (inflight.has(key)) return inflight.get(key);
  const promise = transport.getJson(`${API}/${lang}/sets/${encodeURIComponent(id)}`, options)
    .then((d) => {
      if (!d) throw new Error(`TCGdex has no set ${id}`);
      ensureInfoLoaded(lang);
      const info = {
        id: d.id,
        name: d.name,
        code: printedCode(lang, d),
        official: d.cardCount?.official ?? 0,
        total: d.cardCount?.total ?? 0,
        releaseDate: d.releaseDate ?? null,
        serieId: d.serie?.id ?? null,
        at: Date.now(),
      };
      infoStore[lang][id] = info;
      persistInfo(lang);
      return { info, cards: d.cards ?? [] };
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

/** A set's details: cached if fresh, otherwise fetched at high priority. */
export async function ensureSetInfo(lang, id, signal) {
  return setInfo(lang, id) ?? (await fetchSetDetail(lang, id, { signal })).info;
}

/** A set's card list (memory, 24h). */
function setCards(lang, id, signal) {
  return setCardsCache.get(`${lang}:${id}`, async () => (await fetchSetDetail(lang, id, { signal })).cards);
}

const fillStarted = { en: false, ja: false };
/**
 * Background fill: fetch details for every set not cached yet, at low
 * priority, so printed codes are known before anyone types one. Once per page.
 */
export async function startSetFill(lang) {
  if (fillStarted[lang]) return;
  fillStarted[lang] = true;
  try {
    const list = await loadSetList(lang);
    for (const s of list) {
      if (isPocketSetId(s.id) || setInfo(lang, s.id)) continue;
      fetchSetDetail(lang, s.id, { priority: 'low' }).catch(() => {});
    }
  } catch {
    fillStarted[lang] = false;             // retry on the next search
  }
}

/** Is this a Pokémon set code in this language (as far as is known yet)? */
export function isPokemonSetCode(lang, token) {
  const t = String(token).toLowerCase();
  if (lang === 'ja') return findJaSetId(t) != null;
  ensureInfoLoaded('en');
  return Object.values(infoStore.en).some((i) => i.code.toLowerCase() === t);
}

function findJaSetId(lowerCode) {
  if (!listIndex.ja) return null;
  for (const id of listIndex.ja.keys()) if (id.toLowerCase() === lowerCode) return id;
  return null;
}

/** English sets whose printed code is this one (from cached details). */
function enSetIdsForCode(code) {
  ensureInfoLoaded('en');
  const t = code.toLowerCase();
  return Object.values(infoStore.en).filter((i) => i.code.toLowerCase() === t).map((i) => i.id);
}

// ---------------------------------------------------------------- names

let namesPromise = null;
/**
 * Every English Pokémon card name, for typo correction: derived from the
 * card list (2.4 MB) and kept as unique names in localStorage for 7 days.
 * @returns {Promise<string[]>}
 */
export function loadNames() {
  namesPromise ??= storedOrDownload('pug.tcgdex.names.en', 7 * DAY, async () => {
    const briefs = await transport.getJson(`${API}/en/cards`, { priority: 'low' });
    const names = new Set();
    for (const b of briefs) if (!isPocketBrief(b)) names.add(b.name);
    return [...names];
  }).catch((e) => {
    namesPromise = null;
    throw e;
  });
  return namesPromise;
}

// ---------------------------------------------------------------- cards

/** Pocket cards carry "/tcgp/" in their image path; fall back on the set ID. */
function isPocketBrief(b) {
  return (b.image ?? '').includes('/tcgp/') || isPocketSetId(setIdOf(b));
}

/** A card's set ID from its ID: "sv03-125" → "sv03", "SV-P-001" → "SV-P". */
export function setIdOf(brief) {
  const suffix = `-${brief.localId}`;
  return brief.id.endsWith(suffix) ? brief.id.slice(0, -suffix.length) : brief.id.replace(/-[^-]*$/, '');
}

/** The localId filter matches loosely; send digits without leading zeros so "037" finds "37". */
function localIdParam(number) {
  return /^\d+$/.test(number) ? normNumber(number) : number;
}

/**
 * The first ten Japanese sets (1996–2001): their cards print no collector
 * number, only the Pokédex number ("No. 032"). TCGdex numbers their cards in
 * its own order, so they're found by Pokédex number instead.
 */
export const DEX_NUMBER_SETS = ['PMCG1', 'PMCG2', 'PMCG3', 'PMCG4', 'PMCG5', 'PMCG6', 'neo1', 'neo2', 'neo3', 'neo4'];

/**
 * Candidate cards (briefs) for a query in one language.
 * @param {Lang} lang
 * @param {{ name: string, number: string|null, size: number|null, setCode: string|null, dexNo?: string|null }} q
 *   size: a plain printed size; setCode: only when it's a Pokémon code; dexNo: a Japanese
 *   "No. 32" search (DEX_NUMBER_SETS only)
 * @param {AbortSignal} [signal]
 * @returns {Promise<CardBrief[]>}
 */
export async function searchCards(lang, q, signal) {
  const list = await loadSetList(lang);
  let briefs = [];

  if (lang === 'ja' && q.dexNo) {
    // "No. 32": exactly that Pokédex number (eq:, since a plain dexId=32
    // also finds 132 and 232), in the sets that print only that.
    const found = (await transport.getJson(`${API}/ja/cards?dexId=eq:${encodeURIComponent(q.dexNo)}`, { signal })) ?? [];
    briefs = found.filter((b) => DEX_NUMBER_SETS.includes(setIdOf(b)));
  } else if (lang === 'ja') {
    // Japanese names can't be typed reliably: match by set code (= set ID)
    // and number, or by number within sets of the printed size.
    let sets = null;
    if (q.setCode) {
      const id = findJaSetId(q.setCode.toLowerCase());
      sets = id ? list.filter((s) => s.id === id) : [];
    } else if (q.size) {
      sets = list.filter((s) => s.cardCount?.official === q.size).slice(0, 8);
    }
    if (sets) {
      for (const s of sets) {
        const cards = await setCards('ja', s.id, signal);
        briefs.push(...cards.map((c) => ({ ...c, id: c.id ?? `${s.id}-${c.localId}` })));
      }
    } else if (q.number) {
      briefs = (await transport.getJson(`${API}/ja/cards?localId=${encodeURIComponent(localIdParam(q.number))}`, { signal })) ?? [];
    } else if (q.name) {
      briefs = (await transport.getJson(`${API}/ja/cards?name=${encodeURIComponent(q.name)}`, { signal })) ?? [];
    }
  } else {
    const params = new URLSearchParams();
    if (q.name) params.set('name', q.name);
    if (q.number) params.set('localId', localIdParam(q.number));
    if (q.setCode && !q.name && !q.number) {
      // A code and nothing else: the whole set.
      for (const id of enSetIdsForCode(q.setCode)) briefs.push(...(await setCards('en', id, signal)));
    } else if ([...params.keys()].length) {
      briefs = (await transport.getJson(`${API}/en/cards?${params}`, { signal })) ?? [];
    }
  }

  briefs = briefs.filter((b) => !isPocketBrief(b));
  if (q.number) briefs = briefs.filter((b) => normNumber(b.localId) === normNumber(q.number));
  return briefs;
}

const cardCache = memoryCache(DAY);
/**
 * A full card: variants, rarity, regulation mark, set counts.
 * @param {Lang} lang
 * @param {string} id
 */
export function fetchCard(lang, id, signal) {
  return cardCache.get(`${lang}:${id}`, async () => {
    const card = await transport.getJson(`${API}/${lang}/cards/${encodeURIComponent(id)}`, { signal });
    if (!card) throw new Error(`TCGdex has no card ${id}`);
    return card;
  });
}

/** Image URLs: TCGdex gives a base; add the quality and format. */
export function cardImage(brief, quality) {
  return brief.image ? `${brief.image}/${quality}.webp` : null;
}

/** The card's page on tcgdex.net (English only: the site routes by ID). */
export function cardPage(lang, brief, info) {
  if (lang !== 'en' || !info?.serieId) return null;
  const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'card';
  return `https://www.tcgdex.net/database/${info.serieId}-${slug(info.serieId)}/${info.id}-${slug(info.name)}/${brief.localId}-${slug(brief.name)}`;
}

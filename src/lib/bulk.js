import { formatMoney } from './money.js';
import { nameKey } from './normalize.js';
import { bulkItemKey } from './candidateKey.js';
import { GAMES } from './games.js';

// Bulk (docs/TEAM_FEEDBACK.md 5, Phase T3; owner, 2026-10-14): eight
// "cards" that stand for unsorted bulk, priced from Settings → Bulk values,
// found only by searching "bulk". A bulk item is a buy line like a card
// (bulk_kind set; quantity = items, unit_price = value per item) that only
// helps price a buy: exports, COMPLETE, Mark as completed, printouts and the
// header search treat it as if it weren't there (5.8).
//
// Placeholders (owner, 2026-10-16): "1 BULK placeholder", one for each game,
// for a card the search can't find yet. Bulk in most ways (found by "bulk",
// never exported, completed or printed), but a card in others: its own name
// as typed ("Team Rocket's, Meowth 117", else "Placeholder"), a price always
// typed in (none in Settings), one card per item, a card's rates (low end /
// high end, Set Rate), and the header search finds it by its name.

/**
 * The eight items (5.1). `per`: cards in one item; `unit`: the line's words
 * after its card count ("1,000 MTG Bulk commons/uncommons"); `label`: on the
 * card-back stack; `short`: its suggestion's caption ("100 BULK c/u", owner
 * 2026-10-15); `words`: what narrows a "bulk …" search to it.
 */
export const BULK_ITEMS = Object.freeze([
  { kind: 'mtg_100_common', game: 'mtg', per: 100, name: 'MTG 100 Bulk commons/uncommons',
    unit: 'MTG Bulk commons/uncommons', label: 'Commons & Uncommons', short: 'c/u', words: 'commons uncommons common uncommon' },
  { kind: 'mtg_100_rare', game: 'mtg', per: 100, name: 'MTG 100 Bulk rares/mythics',
    unit: 'MTG Bulk rares/mythics', label: 'Rares & Mythics', short: 'r/m', words: 'rares mythics rare mythic' },
  { kind: 'mtg_10_dollar', game: 'mtg', per: 10, name: 'MTG 10 Bulk $1 cards',
    unit: 'MTG Bulk $1 cards', label: '$1 cards', short: '$1', words: '$1 1 dollar dollars' },
  { kind: 'mtg_10_fifty', game: 'mtg', per: 10, name: 'MTG 10 Bulk 50¢ cards',
    unit: 'MTG Bulk 50¢ cards', label: '50¢ cards', short: '50¢', words: '50¢ 50c 50 fifty cents' },
  { kind: 'mtg_placeholder', game: 'mtg', per: 1, name: 'MTG Placeholder', unit: 'Placeholder', label: 'Placeholder',
    short: 'placeholder', words: 'placeholder missing card', placeholder: true },
  { kind: 'pkm_100', game: 'pokemon', per: 100, name: 'PKM 100 Bulk',
    unit: 'PKM Bulk', label: 'Bulk', short: '', words: 'commons' },
  { kind: 'pkm_100_ex', game: 'pokemon', per: 100, name: 'PKM 100 Bulk EXs',
    unit: 'PKM Bulk EXs', label: 'EXs', short: 'EX', words: 'ex exs' },
  { kind: 'pkm_10_dollar', game: 'pokemon', per: 10, name: 'PKM 10 Bulk $1 cards',
    unit: 'PKM Bulk $1 cards', label: '$1 cards', short: '$1', words: '$1 1 dollar dollars' },
  { kind: 'pkm_10_fifty', game: 'pokemon', per: 10, name: 'PKM 10 Bulk 50¢ cards',
    unit: 'PKM Bulk 50¢ cards', label: '50¢ cards', short: '50¢', words: '50¢ 50c 50 fifty cents' },
  { kind: 'pkm_placeholder', game: 'pokemon', per: 1, name: 'PKM Placeholder', unit: 'Placeholder', label: 'Placeholder',
    short: 'placeholder', words: 'placeholder missing card', placeholder: true },
].map(Object.freeze));

/** A placeholder's name until one is typed. */
export const PLACEHOLDER_NAME = 'Placeholder';

/** Settings → Bulk values as shipped (6.2): market value per item, in dollars. Placeholders have none. */
export const DEFAULT_BULK_VALUES = Object.freeze({
  mtg_100_common: 1.5, mtg_100_rare: 2.4, mtg_10_dollar: 8, mtg_10_fifty: 3,
  pkm_100: 0.75, pkm_100_ex: 2.4, pkm_10_dollar: 7, pkm_10_fifty: 2.5,
});

const BY_KIND = new Map(BULK_ITEMS.map((i) => [i.kind, i]));
const GAME_WORDS = { mtg: 'mtg magic', pokemon: 'pkm pokemon pokémon' };

/** One of the eight, by its key; null for anything else. */
export const bulkItem = (kind) => BY_KIND.get(kind) ?? null;

/** A bulk line (bulk_kind set), not a real card; placeholders too. */
export const isBulk = (line) => line?.bulk_kind != null;

/** A placeholder line (owner, 2026-10-16): bulk, but named, priced and rated like a card. */
export const isPlaceholder = (line) => bulkItem(line?.bulk_kind)?.placeholder === true;

/** Bulk proper: an item with a value per item (Set value), not a placeholder. */
export const isValuedBulk = (line) => isBulk(line) && !isPlaceholder(line);

/** The settings' values (possibly partial) over the defaults, as numbers. */
export function bulkValuesFrom(value) {
  const out = {};
  for (const item of BULK_ITEMS) {
    if (item.placeholder) continue;   // always priced by hand
    const v = Number(value?.[item.kind]);
    out[item.kind] = Number.isFinite(v) && v >= 0 ? v : DEFAULT_BULK_VALUES[item.kind];
  }
  return out;
}

/** A suggestion's caption: "100 BULK c/u", "10 BULK $1", "100 BULK" (owner, 2026-10-15). */
export const shortName = (item) => `${item.per} BULK${item.short ? ` ${item.short}` : ''}`;

/** A bulk line in short: "1,000 BULK c/u" (its cards, then its short name). */
export function bulkShortText(line, quantity = line.quantity) {
  const item = bulkItem(line.bulk_kind);
  if (!item || item.placeholder) return `${quantity} ${line.name}`;
  return `${(quantity * item.per).toLocaleString('en-US')} BULK${item.short ? ` ${item.short}` : ''}`;
}

/** "$1.50 per 100". */
export const perText = (item, value) => `${formatMoney(value)} per ${item.per}`;

/** A bulk item as a search result (the selected "card"), its value from Settings (a placeholder: none). */
export function bulkCandidate(item, value = null) {
  return {
    key: bulkItemKey(item.kind),
    game: item.game,
    lang: 'en',
    bulk: item.kind,
    item,
    value: item.placeholder ? null : value,
    name: item.name,
    setCode: 'BULK',
    setName: 'Bulk',
    number: '',
  };
}

/**
 * Bulk in a search (5.3). Only when a word of it is "bulk": "bulk" in any
 * other case lists the items first, then the cards as usual (the Magic card
 * Bulk Up); "BULK" in capitals lists only the items. Every other word narrows
 * them ("bulk rares", "BULK pkm", "bulk $1"). The MTG / PKM toggles apply.
 * The word "placeholder" in any case (owner, 2026-10-16) lists the
 * placeholders the same way, before the cards, with or without "bulk".
 * @param {string} text
 * @param {{ mtg: boolean, pokemon: boolean }} games
 * @param {Record<string, number>} values  bulkValuesFrom(settings)
 * @returns {{ items: object[], only: boolean }}  candidates, and whether the cards search is skipped
 */
export function bulkSearch(text, games, values = DEFAULT_BULK_VALUES) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  const at = words.findIndex((w) => w.toLowerCase() === 'bulk');
  // "placeholder" alone: the placeholders only, whatever its case.
  const ph = at < 0 ? words.findIndex((w) => /^placeholders?$/i.test(w)) : -1;
  if (at < 0 && ph < 0) return { items: [], only: false };
  const only = words[at] === 'BULK';
  const rest = words.filter((_, i) => i !== (at < 0 ? ph : at)).map((w) => w.toLowerCase().replace(/¢/g, 'c'));
  const items = BULK_ITEMS.filter((item) => {
    if (!games?.[item.game]) return false;
    if (ph >= 0 && !item.placeholder) return false;
    const hay = `${item.name} ${item.words} ${GAME_WORDS[item.game]}`.toLowerCase().replace(/¢/g, 'c').split(/[\s/]+/);
    return rest.every((w) => hay.some((h) => h.startsWith(w)));
  });
  return { items: items.map((item) => bulkCandidate(item, values[item.kind] ?? null)), only };
}

/**
 * "1,000 MTG Bulk commons/uncommons": the cards it stands for, not the
 * items. A placeholder: its name, marked ("1 Team Rocket's, Meowth 117 [Placeholder]").
 */
export function bulkLineText(line, quantity = line.quantity) {
  const item = bulkItem(line.bulk_kind);
  if (item?.placeholder) return `${quantity} ${placeholderBody(line)}`;
  if (!item) return `${quantity} ${line.name}`;
  return `${(quantity * item.per).toLocaleString('en-US')} ${item.unit}`;
}

/** A placeholder without its quantity: "Team Rocket's, Meowth 117 [Placeholder]". */
export const placeholderBody = (line) => `${line.name || PLACEHOLDER_NAME} [Placeholder]`;

/**
 * Real cards and bulk, counted apart (5.5); struck cards (lib/struck.js,
 * owner 2026-10-16) apart again: they're treated as gone. A placeholder is a
 * card.
 * @returns {{ cards: number, bulk: number, struck: number }}  bulk in cards (items × per)
 */
export function cardCounts(lines) {
  let cards = 0;
  let bulk = 0;
  let struck = 0;
  for (const l of lines ?? []) {
    const item = isBulk(l) ? bulkItem(l.bulk_kind) : null;
    const n = item ? Number(l.quantity) * item.per : Number(l.quantity);
    if (l.struck_at) struck += n;
    else if (item && !item.placeholder) bulk += n;
    else cards += n;
  }
  return { cards, bulk, struck };
}

/**
 * cardCounts for each game that has lines, in the games' usual order: a
 * collection's name chip (decision 276).
 * @returns {{ game: string, counts: { cards: number, bulk: number, struck: number } }[]}
 */
export function countsByGame(lines) {
  return GAMES.map(({ key }) => ({ game: key, counts: cardCounts((lines ?? []).filter((l) => l.game === key)) }))
    .filter(({ counts }) => counts.cards + counts.bulk + counts.struck > 0);
}

/**
 * "42 cards + 1,000 bulk", "1 card", "1,000 bulk"; "42 cards · 2 struck".
 * `short`: the cards without the word, for a game's chip ("Magic (42 + 1,000 bulk)").
 * `game`: its name before the first count, for a day page's other game
 * ("3 Pokémon cards + 100 bulk", "100 Pokémon bulk").
 */
export function countText({ cards, bulk, struck = 0 }, { short = false, game = null } = {}) {
  const n = cards.toLocaleString('en-US');
  const g = game ? `${game} ` : '';
  const c = short ? n : `${n} ${g}card${cards === 1 ? '' : 's'}`;
  const b = `${bulk.toLocaleString('en-US')} ${cards ? '' : g}bulk`;
  const both = !bulk ? c : cards ? `${c} + ${b}` : b;
  return struck ? `${both} · ${struck.toLocaleString('en-US')} struck` : both;
}

/**
 * A bulk item as a buy line (5.7): placeholders where a card has a set,
 * number, finish and condition. `manual`: a value of its own (Set value).
 */
export function buildBulkLine(item, quantity, value, manual = null) {
  return {
    game: item.game,
    lang: 'en',
    bulk_kind: item.kind,
    name: item.name,
    name_en: null,
    name_key: item.name.toLowerCase(),
    set_code: 'BULK',
    set_name: 'Bulk',
    source_set_id: null,
    collector_number: '',
    printed_size: null,
    rarity: null,
    finish: item.game === 'mtg' ? 'nonfoil' : 'normal',
    first_edition: false,
    treatments: [],
    condition: 'NM',
    quantity,
    unit_price: manual ?? value,
    market_price: value,
    price_source: manual != null ? 'manual' : 'bulk',
    price_snapshot: { bulk: { kind: item.kind, value, per: item.per } },
    priced_at: new Date().toISOString(),
    scryfall_id: null,
    oracle_id: null,
    tcgdex_id: null,
    tcgplayer_id: null,
    justtcg_card_id: null,
    justtcg_variant_id: null,
    image_url: null,
  };
}

/**
 * A placeholder as a buy line (owner, 2026-10-16): its name as typed (else
 * "Placeholder") and its price typed in; one card per item.
 */
export function buildPlaceholderLine(item, quantity, price, name) {
  const named = String(name ?? '').replace(/\s+/g, ' ').trim() || PLACEHOLDER_NAME;
  return {
    ...buildBulkLine(item, quantity, price, price),
    name: named,
    name_key: nameKey(named),
    market_price: price,
    price_snapshot: { placeholder: { kind: item.kind } },
  };
}

/**
 * REPRICE? for a bulk line (5.2): back to its Settings value, as collection_reprice
 * saves it; a value of its own (Set value) is kept, as a manual price is.
 * @returns {{ line_id: string, kept: 'manual'|null, unit_price: number, market_price: number,
 *   price_source: string, price_snapshot: object, priced_at: string,
 *   justtcg_card_id: null, justtcg_variant_id: null }}
 */
export function repricedBulk(line, values) {
  const item = bulkItem(line.bulk_kind);
  // A placeholder has no value but its own: kept, as a manual price is.
  const value = item?.placeholder ? Number(line.market_price ?? line.unit_price) : values[line.bulk_kind];
  const manual = line.price_source === 'manual';
  return {
    line_id: line.id,
    kept: manual ? 'manual' : null,
    unit_price: manual ? Number(line.unit_price) : value,
    market_price: value,
    price_source: manual ? 'manual' : 'bulk',
    price_snapshot: { ...(line.price_snapshot ?? {}), bulk: { kind: line.bulk_kind, value, per: item?.per ?? null }, repriced_at: new Date().toISOString() },
    priced_at: new Date().toISOString(),
    justtcg_card_id: null,
    justtcg_variant_id: null,
  };
}

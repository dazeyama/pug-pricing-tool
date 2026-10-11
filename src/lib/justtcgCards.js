// Pokémon cards from TCGplayer's catalogue, through JustTCG (owner,
// 2026-10-09): the cards TCGdex lacks (new promos, a few missing sets) as
// search results, and TCGplayer-only versions of a card TCGdex has (Cosmos
// Holo, stamped and other separate products). Pure functions; the requests
// are in prices.js (searchTcgplayer).
//
// JustTCG names its cards as TCGplayer does: "Gengar - 060/162 (Cosmos Holo)",
// "Nidorina - 101 (30th Celebration)"; numbers "060/162" or "101"; sets
// "XY - BREAKthrough", "ME: Mega Evolution Promo", "Miscellaneous Cards &
// Products"; printings "Normal", "Holofoil", "Reverse Holofoil", "1st Edition
// Holofoil" (prices.js).

const lower = (s) => String(s ?? '').toLowerCase();
/** Letters and digits only, for comparing names. */
export const fold = (s) => lower(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

/**
 * JustTCG's Japanese sets that TCGdex has too, as its ten oldest (owner,
 * 2026-10-10): a "No." search drops a JustTCG card TCGdex already found there.
 */
export const TCGDEX_SET_FOR = {
  'expansion-pack-pokemon-japan': 'pmcg1',
  'expansion-pack-no-rarity-pokemon-japan': 'pmcg1',
  'pokemon-jungle-pokemon-japan': 'pmcg2',
  'mystery-of-the-fossils-pokemon-japan': 'pmcg3',
  'rocket-gang-pokemon-japan': 'pmcg4',
  'leaders-stadium-pokemon-japan': 'pmcg5',
  'challenge-from-the-darkness-pokemon-japan': 'pmcg6',
  'gold-silver-to-a-new-world-pokemon-japan': 'neo1',
  'crossing-the-ruins-pokemon-japan': 'neo2',
  'awakening-legends-pokemon-japan': 'neo3',
  'darkness-and-to-light-pokemon-japan': 'neo4',
};

/**
 * The "No." search's TCGplayer cards worth adding (owner, 2026-10-10): every
 * one, less those TCGdex already found, the same English name in the same set
 * (TCGDEX_SET_FOR), so a plain Starmie from the first set shows once.
 * @param {object[]} cards  slimmed JustTCG cards from a 'dex' search
 * @param {{ setId: string, name: string|null }[]} found  TCGdex's cards: set ID and English name
 */
export function noNumberCards(cards, found) {
  const have = new Set(found.filter((f) => f.name).map((f) => `${lower(f.setId)}|${fold(f.name)}`));
  return (cards ?? []).filter((c) => {
    const set = TCGDEX_SET_FOR[c.set];
    return !(set && have.has(`${set}|${fold(splitName(c.name).name)}`));
  });
}

/** A JustTCG card's own id: the one its prices are looked up by. */
export const cardId = (card) => String(card?.uuid ?? card?.id ?? '');

/**
 * "Gengar - 060/162 (Cosmos Holo)" → { name: "Gengar", suffix: "Cosmos Holo" };
 * "Nidorina - 101 (30th Celebration)" → { name: "Nidorina", suffix: "30th Celebration" }.
 * Bare numbers in brackets ("(101)") say nothing and are dropped.
 */
export function splitName(full) {
  let s = String(full ?? '').trim();
  const parts = [];
  for (let m = /\s*\(([^()]*)\)\s*$/.exec(s); m; m = /\s*\(([^()]*)\)\s*$/.exec(s)) {
    parts.unshift(m[1].trim());
    s = s.slice(0, m.index).trim();
  }
  s = s.replace(/\s+-\s+[A-Za-z]*\d+[A-Za-z]*(?:\/[A-Za-z]*\d+)?$/, '').trim();
  return {
    name: s || String(full ?? '').trim(),
    suffix: parts.filter((p) => p && !/^\d+$/.test(p)).join(' · '),
  };
}

/** "060/162" → { number: "060", size: 162 }; "101" → { number: "101", size: null }; "TG06/TG30" → { "TG06", null }. */
export function splitNumber(value) {
  const [number, of] = String(value ?? '').trim().split('/');
  return { number: number ?? '', size: /^\d+$/.test(of ?? '') ? Number(of) : null };
}

/** A JustTCG printing as a finish: "Reverse Holofoil" → reverse, "1st Edition Holofoil" → holo + 1st Edition. */
export function printingFinish(printing) {
  const p = lower(printing);
  return {
    finish: p.includes('reverse') ? 'reverse' : p.includes('holo') ? 'holo' : 'normal',
    firstEdition: p.includes('1st edition'),
  };
}

/** A card's printings in one language (English, or Japanese for a Japanese card), in the order JustTCG lists them. */
function printingsOf(card, lang = 'en') {
  const mine = (card?.variants ?? []).filter((v) => (lang === 'ja'
    ? lower(v.language) === 'japanese'
    : !v.language || lower(v.language) === 'english'));
  return [...new Set(mine.map((v) => v.printing).filter(Boolean))];
}

/**
 * Versions for one JustTCG card, in the shape pokemonVersions gives: one per
 * English printing (one plain version when it lists none). They're priced by
 * their own product (tcgplayerId, else the JustTCG card id), and a suffix
 * ("Cosmos Holo", "30th Celebration") is kept as a `variant:` treatment so the
 * buy line says it. `tcgplayerOnly` marks them as TCGplayer's, not TCGdex's.
 */
export function justtcgVersions(card, suffix = '', lang = 'en') {
  const printings = printingsOf(card, lang);
  const list = printings.length ? printings : ['Normal'];
  const hasFirst = list.some((p) => printingFinish(p).firstEdition);
  const seen = new Set();
  const out = [];
  for (const p of list) {
    const { finish, firstEdition } = printingFinish(p);
    if (seen.has(`${finish}|${firstEdition}`)) continue;
    seen.add(`${finish}|${firstEdition}`);
    const edition = firstEdition ? '1st Edition' : hasFirst ? 'Unlimited' : '';
    out.push({
      id: `jt:${cardId(card)}:${p}`,
      finish,
      label: [suffix, edition].filter(Boolean).join(' · ') || 'Standard',
      firstEdition,
      treatments: suffix ? [`variant:${suffix}`] : [],
      tcgplayerId: card?.tcgplayerId ? String(card.tcgplayerId) : null,
      justtcgId: cardId(card),
      marketPrice: null,
      cardmarketPrice: null,
      tcgplayerOnly: true,
    });
  }
  return out;
}

// TCGplayer's oversized cards (owner, 2026-10-11): singles only (spec 1.4),
// as TCGdex's jumbo variants are already left out.
const OVERSIZED = /\b(jumbo|oversized?)\b/i;
/** Is this JustTCG card an oversized one ("Jumbo Cards", "… (Oversized)")? */
export const isOversized = (card) => OVERSIZED.test(`${card?.set_name ?? ''} ${card?.name ?? ''}`);
// A TCGplayer suffix that names a stamp: "Journey Together Stamped", "Prerelease Stamp".
const STAMPED = /\bstamp(ed)?\b/i;
// TCGplayer's Prize Pack products have no name of their own ("Lugia VSTAR -
// 139/195" in "Prize Pack Series Cards"): they're the Play! Pokémon stamped
// reprints, and say so (owner, 2026-10-11). Being a stamp, one can match
// TCGdex's stamped version (withTcgplayerVersions).
const PRIZE_PACK = /prize pack/i;
export const PLAY_STAMP = 'Play! Pokémon stamp';
/** Is this the Play! Pokémon stamped version (TCGplayer's Prize Pack product, or TCGdex's matched to it)? */
export const isPlayStamp = (v) => (v?.treatments ?? []).includes(`variant:${PLAY_STAMP}`) || v?.label === PLAY_STAMP;
/** A TCGplayer-only version's suffix ("Cosmos Holo"), from its `variant:` treatment. */
const suffixOf = (v) => (v.treatments ?? []).find((t) => t.startsWith('variant:'))?.slice('variant:'.length) ?? '';

/**
 * TCGplayer-only versions of a TCGdex card (owner, 2026-10-09): the products
 * a siblings search found with its name and number, less the ones TCGdex
 * already gives (by TCGplayer ID) and the plain card itself (no suffix, same
 * set). Each is labelled by its suffix ("Cosmos Holo"), else its TCGplayer
 * set ("Miscellaneous Cards & Products"); a Prize Pack one, "Play! Pokémon
 * stamp".
 *
 * The card's own product counts too (owner, 2026-10-11): TCGplayer can list a
 * printing of it that TCGdex's variants lack (XY Staryu 33/146: TCGdex says
 * Normal only, TCGplayer sells a Reverse Holofoil of the same product). Each
 * finish missing from TCGdex's versions (finish and 1st Edition) becomes a
 * version priced from that product, marked `ownProduct`. Oversized products
 * (jumbo cards) are left out (owner, 2026-10-11).
 * @param {object[]|null} cards  slimmed JustTCG cards
 * @param {{ setName: string }} c  the selected TCGdex candidate
 * @param {object[]} versions  its TCGdex versions
 */
export function siblingVersions(cards, c, versions) {
  const known = new Set(versions.map((v) => v.tcgplayerId).filter(Boolean));
  // "XY - BREAKthrough" = "BREAKthrough", "Diamond and Pearl" = "Diamond & Pearl".
  const setKey = (name) => fold(plainSetName(name).replace(/&|\band\b/gi, ' '));
  const set = setKey(c?.setName);
  const finishKey = (v) => `${v.finish}|${Boolean(v.firstEdition)}`;
  const have = new Set(versions.map(finishKey));
  const out = [];
  for (const card of cards ?? []) {
    if (isOversized(card)) continue;
    const { suffix } = splitName(card.name);
    const theirs = setKey(card.set_name);
    const sameSet = Boolean(set && theirs && (theirs.includes(set) || set.includes(theirs)));
    if ((card.tcgplayerId && known.has(String(card.tcgplayerId))) || (!suffix && sameSet)) {
      for (const v of justtcgVersions(card)) {
        if (have.has(finishKey(v))) continue;
        have.add(finishKey(v));
        out.push({ ...v, ownProduct: true });
      }
      continue;
    }
    const named = PRIZE_PACK.test(card.set_name ?? '') ? PLAY_STAMP : card.set_name;
    out.push(...justtcgVersions(card, suffix || named || 'TCGplayer'));
  }
  return out;
}

/**
 * A TCGdex card's versions with TCGplayer's (owner, 2026-10-09 to 10-11):
 * siblingVersions' extra products and printings added, and a stamped version
 * TCGdex gives no TCGplayer product matched to TCGplayer's one stamped
 * product of the same finish. They're the same card (Mimikyu ex 069: TCGdex's
 * "Set logo stamp" is TCGplayer's "Journey Together Stamped"), which was
 * listed twice, TCGdex's priced as the plain card. Matched, TCGdex's version
 * keeps its id and stamp, takes the product (its prices) and TCGplayer's
 * name, and the product isn't listed again. With more than one of either for
 * a finish, nothing is matched.
 * @param {object[]} versions  TCGdex's (pokemonVersions)
 * @param {object[]|null} cards  the siblings search's JustTCG cards
 * @param {{ setName: string }} c  the selected TCGdex candidate
 */
export function withTcgplayerVersions(versions, cards, c) {
  const extra = siblingVersions(cards, c, versions);
  const out = [...versions];
  const matched = new Set();
  for (const finish of new Set(versions.map((v) => v.finish))) {
    const ours = versions.filter((v) => v.finish === finish && v.stamps?.length && !v.tcgplayerId && !v.firstEdition);
    const theirs = extra.filter((v) => v.finish === finish && !v.ownProduct && !v.firstEdition && STAMPED.test(suffixOf(v)));
    if (ours.length !== 1 || theirs.length !== 1) continue;
    const [mine] = ours;
    const [tcg] = theirs;
    out[out.indexOf(mine)] = {
      ...mine, label: suffixOf(tcg), tcgplayerId: tcg.tcgplayerId, justtcgId: tcg.justtcgId, matchedTcgplayer: true,
    };
    matched.add(tcg.id);
  }
  return [...out, ...extra.filter((v) => !matched.has(v.id))];
}

/**
 * The version a saved line was priced as, when it was a TCGplayer-only one
 * (REPRICE?, the export): rebuilt from the line, as its card can't list it.
 */
export function lineVersion(line) {
  return {
    id: line.price_snapshot?.version ?? `jt:${line.justtcg_card_id}`,
    finish: line.finish,
    label: '',
    firstEdition: Boolean(line.first_edition),
    treatments: line.treatments ?? [],
    tcgplayerId: line.tcgplayer_id ?? null,
    justtcgId: line.justtcg_card_id ?? null,
    marketPrice: null,
    cardmarketPrice: null,
    tcgplayerOnly: true,
  };
}

/** Is this saved line's version a TCGplayer-only one? */
export const isTcgplayerOnlyLine = (line) => String(line.price_snapshot?.version ?? '').startsWith('jt:')
  || (!line.tcgdex_id && Boolean(line.justtcg_card_id));

// TCGplayer's promo sets, by the printed code collectors use.
const PROMO_CODES = [
  [/^ME\b.*promo/i, 'MEP'],
  [/^SV\b.*promo/i, 'SVP'],
  [/^SWSH\b.*promo/i, 'SWSHP'],
  [/^SM\b.*promo/i, 'SMP'],
  [/^XY\b.*promo/i, 'XYP'],
  [/^(BW|Black (and|&) White)\b.*promo/i, 'BWP'],
  [/^HGSS\b.*promo/i, 'HSP'],
  [/^(DP|Diamond (and|&) Pearl)\b.*promo/i, 'DPP'],
  [/^Nintendo\b.*promo/i, 'NP'],
  [/^WoTC\b.*promo/i, 'PR'],
  [/^Miscellaneous Cards/i, 'MISC'],
];

/** "SV10: Destined Rivals" → "Destined Rivals", "XY - BREAKthrough" → "BREAKthrough": TCGplayer's prefixes off. */
export function plainSetName(setName) {
  return String(setName ?? '')
    .replace(/^[A-Za-z]{1,6}\d*[a-z]?:\s*/, '')
    .replace(/^(XY|SM|BW|HGSS|DP|EX|POP|Base|Neo|Gym|E-Card)\s*-\s*/i, '')
    .trim();
}

/**
 * A set code for a TCGplayer set TCGdex can't name (prices.js tries TCGdex
 * first): the promo sets' usual codes, else TCGplayer's own prefix ("SV10"),
 * else the name's initials.
 */
export function guessSetCode(setName) {
  const name = String(setName ?? '').trim();
  for (const [re, code] of PROMO_CODES) if (re.test(name)) return code;
  const prefix = /^([A-Za-z]{1,6}\d*[a-z]?):\s/.exec(name)?.[1];
  if (prefix) return prefix.toUpperCase();
  const initials = name.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/)
    .filter((w) => w && !/^(and|of|the)$/i.test(w))
    .map((w) => (/^\d+$/.test(w) ? w : w[0].toUpperCase()))
    .join('');
  return initials.slice(0, 6) || 'TCGP';
}

/**
 * A JustTCG card as a search result (spec 8.3's Candidate), for a card TCGdex
 * doesn't have. Its picture comes from TCGplayer (pokemonImages.js).
 * @param {object} card  a slimmed JustTCG card
 * @param {{ lang?: 'en'|'ja', setCode: string, number?: string|null }} opts  number: shown instead of
 *   JustTCG's ("No. 121" for an unnumbered old Japanese card)
 */
export function justtcgCandidate(card, { lang = 'en', setCode, number: shown = null }) {
  const { name, suffix } = splitName(card.name);
  const split = splitNumber(card.number);
  // An unnumbered old Japanese card goes by its Pokédex number ("No. 121").
  const { number, size } = shown ? { number: shown, size: null } : split;
  const id = cardId(card);
  return {
    key: `pokemon:${lang}:jt:${id}`,
    game: 'pokemon',
    lang,
    name,
    setCode,
    setName: card.set_name ?? '',
    setId: card.set ?? '',
    number,
    printedSize: size,
    releasedAt: null,
    order: 0,
    thumb: null,
    image: null,
    score: 0,
    source: 'justtcg',
    justtcgId: id,
    tcgplayerId: card.tcgplayerId ? String(card.tcgplayerId) : null,
    rarity: card.rarity ?? null,
    suffix,
    justtcg: card,
  };
}

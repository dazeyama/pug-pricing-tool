// A Pokémon product that is another card (decision 288), checked in the browser too
// (decision 347). The prices function refuses a TCGplayer product whose number isn't
// the card's; the browser keeps prices for the page's life under the product's key,
// which every card TCGdex gives that product shares, so a cached answer is checked
// for the card asking before it's used. The same number rule as the function's
// (supabase/functions/prices/index.ts anotherCard); its set rule needs the function's
// table of TCGplayer homes, so it's the function's alone.

/** "021/088" → "21", "TG05" → "tg5", "SV-P 012" kept apart from "12". */
const normNumber = (n) => String(n ?? '').trim().toLowerCase().split('/')[0]
  .replace(/^([a-z]*-?)0+(?=\d)/, '$1');

/**
 * Why a cached product answer isn't this card's, or null.
 * @param {{ game: string, tcgplayerId?: string, number?: string }} lookup  a lookupsFor() lookup
 * @param {{ number?: string }|null} card  the JustTCG card cached under its key
 * @returns {string|null}
 */
export function anotherCard(lookup, card) {
  if (!card || lookup.game !== 'pokemon' || !lookup.tcgplayerId) return null;
  const theirs = String(card.number ?? '');
  const mine = String(lookup.number ?? '');
  if (/\d/.test(theirs) && /\d/.test(mine) && !/^cc/i.test(mine) && normNumber(theirs) !== normNumber(mine)) {
    return `number ${theirs}, not ${mine}`;
  }
  return null;
}

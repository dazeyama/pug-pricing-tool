// A buy list's order (decision 403): as added, by price high to low, or (Magic) by color, the
// way the cards get sorted into piles: W, U, B, R, G, multicolor, colorless, lands; A–Z in each.

/** The orders a list can show, with their button labels and tooltips. */
export const LIST_SORTS = [
  { key: 'added', label: 'Added', title: 'As added' },
  { key: 'price', label: '$ ↓', title: 'Price per card, high to low' },
  { key: 'color', label: 'WUBRG', title: 'Magic by color: W, U, B, R, G, multicolor, colorless, lands; A–Z in each (Pokémon stay as added)' },
];

const COLORS = ['W', 'U', 'B', 'R', 'G'];

/**
 * A Magic card's pile: 0–4 one color (WUBRG), 5 multicolor, 6 colorless, 7 a land, 8 not known
 * (its card not loaded). A double-faced card goes by its front face.
 * @param {object|null|undefined} card  a Scryfall card
 * @returns {number}
 */
export function colorGroup(card) {
  if (!card) return 8;
  const face = card.card_faces?.[0];
  const typeLine = face?.type_line ?? card.type_line ?? '';
  if (/\bLand\b/.test(typeLine.split('—')[0])) return 7;
  const colors = card.colors ?? face?.colors ?? [];
  if (colors.length > 1) return 5;
  if (colors.length === 1) return COLORS.indexOf(colors[0]);
  return 6;
}

/**
 * Cards in the given order; as added keeps them as they came. Ties keep the order added.
 * @param {object[]} lines  one game's cards, as added
 * @param {'added'|'price'|'color'} sort
 * @param {(line: object) => object|null} [cardOf]  the line's Scryfall card, for 'color' (Magic)
 * @returns {object[]}
 */
export function sortLines(lines, sort, cardOf = () => null) {
  const at = new Map(lines.map((l, i) => [l, i]));
  const added = (a, b) => at.get(a) - at.get(b);
  if (sort === 'price') {
    return [...lines].sort((a, b) => Number(b.unit_price) - Number(a.unit_price) || added(a, b));
  }
  if (sort === 'color') {
    const group = new Map(lines.map((l) => [l, colorGroup(cardOf(l))]));
    return [...lines].sort((a, b) => group.get(a) - group.get(b)
      || String(a.name).localeCompare(String(b.name)) || added(a, b));
  }
  return [...lines];
}

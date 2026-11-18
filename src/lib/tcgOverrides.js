// Single TCGplayer products the route reads another way (decision 594), beside the set table (tcgSetTable.js, which
// is generated: these are kept by hand). By TCGplayer's product id, so an entry can't catch another card: its name
// and set beside it for a reader, and the tags (folded, as tcgRoute.js compares them) the route reads in place of
// TCGplayer's own. The line's finish still picks CC's foil or non-foil product.

/** @type {Record<number, { name: string, set: string, tags: string[], why: string }>} */
export const TCG_PRODUCT_OVERRIDES = {
  // The owner, 2026-11-18: "unclear on this, I think CC is right, make a special case for this single card".
  648705: {
    name: 'Fated Firepower (Showcase)',
    set: 'Avatar: The Last Airbender 341',
    tags: ['borderless'],
    why: 'TCGplayer\'s "(Showcase)" is CC\'s "Fated Firepower - Borderless"',
  },
};

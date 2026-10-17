import { movesOn } from './struck.js';

// Ctrl+Click on EXPORT (decision 285, a secret): the cards as a plain
// decklist, "<quantity> <card name>" a line and nothing else, for pasting into
// Moxfield and the like. Pure, for tests.

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

/**
 * One line per card name (every set, finish and condition of it summed), A
 * to Z; bulk and struck cards left out, as everything that moves cards on
 * leaves them (lib/struck.js). The English name when a card has one.
 * @param {{ name: string, name_en?: string|null, quantity: number }[]} lines
 * @returns {{ text: string, cards: number, names: number }}
 */
export function decklistText(lines) {
  const counts = new Map();
  for (const line of lines ?? []) {
    if (!movesOn(line)) continue;
    const name = (line.name_en || line.name || '').trim();
    const qty = Number(line.quantity) || 0;
    if (!name || qty <= 0) continue;
    counts.set(name, (counts.get(name) ?? 0) + qty);
  }
  const rows = [...counts].sort(([a], [b]) => collator.compare(a, b));
  return {
    text: rows.map(([name, qty]) => `${qty} ${name}`).join('\n'),
    cards: rows.reduce((n, [, qty]) => n + qty, 0),
    names: rows.length,
  };
}

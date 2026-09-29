import { useEffect, useState } from 'react';
import * as scry from '../../lib/scryfall.js';
import * as dex from '../../lib/tcgdex.js';

/**
 * A Pokémon candidate's full TCGdex card (variants, rarity, regulation mark,
 * TCGplayer ID) and set details (page link). `resolved` turns true once
 * loaded, or failed.
 */
export function usePokemonDetail(c) {
  const [detail, setDetail] = useState({ key: null, card: null, info: null, page: null });
  useEffect(() => {
    if (c?.game !== 'pokemon') return undefined;
    let alive = true;
    const brief = { localId: c.number, name: c.name };
    Promise.allSettled([dex.fetchCard(c.lang, c.tcgdexId), dex.ensureSetInfo(c.lang, c.setId)])
      .then(([card, info]) => {
        if (!alive) return;
        setDetail({
          key: c.key,
          card: card.status === 'fulfilled' ? card.value : null,
          info: info.status === 'fulfilled' ? info.value : null,
          page: info.status === 'fulfilled' ? dex.cardPage(c.lang, brief, info.value) : null,
        });
      });
    return () => {
      alive = false;
    };
  }, [c?.key]);
  return detail.key === c?.key
    ? { ...detail, resolved: true }
    : { card: null, info: null, page: null, resolved: false };
}

/** Siblings are shared by every printing of a card in a set. */
function groupOf(card) {
  return `${card.oracle_id ?? card.card_faces?.[0]?.oracle_id ?? card.name}:${card.set}`;
}

/**
 * Every printing of a Magic candidate's card in the same set (spec 8.6), for
 * the details panel. null while loading. Moving between siblings keeps the
 * list, so the panel doesn't flicker.
 * @returns {any[]|null} Scryfall cards
 */
export function useMagicSiblings(c) {
  const [state, setState] = useState({ group: null, siblings: null });
  const group = c?.game === 'mtg' ? groupOf(c.scryfall) : null;

  useEffect(() => {
    if (!group) return undefined;
    let alive = true;
    scry.fetchSiblings(c.scryfall)
      .then((siblings) => alive && setState({ group, siblings }))
      .catch(() => alive && setState({ group, siblings: [c.scryfall] }));
    return () => {
      alive = false;
    };
  }, [group]);

  return group && state.group === group ? state.siblings : null;
}

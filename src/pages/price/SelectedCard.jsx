import { useEffect, useState } from 'react';
import CardImage from '../../components/CardImage.jsx';
import GameBadge from '../../components/GameBadge.jsx';
import * as scry from '../../lib/scryfall.js';
import * as dex from '../../lib/tcgdex.js';

const MAGIC_RARITY = { mythic: 'Mythic rare', common: 'Common', uncommon: 'Uncommon', rare: 'Rare', special: 'Special', bonus: 'Bonus' };

/** Full Pokémon card and set details for the info panel (rarity, regulation mark, page link). */
function usePokemonDetail(c) {
  const [detail, setDetail] = useState({ key: null, card: null, info: null });
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
  }, [c]);
  return detail.key === c?.key ? detail : { card: null, info: null, page: null };
}

/** The selected card, large, with its info panel on the right (spec 8.4). */
export default function SelectedCard({ candidate: c, typedName }) {
  const [face, setFace] = useState(0);
  const pokemon = usePokemonDetail(c);
  useEffect(() => setFace(0), [c?.key]);

  if (!c) {
    return (
      <>
        <div className="card-col">
          <div className="stage-label">Selected card</div>
          <div className="card-box">
            <div className="card-wrap card-empty">Type a card above</div>
          </div>
        </div>
        <div className="info-col" />
      </>
    );
  }

  const magic = c.game === 'mtg' ? c.scryfall : null;
  const flippable = magic && scry.hasBackFace(magic);
  const thumb = magic ? scry.cardImage(magic, 'small', face) : c.thumb;
  const image = magic ? scry.cardImage(magic, 'large', face) : c.image;
  const set = magic ? scry.setByCode(c.setId) : null;
  const rarity = magic ? MAGIC_RARITY[magic.rarity] ?? magic.rarity : pokemon.card?.rarity;
  const size = c.printedSize ?? pokemon.card?.set?.cardCount?.official ?? null;
  const link = magic ? magic.scryfall_uri : pokemon.page;
  // A Japanese name staff can't read gets the English name they typed beside it.
  const latin = /^[\p{Script=Latin}\p{N}\p{P}\p{Zs}\p{S}]*$/u.test(c.name);

  return (
    <>
      <div className="card-col">
        <div className="stage-label">Selected card</div>
        <div className="card-box">
          <CardImage key={`${c.key}:${face}`} thumb={thumb} image={image} alt={c.name} name={c.name} number={c.number} />
          {flippable && (
            <button
              type="button"
              className="flip-btn"
              title="Show the other face"
              onClick={() => setFace((f) => 1 - f)}
            >
              ⟲ Flip
            </button>
          )}
        </div>
      </div>

      <aside className="info-col">
        <div className="card-info">
          <h2 className="info-name">{flippable ? magic.card_faces[face].name : c.name}</h2>
          {!latin && typedName && <p className="info-typed">{typedName}</p>}
          <p className="info-set">
            {set?.icon_svg_uri && <img className="set-icon" src={set.icon_svg_uri} alt="" />}
            <span>{c.setName}</span> <span className="info-code">({c.setCode})</span>
          </p>
          <p className="info-number">#{c.number}{size ? ` / ${size}` : ''}</p>
          {rarity && <p className="info-rarity">{rarity}</p>}
          <p className="info-tags">
            <GameBadge game={c.game} />
            <span>{c.lang === 'ja' ? 'Japanese' : 'English'}</span>
            {c.lang === 'ja' && <span className="tag-jp">JP</span>}
          </p>
          {pokemon.card?.regulationMark && (
            <p className="info-reg">Regulation mark <strong>{pokemon.card.regulationMark}</strong></p>
          )}
          {link && (
            <a className="info-link" href={link} target="_blank" rel="noreferrer">
              View on {magic ? 'Scryfall' : 'TCGdex'} ↗
            </a>
          )}
        </div>
      </aside>
    </>
  );
}

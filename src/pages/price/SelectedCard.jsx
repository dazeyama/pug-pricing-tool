import { useEffect, useState } from 'react';
import CardImage from '../../components/CardImage.jsx';
import GameBadge from '../../components/GameBadge.jsx';
import * as scry from '../../lib/scryfall.js';
import { useCardImages } from './useCardImages.js';
import { POKEMON_CARD_BACK, tcgplayerId } from '../../lib/pokemonImages.js';

const MAGIC_RARITY = { mythic: 'Mythic rare', common: 'Common', uncommon: 'Uncommon', rare: 'Rare', special: 'Special', bonus: 'Bonus' };

const TCGPLAYER = 'https://www.tcgplayer.com';

/**
 * The card on TCGplayer: its product page when the TCGplayer ID is known
 * (Scryfall for Magic, TCGdex for English Pokémon), otherwise a TCGplayer
 * search (Japanese Pokémon, which TCGdex has no IDs for).
 * @returns {{ href: string, exact: boolean }|null}  null while the Pokémon card is still loading
 */
function tcgplayerLink(c, magic, pokemon, typedName, finish) {
  const search = (category, q) => ({
    href: `${TCGPLAYER}/search/${category}/product?q=${encodeURIComponent(q.trim())}`,
    exact: false,
  });
  if (magic) {
    // Etched foils are their own product on TCGplayer (spec 5.3).
    if (finish === 'etched' && magic.tcgplayer_etched_id) {
      return { href: `${TCGPLAYER}/product/${magic.tcgplayer_etched_id}`, exact: true };
    }
    return magic.tcgplayer_id
      ? { href: `${TCGPLAYER}/product/${magic.tcgplayer_id}`, exact: true }
      : search('magic', magic.name);
  }
  if (!pokemon.resolved) return null;
  const id = tcgplayerId(pokemon.card);
  if (id) return { href: `${TCGPLAYER}/product/${id}`, exact: true };
  return c.lang === 'ja'
    ? search('pokemon-japan', `${typedName || c.name} ${c.number}`)
    : search('pokemon', `${c.name} ${c.number}`);
}

/**
 * The selected card, large, with its info panel beside it (spec 8.4).
 * `pokemon` is the shared full-card detail (usePokemonDetail); `finish` the
 * chosen Magic finish.
 */
export default function SelectedCard({ candidate: c, typedName, pokemon, finish }) {
  const [face, setFace] = useState(0);
  const pokemonImages = useCardImages(c);   // TCGdex's, or a backup when it has none
  useEffect(() => setFace(0), [c?.key]);

  if (!c) {
    return (
      <>
        <div className="area-card">
          <div className="stage-label">Selected card</div>
          <div className="card-box">
            <div className="card-wrap card-empty">Type a card above</div>
          </div>
        </div>
        {/* Drawn empty, so nothing below it moves when a card is picked. */}
        <aside className="area-info">
          <div className="card-info empty">Card details appear here</div>
        </aside>
      </>
    );
  }

  const magic = c.game === 'mtg' ? c.scryfall : null;
  const flippable = magic && scry.hasBackFace(magic);
  const thumb = magic ? scry.cardImage(magic, 'small', face) : pokemonImages.thumb;
  const image = magic ? scry.cardImage(magic, 'large', face) : pokemonImages.image;
  const set = magic ? scry.setByCode(c.setId) : null;
  const rarity = magic ? MAGIC_RARITY[magic.rarity] ?? magic.rarity : pokemon.card?.rarity;
  const size = c.printedSize ?? pokemon.card?.set?.cardCount?.official ?? null;
  const link = magic ? magic.scryfall_uri : pokemon.page;
  const tcgplayer = tcgplayerLink(c, magic, pokemon, typedName, finish);
  const name = flippable ? magic.card_faces[face].name : c.name;
  // A Japanese name staff can't read gets the English name they typed beside it.
  const latin = /^[\p{Script=Latin}\p{N}\p{P}\p{Zs}\p{S}]*$/u.test(c.name);

  return (
    <>
      <div className="area-card">
        <div className="stage-label">Selected card</div>
        <div className="card-box">
          {/* Keyed by the image too: a backup image arriving later starts a fresh load. */}
          <CardImage
            key={`${c.key}:${face}:${image ?? 'none'}`}
            thumb={thumb}
            image={image}
            back={c.game === 'pokemon' ? POKEMON_CARD_BACK : undefined}
            loading={!magic && pokemonImages.status === 'loading'}
            alt={c.name}
            name={c.name}
            number={c.number}
          />
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

      {/* A fixed height for every card (see .area-info), so the suggestions
          below never shift: one line each, long text ends in "…". */}
      <aside className="area-info">
        <div className="card-info">
          <h2 className="info-name" title={name}>{name}</h2>
          <p className="info-set" title={`${c.setName} (${c.setCode})`}>
            {set?.icon_svg_uri && <img className="set-icon" src={set.icon_svg_uri} alt="" />}
            <span className="info-set-name">{c.setName}</span> <span className="info-code">({c.setCode})</span>
          </p>
          <p className="info-number">
            #{c.number}{size ? ` / ${size}` : ''}
            {rarity && <span className="info-rarity"> · {rarity}</span>}
          </p>
          <p className="info-tags">
            <GameBadge game={c.game} />
            <span>{c.lang === 'ja' ? 'Japanese' : 'English'}</span>
            {c.lang === 'ja' && <span className="tag-jp">JP</span>}
            {!latin && typedName && <span className="info-typed" title="What you typed">{typedName}</span>}
            {pokemon.card?.regulationMark && (
              <span className="info-reg">Regulation <strong>{pokemon.card.regulationMark}</strong></span>
            )}
          </p>
          <p className="info-links">
            {link && (
              <a className="info-link" href={link} target="_blank" rel="noreferrer">
                View on {magic ? 'Scryfall' : 'TCGdex'} ↗
              </a>
            )}
            {tcgplayer && (
              <a
                className="info-link"
                href={tcgplayer.href}
                target="_blank"
                rel="noreferrer"
                title={tcgplayer.exact ? 'This printing on TCGplayer' : 'No TCGplayer ID for this card: searches TCGplayer'}
              >
                {tcgplayer.exact ? 'View on TCGplayer' : 'Find on TCGplayer'} ↗
              </a>
            )}
          </p>
        </div>
      </aside>
    </>
  );
}

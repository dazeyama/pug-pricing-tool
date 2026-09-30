import { useEffect, useState } from 'react';
import CardImage from '../../components/CardImage.jsx';
import BallIcon from '../../components/BallIcon.jsx';
import GameBadge from '../../components/GameBadge.jsx';
import * as scry from '../../lib/scryfall.js';
import { useCardImages } from './useCardImages.js';
import { POKEMON_CARD_BACK, tcgplayerId } from '../../lib/pokemonImages.js';
import { openPopup, popupName } from '../../lib/popup.js';

// Pokémon rarities whose art covers the whole card (TCGdex's names, English
// and Japanese). Their holo shines across the whole card.
const FULL_ART = new Set([
  'full art trainer', 'illustration rare', 'special illustration rare', 'ultra rare', 'hyper rare',
  'mega hyper rare', 'secret rare', 'shiny ultra rare', 'black white rare', 'character rare',
  'character super rare', 'holo rare vmax', 'holo rare vstar', 'shiny rare vmax',
]);

const MAGIC_RARITY = { mythic: 'Mythic rare', common: 'Common', uncommon: 'Uncommon', rare: 'Rare', special: 'Special', bonus: 'Bonus' };

const TCGPLAYER = 'https://www.tcgplayer.com';

/**
 * The card on TCGplayer: its product page when the TCGplayer ID is known
 * (Scryfall for Magic; TCGdex for English Pokémon, the chosen version's own
 * product where it has one: 1st Edition, Poké Ball pattern…), otherwise a TCGplayer
 * search (Japanese Pokémon, which TCGdex has no IDs for; searched by
 * `searchName`, the English name where there is one).
 * @returns {{ href: string, exact: boolean }|null}  null while the Pokémon card is still loading
 */
function tcgplayerLink(c, magic, pokemon, pokemonVersion, searchName, finish) {
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
  const id = pokemonVersion?.tcgplayerId ?? tcgplayerId(pokemon.card);
  if (id) return { href: `${TCGPLAYER}/product/${id}`, exact: true };
  return c.lang === 'ja'
    ? search('pokemon-japan', `${searchName} ${c.number}`)
    : search('pokemon', `${c.name} ${c.number}`);
}

const CARDMARKET = 'https://www.cardmarket.com/en';

/**
 * The card on Cardmarket (owner, 2026-09-29). Cardmarket blocks a bare
 * product link (`Products?idProduct=<id>`: "Sorry, you have been blocked",
 * even in a normal browser), so Magic uses Scryfall's own Cardmarket link
 * (purchase_uris.cardmarket, which works), and Pokémon a Cardmarket search
 * by name and collector number, which Cardmarket's search matches best
 * (English for Japanese cards: it finds nothing for Japanese text).
 * @returns {{ href: string, exact: boolean }|null}
 */
function cardmarketLink(c, magic, searchName) {
  if (magic?.purchase_uris?.cardmarket) return { href: magic.purchase_uris.cardmarket, exact: true };
  const game = magic ? 'Magic' : 'Pokemon';
  const name = magic ? magic.name : `${searchName} ${c.number ?? ''}`;
  return { href: `${CARDMARKET}/${game}/Products/Search?searchString=${encodeURIComponent(name.trim())}`, exact: false };
}

/**
 * The selected card, large, with its info panel beside it (spec 8.4).
 * `pokemon` is the shared full-card detail (usePokemonDetail); `finish` the
 * chosen Magic finish; `pokemonVersion` the chosen Pokémon version (shine,
 * finish label, and the Poké Ball / Master Ball badge).
 */
export default function SelectedCard({ candidate: c, typedName, englishName, pokemon, finish, pokemonVersion }) {
  const pokemonFinish = pokemonVersion?.finish;
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
          <div className="finish-line" />
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
  // What to search other sites for: Japanese cards by their English name
  // (Pokédex number), else what was typed, else the card's own name.
  const searchName = c.lang === 'ja' ? englishName || typedName || c.name : c.name;
  const tcgplayer = tcgplayerLink(c, magic, pokemon, pokemonVersion, searchName, finish);
  const cardmarket = cardmarketLink(c, magic, searchName);
  const name = flippable ? magic.card_faces[face].name : c.name;
  // Foil sheen (spec 8.4): the whole card for Magic foil or etched; for
  // Pokémon, the art window for holo and everything but it for reverse holo.
  // Cards from before 2003 have a smaller art window.
  const era = (pokemon.info?.releaseDate ?? c.releasedAt ?? '9999') < '2003' ? ' vintage' : '';
  // Full art: by rarity, or Trainer Gallery / Galarian Gallery numbers.
  const fullArt = !magic && (FULL_ART.has(String(pokemon.card?.rarity ?? '').toLowerCase())
    || /^(tg|gg)\d/i.test(c.number));
  const shine = magic
    ? (finish === 'foil' || finish === 'etched' ? 'foil' : null)
    : pokemonFinish === 'holo' ? (fullArt ? 'pokemon-full' : `holo${era}`)
      : pokemonFinish === 'reverse' ? `reverse${era}` : null;
  // Poké Ball / Master Ball pattern reverse holos get a badge and say so.
  const ball = pokemonFinish === 'reverse'
    ? ['pokeball', 'masterball'].find((b) => pokemonVersion?.treatments?.includes(`${b}-pattern`))
    : null;
  const ballName = { pokeball: 'Poké Ball', masterball: 'Master Ball' }[ball];
  const finishTag = magic
    ? { foil: 'FOIL', etched: 'ETCHED FOIL' }[finish]
    : { holo: 'HOLO', reverse: ballName ? `REVERSE HOLO · ${ballName.toUpperCase()}` : 'REVERSE HOLO' }[pokemonFinish];
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
            shine={shine}
            alt={c.name}
            name={c.name}
            number={c.number}
          />
          {ball && (
            <BallIcon kind={ball} className="pattern-badge" title={`${ballName} pattern reverse holo`} />
          )}
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
        {/* The finish, named under the card: always one line, always there so
            the card never moves when it appears. */}
        <div className="finish-line" style={{ '--tag-len': finishTag ? finishTag.length + 2 : 1 }}>
          {finishTag && <span className="finish-tag">✦ {finishTag}</span>}
        </div>
      </div>

      {/* A fixed height for every card (see .area-info), so the suggestions
          below never shift: one line each, long text ends in "…". */}
      <aside className="area-info">
        <div className="card-info">
          <h2 className="info-name" title={englishName ? `${name} (${englishName})` : name}>
            {name}
            {englishName && <span className="info-en">{englishName}</span>}
          </h2>
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
            {!latin && typedName && !englishName && <span className="info-typed" title="What you typed">{typedName}</span>}
            {pokemon.card?.regulationMark && (
              <span className="info-reg">Regulation <strong>{pokemon.card.regulationMark}</strong></span>
            )}
          </p>
          {/* "View on" / "Find on" drop out when the box is too narrow for
              all three links (price.css). Each opens in its site's reused
              pop-up window (lib/popup.js). */}
          <p className="info-links">
            {link && (
              <a
                className="info-link"
                href={link}
                target={popupName(magic ? 'scryfall' : 'tcgdex')}
                referrerPolicy="no-referrer"
                onClick={(e) => openPopup(e, magic ? 'scryfall' : 'tcgdex')}
              >
                <span className="link-verb">View on </span>{magic ? 'Scryfall' : 'TCGdex'} ↗
              </a>
            )}
            {tcgplayer && (
              <a
                className="info-link"
                href={tcgplayer.href}
                target={popupName('tcgplayer')}
                referrerPolicy="no-referrer"
                onClick={(e) => openPopup(e, 'tcgplayer')}
                title={tcgplayer.exact ? 'This printing on TCGplayer' : 'No TCGplayer ID for this card: searches TCGplayer'}
              >
                <span className="link-verb">{tcgplayer.exact ? 'View on ' : 'Find on '}</span>TCGplayer ↗
              </a>
            )}
            {cardmarket && (
              <a
                className="info-link"
                href={cardmarket.href}
                target={popupName('cardmarket')}
                referrerPolicy="no-referrer"
                onClick={(e) => openPopup(e, 'cardmarket')}
                title={cardmarket.exact ? 'This printing on Cardmarket (Europe)' : 'Searches Cardmarket (Europe) for this card by name'}
              >
                <span className="link-verb">{cardmarket.exact ? 'View on ' : 'Find on '}</span>Cardmarket ↗
              </a>
            )}
          </p>
        </div>
      </aside>
    </>
  );
}

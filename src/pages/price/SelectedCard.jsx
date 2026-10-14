import { useEffect, useState } from 'react';
import CardImage from '../../components/CardImage.jsx';
import BallIcon from '../../components/BallIcon.jsx';
import FirstEditionStamp from '../../components/FirstEditionStamp.jsx';
import CardZoom from './CardZoom.jsx';
import GameBadge from '../../components/GameBadge.jsx';
import * as scry from '../../lib/scryfall.js';
import { useCardImages } from './useCardImages.js';
import { useFirstEditionStamp } from './useFirstEditionStamp.js';
import { POKEMON_CARD_BACK, tcgplayerId } from '../../lib/pokemonImages.js';
import { openPopup, popupName } from '../../lib/popup.js';
import {
  BASE_SET_ART_FRAME, classicFrame, frameEra, isFullArt, isFullPromo, isRuleBox, needsBaseSetShadow,
} from '../../lib/pokemonFrames.js';
import { isPlayStamp } from '../../lib/justtcgCards.js';
import { isPokemonCenterStamp } from '../../lib/printings.js';
import { drawnStampBox, firstEditionMode } from '../../lib/firstEditionStamp.js';

const MAGIC_RARITY = { mythic: 'Mythic rare', common: 'Common', uncommon: 'Uncommon', rare: 'Rare', special: 'Special', bonus: 'Bonus' };

const TCGPLAYER = 'https://www.tcgplayer.com';
// The Play! Pokémon logo (owner's image, 2026-10-11), for the Play! Pokémon stamped version.
const PLAY_LOGO = `${import.meta.env.BASE_URL}play-pokemon.webp`;
// The Pokémon Center emblem (from the owner's logo, 2026-10-11), for its stamped version.
const CENTER_LOGO = `${import.meta.env.BASE_URL}pokemon-center.webp`;

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

/** A rectangle given as fractions of the card picture, as CSS percentages. */
const percentBox = ({ left, top, width, height }) => ({
  left: `${left * 100}%`, top: `${top * 100}%`, width: `${width * 100}%`, height: `${height * 100}%`,
});

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
 * finish label, the Poké Ball / Master Ball badge, and the 1st Edition stamp:
 * `hasFirstEdition` when one of the card's versions is 1st Edition).
 */
export default function SelectedCard({ candidate: c, typedName, englishName, pokemon, finish, pokemonVersion, hasFirstEdition = false }) {
  const pokemonFinish = pokemonVersion?.finish;
  const [face, setFace] = useState(0);
  // The card, large, with a magnifying glass (CardZoom): where the click that opened it was.
  const [zoom, setZoom] = useState(null);
  const pokemonImages = useCardImages(c);   // TCGdex's, or a backup when it has none
  useEffect(() => {
    setFace(0);
    setZoom(null);
  }, [c?.key]);
  // The 1st Edition stamp (owner, 2026-10-12): TCGdex's vintage scans carry
  // it, but Unlimited is picked by default, so it's painted out; picked 1st
  // Edition on a scan without one, it's drawn on (lib/firstEditionStamp.js).
  const firstEdition = Boolean(pokemonVersion?.firstEdition);
  const stamp = c ? firstEditionMode({
    game: c.game, lang: c.lang, hasFirstEdition, firstEdition,
    category: pokemon.card?.category, image: pokemonImages.image,
  }) : null;
  const stampFound = useFirstEditionStamp(stamp ? pokemonImages.image : null, stamp?.layout, stamp?.shift);

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
  const rarity = magic ? MAGIC_RARITY[magic.rarity] ?? magic.rarity : pokemon.card?.rarity ?? c.rarity;
  const size = c.printedSize ?? pokemon.card?.set?.cardCount?.official ?? null;
  const link = magic ? magic.scryfall_uri : pokemon.page;
  // What to search other sites for: Japanese cards by their English name
  // (Pokédex number), else what was typed, else the card's own name.
  const searchName = c.lang === 'ja' ? englishName || typedName || c.name : c.name;
  const tcgplayer = tcgplayerLink(c, magic, pokemon, pokemonVersion, searchName, finish);
  const cardmarket = cardmarketLink(c, magic, searchName);
  const name = flippable ? magic.card_faces[face].name : c.name;
  // Foil sheen (spec 8.4): the whole card for Magic foil or etched; for
  // Pokémon, the art window for holo and everything but it for reverse holo,
  // where the art window is the card's frame era's (owner, 2026-09-29).
  // A Classic Collection reprint has its original's frame (owner, 2026-10-09).
  const classic = magic ? null : classicFrame(c.setId, c.number);
  // A Trainer's art window is its own (owner, 2026-10-11): price.css .trainer.
  const trainer = !magic && !classic && pokemon.card?.category === 'Trainer';
  // The oldest Japanese cards, found on TCGplayer by a "No." search (owner,
  // 2026-10-11: Neo Premium File 1's Typhlosion): 1996–2001, the vintage
  // frame, so the 1999 mask fits them on TCGplayer's scans.
  const vintageJp = !magic && c.source === 'justtcg' && c.lang === 'ja' && /^No\.\s*\d/.test(String(c.number ?? ''));
  const frame = classic && classic !== 'full' ? classic
    : vintageJp ? '1999' : frameEra(pokemon.info?.releaseDate ?? c.releasedAt);
  const era = ` era-${frame}${trainer ? ' trainer' : ''}`;
  // Full art (pokemonFrames.js): by rarity, special numbers, or a secret
  // rare's number. Always the whole-card shine, whatever finish is listed:
  // every full art is foil (owner, 2026-10-09).
  const fullArt = !magic && (classic === 'full' || isFullArt({
    rarity: pokemon.card?.rarity ?? c.rarity,
    number: c.number,
    printedSize: size,
    setName: pokemon.card?.set?.name ?? c.setName,
    releaseDate: pokemon.info?.releaseDate ?? c.releasedAt,
  }));
  // Rule-box Pokémon (ex, V, VMAX, VSTAR, GX…) shine across the whole card
  // too, holo or reverse: the art-window mask doesn't fit their frames
  // (owner, 2026-09-29).
  const ruleBox = !magic && isRuleBox(pokemon.card, c.name);
  // A card found through TCGplayer (JustTCG: one TCGdex lacks): no frame
  // known to fit a mask to, so a holo or reverse holo shines across the
  // whole card (owner, 2026-10-09). A TCGplayer-only version of a TCGdex
  // card (Gengar's Cosmos Holo) keeps its card's mask, as before; so does a
  // vintage Japanese one, with the 1999 mask (above).
  const fromTcgplayer = !magic && c.source === 'justtcg' && !vintageJp;
  // A holo promo from Scarlet & Violet on (2023-03-31): the whole card too,
  // the way its promos are printed (owner, 2026-10-11). Reverse holos keep their mask.
  const promoFull = !magic && pokemonFinish === 'holo' && isFullPromo({
    rarity: pokemon.card?.rarity ?? c.rarity,
    releaseDate: pokemon.info?.releaseDate ?? c.releasedAt,
  });
  const whole = ruleBox || fromTcgplayer || promoFull;
  const shine = magic
    ? (finish === 'foil' || finish === 'etched' ? 'foil' : null)
    : fullArt ? 'pokemon-full'
      : pokemonFinish === 'holo' ? (whole ? 'pokemon-full' : `holo${era}`)
        : pokemonFinish === 'reverse' ? (whole ? 'pokemon-full' : `reverse${era}`) : null;
  // Poké Ball / Master Ball pattern reverse holos get a badge and say so.
  const ball = pokemonFinish === 'reverse'
    ? ['pokeball', 'masterball'].find((b) => pokemonVersion?.treatments?.includes(`${b}-pattern`))
    : null;
  const ballName = { pokeball: 'Poké Ball', masterball: 'Master Ball' }[ball];
  // The Play! Pokémon stamp, any finish: its logo where a ball's badge goes (owner, 2026-10-11).
  const playStamp = !magic && !ball && isPlayStamp(pokemonVersion);
  // The Pokémon Center stamp, the same way (owner, 2026-10-11).
  const centerStamp = !magic && !ball && !playStamp && isPokemonCenterStamp(pokemonVersion);
  // 1st Edition is named under the card too, after the finish (owner, 2026-10-12).
  const finishTag = magic
    ? { foil: 'FOIL', etched: 'ETCHED FOIL' }[finish]
    : [{ holo: 'HOLO', reverse: ballName ? `REVERSE HOLO · ${ballName.toUpperCase()}` : 'REVERSE HOLO' }[pokemonFinish],
      firstEdition && '1ST EDITION'].filter(Boolean).join(' · ') || undefined;
  // Base Set's art-frame shadow on its Unlimited prints (owner, 2026-10-12):
  // TCGdex's scans are the shadowless 1st Edition ones (pokemonFrames.js).
  const shadow = !magic && needsBaseSetShadow({
    setId: c.setId, lang: c.lang, category: pokemon.card?.category, image, version: pokemonVersion,
  });
  // The stamp painted out (Unlimited), or drawn on a scan without one (1st Edition).
  let stampOverlay = null;
  if (stamp && stampFound) {
    if (stamp.mode === 'hide' && stampFound.patch) {
      stampOverlay = <img className="stamp-patch" src={stampFound.patch} alt="" style={percentBox(stampFound.at)} />;
    } else if (stamp.mode === 'show' && !stampFound.stamped) {
      stampOverlay = <FirstEditionStamp className="stamp-drawn" style={percentBox(drawnStampBox(stamp.layout, stamp.shift))} />;
    }
  }
  const overlay = shadow || stampOverlay ? (
    <>
      {shadow && (
        <span
          className="art-shadow"
          style={percentBox({
            left: BASE_SET_ART_FRAME.left,
            top: BASE_SET_ART_FRAME.top,
            width: BASE_SET_ART_FRAME.right - BASE_SET_ART_FRAME.left,
            height: BASE_SET_ART_FRAME.bottom - BASE_SET_ART_FRAME.top,
          })}
        />
      )}
      {stampOverlay}
    </>
  ) : null;
  // The picture with everything laid on it, here and enlarged (CardZoom),
  // where Magic's is Scryfall's PNG: bigger and sharper, for small print.
  const picture = (large) => {
    const png = large && magic ? scry.cardImage(magic, 'png', face) : null;
    return (
      <>
        {/* Keyed by the image too: a backup image arriving later starts a fresh load. */}
        <CardImage
          key={`${c.key}:${face}:${png ?? image ?? 'none'}`}
          thumb={png ? image : thumb}
          image={png ?? image}
          back={c.game === 'pokemon' ? POKEMON_CARD_BACK : undefined}
          loading={!magic && pokemonImages.status === 'loading'}
          shine={shine}
          overlay={overlay}
          alt={c.name}
          name={c.name}
          number={c.number}
        />
        {ball && (
          <BallIcon kind={ball} className="pattern-badge" title={`${ballName} pattern reverse holo`} />
        )}
        {playStamp && (
          <img src={PLAY_LOGO} className="pattern-badge play-badge" alt="Play! Pokémon stamp" title="Play! Pokémon stamp" />
        )}
        {centerStamp && (
          <img src={CENTER_LOGO} className="pattern-badge" alt="Pokémon Center stamp" title="Pokémon Center stamp" />
        )}
      </>
    );
  };
  // Clicking the card opens it large, once it has a picture to show.
  const zoomable = Boolean(image || thumb) && !(!magic && pokemonImages.status === 'loading');
  // A Japanese name staff can't read gets the English name they typed beside it.
  const latin = /^[\p{Script=Latin}\p{N}\p{P}\p{Zs}\p{S}]*$/u.test(c.name);

  return (
    <>
      <div className="area-card">
        <div className="stage-label">Selected card</div>
        <div
          className={`card-box${zoomable ? ' zoomable' : ''}`}
          onClick={zoomable ? (e) => setZoom({ x: e.clientX, y: e.clientY }) : undefined}
        >
          {picture(false)}
          {flippable && (
            <button
              type="button"
              className="flip-btn"
              title="Show the other face"
              onClick={(e) => {
                e.stopPropagation();   // flips it, doesn't open it large
                setFace((f) => 1 - f);
              }}
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
      {zoom && (
        <CardZoom name={name} subtitle={englishName} at={zoom} onClose={() => setZoom(null)}>
          {picture(true)}
        </CardZoom>
      )}

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
            {/^No\./.test(c.number ?? '') ? c.number : `#${c.number}`}{size ? ` / ${size}` : ''}
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

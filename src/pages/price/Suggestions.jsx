import { useState } from 'react';
import GameBadge from '../../components/GameBadge.jsx';
import CardLoading from '../../components/CardLoading.jsx';
import { useCardImages } from './useCardImages.js';
import { POKEMON_CARD_BACK } from '../../lib/pokemonImages.js';

/** Suggestions shown at once: 2 rows of 5 (owner's layout, 2026-09-29). */
export const ROW = 10;

const RARITIES = new Set(['common', 'uncommon', 'rare', 'mythic', 'special', 'bonus']);

/**
 * Shown on hover over the spot a Magic card prints its set symbol (right end
 * of the type line): the symbol, large, in its rarity colour. With no symbol
 * (every Pokémon card, or a Magic icon that won't load) a small chip with the
 * set code instead, in the same colour; slate when the rarity isn't known.
 */
function SetMark({ c }) {
  const [broken, setBroken] = useState(false);
  const rarity = RARITIES.has(c.rarity) ? c.rarity : 'unknown';
  if (c.setIcon && !broken) {
    // A CSS mask loads the SVG cross-origin. Scryfall's SVG host only sends
    // its CORS header when asked and doesn't mark the answer "Vary: Origin",
    // so a copy cached by a plain <img> (the info panel's set icon) would
    // break the mask. Masks get their own address, always fetched with CORS.
    const src = `${c.setIcon}${c.setIcon.includes('?') ? '&' : '?'}mask=1`;
    // Two layers of the same shape: a solid shadow edge, then the symbol in
    // its rarity colour. No CSS filter: under the hover's scaling Chrome drew
    // a filter's outline offset from the symbol.
    return (
      <span className={`thumb-symbol r-${rarity}`} style={{ '--icon': `url("${src}")` }} aria-hidden="true">
        <span className="thumb-symbol-edge" />
        <span className="thumb-symbol-glyph" />
        {/* A mask can't report a failed load; this hidden copy, fetched the
            same way, can, and swaps in the set-code chip. */}
        <img className="thumb-symbol-probe" src={src} crossOrigin="anonymous" alt="" onError={() => setBroken(true)} />
      </span>
    );
  }
  return <span className={`thumb-chip r-${rarity}`} aria-hidden="true">{c.setCode}</span>;
}

/** One suggestion: thumbnail, with the game badge and "SET #num" beneath. */
export function Thumb({ c, highlighted, selected, onPick }) {
  const { thumb, status } = useCardImages(c);
  // An image that fails to load shows the card back, never a broken-image icon.
  const [failed, setFailed] = useState(null);
  const [loaded, setLoaded] = useState(null);
  const showImage = thumb && failed !== thumb;
  // "Loading…" while a backup is being looked for or the image is downloading.
  const loading = status === 'loading' || (showImage && loaded !== thumb);
  return (
    <button
      type="button"
      className={`thumb${highlighted ? ' highlight' : ''}${selected ? ' selected' : ''}`}
      title={`${c.name} · ${c.setName} (${c.setCode}) #${c.number}`}
      onClick={() => onPick(c)}
    >
      <span className="thumb-img">
        {showImage ? (
          <img
            src={thumb}
            alt={c.name}
            loading="lazy"
            onLoad={() => setLoaded(thumb)}
            onError={() => setFailed(thumb)}
          />
        ) : status === 'loading' ? null : c.game === 'pokemon' ? (
          <img src={POKEMON_CARD_BACK} alt={`${c.name} (no picture)`} />
        ) : (
          <span className="thumb-back">{c.name}</span>
        )}
        {loading && <CardLoading />}
        <SetMark c={c} />
      </span>
      {/* The game badge sits in the caption, not on the card: the top covers the
          name, and Scryfall's rules keep overlays off the bottom strip. */}
      <span className="thumb-label">
        <GameBadge game={c.game} />
        <span className="thumb-label-text">{c.setCode} #{c.number}</span>
      </span>
    </button>
  );
}

const SOURCE = { mtg: 'Scryfall', pokemon: 'TCGdex' };

/** Why the grid is empty, or a source that isn't answering (spec 8.3 states). */
function Status({ search, lang }) {
  const bits = [];
  for (const game of ['mtg', 'pokemon']) {
    const s = search.games[game].status;
    if (s === 'retrying' || s === 'failed') {
      bits.push(
        <span key={game} className="source-down">
          <GameBadge game={game} off />
          {s === 'retrying' ? `${SOURCE[game]} didn't respond — retrying…` : `${SOURCE[game]} isn't responding. Try again in a minute.`}
        </span>,
      );
    }
  }
  // A game switched off with MTG | PKM: say so when nothing matches.
  const off = ['mtg', 'pokemon'].find((g) => search.games[g].status === 'off');
  if (search.searching) {
    bits.unshift(<span key="busy" className="searching"><span className="spinner" aria-hidden="true" /> Searching…</span>);
  } else if (search.query && search.settled && !search.candidates.length) {
    bits.unshift(
      <span key="none" className="no-match">
        No cards match. Check the number and set code.
        {search.tried && <> Also tried <strong>{search.tried}</strong>.</>}
        {off && <> Only {off === 'mtg' ? 'Pokémon' : 'Magic'} is being searched ({off === 'mtg' ? 'MTG' : 'PKM'} is off).</>}
      </span>,
    );
  }
  const p = search.parsed;
  if (lang === 'ja' && off !== 'pokemon' && search.query && p && !p.number && !p.setCode) {
    bits.push(<span key="jp" className="jp-hint">Japanese Pokémon: search by number and set code, e.g. 25/165 SV2a.</span>);
  }
  return <div className="suggest-status" aria-live="polite">{bits}</div>;
}

/**
 * The suggestions (spec 8.3): up to 10 thumbnails in 2 rows of 5, with
 * "… show all (N)" on the line above when there are more.
 */
export default function Suggestions({ search, lang, highlight, selectedKey, onPick, onShowAll }) {
  const visible = search.candidates.slice(0, ROW);
  const more = search.candidates.length > ROW;
  const count = search.hasMore ? `${search.candidates.length}+` : search.candidates.length;

  return (
    <div className="area-thumbs">
      <div className="suggest-head">
        <Status search={search} lang={lang} />
        {more && (
          <button
            type="button"
            className={`show-all${highlight === visible.length ? ' highlight' : ''}`}
            onClick={onShowAll}
          >
            … show all ({count})
          </button>
        )}
      </div>
      <div className="thumbs">
        {visible.map((c, i) => (
          <Thumb key={c.key} c={c} highlighted={highlight === i} selected={c.key === selectedKey} onPick={onPick} />
        ))}
        {/* The rest of the 10 slots as faded card shapes, so the grid never looks empty. */}
        {Array.from({ length: ROW - visible.length }, (_, i) => (
          <span key={`slot-${i}`} className="thumb thumb-slot" aria-hidden="true">
            <span className="thumb-img" />
            <span className="thumb-label">&nbsp;</span>
          </span>
        ))}
      </div>
    </div>
  );
}

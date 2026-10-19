import { useEffect, useState } from 'react';
import GameBadge from '../../components/GameBadge.jsx';
import CardLoading from '../../components/CardLoading.jsx';
import { useCardImages } from './useCardImages.js';
import { POKEMON_CARD_BACK } from '../../lib/pokemonImages.js';
import { BulkThumb } from './Bulk.jsx';
import { GAME_LABELS, GAME_NAMES, otherGame } from '../../lib/games.js';

/** Suggestions shown at once: 2 rows of 5 (owner's layout, 2026-09-29). */
export const ROW = 10;
// Shorter windows show one row of 5, bigger (owner, 2026-10-01: room for
// Finish and Details). Since the laptop pass (owner, 2026-10-14) a small
// window is drawn down to 80% (lib/uiScale.js), which lays a 1200 × 650
// window out like an 812px-tall one: room for both rows at the size one row
// had (the column's width, not its height, sets it). So one row only on a
// window shorter than that, where even 80% leaves less than 812px.
const SHORT = '(max-height: 649px)';
/** That media query, or null where there's none (the tests, under Node). */
const shortQuery = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(SHORT) : null);

/**
 * How many suggestions show: two rows of `cols` (5, or 4 on a laptop's
 * window: lib/thumbGrid.js), or one row of 5 on a shorter window; follows
 * resizing.
 */
export function useSuggestionCount(cols = 5) {
  const [short, setShort] = useState(() => Boolean(shortQuery()?.matches));
  useEffect(() => {
    const query = shortQuery();
    if (!query) return undefined;
    const onChange = (e) => setShort(e.matches);
    query.addEventListener('change', onChange);
    setShort(query.matches);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return short ? 5 : 2 * cols;
}

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

/**
 * One suggestion: thumbnail, with the game badge and "SET #num" beneath; a
 * bulk item (docs/TEAM_FEEDBACK.md 5.4) as its stack of card backs.
 */
export function Thumb(props) {
  return props.c.bulk ? <BulkThumb {...props} /> : <CardThumb {...props} />;
}

/**
 * One card. Clicking picks it; right-clicking searches its name, to see
 * every printing of the card (owner, 2026-09-29).
 */
function CardThumb({ c, highlighted, selected, onPick, onSearchName }) {
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
      title={`${c.name} · ${c.setName} (${c.setCode}) #${c.number}\nRight-click: every printing of ${c.name}`}
      onClick={() => onPick(c)}
      onContextMenu={(e) => {
        if (!onSearchName) return;
        e.preventDefault();
        onSearchName(c.name);
      }}
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
        {/* A Japanese-only Magic printing among the English ones (owner, 2026-10-16). */}
        {c.game === 'mtg' && c.lang === 'ja' && <span className="tag-jp">JP</span>}
        <span className="thumb-label-text">{c.setCode} {/^No\./.test(c.number ?? '') ? c.number : `#${c.number}`}</span>
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
    // Too many requests (429): say so, not "didn't respond" (owner, 2026-10-09).
    const limited = search.games[game].limited;
    if (s === 'retrying' || s === 'failed') {
      let text = s === 'retrying' ? `${SOURCE[game]} didn't respond — retrying…` : `${SOURCE[game]} isn't responding. Try again in a minute.`;
      if (limited) {
        text = s === 'retrying'
          ? `${SOURCE[game]} asked for fewer searches — slowing down and retrying…`
          : `${SOURCE[game]} is limiting searches right now. Wait a minute, then search again.`;
      }
      bits.push(
        <span key={game} className="source-down">
          <GameBadge game={game} off />
          {text}
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
        {off && <> Only {GAME_NAMES[otherGame(off)]} is being searched ({GAME_LABELS[off]} is off).</>}
      </span>,
    );
  }
  const p = search.parsed;
  if (lang === 'ja' && off !== 'pokemon' && search.query && p && !p.number && !p.setCode && !p.dexNo) {
    bits.push(
      <span key="jp" className="jp-hint">
        Japanese Pokémon: search by number and set code, e.g. 25/165 SV2a; the oldest sets (1996–2001, no set
        numbers) by the Pokédex number printed on them, e.g. No. 32.
      </span>,
    );
  }
  return <div className="suggest-status" aria-live="polite">{bits}</div>;
}

/**
 * The suggestions (spec 8.3): up to 10 thumbnails in 2 rows of 5 (`cols`: 4
 * on a laptop's window, 8 in all). On the line above: the sort toggle
 * (newest / oldest first) on the left, "… show all (N)" on the right when
 * there are more.
 */
export default function Suggestions({
  search, candidates = search.candidates, lang, highlight, selectedKey, onPick, onSearchName, onShowAll, oldest, onOldest,
  count: shown = ROW, cols = 5,
}) {
  // `candidates`: the order to show, the card being edited pinned first (decision 324); the search's otherwise.
  const visible = candidates.slice(0, shown);
  const more = candidates.length > shown;
  const count = search.hasMore ? `${candidates.length}+` : candidates.length;

  return (
    <div className="area-thumbs">
      <div className="suggest-head">
        <button
          type="button"
          className={`sort-toggle${oldest ? ' reversed' : ''}`}
          aria-pressed={oldest}
          title={oldest
            ? 'Oldest printings first. Click for newest first.'
            : 'Newest printings first. Click for oldest first.'}
          onClick={() => onOldest(!oldest)}
        >
          <span aria-hidden="true">{oldest ? '↑' : '↓'}</span> {oldest ? 'Oldest first' : 'Newest first'}
        </button>
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
      <div className={`thumbs${shown <= 5 ? ' one-row' : ''}`} style={shown > 5 ? { '--thumb-cols': cols } : undefined}>
        {visible.map((c, i) => (
          <Thumb
            key={c.key}
            c={c}
            highlighted={highlight === i}
            selected={c.key === selectedKey}
            onPick={onPick}
            onSearchName={onSearchName}
          />
        ))}
        {/* The rest of the 10 slots as faded card shapes, so the grid never looks empty. */}
        {Array.from({ length: shown - visible.length }, (_, i) => (
          <span key={`slot-${i}`} className="thumb thumb-slot" aria-hidden="true">
            <span className="thumb-img" />
            <span className="thumb-label">&nbsp;</span>
          </span>
        ))}
      </div>
    </div>
  );
}

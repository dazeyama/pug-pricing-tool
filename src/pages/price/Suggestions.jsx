import { useState } from 'react';
import GameBadge from '../../components/GameBadge.jsx';

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
    return (
      <span className={`thumb-symbol r-${rarity}`} aria-hidden="true">
        <span className="thumb-symbol-glyph" style={{ '--icon': `url("${c.setIcon}")` }} />
        {/* A CSS mask can't report a failed load; this hidden copy can. */}
        <img className="thumb-symbol-probe" src={c.setIcon} alt="" onError={() => setBroken(true)} />
      </span>
    );
  }
  return <span className={`thumb-chip r-${rarity}`} aria-hidden="true">{c.setCode}</span>;
}

/** One suggestion: thumbnail with its game badge in the corner, "SET #num" beneath. */
export function Thumb({ c, highlighted, selected, onPick }) {
  return (
    <button
      type="button"
      className={`thumb${highlighted ? ' highlight' : ''}${selected ? ' selected' : ''}`}
      title={`${c.name} · ${c.setName} (${c.setCode}) #${c.number}`}
      onClick={() => onPick(c)}
    >
      <span className="thumb-img">
        {c.thumb ? (
          <img src={c.thumb} alt={c.name} loading="lazy" />
        ) : (
          <span className="thumb-back">{c.name}</span>
        )}
        <span className="thumb-badge"><GameBadge game={c.game} /></span>
        <SetMark c={c} />
      </span>
      <span className="thumb-label">{c.setCode} #{c.number}</span>
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
  if (search.searching) {
    bits.unshift(<span key="busy" className="searching"><span className="spinner" aria-hidden="true" /> Searching…</span>);
  } else if (search.query && search.settled && !search.candidates.length) {
    bits.unshift(
      <span key="none" className="no-match">
        No cards match. Check the number and set code.
        {search.tried && <> Also tried <strong>{search.tried}</strong>.</>}
      </span>,
    );
  }
  const p = search.parsed;
  if (lang === 'ja' && search.query && p && !p.number && !p.setCode) {
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

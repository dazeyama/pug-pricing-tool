import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import {
  CATEGORIES, DEFAULT_CATEGORIES, GONE, HEADLINES, MADE, actionsFor, categoryOf, dayHeading, entryDay,
  entryWhen, foldEvents, panelView,
} from '../lib/changelog.js';
import { storeDay } from '../lib/calendar.js';
import { formatMoney } from '../lib/money.js';
import { nameKey } from '../lib/normalize.js';
import GameBadge from '../components/GameBadge.jsx';
import UserTag from '../components/UserTag.jsx';

const PAGE = 20;      // panels per page (CM's CHANGE_PAGE)
const CHUNK = 200;    // entries fetched at a time
// What a panel needs (not the search columns, which only the filter uses).
const COLUMNS = 'seq, at, staff_user_id, staff_user_name, staff_user_color, kind, action, target_id, '
  + 'target_name, games, added, removed, totals, lines, fields, summary';
const GAMES = [
  { value: 'all', label: 'All' },
  { value: 'mtg', label: 'Magic' },
  { value: 'pokemon', label: 'Pokémon' },
];

/**
 * The Changelog tab (spec 12): every recorded change as CM's timeline,
 * newest first, 20 panels a page. Clicking the tab again (a new location)
 * starts it over in its opening state.
 */
export default function ChangelogPage() {
  const { key } = useLocation();
  return <Changelog key={key} />;
}

/** The query for one batch of entries, with every filter applied in Postgres. */
async function fetchBatch({ categories, game, query, target }, offset) {
  let q = supabase
    .from('events')
    .select(COLUMNS, offset === 0 ? { count: 'exact' } : undefined)
    .in('action', actionsFor(categories))
    .order('seq', { ascending: false })
    .range(offset, offset + CHUNK - 1);
  if (game !== 'all') q = q.contains('games', [game]);
  if (target) q = q.eq('target_id', target.id);
  if (query) {
    const digits = query.replace(/\D/g, '');
    if (digits.length >= 3 && !/\p{L}/u.test(query)) {
      // A phone number: its digits in an entry, or any entry for a buy or
      // collection with that phone (a collection's whole history).
      const { data: owners } = await supabase.from('buys').select('id').like('phone', `%${digits}%`).limit(200);
      const ids = (owners ?? []).map((b) => b.id);
      q = q.or([`search_digits.like.*${digits}*`, ...(ids.length ? [`target_id.in.(${ids.join(',')})`] : [])].join(','));
    } else {
      q = q.like('search_text', `%${nameKey(query).replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
    }
  }
  return q;
}

function Changelog() {
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [game, setGame] = useState('all');
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState(null);   // the funnel: { id, name }
  const [page, setPage] = useState(1);
  const [log, setLog] = useState({ events: [], total: null, done: false, loading: true, error: null });
  const [targets, setTargets] = useState(new Map());   // buy/collection id → row, or null if deleted
  const [showFoot, setShowFoot] = useState(false);
  const filterKey = JSON.stringify({ categories, game, query, target: target?.id ?? null });
  const run = useRef(0);

  // The text filter waits for a pause in typing.
  useEffect(() => {
    const t = setTimeout(() => setQuery(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);

  // New filters: start again from the newest entry.
  useEffect(() => {
    const mine = ++run.current;
    setPage(1);
    setLog({ events: [], total: null, done: false, loading: true, error: null });
    (async () => {
      const { data, count, error } = await fetchBatch({ categories, game, query, target }, 0);
      if (mine !== run.current) return;
      if (error) {
        console.error('Loading the changelog failed', error);
        setLog({ events: [], total: 0, done: true, loading: false, error });
        return;
      }
      setLog({ events: data ?? [], total: count ?? 0, done: (data ?? []).length < CHUNK, loading: false, error: null });
    })();
  }, [filterKey]);

  const panels = useMemo(() => foldEvents(log.events), [log.events]);

  // Enough entries for this page and the next: fetch another batch if not.
  useEffect(() => {
    if (log.loading || log.done || panels.length > page * PAGE) return;
    const mine = run.current;
    setLog((l) => ({ ...l, loading: true }));
    (async () => {
      const { data, error } = await fetchBatch({ categories, game, query, target }, log.events.length);
      if (mine !== run.current) return;
      if (error) {
        console.error('Loading the changelog failed', error);
        setLog((l) => ({ ...l, loading: false, done: true }));
        return;
      }
      setLog((l) => ({
        ...l, events: [...l.events, ...(data ?? [])], done: (data ?? []).length < CHUNK, loading: false,
      }));
    })();
  }, [panels.length, page, log.loading, log.done]);

  const shown = panels.slice((page - 1) * PAGE, page * PAGE);
  const views = shown.map((p) => ({ panel: p, view: panelView(p, game) }));
  const pages = Math.max(1, Math.ceil(panels.length / PAGE));
  const hasNext = panels.length > page * PAGE || !log.done;

  // Which targets still exist (deleted ones aren't links), and when each buy
  // was confirmed (its day page).
  useEffect(() => {
    const ids = [...new Set(shown.map((p) => p.events[0].target_id).filter((id) => id && !targets.has(id)))];
    if (!ids.length) return;
    let alive = true;
    supabase.from('buys').select('id, kind, status, confirmed_at').in('id', ids).then(({ data }) => {
      if (!alive) return;
      setTargets((m) => {
        const next = new Map(m);
        for (const id of ids) next.set(id, (data ?? []).find((b) => b.id === id) ?? null);
        return next;
      });
    });
    return () => {
      alive = false;
    };
  }, [shown.map((p) => p.key).join(',')]);

  // The foot row shows only when the page scrolls (spec 12.1).
  useEffect(() => {
    const measure = () => setShowFoot(document.documentElement.scrollHeight > window.innerHeight + 40);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  });

  function goPage(n) {
    setPage(n);
    window.scrollTo({ top: 0 });
  }

  /** Click: only that category. Ctrl+click or right-click: add or remove it; never none. */
  function pickCategory(key, add) {
    setCategories((cs) => {
      if (!add) return [key];
      if (cs.includes(key)) return cs.length > 1 ? cs.filter((c) => c !== key) : cs;
      return [...cs, key];
    });
  }

  const narrowed = target || query || game !== 'all';
  const pager = (
    <div className="ch-pager">
      <button type="button" className="btn small" disabled={page <= 1} onClick={() => goPage(page - 1)}>‹ Newer</button>
      <span className="ch-page">Page {page} of {pages}{log.done ? '' : '+'}</span>
      <button type="button" className="btn small" disabled={!hasNext || (log.loading && panels.length <= page * PAGE)} onClick={() => goPage(page + 1)}>Older ›</button>
    </div>
  );

  // Panels grouped by day; each day starts on the left (CM).
  const days = [];
  for (const item of views) {
    const day = entryDay(item.view.newest);
    if (!days.length || days.at(-1).day !== day) days.push({ day, items: [] });
    days.at(-1).items.push(item);
  }

  return (
    <>
      <div className="panel-head ch-head">
        <div className="panel-title">
          <h2>Changelog</h2>
          <span className="count-badge">{log.total == null ? '…' : `${log.total} ${log.total === 1 ? 'entry' : 'entries'}`}</span>
        </div>
        <div className="kind-toggles" role="group" aria-label="Categories">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`btn small kind-btn k-${c.key}${categories.includes(c.key) ? ' on' : ''}`}
              aria-pressed={categories.includes(c.key)}
              title="Click: only these. Ctrl+click or right-click: add or remove."
              onClick={(e) => pickCategory(c.key, e.ctrlKey || e.metaKey)}
              onContextMenu={(e) => {
                e.preventDefault();
                pickCategory(c.key, true);
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="ch-games" role="group" aria-label="Game">
          {GAMES.map((g) => (
            <button
              key={g.value}
              type="button"
              className={`filter-pill ch-game ${g.value}${game === g.value ? ' active' : ''}`}
              aria-pressed={game === g.value}
              onClick={() => setGame(g.value)}
            >
              {g.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          className="ch-filter-box"
          placeholder="Filter by card, customer or collection…"
          aria-label="Filter the changelog"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {pager}
      </div>

      {narrowed && (
        <div className="change-scope">
          <span>
            Showing{' '}
            {[
              target && <strong key="t">{target.name}</strong>,
              game !== 'all' && <span key="g">{game === 'mtg' ? 'Magic' : 'Pokémon'} entries</span>,
              query && <span key="q">entries matching <strong>{query}</strong></span>,
            ].filter(Boolean).reduce((out, part, i) => (i ? [...out, ', ', part] : [part]), [])}
            {' '}only
          </span>
          <button
            type="button"
            className="btn small"
            onClick={() => {
              setTarget(null);
              setText('');
              setQuery('');
              setGame('all');
            }}
          >
            Show everything
          </button>
        </div>
      )}

      {log.error ? (
        <p className="empty">Couldn't load the changelog: {log.error.message}</p>
      ) : !views.length ? (
        <p className="empty">{log.loading ? 'Loading…' : narrowed ? 'No entries match.' : 'Nothing has been recorded yet.'}</p>
      ) : (
        <div className="timeline">
          {days.map(({ day, items }) => (
            <DayBlock
              key={day}
              items={items}
              targets={targets}
              onFunnel={(first) => {
                setTarget({ id: first.target_id, name: first.target_name });
                window.scrollTo({ top: 0 });
              }}
            />
          ))}
        </div>
      )}

      {showFoot && views.length > 0 && (
        <div className="tl-foot">
          <button type="button" className="btn small" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            ↑ Back to top
          </button>
          {pager}
        </div>
      )}
    </>
  );
}

/** One day: its pill, then its panels alternating left and right from the left. */
function DayBlock({ items, targets, onFunnel }) {
  let side = 0;
  return (
    <>
      <div className="tl-day"><span>{dayHeading(items[0].view.newest)}</span></div>
      {items.map(({ panel, view }) => {
        if (panel.action === 'backup_restored') {
          return (
            <div key={panel.key} className="tl-day tl-milestone">
              <span>{view.first.summary || 'Backup restored'}</span>
            </div>
          );
        }
        const cls = side++ % 2 === 0 ? 'left' : 'right';
        return <Entry key={panel.key} panel={panel} view={view} side={cls} targets={targets} onFunnel={onFunnel} />;
      })}
    </>
  );
}

/** Where an entry's name leads: its buy's day page or its collection; null once deleted. */
function linkFor(first, view, targets) {
  const row = targets.get(first.target_id);
  if (!row) return null;
  if (first.kind === 'buy' && row.kind === 'walk_in' && row.status === 'confirmed') {
    // The day the buy was confirmed, not the day of this change (owner, 2026-09-29).
    // The game on show (Magic first), so the Pokémon filter leads to the Pokémon page.
    const g = view.games[0] ?? first.games?.[0] ?? 'mtg';
    return `/calendar/${g}/${storeDay(new Date(row.confirmed_at))}`;
  }
  if (first.kind === 'collection' && row.kind === 'collection') return `/collections/${row.id}`;
  return null;
}

/** One panel on the line (spec 12.2). */
function Entry({ panel, view, side, targets, onFunnel }) {
  const { first } = view;
  const category = categoryOf(first.action);
  const made = MADE.has(first.action);
  const gone = GONE.has(first.action);
  const to = linkFor(first, view, targets);
  const known = targets.has(first.target_id);
  // A folded run says what it adds up to: "7 cards added."
  const n = view.added || view.removed;
  const summary = view.folded ? `${n} card${n === 1 ? '' : 's'} ${view.added ? 'added' : 'removed'}.` : first.summary;
  const t = view.totals;
  const user = first.staff_user_name ? { name: first.staff_user_name, color: first.staff_user_color } : null;
  return (
    <div className={`tl-slot ${side}`}>
      <span className={`tl-dot ${category}${made ? ' created' : ''}${gone ? ' gone' : ''}`} aria-hidden="true" />
      <article className={`cardpanel tl-panel${category === 'actions' ? ' tl-state' : ''}`}>
        <header className="cardpanel-head tl-head">
          <span className="tl-when">{entryWhen(view.newest, view.oldest)}</span>
          <span className={`tl-what${made ? ' made' : ''}${gone ? ' gone' : ''}`}>{HEADLINES[first.action] ?? first.action}</span>
          {first.target_id && (
            <button
              type="button"
              className="icon-btn ch-filter"
              title={`Show only ${first.kind === 'buy' ? 'this buy' : 'this collection'}'s history`}
              aria-label="Show only this history"
              onClick={() => onFunnel(first)}
            >
              <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                <path d="M2 3h12l-4.5 5.2V13l-3 1.2V8.2Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </header>
        <div className="tl-body">
          <div className="tl-title">
            <span className={`ch-kind ${first.kind}`}>{first.kind === 'buy' ? 'Buy' : 'Collection'}</span>
            <strong>
              {to ? <Link to={to}>{first.target_name}</Link>
                : <span title={known ? 'Deleted' : undefined}>{first.target_name}</span>}
            </strong>
            {view.games.map((g) => <GameBadge key={g} game={g} />)}
            <span className="tl-counts">
              {view.added > 0 && <span className="ch-add">+{view.added}</span>}
              {view.added > 0 && view.removed > 0 && ' '}
              {view.removed > 0 && <span className="ch-rem">−{view.removed}</span>}
            </span>
            <UserTag user={user} />
          </div>
          <div className="tl-summary">
            {summary}
            {t && t.market != null && (
              <>
                {' '}· Market {formatMoney(t.market)}
                {t.cash != null && <> · <span className="is-cash">Cash {formatMoney(t.cash)}</span></>}
                {t.credit != null && <> · <span className="is-credit">Credit {formatMoney(t.credit)}</span></>}
              </>
            )}
          </div>
          {(view.rows.length > 0 || view.fields.length > 0) && (
            <div className="tl-rows">
              {view.rows.map((l, i) => (
                <div key={`r${i}`} className="tl-row">
                  <span className={`ch-mark ${l.sign === '+' ? 'add' : 'rem'}`}>{l.sign === '+' ? '+' : '−'}</span>
                  <span className="tl-card">{l.text}</span>
                  {l.unit_price != null && <span className="tl-price">{formatMoney(l.unit_price)}</span>}
                </div>
              ))}
              {view.fields.map((f, i) => (
                <div key={`f${i}`} className="tl-row">
                  <span className="ch-mark field">•</span>
                  <span className="tl-card">
                    <span className="ch-field">{f.field}</span>:{' '}
                    {f.before != null && f.after != null ? (
                      <>{String(f.before)} → {String(f.after)}</>
                    ) : (
                      <>{String(f.after ?? f.before ?? '')}</>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </article>
    </div>
  );
}

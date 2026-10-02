import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { dayDate, storeDay } from '../lib/calendar.js';
import { formatTime } from '../lib/time.js';
import { relativeDay } from '../lib/changelog.js';
import { lineTextWithCondition } from '../lib/lineFormat.js';
import { LINE_LIMIT, MIN_CHARS, flatRows, groupResults, searchArgs } from '../lib/globalSearch.js';
import { statusLabel } from '../pages/collections/status.js';
import { useStaff } from '../state/staff.jsx';
import GameBadge from './GameBadge.jsx';
import UserTag from './UserTag.jsx';
import LinePreview, { previewFor } from './LinePreview.jsx';

// The header's global search (spec 13), in CM's pill style: every stored line
// in a Paid/Ours walk-in buy or collection matching what's typed, or with
// "Show all" every status but drafts (owner, 2026-09-30): collections pinned
// at the top, then buys filed under dates, a panel
// per buy or collection listing its matching cards in full (owner,
// 2026-09-30). ↓/↑ move, Enter opens, Esc closes.
// Opening a result jumps to it and flashes it.
// Much larger on every tab but the pricing screens (owner, 2026-09-29), where
// the main search bar is the focus.

const WAIT_MS = 250;

/**
 * "Today · September 30, 2026", "Yesterday · September 29, 2026", else just
 * "August 17, 2026": no weekdays, Today and Yesterday the only day markers
 * (owner, 2026-09-30).
 */
function dayLabel(section) {
  const relative = relativeDay(section.at);
  const full = dayDate(section.day);
  return relative ? `${relative} · ${full}` : full;
}

// The set codes stored lines use, fetched at most every five minutes.
let codes = { at: 0, set: null };
async function knownCodes() {
  if (codes.set && Date.now() - codes.at < 5 * 60_000) return codes.set;
  const { data, error } = await supabase.rpc('search_set_codes');
  if (error) throw new Error(error.message);
  codes = { at: Date.now(), set: new Set(data ?? []) };
  return codes.set;
}

async function lookUp(args) {
  const { data, error } = await supabase.rpc('global_search', args);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export default function SearchBox({ wide }) {
  const navigate = useNavigate();
  const staff = useStaff();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState({ status: 'idle', sections: [], capped: false, error: null });
  const [active, setActive] = useState(0);
  // Paid/Ours only, or every status (owner, 2026-09-30). Forgotten whenever the
  // results close (a click away, Esc, opening a result): back to Paid/Ours only.
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    if (!open) setShowAll(false);
  }, [open]);
  const wrap = useRef(null);
  const input = useRef(null);
  const results = useRef(null);
  const run = useRef(0);
  // The hovered result's card picture, beside the dropdown (owner, 2026-09-30).
  const [preview, setPreview] = useState(null);
  const hidePreview = useCallback(() => setPreview(null), []);

  // Search after a pause in typing; a newer search wins.
  useEffect(() => {
    const query = text.trim();
    const mine = ++run.current;
    if (query.length < MIN_CHARS) {
      setFound({ status: 'idle', sections: [], capped: false, error: null });
      return undefined;
    }
    setFound((f) => ({ ...f, status: 'loading', error: null }));
    const timer = setTimeout(async () => {
      try {
        const plan = searchArgs(query, await knownCodes());
        let lines = plan ? await lookUp({ ...plan.args, p_all: showAll }) : [];
        if (plan && !lines.length && plan.retry) lines = await lookUp({ ...plan.retry, p_all: showAll });
        if (mine !== run.current) return;
        setFound({ status: 'done', sections: groupResults(lines), capped: lines.length >= LINE_LIMIT, error: null });
        setActive(0);
      } catch (e) {
        if (mine !== run.current) return;
        console.error('Global search failed', e);
        setFound({ status: 'error', sections: [], capped: false, error: e.message });
      }
    }, WAIT_MS);
    return () => clearTimeout(timer);
  }, [text, showAll]);

  // A click anywhere else closes the results.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!wrap.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const rows = useMemo(() => flatRows(found.sections), [found.sections]);
  const index = useMemo(() => new Map(rows.map((r, i) => [r.key, i])), [rows]);

  // Keep the highlighted row in view as ↓/↑ move it.
  useEffect(() => {
    if (!open) return;
    wrap.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  /** Jump to a result: a buy's day page, or a collection's screen, flashing what matched. */
  function go(row) {
    if (!row) return;
    setOpen(false);
    input.current?.blur();
    if (row.kind === 'walk_in') {
      navigate(`/calendar/${row.game}/${storeDay(row.at)}`,
        { state: { focus: { buyId: row.buyId, lineIds: row.lineIds } } });
    } else {
      navigate(`/collections/${row.buyId}`, { state: { hits: row.lineIds } });
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
      } else {
        input.current?.blur();
      }
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!rows.length) return;
      e.preventDefault();
      setOpen(true);
      setActive((i) => (e.key === 'ArrowDown' ? Math.min(i + 1, rows.length - 1) : Math.max(i - 1, 0)));
      return;
    }
    if (e.key === 'Enter' && open && rows[active]) {
      e.preventDefault();
      go(rows[active]);
    }
  }

  const showing = open && text.trim().length >= MIN_CHARS;
  useEffect(() => {
    if (!showing) setPreview(null);
  }, [showing]);

  /** One buy or collection: where it is, then each matching card as entered. */
  function renderRow(row) {
    const i = index.get(row.key);
    const buy = row.kind === 'walk_in';
    const user = buy ? staff.byId(row.confirmedBy) : null;
    // Coloured by what it is (owner, 2026-10-01): a buy by its game, a
    // collection by its kind (System, Projects, Collections).
    const tint = buy ? ` game-${row.game}` : ` kind-${row.collectionKind ?? 'collection'}`;
    // Completed (an exported buy, a Completed collection; Show all only): partly faded (owner, 2026-09-30).
    const done = buy ? row.completed : row.status === 'completed';
    return (
      <button
        key={row.key}
        type="button"
        role="option"
        aria-selected={i === active}
        data-idx={i}
        className={`result-btn${i === active ? ' active' : ''}${tint}${done ? ' done' : ''}`}
        onMouseEnter={(e) => {
          setActive(i);
          setPreview(previewFor(row.entries[0].line.image_url, e.currentTarget, results.current, 'left'));
        }}
        onMouseLeave={hidePreview}
        onMouseDown={(e) => e.preventDefault()}   // keep the typing in the box
        onClick={() => go(row)}
      >
        {/* Where it is (owner, 2026-09-30), then each card as entered. */}
        <span className="result-where">
          <GameBadge game={row.game} />
          {buy ? (
            <>
              Buy {row.number} · <UserTag user={user} /> · {formatTime(row.at)}
              {row.completed && <span className="status-chip tone-completed result-chip">Completed</span>}
            </>
          ) : (
            <><strong>{row.customerName}</strong> · <span className="result-status">{statusLabel(row.status)}</span></>
          )}
        </span>
        {row.entries.map((entry) => (
          <span
            key={entry.key}
            className="result-entry"
            onMouseEnter={(e) => setPreview(previewFor(entry.line.image_url, e.currentTarget, results.current, 'left'))}
          >
            {lineTextWithCondition(entry.line, entry.qty)}
          </span>
        ))}
      </button>
    );
  }

  return (
    <div className={`search-col${wide ? ' wide' : ''}`} ref={wrap}>
      <div className="search-wrap">
        <svg className="search-icon" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
          <circle cx="6.8" cy="6.8" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <line x1="10.4" y1="10.4" x2="14.4" y2="14.4" stroke="currentColor"
                strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          ref={input}
          type="search"
          className="search-input"
          autoComplete="off"
          spellCheck={false}
          placeholder="Search buys & collections…"
          aria-label="Search buys and collections"
          aria-expanded={showing}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {showing && (
          <div className="search-results" ref={results} role="listbox" aria-label="Search results">
            {/* Paid/Ours only, or every status (owner, 2026-09-30). */}
            <div className="search-scope">
              <span>{showAll ? 'Every status' : 'Paid/Ours only'}</span>
              <button
                type="button"
                className={`scope-toggle${showAll ? ' on' : ''}`}
                aria-pressed={showAll}
                title={showAll ? 'Show Paid/Ours only' : 'Also show Processing, Priced and Completed'}
                onMouseDown={(e) => e.preventDefault()}   // keep the typing in the box
                onClick={() => setShowAll((v) => !v)}
              >
                <span className="scope-box" aria-hidden="true">{showAll ? '✓' : ''}</span>
                Show all
              </button>
            </div>
            {found.status === 'error' && <p className="search-error">Search failed: {found.error}</p>}
            {found.status === 'loading' && !found.sections.length && <p className="search-none loading-note">Searching…</p>}
            {found.status === 'done' && !found.sections.length && (
              <p className="search-none">
                {showAll
                  ? 'No buys or collections contain that card.'
                  : 'No Paid/Ours buys or collections contain that card. Show all includes the other statuses.'}
              </p>
            )}
            {found.sections.map((sec) => (
              <section key={sec.key} className={`search-group${found.status === 'loading' ? ' stale' : ''}`}>
                <h4 className="search-day">{sec.title ?? dayLabel(sec)}</h4>
                <div className="result-buttons">{sec.panels.map(renderRow)}</div>
              </section>
            ))}
            {found.capped && (
              <p className="search-hint">
                Showing the newest {LINE_LIMIT} matching cards. Add a number or set code to narrow it.
              </p>
            )}
          </div>
        )}
        {showing && <LinePreview preview={preview} onHide={hidePreview} />}
      </div>
    </div>
  );
}

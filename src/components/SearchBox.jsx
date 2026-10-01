import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { storeDay } from '../lib/calendar.js';
import { formatDate } from '../lib/time.js';
import { colorVar } from '../lib/palette.js';
import { LINE_LIMIT, MIN_CHARS, flatRows, groupResults, searchArgs } from '../lib/globalSearch.js';
import { statusLabel, statusTone } from '../pages/collections/status.js';
import { useStaff } from '../state/staff.jsx';
import GameBadge from './GameBadge.jsx';
import UserTag from './UserTag.jsx';

// The header's global search (spec 13), in CM's pill style: every stored line
// in a confirmed buy or an open collection (not Completed) matching what's
// typed, grouped by printing. ↓/↑ move, Enter opens, Esc closes. Opening a
// result jumps to it and flashes it.
// Much larger on every tab but the pricing screens (owner, 2026-09-29), where
// the main search bar is the focus.

const GAME_NAMES = { mtg: 'Magic', pokemon: 'Pokémon' };
const WAIT_MS = 250;

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
  const [found, setFound] = useState({ status: 'idle', groups: [], capped: false, error: null });
  const [active, setActive] = useState(0);
  const wrap = useRef(null);
  const input = useRef(null);
  const run = useRef(0);

  // Search after a pause in typing; a newer search wins.
  useEffect(() => {
    const query = text.trim();
    const mine = ++run.current;
    if (query.length < MIN_CHARS) {
      setFound({ status: 'idle', groups: [], capped: false, error: null });
      return undefined;
    }
    setFound((f) => ({ ...f, status: 'loading', error: null }));
    const timer = setTimeout(async () => {
      try {
        const plan = searchArgs(query, await knownCodes());
        let lines = plan ? await lookUp(plan.args) : [];
        if (plan && !lines.length && plan.retry) lines = await lookUp(plan.retry);
        if (mine !== run.current) return;
        setFound({ status: 'done', groups: groupResults(lines), capped: lines.length >= LINE_LIMIT, error: null });
        setActive(0);
      } catch (e) {
        if (mine !== run.current) return;
        console.error('Global search failed', e);
        setFound({ status: 'error', groups: [], capped: false, error: e.message });
      }
    }, WAIT_MS);
    return () => clearTimeout(timer);
  }, [text]);

  // A click anywhere else closes the results.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!wrap.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const rows = useMemo(() => flatRows(found.groups), [found.groups]);
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
      navigate(`/calendar/${row.game}/${storeDay(row.confirmedAt)}`,
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

  /** One buy or collection holding the printing. */
  function renderRow(row) {
    const i = index.get(row.key);
    const buy = row.kind === 'walk_in';
    const user = buy ? staff.byId(row.confirmedBy) : null;
    const tone = buy ? '' : ` ${statusTone({ status: row.status, paid_method: row.paidMethod })}`;
    return (
      <button
        key={row.key}
        type="button"
        role="option"
        aria-selected={i === active}
        data-idx={i}
        className={`result-btn${i === active ? ' active' : ''}${tone}`}
        style={buy && user ? { '--c': colorVar(user.color) } : undefined}
        onMouseEnter={() => setActive(i)}
        onMouseDown={(e) => e.preventDefault()}   // keep the typing in the box
        onClick={() => go(row)}
      >
        {buy ? (
          <>
            {formatDate(row.confirmedAt)} · {GAME_NAMES[row.game]} · Buy {row.number} · <UserTag user={user} />
            {' · '}qty {row.qty} <span className="result-cond">[{row.condition}]</span>
          </>
        ) : (
          <>
            <strong>{row.customerName}</strong> · <span className="result-status">{statusLabel(row.status)}</span>
            {' · '}qty {row.qty} <span className="result-cond">[{row.condition}]</span>
          </>
        )}
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
          <div className="search-results" role="listbox" aria-label="Search results">
            {found.status === 'error' && <p className="search-error">Search failed: {found.error}</p>}
            {found.status === 'loading' && !found.groups.length && <p className="search-none loading-note">Searching…</p>}
            {found.status === 'done' && !found.groups.length && (
              <p className="search-none">No buys or collections contain that card.</p>
            )}
            {found.groups.map((g) => (
              <section key={g.key} className={`search-group${found.status === 'loading' ? ' stale' : ''}`}>
                <div className="search-card">
                  <GameBadge game={g.game} />
                  <span className="search-card-name">{g.heading}</span>
                </div>
                {g.buys.length > 0 && (
                  <>
                    <h4>Buys</h4>
                    <div className="result-buttons">{g.buys.map(renderRow)}</div>
                  </>
                )}
                {g.collections.length > 0 && (
                  <>
                    <h4>Collections</h4>
                    <div className="result-buttons">{g.collections.map(renderRow)}</div>
                  </>
                )}
              </section>
            ))}
            {found.capped && (
              <p className="search-hint">
                Showing the newest {LINE_LIMIT} matching cards. Add a number or set code to narrow it.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

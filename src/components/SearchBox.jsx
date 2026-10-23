import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { dayDate, storeDay } from '../lib/calendar.js';
import { formatTime } from '../lib/time.js';
import { relativeDay } from '../lib/changelog.js';
import { lineTextWithCondition } from '../lib/lineFormat.js';
import { struckNote } from '../lib/struck.js';
import {
  CUSTOMER_LIMIT, LINE_LIMIT, MIN_CHARS, customerPanels, customerQuery, flatRows, groupResults, searchArgs,
} from '../lib/globalSearch.js';
import { likeEscape } from '../lib/customers.js';
import { formatPhone } from '../lib/phone.js';
import { statusText } from '../pages/collections/status.js';
import { useStaff } from '../state/staff.jsx';
import GameBadge from './GameBadge.jsx';
import UserTag from './UserTag.jsx';
import LinePreview, { previewFor } from './LinePreview.jsx';
import { useDismiss } from '../lib/useDismiss.js';

// The header's global search (spec 13), in CM's pill style: every stored line
// in a Paid/Ours walk-in buy or collection matching what's typed, or with
// "Show all" every status but drafts (owner, 2026-09-30), and struck cards,
// crossed out (decision 275): collections pinned
// at the top, then buys filed under dates, a panel
// per buy or collection listing its matching cards in full (owner,
// 2026-09-30). ↓/↑ move, Enter opens, Esc closes.
// Opening a result jumps to it and flashes it.
// Customers too (owner, 2026-10-21; decision 424): a name finds the buys and
// collections under it, a phone number (seven digits or more, however it's
// punctuated) finds them by phone, in a Customers section above the cards;
// a customer found flips Show all on, so their Completed buys show.
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

// Bulk pulled from exports is Completed on the screens (decision 423) while the database still
// has it Paid/Ours, so global_search returns its cards: they're dropped here, Show all or not.
// Its id, looked up at most every five minutes (there from the start since 0008, decision 449; before, the row
// appeared with the first (>…) export).
let pulled = { at: 0, id: null };
async function pulledCollectionId() {
  if (Date.now() - pulled.at < 5 * 60_000) return pulled.id;
  const { data, error } = await supabase.from('buys').select('id').eq('system_key', 'pulled').maybeSingle();
  if (!error) pulled = { at: Date.now(), id: data?.id ?? null };
  return pulled.id;
}

async function lookUp(args) {
  const { data, error } = await supabase.rpc('global_search', args);
  if (error) throw new Error(error.message);
  // A placeholder comes with its bulk_kind (migration 0063), so it reads "1 Meowth 117 [Placeholder]".
  return data ?? [];
}

/**
 * Buys and collections by their customer (decision 424): the name contains
 * what's typed, or the phone the digits. Never drafts, projects or the system
 * collections; the newest CUSTOMER_LIMIT.
 */
async function lookUpCustomers(who) {
  let query = supabase
    .from('buys')
    .select('id, kind, status, customer_name, phone, paid_method, confirmed_at, confirmed_by, created_at, number, '
      + 'buy_lines(game, quantity, completed_at, struck_at, bulk_kind)')
    .neq('status', 'draft')
    .is('system_key', null)
    .eq('project', false)
    .order('created_at', { ascending: false })
    .limit(CUSTOMER_LIMIT);
  query = who.digits ? query.like('phone', `%${who.digits}%`) : query.ilike('customer_name', `%${likeEscape(who.name)}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return customerPanels(data);
}

export default function SearchBox({ wide }) {
  const navigate = useNavigate();
  const staff = useStaff();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState({ status: 'idle', sections: [], capped: false, phone: false, error: null });
  const [active, setActive] = useState(0);
  // Paid/Ours only, or every status (owner, 2026-09-30). Forgotten whenever the
  // results close (a click away, Esc, opening a result): back to Paid/Ours only.
  const [showAll, setShowAll] = useState(false);
  // What was typed when a customer match last flipped Show all on (decision 424): once per thing
  // typed, so turning it off by hand sticks.
  const flippedFor = useRef(null);
  // The list open now, for the search's flip: closing it puts Show all back off and the search runs
  // again on the same text, which must not flip it back on with the list shut (smoke pass, 2026-10-21).
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    if (!open) {
      setShowAll(false);
      flippedFor.current = null;
    }
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
      setFound({ status: 'idle', sections: [], capped: false, phone: false, error: null });
      return undefined;
    }
    setFound((f) => ({ ...f, status: 'loading', error: null }));
    const timer = setTimeout(async () => {
      try {
        const who = customerQuery(query);
        const [codes, pulledId, customers] = await Promise.all([
          knownCodes(), pulledCollectionId(), who ? lookUpCustomers(who) : [],
        ]);
        // A phone number is never a card (decision 424).
        const plan = who?.digits ? null : searchArgs(query, codes);
        // Show all also finds struck cards (decision 275, migration 0067).
        const scope = { p_all: showAll, p_struck: showAll };
        let lines = plan ? await lookUp({ ...plan.args, ...scope }) : [];
        if (plan && !lines.length && plan.retry) lines = await lookUp({ ...plan.retry, ...scope });
        if (mine !== run.current) return;
        // A customer found flips Show all on, once per thing typed (decision 424), so their Completed
        // buys show too; the search then runs again with it on. Only while the list is open.
        if (customers.length && !showAll && openRef.current && flippedFor.current !== query) {
          flippedFor.current = query;
          setShowAll(true);
          return;
        }
        const capped = lines.length >= LINE_LIMIT;
        // Bulk pulled from exports' cards never show (decision 423).
        if (pulledId) lines = lines.filter((l) => l.buy_id !== pulledId);
        const shown = showAll ? customers : customers.filter((c) => c.paidOurs);
        const sections = [
          ...(shown.length ? [{ key: 'customers', title: 'Customers', panels: shown }] : []),
          ...groupResults(lines),
        ];
        setFound({ status: 'done', sections, capped, phone: Boolean(who?.digits), error: null });
        setActive(0);
      } catch (e) {
        if (mine !== run.current) return;
        console.error('Global search failed', e);
        setFound({ status: 'error', sections: [], capped: false, phone: false, error: e.message });
      }
    }, WAIT_MS);
    return () => clearTimeout(timer);
  }, [text, showAll]);

  // A click anywhere else closes the results (Esc is the field's own: it closes them, then leaves the field).
  useDismiss(() => setOpen(false), { ref: wrap, when: open, escape: false });

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
    // collection by its kind (System, Projects, Overnight buys).
    const tint = buy ? ` game-${row.game}` : ` kind-${row.collectionKind ?? 'overnight'}`;
    // Completed (an exported buy, a Completed collection; Show all only): partly faded (owner, 2026-09-30).
    // Rejected too (owner, 2026-10-09).
    const done = buy ? row.completed : row.status === 'completed' || row.status === 'rejected';
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
          // A customer match has no card to show (decision 424).
          setPreview(previewFor(row.entries[0]?.line.image_url ?? null, e.currentTarget, results.current, 'left'));
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
            <><strong>{row.customerName}</strong> · <span className="result-status">
              {statusText({ status: row.status, system_key: row.collectionKind === 'system' ? 'cant_upload' : null,
                project: row.collectionKind === 'project' })}
            </span></>
          )}
        </span>
        {/* A customer match (decision 424): who (a collection's name is on the line above), their
            phone and how many cards, in place of card lines. */}
        {row.customer && (
          <span className="result-entry result-customer">
            <span className="entry-text">
              {[buy ? row.customerName : null, row.phone ? formatPhone(row.phone) : null,
                `${row.cards} card${row.cards === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
            </span>
          </span>
        )}
        {row.entries.map((entry) => (
          <span
            key={entry.key}
            className={`result-entry${entry.struck ? ' struck' : ''}`}
            title={entry.struck ? struckNote(entry.line, staff.byId) : undefined}
            onMouseEnter={(e) => setPreview(previewFor(entry.line.image_url, e.currentTarget, results.current, 'left'))}
          >
            {/* Struck (Show all only): crossed out, as on its list, and said in words (decision 275). */}
            <span className="entry-text">{lineTextWithCondition(entry.line, entry.qty)}</span>
            {entry.struck && <span className="status-chip result-chip struck-chip">Struck</span>}
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
          placeholder="Search cards, customers, phone numbers…"
          aria-label="Search buys and collections by card, customer or phone number"
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
                title={showAll ? 'Show Paid/Ours only' : 'Also show Processing, Priced, Completed and Rejected, and struck cards'}
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
                {found.phone ? 'No buy or collection has that phone number.'
                  : showAll ? 'No buys or collections contain that card or have that customer.'
                    : 'No Paid/Ours buys or collections contain that card or have that customer. Show all includes the other statuses.'}
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

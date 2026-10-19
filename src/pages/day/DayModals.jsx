import { useState } from 'react';
import { dayDate } from '../../lib/calendar.js';
import { cardCounts, countText } from '../../lib/bulk.js';
import { isStruck } from '../../lib/struck.js';
import { formatPhone } from '../../lib/phone.js';
import { formatTime } from '../../lib/time.js';
import Modal from '../../components/Modal.jsx';

// A day page's dialogs for one buy: Convert to project or collection, Delete buy (FABLE_REPORT C2).

/**
 * Convert to project (owner, 2026-10-02): a name (the customer's, else the
 * buy's number and day), then every card moves to a new Paid/Ours project and
 * the buy is deleted. Convert to collection (`to` 'collection', owner,
 * 2026-10-18; decision 335): nothing to type; the collection takes the buy's
 * name and phone, the Last 4 ID 1312, its rates and what was paid (all of it
 * only when the whole buy moves: a buy that stays keeps the payment; decision 341).
 */
export function ConvertBuyModal({ buy, number, day, byId, busy, onClose, onConvert, to = 'project' }) {
  const collection = to === 'collection';
  const [name, setName] = useState(() => (buy.customer_name || `Buy ${number} · ${dayDate(day)}`).slice(0, 80));
  // Completed cards stay on the buy (decision 296): only the live ones move.
  const live = buy.buy_lines.filter((l) => !l.completed_at);
  const done = buy.buy_lines.length - live.length;
  const counts = cardCounts(live);
  const bothGames = new Set(live.filter((l) => !isStruck(l)).map((l) => l.game)).size > 1;
  // "its 1 card" / "all 12 cards, both games" (smoke test 2026-10-02 #8); bulk apart (T3).
  // Struck cards stay out: a project doesn't strike (owner, 2026-10-16).
  const single = counts.cards === 1 && !counts.bulk;
  const cards = single ? 'its 1 card' : `all ${countText({ ...counts, struck: 0 })}`;
  const who = byId(buy.confirmed_by)?.name ?? 'someone';
  // What was paid goes along only when the whole buy does; a buy that stays keeps it (decision 341).
  let takes = ' (a project has no rates)';
  if (collection) takes = done > 0 ? ' and rates' : ', rates and what was paid';
  const paidStays = done > 0 && buy.paid_method ? ', with what was paid' : '';
  const ready = name.trim().length > 0;
  return (
    <Modal
      title={collection ? 'Convert to collection?' : 'Convert to project?'}
      onClose={busy ? undefined : onClose}
      footer={(
        <>
          <button type="button" className="btn ghost" disabled={busy} onClick={onClose}>Cancel</button>
          <button
            type="button"
            className={`btn primary${busy ? ' busy' : ''}`}
            disabled={busy || !ready}
            onClick={() => onConvert(name)}
          >
            {collection ? 'Convert to collection' : 'Convert to project'}
          </button>
        </>
      )}
    >
      <p>
        <strong>Buy {number}</strong> ({who}, {formatTime(buy.confirmed_at)}) becomes a new{' '}
        <strong>{collection ? 'Paid/Ours collection' : 'project'}</strong>:{' '}
        <strong>{cards}</strong>{bothGames ? ', both games,' : ''} {single ? 'moves' : 'move'} there as{' '}
        {single ? 'it is' : 'they are'}, with the buy's notes{takes}
        {done > 0
          ? <>. Its <strong>{done} Completed card{done === 1 ? '' : 's'}</strong> stay{done === 1 ? 's' : ''} here, and so does the buy{paidStays}.</>
          : ', and the buy is deleted from this day.'}
        {counts.struck > 0 && (
          <> Its <strong>{counts.struck} struck card{counts.struck === 1 ? '' : 's'}</strong> stay out of the {to}:
            the Changelog keeps {counts.struck === 1 ? 'it' : 'them'}, crossed out.</>
        )}
      </p>
      {collection ? (
        <p className="muted">
          Collection: <strong>{buy.customer_name}</strong>
          {buy.phone ? <> · {formatPhone(buy.phone)}</> : null} · Last 4 ID <strong>1312</strong>
        </p>
      ) : (
      <label className="field">
        <span>Project name</span>
        <input
          type="text"
          value={name}
          maxLength={80}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && ready && !busy) onConvert(name);
          }}
        />
      </label>
      )}
    </Modal>
  );
}

/** Delete buy… (spec 10.2), or removing its last card (owner, 2026-09-29). */
export function DeleteBuyModal({ buy, number, lastCard, byId, busy, onClose, onDelete }) {
  const counts = cardCounts(buy.buy_lines);
  const who = byId(buy.confirmed_by)?.name ?? 'someone';
  return (
    <Modal
      title="Delete buy?"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn danger" disabled={busy} onClick={onDelete}>Delete buy</button>
        </>
      )}
    >
      {lastCard && <p>That's the last card in this buy, so removing it deletes the buy.</p>}
      <p>
        Delete <strong>Buy {number}</strong> ({who}, {formatTime(buy.confirmed_at)})? All{' '}
        <strong>{countText(counts)}</strong> in this buy — including any from the other game — will
        be permanently removed.
      </p>
    </Modal>
  );
}

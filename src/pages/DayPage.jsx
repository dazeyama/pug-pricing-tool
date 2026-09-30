import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { dayRange, dayTitle, parseDay } from '../lib/calendar.js';
import { lineBody, lineText } from '../lib/lineFormat.js';
import { formatMoney, payout } from '../lib/money.js';
import { formatPhone } from '../lib/phone.js';
import { formatTime } from '../lib/time.js';
import { colorVar } from '../lib/palette.js';
import { withLoading } from '../lib/loading.js';
import Modal from '../components/Modal.jsx';
import MoreMenu from '../components/MoreMenu.jsx';
import UserTag from '../components/UserTag.jsx';
import ExportButton from '../components/ExportButton.jsx';
import { RemoveModal } from './price/BuyList.jsx';
import { useConnection } from '../state/connection.jsx';
import { useDevice } from '../state/device.jsx';
import { useStaff } from '../state/staff.jsx';
import { useToast } from '../components/Toast.jsx';

const GAME_NAMES = { mtg: 'Magic', pokemon: 'Pokémon' };
const MESSAGES = {
  stale_version: 'This buy changed on another computer — reloaded.',
  line_gone: 'That card was already removed.',
  buy_gone: 'That buy was already deleted.',
  no_user: 'Pick a user first.',
};
const messageFor = (error, failure) => {
  const code = Object.keys(MESSAGES).find((c) => error?.message?.includes(c));
  return code ? MESSAGES[code] : `${failure}: ${error.message}`;
};

/**
 * A day page (spec 10.2): that game's part of every walk-in buy confirmed on
 * one store day. Each buy is a panel in its confirming user's colour, with
 * its cards (red × removes; owner, 2026-09-29), its totals for this game at
 * the buy's own rates, and a link to its other game's cards. Delete buy… in
 * each panel's ⋯. Back returns to the Calendar on the same month.
 */
export default function DayPage() {
  const { game, date } = useParams();
  const day = parseDay(date);
  const navigate = useNavigate();
  const ok = day && GAME_NAMES[game];
  if (!ok) {
    return (
      <div className="col-missing">
        <p className="empty">There's no such day page.</p>
        <button type="button" className="btn" onClick={() => navigate('/calendar')}>&lt; Back to the Calendar</button>
      </div>
    );
  }
  return <DayScreen key={`${game}:${day}`} game={game} day={day} />;
}

function DayScreen({ game, day }) {
  const navigate = useNavigate();
  const { epoch, offline } = useConnection();
  const { deviceId } = useDevice();
  const staff = useStaff();
  const user = staff.current;
  const toast = useToast();
  const [state, setState] = useState({ buys: [], loaded: false });
  const [removing, setRemoving] = useState(null);   // { buy, line }
  const [deleting, setDeleting] = useState(null);   // { buy, number, lastCard }
  const [busy, setBusy] = useState(false);
  const ticket = useRef(0);
  const other = game === 'mtg' ? 'pokemon' : 'mtg';
  const back = () => navigate(`/calendar?month=${day.slice(0, 7)}`);

  const reload = useCallback(async () => {
    const mine = ++ticket.current;
    const { from, to } = dayRange(day);
    const { data, error } = await supabase
      .from('buys')
      .select('*, buy_lines(*)')
      .eq('kind', 'walk_in')
      .eq('status', 'confirmed')
      .gte('confirmed_at', from.toISOString())
      .lt('confirmed_at', to.toISOString())
      .order('confirmed_at')
      .order('id');
    if (mine !== ticket.current) return;
    if (error) {
      console.error('Loading the day failed', error);
      toast(`Couldn't load the day: ${error.message}`, 'err');
      setState((s) => ({ ...s, loaded: true }));
      return;
    }
    const buys = (data ?? []).map((b) => ({
      ...b,
      buy_lines: [...(b.buy_lines ?? [])].sort((x, y) => x.position - y.position),
    }));
    setState({ buys, loaded: true });
  }, [day, toast]);

  useEffect(() => {
    reload();
  }, [reload, epoch]);

  // Live: a buy confirmed, changed or deleted anywhere reloads the day.
  useEffect(() => {
    const channel = supabase
      .channel(`day:${game}:${day}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'buys' }, () => reload())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [game, day, reload]);

  // This game's buys, numbered in confirmed order: "Buy 1", "Buy 2"… (as the
  // confirm toast and changelog number them).
  const mine = state.buys.filter((b) => b.buy_lines.some((l) => l.game === game));

  // Everything here needs a picked user and a connection.
  const guard = () => {
    if (!user) {
      staff.pulse();
      return false;
    }
    if (offline) {
      toast('No connection: nothing can change until it comes back.', 'err');
      return false;
    }
    return true;
  };

  /** × on a row: remove copies, or delete the buy if that's its last card (owner, 2026-09-29). */
  function startRemove(buy, number, line) {
    if (!guard()) return;
    if (buy.buy_lines.length === 1 && line.quantity === 1) setDeleting({ buy, number, lastCard: true });
    else setRemoving({ buy, number, line });
  }

  async function remove(line, qty) {
    const { buy, number } = removing;
    setRemoving(null);
    if (buy.buy_lines.length === 1 && qty >= line.quantity) {
      setDeleting({ buy, number, lastCard: true });
      return;
    }
    setBusy(true);
    const { error } = await withLoading(() => supabase.rpc('buy_remove_line', {
      p_line_id: line.id,
      p_qty: qty,
      p_user: user.id,
      p_device: deviceId,
      p_expected_version: buy.version,
      p_text: lineText(line, Math.min(qty, line.quantity)),
    }));
    setBusy(false);
    if (error?.message?.includes('last_card')) setDeleting({ buy, number, lastCard: true });
    else if (error) toast(messageFor(error, "Couldn't remove the card"), 'err');
    await reload();
  }

  async function destroy() {
    const { buy, number } = deleting;
    setBusy(true);
    const { error } = await withLoading(() => supabase.rpc('buy_delete', {
      p_buy_id: buy.id,
      p_user: user.id,
      p_device: deviceId,
      p_expected_version: buy.version,
      p_line_texts: Object.fromEntries(buy.buy_lines.map((l) => [l.id, lineText(l)])),
    }));
    setBusy(false);
    setDeleting(null);
    if (error) {
      toast(messageFor(error, "Couldn't delete the buy"), 'err');
      await reload();
      return;
    }
    // The day's last buy in this game gone: back to the Calendar (spec 10.2).
    if (mine.length <= 1) {
      toast(`Buy ${number} deleted. No ${GAME_NAMES[game]} buys are left that day.`, 'ok');
      back();
      return;
    }
    toast(`Buy ${number} deleted.`, 'ok');
    await reload();
  }

  return (
    // Themed in the game's colour: indigo for Magic, amber for Pokémon (calendar.css).
    <div className={`day-page ${game}`}>
      {/* < BACK on the left, EXPORT on the right, one row (owner, 2026-09-29). */}
      <div className="day-top">
        <button type="button" className="btn page-back" title="Back to the Calendar" onClick={back}>&lt; BACK</button>
        <ExportButton className="top" />
      </div>
      <h2 className="day-title">
        {dayTitle(day)}
        <span className={`group-chip day-chip ${game}`}>{GAME_NAMES[game]}</span>
      </h2>
      <hr className="day-rule" />

      {!state.loaded ? (
        <p className="empty">Loading…</p>
      ) : !mine.length ? (
        <p className="empty">No {GAME_NAMES[game]} buys that day.</p>
      ) : (
        <div className="card-grid day-grid">
          {mine.map((buy, i) => (
            <BuyPanel
              key={buy.id}
              buy={buy}
              number={i + 1}
              game={game}
              other={other}
              day={day}
              byId={staff.byId}
              busy={busy}
              offline={offline}
              onRemove={startRemove}
              onDelete={(b, n) => guard() && setDeleting({ buy: b, number: n, lastCard: false })}
            />
          ))}
        </div>
      )}

      {removing && (
        <RemoveModal
          line={removing.line}
          note="This buy was already confirmed."
          onClose={() => setRemoving(null)}
          onRemove={remove}
        />
      )}
      {deleting && (
        <DeleteBuyModal
          buy={deleting.buy}
          number={deleting.number}
          lastCard={deleting.lastCard}
          byId={staff.byId}
          busy={busy}
          onClose={() => setDeleting(null)}
          onDelete={destroy}
        />
      )}
    </div>
  );
}

/** Market, Cash and Credit for some of a buy's lines, at the buy's own rates. */
function totalsFor(lines, buy) {
  const market = Math.round(lines.reduce((s, l) => s + Number(l.unit_price) * l.quantity, 0) * 100) / 100;
  return {
    market,
    cash: payout(market, buy.cash_pct),
    credit: payout(market, buy.credit_pct),
  };
}

/** One buy on a day page (spec 10.2). */
function BuyPanel({ buy, number, game, other, day, byId, busy, offline, onRemove, onDelete }) {
  const user = byId(buy.confirmed_by);
  const lines = buy.buy_lines.filter((l) => l.game === game);
  const others = buy.buy_lines.filter((l) => l.game === other).reduce((n, l) => n + l.quantity, 0);
  const t = totalsFor(lines, buy);
  return (
    <article className="cardpanel buy-panel" style={{ '--c': colorVar(user?.color ?? 'pal-slate') }}>
      <header className="cardpanel-head buy-panel-head">
        <strong className="buy-number">Buy {number}</strong>
        <UserTag user={user} />
        <span className="buy-time">{formatTime(buy.confirmed_at)}</span>
        <MoreMenu
          items={[{
            label: 'Delete buy…',
            danger: true,
            blocked: offline ? 'No connection' : busy ? 'Saving…' : null,
            title: 'Delete this buy and every card in it, both games',
            onClick: () => onDelete(buy, number),
          }]}
        />
      </header>
      <div className="cardpanel-body">
        {(buy.customer_name || buy.phone) && (
          <p className="buy-customer">
            Customer: {[buy.customer_name, buy.phone && formatPhone(buy.phone)].filter(Boolean).join(' · ')}
          </p>
        )}
        {buy.notes && <p className="buy-notes">{buy.notes}</p>}
        <table className="deck-table">
          <thead>
            <tr>
              <th className="cell-price">Price</th>
              <th className="cell-qty">Qty</th>
              <th className="cell-name">Card</th>
              <th aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="drow">
                <td className="cell-price" title="Price per card">{formatMoney(l.unit_price)}</td>
                <td className="cell-qty">{l.quantity}</td>
                <td className="cell-name" title={l.name_en ? l.name : undefined}>{lineBody(l)}</td>
                <td className="cell-x">
                  <button
                    type="button"
                    className="line-x"
                    title="Remove"
                    aria-label={`Remove ${lineText(l)}`}
                    disabled={busy}
                    onClick={() => onRemove(buy, number, l)}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="buy-totals">
          <span>Market <strong>{formatMoney(t.market)}</strong></span>
          <span className="is-cash">Cash ({Number(buy.cash_pct)}%) <strong>{formatMoney(t.cash)}</strong></span>
          <span className="is-credit">Credit ({Number(buy.credit_pct)}%) <strong>{formatMoney(t.credit)}</strong></span>
        </div>
        {others > 0 && (
          <Link className="buy-other" to={`/calendar/${other}/${day}`}>
            Also has {others} {GAME_NAMES[other]} card{others === 1 ? '' : 's'} →
          </Link>
        )}
      </div>
    </article>
  );
}

/** Delete buy… (spec 10.2), or removing its last card (owner, 2026-09-29). */
function DeleteBuyModal({ buy, number, lastCard, byId, busy, onClose, onDelete }) {
  const count = buy.buy_lines.reduce((n, l) => n + l.quantity, 0);
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
        <strong>{count} card{count === 1 ? '' : 's'}</strong> in this buy — including any from the other game — will
        be permanently removed.
      </p>
    </Modal>
  );
}

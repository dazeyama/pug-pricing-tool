import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import PricingScreen from './price/PricingScreen.jsx';
import Modal from '../components/Modal.jsx';
import GuardButton from '../components/GuardButton.jsx';
import { supabase } from '../lib/supabase.js';
import { dayTitle, parseDay } from '../lib/calendar.js';
import { lineText } from '../lib/lineFormat.js';
import { formatMoney } from '../lib/money.js';
import { formatPhone } from '../lib/phone.js';
import { useSettings } from '../state/settings.jsx';
import { useDevice } from '../state/device.jsx';
import { useStaff } from '../state/staff.jsx';
import { useConnection } from '../state/connection.jsx';
import { useToast } from '../components/Toast.jsx';

const GAME_NAMES = { mtg: 'Magic', pokemon: 'Pokémon' };
const MESSAGES = {
  stale_version: 'This buy changed on another computer since it opened: nothing was saved. Go back and open it again.',
  buy_gone: 'This buy was deleted: nothing was saved.',
  line_gone: 'A card of this buy was removed elsewhere: nothing was saved. Go back and open it again.',
  buy_completed: 'Some of its cards were Completed meanwhile: nothing was saved.',
  last_card: 'A buy keeps at least one card: to remove them all, use Delete buy… on the day page.',
  no_user: 'Pick a user first.',
};

// What makes a line a different card, condition, amount or price: an edit
// that changes none of these (SAVE EDIT pressed on an untouched card) isn't one.
const COMPARED = ['game', 'lang', 'name', 'set_code', 'collector_number', 'finish', 'first_edition', 'treatments',
  'condition', 'quantity', 'unit_price', 'price_source', 'scryfall_id', 'tcgdex_id', 'tcgplayer_id',
  'justtcg_variant_id'];
const sameLine = (a, b) => COMPARED.every((k) => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null));

/**
 * Edit in project view (owner, 2026-10-13): a confirmed walk-in buy's cards
 * on the pricing screen, opened from its day page's ⋯, in the colour of the
 * day page's game (Magic blue, Pokémon amber). Clicking a card loads it to
 * edit (a condition, a treatment, mostly: double-checking before an
 * export); SAVE EDIT changes it here and × takes cards out, but nothing is
 * saved until SAVE BUY, which saves them all together (buy_save_edits,
 * migration 0052) and goes back to the day page with the buy flashed. The
 * buy stays on its own day; its Changelog entry is now's. No cards are added
 * and the rates stay the buy's: the customer was paid already.
 */
export default function BuyEditPage() {
  const { game, date, id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const number = location.state?.number ?? null;
  const day = parseDay(date);
  const { deviceId } = useDevice();
  const staff = useStaff();
  const user = staff.current;
  const toast = useToast();
  const { offline } = useConnection();
  const { values } = useSettings();
  const [state, setState] = useState({ buy: null, original: [], loaded: false });
  const [lines, setLines] = useState([]);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const backTo = useCallback((focus) => navigate(`/calendar/${game}/${date}`, focus ? { state: { focus } } : undefined),
    [navigate, game, date]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from('buys')
        .select('*, buy_lines(*)')
        .eq('id', id)
        .eq('kind', 'walk_in')
        .eq('status', 'confirmed')
        .maybeSingle();
      if (!alive) return;
      if (error) {
        toast(`Couldn't load the buy: ${error.message}`, 'err');
        setState({ buy: null, original: [], loaded: true });
        return;
      }
      const original = [...(data?.buy_lines ?? [])].sort((a, b) => a.position - b.position);
      setState({ buy: data, original, loaded: true });
      setLines(original);
    })();
    return () => {
      alive = false;
    };
  }, [id, toast]);

  const { buy, original } = state;

  // What SAVE BUY would send: each changed line as it now is, and the lines taken out.
  const changes = useMemo(() => {
    const now = new Map(lines.map((l) => [l.id, l]));
    const edits = [];
    const removed = [];
    for (const before of original) {
      const after = now.get(before.id);
      if (!after) removed.push({ id: before.id, text: lineText(before) });
      else if (!sameLine(before, after)) {
        edits.push({ id: before.id, line: after, old_text: lineText(before), new_text: lineText(after) });
      }
    }
    return { edits, removed };
  }, [lines, original]);
  const dirty = changes.edits.length + changes.removed.length;

  const list = {
    lines,
    loaded: state.loaded,
    busy,
    add: async () => null,   // never: ADD CARD only saves an edit here (addLocked)
    // SAVE EDIT: the card as edited, in its place, until SAVE BUY.
    update: async (old, line) => {
      setLines((ls) => ls.map((l) => (l.id === old.id ? { ...l, ...line, id: l.id, buy_id: l.buy_id, position: l.position } : l)));
      return old.id;
    },
    remove: async (line, n) => {
      const left = lines.filter((l) => l.id !== line.id || n < l.quantity);
      if (!left.length) {
        toast(MESSAGES.last_card, 'err');
        return null;
      }
      setLines((ls) => ls.flatMap((l) => {
        if (l.id !== line.id) return [l];
        return n >= l.quantity ? [] : [{ ...l, quantity: l.quantity - n }];
      }));
      return true;
    },
    setRates: async () => null,   // never: ratesLocked
  };

  async function save() {
    if (!user) {
      staff.pulse();
      return;
    }
    if (!dirty) {
      backTo({ buyId: id, lineIds: [] });
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('buy_save_edits', {
      p_buy_id: id,
      p_user: user.id,
      p_device: deviceId,
      p_expected_version: buy.version,
      p_lines: changes.edits,
      p_removed: changes.removed,
    });
    setBusy(false);
    if (error) {
      const code = Object.keys(MESSAGES).find((k) => error.message?.includes(k));
      toast(code ? MESSAGES[code] : `Couldn't save the buy: ${error.message}`, 'err');
      return;
    }
    const parts = [
      changes.edits.length && `${changes.edits.length} card${changes.edits.length === 1 ? '' : 's'} edited`,
      changes.removed.length && `${changes.removed.length} removed`,
    ].filter(Boolean).join(', ');
    toast(`${number ? `Buy ${number}` : 'Buy'} saved: ${parts}.`, 'ok');
    backTo({ buyId: id, lineIds: changes.edits.map((e) => e.id) });
  }

  if (state.loaded && !buy) {
    return (
      <div className="col-missing">
        <p className="empty">This buy doesn't exist any more. It may have been deleted or converted.</p>
        <button type="button" className="btn" onClick={() => backTo(null)}>&lt; Back to the day page</button>
      </div>
    );
  }

  // Its rates as confirmed (custom ones are kept in cash_pct / credit_pct too).
  const master = { cash: Number(values.cash_pct), credit: Number(values.credit_pct) };
  const rates = {
    cash: Number(buy?.cash_pct ?? master.cash),
    credit: Number(buy?.credit_pct ?? master.credit),
    customCash: buy?.custom_cash_pct != null ? Number(buy.custom_cash_pct) : null,
    customCredit: buy?.custom_credit_pct != null ? Number(buy.custom_credit_pct) : null,
  };
  const completed = original.some((l) => l.completed_at);
  const locked = completed
    ? 'Some of its cards are Completed: mark it Paid/Ours again on the day page to edit it'
    : null;
  const title = [number ? `Buy ${number}` : 'Buy', day ? dayTitle(day) : null].filter(Boolean).join(' · ');

  return (
    <>
      <PricingScreen
        list={list}
        rates={rates}
        master={master}
        locked={locked}
        // The day page's game's colour (owner, 2026-10-13): Magic blue, Pokémon amber.
        className={`collection-screen buy-edit-screen game-${game === 'pokemon' ? 'pokemon' : 'mtg'}`}
        listTitle="Buy list"
        ratesTitle="Rates for this buy"
        addLocked="Click a card in the list to edit it: cards can't be added to a confirmed buy"
        ratesLocked="A confirmed buy's rates don't change: the customer was paid already"
        searchLead={(
          <button
            type="button"
            className="btn search-back"
            title="Back to the day page"
            onClick={() => (dirty ? setLeaving(true) : backTo(null))}
          >
            &lt; BACK
          </button>
        )}
        renderListDetails={() => (
          <div className="col-details buy-edit-details has-body">
            <div className="cd-head">
              <strong className="be-title">{title}</strong>
              <span className="be-game">{GAME_NAMES[game] ?? ''}</span>
            </div>
            <div className="cd-body">
              {buy && (
                <p className="be-line">
                  {[buy.customer_name, buy.phone && formatPhone(buy.phone)].filter(Boolean).join(' · ')}
                  {buy.paid_price != null && (
                    <span className="be-paid"> · paid {formatMoney(Number(buy.paid_price))} {buy.paid_method}</span>
                  )}
                </p>
              )}
              <p className={`be-changes${dirty ? ' on' : ''}`}>
                {dirty
                  ? `${dirty} change${dirty === 1 ? '' : 's'} not saved yet: SAVE BUY saves ${dirty === 1 ? 'it' : 'them'}.`
                  : 'Click a card to edit it; SAVE BUY saves the buy.'}
              </p>
            </div>
          </div>
        )}
        renderListFooter={() => (
          <div className="list-buttons">
            <GuardButton
              className="btn confirm-btn save-buy-btn"
              disabled={busy || offline || Boolean(locked)}
              title={busy ? 'Saving…' : offline ? 'No connection' : locked
                ?? (dirty ? 'Save the changes to this buy and go back to its day page' : 'Nothing changed: back to the day page')}
              onClick={save}
            >
              SAVE BUY
            </GuardButton>
          </div>
        )}
      />
      {leaving && (
        <Modal
          title="Leave without saving?"
          onClose={() => setLeaving(false)}
          footer={(
            <>
              <button type="button" className="btn ghost" onClick={() => setLeaving(false)}>Keep editing</button>
              <button type="button" className="btn danger" onClick={() => backTo(null)}>Discard changes</button>
            </>
          )}
        >
          <p>
            <strong>{dirty} change{dirty === 1 ? '' : 's'}</strong> to this buy {dirty === 1 ? "hasn't" : "haven't"} been
            saved. Leaving now discards {dirty === 1 ? 'it' : 'them'}.
          </p>
        </Modal>
      )}
    </>
  );
}

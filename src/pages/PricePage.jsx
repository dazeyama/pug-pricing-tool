import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import PricingScreen from './price/PricingScreen.jsx';
import WalkInButtons from './price/WalkInButtons.jsx';
import ConfirmBuyModal from './price/ConfirmBuyModal.jsx';
import BuyDoneModal from './price/BuyDoneModal.jsx';
import { useDraft } from './price/useDraft.js';
import { lineText } from '../lib/lineFormat.js';
import { tiersFrom } from '../lib/rates.js';
import { cardCounts, countText } from '../lib/bulk.js';
import { useSettings } from '../state/settings.jsx';
import { useDevice } from '../state/device.jsx';
import { useStaff } from '../state/staff.jsx';
import { useToast } from '../components/Toast.jsx';
import { GAME_NAMES } from '../lib/games.js';

// What a phone sees this screen as (docs/SCAN_FUNCTION.md 5.2).
const SCAN_TARGET = { kind: 'walk_in', buyId: null, name: 'Buy list' };

// The Price tab (spec 8): the pricing screen with this computer's walk-in
// draft as its list, added to with ADD CARD and finished with CONFIRM BUY
// (Phase 6). Confirming or cancelling starts the next buy afresh.
export default function PricePage() {
  const { deviceId } = useDevice();
  // A search from the address bar (#/price/<search>; owner, 2026-10-16): handed to the price screen,
  // which types it in, and the address goes back to #/price (the screen keeps its state).
  const { search: urlSearch } = useParams();
  const navigate = useNavigate();
  useEffect(() => {
    if (urlSearch != null) navigate('/price', { replace: true });
  }, [urlSearch, navigate]);
  const draft = useDraft(deviceId);
  const { current: user, pulse, forget } = useStaff();
  const toast = useToast();
  const { values } = useSettings();
  const [confirming, setConfirming] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  // BUY COMPLETE (owner, 2026-10-17; decision 292): the dialog after a confirm, with the printouts on offer.
  const [completed, setCompleted] = useState(null);

  // This buy's rates: its custom ones where set, else the Master Buy
  // Percentages (spec 8.9.1), with the low-end and high-end rates
  // (docs/TEAM_FEEDBACK.md 4.2), for the totals and the price panel.
  const master = { cash: Number(values.cash_pct), credit: Number(values.credit_pct), tiers: tiersFrom(values.rate_tiers) };
  const customCash = draft.buy?.custom_cash_pct != null ? Number(draft.buy.custom_cash_pct) : null;
  const customCredit = draft.buy?.custom_credit_pct != null ? Number(draft.buy.custom_credit_pct) : null;
  const rates = {
    cash: customCash ?? master.cash, credit: customCredit ?? master.credit, customCash, customCredit, tiers: master.tiers,
  };

  const list = {
    lines: draft.lines,
    loaded: draft.loaded,
    busy: draft.busy,
    // The buy a phone's scan was for (decision 350): its id, so a scan for a finished buy isn't added to this one.
    draftId: draft.buy?.id ?? null,
    add: (line, userId, draftId) => draft.add(line, userId, draftId),
    update: (old, line, userId) => draft.update(old.id, line, userId),
    remove: (line, n, userId) => draft.remove(line.id, n, userId),
    setRates: (cash, credit, userId) => draft.setRates(cash, credit, userId),
    setLineRate: (line, cash, credit, userId) => draft.setLineRate(line.id, cash, credit, userId),
  };
  const count = draft.lines.reduce((n, l) => n + l.quantity, 0);

  /** CONFIRM BUY's dialog confirmed (spec 8.10). */
  async function confirmBuy({ customerName, phone, notes, paidPrice, paidMethod, flagCondition }) {
    if (!user) {
      pulse();
      return;
    }
    const done = await draft.confirm({
      userId: user.id,
      customerName,
      phone,
      notes,
      paidPrice,
      paidMethod,
      // The rates it was priced at, custom ones included: kept on the buy (owner, 2026-10-16; 0061).
      cashPct: rates.cash,
      creditPct: rates.credit,
      lineTexts: Object.fromEntries(draft.lines.map((l) => [l.id, lineText(l)])),
    });
    if (!done) return;
    // The buy confirmed, its cards and what was sent, from the answer: a press after a lost answer
    // can report an earlier press's confirm, whose draft has left this screen (decision 367).
    const { buyId, lines, sent } = done;
    setConfirming(false);
    const names = done.games.map((g) => GAME_NAMES[g]).join(' + ');
    // 🚩 Flag check for condition (owner, 2026-10-14): set once it's confirmed.
    let flagged = '';
    if (flagCondition && buyId) {
      const { error } = await supabase.rpc('buy_set_condition_check', {
        p_buy_id: buyId, p_flag: true, p_user: user.id, p_device: deviceId,
      });
      flagged = error
        ? ` It couldn't be flagged (${error.message}): flag it from its ⋯ on the day page.`
        : ' 🚩 Flagged: check its condition before export.';
    }
    toast(`Buy confirmed — Buy ${done.number} (${names}).${flagged} Pick your user for the next one.`,
      flagged.includes("couldn't") ? 'warn' : 'ok');
    setCompleted({
      number: done.number, games: done.games, lines, customer: sent.customerName, paid: sent.paidPrice, method: sent.paidMethod,
      flagged: Boolean(flagCondition) && !flagged.includes("couldn't"),
    });
    // The next buy may be someone else's: they pick themselves (owner, 2026-10-11).
    forget();
    setResetKey((k) => k + 1);
  }

  /** CANCEL (spec 8.10): the draft goes, custom rates and all. */
  async function cancelBuy() {
    if (await draft.cancel()) setResetKey((k) => k + 1);
  }

  return (
    <PricingScreen
      urlSearch={urlSearch ?? null}
      list={list}
      rates={rates}
      master={master}
      listTitle="Buy list"
      ratesTitle="Rates for this buy"
      // A phone can scan into this computer's buy (docs/SCAN_FUNCTION.md).
      scanTarget={SCAN_TARGET}
      resetKey={resetKey}
      renderListFooter={({ focusSearch, canEdit, editBlocked }) => (
        <>
          <WalkInButtons
            count={count}
            label={countText(cardCounts(draft.lines))}
            busy={draft.busy}
            canEdit={canEdit}
            onCancel={cancelBuy}
            onConfirm={() => (canEdit ? setConfirming(true) : editBlocked())}
          />
          {confirming && (
            <ConfirmBuyModal
              lines={draft.lines}
              rates={rates}
              user={user}
              busy={draft.busy}
              onConfirm={confirmBuy}
              flagOption
              onClose={() => {
                setConfirming(false);
                focusSearch();
              }}
            />
          )}
          {completed && (
            <BuyDoneModal
              {...completed}
              onClose={() => {
                setCompleted(null);
                focusSearch();
              }}
            />
          )}
        </>
      )}
    />
  );
}

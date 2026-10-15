import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import PricingScreen from './price/PricingScreen.jsx';
import WalkInButtons from './price/WalkInButtons.jsx';
import ConfirmBuyModal from './price/ConfirmBuyModal.jsx';
import { marketTotal } from './price/BuyList.jsx';
import { useDraft } from './price/useDraft.js';
import { lineText } from '../lib/lineFormat.js';
import { useSettings } from '../state/settings.jsx';
import { useDevice } from '../state/device.jsx';
import { useStaff } from '../state/staff.jsx';
import { useToast } from '../components/Toast.jsx';

// The Price tab (spec 8): the pricing screen with this computer's walk-in
// draft as its list, added to with ADD CARD and finished with CONFIRM BUY
// (Phase 6). Confirming or cancelling starts the next buy afresh.
export default function PricePage() {
  const { deviceId } = useDevice();
  const draft = useDraft(deviceId);
  const { current: user, pulse, forget } = useStaff();
  const toast = useToast();
  const { values } = useSettings();
  const [confirming, setConfirming] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  // This buy's rates: its custom ones where set, else the Master Buy
  // Percentages (spec 8.9.1), for the totals and the price panel.
  const master = { cash: Number(values.cash_pct), credit: Number(values.credit_pct) };
  const customCash = draft.buy?.custom_cash_pct != null ? Number(draft.buy.custom_cash_pct) : null;
  const customCredit = draft.buy?.custom_credit_pct != null ? Number(draft.buy.custom_credit_pct) : null;
  const rates = { cash: customCash ?? master.cash, credit: customCredit ?? master.credit, customCash, customCredit };

  const list = {
    lines: draft.lines,
    loaded: draft.loaded,
    busy: draft.busy,
    add: (line, userId) => draft.add(line, userId),
    update: (old, line, userId) => draft.update(old.id, line, userId),
    remove: (line, n, userId) => draft.remove(line.id, n, userId),
    setRates: (cash, credit, userId) => draft.setRates(cash, credit, userId),
  };
  const count = draft.lines.reduce((n, l) => n + l.quantity, 0);

  /** CONFIRM BUY's dialog confirmed (spec 8.10). */
  async function confirmBuy({ customerName, phone, notes, paidPrice, paidMethod, flagCondition }) {
    if (!user) {
      pulse();
      return;
    }
    const buyId = draft.buy?.id;
    const done = await draft.confirm({
      userId: user.id,
      customerName,
      phone,
      notes,
      paidPrice,
      paidMethod,
      cashPct: master.cash,
      creditPct: master.credit,
      lineTexts: Object.fromEntries(draft.lines.map((l) => [l.id, lineText(l)])),
    });
    if (!done) return;
    setConfirming(false);
    const names = done.games.map((g) => (g === 'mtg' ? 'Magic' : 'Pokémon')).join(' + ');
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
    toast(`Buy confirmed — Buy ${done.number} today (${names}).${flagged} Pick your user for the next one.`,
      flagged.includes("couldn't") ? 'warn' : 'ok');
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
      list={list}
      rates={rates}
      master={master}
      listTitle="Buy list"
      ratesTitle="Rates for this buy"
      resetKey={resetKey}
      renderListFooter={({ focusSearch, canEdit, editBlocked }) => (
        <>
          <WalkInButtons
            count={count}
            busy={draft.busy}
            canEdit={canEdit}
            onCancel={cancelBuy}
            onConfirm={() => (canEdit ? setConfirming(true) : editBlocked())}
          />
          {confirming && (
            <ConfirmBuyModal
              count={count}
              market={marketTotal(draft.lines)}
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
        </>
      )}
    />
  );
}

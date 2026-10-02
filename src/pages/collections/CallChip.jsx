import { useState } from 'react';
import GuardButton from '../../components/GuardButton.jsx';
import { useToast } from '../../components/Toast.jsx';
import { supabase } from '../../lib/supabase.js';
import { useLiveTable } from '../../lib/useLiveTable.js';
import { formatMoney } from '../../lib/money.js';
import { formatDateTime } from '../../lib/time.js';
import { useConnection } from '../../state/connection.jsx';
import { useDevice } from '../../state/device.jsx';
import { useStaff } from '../../state/staff.jsx';

/** The Changelog entry a call leaves (Actions). */
export const CALLED = 'collection_called';

/**
 * 📞 (n) beside a Priced collection's phone (owner, 2026-10-02): click it
 * after calling the customer about the offer. Each click is a Changelog
 * entry, which is all that's kept (nothing on the collection itself), so n
 * is that collection's calls; hovering lists when, and by whom.
 * @param {{ buy: object }} p
 */
export default function CallChip({ buy }) {
  const staff = useStaff();
  const { deviceId } = useDevice();
  const { offline } = useConnection();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const { data } = useLiveTable('events', () => supabase.from('events')
    .select('at, staff_user_name')
    .eq('action', CALLED)
    .eq('target_id', buy.id)
    .order('at'));
  const calls = data ?? [];

  async function called() {
    const user = staff.current;
    const offer = [buy.offer_cash != null && `${formatMoney(buy.offer_cash)} cash`,
      buy.offer_credit != null && `${formatMoney(buy.offer_credit)} credit`].filter(Boolean).join(' / ');
    setBusy(true);
    const { error } = await supabase.from('events').insert({
      staff_user_id: user.id,
      staff_user_name: user.name,
      staff_user_color: user.color,
      device_id: deviceId,
      kind: 'collection',
      action: CALLED,
      target_id: buy.id,
      target_name: buy.customer_name,
      games: [],
      added: 0,
      removed: 0,
      lines: [],
      fields: [],
      summary: `Called ${buy.customer_name} about their collection${offer ? ` (offer ${offer})` : ''}.`,
    });
    setBusy(false);
    if (error) toast(`Couldn't save the call: ${error.message}`, 'err');
  }

  const list = calls.length
    ? `Called:\n${calls.map((c) => `${formatDateTime(c.at)}${c.staff_user_name ? ` · ${c.staff_user_name}` : ''}`).join('\n')}`
    : 'Not called yet.';
  return (
    <GuardButton
      className="btn small call-chip"
      disabled={offline || busy}
      title={offline ? 'No connection' : `${list}\n\nClick after calling ${buy.customer_name}.`}
      aria-label={`Called ${calls.length} time${calls.length === 1 ? '' : 's'}: add a call`}
      onClick={called}
    >
      <span aria-hidden="true">📞</span> ({calls.length})
    </GuardButton>
  );
}

import { useState } from 'react';
import { createPortal } from 'react-dom';
import GuardButton from '../../components/GuardButton.jsx';
import UserTag from '../../components/UserTag.jsx';
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
 * is that collection's calls; hovering lists when, and by whom, in a styled
 * card (owner, 2026-10-02: the browser's tooltip was hard to read).
 * @param {{ buy: object }} p
 */
export default function CallChip({ buy }) {
  const staff = useStaff();
  const { deviceId } = useDevice();
  const { offline } = useConnection();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [pop, setPop] = useState(null);   // where the list shows while hovered: { left, top } or { left, bottom }
  const { data } = useLiveTable('events', () => supabase.from('events')
    .select('at, staff_user_id, staff_user_name')
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

  /** Beside the chip, on the page itself (so no panel clips it): under it, or over it near the bottom. */
  function show(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left, window.innerWidth - 316));
    setPop(r.bottom + 240 > window.innerHeight
      ? { left, bottom: window.innerHeight - r.top + 6 }
      : { left, top: r.bottom + 6 });
  }
  const hide = () => setPop(null);

  return (
    <>
      <GuardButton
        className="btn small call-chip"
        disabled={offline || busy}
        title={offline ? 'No connection' : undefined}
        aria-label={`Called ${calls.length} time${calls.length === 1 ? '' : 's'}: add a call`}
        onClick={called}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <span aria-hidden="true">📞</span> ({calls.length})
      </GuardButton>
      {pop && createPortal(
        <div className="call-pop" style={pop} role="tooltip">
          <div className="call-pop-head">📞 Calls to {buy.customer_name}</div>
          {calls.length ? (
            <ol className="call-pop-list">
              {calls.map((c, i) => (
                <li key={c.at}>
                  <span className="call-pop-n">{i + 1}</span>
                  <span className="call-pop-when">{formatDateTime(c.at)}</span>
                  <UserTag user={staff.byId(c.staff_user_id)} fallback={c.staff_user_name ?? '—'} />
                </li>
              ))}
            </ol>
          ) : (
            <p className="call-pop-none">Not called yet.</p>
          )}
          <p className="call-pop-foot">Click after each call.</p>
        </div>,
        document.body,
      )}
    </>
  );
}

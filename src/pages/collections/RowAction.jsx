import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConvertToBuyModal, DeleteCollectionModal } from './CollectionModals.jsx';
import { PROJECT_EXPORTED, useCollection } from './useCollection.js';
import { collectionRates } from './status.js';
import { tiersFrom } from '../../lib/rates.js';
import { useDevice } from '../../state/device.jsx';
import { useSettings } from '../../state/settings.jsx';
import { useStaff } from '../../state/staff.jsx';
import { useToast } from '../../components/Toast.jsx';

/**
 * A row's ⋯ action on the Collections tab (owner, 2026-10-11): the same
 * Delete collection… and Convert to buy… a collection's own screen has. The
 * collection and its cards load first (useCollection), then its dialog opens;
 * the server refuses either while another computer is editing it, as it does
 * there.
 * @param {object} p
 * @param {string} p.id
 * @param {'delete'|'convert'} p.action
 * @param {() => void} p.onClose
 */
export default function RowAction({ id, action, onClose }) {
  const navigate = useNavigate();
  const { deviceId } = useDevice();
  const staff = useStaff();
  const user = staff.current;
  const toast = useToast();
  const { values } = useSettings();
  const col = useCollection(id, { deviceId });
  const done = useRef(false);   // our own delete or convert: it's meant to disappear
  const buy = col.buy;

  // Gone before (or while) its dialog was open, nothing to convert, or exported (decision 339:
  // the table's list doesn't load the cards, so it can't grey the item).
  const exported = col.lines.some((l) => l.cc_status);
  useEffect(() => {
    if (!col.loaded || done.current) return;
    if (col.missing) {
      toast('This collection was deleted.', 'err');
      onClose();
    } else if (action === 'convert' && buy && !col.lines.length) {
      toast('No cards to convert.', 'err');
      onClose();
    } else if (action === 'convert' && buy && exported) {
      toast(PROJECT_EXPORTED, 'err');
      onClose();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- action is fixed for the dialog's life; onClose and toast are the caller's
  }, [col.loaded, col.missing, buy, col.lines.length, exported]);

  if (!col.loaded || !buy) return null;

  if (action === 'delete') {
    return (
      <DeleteCollectionModal
        name={buy.customer_name}
        project={Boolean(buy.project)}
        lines={col.lines}
        busy={col.busy}
        onClose={onClose}
        onDelete={async (typed) => {
          if (!user) {
            staff.pulse();
            return;
          }
          done.current = true;
          if (await col.destroy(typed, user.id)) {
            toast(`Deleted ${buy.customer_name}.`, 'ok');
            onClose();
          } else {
            done.current = false;
          }
        }}
      />
    );
  }

  const master = { cash: Number(values.cash_pct), credit: Number(values.credit_pct), tiers: tiersFrom(values.rate_tiers) };
  const rates = collectionRates(buy, master);
  return (
    <ConvertToBuyModal
      buy={buy}
      lines={col.lines}
      rates={rates}
      user={user}
      busy={col.busy}
      onClose={onClose}
      onConvert={async (deal) => {
        if (!user) {
          staff.pulse();
          return;
        }
        done.current = true;
        const made = await col.toBuy(deal, rates, user.id);
        if (!made) {
          done.current = false;
          return;
        }
        toast(`${buy.customer_name} is now Buy ${made.number} on today's page.${made.flagged ? ' 🚩 Flagged: check its condition before export.' : ''}`, 'ok');
        navigate(`/calendar/${made.games?.[0] ?? 'mtg'}/${made.day}`);
      }}
    />
  );
}

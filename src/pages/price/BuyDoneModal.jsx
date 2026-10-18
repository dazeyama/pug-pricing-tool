import Modal from '../../components/Modal.jsx';
import { useAuditPrint } from '../export/useAuditPrint.js';
import { useConnection } from '../../state/connection.jsx';
import { useToast } from '../../components/Toast.jsx';
import { GAME_NAMES } from '../../lib/games.js';
import { cardCounts, countText } from '../../lib/bulk.js';
import { formatMoney } from '../../lib/money.js';
import { dayDate, storeDay } from '../../lib/calendar.js';

/**
 * BUY COMPLETE (owner, 2026-10-17; decision 292): the dialog after CONFIRM
 * BUY, mainly to offer the printouts straight after the purchase. What was
 * saved and where (the day page, by game) in green, the easy facts (the
 * buy's number, cards, what was paid), then **Print MTG?** / **Print PKM?**
 * for the games the buy has (either closes the dialog as it starts the printout), and
 * **No thanks**; × and Esc are No thanks too.
 * `lines` are the buy's lines as they were confirmed (the draft's rows).
 */
export default function BuyDoneModal({ number, games, lines, customer, paid, method, flagged, onClose }) {
  const { print, printing } = useAuditPrint();
  const { offline } = useConnection();
  const toast = useToast();
  const day = storeDay();
  // "Oct 17, 2026": short enough for the saved line to stay on one line.
  const shortDay = dayDate(day).replace(/^([A-Z][a-z]{2})[a-z]*/, '$1');
  const has = (g) => lines.some((l) => l.game === g);
  const counts = cardCounts(lines);

  function printGame(game) {
    if (offline && game === 'mtg') {
      toast('No connection: printing needs it to find the Crystal Commerce categories.', 'err');
      return;
    }
    const title = game === 'pokemon' ? `Audit — Pokémon, Buy ${number}, ${dayDate(day)}` : `Audit — Buy ${number}, ${dayDate(day)}`;
    // The printout's tab opens at the click and finishes on its own; the dialog has done its job (owner, 2026-10-17).
    print({
      lines,
      game,
      title,
      fileName: `audit-${game === 'pokemon' ? 'pokemon' : 'magic'}-${day}-buy-${number}.pdf`,
      // Flagged at CONFIRM BUY: the printout says so, either game (decision 301).
      flagOf: flagged ? () => `Buy ${number}` : null,
    });
    onClose();
  }

  return (
    <Modal
      title="BUY COMPLETE"
      className="buy-done"
      onClose={onClose}
      footer={(
        <>
          {has('mtg') && (
            <button type="button" className="btn game-btn mtg" disabled={printing} onClick={() => printGame('mtg')}>
              {printing ? 'Printing… 🖨' : 'Print MTG? 🖨'}
            </button>
          )}
          {has('pokemon') && (
            <button type="button" className="btn game-btn pokemon" disabled={printing} onClick={() => printGame('pokemon')}>
              {printing ? 'Printing… 🖨' : 'Print PKM? 🖨'}
            </button>
          )}
          <button type="button" className="btn ghost" onClick={onClose}>No thanks</button>
        </>
      )}
    >
      <button type="button" className="modal-x" aria-label="Dismiss" title="Dismiss" onClick={onClose}>×</button>
      <p className="buy-done-saved">
        ✓ Saved in the Calendar page: {games.map((g) => GAME_NAMES[g]).join(' and ')} · {shortDay}
      </p>
      <ul className="buy-done-facts">
        <li><strong>Buy {number}</strong>{customer ? ` · ${customer}` : ''}</li>
        <li>{countText(counts)}</li>
        {paid != null && <li>Paid {formatMoney(paid)}{method ? ` in ${method}` : ''}</li>}
        {flagged && <li>🚩 Flagged: check its condition before export</li>}
      </ul>
      <p className="buy-done-hint">Print the audit sheet for the pile now, or from the buy's ⋯ on its day page later.</p>
    </Modal>
  );
}

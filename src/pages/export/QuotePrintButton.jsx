import { useState } from 'react';
import { useToast } from '../../components/Toast.jsx';
import { QUOTE_TITLE, quoteFileName, quoteSheet } from '../../lib/quotePrint.js';
import { deliver, openPrintTab } from './printTab.js';

/**
 * Print, on the Buy tab's walk-in list (decision 579): the buy as it stands, for the customer as an offer and for
 * staff as a check, one sheet for both (lib/quotePdf.js). The list's own prices and rates, nothing fetched;
 * nothing saved or logged. `waiting`: why the rates aren't ready yet (Settings still loading), as CONFIRM BUY waits.
 * @param {{ lines: object[], rates: object, waiting?: string|null }} p
 */
export default function QuotePrintButton({ lines, rates, waiting = null }) {
  const toast = useToast();
  const [printing, setPrinting] = useState(false);
  const empty = !(lines ?? []).some((l) => !l.struck_at);
  const blocked = empty ? 'Add cards first' : printing ? 'Printing…' : waiting;

  async function print() {
    if (blocked) return;
    // The tab now, while this is still the click: one opened after the PDF loads is a blocked pop-up.
    const tab = openPrintTab(QUOTE_TITLE, 'Laying out the cards…');
    setPrinting(true);
    try {
      const printedAt = new Date();
      const sheet = quoteSheet(lines, rates);
      // The PDF library loads only when something is printed.
      const { quotePdf } = await import('../../lib/quotePdf.js');
      deliver(quotePdf({ sheet, printedAt }), quoteFileName(printedAt), tab);
    } catch (e) {
      tab?.close();
      toast(`Couldn't print: ${e.message}`, 'err');
    } finally {
      setPrinting(false);
    }
  }

  return (
    <button
      type="button"
      className="btn small ghost quote-print-btn"
      disabled={Boolean(blocked)}
      title={blocked ?? "Print this buy as it stands: each card at what we'd pay in Cash and Credit, the offers at the foot. A quote for the customer, or a sheet to check the cards by. Nothing is saved."}
      onClick={print}
    >
      🖨 Print
    </button>
  );
}

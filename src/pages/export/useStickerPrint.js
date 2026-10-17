import { useCallback, useState } from 'react';
import { useToast } from '../../components/Toast.jsx';
import { useSettings } from '../../state/settings.jsx';
import { pokemonPrintLines } from '../../lib/auditPrint.js';
import { sellPriceFor } from '../../lib/sellPrice.js';
import { todaysPrices } from '../../lib/todaysPrices.js';
import { deliver, openPrintTab, setStep } from './printTab.js';

/**
 * EXPORT ▾ → Print PKM Stickers? (decision 281): the batch's Pokémon cards
 * priced again as the export prices Magic cards (today's prices, the Sell
 * Price rule: the full market price for the condition, rounded up, at least
 * $0.40), then a sticker a copy on the store's 160-sticker sheets
 * (lib/stickerPdf.js), downloaded and opened in the tab like the printouts.
 * Nothing is saved: the collection's prices stay as they are.
 * @returns {{ print: (p: { lines: object[], title: string, fileName: string }) => Promise<void>, printing: boolean }}
 */
export function useStickerPrint() {
  const toast = useToast();
  const { values } = useSettings();
  const [printing, setPrinting] = useState(false);

  const print = useCallback(async ({ lines, title, fileName }) => {
    if (printing) return;
    const chosen = pokemonPrintLines(lines);
    if (!chosen.length) {
      toast('No Pokémon cards to put stickers on.', 'err');
      return;
    }
    const tab = openPrintTab(title, "Fetching today's prices, then the stickers. It opens here when it's ready.");
    setPrinting(true);
    try {
      const today = await todaysPrices(chosen, { onStep: (text) => setStep(tab, text) });
      const pct = values.fallback_pct_pokemon;
      const priceOf = (line) => sellPriceFor(line, { ...today.get(line.id), pct }).price;
      setStep(tab, 'Laying out the stickers…');
      // The PDF library loads only when something is printed: the app starts as light as before.
      const { PER_SHEET, stickerPdf, stickerRows } = await import('../../lib/stickerPdf.js');
      const rows = stickerRows(chosen, priceOf);
      deliver(stickerPdf(rows), fileName, tab);
      const sheets = Math.ceil(rows.length / PER_SHEET);
      toast(`Stickers ready: ${rows.length} sticker${rows.length === 1 ? '' : 's'} on ${sheets} sheet${sheets === 1 ? '' : 's'}.`, 'ok');
    } catch (e) {
      tab?.close();
      toast(`Couldn't make the stickers: ${e.message}`, 'err');
    } finally {
      setPrinting(false);
    }
  }, [printing, toast, values]);

  return { print, printing };
}

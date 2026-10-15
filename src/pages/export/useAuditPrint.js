import { useCallback, useState } from 'react';
import { useToast } from '../../components/Toast.jsx';
import { matchLines } from '../../lib/ccExport.js';
import { UNMATCHED, auditSections, matchCategory, printLines, savedCategory } from '../../lib/auditPrint.js';

/** Hand the PDF over: downloaded, and shown in `tab` (opened at the click), else a new one. */
function deliver(doc, fileName, tab) {
  const url = URL.createObjectURL(doc.output('blob'));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  if (tab && !tab.closed) tab.location.href = url;
  else window.open(url, '_blank');
  // Long enough for the tab to load it.
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

/**
 * Print? and Print buy (docs/TEAM_FEEDBACK.md 3): the cards' Crystal
 * Commerce categories found without asking anything (the export's matching,
 * nothing remembered; exported cards from what their export saved), then the
 * PDF, downloaded and opened in a new tab. Writes nothing anywhere.
 * @returns {{ print: (p: { lines: object[], title: string, fileName: string }) => Promise<void>, printing: boolean }}
 */
export function useAuditPrint() {
  const toast = useToast();
  const [printing, setPrinting] = useState(false);

  const print = useCallback(async ({ lines, title, fileName }) => {
    if (printing) return;
    const chosen = printLines(lines);
    if (!chosen.length) {
      const magic = (lines ?? []).some((l) => l.game === 'mtg' && !l.bulk_kind);
      toast(magic
        ? 'Nothing to print: these cards were marked Completed without being exported.'
        : 'No Magic cards to print.', 'err');
      return;
    }
    // A tab opened now, while this is still the click: one opened after the
    // matching would be blocked as a pop-up.
    const tab = window.open('', '_blank');
    if (tab) {
      tab.document.title = 'Printout';
      tab.document.body.innerHTML = '<p style="font:16px system-ui,sans-serif;padding:24px;color:#555">Building the printout…</p>';
    }
    setPrinting(true);
    try {
      const toMatch = chosen.filter((l) => savedCategory(l) === undefined);
      const { results } = toMatch.length ? await matchLines(toMatch) : { results: [] };
      const byId = new Map(results.map((r) => [r.line.id, r]));
      const placed = chosen.map((line) => {
        const saved = savedCategory(line);
        return { line, category: saved !== undefined ? saved : matchCategory(byId.get(line.id)) };
      });
      const sections = auditSections(placed);
      // The PDF library loads only when something is printed: the app starts as light as before.
      const { auditPdf } = await import('../../lib/auditPdf.js');
      deliver(auditPdf({ title, sections }), fileName, tab);
      const cards = sections.reduce((n, s) => n + s.cards, 0);
      const unmatched = sections.find((s) => s.name === UNMATCHED)?.cards ?? 0;
      toast(`Printout ready: ${cards} card${cards === 1 ? '' : 's'}`
        + `${unmatched ? `, ${unmatched} Unmatched` : ''}.`, 'ok');
    } catch (e) {
      tab?.close();
      toast(`Couldn't print: ${e.message}`, 'err');
    } finally {
      setPrinting(false);
    }
  }, [printing, toast]);

  return { print, printing };
}

import { useCallback, useState } from 'react';
import { useToast } from '../../components/Toast.jsx';
import { matchLines, scryfallCards } from '../../lib/ccExport.js';
import { loadSets } from '../../lib/scryfall.js';
import {
  UNMATCHED, auditSections, cardBucket, matchCategory, printLines, savedCategory,
} from '../../lib/auditPrint.js';

const escapeHtml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * What the printout's tab shows while it's being built (owner, 2026-10-14):
 * the app's dark look, big bold white words and a spinner, all inline (no
 * file to fetch), so it's there the moment the tab opens.
 */
function loadingPage(title) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Building the printout…</title>
<style>
html, body { height: 100%; margin: 0; }
body {
  display: flex; align-items: center; justify-content: center;
  background: radial-gradient(ellipse at 50% 38%, #1b2036 0%, #0f1220 62%);
  color: #fff; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.box { display: flex; flex-direction: column; align-items: center; gap: 22px; padding: 40px 48px; text-align: center;
  background: #181c2e; border: 1px solid #2c3350; border-radius: 16px; box-shadow: 0 24px 70px rgba(0, 0, 0, .5); }
.spin { width: 58px; height: 58px; border-radius: 50%; border: 6px solid rgba(108, 140, 255, .22);
  border-top-color: #6c8cff; animation: spin .8s linear infinite; }
h1 { margin: 0; font-size: 34px; font-weight: 800; letter-spacing: .01em; }
p { margin: 0; font-size: 17px; font-weight: 600; color: #9aa1bd; }
.what { font-size: 19px; font-weight: 700; color: #e6e8f0; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spin { animation-duration: 2.4s; } }
</style></head><body><div class="box"><div class="spin" aria-hidden="true"></div>
<h1>Building the printout…</h1><p class="what">${escapeHtml(title)}</p>
<p>Finding each card's Crystal Commerce category. It opens here when it's ready.</p></div></body></html>`;
}

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

const SYMBOL_PX = 64;   // drawn 17pt tall: sharp on paper
// Scryfall's promo shooting star (Secret Lair's own symbol): the symbol for a
// set without one of its own (owner, 2026-10-14): no icon, Scryfall's
// generic default.svg, or one that won't load.
const STAR = 'https://svgs.scryfall.io/sets/star.svg';
const symbolCache = new Map();   // icon address → its drawing, this page's life

/**
 * A set's symbol for its category's band (owner, 2026-10-14): Scryfall's SVG,
 * drawn white at SYMBOL_PX tall on a canvas, as a PNG the PDF can hold.
 * Asked for with its own address (`?print=1`): Scryfall's SVG host sends its
 * CORS header only when asked, and a copy a plain <img> cached would taint
 * the canvas (as Suggestions' set masks found).
 * @returns {Promise<{ data: string, ratio: number }>}
 */
function setSymbol(uri) {
  if (!symbolCache.has(uri)) {
    const drawing = drawSymbol(uri);
    drawing.catch(() => symbolCache.delete(uri));   // a failure is tried again next time
    symbolCache.set(uri, drawing);
  }
  return symbolCache.get(uri);
}
async function drawSymbol(uri) {
  const res = await fetch(`${uri}${uri.includes('?') ? '&' : '?'}print=1`, { mode: 'cors' });
  if (!res.ok) throw new Error(`symbol ${res.status}`);
  let svg = await res.text();
  // A "not found" page isn't a symbol, whatever it answered with.
  if (!/<svg[\s>]/i.test(svg)) throw new Error('not an SVG');
  const box = /viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(svg);
  const ratio = box ? Number(box[1]) / Number(box[2]) || 1 : 1;
  const w = Math.max(1, Math.round(SYMBOL_PX * ratio));
  // Its own size, so it's drawn sharp rather than stretched from a small default.
  svg = svg.replace(/<svg\b([^>]*)>/, (_, attrs) => `<svg${attrs.replace(/\s(width|height)="[^"]*"/g, '')} width="${w}" height="${SYMBOL_PX}">`);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('symbol image'));
      i.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = SYMBOL_PX;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, SYMBOL_PX);
    // White, for the black band.
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, SYMBOL_PX);
    return { data: canvas.toDataURL('image/png'), ratio };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The sections' set symbols, by set code; one that won't load is left off, nothing more. */
async function symbolsFor(sections) {
  const codes = [...new Set(sections.map((s) => s.set).filter(Boolean))];
  if (!codes.length) return {};
  let sets;
  try {
    sets = await loadSets();
  } catch {
    return {};
  }
  const out = {};
  await Promise.all(codes.map(async (code) => {
    const uri = sets.get(code)?.icon_svg_uri;
    const own = uri && !/\/sets\/default\.svg/.test(uri) ? uri : null;
    try {
      out[code] = await setSymbol(own ?? STAR);
    } catch {
      try {
        out[code] = await setSymbol(STAR);
      } catch {
        // No symbol on that band: its name and set code still say it.
      }
    }
  }));
  return out;
}

/**
 * Print? and Print buy (docs/TEAM_FEEDBACK.md 3): the cards' Crystal
 * Commerce categories found without asking anything (the export's matching,
 * nothing remembered; exported cards from what their export saved), each
 * card's colour from Scryfall (pull-pdf's colour groups), the sets' symbols,
 * then the PDF, downloaded and opened in a new tab. Writes nothing anywhere.
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
      tab.document.open();
      tab.document.write(loadingPage(title));
      tab.document.close();
    }
    setPrinting(true);
    try {
      const toMatch = chosen.filter((l) => savedCategory(l) === undefined);
      const { results, cards } = toMatch.length ? await matchLines(toMatch) : { results: [], cards: new Map() };
      // Exported cards weren't matched: their Scryfall cards (for their colour) on their own.
      const missing = chosen.map((l) => l.scryfall_id).filter((id) => id && !cards.has(id));
      const more = missing.length ? await scryfallCards(missing) : new Map();
      const byId = new Map(results.map((r) => [r.line.id, r]));
      const placed = chosen.map((line) => {
        const saved = savedCategory(line);
        return {
          line,
          category: saved !== undefined ? saved : matchCategory(byId.get(line.id)),
          bucket: cardBucket(cards.get(line.scryfall_id) ?? more.get(line.scryfall_id)),
        };
      });
      const sections = auditSections(placed);
      // The PDF library loads only when something is printed: the app starts as light as before.
      const [{ auditPdf }, symbols] = await Promise.all([import('../../lib/auditPdf.js'), symbolsFor(sections)]);
      deliver(auditPdf({ title, sections, symbols }), fileName, tab);
      const count = sections.reduce((n, s) => n + s.cards, 0);
      const unmatched = sections.find((s) => s.name === UNMATCHED)?.cards ?? 0;
      toast(`Printout ready: ${count} card${count === 1 ? '' : 's'}`
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

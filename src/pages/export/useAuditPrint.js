import { useCallback, useState } from 'react';
import { useToast } from '../../components/Toast.jsx';
import { matchLines, scryfallCards } from '../../lib/ccExport.js';
import { loadSets } from '../../lib/scryfall.js';
import {
  UNMATCHED, auditSections, cardBucket, flagBanner, flaggedBuys, matchCategory, pokemonPrintLines,
  pokemonSections, printLines, savedCategory,
} from '../../lib/auditPrint.js';
import { sellPriceFor } from '../../lib/sellPrice.js';
import { todaysPrices } from '../../lib/todaysPrices.js';
import { useBulkCut, useSettings, useSettingsReady } from '../../state/settings.jsx';
import { isBulkPrice, keptWords } from '../../lib/bulkCut.js';
import { deliver, openPrintTab, setStep } from './printTab.js';

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
 * Flagged buys on a printout (decision 301), from each card's flagged buy:
 * a red banner naming them on every page (owner, 2026-10-18: "Just the
 * header is fine, the outlines and the chips are overkill").
 */
function flagging(cardFlags) {
  const flags = flaggedBuys(cardFlags);
  return { flags, flagText: flagBanner(flags) };
}

/** The printout toast's word on flagged buys, or nothing. */
const flaggedNote = (flags) => (flags.length ? ` 🚩 ${flags.join(', ')} flagged: check condition.` : '');

/**
 * Print? and Print buy (docs/TEAM_FEEDBACK.md 3): the cards' Crystal
 * Commerce categories found without asking anything (the export's matching,
 * nothing remembered; exported cards from what their export saved), each
 * card's colour from Scryfall (pull-pdf's colour groups), the sets' symbols,
 * then the PDF, downloaded and opened in a new tab. Writes nothing anywhere.
 * `load` instead of `lines`: the cards fetched once the tab is open (a
 * collection's ⋯ on the Collections tab, whose cards aren't loaded yet).
 * `game: 'pokemon'` is Print PKM? (decision 280): the batch's Pokémon cards
 * by set instead of by category, nothing matched or fetched.
 * `flagOf`: a card's flagged buy ("Buy 42", decision 301: its buy flagged
 * for a condition check), or null; the printout says so in red, Magic or Pokémon.
 * @returns {{ print: (p: { lines?: object[], load?: () => Promise<object[]>, title: string, fileName: string,
 *   game?: 'mtg'|'pokemon', flagOf?: (line: object) => string|null }) => Promise<void>, printing: boolean }}
 */
export function useAuditPrint() {
  const toast = useToast();
  const { values } = useSettings();
  const ready = useSettingsReady();   // prices at the store's percentages, not the built-in ones (decision 389)
  const cut = useBulkCut();
  const [printing, setPrinting] = useState(false);

  // `over1`: Print MTG (>…) (decision 405): only the cards whose market price today is over the Bulk
  // export rates' amber (decision 416).
  const print = useCallback(async ({ lines, load, title, fileName, game = 'mtg', flagOf = null, over1 = false }) => {
    if (printing || !ready()) return;
    const pokemon = game === 'pokemon';
    const choose = pokemon ? pokemonPrintLines : printLines;
    const nothing = (all) => {
      if (pokemon) {
        toast('No Pokémon cards to print.', 'err');
        return;
      }
      const magic = (all ?? []).some((l) => l.game === 'mtg' && !l.bulk_kind && !l.struck_at);
      toast(magic
        ? 'Nothing to print: these cards were marked Completed without being exported.'
        : 'No Magic cards to print.', 'err');
    };
    let chosen = load ? null : choose(lines);
    if (chosen && !chosen.length) {
      nothing(lines);
      return;
    }
    // A tab opened now, while this is still the click: one opened after the
    // matching would be blocked as a pop-up (printTab.js).
    const tab = openPrintTab(title, pokemon
      ? "Sorting the cards by set. It opens here when it's ready."
      : "Finding each card's Crystal Commerce category. It opens here when it's ready.");
    setPrinting(true);
    try {
      if (load) {
        const all = await load();
        chosen = choose(all);
        if (!chosen.length) {
          tab?.close();
          nothing(all);
          return;
        }
      }
      // Today's market price on every row (decision 404), as the export and the stickers work it
      // out: today's price for the card's condition, before the Sell Price's steps and floor.
      setStep(tab, "Fetching today's prices…");
      const today = await todaysPrices(chosen, { onStep: (text) => setStep(tab, text), backup: true });
      const pct = values[pokemon ? 'fallback_pct_pokemon' : 'fallback_pct_mtg'];
      const prices = new Map(chosen.map((l) => [l.id, sellPriceFor(l, { ...today.get(l.id), pct }).value]));
      const priceOf = (line) => prices.get(line.id) ?? null;
      if (over1) {
        chosen = chosen.filter((l) => !isBulkPrice(priceOf(l) ?? 0, cut));
        if (!chosen.length) {
          tab?.close();
          toast(`No Magic cards at ${keptWords(cut)} today: nothing to print.`, 'err');
          return;
        }
      }
      setStep(tab, pokemon ? 'Sorting the cards by set…' : "Finding each card's Crystal Commerce category…");
      if (pokemon) {
        const sections = pokemonSections(chosen, priceOf);
        const { flagText, flags } = flagging(chosen.map((l) => flagOf?.(l) ?? null));
        const { auditPdf } = await import('../../lib/auditPdf.js');
        deliver(auditPdf({ title, sections, flagText, cut }), fileName, tab);
        const count = sections.reduce((n, s) => n + s.cards, 0);
        toast(`Printout ready: ${count} card${count === 1 ? '' : 's'} in ${sections.length} set${sections.length === 1 ? '' : 's'}.`
          + flaggedNote(flags), 'ok');
        return;
      }
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
          price: priceOf(line),
        };
      });
      const sections = auditSections(placed);
      const { flagText, flags } = flagging(chosen.map((l) => flagOf?.(l) ?? null));
      // The PDF library loads only when something is printed: the app starts as light as before.
      const [{ auditPdf }, symbols] = await Promise.all([import('../../lib/auditPdf.js'), symbolsFor(sections)]);
      deliver(auditPdf({ title, sections, symbols, flagText, cut }), fileName, tab);
      const count = sections.reduce((n, s) => n + s.cards, 0);
      const unmatched = sections.find((s) => s.name === UNMATCHED)?.cards ?? 0;
      toast(`Printout ready: ${count} card${count === 1 ? '' : 's'}`
        + `${unmatched ? `, ${unmatched} Unmatched` : ''}.` + flaggedNote(flags), 'ok');
    } catch (e) {
      tab?.close();
      toast(`Couldn't print: ${e.message}`, 'err');
    } finally {
      setPrinting(false);
    }
  }, [printing, ready, toast, values, cut]);

  return { print, printing };
}

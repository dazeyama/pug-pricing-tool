import { useRef, useState } from 'react';
import { useDismiss } from '../lib/useDismiss.js';
import { decklistText } from '../lib/decklist.js';
import { useToast } from './Toast.jsx';
import MenuItems from './MenuItems.jsx';
import { useBulkCut } from '../state/settings.jsx';
import { bulkWords, keptTag, keptWords } from '../lib/bulkCut.js';

/**
 * The blue EXPORT button (docs/EXPORT_FUNCTION.md 8): on the day pages and a
 * collection's screen; the page's `onClick` runs its export. `blocked`: why
 * it can't run now (today on a day page, Pokémon); it looks disabled, and
 * `onClick` says why. `count` (with `countTitle`), when given, follows the
 * word: "EXPORT (42)". `label`: COMPLETE on Pokémon days (owner, 2026-10-02).
 *
 * With `onPrint` (docs/TEAM_FEEDBACK.md 3.1), it opens a small menu instead,
 * in two groups (decision 422; MenuItems): **Print ▸** holds **Print MTG
 * (all)** and **(>…)** (the audit printout; "Print?" until the owner's
 * 2026-10-16 request, decision 280; the cut decisions 405, 416), **Print MTG in
 * buy order** (`onPrint(false, true)`, decision 444), **Print
 * PKM?** (`onPrintPokemon`, decision 280: the Pokémon cards by set;
 * `printPokemonBlocked` says why not) and **Print PKM Stickers?**
 * (`onPrintStickers`, decision 281: price-tag stickers at today's sell
 * prices; `printStickersBlocked`); **Export ▸** holds **Export csv (all)**
 * and **(>…)** with `splitExport`, else the one export item sits on the root
 * (`onClick`, exactly the EXPORT it was; `exportLabel` and `exportTitle`
 * word it otherwise, `exportBlocked` greys it alone: a Pokémon day's
 * **Complete Day** before the day is over, decision 282). A group of one is
 * shown as its item. Print MTG only
 * with `onPrint`: a Pokémon day has the other two. Blocked, it still just says why. `up`: the menu opens
 * upward (a button at the foot of the screen); `printing`: a printout is
 * being built.
 *
 * With `copyLines`, Ctrl+Click (a secret, decision 285) copies those cards to
 * the clipboard as a plain decklist, "<quantity> <card name>" a line, for
 * Moxfield and the like, and says so in a toast (`copyEmpty`: the toast when
 * there's nothing to copy). It changes nothing, so it works even when the
 * button is blocked; no menu opens.
 */
export default function ExportButton({
  className = '', onClick, onPrint = null, printing = false, up = false,
  onPrintPokemon = null, printPokemonBlocked = null, onPrintStickers = null, printStickersBlocked = null,
  exportLabel = 'Export csv', exportTitle = 'The Crystal Commerce Mass Create file: the export', exportBlocked = null,
  blocked = null, count = null, countTitle, label = 'EXPORT', copyLines = null, copyEmpty = 'No cards to copy.',
  splitExport = false,
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const toast = useToast();
  const cut = useBulkCut();
  const menu = Boolean(onPrint || onPrintPokemon || onPrintStickers);

  useDismiss(() => setOpen(false), { ref: wrap, when: open });

  async function copyDecklist() {
    const list = decklistText(copyLines);
    if (!list.cards) {
      toast(copyEmpty, 'err');
      return;
    }
    try {
      await navigator.clipboard.writeText(list.text);
      toast(`Copied ${list.cards} card${list.cards === 1 ? '' : 's'} as a decklist (${list.names} line${list.names === 1 ? '' : 's'}).`, 'ok');
    } catch {
      toast("Couldn't copy to the clipboard.", 'err');
    }
  }

  const button = (
    <button
      type="button"
      className={`btn export-btn ${className}${blocked ? ' is-disabled' : ''}`}
      aria-disabled={blocked ? true : undefined}
      aria-haspopup={menu ? 'menu' : undefined}
      aria-expanded={menu ? open : undefined}
      title={blocked ?? (count != null ? countTitle : undefined)}
      onClick={(e) => {
        if (copyLines && (e.ctrlKey || e.metaKey)) {
          setOpen(false);
          copyDecklist();
        } else if (menu && !blocked) setOpen((o) => !o);
        else onClick();
      }}
    >
      {label}{count != null && ` (${count})`}{menu && <span className="export-caret" aria-hidden="true"> ▾</span>}
    </button>
  );
  if (!menu) return button;

  // A printout under way blocks every print item; a print blocked for its own reason still says why.
  const printItem = (label, title, blockedWhy, run) => ({
    label: printing ? 'Printing…' : label,
    blocked: printing ? 'Printing…' : blockedWhy,
    saysWhy: !printing,
    title,
    onClick: run,
  });
  const items = [
    {
      label: 'Print',
      items: [
        // Print MTG (all) and (>…) (decision 405): every card, or the ones over the Export rates for
        // bulk's amber today (decision 416).
        ...(onPrint ? [false, true].map((over1) => printItem(
          `Print MTG (${over1 ? keptTag(cut) : 'all'})`,
          over1
            ? `A PDF of these Magic cards at ${keptWords(cut)} today, by Crystal Commerce category, with today's prices. Changes nothing.`
            : "A PDF of these Magic cards by Crystal Commerce category, with today's prices, to check them by hand. Changes nothing.",
          null,
          () => onPrint(over1),
        )) : []),
        // Print MTG in buy order (decision 444): every card as added, a row each, no sections.
        onPrint && printItem('Print MTG in buy order',
          "A PDF of these Magic cards in the order they were added, a row for each, with today's prices. Changes nothing.",
          null, () => onPrint(false, true)),
        onPrintPokemon && printItem('Print PKM?', 'A PDF of these Pokémon cards by set, to check them by hand. Changes nothing.',
          printPokemonBlocked, () => onPrintPokemon()),
        onPrintStickers && printItem('Print PKM Stickers?',
          "Price-tag stickers for these Pokémon cards at today's sell prices, a sticker a copy, for the store's 160-sticker sheets. Changes nothing.",
          printStickersBlocked, () => onPrintStickers()),
      ],
    },
    {
      label: 'Export',
      // `splitExport` (decision 406): Export MTG csv (all), as it was, and (>…), whose bulk cards (the
      // Export rates for bulk, decision 416) are pulled to Bulk pulled from exports. Blocked, it says why.
      items: (splitExport ? [false, true] : [null]).map((over1) => ({
        label: over1 == null ? exportLabel : `${exportLabel} (${over1 ? keptTag(cut) : 'all'})`,
        blocked: exportBlocked,
        saysWhy: true,
        title: over1
          ? `The Crystal Commerce Mass Create file of the cards whose Sell Price is ${keptWords(cut)}; the ones at ${bulkWords(cut)} are pulled to Bulk pulled from exports`
          : exportTitle,
        onClick: () => (over1 == null ? onClick() : onClick(over1)),
      })),
    },
  ];
  return (
    <span className={`export-menu ${className}`} ref={wrap}>
      {button}
      {open && (
        <div className={`more-list export-list${up ? ' up' : ''}`} role="menu">
          <MenuItems
            items={items}
            needsUser={false}
            onPick={(item) => {
              setOpen(false);
              item.onClick();
            }}
          />
        </div>
      )}
    </span>
  );
}

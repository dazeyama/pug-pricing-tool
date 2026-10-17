import { useRef, useState } from 'react';
import { useDismiss } from '../lib/useDismiss.js';

/**
 * The blue EXPORT button (docs/EXPORT_FUNCTION.md 8): on the day pages and a
 * collection's screen; the page's `onClick` runs its export. `blocked`: why
 * it can't run now (today on a day page, Pokémon); it looks disabled, and
 * `onClick` says why. `count` (with `countTitle`), when given, follows the
 * word: "EXPORT (42)". `label`: COMPLETE on Pokémon days (owner, 2026-10-02).
 *
 * With `onPrint` (docs/TEAM_FEEDBACK.md 3.1), it opens a small menu instead:
 * **Print MTG?** (the audit printout; "Print?" until the owner's 2026-10-16
 * request, decision 280), **Print PKM?** (`onPrintPokemon`, decision 280:
 * the Pokémon cards by set; `printPokemonBlocked` says why not), **Print
 * PKM Stickers?** (`onPrintStickers`, decision 281: price-tag stickers at
 * today's sell prices; `printStickersBlocked`) and **Export csv**
 * (`onClick`, exactly the EXPORT it was). Blocked, it still just says why. `up`: the menu opens
 * upward (a button at the foot of the screen); `printing`: a printout is
 * being built.
 */
export default function ExportButton({
  className = '', onClick, onPrint = null, printing = false, up = false,
  onPrintPokemon = null, printPokemonBlocked = null, onPrintStickers = null, printStickersBlocked = null,
  blocked = null, count = null, countTitle, label = 'EXPORT',
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const menu = Boolean(onPrint);

  useDismiss(() => setOpen(false), { ref: wrap, when: open });

  const button = (
    <button
      type="button"
      className={`btn export-btn ${className}${blocked ? ' is-disabled' : ''}`}
      aria-disabled={blocked ? true : undefined}
      aria-haspopup={menu ? 'menu' : undefined}
      aria-expanded={menu ? open : undefined}
      title={blocked ?? (count != null ? countTitle : undefined)}
      onClick={() => {
        if (menu && !blocked) setOpen((o) => !o);
        else onClick();
      }}
    >
      {label}{count != null && ` (${count})`}{menu && <span className="export-caret" aria-hidden="true"> ▾</span>}
    </button>
  );
  if (!menu) return button;
  return (
    <span className={`export-menu ${className}`} ref={wrap}>
      {button}
      {open && (
        <div className={`more-list export-list${up ? ' up' : ''}`} role="menu">
          <button
            type="button"
            role="menuitem"
            className={`more-item${printing ? ' is-disabled' : ''}`}
            aria-disabled={printing || undefined}
            title="A PDF of these Magic cards by Crystal Commerce category, to check them by hand. Changes nothing."
            onClick={() => {
              if (printing) return;
              setOpen(false);
              onPrint();
            }}
          >
            {printing ? 'Printing…' : 'Print MTG?'}
          </button>
          {onPrintPokemon && (
            <button
              type="button"
              role="menuitem"
              className={`more-item${printing || printPokemonBlocked ? ' is-disabled' : ''}`}
              aria-disabled={printing || Boolean(printPokemonBlocked) || undefined}
              title={printPokemonBlocked ?? 'A PDF of these Pokémon cards by set, to check them by hand. Changes nothing.'}
              onClick={() => {
                if (printing) return;
                setOpen(false);
                onPrintPokemon();
              }}
            >
              {printing ? 'Printing…' : 'Print PKM?'}
            </button>
          )}
          {onPrintStickers && (
            <button
              type="button"
              role="menuitem"
              className={`more-item${printing || printStickersBlocked ? ' is-disabled' : ''}`}
              aria-disabled={printing || Boolean(printStickersBlocked) || undefined}
              title={printStickersBlocked
                ?? "Price-tag stickers for these Pokémon cards at today's sell prices, a sticker a copy, for the store's 160-sticker sheets. Changes nothing."}
              onClick={() => {
                if (printing) return;
                setOpen(false);
                onPrintStickers();
              }}
            >
              {printing ? 'Printing…' : 'Print PKM Stickers?'}
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="more-item"
            title="The Crystal Commerce Mass Create file: the export"
            onClick={() => {
              setOpen(false);
              onClick();
            }}
          >
            Export csv
          </button>
        </div>
      )}
    </span>
  );
}

import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { lineBody, lineText } from '../../lib/lineFormat.js';
import { formatMoney } from '../../lib/money.js';
import { rateTotals } from '../../lib/rates.js';
import { bulkItem, cardCounts, countText, isBulk, isValuedBulk, perText } from '../../lib/bulk.js';
import { isStruck, movesOn, struckNote } from '../../lib/struck.js';
import CustomRateMark from '../../components/CustomRateMark.jsx';
import { formatPhone } from '../../lib/phone.js';
import { formatDateTime, formatTime } from '../../lib/time.js';
import { colorVar } from '../../lib/palette.js';
import MoreMenu from '../../components/MoreMenu.jsx';
import UserTag from '../../components/UserTag.jsx';
import LinePreview, { previewFor } from '../../components/LinePreview.jsx';
import { statusLabel, statusTone, walkInStatus } from '../collections/status.js';
import { GAME_NAMES } from '../../lib/games.js';
import { useDismiss } from '../../lib/useDismiss.js';
import { COMPLETED_LOCK, MARKED_LOCK, convertLines, markedByHand } from './dayRules.js';
import { PULLED_TIP } from '../collections/useCollection.js';
import { useBulkCut } from '../../state/settings.jsx';
import { bulkWords, keptTag, keptWords } from '../../lib/bulkCut.js';

// A buy on a day page (spec 10.2): its panel, with its cards, totals, chips and ⋯ (FABLE_REPORT C2).

const CANT_UPLOAD_TIP = "Not matched to Crystal Commerce: pulled from the upload. It's in Can't upload cards.";

/** The price a row shows: its Sell Price once exported (export spec 5.5), else the buy price. */
const shownPrice = (l) => Number(l.cc_sell_price ?? l.unit_price);

/**
 * Market, Cash and Credit for some of a buy's lines, each card at the rates
 * kept on it when the buy was confirmed (docs/TEAM_FEEDBACK.md 4.4, 4.6); from
 * the Sell Prices once exported (owner, 2026-10-01). `tiers` only says why a
 * card's rate differs.
 */
function totalsFor(lines, buy, tiers) {
  return rateTotals(lines, {
    cash: Number(buy.cash_pct),
    credit: Number(buy.credit_pct),
    customCash: buy.custom_cash_pct != null ? Number(buy.custom_cash_pct) : null,
    customCredit: buy.custom_credit_pct != null ? Number(buy.custom_credit_pct) : null,
    tiers,
  }, shownPrice);
}

/**
 * The buy's condition chip (owner, 2026-10-14): 🚩 Check condition while it's
 * flagged, which asks "✅ Condition checked?" (Yes takes the flag off); once
 * checked, a green ✅ Condition checked for good, saying who and when. A buy
 * never flagged has none.
 */
function ConditionChip({ buy, byId, blocked, onChecked }) {
  const [asking, setAsking] = useState(false);
  const wrap = useRef(null);
  useDismiss(() => setAsking(false), { ref: wrap, when: asking });

  if (buy.condition_check) {
    return (
      <span className="flag-wrap" ref={wrap}>
        <button
          type="button"
          className="flag-chip"
          aria-expanded={asking}
          title="Flagged: check its cards' condition before export. Click when it's checked."
          onClick={() => setAsking((a) => !a)}
        >
          🚩 Check condition
        </button>
        {asking && (
          <span className="flag-pop" role="dialog" aria-label="Condition checked?">
            <span className="flag-pop-q"><span aria-hidden="true">✅</span> Condition checked?</span>
            <span className="flag-pop-buttons">
              <button type="button" className="btn small ghost" onClick={() => setAsking(false)}>No</button>
              <button
                type="button"
                className={`btn small flag-yes${blocked ? ' is-disabled' : ''}`}
                aria-disabled={blocked ? true : undefined}
                title={blocked ?? 'Take the 🚩 flag off: its condition is checked'}
                onClick={() => {
                  if (blocked) return;
                  setAsking(false);
                  onChecked();
                }}
              >
                Yes
              </button>
            </span>
          </span>
        )}
      </span>
    );
  }
  if (!buy.condition_checked_at) return null;
  const who = byId(buy.condition_checked_by)?.name;
  return (
    <span className="flag-chip checked" title={`Condition checked${who ? ` by ${who}` : ''}, ${formatDateTime(buy.condition_checked_at)}`}>
      ✅ Condition checked
    </span>
  );
}

/** One buy on a day page (spec 10.2). */
export default function BuyPanel({
  buy, number, skus = [], game, other, day, byId, busy, offline, hits, flash, onRemove, onRestore, onDelete, onComplete, onConvert,
  onConvertCollection,
  onExport, onUnexport, onDownloadAgain, onEditView, onPrint, onPrintStickers, printing, onFlag, tiers,
}) {
  const [preview, setPreview] = useState(null);   // { src, top, left } while a line is hovered
  const cut = useBulkCut();
  const hidePreview = useCallback(() => setPreview(null), []);
  const panel = useRef(null);
  const table = useRef(null);
  const [menu, setMenu] = useState(null);   // { line, top, left }: a struck card's right-click menu
  const user = byId(buy.confirmed_by);
  const lines = buy.buy_lines.filter((l) => l.game === game);
  // The other game's cards, bulk apart as CONFIRM BUY counts them; a placeholder is a card (owner, 2026-10-16).
  const otherCounts = cardCounts(buy.buy_lines.filter((l) => l.game === other && !isStruck(l)));
  const others = otherCounts.cards + otherCounts.bulk;
  const t = totalsFor(lines, buy, tiers);
  // Paid/Ours, or Completed once exported (owner, 2026-09-30): locked like a Completed collection.
  const status = walkInStatus(buy, game);
  const completed = status === 'completed';
  const anyCompleted = buy.buy_lines.some((l) => l.completed_at);
  // Completed from this ⋯ rather than by an export (owner, 2026-10-02): it can go back on its own.
  // Bulk and struck cards are never completed: only the others say how.
  const byHand = completed && lines.filter(movesOn).every(markedByHand);
  // Some cards still Completed by hand on a buy that isn't (its export undone, decision 340): they
  // come back from here too, not only after Mark as completed has completed the rest (decision 396).
  const someByHand = !completed && lines.some(markedByHand);
  const lockedWhy = (l) => (markedByHand(l) ? MARKED_LOCK : COMPLETED_LOCK);
  const locked = buy.buy_lines.find((l) => l.completed_at);
  // This game's side Completed: every line of it locked, bulk, placeholders and struck cards too (decision 353).
  const sideDone = lines.find((l) => l.completed_at) ?? null;
  const offOrBusy = offline ? 'No connection' : busy ? 'Saving…' : null;

  /** Right-click on a struck card: Restore, where the pointer is (lib/struck.js). */
  function openMenu(e, l) {
    if (!isStruck(l) || !table.current) return;   // other cards: the browser's own menu
    e.preventDefault();
    hidePreview();
    const zoom = table.current.currentCSSZoom ?? 1;
    const b = table.current.getBoundingClientRect();
    setMenu({ line: l, left: (e.clientX - b.left) / zoom, top: (e.clientY - b.top) / zoom });
  }
  // The menu goes on any click elsewhere, Esc or a scroll.
  useDismiss(() => setMenu(null), { inside: '.rate-menu', when: Boolean(menu), scroll: true });

  return (
    <article
      className={`cardpanel buy-panel${completed ? ' completed' : ''}${flash ? ' flash-target' : ''}`}
      ref={panel}
      data-buy={buy.id}
      style={{ '--c': colorVar(user?.color ?? 'pal-slate') }}
    >
      <header className="cardpanel-head buy-panel-head">
        <strong className="buy-number">Buy {number}</strong>
        <UserTag user={user} />
        <span className="buy-time">{formatTime(buy.confirmed_at)}</span>
        <ConditionChip buy={buy} byId={byId} blocked={offOrBusy} onChecked={() => onFlag(buy, number, false)} />
        <span className={`status-chip ${statusTone({ kind: 'walk_in', status, paid_method: buy.paid_method })}`}>
          {statusLabel(status)}
        </span>
        {/* Export single buy's Custom SKU, "<day>-<number>" (0071), on the buy it belongs to. */}
        {skus.map((s) => (
          <span key={s} className="sku-chip compact" title="The Custom SKU on this buy's own export">
            Custom SKU <strong>{s}</strong>
          </span>
        ))}
        <MoreMenu
          items={[
            // ✅ Condition checked, pinned first while the buy is flagged (owner, 2026-10-14).
            ...(buy.condition_check ? [{
              label: '✅ Condition checked',
              blocked: offOrBusy,
              title: "Its cards' condition is checked: take the 🚩 flag off",
              onClick: () => onFlag(buy, number, false),
            }] : []),
            // Owner, 2026-10-02: one buy Completed without exporting it, and back.
            // An exported buy goes back with its export undone, after asking (owner, 2026-10-09).
            completed ? {
              label: byHand ? 'Mark Paid/Ours again' : 'Mark Paid/Ours again…',
              blocked: offOrBusy,
              title: byHand
                ? `Unlock this buy's ${GAME_NAMES[game]} cards: back in the header search and this day's export`
                : `Undo this buy's export: its ${GAME_NAMES[game]} cards become Paid/Ours again; the rest of the day stays as it is`,
              onClick: () => (byHand ? onComplete(buy, number, false) : onUnexport(buy, number)),
            } : {
              label: 'Mark as completed',
              blocked: offOrBusy ?? (lines.length ? null : `No ${GAME_NAMES[game]} cards in this buy`),
              title: `Mark this buy's ${GAME_NAMES[game]} cards Completed without exporting them${game === 'mtg' ? ', and struck (something else happened to them)' : ''}: locked, left out of the header search and of this day's export`,
              onClick: () => onComplete(buy, number, true),
            },
            ...(someByHand ? [{
              label: 'Mark Paid/Ours again',
              blocked: offOrBusy,
              title: `Unlock this buy's ${GAME_NAMES[game]} cards marked Completed by hand: back in the header search and this day's export`,
              onClick: () => onComplete(buy, number, false),
            }] : []),
            // Print ▸, Export ▸, Convert ▸ (owner, 2026-10-21; decision 422): the eight lines they were
            // in three groups, each opening beside the menu (MenuItems.jsx).
            {
              label: 'Print',
              items: game === 'mtg'
                // Print buy (owner, 2026-10-14; docs/TEAM_FEEDBACK.md 3.1): this buy's Magic cards by
                // Crystal Commerce category, for a single-buy export; (all) and (>…) (decisions 409, 416).
                ? [false, true].map((over1) => ({
                  label: `Print buy (${over1 ? keptTag(cut) : 'all'})`,
                  needsUser: false,
                  blocked: offline ? 'No connection' : printing ? 'Printing…' : lines.length ? null : 'No Magic cards in this buy',
                  title: over1
                    ? `A PDF of this buy's Magic cards bought at a market price of ${keptWords(cut)}, by Crystal Commerce category, with today's prices. Changes nothing.`
                    : "A PDF of this buy's Magic cards by Crystal Commerce category, with today's prices, to check them by hand. Changes nothing.",
                  onClick: () => onPrint(buy, number, over1),
                }))
                // A Pokémon buy (decision 283), mirroring a Magic buy's Print buy: its cards by set
                // (Print PKM?), and price-tag stickers for them (Print PKM Stickers?).
                : [{
                  label: 'Print buy',
                  needsUser: false,
                  blocked: printing ? 'Printing…' : lines.length ? null : 'No Pokémon cards in this buy',
                  title: "A PDF of this buy's Pokémon cards by set, to check them by hand. Changes nothing.",
                  onClick: () => onPrint(buy, number),
                }, {
                  label: 'Print stickers',
                  needsUser: false,
                  blocked: offline ? 'No connection' : printing ? 'Printing…' : lines.length ? null : 'No Pokémon cards in this buy',
                  title: "Price-tag stickers for this buy's Pokémon cards at today's sell prices, a sticker a copy, for the store's 160-sticker sheets. Changes nothing.",
                  onClick: () => onPrintStickers(buy, number),
                }],
            },
            // Export single buy (owner, 2026-10-09): Magic only, like EXPORT, but any day, today's too.
            // (all) and (>…) as the day's EXPORT (decision 408): (>…) pulls the bulk cards (decision 416).
            ...(game === 'mtg' ? [{
              label: 'Export',
              items: [
                ...[false, true].map((over1) => ({
                  label: `Export single buy (${over1 ? keptTag(cut) : 'all'})`,
                  blocked: offOrBusy ?? (completed ? (skus.length ? 'Already Completed: ◂ Export → Download its file again' : 'Already Completed')
                    : lines.length ? null : 'No Magic cards in this buy'),
                  title: over1
                    ? `Export this buy's Magic cards whose Sell Price is ${keptWords(cut)}; the ones at ${bulkWords(cut)} are pulled to Bulk pulled from exports. The buy is Completed, the rest of the day isn't`
                    : "Export just this buy's Magic cards to Crystal Commerce now; the buy is Completed, the rest of the day isn't",
                  onClick: () => onExport(buy, number, over1),
                })),
                // Its own file again (decision 386), once exported on its own: nothing changes.
                ...(skus.length ? [{
                  label: 'Download its file again',
                  needsUser: false,
                  blocked: offline ? 'No connection' : null,
                  title: "Download the same file Export single buy made for this buy, from its exported cards. Changes nothing.",
                  onClick: () => onDownloadAgain(buy, number),
                }] : []),
              ],
            }] : []),
            {
              label: 'Convert',
              items: [{
                label: 'Convert to project',
                // Completed cards are skipped, and the buy stays with them (decision 296), with all of a
                // Completed game (decision 393).
                blocked: offOrBusy ?? (convertLines(buy).some((l) => !l.struck_at && !l.bulk_kind)
                  ? null : 'Nothing left to move: every card is Completed, struck, or in a Completed game'),
                title: 'Move this buy\'s live cards, both games, into a new project; Completed cards stay here',
                onClick: () => onConvert(buy, number),
              }, {
                // The same, into an overnight buy (owner, 2026-10-18; decision 335; named so by decision
                // 421): the buy's name and phone, the Last 4 ID 1312, its rates and payment.
                label: 'Convert to overnight buy',
                blocked: offOrBusy ?? (!buy.customer_name?.trim() ? 'No customer name on this buy'
                  : convertLines(buy).some((l) => !l.struck_at && !l.bulk_kind)
                    ? null : 'Nothing left to move: every card is Completed, struck, or in a Completed game'),
                title: 'Move this buy\'s live cards, both games, into a new Paid/Ours overnight buy under its customer; Completed cards stay here',
                onClick: () => onConvertCollection(buy, number),
              }],
            },
            // Its cards edited on the pricing screen, saved with SAVE BUY (owner, 2026-10-13):
            // for small fixes (a condition, a treatment) before an export.
            {
              label: 'Edit in project view',
              blocked: offOrBusy ?? (anyCompleted ? lockedWhy(locked) : null),
              title: "Open this buy's cards on the pricing screen to edit them (a condition, a treatment…); SAVE BUY saves them here",
              onClick: () => onEditView(buy, number),
            },
            {
              label: 'Delete buy…',
              danger: true,
              blocked: offOrBusy ?? (anyCompleted ? lockedWhy(locked) : null),
              title: 'Delete this buy and every card in it, both games',
              onClick: () => onDelete(buy, number),
            },
          ]}
        />
      </header>
      <div className="cardpanel-body">
        {(buy.customer_name || buy.phone) && (
          <p className="buy-customer">
            Customer: {[buy.customer_name, buy.phone && formatPhone(buy.phone)].filter(Boolean).join(' · ')}
          </p>
        )}
        {buy.notes && <p className="buy-notes">{buy.notes}</p>}
        {buy.condition_check && !completed && (
          <p className="buy-flag-warn" role="note">
            🚩 Check this buy&apos;s cards for condition before export. Click 🚩 Check condition when done.
          </p>
        )}
        <div className="deck-wrap" ref={table}>
          <table className="deck-table">
            <thead>
              <tr>
                <th className="cell-price">Price</th>
                <th className="cell-qty">Qty</th>
                <th className="cell-name">Card</th>
                <th aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr
                  key={l.id}
                  className={`drow${hits.has(l.id) ? ' search-hit' : ''}${isStruck(l) ? ' struck' : ''}`}
                  title={isStruck(l) ? `${struckNote(l, byId)}.\nRight-click → Restore puts it back; × removes it for good.` : undefined}
                  // The card's picture beside the panel, level with the row, as on the
                  // Price sidebar (owner, 2026-09-30).
                  onMouseEnter={(e) => setPreview(previewFor(l.image_url, e.currentTarget, panel.current, 'right'))}
                  onMouseLeave={hidePreview}
                  onContextMenu={(e) => openMenu(e, l)}
                >
                  {/* The same column before and after an export (owner, 2026-10-01): a Sell price is green. */}
                  <td
                    className={`cell-price${l.cc_sell_price != null ? ' is-sell' : ''}`}
                    title={l.cc_sell_price != null
                      ? `Sell price ${l.cc_status ? 'from the export' : 'worked out at COMPLETE'} · bought at ${formatMoney(l.unit_price)}`
                      : 'Price per card'}
                  >
                    {formatMoney(shownPrice(l))}
                  </td>
                  <td className="cell-qty">
                    {isBulk(l) ? (l.quantity * (bulkItem(l.bulk_kind)?.per ?? 1)).toLocaleString('en-US') : l.quantity}
                  </td>
                  <td className="cell-name" title={l.name_en ? l.name : undefined}>
                    {lineBody(l)}
                    {isValuedBulk(l) && <span className="bulk-per">{perText(bulkItem(l.bulk_kind), Number(l.unit_price))}</span>}
                    {l.cc_status === 'cant_upload' && <span className="cant-chip" title={CANT_UPLOAD_TIP}>Can't upload</span>}
                    {l.cc_status === 'pulled' && <span className="pulled-chip" title={PULLED_TIP}>Pulled</span>}
                  </td>
                  <td className="cell-x">
                    <button
                      type="button"
                      className="line-x"
                      title={sideDone ? lockedWhy(sideDone) : isStruck(l) ? 'Remove for good' : 'Strike: moved elsewhere, kept crossed out'}
                      aria-label={`${isStruck(l) ? 'Remove for good' : 'Strike'} ${lineText(l)}`}
                      disabled={busy || Boolean(sideDone)}
                      onClick={() => onRemove(buy, number, l)}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {menu && (
            <div className="rate-menu" role="menu" style={{ top: menu.top, left: menu.left }}>
              <button
                type="button"
                role="menuitem"
                className={offOrBusy || sideDone ? 'is-blocked' : ''}
                title={offOrBusy ?? (sideDone ? lockedWhy(sideDone) : 'Take the strike off: back on the buy with its price and rate')}
                onClick={() => {
                  setMenu(null);
                  if (!offOrBusy && !sideDone) onRestore(buy, menu.line);
                }}
              >
                Restore
              </button>
            </div>
          )}
        </div>
        <div className="buy-totals">
          <span title={completed ? (lines.some((l) => l.cc_status) ? 'From the Sell Prices written to the export file' : 'From the Sell Prices worked out at COMPLETE') : undefined}>
            {completed && lines.some((l) => l.cc_sell_price != null) ? 'Sell' : 'Market'} <strong>{formatMoney(t.market)}</strong>
          </span>
          <span className="is-cash">
            {/* The rates it was priced at, ✎ when custom (owner, 2026-10-16). */}
            Cash ({Number(buy.cash_pct)}%{buy.custom_cash_pct != null && ' ✎'})<CustomRateMark totals={t} />
            {' '}<strong>{formatMoney(t.cash)}</strong>
          </span>
          <span className="is-credit">
            Credit ({Number(buy.credit_pct)}%{buy.custom_credit_pct != null && ' ✎'})<CustomRateMark totals={t} />
            {' '}<strong>{formatMoney(t.credit)}</strong>
          </span>
        </div>
        {/* What was paid (owner, 2026-09-30): a chip in the Cash / Credit colour, right-aligned; for the whole buy, both games. */}
        {buy.paid_price != null && (
          <div className="buy-paid">
            {others > 0 && <span className="buy-paid-note">the whole buy, both games</span>}
            <span className={`paid-chip ${buy.paid_method}`}>
              Paid <strong>{formatMoney(buy.paid_price)}</strong> {buy.paid_method}
            </span>
          </div>
        )}
        {others > 0 && (
          <Link className="buy-other" to={`/calendar/${other}/${day}`}>
            Also has {countText(otherCounts, { game: GAME_NAMES[other] })} →
          </Link>
        )}
      </div>
      <LinePreview preview={preview} onHide={hidePreview} />
    </article>
  );
}

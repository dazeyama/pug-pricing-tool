import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { dayDate, dayRange, dayTitle, parseDay, storeDay } from '../lib/calendar.js';
import { lineText } from '../lib/lineFormat.js';
import { tiersFrom } from '../lib/rates.js';
import { isStruck, movesOn } from '../lib/struck.js';
import { formatDateTime } from '../lib/time.js';
import { withLoading } from '../lib/loading.js';
import Modal from '../components/Modal.jsx';
import MoreMenu from '../components/MoreMenu.jsx';
import UserTag from '../components/UserTag.jsx';
import ExportButton from '../components/ExportButton.jsx';
import ExportDialog from './export/ExportDialog.jsx';
import { useAuditPrint } from './export/useAuditPrint.js';
import { useStickerPrint } from './export/useStickerPrint.js';
import { downloadMassCreate } from '../lib/ccExport.js';
import { todaysPrices } from '../lib/todaysPrices.js';
import { sellPriceFor } from '../lib/sellPrice.js';
import { useSettings } from '../state/settings.jsx';
import RemoveModal from '../components/RemoveModal.jsx';
import { walkInStatus } from './collections/status.js';
import { useConnection } from '../state/connection.jsx';
import { useDevice } from '../state/device.jsx';
import { useStaff } from '../state/staff.jsx';
import { useToast } from '../components/Toast.jsx';
import { GAME_NAMES, otherGame } from '../lib/games.js';
import { DB_MESSAGES, dbErrorCode, dbMessage } from '../lib/dbErrors.js';
import { channelName } from '../lib/channels.js';
import BuyPanel from './day/BuyPanel.jsx';
import { ConvertBuyModal, DeleteBuyModal } from './day/DayModals.jsx';
import { COMPLETED_LOCK, markedByHand } from './day/dayRules.js';

const MESSAGES = {
  ...DB_MESSAGES,
  stale_version: 'This buy changed on another computer — reloaded.',
  buy_gone: 'That buy was already deleted.',
  buy_completed: 'That buy is Completed (exported): mark it Paid/Ours again (its ⋯) to change it.',
  bad_name: 'Type a name for the project (up to 80 characters).',
  // Struck cards (owner, 2026-10-16).
  line_struck: 'That card was already struck.',
};
// The current day can't be exported (owner, 2026-09-30): buys confirmed later would miss it.
const NOT_OVER = "Today can't be exported until it's over: buys confirmed later would miss the export";
// Pokémon can't be exported yet (export spec 1.3): its days are marked Completed
// instead, with COMPLETE (owner, 2026-10-02), only once over, like EXPORT.
const NOT_OVER_COMPLETE = "Today can't be marked Completed until it's over: buys confirmed later would be missed";
const messageFor = (error, failure) => dbMessage(error, failure, MESSAGES);

/**
 * A day page (spec 10.2): that game's part of every walk-in buy confirmed on
 * one store day. Each buy is a panel in its confirming user's colour, with
 * its cards (red × removes; owner, 2026-09-29), its totals for this game at
 * the buy's own rates, and a link to its other game's cards. Delete buy… in
 * each panel's ⋯. Back returns to the Calendar on the same month.
 */
export default function DayPage() {
  const { game, date } = useParams();
  const day = parseDay(date);
  const navigate = useNavigate();
  const ok = day && GAME_NAMES[game];
  if (!ok) {
    return (
      <div className="col-missing">
        <p className="empty">There's no such day page.</p>
        <button type="button" className="btn" onClick={() => navigate('/calendar')}>&lt; Back to the Calendar</button>
      </div>
    );
  }
  return <DayScreen key={`${game}:${day}`} game={game} day={day} />;
}

function DayScreen({ game, day }) {
  const navigate = useNavigate();
  const location = useLocation();
  // Opened from a header search result (spec 13): that buy and its matching lines.
  const focus = location.state?.focus ?? null;
  const [flashBuy, setFlashBuy] = useState(null);
  const { epoch, offline } = useConnection();
  const { deviceId } = useDevice();
  const staff = useStaff();
  const user = staff.current;
  const toast = useToast();
  const [state, setState] = useState({ buys: [], loaded: false });
  const [removing, setRemoving] = useState(null);   // { buy, line }
  const [deleting, setDeleting] = useState(null);   // { buy, number, lastCard }
  const [converting, setConverting] = useState(null); // { buy, number }: ⋯ → Convert to project
  const [exportingBuy, setExportingBuy] = useState(null);     // { buy, number }: ⋯ → Export single buy (owner, 2026-10-09)
  // 🚩 Flagged buys about to be exported (owner, 2026-10-14): { numbers, go } until answered.
  const [flagWarning, setFlagWarning] = useState(null);
  const [unexportingBuy, setUnexportingBuy] = useState(null); // { buy, number }: ⋯ → Mark Paid/Ours again, after an export
  const [exporting, setExporting] = useState(false);     // the export dialog (export spec 8.3)
  const [unexporting, setUnexporting] = useState(false); // ⋯ → Mark Paid/Ours again
  const [completing, setCompleting] = useState(false);   // COMPLETE (Pokémon days)
  const [completeStep, setCompleteStep] = useState('');   // what COMPLETE is doing (today's prices…)
  const { values: settingValues } = useSettings();
  // Print? and Print buy (docs/TEAM_FEEDBACK.md 3): the audit printout, changing nothing.
  const { print, printing } = useAuditPrint();
  // Print PKM Stickers? on a Pokémon day (decision 282): price tags at today's sell prices, saving nothing.
  const stickers = useStickerPrint();
  const [checking, setChecking] = useState(false);       // ⋯ → Check Crystal Commerce matches (export spec E2)
  const [busy, setBusy] = useState(false);
  const ticket = useRef(0);
  const other = otherGame(game);
  const back = () => navigate(`/calendar?month=${day.slice(0, 7)}`);

  const reload = useCallback(async () => {
    const mine = ++ticket.current;
    const { from, to } = dayRange(day);
    const { data, error } = await supabase
      .from('buys')
      .select('*, buy_lines(*)')
      .eq('kind', 'walk_in')
      .eq('status', 'confirmed')
      .gte('confirmed_at', from.toISOString())
      .lt('confirmed_at', to.toISOString())
      .order('confirmed_at')
      .order('id');
    if (mine !== ticket.current) return;
    if (error) {
      console.error('Loading the day failed', error);
      toast(`Couldn't load the day: ${error.message}`, 'err');
      setState((s) => ({ ...s, loaded: true }));
      return;
    }
    const buys = (data ?? []).map((b) => ({
      ...b,
      buy_lines: [...(b.buy_lines ?? [])].sort((x, y) => x.position - y.position),
    }));
    setState({ buys, loaded: true });
  }, [day, toast]);

  useEffect(() => {
    reload();
  }, [reload, epoch]);

  // Live: a buy confirmed, changed or deleted anywhere reloads the day.
  useEffect(() => {
    const channel = supabase
      .channel(channelName('day', game, day))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'buys' }, () => reload())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [game, day, reload]);

  // This game's buys, in confirmed order. Each is "Buy N" by its own number
  // (buys.number: one count for both games, forever; owner, 2026-10-17,
  // migration 0071); a row from before numbers counts as it used to, by its
  // place in the day.
  const mine = state.buys.filter((b) => b.buy_lines.some((l) => l.game === game));
  const numberOf = (b) => b.number ?? mine.findIndex((m) => m.id === b.id) + 1;

  // A search result lands here: scroll its buy into view and flash it, once
  // the day has loaded (again for each new result, even on the same day).
  const focusBuy = focus?.buyId ?? null;
  useEffect(() => {
    if (!state.loaded || !focusBuy) return undefined;
    document.querySelector(`[data-buy="${focusBuy}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setFlashBuy(focusBuy);
    const t = setTimeout(() => setFlashBuy(null), 1900);
    return () => clearTimeout(t);
  }, [state.loaded, focusBuy, location.key]);
  const hits = new Set(focus?.lineIds ?? []);

  // Paid/Ours until exported, then Completed (owner, 2026-09-30), game by game.
  const pending = mine.filter((b) => walkInStatus(b, game) === 'paid');
  const done = mine.filter((b) => walkInStatus(b, game) === 'completed');
  const allDone = mine.length > 0 && !pending.length;
  const notOver = day >= storeDay();
  // Pokémon days: EXPORT ▾ holds Print PKM?, Print PKM Stickers? and Complete Day (decision 282;
  // COMPLETE alone in EXPORT's place from 2026-10-02 until then).
  const completeOnly = game === 'pokemon';
  const exportBlocked = notOver ? (completeOnly ? NOT_OVER_COMPLETE : NOT_OVER) : null;
  // When and by whom: the latest export of this game's cards here.
  const doneLines = mine.flatMap((b) => b.buy_lines).filter((l) => l.game === game && l.completed_at);
  // Cards marked Completed by hand (owner, 2026-10-02) weren't exported: not counted.
  const lastExport = doneLines.filter((l) => !markedByHand(l))
    .reduce((a, l) => (!a || l.completed_at > a.completed_at ? l : a), null);
  // What the export wrote (export spec 4.4, 10): its Custom SKU, and the counts.
  // A single buy's export carries "<day>-<number>" (0071): its chip goes on the
  // buy, the day's own export's on the page (owner, 2026-10-17).
  const skus = [...new Set(doneLines.map((l) => l.cc_custom_sku).filter((s) => s && !s.includes('-')))];
  const buySkus = (b) => [...new Set(b.buy_lines
    .filter((l) => l.game === game && l.cc_custom_sku && l.cc_custom_sku.includes('-'))
    .map((l) => l.cc_custom_sku))];
  const exportedCards = doneLines.filter((l) => l.cc_status === 'exported').reduce((n, l) => n + l.quantity, 0);
  const cantCards = doneLines.filter((l) => l.cc_status === 'cant_upload').reduce((n, l) => n + l.quantity, 0);
  const fileName = `cc-mass-create-${game === 'mtg' ? 'magic' : game}-${day}.csv`;
  // EXPORT (n) on Magic days (owner, 2026-10-02): the cards to count in the
  // real pile first. The cards the export will take; once the day is all
  // Completed, every card that day.
  // Bulk is never exported (docs/TEAM_FEEDBACK.md 5.8), nor struck cards (owner, 2026-10-16).
  const dayLines = mine.flatMap((b) => b.buy_lines).filter((l) => l.game === game && movesOn(l));
  const toExport = dayLines.filter((l) => !l.completed_at);
  const pileCards = (toExport.length ? toExport : dayLines).reduce((n, l) => n + l.quantity, 0);
  // When and by whom the day was marked Completed, when it wasn't exported.
  const lastDone = doneLines.reduce((a, l) => (!a || l.completed_at > a.completed_at ? l : a), null);

  // Everything here needs a picked user and a connection.
  const guard = () => {
    if (!user) {
      staff.pulse();
      return false;
    }
    if (offline) {
      toast('No connection: nothing can change until it comes back.', 'err');
      return false;
    }
    return true;
  };

  /**
   * × on a row (owner, 2026-10-16): strikes copies first, kept crossed out as
   * a record (lib/struck.js); a struck card's × removes it, or deletes the buy
   * if that's its last card (owner, 2026-09-29).
   */
  function startRemove(buy, number, line) {
    if (line.completed_at) {
      toast(`${COMPLETED_LOCK}.`, 'err');
      return;
    }
    if (!guard()) return;
    if (!isStruck(line)) setRemoving({ buy, number, line, mode: 'strike' });
    else if (buy.buy_lines.length === 1 && line.quantity === 1) setDeleting({ buy, number, lastCard: true });
    else setRemoving({ buy, number, line, mode: 'struck' });
  }

  /**
   * One write: busy while it runs; a refusal becomes a toast, led by
   * `failure` (or by what a function of the error gives; null: no toast,
   * the caller handles it). The caller reloads, or goes elsewhere.
   * @returns {Promise<{ data: any, error: any }>}
   */
  async function run(fn, args, failure) {
    setBusy(true);
    const result = await withLoading(() => supabase.rpc(fn, args));
    setBusy(false);
    const lead = result.error && (typeof failure === 'function' ? failure(result.error) : failure);
    if (lead) toast(messageFor(result.error, lead), 'err');
    return result;
  }

  /** Who's writing, from where, and (given a buy) the version of it last read. */
  const by = (buy = null) => ({ p_user: user.id, p_device: deviceId, ...(buy && { p_expected_version: buy.version }) });

  async function remove(line, qty) {
    const { buy, number, mode } = removing;
    setRemoving(null);
    const args = { p_line_id: line.id, p_qty: qty, ...by(buy), p_text: lineText(line, Math.min(qty, line.quantity)) };
    if (mode === 'strike') {
      await run('buy_strike_line', args, "Couldn't strike the card");
    } else if (buy.buy_lines.length === 1 && qty >= line.quantity) {
      setDeleting({ buy, number, lastCard: true });
      return;
    } else {
      // The buy's last card: Delete buy… instead, no toast.
      const lastCard = (e) => dbErrorCode(e) === 'last_card';
      const { error } = await run('buy_remove_line', args, (e) => (lastCard(e) ? null : "Couldn't remove the card"));
      if (lastCard(error)) setDeleting({ buy, number, lastCard: true });
    }
    await reload();
  }

  /** Right-click → Restore on a struck card: back on the buy with its price and rate. */
  async function restore(buy, line) {
    if (!guard()) return;
    await run('buy_restore_line', { p_line_id: line.id, ...by(buy), p_text: lineText(line) }, "Couldn't restore the card");
    await reload();
  }

  async function destroy() {
    const { buy, number } = deleting;
    const { error } = await run('buy_delete', {
      p_buy_id: buy.id, ...by(buy), p_line_texts: Object.fromEntries(buy.buy_lines.map((l) => [l.id, lineText(l)])),
    }, "Couldn't delete the buy");
    setDeleting(null);
    if (error) {
      await reload();
      return;
    }
    // The day's last buy in this game gone: back to the Calendar (spec 10.2).
    if (mine.length <= 1) {
      toast(`Buy ${number} deleted. No ${GAME_NAMES[game]} buys are left that day.`, 'ok');
      back();
      return;
    }
    toast(`Buy ${number} deleted.`, 'ok');
    await reload();
  }

  /** A buy's 🚩 chip → Yes, or ⋯ → ✅ Condition checked: the flag off (owner, 2026-10-14). CONFIRM BUY flags. */
  async function setConditionFlag(buy, number, flag) {
    const { error } = await run('buy_set_condition_check', { p_buy_id: buy.id, p_flag: flag, ...by() },
      flag ? "Couldn't flag the buy" : "Couldn't clear the flag");
    if (!error) toast(flag
      ? `🚩 Buy ${number} flagged: check its cards' condition before export.`
      : `Buy ${number}: condition checked, flag off.`, 'ok');
    await reload();
  }

  /**
   * Before an export takes flagged buys (owner, 2026-10-14): say which, and
   * export only if asked to anyway. `buys`: the buys it would take.
   */
  function unlessFlagged(buys, go) {
    // By id, not by object: the numbers are the buys' places on this page (Buy 1, Buy 2…).
    const numbers = buys.filter((b) => b.condition_check).map(numberOf).filter((n) => n > 0);
    if (numbers.length) setFlagWarning({ numbers, go });
    else go();
  }

  /**
   * A buy's ⋯ → Mark as completed (owner, 2026-10-02): this game's cards
   * Completed without exporting them, so they leave the header search and the
   * day's export; or, marked that way, Paid/Ours again.
   */
  async function markCompleted(buy, number, complete) {
    const { error } = await run('buy_mark_completed', { p_buy_id: buy.id, p_game: game, p_complete: complete, ...by(buy) },
      complete ? "Couldn't mark the buy Completed" : "Couldn't mark the buy Paid/Ours");
    if (!error) toast(complete
      ? `Buy ${number} marked Completed: left out of the search and of this day's export.`
      : `Buy ${number} marked Paid/Ours again.`, 'ok');
    await reload();
  }

  /**
   * A buy's ⋯ → Mark Paid/Ours again, for a buy that was exported, on its own
   * or with its day (owner, 2026-10-09): `buy_unexport`, this buy only.
   */
  async function unexportBuy() {
    const { buy, number } = unexportingBuy;
    const { data, error } = await run('buy_unexport', { p_buy_id: buy.id, p_game: game, ...by(buy) },
      "Couldn't mark the buy Paid/Ours");
    setUnexportingBuy(null);
    if (!error) toast(`Buy ${number}'s ${Number(data ?? 0) === 1 ? 'card is' : 'cards are'} Paid/Ours again.`, 'ok');
    await reload();
  }

  /** A buy's ⋯ → Convert to project (owner, 2026-10-02): its cards go to a new project, the buy is deleted. */
  async function convert(name) {
    const { buy, number } = converting;
    const { data, error } = await run('buy_to_project', {
      p_buy_id: buy.id, p_name: name, ...by(buy), p_line_texts: Object.fromEntries(buy.buy_lines.map((l) => [l.id, lineText(l)])),
    }, "Couldn't convert the buy");
    if (error) {
      // A bad name keeps the dialog open, to fix it there.
      if (dbErrorCode(error) !== 'bad_name') setConverting(null);
      await reload();
      return;
    }
    setConverting(null);
    toast(`Buy ${number} is now the project ${name.trim()}.`, 'ok');
    navigate(`/collections/${data}`);
  }

  /** COMPLETE (Pokémon days): ask first, unless there's nothing to do. */
  function startComplete() {
    if (exportBlocked) {
      toast(`${exportBlocked}.`, 'err');
      return;
    }
    if (!mine.length) {
      toast(`No ${GAME_NAMES[game]} buys that day.`, 'err');
      return;
    }
    if (!pending.length) {
      toast(`Every ${GAME_NAMES[game]} buy here is already Completed.`, 'ok');
      return;
    }
    // COMPLETE is a Pokémon day's export: flagged buys are asked about the same way.
    if (guard()) unlessFlagged(pending, () => setCompleting(true));
  }

  /** The day's Paid/Ours buys in this game marked Completed, nothing exported (`day_complete`). */
  async function complete() {
    setBusy(true);
    // Today's Sell Prices first, worked out as the export does (owner,
    // 2026-10-09): shown in green once the day is Completed. Without today's
    // prices nothing is completed.
    const cards = mine.flatMap((b) => b.buy_lines).filter((l) => l.game === game && !l.completed_at && movesOn(l));
    let prices;
    try {
      setCompleteStep("Fetching today's prices…");
      const today = await todaysPrices(cards, { onStep: setCompleteStep });
      const pct = settingValues[game === 'pokemon' ? 'fallback_pct_pokemon' : 'fallback_pct_mtg'];
      prices = cards.map((line) => {
        const sell = sellPriceFor(line, { ...today.get(line.id), pct });
        return { line_id: line.id, sell_price: sell.price, sell_basis: sell.basis };
      });
    } catch (e) {
      setBusy(false);
      setCompleteStep('');
      toast(`${e.message} Nothing was marked Completed.`, 'err');
      return;
    }
    setCompleteStep('Saving…');
    const { data, error } = await run('day_complete', { p_day: day, p_game: game, ...by(), p_prices: prices },
      "Couldn't mark the buys Completed");
    setCompleteStep('');
    setCompleting(false);
    if (!error) {
      const n = Number(data ?? 0);
      toast(`${n} ${GAME_NAMES[game]} buy${n === 1 ? '' : 's'} marked Completed, with today's Sell Prices: out of the header search.`, 'ok');
    }
    await reload();
  }

  /** ⋯ → Mark Paid/Ours again: undo the export (export spec 9.4), stamps and all. */
  async function unexport() {
    const { data, error } = await run('export_undo_day', { p_day: day, p_game: game, ...by() },
      "Couldn't mark the buys Paid/Ours");
    setUnexporting(false);
    if (!error) {
      const n = Number(data ?? 0);
      toast(`${n} ${GAME_NAMES[game]} buy${n === 1 ? '' : 's'} marked Paid/Ours again.`, 'ok');
    }
    await reload();
  }

  /**
   * EXPORT (export spec 8.2): with Paid/Ours buys here, the export dialog;
   * once they're all Completed, the same file again from the stamps, and
   * nothing changes.
   */
  function startExport() {
    if (exportBlocked) {
      toast(`${exportBlocked}.`, 'err');
      return;
    }
    if (!mine.length) {
      toast(`No ${GAME_NAMES[game]} buys that day.`, 'err');
      return;
    }
    if (pending.length) {
      if (guard()) unlessFlagged(pending, () => setExporting(true));
      return;
    }
    const stamped = doneLines.filter((l) => l.cc_status === 'exported');
    if (!stamped.length) {
      toast(cantCards
        ? "Nothing here could be uploaded: there's no file. Every card is Can't upload."
        : "These buys were marked Completed without being exported, so there's no file: mark them Paid/Ours again (⋯), then EXPORT.", 'err');
      return;
    }
    const rows = downloadMassCreate(stamped, fileName, settingValues.fallback_pct_mtg);
    toast(`Downloaded the same file again: ${rows} row${rows === 1 ? '' : 's'}, Custom SKU ${skus.join(', ')}.`, 'ok');
  }

  /**
   * EXPORT ▾ → Print? (docs/TEAM_FEEDBACK.md 3.1): the cards EXPORT would
   * take, or once the day is exported, what it exported; blocked when EXPORT is.
   */
  function printDay() {
    if (exportBlocked) {
      toast(`${exportBlocked}.`, 'err');
      return;
    }
    if (!mine.length) {
      toast(`No ${GAME_NAMES[game]} buys that day.`, 'err');
      return;
    }
    if (offline) {
      toast('No connection: printing needs it to find the Crystal Commerce categories.', 'err');
      return;
    }
    print({ lines: dayLines, title: `Audit — Magic, ${dayTitle(day)}`, fileName: `audit-magic-${day}.pdf` });
  }

  /**
   * A Pokémon day's EXPORT ▾ → Print PKM? and Print PKM Stickers? (decision
   * 282): the day's Pokémon cards (Completed or not), any time: they change
   * nothing, so the day needn't be over, unlike Complete Day.
   */
  const printPokemonBlocked = mine.length ? null : 'No Pokémon buys that day';
  const printStickersBlocked = offline ? "No connection: the stickers need today's prices" : printPokemonBlocked;
  function printPokemonDay() {
    if (printPokemonBlocked) {
      toast(`${printPokemonBlocked}.`, 'err');
      return;
    }
    print({ lines: dayLines, game: 'pokemon', title: `Audit — Pokémon, ${dayTitle(day)}`, fileName: `audit-pokemon-${day}.pdf` });
  }
  function printStickersDay() {
    if (printStickersBlocked) {
      toast(`${printStickersBlocked}.`, 'err');
      return;
    }
    stickers.print({ lines: dayLines, title: `Stickers — Pokémon, ${dayTitle(day)}`, fileName: `stickers-pokemon-${day}.pdf` });
  }

  /** A buy's ⋯ → Print buy (docs/TEAM_FEEDBACK.md 3.1): that buy alone, any day. */
  function printBuy(b, n) {
    if (game === 'pokemon') {
      print({
        lines: b.buy_lines,
        game: 'pokemon',
        title: `Audit — Pokémon, Buy ${n}, ${dayDate(day)}`,
        fileName: `audit-pokemon-${day}-buy-${n}.pdf`,
      });
      return;
    }
    print({
      lines: b.buy_lines,
      title: `Audit — Buy ${n}, ${dayDate(day)}`,
      fileName: `audit-magic-${day}-buy-${n}.pdf`,
    });
  }

  /** A Pokémon buy's ⋯ → Print stickers (decision 283): that buy's cards alone, any day. */
  function printBuyStickers(b, n) {
    if (offline) {
      toast("No connection: the stickers need today's prices.", 'err');
      return;
    }
    stickers.print({
      lines: b.buy_lines,
      title: `Stickers — Pokémon, Buy ${n}, ${dayDate(day)}`,
      fileName: `stickers-pokemon-${day}-buy-${n}.pdf`,
    });
  }

  /** The export saved and its file handed over (export spec 8.4). */
  async function exported(result) {
    setExporting(false);
    setExportingBuy(null);
    const cards = `${result.cards} card${result.cards === 1 ? '' : 's'}`;
    const cant = result.cant > 0
      ? ` ${result.cant} can't upload: copied to Can't upload cards.`
      : '';
    toast(result.cards > 0
      ? `Exported ${cards} (${result.rows} row${result.rows === 1 ? '' : 's'}), Custom SKU ${result.sku}.${cant}`
      : `Nothing matched, so there's no file.${cant}`, 'ok');
    await reload();
  }

  return (
    // Themed in the game's colour: indigo for Magic, amber for Pokémon (calendar.css);
    // greyed once exported (owner, 2026-09-30).
    <div className={`day-page ${game}${allDone ? ' exported' : ''}`}>
      {/* < BACK on the left, EXPORT on the right, one row (owner, 2026-09-29). */}
      <div className="day-top">
        <button type="button" className="btn page-back" title="Back to the Calendar" onClick={back}>&lt; BACK</button>
        <span className="day-actions">
          {/* ⋯: on Magic days, a dry run of the export's matching (export spec E2);
              after an export, undo it if it was done too early (owner, 2026-09-30). */}
          {(game === 'mtg' || done.length > 0) && (
            <MoreMenu
              items={[
                ...(game === 'mtg' ? [{
                  label: 'Check Crystal Commerce matches',
                  blocked: offline ? 'No connection' : !mine.length ? 'No Magic buys that day' : null,
                  title: 'See how each card matches a Crystal Commerce product, without exporting',
                  onClick: () => setChecking(true),
                }] : []),
                ...(done.length > 0 ? [{
                  label: 'Mark Paid/Ours again…',
                  blocked: offline ? 'No connection' : busy ? 'Saving…' : null,
                  title: `${lastExport ? 'Undo the export: t' : 'T'}his day's Completed ${GAME_NAMES[game]} buys become Paid/Ours again`,
                  onClick: () => guard() && setUnexporting(true),
                }] : []),
              ]}
            />
          )}
          <ExportButton
            className="top"
            onClick={completeOnly ? startComplete : startExport}
            onPrint={completeOnly ? null : printDay}
            onPrintPokemon={completeOnly ? printPokemonDay : null}
            printPokemonBlocked={printPokemonBlocked}
            onPrintStickers={completeOnly ? printStickersDay : null}
            printStickersBlocked={printStickersBlocked}
            exportLabel={completeOnly ? 'Complete day…' : 'Export csv'}
            exportTitle={completeOnly ? "Mark the day's Pokémon buys Completed, with today's sell prices" : undefined}
            exportBlocked={completeOnly ? exportBlocked : null}
            printing={printing || stickers.printing}
            blocked={completeOnly ? null : exportBlocked}
            copyLines={dayLines}
            count={state.loaded ? pileCards : null}
            countTitle={toExport.length
              ? `${pileCards} card${pileCards === 1 ? '' : 's'} to ${completeOnly ? 'mark Completed' : 'export'}: count the pile first`
              : `${pileCards} card${pileCards === 1 ? '' : 's'} that day`}
          />
        </span>
      </div>
      <h2 className="day-title">
        {dayTitle(day)}
        <span className={`group-chip day-chip ${game}`}>{GAME_NAMES[game]}</span>
        {allDone && <span className="day-exported-chip">{lastExport ? 'Exported' : 'Completed'}</span>}
        {/* The export's code, labelled very clearly (owner, 2026-10-01; export spec 4.4). */}
        {skus.length > 0 && (
          <span className="sku-chip" title="The Custom SKU written on every row of this day's Mass Create file">
            Custom SKU <strong>{skus.join(', ')}</strong>
          </span>
        )}
      </h2>
      <hr className="day-rule" />
      {allDone && lastExport && (
        <p className="day-export-note">
          Exported {formatDateTime(lastExport.completed_at)}
          {lastExport.completed_by && <> by <UserTag user={staff.byId(lastExport.completed_by)} /></>}
          {(exportedCards > 0 || cantCards > 0) && (
            <>: {exportedCards} card{exportedCards === 1 ? '' : 's'}{cantCards > 0 && <>, <span className="cant-text">{cantCards} can't upload</span></>}</>
          )}
          .{' '}These buys are Completed: locked, and left out of the header search. Prices in green are the Sell
          {' '}Prices written to the file.
        </p>
      )}
      {allDone && !lastExport && lastDone && (
        <p className="day-export-note">
          Completed {formatDateTime(lastDone.completed_at)}
          {lastDone.completed_by && <> by <UserTag user={staff.byId(lastDone.completed_by)} /></>}
          , not exported. These buys are locked, and left out of the header search.
          {doneLines.some((l) => l.cc_sell_price != null) && <> Prices in green are the Sell Prices worked out then.</>}
        </p>
      )}

      {!state.loaded ? (
        <p className="empty">Loading…</p>
      ) : !mine.length ? (
        <p className="empty">No {GAME_NAMES[game]} buys that day.</p>
      ) : (
        <div className="card-grid day-grid">
          {mine.map((buy) => (
            <BuyPanel
              key={buy.id}
              buy={buy}
              tiers={tiersFrom(settingValues.rate_tiers)}
              number={numberOf(buy)}
              skus={buySkus(buy)}
              game={game}
              other={other}
              day={day}
              byId={staff.byId}
              busy={busy}
              offline={offline}
              hits={hits}
              flash={flashBuy === buy.id}
              onRemove={startRemove}
              onRestore={restore}
              onDelete={(b, n) => guard() && setDeleting({ buy: b, number: n, lastCard: false })}
              onComplete={(b, n, complete) => guard() && markCompleted(b, n, complete)}
              onConvert={(b, n) => guard() && setConverting({ buy: b, number: n })}
              onExport={(b, n) => guard() && unlessFlagged([b], () => setExportingBuy({ buy: b, number: n }))}
              onFlag={(b, n, flag) => guard() && setConditionFlag(b, n, flag)}
              onPrint={printBuy}
              onPrintStickers={printBuyStickers}
              printing={printing || stickers.printing}
              onUnexport={(b, n) => guard() && setUnexportingBuy({ buy: b, number: n })}
              // Edit in project view (owner, 2026-10-13): the buy's cards on the pricing screen.
              onEditView={(b, n) => navigate(`/calendar/${game}/${day}/buy/${b.id}`, { state: { number: n } })}
            />
          ))}
        </div>
      )}

      {flagWarning && (
        <Modal
          title="Check condition first?"
          onClose={() => setFlagWarning(null)}
          footer={(
            <>
              <button type="button" className="btn ghost" autoFocus onClick={() => setFlagWarning(null)}>Cancel</button>
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  const { go } = flagWarning;
                  setFlagWarning(null);
                  go();
                }}
              >
                {completeOnly ? 'Complete anyway' : 'Export anyway'}
              </button>
            </>
          )}
        >
          <p>
            🚩 <strong>{flagWarning.numbers.map((n) => `Buy ${n}`).join(', ')}</strong>{' '}
            {flagWarning.numbers.length === 1 ? 'is' : 'are'} flagged: {flagWarning.numbers.length === 1 ? 'its' : 'their'} cards
            need their condition checked before export.
          </p>
          <p className="hint">Check them (click 🚩 Check condition → Yes), or go ahead anyway.</p>
        </Modal>
      )}
      {removing && (
        <RemoveModal
          line={removing.line}
          mode={removing.mode}
          note="This buy was already confirmed."
          onClose={() => setRemoving(null)}
          onRemove={remove}
        />
      )}
      {checking && (
        <ExportDialog
          mode="check"
          title={`Crystal Commerce matches: ${GAME_NAMES[game]}, ${dayDate(day)}`}
          items={mine.flatMap((b) => b.buy_lines.filter((l) => l.game === 'mtg' && movesOn(l)).map((line) => ({ line, where: `Buy ${numberOf(b)}` })))}
          onClose={() => setChecking(false)}
        />
      )}
      {exporting && (
        <ExportDialog
          mode="export"
          title={`Export ${GAME_NAMES[game]} for ${dayDate(day)} to Crystal Commerce`}
          items={mine.flatMap((b) => b.buy_lines
            .filter((l) => l.game === game && !l.completed_at && movesOn(l))
            .map((line) => ({ line, where: `Buy ${numberOf(b)}` })))}
          target={{
            kind: 'day',
            day,
            game,
            versions: Object.fromEntries(mine
              .filter((b) => b.buy_lines.some((l) => l.game === game && !l.completed_at && movesOn(l)))
              .map((b) => [b.id, b.version])),
          }}
          fileName={fileName}
          onExported={exported}
          onClose={() => {
            setExporting(false);
            reload();
          }}
        />
      )}
      {unexporting && (
        <Modal
          title={`Mark ${GAME_NAMES[game]} for ${dayDate(day)} Paid/Ours again?`}
          onClose={busy ? undefined : () => setUnexporting(false)}
          footer={(
            <>
              <button type="button" className="btn ghost" disabled={busy} onClick={() => setUnexporting(false)}>Cancel</button>
              <button type="button" className={`btn primary${busy ? ' busy' : ''}`} disabled={busy} onClick={unexport}>
                Mark Paid/Ours again
              </button>
            </>
          )}
        >
          <p>
            This day's <strong>{done.length} Completed {GAME_NAMES[game]} buy{done.length === 1 ? '' : 's'}</strong> go
            back to <strong>Paid/Ours</strong>: unlocked, and back in the header search, showing their buy prices
            again. Use this if the day was {lastExport ? 'exported' : 'marked Completed'} too early.
          </p>
          {lastExport && (
            <p className="hint">
              The file already downloaded isn't undone: if it was uploaded to Crystal Commerce, fix the stock there by
              hand.
            </p>
          )}
        </Modal>
      )}
      {completing && (
        <Modal
          title={`Mark ${GAME_NAMES[game]} for ${dayDate(day)} Completed?`}
          onClose={busy ? undefined : () => setCompleting(false)}
          footer={(
            <>
              <button type="button" className="btn ghost" disabled={busy} onClick={() => setCompleting(false)}>Cancel</button>
              <button type="button" className={`btn primary${busy ? ' busy' : ''}`} disabled={busy} autoFocus onClick={complete}>
                Complete
              </button>
            </>
          )}
        >
          {busy && completeStep ? (
            <p className="loading-note">{completeStep}</p>
          ) : (
            <>
              <p>
                This day's <strong>{pending.length} Paid/Ours {GAME_NAMES[game]} buy{pending.length === 1 ? '' : 's'}</strong>{' '}
                ({pileCards} card{pileCards === 1 ? '' : 's'}) become <strong>Completed</strong>: locked, and left out of the
                header search, like an exported day. Each card gets today's <strong>Sell Price</strong>, worked out as the
                export does, shown in green. Nothing is exported.
              </p>
              <p className="hint">Fetches today's prices (about one JustTCG request). ⋯ → Mark Paid/Ours again undoes it.</p>
            </>
          )}
        </Modal>
      )}
      {exportingBuy && (
        // Export single buy (owner, 2026-10-09): the day's export, for one buy, today's too.
        <ExportDialog
          mode="export"
          title={`Export Buy ${exportingBuy.number} (${GAME_NAMES[game]}, ${dayDate(day)}) to Crystal Commerce`}
          items={exportingBuy.buy.buy_lines
            .filter((l) => l.game === game && !l.completed_at && movesOn(l))
            .map((line) => ({ line, where: `Buy ${exportingBuy.number}` }))}
          target={{ kind: 'buy', buy_id: exportingBuy.buy.id, game, version: exportingBuy.buy.version, day, number: exportingBuy.number }}
          fileName={`cc-mass-create-${game === 'mtg' ? 'magic' : game}-${day}-buy-${exportingBuy.number}.csv`}
          onExported={exported}
          onClose={() => {
            setExportingBuy(null);
            reload();
          }}
        />
      )}
      {unexportingBuy && (
        <Modal
          title={`Mark Buy ${unexportingBuy.number} Paid/Ours again?`}
          onClose={busy ? undefined : () => setUnexportingBuy(null)}
          footer={(
            <>
              <button type="button" className="btn ghost" disabled={busy} onClick={() => setUnexportingBuy(null)}>Cancel</button>
              <button type="button" className={`btn primary${busy ? ' busy' : ''}`} disabled={busy} onClick={unexportBuy}>
                Mark Paid/Ours again
              </button>
            </>
          )}
        >
          <p>
            <strong>Buy {unexportingBuy.number}</strong>'s {GAME_NAMES[game]} cards go back to <strong>Paid/Ours</strong>:
            unlocked, back in the header search and this day's export, showing their buy prices again, and taken back
            out of Can't upload cards. The rest of the day stays as it is.
          </p>
          <p className="hint">
            The file already downloaded isn't undone: if it was uploaded to Crystal Commerce, fix the stock there by
            hand.
          </p>
        </Modal>
      )}
      {converting && (
        <ConvertBuyModal
          buy={converting.buy}
          number={converting.number}
          day={day}
          byId={staff.byId}
          busy={busy}
          onClose={() => setConverting(null)}
          onConvert={convert}
        />
      )}
      {deleting && (
        <DeleteBuyModal
          buy={deleting.buy}
          number={deleting.number}
          lastCard={deleting.lastCard}
          byId={staff.byId}
          busy={busy}
          onClose={() => setDeleting(null)}
          onDelete={destroy}
        />
      )}
    </div>
  );
}

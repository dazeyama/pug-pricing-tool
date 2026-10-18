import { useMemo, useEffect, useRef, useState } from 'react';
import { useCardRoom, useListRoom } from './useStageRoom.js';
import { usePrinting } from './usePrinting.js';
import { usePricing } from './usePricing.js';
import { usePriceQuote } from './usePriceQuote.js';
import { useSearchNote } from './useSearchNote.jsx';
import SearchBar from './SearchBar.jsx';
import SelectedCard from './SelectedCard.jsx';
import Suggestions, { useSuggestionCount } from './Suggestions.jsx';
import ShowAllModal from './ShowAllModal.jsx';
import FinishPanel from './FinishPanel.jsx';
import PriceTable from './PriceTable.jsx';
import QuotePanel from './QuotePanel.jsx';
import ActionRow, { parseQty } from './ActionRow.jsx';
import BuyList from './BuyList.jsx';
import { useCardSearch } from './useCardSearch.js';
import { useCardImages } from './useCardImages.js';
import { searchTextFromUrl } from '../../lib/query.js';
import { warmUp, magicCandidate } from '../../lib/cardSearch.js';
import { magicFinishes, POKEMON_FINISHES } from '../../lib/printings.js';
import { CONDITIONS } from '../../lib/prices.js';
import { showsTcgplayer } from '../../lib/ladder.js';
import { buildLine } from '../../lib/buyLine.js';
import { lineRate, whyText } from '../../lib/rates.js';
import {
  PLACEHOLDER_NAME, buildBulkLine, buildPlaceholderLine, bulkItem, bulkValuesFrom, isBulk, isPlaceholder, isValuedBulk,
} from '../../lib/bulk.js';
import { BulkFinish, BulkPrice, BulkSelected } from './Bulk.jsx';
import { useStaff } from '../../state/staff.jsx';
import { useConnection } from '../../state/connection.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useDevice } from '../../state/device.jsx';
import { useScanSession } from './useScanSession.js';
import { useScanReceiver } from './useScanReceiver.js';
import ScanChip from './ScanChip.jsx';
import { candidateKeyOf, editQuery, nameQuery, pinFirst } from '../../lib/candidateKey.js';

const BACKGROUND = { '--stage-bg': `url(${import.meta.env.BASE_URL}background.webp)` };

// MTG | PKM (owner, 2026-09-29): which games search asks, both by default.
// Kept while this screen is open (the whole walk-in buy, or one visit to a
// collection), and back to both when it's left (unmounts) or when resetKey
// changes (a walk-in buy confirmed or cancelled). The suggestions' sort
// toggle (newest / oldest first) is kept and reset the same way.
const BOTH_GAMES = { mtg: true, pokemon: true };
// JP is Pokémon only (owner, 2026-10-01): while it's on, only PKM is
// searched and MTG can't be picked; back on EN, the games are as they were.
const PKM_ONLY = { mtg: false, pokemon: true };
const JP_NO_MTG = 'Japanese is Pokémon only: switch to EN to search Magic';

// The phone's card has no Pokémon detail to show (it's Magic, and nothing's looked up for it).
const NO_POKEMON = { resolved: true, card: null, info: null, page: null };

/**
 * The pricing screen (spec 8): search, suggestions, the selected card with
 * its finish, details and prices, the action row, and the list sidebar. The
 * Price tab uses it for the walk-in draft (Phase 6), a collection for its
 * saved list (spec 9.4, Phase 7).
 *
 * @param {object} p
 * @param {{ lines: object[], loaded: boolean, busy: boolean,
 *   add: (line: object, userId: string) => Promise<string|null>,
 *   update: (old: object, line: object, userId: string) => Promise<string|null>,
 *   remove: (line: object, qty: number, userId: string) => Promise<unknown>,
 *   setRates: ((cash: number|null, credit: number|null, userId: string) => Promise<unknown>)|null,
 *   (setRates and setLineRate null: no rate controls at all, a project's list)
 *   setLineRate?: (line: object, cash: number|null, credit: number|null, userId: string) => Promise<unknown> }} p.list
 *   (setLineRate: right-click → Set Rate on a card, docs/TEAM_FEEDBACK.md 4.3)
 *   (strike?, restore?: (line, qty, userId) / (line, userId): a Paid/Ours list's × strikes a card first,
 *   right-click → Restore takes it back; owner, 2026-10-16, lib/struck.js)
 * @param {{ cash: number, credit: number, customCash: number|null, customCredit: number|null, tiers: object }} p.rates
 *   the list's base rates, its custom ones, and the low-end / high-end rates (lib/rates.js)
 * @param {{ cash: number, credit: number }} p.master  the Master Buy Percentages
 * @param {string|null} [p.locked]  why nothing can change here (Paid/Ours, view-only), or null
 * @param {string|null} [p.removeLocked]  why cards can't be removed, when that differs from
 *   `locked` (a Paid/Ours collection can still lose cards; owner, 2026-09-29)
 * @param {string} p.listTitle  "Buy list" / "Collection list"
 * @param {string} p.ratesTitle  the rates subpanel's heading
 * @param {(api: object) => any} [p.renderListDetails]  in the sidebar's foot, above the totals (a collection's details)
 * @param {(api: object) => any} [p.renderListFooter]  the sidebar's buttons, under the totals
 * @param {number} [p.resetKey]  changing it clears the stage and resets MTG | PKM and the sort
 * @param {any} [p.searchLead]  before the search field, top left (a collection's < BACK)
 * @param {string} [p.className]  on the screen (a collection's: flipped background, amber accent)
 * @param {{ ids: string[], key: string }|null} [p.hits]  list lines a header search matched, to flash
 * @param {string|null} [p.searchBlocked]  why the search bar is off (Can't upload cards), or null
 * @param {any} [p.listBadge]  in the list's heading, beside its title (an exported collection's Custom SKU)
 * @param {boolean} [p.roundUp]  prices round up, not down (a project; owner, 2026-10-10)
 * @param {string|null} [p.addLocked]  why ADD CARD can't add a new card, though list lines can still be
 *   edited (a confirmed buy in project view; owner, 2026-10-13), or null
 * @param {string|null} [p.ratesLocked]  why the list's rates can't change (the same), or null
 * @param {string|null} [p.urlSearch]  a search from the address bar (#/price/<search>), typed in as
 *   if by hand on a fresh stage (lib/query.js searchTextFromUrl)
 * @param {{ kind: 'walk_in'|'collection', buyId: string|null, name: string }|null} [p.scanTarget]
 *   this list takes cards from a paired phone (docs/SCAN_FUNCTION.md 8): what the phone shows it as;
 *   null for none (a confirmed buy in project view, Can't upload cards)
 */
export default function PricingScreen({
  list, rates, master, locked = null, removeLocked = locked, listTitle, ratesTitle,
  renderListDetails, renderListFooter, resetKey = 0, searchLead = null, className = '', hits = null,
  searchBlocked = null, listBadge = null, roundUp = false, addLocked = null, ratesLocked = null, scanTarget = null,
  urlSearch = null,
}) {
  const [text, setText] = useState('');
  // EN | JP for Pokémon: EN every time a screen opens, not remembered
  // (owner, 2026-10-02; spec 8.2).
  const [lang, setLang] = useState('en');
  const [games, setGames] = useState(BOTH_GAMES);
  const [oldest, setOldest] = useState(false);
  const searchGames = lang === 'ja' ? PKM_ONLY : games;
  const search = useCardSearch(text, lang, searchGames, oldest);
  // The list's share of the width the suggestions don't use, and their columns.
  const screen = useRef(null);
  const listRoom = useListRoom(screen);
  const cardSpace = useCardRoom(screen);
  // 10 suggestions (8 on a laptop's window), or 5 on a shorter window (owner, 2026-10-01).
  const shownCount = useSuggestionCount(listRoom.cols);
  const [selected, setSelected] = useState(null);
  const [highlight, setHighlight] = useState(-1);
  const [showAll, setShowAll] = useState(false);
  // mimp mode (owner, 2026-10-17; decision 293; "auto mode" in the code): adding a card leaves
  // the search, the card and its choices as they are, for a run of the same card; only Qty
  // goes back to 1. The 🌼 | 🦇 pill after EN | JP: 🌼 clears the search after each card (the
  // default), 🦇 is mimp mode, keeping it (owner, 2026-10-19: "by default I want the search clear,
  // represented by the daisy, the bat, non-default, is the persistent search"; decision 323). Like
  // EN | JP it starts on its default with the page and keeps its setting from buy to buy; nothing
  // is stored.
  const [auto, setAuto] = useState(false);
  const input = useRef(null);
  const selectedRef = useRef(null);
  selectedRef.current = selected;
  // A bulk item (docs/TEAM_FEEDBACK.md 5.4) is no card: nothing to look up,
  // no finish, versions, conditions or price movement; one price from Settings.
  const bulk = selected?.bulk ? selected : null;
  const card = bulk ? null : selected;

  useEffect(() => warmUp(lang), [lang]);

  // Editing a list line (owner, 2026-09-29): its card is searched for and
  // selected (found), then its saved choices put back (restored); SAVE EDIT
  // saves over it. { line, key, query, found, restored } or null.
  const [editing, setEditing] = useState(null);
  // Defined here, before anything reads it (a use above its line crashed the screen). The suggestions, the card being edited pinned first (decision 324), the rest in the search's order.
  const candidates = useMemo(() => pinFirst(search.candidates, editing?.key), [search.candidates, editing?.key]);
  const editingRef = useRef(null);
  editingRef.current = editing;

  // The chosen finish (Magic) or version (Pokémon), and what they're chosen from (usePrinting.js).
  // A line saved on a TCGplayer-only version needs the TCGplayer search to find it again.
  const needSiblings = Boolean(editing?.found && selected?.key === editing.key
    && String(editing.line?.price_snapshot?.version ?? '').startsWith('jt:'));
  const { setPrinting, pokemon, siblings, magic, finish, tcgSiblings, versions, version } = usePrinting(selected, card, { needSiblings });

  // Condition, manual price and override, the manual price box, a placeholder's name (usePricing.js).
  const {
    setPricing, condition, manual, override, setCondition, setManual, setOverride, manualOpen, setManualOpen,
    setPlaceholder, placeholderName, setPlaceholderName,
  } = usePricing(selected);

  // The card's prices: JustTCG's, the fallbacks, Cardmarket, the five shown, warnings, trends (usePriceQuote.js).
  const {
    englishName, prices, result, market, fallback, settingValues, fallbackPct, eurUsd, cardmarketEur, cardmarketUsd,
    activeOverride, autoCardmarket, ladder, warnings, marketVariants, trends,
  } = usePriceQuote({
    card, selected, bulk, pokemon, versions, version, finish, magic, search, override, roundUp,
  });

  // ---- The list (spec 8.8–8.9): the walk-in draft or a collection ----
  const { current: user, pulse } = useStaff();
  const { offline } = useConnection();
  const toast = useToast();
  const { deviceId, label: deviceLabel, saved: deviceSaved } = useDevice();
  // Open for a phone to scan into (docs/SCAN_FUNCTION.md 8.1): what this
  // screen is on, its games, its user, and why it can't take cards, if it can't.
  // Once this computer's `devices` row is saved (review, 2026-10-16): a touch
  // before that is refused (no_device), and the next one is 20 seconds off.
  const scanDevice = deviceSaved ? deviceId : null;
  const scan = useScanSession(scanTarget && scanDevice ? {
    deviceId: scanDevice,
    kind: scanTarget.kind,
    buyId: scanTarget.buyId ?? null,
    name: scanTarget.name,
    games: Object.keys(searchGames).filter((g) => searchGames[g]),
    userId: user?.id ?? null,
    locked: locked ?? addLocked ?? null,
  } : null);
  const [qty, setQty] = useState('1');
  const qtyRef = useRef(null);
  const [flashId, setFlashId] = useState(null);
  /** Flash a list line that was just added or changed (1.6 seconds). */
  const flash = (id) => {
    setFlashId(id);
    setTimeout(() => setFlashId((f) => (f === id ? null : f)), 1600);
  };
  // The card the phone last added, peeking over the Selected card frame (owner, 2026-10-16, the
  // "peek" agreed): its picture and details over the card's; nothing selected, searched or priced
  // for it; the card that was selected left exactly as it was underneath. Not while a list line's
  // being edited or a dialog's open (the line just flashes). Gone at a click anywhere outside it,
  // left or right, which does nothing else ("Should the dismissing click do nothing else? yes"),
  // at Esc, or at any other key, which goes on to do its work (typing a search). No timeout
  // ("Should it disappear by itself? Off"). Its look as first built (owner: "this went too far,
  // i liked how this part looked before"): no frame, label or × of its own.
  const [phoneCard, setPhoneCard] = useState(null);   // { candidate, finish }
  const swallowUntil = useRef(0);
  // Cards from the paired phone, added as ADD CARD adds them and flashed the same way
  // (docs/SCAN_FUNCTION.md 8.3).
  useScanReceiver({
    deviceId: scanTarget ? scanDevice : null,
    label: deviceLabel ?? 'The computer',
    session: scan.session,
    list,
    roundUp,
    onAdded: (id, added) => {
      flash(id);
      if (!added?.card || editingRef.current || document.querySelector('[role="dialog"]')) return;
      setPhoneCard({ candidate: magicCandidate(added.card), finish: added.finish });
    },
  });
  // Inside the peek: its picture (a click enlarges it, a right-click searches it), its enlarged
  // view, and its details' links. Anything else is outside.
  useEffect(() => {
    if (!phoneCard) return undefined;
    const inside = (t) => Boolean(t.closest?.('[data-phone-card], .card-zoom') || (t.closest?.('[data-phone-info]') && t.closest('a')));
    const press = (e) => {
      if (inside(e.target)) return;
      // Put away, and the press that did it goes no further: no focus, no menu, no click.
      e.preventDefault();
      e.stopPropagation();
      swallowUntil.current = Date.now() + 800;
      setPhoneCard(null);
    };
    const key = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setPhoneCard(null);
      } else if (!['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) {
        setPhoneCard(null);   // and the key goes on to do its work
      }
    };
    document.addEventListener('pointerdown', press, true);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', press, true);
      document.removeEventListener('keydown', key, true);
    };
  }, [phoneCard]);
  // The rest of a press that put the peek away (its mouseup, click or right-click menu) is
  // swallowed too; listening always, since the peek's gone by the time they come.
  useEffect(() => {
    const swallow = (e) => {
      if (Date.now() >= swallowUntil.current) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.type === 'click' || e.type === 'contextmenu') swallowUntil.current = 0;
    };
    const types = ['mousedown', 'mouseup', 'click', 'auxclick', 'contextmenu'];
    types.forEach((t) => document.addEventListener(t, swallow, true));
    return () => types.forEach((t) => document.removeEventListener(t, swallow, true));
  }, []);
  // A new search puts it away too (a card picked does, in pick()).
  useEffect(() => setPhoneCard(null), [text]);
  const images = useCardImages(card);   // a Pokémon thumbnail for the line (backups too)

  // ADD CARD's requirements (spec 8.8), besides a user (GuardButton).
  const pricesLoading = prices.status === 'loading' || prices.status === 'waiting';
  const unitPrice = bulk ? manual ?? bulk.value : manual ?? ladder[condition]?.price ?? null;
  let addBlocked = null;
  if (locked) addBlocked = locked;
  else if (addLocked && !editing) addBlocked = addLocked;
  else if (!selected) {
    // Several suggestions and none picked yet: ↓ picks the first.
    addBlocked = candidates.length ? 'Select a card first: ↓ picks the first suggestion' : 'Select a card first';
  }
  else if (bulk) {
    // Bulk: a quantity of items, nothing to wait for. A placeholder's price is always typed in.
    if (bulk.item.placeholder && unitPrice == null) addBlocked = "Type its price: a placeholder has none of its own";
    // Typed, but $0: say so, rather than asking for a price that's there (FABLE_REPORT A7).
    else if (bulk.item.placeholder && !(unitPrice > 0)) addBlocked = "A placeholder's price has to be over $0";
    else if (parseQty(qty) == null) addBlocked = 'Quantity must be 1 to 99';
    else if (offline) addBlocked = 'No connection';
  }
  else if (magic ? !finish : !version) addBlocked = "Waiting for the card's versions";
  else if (pricesLoading) addBlocked = 'Waiting for prices';
  else if (unitPrice == null) addBlocked = 'No price: enter a manual price (Alt+M)';
  else if (parseQty(qty) == null) addBlocked = 'Quantity must be 1 to 99';
  else if (offline) addBlocked = 'No connection';
  const canEdit = Boolean(user) && !offline && !locked;
  const blockedBy = (reason) => () => {
    if (reason) toast(`${reason}.`, 'err');
    else if (!user) pulse();
    else toast('No connection: nothing can change until it comes back.', 'err');
  };
  const editBlocked = blockedBy(locked);
  const canRemove = Boolean(user) && !offline && !removeLocked;
  const removeBlocked = blockedBy(removeLocked);

  const visible = candidates.slice(0, shownCount);
  const hasShowAll = candidates.length > shownCount;

  // When a search settles: a lone printing is selected automatically (owner:
  // taken out 2026-10-11, put back 2026-10-12); a selection the new results
  // don't include is dropped (spec 8.3, 8.12). While a line is being edited,
  // its own search selects that exact card.
  useEffect(() => {
    if (!search.settled) return;
    // In the order shown: the card being edited pinned first (decision 324), so the highlight matches.
    const found = pinFirst(search.candidates, editing?.key);
    if (editing && !editing.found) {
      if (search.query !== editing.query) return;   // the edit's search hasn't run yet
      const index = found.findIndex((c) => c.key === editing.key);
      if (index >= 0) {
        setSelected(found[index]);
        setHighlight(0);   // pinned first (decision 324)
        setEditing((e) => e && { ...e, found: true });
      } else if (editing.exact && editing.query !== editing.exact) {
        // Not among the name's printings (one of hundreds, a basic land): its exact search instead.
        setEditing((e) => e && { ...e, query: e.exact });
        setText(editing.exact);
      } else {
        toast("Couldn't find that card again, so it can't be edited here. Remove it with × and add it again.", 'err');
        setEditing(null);
      }
      return;
    }
    if (found.length === 1) {
      setSelected(found[0]);
      setHighlight(0);
      return;
    }
    const cur = selectedRef.current;
    const index = cur ? found.findIndex((c) => c.key === cur.key) : -1;
    setSelected(index >= 0 ? found[index] : null);
    setHighlight(index >= 0 && index < shownCount ? index : -1);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once per finished search, not on every re-render of the same results
  }, [search.runId, search.settled, editing?.key, editing?.found]);

  // The edited line's card is selected: put back what was saved with it (once).
  useEffect(() => {
    if (!editing?.found || editing.restored || selected?.key !== editing.key) return;
    const { line } = editing;
    if (isBulk(line)) {
      setPricing({
        key: editing.key, condition: 'NM', manual: line.price_source === 'manual' ? Number(line.unit_price) : null, override: null,
      });
      if (isPlaceholder(line)) setPlaceholder({ key: editing.key, name: line.name === PLACEHOLDER_NAME ? '' : line.name });
      setQty(String(line.quantity));
      setEditing((e) => e && { ...e, restored: true });
      return;
    }
    if (line.game === 'pokemon') {
      if (!pokemon.resolved) return;   // its versions are still loading
      // A TCGplayer-only version comes with the card's TCGplayer search.
      const saved = line.price_snapshot?.version;
      if (saved?.startsWith('jt:') && !versions.some((x) => x.id === saved) && !tcgSiblings.settled) return;
      const same = (v) => JSON.stringify([...(v.treatments ?? [])].sort()) === JSON.stringify(line.treatments ?? []);
      const v = versions.find((x) => x.id === line.price_snapshot?.version)
        ?? versions.find((x) => x.finish === line.finish && Boolean(x.firstEdition) === line.first_edition && same(x));
      setPrinting({ key: editing.key, finish: null, version: v?.id ?? null });
    } else {
      setPrinting({ key: editing.key, finish: line.finish, version: null });
    }
    setPricing({
      key: editing.key,
      condition: line.condition,
      manual: line.price_source === 'manual' ? Number(line.unit_price) : null,
      override: line.price_snapshot?.override ?? null,
    });
    setQty(String(line.quantity));
    setEditing((e) => e && { ...e, restored: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- versions.length stands for versions, a new array every render
  }, [editing, selected?.key, pokemon.resolved, versions.length, tcgSiblings.settled]);

  // The line being edited went (removed, confirmed, cancelled): stop editing.
  useEffect(() => {
    if (editing && list.loaded && !list.lines.some((l) => l.id === editing.line.id)) setEditing(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- watches the list, not the edit: an edit always starts on a line that's there
  }, [list.lines, list.loaded]);

  function focusSearch() {
    input.current?.focus();
  }

  // Clicking the selected card again deselects it.
  function pick(c) {
    setPhoneCard(null);
    const again = selected?.key === c.key;
    setSelected(again ? null : c);
    setHighlight(again ? -1 : visible.findIndex((v) => v.key === c.key));
    setShowAll(false);
    focusSearch();
  }

  /**
   * Right-clicking a suggestion (owner, 2026-09-29): its name, as typed text,
   * becomes the search, a quick "every printing of this card". Plain text, so
   * other cards with those words in their names come up too.
   */
  function searchName(name) {
    setText(name);
    setShowAll(false);
    focusSearch();
  }

  /** Move to a sibling printing in the same set (details panel, spec 8.6). */
  function moveTo(card, nextFinish) {
    setPhoneCard(null);
    const c = magicCandidate(card);
    setSelected(c);
    setPrinting({ key: c.key, finish: nextFinish, version: null });
    setHighlight(visible.findIndex((v) => v.key === c.key));
    focusSearch();
  }

  /** Alt+F: toggle foil (Magic) or cycle the finish (Pokémon). */
  function cycleFinish() {
    if (magic) {
      const options = magicFinishes(magic);
      if (finish !== 'etched' && options.nonfoil && options.foil) {
        setPrinting({ key: selected.key, finish: finish === 'foil' ? 'nonfoil' : 'foil', version: null });
      }
    } else if (version) {
      const available = POKEMON_FINISHES.filter((f) => versions.some((v) => v.finish === f));
      const next = available[(available.indexOf(version.finish) + 1) % available.length];
      const of = versions.filter((v) => v.finish === next);
      const choice = of.find((v) => !v.treatments.length && !v.firstEdition) ?? of[0];
      setPrinting({ key: selected.key, finish: null, version: choice.id });
    }
  }

  /** CLEAR (spec 8.8): the stage back to empty and defaults; never the list. */
  function clear() {
    setPhoneCard(null);
    setText('');
    setSelected(null);
    setHighlight(-1);
    setPrinting({ key: null, finish: null, version: null });
    setPricing({ key: null, condition: 'NM', manual: null, override: null });
    setPlaceholder({ key: null, name: '' });
    setManualOpen(false);
    setQty('1');
    setEditing(null);
    focusSearch();
  }

  // A search from the address bar (owner, 2026-10-16: Chrome's "Site search", as for Scryfall): a
  // fresh stage with the search typed in, which runs it as typing does (Enter would add the card).
  useEffect(() => {
    if (urlSearch == null) return;
    clear();
    setText(searchTextFromUrl(urlSearch));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only on a new address; clear is rebuilt every render
  }, [urlSearch]);

  // A new resetKey (a walk-in buy confirmed or cancelled): a fresh start.
  const lastReset = useRef(resetKey);
  useEffect(() => {
    if (resetKey === lastReset.current) return;
    lastReset.current = resetKey;
    clear();
    setGames(BOTH_GAMES);
    setOldest(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only on a new resetKey; clear is rebuilt every render
  }, [resetKey]);

  /** Clicking a list line: load its card back to edit it (owner, 2026-09-29). */
  function startEdit(line) {
    if (line.game === 'pokemon' && line.lang !== lang) setLang(line.lang);
    // A Magic card can't be searched in JP: back to EN for it.
    if (line.game === 'mtg' && lang === 'ja') setLang('en');
    if (!games[line.game]) setGames({ ...games, [line.game]: true });
    // Every printing of its name, its own selected among them (decision 319); the exact search when
    // a name doesn't find it, or as the fallback when its card isn't among the name's printings.
    const exact = editQuery(line);
    const query = nameQuery(line) ?? exact;
    setEditing({ line, key: candidateKeyOf(line), query, exact, found: false, restored: false });
    setSelected(null);
    setHighlight(-1);
    setPrinting({ key: null, finish: null, version: null });
    setPricing({ key: null, condition: 'NM', manual: null, override: null });
    setPlaceholder({ key: null, name: '' });
    setManualOpen(false);
    setText(query);
    focusSearch();
  }

  /**
   * ADD CARD (spec 8.8): save the line (merging), flash it, reset the stage.
   * While editing, SAVE EDIT: the same, saved over the line being edited, at
   * today's price (owner, 2026-09-29, collections included).
   */
  async function addCard() {
    if (!user) {
      pulse();
      return;
    }
    // Enter (or Qty's Enter) says why nothing was added (smoke test 2026-10-11, F3):
    // with several suggestions and none picked, Enter used to do nothing at all.
    if (addBlocked) {
      toast(`${addBlocked}.`, 'err');
      return;
    }
    if (list.busy) return;
    /** Save the built line over the one being edited, or as a new one; flash it; clear the card. */
    const save = async (line) => {
      const id = editing ? await list.update(editing.line, line, user.id) : await list.add(line, user.id);
      if (!id) return;
      flash(id);
      // mimp mode (decision 293): the search stays for the next copy; an edit still clears.
      if (auto && !editing) {
        setQty('1');
        focusSearch();
      } else clear();
    };
    if (bulk) {
      // A bulk item (docs/TEAM_FEEDBACK.md 5.7): Qty counts items, at its Settings value (or its own);
      // a placeholder: its name and price as typed (owner, 2026-10-16).
      const line = bulk.item.placeholder
        ? buildPlaceholderLine(bulk.item, parseQty(qty), manual, placeholderName)
        : buildBulkLine(bulk.item, parseQty(qty), bulk.value, manual);
      await save(line);
      return;
    }
    const line = buildLine({
      candidate: selected,
      finish,
      version,
      pokemonCard: pokemon.card,
      condition,
      quantity: parseQty(qty),
      ladder,
      manual,
      result,
      // The card's variants for its finish, already worked out above (selected is `card` here: not bulk).
      variant: ladder[condition]?.source === 'justtcg' ? marketVariants[condition] ?? null : null,
      imageUrl: magic ? null : images.thumb,
      englishName,
      snapshot: {
        justtcg: market,
        fallback,
        cardmarket: cardmarketEur != null ? { eur: cardmarketEur, rate: eurUsd } : null,
        override: activeOverride,
        auto_cardmarket: autoCardmarket,
        manual: manual ?? null,
        version: version?.id ?? null,
        warnings,
        trend: manual == null && trends[condition]
          ? { dir: trends[condition].dir, pct: trends[condition].pct, days: trends[condition].days }
          : null,
      },
    });
    await save(line);
  }

  // Focus stays in the search bar; these keys drive everything (spec 8.11).
  function onKeyDown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const last = visible.length - 1 + (hasShowAll ? 1 : 0);
      if (last < 0 || (e.key === 'ArrowUp' && highlight <= 0)) return;
      const next = e.key === 'ArrowDown' ? Math.min(highlight + 1, last) : highlight - 1;
      setHighlight(next);
      if (next < visible.length) setSelected(visible[next]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      clear();
    } else if (e.key === 'Enter' && hasShowAll && highlight === visible.length) {
      e.preventDefault();
      setShowAll(true);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      addCard();
    } else if (e.altKey && e.key.toLowerCase() === 'q') {
      e.preventDefault();
      qtyRef.current?.focus();
      qtyRef.current?.select();
    } else if (e.altKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      cycleFinish();
    } else if (e.altKey && /^[1-5]$/.test(e.key) && selected) {
      e.preventDefault();
      setCondition(CONDITIONS[Number(e.key) - 1]);
    } else if (e.altKey && e.key.toLowerCase() === 'm' && selected) {
      e.preventDefault();
      setManualOpen(true);
    }
  }

  // The line under the search bar: the edit, or a hint to switch language, or a spelling fix (useSearchNote.jsx).
  const note = useSearchNote({
    search, lang, text, editing,
    switchTo: (l) => {
      setLang(l);
      focusSearch();
    },
  });

  // The price panel's Credit and Cash: the rate this card gets at this price
  // (docs/TEAM_FEEDBACK.md 4.4), a card being edited with its own or kept rates.
  const editLine = editing ? list.lines.find((l) => l.id === editing.line.id) ?? editing.line : null;
  const quoteRate = lineRate({
    ...editLine, unit_price: unitPrice ?? 0, bulk_kind: bulk ? bulk.bulk : null,
  }, rates);

  // Set value on a bulk line (docs/TEAM_FEEDBACK.md 5.6): its own value per
  // item, or null back to Settings → Bulk values; saved like an edit of it.
  const bulkValues = bulkValuesFrom(settingValues.bulk_values);
  const setLineValue = (line, value) => {
    // Only valued bulk has a Settings value to set or go back to (the list offers Set value only there). A
    // placeholder's price is typed, so SAVE EDIT changes it; built as bulk it would lose it (decision 270).
    if (!isValuedBulk(line)) return Promise.resolve(null);
    const item = bulkItem(line.bulk_kind);
    return list.update(line, buildBulkLine(item, line.quantity, bulkValues[item.kind], value), user?.id);
  };

  /** Which source the price panel names for the chosen condition (QuotePanel's `source`). */
  function quoteSource() {
    if (manual != null) return 'manual';
    if (bulk) return null;
    const step = ladder[condition];
    if (step.base?.from === 'Cardmarket' && step.source === 'fallback') return 'cardmarket';
    if (showsTcgplayer(ladder, condition, fallbackPct?.[condition])) return 'tcgplayer';
    return step.source;
  }

  // What the page's own parts (a collection's details, the list's buttons) need.
  const api = { focusSearch, canEdit, editBlocked };

  return (
    <>
      <div className={`price-screen ${className}`} ref={screen} style={{
          ...BACKGROUND,
          '--list-extra': `${listRoom.extra}px`,
          '--card-grow': `${cardSpace.grow}px`,
          '--side-give': `${cardSpace.side}px`,
        }}
      >
        <div className="stage">
          <SearchBar
            inputRef={input}
            value={text}
            onChange={setText}
            onKeyDown={onKeyDown}
            lang={lang}
            onLang={(l) => {
              setLang(l);
              focusSearch();
            }}
            auto={auto}
            onAuto={(next) => {
              setAuto(next);
              focusSearch();
            }}
            games={searchGames}
            gameBlocked={lang === 'ja' ? { mtg: JP_NO_MTG } : {}}
            onGames={(g) => {
              setGames(g);
              focusSearch();
            }}
            note={note}
            lead={searchLead}
            blocked={searchBlocked}
          />

          {/* Owner's layout (2026-09-29): card left with prices under it; info
              beside it with the suggestions below; finish & details beside the
              suggestions with the action row under them. Grid areas in price/layout.css. */}
          <div className={`stage-body${phoneCard ? ' peeking' : ''}`}>
            {phoneCard ? (
              <SelectedCard
                candidate={phoneCard.candidate}
                pokemon={NO_POKEMON}
                finish={phoneCard.finish}
                pokemonVersion={null}
                fromPhone
                onSearch={() => searchName(`${phoneCard.candidate.name} ${phoneCard.candidate.number}`)}
              />
            ) : bulk ? <BulkSelected c={bulk} name={placeholderName} onName={setPlaceholderName} /> : (
            <SelectedCard
              candidate={selected}
              typedName={search.parsed?.name}
              englishName={englishName ?? null}
              pokemon={pokemon}
              finish={finish}
              pokemonVersion={version}
              hasFirstEdition={versions.some((v) => v.firstEdition)}
            />
            )}
            <Suggestions
              search={search}
              lang={lang}
              highlight={highlight}
              selectedKey={selected?.key}
              onPick={pick}
              onSearchName={searchName}
              onShowAll={() => setShowAll(true)}
              oldest={oldest}
              count={shownCount}
              cols={listRoom.cols}
              onOldest={(o) => {
                setOldest(o);
                focusSearch();
              }}
            />
            <QuotePanel
              candidate={selected}
              loading={prices.status === 'loading' || prices.status === 'waiting'}
              condition={condition}
              price={unitPrice}
              bulkPer={bulk && !bulk.item.placeholder ? bulk.item.per : null}
              placeholder={Boolean(bulk?.item.placeholder)}
              source={quoteSource()}
              cashPct={quoteRate.cash}
              creditPct={quoteRate.credit}
              cashWhy={whyText(quoteRate.why.cash, rates)}
              creditWhy={whyText(quoteRate.why.credit, rates)}
              warnings={warnings}
              trend={manual == null && !bulk ? trends[condition] : null}
              onDone={focusSearch}
            />
            <div className="area-side">
              {bulk ? <BulkFinish c={bulk} /> : (
              <FinishPanel
                candidate={selected}
                finish={finish}
                siblings={siblings}
                onFinish={(f) => {
                  setPrinting({ key: selected.key, finish: f, version: null });
                  focusSearch();
                }}
                onMove={moveTo}
                pokemon={pokemon}
                versions={versions}
                version={version}
                tcgSiblings={tcgSiblings}
                onVersion={(id) => {
                  setPrinting({ key: selected.key, finish: null, version: id });
                  focusSearch();
                }}
              />
              )}
            </div>
            <div className="area-prices">
              {bulk ? (
                <BulkPrice
                  c={bulk}
                  manual={manual}
                  onManual={setManual}
                  rate={quoteRate}
                  // A placeholder's rates are a card's at the price typed (owner, 2026-10-16).
                  rateFor={bulk.item.placeholder
                    ? (price) => lineRate({ ...editLine, unit_price: price, bulk_kind: bulk.bulk }, rates) : null}
                  onDone={focusSearch}
                />
              ) : (
              <PriceTable
                candidate={selected}
                prices={prices}
                ladder={ladder}
                roundUp={roundUp}
                pct={fallbackPct}
                market={market}
                fallback={fallback}
                warnings={warnings}
                cardmarket={{ eur: cardmarketEur, usd: cardmarketUsd, rate: eurUsd }}
                override={activeOverride}
                autoCardmarket={autoCardmarket}
                onOverride={setOverride}
                fetchedAt={result?.card ? result.fetchedAt : null /* a "no match" has a date too */}
                condition={condition}
                onCondition={setCondition}
                manual={manual}
                onManual={setManual}
                manualOpen={manualOpen}
                setManualOpen={setManualOpen}
                onDone={focusSearch}
              />
              )}
            </div>
            <div className="area-actions">
              <ActionRow
                qtyRef={qtyRef}
                qty={qty}
                onQty={setQty}
                onClear={clear}
                onAdd={addCard}
                blocked={addBlocked}
                busy={list.busy}
                editing={Boolean(editing)}
                onDone={focusSearch}
              />
            </div>
          </div>
          <p className="hint-strip">
            ↓↑ pick · Enter add · Esc clear · Alt+1–5 condition · Alt+F foil · Alt+Q qty · Alt+M manual price
          </p>
        </div>

        <BuyList
          title={listTitle}
          lines={list.lines}
          loaded={list.loaded}
          rates={rates}
          master={master}
          ratesTitle={ratesTitle}
          flashId={flashId}
          hits={hits}
          editingId={editing?.line.id ?? null}
          canEdit={canEdit}
          locked={locked}
          editBlocked={editBlocked}
          canRemove={canRemove}
          removeLocked={removeLocked}
          removeBlocked={removeBlocked}
          onEdit={startEdit}
          onRemove={(line, n) => list.remove(line, n, user?.id)}
          // Struck cards (owner, 2026-10-16): a Paid/Ours list's × strikes first; Restore takes it back.
          onStrike={list.strike ? (line, n) => list.strike(line, n, user?.id) : null}
          onRestore={list.restore ? (line) => list.restore(line, user?.id) : null}
          onSaveRates={list.setRates ? (cash, credit) => list.setRates(cash, credit, user?.id) : null}
          onSetLineRate={list.setLineRate ? (line, cash, credit) => list.setLineRate(line, cash, credit, user?.id) : null}
          onSetLineValue={setLineValue}
          bulkValues={bulkValues}
          onDone={focusSearch}
          details={renderListDetails?.(api)}
          footer={renderListFooter?.(api)}
          badge={listBadge}
          ratesLocked={ratesLocked}
          // The paired phone (docs/SCAN_FUNCTION.md 8.2), while Magic is on.
          scanChip={searchGames.mtg ? <ScanChip session={scan.session} onUnpair={scan.unpair} /> : null}
        />

        {showAll && (
          <ShowAllModal
            candidates={candidates}
            hasMore={search.hasMore}
            selectedKey={selected?.key}
            onPick={pick}
            onSearchName={searchName}
            onClose={() => {
              setShowAll(false);
              focusSearch();
            }}
          />
        )}
      </div>
    </>
  );
}

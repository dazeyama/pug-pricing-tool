import { useEffect, useRef, useState } from 'react';
import SearchBar from './SearchBar.jsx';
import SelectedCard from './SelectedCard.jsx';
import Suggestions, { useSuggestionCount } from './Suggestions.jsx';
import ShowAllModal from './ShowAllModal.jsx';
import FinishPanel from './FinishPanel.jsx';
import PriceTable from './PriceTable.jsx';
import QuotePanel from './QuotePanel.jsx';
import ActionRow, { parseQty } from './ActionRow.jsx';
import BuyList from './BuyList.jsx';
import { usePrices } from './usePrices.js';
import { useCardSearch } from './useCardSearch.js';
import { usePokemonDetail, useMagicSiblings } from './usePrintingDetail.js';
import { useCardImages } from './useCardImages.js';
import { warmUp, magicCandidate, otherLanguageSet } from '../../lib/cardSearch.js';
import {
  defaultMagicFinish, magicFinishes, pokemonVersions, defaultPokemonVersion, POKEMON_FINISHES,
} from '../../lib/printings.js';
import {
  CONDITIONS, cardmarketPrice, conditionPrices, conditionVariants, fallbackPrice, priceLadder, priceWarnings,
  resultFor,
} from '../../lib/prices.js';
import { useSettings } from '../../state/settings.jsx';
import { useEurUsd } from '../../lib/useEurUsd.js';
import { showsTcgplayer } from '../../lib/ladder.js';
import { useEnglishPokemonName } from '../../lib/pokemonNames.js';
import { readLocal, writeLocal } from '../../lib/local.js';
import { buildLine } from '../../lib/buyLine.js';
import { lineText } from '../../lib/lineFormat.js';
import { useStaff } from '../../state/staff.jsx';
import { useConnection } from '../../state/connection.jsx';
import { useToast } from '../../components/Toast.jsx';

const BACKGROUND = { '--stage-bg': `url(${import.meta.env.BASE_URL}background.webp)` };
const LANG_KEY = 'pug.pokemonLang';

/** EN | JP for Pokémon, remembered per computer (spec 8.2). */
function usePokemonLang() {
  const [lang, setLang] = useState(() => (readLocal(LANG_KEY) === 'ja' ? 'ja' : 'en'));
  return [lang, (next) => {
    setLang(next);
    writeLocal(LANG_KEY, next);
  }];
}

// The list takes the width the suggestions don't use (owner, 2026-09-29).
// A thumbnail is at most 146px wide and also limited by the area's height
// (price.css .thumbs); on a wide screen that leaves empty space between the
// thumbnails and Finish & Details, which goes to the sidebar instead, up to
// LIST_EXTRA_MAX. Measured, since the thumbnails' size depends on their column.
const LIST_EXTRA_MAX = 220;

function useListRoom(screen) {
  const [extra, setExtra] = useState(0);
  const current = useRef(0);
  useEffect(() => {
    const area = screen.current?.querySelector('.area-thumbs');
    if (!area) return undefined;
    const measure = () => {
      // The same sums as .thumbs' --thumb-w: 36px line above, 16px between
      // the rows, 22px per label, 5 across with 14px gaps.
      const thumb = Math.min(146, ((area.clientHeight - 36 - 16 - 2 * 22) / 2) * 0.7176);
      const spare = area.clientWidth - (5 * thumb + 4 * 14);
      const next = Math.round(Math.min(LIST_EXTRA_MAX, Math.max(0, current.current + spare)));
      if (Math.abs(next - current.current) >= 2) {
        current.current = next;
        setExtra(next);
      }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => observer.disconnect();
  }, [screen]);
  return extra;
}

/** The search-bar key of a saved line's card (the candidate's key). */
const lineKey = (line) => (line.game === 'mtg' ? `mtg:${line.scryfall_id}` : `pokemon:${line.lang}:${line.tcgdex_id}`);

/**
 * A search line that finds exactly this saved card (spec 8.2's syntax):
 * "Sol Ring 472 CMR", "Charizard 4/102 BS", Japanese "025/165 SV2a".
 */
function editQuery(line) {
  const size = line.printed_size ? `/${line.printed_size}` : '';
  if (line.game === 'mtg') return `${line.name} ${line.collector_number} ${line.set_code}`;
  if (line.lang === 'ja') return `${line.collector_number}${size} ${line.set_code}`;
  return `${line.name} ${line.collector_number}${size} ${line.set_code}`;
}

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
 *   setRates: (cash: number|null, credit: number|null, userId: string) => Promise<unknown> }} p.list
 * @param {{ cash: number, credit: number, customCash: number|null, customCredit: number|null }} p.rates
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
 */
export default function PricingScreen({
  list, rates, master, locked = null, removeLocked = locked, listTitle, ratesTitle,
  renderListDetails, renderListFooter, resetKey = 0, searchLead = null, className = '', hits = null,
  searchBlocked = null, listBadge = null,
}) {
  const [text, setText] = useState('');
  const [lang, setLang] = usePokemonLang();
  const [games, setGames] = useState(BOTH_GAMES);
  const [oldest, setOldest] = useState(false);
  const searchGames = lang === 'ja' ? PKM_ONLY : games;
  const search = useCardSearch(text, lang, searchGames, oldest);
  // 10 suggestions, or 5 on a shorter window (owner, 2026-10-01).
  const shownCount = useSuggestionCount();
  const [selected, setSelected] = useState(null);
  const [highlight, setHighlight] = useState(-1);
  const [showAll, setShowAll] = useState(false);
  const input = useRef(null);
  const selectedRef = useRef(null);
  selectedRef.current = selected;

  useEffect(() => warmUp(lang), [lang]);

  // The chosen finish (Magic) or version (Pokémon) of the selected card. Tied
  // to the card's key, so a newly selected card starts on its defaults.
  const [printing, setPrinting] = useState({ key: null, finish: null, version: null });
  const pokemon = usePokemonDetail(selected);
  const siblings = useMagicSiblings(selected);
  const magic = selected?.game === 'mtg' ? selected.scryfall : null;
  const own = printing.key === selected?.key;
  const finish = magic ? (own && printing.finish) || defaultMagicFinish(magic) : null;
  const versions = selected?.game === 'pokemon' ? pokemonVersions(pokemon.card) : [];
  const version = versions.find((v) => own && v.id === printing.version) ?? defaultPokemonVersion(versions);

  // Every card starts on its defaults (owner's decision, 2026-09-29): a choice
  // is forgotten as soon as another card is selected, so coming back to a card
  // doesn't bring back an old finish. A Details jump sets the new printing's
  // finish in the same step, so it survives.
  useEffect(() => {
    if (printing.key && printing.key !== selected?.key) {
      setPrinting({ key: null, finish: null, version: null });
    }
  }, [selected?.key]);

  // Condition, manual price and override (spec 8.7): NM, none and none for
  // every new card. A manual price belongs to its condition: picking another
  // condition clears it (owner, 2026-09-29). The override is Use Fallback
  // ('fallback') or Use Cardmarket ('cardmarket'), never both.
  const [pricing, setPricing] = useState({ key: null, condition: 'NM', manual: null, override: null });
  const [manualOpen, setManualOpen] = useState(false);
  const pricingOwn = pricing.key === selected?.key;
  const condition = pricingOwn ? pricing.condition : 'NM';
  const manual = pricingOwn ? pricing.manual : null;
  const override = pricingOwn ? pricing.override : null;
  const setCondition = (code) => setPricing({
    key: selected?.key, condition: code, manual: code === condition ? manual : null, override,
  });
  const setManual = (value) => setPricing({ key: selected?.key, condition, manual: value, override });
  const setOverride = (next) => setPricing({ key: selected?.key, condition, manual, override: next });
  useEffect(() => setManualOpen(false), [selected?.key]);

  // A Japanese card's English name (Pokédex number): shown beside the
  // Japanese one, and used for JustTCG, TCGplayer and Cardmarket searches.
  const englishName = useEnglishPokemonName(pokemon.card, selected?.lang);
  const prices = usePrices(selected, {
    pokemon, versions, jaName: englishName || search.parsed?.name, waitName: englishName === undefined,
  });
  const result = resultFor(selected, prices.results, { finish, version, versions });
  const market = conditionPrices(result?.card, {
    game: selected?.game,
    lang: selected?.lang,
    finish: magic ? finish : version?.finish,
    firstEdition: version?.firstEdition,
  });
  const fallback = fallbackPrice(selected, { finish, version });
  const { values: settingValues } = useSettings();
  const fallbackPct = settingValues[selected?.game === 'pokemon' ? 'fallback_pct_pokemon' : 'fallback_pct_mtg'];
  // Use Fallback / Use Cardmarket (owner, 2026-09-29): every JustTCG price
  // thrown out; NM is the Scryfall/TCGdex price, or Cardmarket's in dollars,
  // and the other conditions that × the Master Fallback Percentages. Use
  // Fallback needs JustTCG prices to replace; Use Cardmarket needs a
  // Cardmarket price and the day's euro rate.
  const eurUsd = useEurUsd();
  const cardmarketEur = cardmarketPrice(selected, { finish, version });
  const cardmarketUsd = cardmarketEur != null && eurUsd != null ? cardmarketEur * eurUsd : null;
  const canUseFallback = fallback != null && CONDITIONS.some((c) => market[c] != null);
  const activeOverride = (override === 'fallback' && canUseFallback) || (override === 'cardmarket' && cardmarketUsd != null)
    ? override : null;
  // Japanese Pokémon with no JustTCG price for any condition (TCGdex has no
  // dollar price for them either): Cardmarket is the fallback on its own
  // (owner, 2026-09-29), like Scryfall/TCGdex for everything else.
  const autoCardmarket = !activeOverride && selected?.game === 'pokemon' && selected?.lang === 'ja'
    && cardmarketUsd != null && !CONDITIONS.some((c) => market[c] != null);
  const base = activeOverride === 'cardmarket' || autoCardmarket
    ? { price: cardmarketUsd, source: 'cardmarket' }
    : fallback;
  // The five prices shown and used (JustTCG, fallbacks, never rising, rounded down).
  const ladder = priceLadder(activeOverride ? {} : market, base, fallbackPct, selected?.game);
  // ⚠️ on NM (spec 8.7): reasons to doubt JustTCG's prices. A 1st Edition is
  // checked against its Unlimited version, whose prices came in the same request.
  const unlimited = !magic && version?.firstEdition
    ? versions.find((v) => v.finish === version.finish && !v.firstEdition && !v.treatments.length)
    : null;
  const unlimitedNM = unlimited
    ? conditionPrices(resultFor(selected, prices.results, { finish, version: unlimited, versions })?.card, {
      game: 'pokemon', lang: selected.lang, finish: unlimited.finish, firstEdition: false,
    }).NM
    : null;
  const warnings = priceWarnings({
    market, fallback, pct: fallbackPct, unlimitedNM, cardmarket: cardmarketEur, eurUsd,
  });

  // ---- The list (spec 8.8–8.9): the walk-in draft or a collection ----
  const { current: user, pulse } = useStaff();
  const { offline } = useConnection();
  const toast = useToast();
  const [qty, setQty] = useState('1');
  const qtyRef = useRef(null);
  const [flashId, setFlashId] = useState(null);
  // Editing a list line (owner, 2026-09-29): its card is searched for and
  // selected (found), then its saved choices put back (restored); EDIT CARD
  // saves over it. { line, key, query, found, restored } or null.
  const [editing, setEditing] = useState(null);
  const screen = useRef(null);
  const listExtra = useListRoom(screen);
  const images = useCardImages(selected);   // a Pokémon thumbnail for the line (backups too)

  // ADD CARD's requirements (spec 8.8), besides a user (GuardButton).
  const pricesLoading = prices.status === 'loading' || prices.status === 'waiting';
  const unitPrice = manual ?? ladder[condition]?.price ?? null;
  let addBlocked = null;
  if (locked) addBlocked = locked;
  else if (!selected) addBlocked = 'Select a card first';
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

  const visible = search.candidates.slice(0, shownCount);
  const hasShowAll = search.candidates.length > shownCount;

  // When a search settles: a lone printing is selected automatically; a
  // selection the new results don't include is dropped (spec 8.3, 8.12).
  // While a line is being edited, its own search selects that exact card.
  useEffect(() => {
    if (!search.settled) return;
    const found = search.candidates;
    if (editing && !editing.found) {
      if (search.query !== editing.query) return;   // the edit's search hasn't run yet
      const index = found.findIndex((c) => c.key === editing.key);
      if (index >= 0) {
        setSelected(found[index]);
        setHighlight(index < shownCount ? index : -1);
        setEditing((e) => e && { ...e, found: true });
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
    // Runs once per finished search, not on every re-render of the same results.
  }, [search.runId, search.settled, editing?.key, editing?.found]);

  // The edited line's card is selected: put back what was saved with it (once).
  useEffect(() => {
    if (!editing?.found || editing.restored || selected?.key !== editing.key) return;
    const { line } = editing;
    if (line.game === 'pokemon') {
      if (!pokemon.resolved) return;   // its versions are still loading
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
  }, [editing, selected?.key, pokemon.resolved, versions.length]);

  // The line being edited went (removed, confirmed, cancelled): stop editing.
  useEffect(() => {
    if (editing && list.loaded && !list.lines.some((l) => l.id === editing.line.id)) setEditing(null);
  }, [list.lines, list.loaded]);

  function focusSearch() {
    input.current?.focus();
  }

  // Clicking the selected card again deselects it.
  function pick(c) {
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
    setText('');
    setSelected(null);
    setHighlight(-1);
    setPrinting({ key: null, finish: null, version: null });
    setPricing({ key: null, condition: 'NM', manual: null, override: null });
    setManualOpen(false);
    setQty('1');
    setEditing(null);
    focusSearch();
  }

  // A new resetKey (a walk-in buy confirmed or cancelled): a fresh start.
  const lastReset = useRef(resetKey);
  useEffect(() => {
    if (resetKey === lastReset.current) return;
    lastReset.current = resetKey;
    clear();
    setGames(BOTH_GAMES);
    setOldest(false);
  }, [resetKey]);

  /** Clicking a list line: load its card back to edit it (owner, 2026-09-29). */
  function startEdit(line) {
    if (line.game === 'pokemon' && line.lang !== lang) setLang(line.lang);
    // A Magic card can't be searched in JP: back to EN for it.
    if (line.game === 'mtg' && lang === 'ja') setLang('en');
    if (!games[line.game]) setGames({ ...games, [line.game]: true });
    const query = editQuery(line);
    setEditing({ line, key: lineKey(line), query, found: false, restored: false });
    setSelected(null);
    setHighlight(-1);
    setPrinting({ key: null, finish: null, version: null });
    setPricing({ key: null, condition: 'NM', manual: null, override: null });
    setManualOpen(false);
    setText(query);
    focusSearch();
  }

  /**
   * ADD CARD (spec 8.8): save the line (merging), flash it, reset the stage.
   * While editing, EDIT CARD: the same, saved over the line being edited, at
   * today's price (owner, 2026-09-29, collections included).
   */
  async function addCard() {
    if (!user) {
      pulse();
      return;
    }
    if (addBlocked || list.busy) return;
    const opts = { game: selected.game, lang: selected.lang, finish: magic ? finish : version.finish, firstEdition: version?.firstEdition };
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
      variant: ladder[condition]?.source === 'justtcg' ? conditionVariants(result?.card, opts)[condition] : null,
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
      },
    });
    const id = editing
      ? await list.update(editing.line, line, user.id)
      : await list.add(line, user.id);
    if (!id) return;
    setFlashId(id);
    setTimeout(() => setFlashId((f) => (f === id ? null : f)), 1600);
    clear();
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

  // A set code from the other Pokémon language ("2/184 S8b" with EN on):
  // say so, with a one-click switch (owner, 2026-09-29).
  const typedSet = search.parsed?.setCode ?? null;
  const [langHint, setLangHint] = useState(null);
  useEffect(() => {
    let alive = true;
    setLangHint(null);
    if (typedSet) otherLanguageSet(typedSet, lang).then((other) => alive && other && setLangHint({ code: typedSet, lang: other }));
    return () => {
      alive = false;
    };
  }, [typedSet, lang]);

  let note = null;
  if (editing) {
    note = (
      <>
        Editing <strong>{lineText(editing.line)}</strong>: EDIT CARD saves the changes, Esc leaves it as it was.
      </>
    );
  } else if (langHint) {
    const jp = langHint.lang === 'ja';
    note = (
      <>
        <strong>{langHint.code}</strong> is {jp ? 'a Japanese' : 'an English'} Pokémon set:{' '}
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            setLang(langHint.lang);
            focusSearch();
          }}
        >
          switch to {jp ? 'JP' : 'EN'}
        </button>
      </>
    );
  } else if (search.correction) {
    note = <>Showing results for <strong>{search.correction.name}</strong></>;
  }

  // What the page's own parts (a collection's details, the list's buttons) need.
  const api = { focusSearch, canEdit, editBlocked };

  return (
    <>
      <div className={`price-screen ${className}`} ref={screen} style={{ ...BACKGROUND, '--list-extra': `${listExtra}px` }}>
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
              suggestions with the action row under them. Grid areas in price.css. */}
          <div className="stage-body">
            <SelectedCard
              candidate={selected}
              typedName={search.parsed?.name}
              englishName={englishName ?? null}
              pokemon={pokemon}
              finish={finish}
              pokemonVersion={version}
            />
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
              onOldest={(o) => {
                setOldest(o);
                focusSearch();
              }}
            />
            <QuotePanel
              candidate={selected}
              loading={prices.status === 'loading' || prices.status === 'waiting'}
              condition={condition}
              price={manual ?? ladder[condition].price}
              source={manual != null ? 'manual'
                : ladder[condition].base?.from === 'Cardmarket' && ladder[condition].source === 'fallback' ? 'cardmarket'
                  : showsTcgplayer(ladder, condition, fallbackPct?.[condition]) ? 'tcgplayer'
                    : ladder[condition].source}
              cashPct={rates.cash}
              creditPct={rates.credit}
              warnings={warnings}
              onDone={focusSearch}
            />
            <div className="area-side">
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
                onVersion={(id) => {
                  setPrinting({ key: selected.key, finish: null, version: id });
                  focusSearch();
                }}
              />
            </div>
            <div className="area-prices">
              <PriceTable
                candidate={selected}
                prices={prices}
                ladder={ladder}
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
          onSaveRates={(cash, credit) => list.setRates(cash, credit, user?.id)}
          onDone={focusSearch}
          details={renderListDetails?.(api)}
          footer={renderListFooter?.(api)}
          badge={listBadge}
        />

        {showAll && (
          <ShowAllModal
            candidates={search.candidates}
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

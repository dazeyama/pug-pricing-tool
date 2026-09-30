import { useEffect, useRef, useState } from 'react';
import SearchBar from './price/SearchBar.jsx';
import SelectedCard from './price/SelectedCard.jsx';
import Suggestions, { ROW } from './price/Suggestions.jsx';
import ShowAllModal from './price/ShowAllModal.jsx';
import FinishPanel from './price/FinishPanel.jsx';
import PriceTable from './price/PriceTable.jsx';
import { usePrices } from './price/usePrices.js';
import { useCardSearch } from './price/useCardSearch.js';
import { usePokemonDetail, useMagicSiblings } from './price/usePrintingDetail.js';
import { warmUp, magicCandidate, otherLanguageSet } from '../lib/cardSearch.js';
import {
  defaultMagicFinish, magicFinishes, pokemonVersions, defaultPokemonVersion, POKEMON_FINISHES,
} from '../lib/printings.js';
import {
  CONDITIONS, cardmarketPrice, conditionPrices, fallbackPrice, priceLadder, priceWarnings, resultFor,
} from '../lib/prices.js';
import { useSettings } from '../state/settings.jsx';
import QuotePanel from './price/QuotePanel.jsx';
import { useEurUsd } from '../lib/useEurUsd.js';
import { useEnglishPokemonName } from '../lib/pokemonNames.js';
import { readLocal, writeLocal } from '../lib/local.js';

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

// MTG | PKM (owner, 2026-09-29): which games search asks, both by default.
// Kept for the whole buy, and back to both when the Price tab is left (the
// page unmounts) or, from Phase 6, when a buy is confirmed or cancelled.
const BOTH_GAMES = { mtg: true, pokemon: true };

// The Price tab (spec 8): search, suggestions, the selected card, and its
// finish and details (Phase 4). Prices (Phase 5) and the buy list (Phase 6)
// are marked where they'll go.
export default function PricePage() {
  const [text, setText] = useState('');
  const [lang, setLang] = usePokemonLang();
  const [games, setGames] = useState(BOTH_GAMES);
  const search = useCardSearch(text, lang, games);
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

  const visible = search.candidates.slice(0, ROW);
  const hasShowAll = search.candidates.length > ROW;

  // When a search settles: a lone printing is selected automatically; a
  // selection the new results don't include is dropped (spec 8.3, 8.12).
  useEffect(() => {
    if (!search.settled) return;
    const list = search.candidates;
    if (list.length === 1) {
      setSelected(list[0]);
      setHighlight(0);
      return;
    }
    const cur = selectedRef.current;
    const index = cur ? list.findIndex((c) => c.key === cur.key) : -1;
    setSelected(index >= 0 ? list[index] : null);
    setHighlight(index >= 0 && index < ROW ? index : -1);
    // Runs once per finished search, not on every re-render of the same results.
  }, [search.runId, search.settled]);

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
      const pick = of.find((v) => !v.treatments.length && !v.firstEdition) ?? of[0];
      setPrinting({ key: selected.key, finish: null, version: pick.id });
    }
  }

  function clear() {
    setText('');
    setSelected(null);
    setHighlight(-1);
    focusSearch();
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
  if (langHint) {
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

  return (
    <div className="price-screen" style={BACKGROUND}>
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
          games={games}
          onGames={(g) => {
            setGames(g);
            focusSearch();
          }}
          note={note}
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
            onShowAll={() => setShowAll(true)}
          />
          <QuotePanel
            candidate={selected}
            loading={prices.status === 'loading' || prices.status === 'waiting'}
            condition={condition}
            price={manual ?? ladder[condition].price}
            source={manual != null ? 'manual'
              : ladder[condition].base?.from === 'Cardmarket' && ladder[condition].source === 'fallback' ? 'cardmarket'
                : ladder[condition].source}
            cashPct={settingValues.cash_pct}
            creditPct={settingValues.credit_pct}
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
            <div className="stage-slot">Qty · CLEAR · ADD CARD · Phase 6</div>
          </div>
        </div>
        <p className="hint-strip">↓↑ pick · Esc clear · Alt+1–5 condition · Alt+F foil · Alt+M manual price</p>
      </div>

      <aside className="buy-list">
        <div className="list-head">
          <span className="list-title">Buy list</span>
          <span className="list-count">0 cards</span>
        </div>
        <p className="list-empty">Cards you add will appear here (Phase 6).</p>
      </aside>

      {showAll && (
        <ShowAllModal
          candidates={search.candidates}
          hasMore={search.hasMore}
          selectedKey={selected?.key}
          onPick={pick}
          onClose={() => {
            setShowAll(false);
            focusSearch();
          }}
        />
      )}
    </div>
  );
}

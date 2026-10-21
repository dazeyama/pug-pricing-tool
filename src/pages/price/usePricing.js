import { useEffect, useState } from 'react';

/**
 * What's chosen for the selected card's price (PricingScreen; FABLE_REPORT
 * C1): its condition, a manual price, Use Fallback / Use Cardmarket, whether
 * the manual price box is open, and a placeholder's name. Each belongs to
 * the card it was chosen for: another card starts on NM, no manual price, no
 * override and no name, and so does the first card when it's picked again.
 * A locked condition or price source (right-click; decisions 401, 402) is what
 * every new card starts on instead, until it's unlocked or the screen is left.
 */
export function usePricing(selected) {
  // The locks (decisions 401, 402): a pile of LP cards, or one priced from TCGplayer, entered
  // at once. Kept while this screen is open, like EN | JP; never saved.
  const [locks, setLocks] = useState({ condition: null, source: null });
  // Condition, manual price and override (spec 8.7): NM, none and none for
  // every new card. A manual price belongs to its condition: picking another
  // condition clears it (owner, 2026-09-29). The override is Use Fallback
  // ('fallback') or Use Cardmarket ('cardmarket'), never both.
  const [pricing, setPricing] = useState({ key: null, condition: 'NM', manual: null, override: null });
  const [manualOpen, setManualOpen] = useState(false);
  const pricingOwn = pricing.key === selected?.key;
  const condition = pricingOwn ? pricing.condition : locks.condition ?? 'NM';
  const manual = pricingOwn ? pricing.manual : null;
  const override = pricingOwn ? pricing.override : locks.source;
  const setCondition = (code) => setPricing({
    key: selected?.key, condition: code, manual: code === condition ? manual : null, override,
  });
  const setManual = (value) => setPricing({ key: selected?.key, condition, manual: value, override });
  const setOverride = (next) => setPricing({ key: selected?.key, condition, manual, override: next });
  // A placeholder's name as typed (owner, 2026-10-16), kept with the selection like its price.
  const [placeholder, setPlaceholder] = useState({ key: null, name: '' });
  const placeholderName = placeholder.key === selected?.key ? placeholder.name : '';
  const setPlaceholderName = (name) => setPlaceholder({ key: selected?.key, name });
  // Every card starts fresh (owner, 2026-10-16, decision 272), like its finish
  // (usePrinting.js): picking another card forgets these choices, so coming
  // back to a card doesn't bring back its old condition, price or name. SAVE
  // EDIT puts a line's back once its card is selected (PricingScreen's restore
  // effect runs after this one), so they survive.
  useEffect(() => {
    if (pricing.key && pricing.key !== selected?.key) {
      setPricing({ key: null, condition: 'NM', manual: null, override: null });
    }
    if (placeholder.key && placeholder.key !== selected?.key) setPlaceholder({ key: null, name: '' });
    setManualOpen(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only when another card is selected; the keys are what it compares with
  }, [selected?.key]);

  /** Right-click on a condition (decision 401): lock it, and this card takes it; again, unlock. */
  const lockCondition = (code) => {
    if (locks.condition === code) {
      setLocks({ ...locks, condition: null });
      return;
    }
    setLocks({ ...locks, condition: code });
    if (code !== condition) setCondition(code);
  };
  /** Right-click on Use TCGplayer / Use Cardmarket (decision 402): lock it, and this card takes it; again, unlock. */
  const lockSource = (kind) => {
    if (locks.source === kind) {
      setLocks({ ...locks, source: null });
      return;
    }
    setLocks({ ...locks, source: kind });
    if (override !== kind) setOverride(kind);
  };
  /** A card without the locked source (decision 402): the lock goes, and this card goes back to JustTCG. */
  const unlockSource = () => {
    setLocks((l) => ({ ...l, source: null }));
    setPricing({ key: selected?.key, condition, manual, override: null });
  };

  return {
    setPricing, condition, manual, override, setCondition, setManual, setOverride, manualOpen, setManualOpen,
    setPlaceholder, placeholderName, setPlaceholderName,
    lockedCondition: locks.condition, lockedSource: locks.source, lockCondition, lockSource, unlockSource,
  };
}

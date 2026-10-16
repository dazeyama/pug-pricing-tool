import { useEffect, useState } from 'react';

/**
 * What's chosen for the selected card's price (PricingScreen; FABLE_REPORT
 * C1): its condition, a manual price, Use Fallback / Use Cardmarket, whether
 * the manual price box is open, and a placeholder's name. Each belongs to
 * the card it was chosen for: another card starts on NM, no manual price, no
 * override and no name, and so does the first card when it's picked again.
 */
export function usePricing(selected) {
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

  return {
    setPricing, condition, manual, override, setCondition, setManual, setOverride, manualOpen, setManualOpen,
    setPlaceholder, placeholderName, setPlaceholderName,
  };
}

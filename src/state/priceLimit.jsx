import { createContext, useCallback, useContext, useEffect, useState } from 'react';

// JustTCG's daily allowance used up (spec 5.3, 7.5): the banner "enter prices
// manually until <reset time>" shows on every tab until the reset passes.
const PriceLimitContext = createContext({ limitUntil: null, reachedLimit: () => {} });

export function PriceLimitProvider({ children }) {
  const [limitUntil, setLimitUntil] = useState(null);

  // Clear it at the reset time.
  useEffect(() => {
    if (!limitUntil) return undefined;
    const ms = limitUntil.getTime() - Date.now();
    if (ms <= 0) {
      setLimitUntil(null);
      return undefined;
    }
    const timer = setTimeout(() => setLimitUntil(null), Math.min(ms, 2 ** 31 - 1));
    return () => clearTimeout(timer);
  }, [limitUntil]);

  /** @param {Date|null} until  null when the reset time isn't known (monthly limit) */
  const reachedLimit = useCallback((until) => {
    setLimitUntil(until ?? new Date(Date.now() + 3600_000));
  }, []);

  return (
    <PriceLimitContext.Provider value={{ limitUntil, reachedLimit }}>
      {children}
    </PriceLimitContext.Provider>
  );
}

export function usePriceLimit() {
  return useContext(PriceLimitContext);
}

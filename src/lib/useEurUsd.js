import { useEffect, useState } from 'react';

// Dollars per euro, for the Cardmarket price warning (spec 8.7): the European
// Central Bank's daily rate from Frankfurter (free, no key, allows browsers;
// spec 5.4). One request per page load, which the browser caches for a day.
// Null until it arrives, or if it can't be had: the Cardmarket check then
// just doesn't run.
const RATE_URL = 'https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD';
let rate = null;
let pending = null;

export function loadEurUsd() {
  pending ??= fetch(RATE_URL)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      rate = typeof data?.rates?.USD === 'number' ? data.rates.USD : null;
      if (rate == null) pending = null;   // try again next time
      return rate;
    })
    .catch(() => {
      pending = null;
      return null;
    });
  return pending;
}

export function useEurUsd() {
  const [value, setValue] = useState(rate);
  useEffect(() => {
    let live = true;
    loadEurUsd().then((r) => {
      if (live && r != null) setValue(r);
    });
    return () => {
      live = false;
    };
  }, []);
  return value;
}

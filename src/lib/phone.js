// US phone numbers for collections (spec 9.3): shown as (555) 123-4567,
// stored as 10 digits. A leading 1 (the country code) is dropped: no US area
// code starts with 1.

/** The digits to store: at most 10, without a leading 1. */
export function phoneDigits(input) {
  let digits = String(input ?? '').replace(/\D/g, '');
  if (digits.startsWith('1')) digits = digits.slice(1);
  return digits.slice(0, 10);
}

/** Exactly 10 digits once a leading 1 is dropped. */
export function validPhone(input) {
  return phoneDigits(input).length === 10;
}

/**
 * "(555) 123-4567", or as far as the typing has got: "(555", "(555) 12".
 * Used for display and to reformat the field as it's typed.
 */
export function formatPhone(input) {
  const d = phoneDigits(input);
  if (!d) return '';
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

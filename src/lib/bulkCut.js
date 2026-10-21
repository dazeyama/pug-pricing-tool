// Bulk export rates (decision 416): the two prices that sort a card as bulk, set in Settings. Red up
// to the first (true bulk), amber up to the second (a $1 card); every card up to the second is the
// bulk that Export MTG csv (>…) pulls and Print MTG (>…) leaves off. Pure: the setting comes in.

/** The slider's ends: a cut is a whole number of cents between them. */
export const CUT_MIN = 0.01;
export const CUT_MAX = 3;

/** The owner's defaults (decision 416): red 1¢ to 50¢, amber 51¢ to $1.49. */
export const DEFAULT_BULK_CUT = { red: 0.5, amber: 1.49 };

const cents = (v) => Math.round(Number(v) * 100);

/**
 * The saved setting, checked: whole cents from 1¢ to $3, red below amber; else the defaults.
 * @param {any} value  settings' `bulk_export_rates`
 * @returns {{ red: number, amber: number }}
 */
export function bulkCutFrom(value) {
  const red = cents(value?.red);
  const amber = cents(value?.amber);
  const ok = (c) => Number.isFinite(c) && c >= cents(CUT_MIN) && c <= cents(CUT_MAX);
  if (!ok(red) || !ok(amber) || red >= amber) return { ...DEFAULT_BULK_CUT };
  return { red: red / 100, amber: amber / 100 };
}

/**
 * A price's band (decision 404, its edges decision 416): 'bulk' up to red, 'dollar' up to amber,
 * else null (plain ink). No price: null.
 * @param {number|null|undefined} price
 * @param {{ red: number, amber: number }} [cut]
 * @returns {'bulk'|'dollar'|null}
 */
export function priceTone(price, cut = DEFAULT_BULK_CUT) {
  if (price == null || Number.isNaN(Number(price))) return null;
  const c = cents(price);
  if (c <= cents(cut.red)) return 'bulk';
  if (c <= cents(cut.amber)) return 'dollar';
  return null;
}

/** Bulk to pull from an export or leave off a print: up to amber, red included. */
export function isBulkPrice(price, cut = DEFAULT_BULK_CUT) {
  return cents(price) <= cents(cut.amber);
}

/** A cut as people say it: "50¢", "$1", "$1.49". */
export function cutMoney(v) {
  if (v == null || Number.isNaN(Number(v))) return '—';
  const c = cents(v);
  if (c < 100) return `${c}¢`;
  return c % 100 ? `$${(c / 100).toFixed(2)}` : `$${c / 100}`;
}

/** The buttons' tag: Print MTG (>$1.49). */
export function keptTag(cut) {
  return `>${cutMoney(cut.amber)}`;
}

/** What a (>…) print or export keeps: "$1.50 or more". */
export function keptWords(cut) {
  return `${cutMoney((cents(cut.amber) + 1) / 100)} or more`;
}

/** What it pulls or leaves off: "$1.49 or under". */
export function bulkWords(cut) {
  return `${cutMoney(cut.amber)} or under`;
}

/** The bands in words, for the printout's key: "50¢ and under", "51¢ to $1.49". */
export function bandWords(cut) {
  return {
    red: `${cutMoney(cut.red)} and under`,
    amber: `${cutMoney((cents(cut.red) + 1) / 100)} to ${cutMoney(cut.amber)}`,
  };
}

/** A (>…) file's name part: "over-1.49", "over-50c", "over-2". */
export function keptFileTag(cut) {
  return `over-${cutMoney(cut.amber).replace('$', '').replace('¢', 'c')}`;
}

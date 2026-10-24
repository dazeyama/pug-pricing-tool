// A condition button's price, sized to its button (decision 505): since prices round to 50¢ (decision 478),
// "$63.50" is the usual length, and a size picked by the number of characters fit some windows and ran
// edge to edge on others. The price's width in ems, worked out from what it's made of, lets the CSS size it
// from the button's own width (conditions.css .pc-price).

// Each character's width in ems, in the price's font (Segoe UI, weight 800, tabular figures), measured in
// the browser on 2026-10-24: "$63.50" is 59.7px at 18px.
const EM = { $: 0.833, digit: 0.483, '.': 0.55, ',': 0.456 };

/**
 * How wide a price is, in ems: "$63.50" → 3.32, "$1,234.50" → 4.74.
 * @param {string} text  a price as formatMoney writes it
 */
export function priceEms(text) {
  let em = 0;
  for (const ch of String(text)) em += /\d/.test(ch) ? EM.digit : EM[ch] ?? EM.digit;
  return Math.round(em * 100) / 100;
}

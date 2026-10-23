import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_OWNED, adjustRate, ccRowText, finishWord, isLowEnd, ownedAdjust, ownedCounts, ownedCut, ownedFrom, ownedRates,
  signedPct,
} from '../src/lib/ownedRates.js';

// Owner, 2026-10-22 (decision 448): 5% per copy of the card over 2, as a percent of the rate, up to 50%.
test('the cut: nothing up to 2 copies, then 5% a copy, 50% at most', () => {
  assert.equal(ownedCut(0), 0);
  assert.equal(ownedCut(2), 0);
  assert.equal(ownedCut(3), 5);
  assert.equal(ownedCut(4), 10);
  assert.equal(ownedCut(6), 20);
  assert.equal(ownedCut(12), 50);
  assert.equal(ownedCut(40), 50);
  assert.equal(ownedCut(null), 0);
});

test('a rate changed as a percent of itself, kept to the cent of a percent, never past 100', () => {
  // The owner's examples: Credit 60% / Cash 40% with 4 owned; Force of Will on the high end (70 / 40).
  assert.equal(adjustRate(60, -10), 54);
  assert.equal(adjustRate(40, -10), 36);
  assert.equal(adjustRate(70, -10), 63);
  assert.equal(adjustRate(65, -5), 61.75);
  assert.equal(adjustRate(45, -5), 42.75);
  assert.equal(adjustRate(60, -50), 30);
  assert.equal(adjustRate(60, 10), 66);
  assert.equal(adjustRate(95, 10), 100);
  assert.deepEqual(ownedRates({ cash: 40, credit: 60 }, { net: -20 }), { cash: 32, credit: 48, net: -20, adjust: { net: -20 } });
  assert.equal(ownedRates({ cash: 40, credit: 60 }, { net: 0 }), null);
});

// Owner, 2026-10-23 (decision 457): +5% for the first of this printing, 5% more for the first of the card,
// stacking with the cut.
test('bonuses for a first copy, stacked with the cut', () => {
  const counts = (printing, card, sure = true) => ({ printing, card, printingSure: sure, cardSure: sure });
  assert.deepEqual(ownedAdjust(counts(0, 0)),
    { bonus: 10, cut: 0, net: 10, firstPrinting: true, firstCard: true, over: 0, lowEndNoBonus: false, cfg: DEFAULT_OWNED });
  assert.equal(ownedAdjust(counts(0, 1)).net, 5);   // the first of this printing only
  assert.equal(ownedAdjust(counts(1, 2)).net, 0);   // neither
  const both = ownedAdjust(counts(0, 4));            // first printing, 2 copies of the card over 2
  assert.equal(both.bonus, 5);
  assert.equal(both.cut, 10);
  assert.equal(both.net, -5);
  assert.equal(ownedAdjust(counts(0, 3)).net, 0);   // they cancel out
  // A count the inventory couldn't make gets no bonus: it might be a card we have.
  assert.equal(ownedAdjust(counts(0, 0, false)).bonus, 0);
  assert.equal(ownedAdjust({ printing: 0, card: 2, printingSure: false, cardSure: true }).bonus, 0);
  assert.equal(ownedAdjust({ printing: 0, card: 0, printingSure: false, cardSure: true }).bonus, 10);
  assert.equal(ownedAdjust(null).net, 0);
  // Owner, 2026-10-23 (decision 458): no first-copy bonus on a low-end card; the cut still applies.
  const low = ownedAdjust(counts(0, 0), { lowEnd: true });
  assert.equal(low.bonus, 0);
  assert.equal(low.net, 0);
  assert.equal(low.lowEndNoBonus, true);
  assert.equal(ownedAdjust(counts(0, 5), { lowEnd: true }).net, -15);
  assert.equal(ownedAdjust(counts(1, 2), { lowEnd: true }).lowEndNoBonus, false);
  assert.equal(isLowEnd({ why: { cash: 'low', credit: 'low' } }), true);
  assert.equal(isLowEnd({ why: { cash: 'base', credit: 'custom' } }), false);
  assert.equal(signedPct(10), '+10%');
  assert.equal(signedPct(-5), '−5%');
});

test("the counts: the inventory's plus ours, unsure where the inventory couldn't count", () => {
  const c = ownedCounts({ cc_printing: 2, cc_card: 5, ours_printing: 1, ours_card: 3, inventory_at: 'x' });
  assert.equal(c.printing, 3);
  assert.equal(c.card, 8);
  assert.equal(c.printingSure && c.cardSure, true);
  const none = ownedCounts({ cc_printing: null, cc_card: null, ours_printing: 1, ours_card: 2, inventory_at: null });
  assert.equal(none.printing, 1);
  assert.equal(none.card, 2);
  assert.equal(none.printingSure || none.cardSure, false);
  assert.equal(ownedCounts(null).card, 0);
  assert.deepEqual(ownedCounts(null).cc.list, []);
});

// Owner, 2026-10-23 (decision 467): when the inventory can't match the printing, n/a and no rate change.
test('known only when the inventory could count both; a card it has none of is a known 0', () => {
  assert.equal(ownedCounts({ cc_printing: 2, cc_card: 5 }).known, true);
  const unmatched = ownedCounts({ cc_printing: null, cc_card: 5, ours_printing: 0, ours_card: 1 });
  assert.equal(unmatched.known, false);
  assert.equal(ownedAdjust(unmatched).net, 0);
  assert.equal(ownedAdjust(ownedCounts({ cc_printing: null, cc_card: 9 })).cut, 0);   // not even the cut
  // Never stocked: no product to match, but none of the card means none of the printing.
  const never = ownedCounts({ cc_printing: null, cc_card: 0, ours_printing: 0, ours_card: 0 });
  assert.equal(never.known, true);
  assert.equal(never.printing, 0);
  assert.equal(ownedAdjust(never).net, 10);
  assert.equal(ownedCounts({ cc_printing: null, cc_card: null, inventory_at: null }).known, false);
});

// Owner, 2026-10-22: "it has to show specifically, which printings we own".
test('the lists of printings come through, counts as numbers, this printing marked', () => {
  const c = ownedCounts({
    cc_list: [{ category: 'Alliances', name: 'Force of Will', qty: '2', this: true }],
    ours_list: [{ set_code: '2XM', set_name: 'Double Masters', number: '51', finish: 'foil', qty: 1, this: null }],
  });
  assert.deepEqual(c.cc.list, [{ category: 'Alliances', name: 'Force of Will', qty: 2, this: true }]);
  assert.equal(c.ours.list[0].this, false);
  assert.equal(ccRowText({ category: 'Double Masters', name: 'Force of Will - Foil - Borderless' }),
    'Double Masters · Foil - Borderless');
  assert.equal(ccRowText({ category: 'Alliances', name: 'Force of Will' }), 'Alliances');
  assert.equal(ccRowText({ category: 'Secret Lair Drop Series', name: 'Fabricate (2090) - Rainbow Foil' }),
    'Secret Lair Drop Series · #2090 · Rainbow Foil');
  assert.equal(finishWord('nonfoil'), '');
  assert.equal(finishWord('foil'), 'foil');
});

// Owner, 2026-10-23 (decision 474): Settings → Copies we own.
test('the setting: read over the defaults, anything out of range or missing falls back', () => {
  assert.deepEqual(ownedFrom(null), DEFAULT_OWNED);
  assert.deepEqual(ownedFrom({ step: 10, on: false }), { ...DEFAULT_OWNED, step: 10, on: false });
  assert.equal(ownedFrom({ cap: 150 }).cap, 50);        // over 100: the default
  assert.equal(ownedFrom({ free: -1 }).free, 2);
  assert.equal(ownedFrom({ free: 3.7 }).free, 3);       // a whole number of copies
  assert.equal(ownedFrom({ step: 'x' }).step, 5);
  assert.equal(ownedFrom({ low_end_bonus: 'yes' }).low_end_bonus, false);   // a switch is true or false
});

test("the setting's numbers are the ones the rate uses", () => {
  const cfg = ownedFrom({ free: 3, step: 10, cap: 30, first_printing: 2, first_card: 8, low_end_bonus: true });
  assert.equal(ownedCut(3, cfg), 0);
  assert.equal(ownedCut(5, cfg), 20);
  assert.equal(ownedCut(20, cfg), 30);
  const counts = (printing, card) => ({ printing, card, printingSure: true, cardSure: true });
  assert.equal(ownedAdjust(counts(0, 0), { cfg }).net, 10);
  assert.equal(ownedAdjust(counts(0, 1), { cfg }).net, 2);
  // Bonuses on low-end cards switched on.
  assert.equal(ownedAdjust(counts(0, 0), { cfg, lowEnd: true }).net, 10);
  // A bonus set to 0 isn't one: nothing to explain.
  const noFirst = ownedFrom({ first_printing: 0, first_card: 0 });
  const none = ownedAdjust(counts(0, 0), { cfg: noFirst, lowEnd: true });
  assert.equal(none.firstPrinting || none.firstCard || none.lowEndNoBonus, false);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_OWNED, DEFAULT_STALE, adjustRate, ccRowText, finishWord, isLowEnd, ownedAdjust, ownedCounts, ownedCut, ownedFrom,
  ownedRates, ownedReason, ownedRows, signedPct, staleFrom,
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
    {
      bonus: 10, cut: 0, stale: false, staleCut: 0, staleDays: null, net: 10, firstPrinting: true, firstCard: true, over: 0,
      lowEndNoBonus: false, cfg: DEFAULT_OWNED,
    });
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

// Owner, 2026-10-24 (decision 499): which CC product the printing matched, named in the box.
test('the matched product comes through, in stock or not; none when no product clearly is it', () => {
  const c = ownedCounts({
    cc_printing: 0, cc_card: 3, cc_list: [{ category: 'Alliances', name: 'Force of Will', qty: 3, this: false }],
    cc_match: { product_id: 'p9', category: 'Double Masters', name: 'Force of Will - Foil' },
  });
  assert.deepEqual(c.cc.match, { product_id: 'p9', category: 'Double Masters', name: 'Force of Will - Foil' });
  assert.equal(ownedCounts({ cc_printing: null, cc_card: 5 }).cc.match, null);
  assert.equal(ownedCounts(null).cc.match, null);
});

// Owner, 2026-10-24 (decision 500): a match that didn't go through says so, apart from no clear product.
test('a failed match: unknown and told apart, no rate change; a card never stocked is still a known 0', () => {
  const failed = ownedCounts({ cc_printing: null, cc_card: 2, ours_card: 0, inventory_at: 'x', cc_match_failed: true });
  assert.equal(failed.known, false);
  assert.equal(failed.matchFailed, true);
  assert.equal(ownedAdjust(failed).net, 0);
  assert.equal(ownedCounts({ cc_printing: null, cc_card: 2, inventory_at: 'x' }).matchFailed, false);
  // None of the card in CC: the count is known whatever the match did.
  const never = ownedCounts({ cc_printing: null, cc_card: 0, inventory_at: 'x', cc_match_failed: true });
  assert.equal(never.known, true);
  assert.equal(never.matchFailed, false);
});

// Owner, 2026-10-24 (decision 518): the box as one verdict and one list.
test('one list: this printing first, then most first; its product at ×0 when we have none; ours tagged', () => {
  const wrath = ownedCounts({
    cc_printing: 1, cc_card: 5, ours_printing: 0, ours_card: 1, inventory_at: 'x',
    cc_list: [
      { product_id: 'r', category: 'Revised Edition', name: 'Wrath of God', qty: 2, this: false },
      { product_id: 'f', category: 'Fourth Edition', name: 'Wrath of God', qty: 1, this: true },
    ],
    ours_list: [{ scryfall_id: 's', set_code: 'SLD', set_name: 'Secret Lair Drop', number: '185', finish: 'nonfoil', qty: 1, this: false }],
    cc_match: { product_id: 'f', category: 'Fourth Edition', name: 'Wrath of God' },
  });
  const rows = ownedRows(wrath);
  // This printing's row by its product's full name (decision 519), the others by category and variant.
  assert.deepEqual(rows.map((r) => [r.text, r.qty, r.this, r.ours]), [
    ['Wrath of God · Fourth Edition', 1, true, false],
    ['Revised Edition', 2, false, false],
    ['SLD #185 Secret Lair Drop', 1, false, true],
  ]);
  // Pointing at this printing's row shows its full name as the row says it (decision 537).
  assert.equal(rows[0].title, 'Wrath of God · Fourth Edition');
  assert.equal(rows[1].title, 'Revised Edition · Wrath of God');
  // None of this printing in stock: its matched product is a row at ×0, first.
  const none = ownedCounts({
    cc_printing: 0, cc_card: 2, inventory_at: 'x',
    cc_list: [{ product_id: 'r', category: 'Revised Edition', name: 'Wrath of God', qty: 2, this: false }],
    cc_match: { product_id: 'f', category: 'Fourth Edition', name: 'Wrath of God' },
  });
  assert.deepEqual(ownedRows(none).map((r) => [r.text, r.qty, r.this]), [['Wrath of God · Fourth Edition', 0, true], ['Revised Edition', 2, false]]);
  // An inventory without quantities: no ×0 row, the count isn't known.
  assert.deepEqual(ownedRows(ownedCounts({ cc_card: null, cc_match: { category: 'A', name: 'B' } })), []);
  assert.deepEqual(ownedRows(null), []);
});

test('the reason in one line: the cut, the bonuses, a low-end card, nothing to change, cancelling out', () => {
  const r = (counts, o) => ownedReason(ownedAdjust(ownedCounts(counts), o), o);
  assert.equal(r({ cc_printing: 1, cc_card: 6 }), '4 copies over 2, at 5% each');
  assert.equal(r({ cc_printing: 0, cc_card: 0 }), 'First of this printing (+5%) and of this card (+5%)');
  assert.equal(r({ cc_printing: 0, cc_card: 0 }, { finish: 'foil' }), 'First of this printing in foil (+5%) and of this card (+5%)');
  assert.equal(r({ cc_printing: 0, cc_card: 2 }), 'First of this printing (+5%)');
  assert.equal(r({ cc_printing: 0, cc_card: 0 }, { lowEnd: true, lowEndWhy: 'low end: cards under $3' }),
    'No first-copy bonus on a low-end card (low end: cards under $3)');
  assert.equal(r({ cc_printing: 1, cc_card: 2 }), 'We have this printing, and 2 or fewer of the card');
  // One line each (decision 522).
  assert.equal(r({ cc_printing: 0, cc_card: 3 }), 'First of this printing (+5%);\n1 copy over 2, at 5% each: they cancel out');
  assert.equal(r({ cc_printing: 0, cc_card: 6 }), 'First of this printing (+5%);\n4 copies over 2, at 5% each');
  assert.equal(r({ cc_printing: 0, cc_card: 6 }, { lowEnd: true }),
    '4 copies over 2, at 5% each;\nNo first-copy bonus on a low-end card');
  assert.equal(r({ cc_printing: 1, cc_card: 20 }), '18 copies over 2, at 5% each, 50% at most');
  assert.equal(ownedReason(null), '');
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

// Owner, 2026-11-10 (decision 582): a stale card's rate goes down by the stale setting's percent, in the one
// pill with the cut and the bonuses, on top of the copies cut's "at most" ("Have them be separate.").
test('stale: the exact printing only, its own cut on top of the copies cut, said in the box', () => {
  const raw = (o) => ({
    cc_printing: 1, cc_card: 2, inventory_at: 'x', cc_match: { product_id: 'p', category: 'Alpha', name: 'Mox' }, ...o,
  });
  const file = (days) => ({ days, uploaded_at: '2026-11-10T00:00:00Z' });
  const stale = ownedCounts(raw({ stale_ids: ['q', 'p'], stale_file: file(180) }));
  assert.deepEqual(stale.stale, { days: 180 });
  // Only the matched product, so only a printing whose product is known: another of the card's isn't it.
  assert.equal(ownedCounts(raw({ stale_ids: ['q'], stale_file: file(180) })).stale, null);
  assert.equal(ownedCounts(raw({ stale_ids: ['p'], stale_file: file(180), cc_match: null })).stale, null);
  assert.equal(ownedCounts(raw({ stale_ids: 'p' })).stale, null);
  assert.equal(ownedCounts(raw({ stale_file: null })).stale, null);
  assert.equal(ownedCounts(raw({ stale_ids: ['p'], stale_file: null })).stale.days, null);

  const a = ownedAdjust(stale);
  assert.equal(a.staleCut, 10);
  assert.equal(a.net, -10);
  assert.equal(ownedReason(a), 'Stale: no sale in 180 days (−10%)');
  assert.deepEqual(ownedRates({ cash: 40, credit: 60 }, a), { cash: 36, credit: 54, net: -10, adjust: a });
  // The setting's percent; 0 is no stale cut, but the box still says it's stale.
  assert.equal(ownedAdjust(stale, { stale: staleFrom({ pct: 20 }) }).net, -20);
  const off = ownedAdjust(stale, { stale: staleFrom({ pct: 0 }) });
  assert.equal(off.net, 0);
  assert.equal(off.stale, true);
  assert.equal(ownedReason(off), 'Stale: no sale in 180 days');
  assert.equal(ownedReason(ownedAdjust(ownedCounts(raw({ stale_ids: ['p'] })))), 'Stale: no sale in the stale file’s window (−10%)');

  // Outside the cap: 20 copies is the copies cut's 50% at most, and stale's 10% on top.
  const many = ownedAdjust(ownedCounts(raw({ cc_card: 20, stale_ids: ['p'], stale_file: file(90) })));
  assert.equal(many.cut, 50);
  assert.equal(many.net, -60);
  assert.equal(ownedReason(many), '18 copies over 2, at 5% each, 50% at most;\nStale: no sale in 90 days (−10%)');
  // With a first-copy bonus: they add up, and can cancel out.
  const first = ownedAdjust(ownedCounts(raw({ cc_printing: 0, cc_card: 1, stale_ids: ['p'], stale_file: file(180) })),
    { stale: staleFrom({ pct: 5 }) });
  assert.equal(first.net, 0);
  assert.equal(ownedReason(first), 'First of this printing (+5%);\nStale: no sale in 180 days (−5%): they cancel out');
  // A count the inventory couldn't make changes nothing, stale or not.
  assert.equal(ownedAdjust(ownedCounts(raw({ cc_printing: null, stale_ids: ['p'], cc_match: null }))).net, 0);
});

test('the stale setting: read over the defaults, a percent from 0 to 100', () => {
  assert.deepEqual(staleFrom(null), DEFAULT_STALE);
  assert.equal(staleFrom({ pct: 20 }).pct, 20);
  assert.equal(staleFrom({ pct: 0 }).pct, 0);
  assert.equal(staleFrom({ pct: 120 }).pct, 10);
  assert.equal(staleFrom({ pct: -5 }).pct, 10);
  assert.equal(staleFrom({ pct: '' }).pct, 10);
  assert.equal(staleFrom({ pct: 'x' }).pct, 10);
});

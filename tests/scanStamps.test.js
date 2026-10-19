import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAMP_SEEN, forgetStamped, pickStamp, stampKind, stampedByNumber, stampedOf } from '../src/scan/stamps.js';

// Stamped promos (owner, 2026-10-19: Aziza 174p and Nashi 223s; decision 328).

const promo = (n, name, types) => ({ id: `pdsk-${n}`, set: 'pdsk', collector_number: n, name, promo_types: types });
const PDSK = [
  promo('223p', 'Nashi, Searcher in the Dark', ['promopack', 'stamped']),
  promo('223s', 'Nashi, Searcher in the Dark', ['prerelease', 'datestamped']),
  promo('42p', 'Other Card', ['stamped', 'promopack']),
  promo('7', 'A Plain Promo', ['buyabox']),
];

test('a promo set\'s stamped printings by the plain number', () => {
  assert.equal(stampKind(PDSK[0]), 'promopack');
  assert.equal(stampKind(PDSK[1]), 'prerelease');
  assert.equal(stampKind(PDSK[3]), null);
  const by = stampedByNumber(PDSK);
  assert.deepEqual(Object.keys(by.get('223')).sort(), ['prerelease', 'promopack']);
  assert.equal(by.get('42').promopack.collector_number, '42p');
  assert.equal(by.has('7'), false);
});

test('a card\'s stamped printings: its set\'s promo set asked once, the same name only', async () => {
  forgetStamped();
  const asked = [];
  const search = async (q) => { asked.push(q); return PDSK; };
  const nashi = { set: 'dsk', collector_number: '0223', name: 'Nashi, Searcher in the Dark' };
  const found = await stampedOf(nashi, { search });
  assert.equal(found.prerelease.collector_number, '223s');
  assert.equal(found.promopack.collector_number, '223p');
  assert.equal(await stampedOf({ set: 'dsk', collector_number: '1', name: 'X' }, { search }), null);
  // Another name at 42 (the number alone isn't trusted).
  assert.equal(await stampedOf({ set: 'dsk', collector_number: '42', name: 'Not It' }, { search }), null);
  assert.deepEqual(asked, ['e:pdsk (is:promopack or is:prerelease)']);
  // A failed fetch is tried again.
  forgetStamped();
  await assert.rejects(stampedOf(nashi, { search: async () => { throw new Error('offline'); } }));
  assert.ok(await stampedOf(nashi, { search }));
});

test('the stamp seen: one spot unlike the plain card, a printing the card has', () => {
  const both = { promopack: {}, prerelease: {} };
  // Measured (outline right): Aziza 174p, Nashi 223s.
  assert.equal(pickStamp({ promopack: 0.68, prerelease: 0.22 }, both), 'promopack');
  assert.equal(pickStamp({ promopack: 0.45, prerelease: 0.77 }, both), 'prerelease');
  assert.equal(pickStamp({ promopack: 0.45, prerelease: 0.3 }, both), null);
  // Both unlike it (glare, a hand): neither.
  assert.equal(pickStamp({ promopack: 0.8, prerelease: 0.9 }, both), null);
  // A prerelease spot on a card with only a promo pack printing (Aziza): none.
  assert.equal(pickStamp({ promopack: 0.3, prerelease: 0.8 }, { promopack: {} }), null);
  assert.equal(pickStamp({ promopack: STAMP_SEEN, prerelease: 0 }, both), 'promopack');
});

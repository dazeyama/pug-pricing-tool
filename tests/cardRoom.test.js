import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARD, cardRoom } from '../src/lib/cardRoom.js';

test('1080p: the card fills its area, its column 84px wider, Finish & Details giving 40', () => {
  // The card's area at 1920 × 1080: 336 × 643, room for a card 585 tall.
  const room = cardRoom(336, 643, 0);
  assert.deepEqual(room, { grow: 84, side: 40 });
  assert.equal(Math.round((643 - CARD.around) * CARD.ratio), 336 + 84);
  // Measured again once the column has widened: it stays.
  assert.deepEqual(cardRoom(420, 643, 84), { grow: 84, side: 40 });
});

test('the laptops are left alone; a very tall window stops at 456px wide', () => {
  assert.deepEqual(cardRoom(300, 403, 0), { grow: 0, side: 0 });   // 1200 × 650 at 80%
  assert.deepEqual(cardRoom(336, 470, 0), { grow: 0, side: 0 });   // 1600 × 900
  assert.deepEqual(cardRoom(336, 900, 0), { grow: CARD.growMax, side: CARD.sideMax });
  // Shrunk back to a laptop's height: back to the usual column.
  assert.deepEqual(cardRoom(420, 403, 84), { grow: 0, side: 0 });
});

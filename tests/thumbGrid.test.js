import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestionColumns, thumbWidth } from '../src/lib/thumbGrid.js';

test("a laptop's narrow, tall column: two rows of 4, bigger; a wide one keeps 5", () => {
  // 1200 × 650 at 80% (the column measured in the app): 5 across are 79px, 4 across 102px.
  assert.equal(Math.round(thumbWidth(449, 424, 5)), 79);
  assert.equal(Math.round(thumbWidth(449, 424, 4)), 102);
  assert.equal(suggestionColumns(449, 424), 4);
  // A 1080p screen: 5 across already near full size, so 5 stay.
  assert.equal(suggestionColumns(752, 700), 5);
  // Short and wide: the height sets the size either way, so 5.
  assert.equal(suggestionColumns(700, 300), 5);
  assert.equal(thumbWidth(2000, 2000, 5), 146);   // never past Scryfall's small image
});

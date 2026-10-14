import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestionColumns, suggestionRoom, thumbWidth } from '../src/lib/thumbGrid.js';

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

test('1080p settles on 5 across whatever it starts from; the laptop on 4', () => {
  // 1920 × 1080: the area is 752 × 700 with nothing given to the list.
  assert.deepEqual(suggestionRoom(752, 700, 0, 220), { cols: 5, extra: 0 });
  // The stuck state the owner saw: 4 across, the list 125px wider. It goes back.
  let room = suggestionRoom(627, 700, 125, 220);
  assert.equal(room.cols, 5);
  assert.equal(room.extra, 0);
  room = suggestionRoom(752, 700, room.extra, 220);
  assert.deepEqual(room, { cols: 5, extra: 0 });
  // 1200 × 650 at 80%: 4 across, nothing to give away.
  assert.deepEqual(suggestionRoom(449, 424, 0, 220), { cols: 4, extra: 0 });
  // A short, wide area: thumbnails as tall as the rows allow, the rest to the list.
  const wide = suggestionRoom(900, 300, 0, 220);
  assert.equal(wide.cols, 5);
  assert.ok(wide.extra > 0);
});

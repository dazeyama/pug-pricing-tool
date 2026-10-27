import { test } from 'node:test';
import assert from 'node:assert/strict';
import { printingsOf } from '../src/scan/older.js';

// A name's printings, fetched once and shared (decisions 557, 564).

/** A pretend Scryfall that answers when told to, counting the searches asked. */
function slowSearch(cards) {
  let release;
  const gate = new Promise((r) => {
    release = r;
  });
  const asked = [];
  const search = async (q, opts) => {
    asked.push({ q, signal: opts?.signal ?? null });
    await gate;
    return cards;
  };
  return { search, asked, release };
}

const card = (id, lang = 'en') => ({ id, lang });

test('a caller giving up doesn\'t end the fetch another is waiting on (decision 564)', async () => {
  const { search, asked, release } = slowSearch([card('new'), card('ja', 'ja'), card('old')]);
  const look = new AbortController();
  const lookWait = printingsOf('Shared Name A', look.signal, { search });
  const choiceWait = printingsOf('Shared Name A', null, { search });   // the 3 s choice, no signal
  look.abort();   // the look ends at the card's 3 s
  await assert.rejects(lookWait, { name: 'AbortError' });
  release();
  assert.deepEqual((await choiceWait).map((c) => c.id), ['old', 'new'], 'English only, oldest first');
  assert.equal(asked.length, 1, 'one search for the name');
  assert.equal(asked[0].signal, null, 'the shared fetch carries no caller\'s signal');
});

test('kept for the page: the next caller gets them without a search; a failed fetch is tried again', async () => {
  const { search, asked, release } = slowSearch([card('one')]);
  release();
  await printingsOf('Shared Name B', null, { search });
  await printingsOf('Shared Name B', new AbortController().signal, { search });
  assert.equal(asked.length, 1);
  let tries = 0;
  const failing = async () => {
    tries += 1;
    if (tries === 1) throw new Error('offline');
    return [card('back')];
  };
  await assert.rejects(printingsOf('Shared Name C', null, { search: failing }));
  assert.deepEqual((await printingsOf('Shared Name C', null, { search: failing })).map((c) => c.id), ['back']);
});

test('a signal already given up: refused at once', async () => {
  const gone = new AbortController();
  gone.abort();
  await assert.rejects(printingsOf('Shared Name D', gone.signal, { search: async () => [] }), { name: 'AbortError' });
});

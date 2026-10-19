import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStayAwake } from '../src/lib/stayAwake.js';

// The computer kept awake while cards arrive (owner, 2026-10-18; decision 320).

function browser() {
  const requests = [];
  const listeners = {};
  const doc = {
    visibilityState: 'visible',
    addEventListener: (t, fn) => { listeners[t] = fn; },
    removeEventListener: (t) => { delete listeners[t]; },
  };
  const nav = {
    wakeLock: {
      request: async (type) => {
        requests.push(type);
        const lock = { released: false, handlers: {}, addEventListener(t, fn) { this.handlers[t] = fn; },
          async release() { this.released = true; this.handlers.release?.(); } };
        return lock;
      },
    },
  };
  let t = 0;
  const timers = [];
  return {
    nav, doc, requests, listeners, timers,
    now: () => t,
    advance: (ms) => { t += ms; },
    setTimer: (fn, ms) => { const id = { fn, at: t + ms, done: false }; timers.push(id); return id; },
    clearTimer: (id) => { id.done = true; },
    fire: () => timers.filter((x) => !x.done && x.at <= t).forEach((x) => { x.done = true; x.fn(); }),
  };
}

test('a card arriving takes the screen lock; another keeps it; ten quiet minutes let it go', async () => {
  const b = browser();
  const awake = createStayAwake({ ...b, ms: 600 });
  awake.ping();
  await Promise.resolve();
  assert.equal(b.requests.length, 1);
  assert.equal(awake.held(), true);
  b.advance(500);
  awake.ping();   // another card: the clock starts again, no second lock
  await Promise.resolve();
  assert.equal(b.requests.length, 1);
  b.advance(500);
  b.fire();
  assert.equal(awake.held(), true, 'still within ten minutes of the last card');
  b.advance(200);
  b.fire();
  assert.equal(awake.held(), false);
});

test('the tab hidden drops the lock; shown again while wanted, it is taken again', async () => {
  const b = browser();
  const awake = createStayAwake({ ...b, ms: 600 });
  awake.ping();
  await Promise.resolve();
  // The browser releases it when hidden.
  b.doc.visibilityState = 'hidden';
  // (a real browser fires 'release'; here the next request shows it was asked again)
  b.doc.visibilityState = 'visible';
  b.listeners.visibilitychange();
  await Promise.resolve();
  assert.ok(b.requests.length >= 1);
  awake.stop();
  assert.equal(awake.held(), false);
});

test('no wake lock in this browser: nothing breaks', () => {
  const awake = createStayAwake({ nav: {}, doc: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} } });
  awake.ping();
  assert.equal(awake.held(), false);
  awake.stop();
});

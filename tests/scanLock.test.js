import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { findCard } from '../src/scan/cardEdges.js';
import {
  ART_CHANGED, anchorBlock, artDistance, artPrint, blockOnCard, lockOnCard, makeLock, rescaleLock,
} from '../src/scan/lock.js';

// Owner, 2026-10-16: the view locks onto the first card found by its edges,
// with its collector line where a card's is; the art at its fixed place tells
// a new card from the same one.

const make = (w, h) => createCanvas(w, h);

/** A picture of a card lying on a light holder: a black border, art, a light text box. */
function holder({ x = 300, y = 520, height = 760, art = '#a33', withShadowEdge = true } = {}) {
  const c = createCanvas(1080, 1920);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#d8d4cc';
  ctx.fillRect(0, 0, 1080, 1920);
  ctx.fillStyle = '#b4b0a8';                      // the holder's shaded walls stay light enough
  ctx.fillRect(0, 0, 120, 1920);
  if (withShadowEdge) {
    ctx.fillStyle = '#111';                        // something dark beyond the holder, at the picture's edge
    ctx.fillRect(980, 0, 100, 400);
  }
  const width = height * (63 / 88);
  ctx.fillStyle = '#141414';
  ctx.fillRect(x, y, width, height);               // the border
  ctx.fillStyle = art;
  ctx.fillRect(x + width * 0.06, y + height * 0.11, width * 0.88, height * 0.45);
  ctx.fillStyle = '#e8e2d0';
  ctx.fillRect(x + width * 0.06, y + height * 0.6, width * 0.88, height * 0.3);
  return { c, card: { x, y, width, height } };
}

test('the card is found by its dark border on the light holder', () => {
  const { c, card } = holder();
  const found = findCard(c, make);
  assert.ok(found, 'found');
  for (const k of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(found[k] - card[k]) < 12, `${k} ${found[k]} vs ${card[k]}`);
});

test('nothing card-shaped, nothing found; dark at the picture\'s edge is never the card', () => {
  const empty = createCanvas(1080, 1920);
  const ctx = empty.getContext('2d');
  ctx.fillStyle = '#d8d4cc';
  ctx.fillRect(0, 0, 1080, 1920);
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, 600, 860);                    // card-shaped, but running off the edge
  assert.equal(findCard(empty, make), null);
});

const block = (x, y, w, h, charHeight = 10) => ({ bounds: { x, y, width: w, height: h }, charHeight });

test('a collector line counts only where a card\'s is: bottom left, on the card', () => {
  const card = { x: 300, y: 520, width: 544, height: 760 };
  assert.equal(blockOnCard(block(336, 1232, 180, 24), card), true);
  assert.equal(blockOnCard(block(640, 1232, 180, 24), card), false);   // the copyright line's place
  assert.equal(blockOnCard(block(336, 700, 180, 24), card), false);    // up in the art
  assert.equal(anchorBlock([block(640, 1232, 180, 24), block(336, 1230, 180, 26)]).bounds.x, 336);
});

test('the art at its locked place tells another card from the same one', () => {
  const a = holder({ art: '#a33' });
  const lock = makeLock(a.card, block(a.card.x + 35, a.card.y + 712, 180, 24), a.c);
  const same = holder({ art: '#a33' });
  const other = holder({ art: '#2a5' });
  const sameCtx = same.c.getContext('2d');
  sameCtx.fillStyle = '#aa3a3a';                   // a little light glinting on the same card
  sameCtx.fillRect(a.card.x + 80, a.card.y + 120, 40, 30);
  const otherCtx = other.c.getContext('2d');
  otherCtx.fillStyle = '#ddd';                     // the other card's art has a different shape too
  otherCtx.fillRect(a.card.x + 150, a.card.y + 150, 200, 120);
  const held = artPrint(a.c, lock);
  assert.ok(artDistance(held, artPrint(same.c, lock)) < ART_CHANGED, 'the same card');
  assert.ok(artDistance(held, artPrint(other.c, lock)) >= ART_CHANGED, 'another card');
});

test('the lock: the corner and the art lie on the card, the view a little around it', () => {
  const { c, card } = holder();
  const lock = makeLock(card, block(card.x + 35, card.y + 712, 180, 24), c);
  assert.ok(lock.collector.x < card.x + 35 && lock.collector.y < card.y + 712);
  assert.ok(lock.art.x > card.x && lock.art.y > card.y && lock.art.y + lock.art.height < card.y + card.height);
  assert.ok(lock.view.x < card.x && lock.view.width > card.width);
});

test('the camera picture changes size: the lock kept, the same part of the picture', () => {
  const lock = {
    card: { x: 300, y: 600, width: 540, height: 760 },
    collector: { x: 320, y: 1300, width: 160, height: 40 },
    art: { x: 340, y: 700, width: 460, height: 300 },
    view: { x: 280, y: 580, width: 580, height: 800 },
    charHeight: 9,
    frame: { width: 1080, height: 1920 },
  };
  const half = rescaleLock(lock, { width: 540, height: 960 });
  assert.deepEqual(half.view, { x: 140, y: 290, width: 290, height: 400 });
  assert.deepEqual(half.card, { x: 150, y: 300, width: 270, height: 380 });
  assert.equal(half.charHeight, 4.5);
  assert.deepEqual(half.frame, { width: 540, height: 960 });
  assert.equal(rescaleLock(lock, { width: 1080, height: 1920 }), lock, 'the same size: the same lock');
});

test('a lock on a card by its edges alone: the collector corner where a modern card has it', () => {
  const card = { x: 300, y: 600, width: 540, height: 760 };
  const lock = lockOnCard(card, { width: 1080, height: 1920 });
  assert.deepEqual(lock.card, card);
  assert.ok(lock.collector.x > card.x && lock.collector.x < card.x + card.width * 0.1, 'near the left edge');
  assert.ok(lock.collector.y > card.y + card.height * 0.9 && lock.collector.y < card.y + card.height, 'at the bottom');
  assert.ok(Math.abs(lock.charHeight - card.height * 0.0115) < 1e-9);
});

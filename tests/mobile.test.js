import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPhoneLike, inScanMode } from '../src/lib/mobile.js';

// docs/SCAN_FUNCTION.md 5.1: a touch-first screen under 900 px on its shorter side.

test('a phone, either way up, is a phone', () => {
  assert.equal(isPhoneLike({ coarse: true, width: 390, height: 844 }), true);
  assert.equal(isPhoneLike({ coarse: true, width: 844, height: 390 }), true);
  assert.equal(isPhoneLike({ coarse: true, width: 820, height: 1180 }), true);   // a small tablet, too
});

test('store computers and big tablets keep the desktop app', () => {
  assert.equal(isPhoneLike({ coarse: false, width: 1920, height: 1080 }), false);
  assert.equal(isPhoneLike({ coarse: false, width: 1200, height: 650 }), false);
  assert.equal(isPhoneLike({ coarse: false, width: 390, height: 844 }), false);  // a narrow window with a mouse
  assert.equal(isPhoneLike({ coarse: true, width: 1366, height: 1024 }), false);
});

test('#/scan is the scanner on any device', () => {
  assert.equal(inScanMode('#/scan'), true);
  assert.equal(inScanMode('#/scan?x=1'), true);
  assert.equal(inScanMode('#/scanner'), false);
  assert.equal(inScanMode('#/price'), false);
  assert.equal(inScanMode(''), false);
});

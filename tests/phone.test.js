import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPhone, phoneDigits, validPhone } from '../src/lib/phone.js';

// Spec 9.3.
test('10 digits format as (555) 123-4567', () => {
  assert.equal(formatPhone('5551234567'), '(555) 123-4567');
  assert.equal(phoneDigits('(555) 123-4567'), '5551234567');
});

test('a leading 1 is dropped', () => {
  assert.equal(phoneDigits('15551234567'), '5551234567');
  assert.equal(formatPhone('1 (555) 123-4567'), '(555) 123-4567');
  assert.ok(validPhone('+1 555 123 4567'));
});

test('partial input formats as far as it goes', () => {
  assert.equal(formatPhone(''), '');
  assert.equal(formatPhone('55'), '(55');
  assert.equal(formatPhone('555'), '(555');
  assert.equal(formatPhone('55512'), '(555) 12');
  assert.equal(formatPhone('5551234'), '(555) 123-4');
});

test('only 10 digits are valid', () => {
  assert.ok(!validPhone('555123456'));
  assert.ok(validPhone('555.123.4567'));
  assert.equal(phoneDigits('555123456789'), '5551234567');
});

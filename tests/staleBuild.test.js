import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STALE_BUILD, isStaleBuild, explainStaleBuild } from '../src/lib/staleBuild.js';

const URL = 'https://dazeyama.github.io/pug-pricing-tool/assets/auditPdf-DLNn6FRa.js';

test('each browser\'s words for a part no longer on the site', () => {
  assert.ok(isStaleBuild(new TypeError(`Failed to fetch dynamically imported module: ${URL}`)));
  assert.ok(isStaleBuild(new TypeError(`error loading dynamically imported module: ${URL}`)));
  assert.ok(isStaleBuild(new TypeError('Importing a module script failed.')));
  assert.ok(isStaleBuild(new Error(`Unable to preload CSS for ${URL.replace('.js', '.css')}`)));
});

test('other errors are left alone', () => {
  assert.equal(isStaleBuild(new Error('No connection')), false);
  assert.equal(isStaleBuild(new TypeError('Failed to fetch')), false);
  assert.equal(isStaleBuild(null), false);
  assert.equal(isStaleBuild('Failed to fetch dynamically imported module'), false);
  const other = new Error('Pick a user first');
  assert.equal(explainStaleBuild(other), false);
  assert.equal(other.message, 'Pick a user first');
});

test('the plain words replace the browser\'s, so the print toast says what to do', () => {
  const error = new TypeError(`Failed to fetch dynamically imported module: ${URL}`);
  assert.equal(explainStaleBuild(error), true);
  assert.equal(error.message, STALE_BUILD);
  assert.equal(`Couldn't print: ${error.message}`,
    "Couldn't print: The app was updated since this page was opened: reload the page (F5) and try again.");
});

test('an error whose message can\'t be written is left as it is', () => {
  const frozen = Object.freeze(new TypeError(`Failed to fetch dynamically imported module: ${URL}`));
  assert.equal(explainStaleBuild(frozen), false);
});

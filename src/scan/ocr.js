// One Tesseract worker for the page's life (docs/SCAN_FUNCTION.md 6.1;
// mtgscan's getOcrWorker): creating one loads the English model, about 3 MB
// the first time (then the browser keeps it). Its files are the site's own
// (public/tesseract/, copied by vite.config.js), so nothing comes from a CDN.
// Tesseract's default settings read the collector line best (mtgscan's
// benchmark); a card's title is one line (S4), read with PSM 7.

import { isTimeout, withTimeout } from '../lib/timeout.js';

let workerPromise = null;
let queue = Promise.resolve();
let psm = null;
// Bumped by resetOcr: a read begun on the worker before it doesn't touch the new one.
let generation = 0;
const listeners = new Set();

// A read on a phone takes 0.3 to 1 s (docs/SCAN_FUNCTION.md 11; 0.12 s on the laptop); one
// taking 5 s is stuck (owner, 2026-10-18: "stuck on 'Reading...' … forever until a hard
// refresh"), and the worker is started afresh.
const READ_MS = 5_000;
// Starting the worker downloads its three files the first time (4.4 MB: 1.35 s from GitHub Pages
// on 2026-10-18) and compiles them on the phone; given up after 20 s and started again on the next read.
const LOAD_MS = 20_000;

/** PSM 6, Tesseract.js's default: a block of text. */
export const PSM_BLOCK = '6';
/** PSM 7: one line of text (a card's title). */
export const PSM_LINE = '7';

const asset = (path) => new URL(`${import.meta.env.BASE_URL}tesseract/${path}`, window.location.href).href;

/** Follow the worker's progress ("loading language traineddata", 0.4…), e.g. to say the first scan is loading. */
export function onOcrStatus(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The worker, created on first use; a failed (or too slow) start is tried again next time. */
export function ocrWorker() {
  if (!workerPromise) {
    const making = import('tesseract.js')
      .then((mod) => (mod.default ?? mod).createWorker('eng', 1, {
        workerPath: asset('worker.min.js'),
        corePath: asset('core'),
        langPath: asset('lang'),
        logger: (m) => listeners.forEach((l) => l(m)),
      }));
    const mine = withTimeout(making, LOAD_MS).catch((e) => {
      if (workerPromise === mine) workerPromise = null;
      making.then((w) => w.terminate()).catch(() => {});   // one that starts after all isn't used
      throw e;
    });
    workerPromise = mine;
  }
  return workerPromise;
}

/**
 * Start the reader afresh (a read stuck, or the scanner's Stop): the worker
 * ended, the reads queued behind it let go; the next read makes a new one
 * (its files come from the browser's cache).
 */
export function resetOcr() {
  const old = workerPromise;
  workerPromise = null;
  queue = Promise.resolve();
  psm = null;
  generation += 1;
  old?.then((w) => w.terminate()).catch(() => {});
}

/**
 * Read the text in a canvas. One read at a time (the page-segmentation mode
 * is the worker's own setting).
 * @param {HTMLCanvasElement} canvas
 * @param {string} [mode]  PSM_BLOCK (the collector line) or PSM_LINE (a title)
 * @returns {Promise<string>}
 */
export function readText(canvas, mode = PSM_BLOCK) {
  const run = async () => {
    const gen = generation;
    const worker = await ocrWorker();
    try {
      if (psm !== mode || gen !== generation) {
        await withTimeout(worker.setParameters({ tessedit_pageseg_mode: mode }), READ_MS);
        if (gen === generation) psm = mode;
      }
      const { data } = await withTimeout(worker.recognize(canvas), READ_MS);
      return data?.text ?? '';
    } catch (e) {
      if (isTimeout(e) && gen === generation) resetOcr();   // stuck: the next read gets a new worker
      throw e;
    }
  };
  const next = queue.then(run, run);
  queue = next.catch(() => {});
  return next;
}

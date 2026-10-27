// The card readers (docs/SCAN_FUNCTION.md 6.1; mtgscan's getOcrWorker): Tesseract
// workers, each loading the English model, about 3 MB the first time (then the
// browser keeps it). Their files are the site's own (public/tesseract/, copied by
// vite.config.js), so nothing comes from a CDN. Tesseract's default settings read
// the collector line best (mtgscan's benchmark); a card's title is one line (S4),
// read with PSM 7.
//
// Two of them (owner, 2026-10-26: "Can we always ALSO be scanning the name area so
// we don't have to do it as a second pass check?"; decision 551): one reads the
// collector strip (readText), the other the card's title (readTitleText), each in
// its own worker, so both are read at once on a phone's several cores, and the
// title costs a modern card's read no time. Each reads one picture at a time.

import { isTimeout, withTimeout } from '../lib/timeout.js';

const listeners = new Set();

// A read on a phone takes 0.3 to 1 s (docs/SCAN_FUNCTION.md 11; 0.12 s on the laptop); one
// taking longer is stuck (owner, 2026-10-18: "stuck on 'Reading...' … forever until a hard
// refresh"), and the worker is started afresh. 1.5 s, inside a card's 3 s (decision 549; was 5 s):
// a tighter limit would start the reader afresh on a slow phone's good reads, which costs more.
const READ_MS = 1_500;
// A fresh worker after this many reads (owner, 2026-10-18: "fix", to "The card reader is never
// restarted"; decision 305): Tesseract's worker grows over a long session, so it's swapped between
// reads, the new one loading at once so the next read hardly waits.
const RECYCLE_AFTER = 300;
// Starting the worker downloads its three files the first time (4.4 MB: 1.35 s from GitHub Pages
// on 2026-10-18) and compiles them on the phone; given up after 20 s and started again on the next read.
const LOAD_MS = 20_000;

/** PSM 6, Tesseract.js's default: a block of text. */
export const PSM_BLOCK = '6';
/** PSM 7: one line of text (a card's title). */
export const PSM_LINE = '7';

const asset = (path) => new URL(`${import.meta.env.BASE_URL}tesseract/${path}`, window.location.href).href;

/** Follow the workers' progress ("loading language traineddata", 0.4…), e.g. to say the first scan is loading. */
export function onOcrStatus(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** One card reader: its worker, made on first use, and its reads, one at a time. */
function makeReader() {
  let workerPromise = null;
  let queue = Promise.resolve();
  let psm = null;
  // Bumped by reset: a read begun on the worker before it doesn't touch the new one.
  let generation = 0;
  let reads = 0;

  /** The worker, created on first use; a failed (or too slow) start is tried again next time. */
  function worker() {
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
   * Start afresh (a read stuck, or the scanner's Stop): the worker ended, the reads queued behind
   * it let go; the next read makes a new one (its files come from the browser's cache).
   */
  function reset() {
    const old = workerPromise;
    workerPromise = null;
    queue = Promise.resolve();
    psm = null;
    reads = 0;
    generation += 1;
    old?.then((w) => w.terminate()).catch(() => {});
  }

  /**
   * Swap the worker for a fresh one after RECYCLE_AFTER reads (decision 305). Called inside a read,
   * once it's done: the reads are one at a time, so no other is using the old worker. The new one
   * starts loading now.
   */
  function recycle() {
    const old = workerPromise;
    workerPromise = null;
    psm = null;
    reads = 0;
    old?.then((w) => w.terminate()).catch(() => {});
    worker().catch(() => {});   // a failed start is tried again on the next read
  }

  function read(canvas, mode = PSM_BLOCK) {
    const run = async () => {
      const gen = generation;
      const w = await worker();
      try {
        if (psm !== mode || gen !== generation) {
          await withTimeout(w.setParameters({ tessedit_pageseg_mode: mode }), READ_MS);
          if (gen === generation) psm = mode;
        }
        const { data } = await withTimeout(w.recognize(canvas), READ_MS);
        if (gen === generation && ++reads >= RECYCLE_AFTER) recycle();
        return data?.text ?? '';
      } catch (e) {
        if (isTimeout(e) && gen === generation) reset();   // stuck: the next read gets a new worker
        throw e;
      }
    };
    const next = queue.then(run, run);
    queue = next.catch(() => {});
    return next;
  }

  return { worker, reset, read };
}

const strip = makeReader();
const title = makeReader();

/**
 * The strip reader's worker, both readers started (decision 551): the scanner readies them while the
 * card is lined up. A title reader that fails to start is tried again on its first read.
 */
export function ocrWorker() {
  title.worker().catch((e) => console.warn('The title reader failed to load', e));
  return strip.worker();
}

/** Both readers started afresh (a read stuck, or the scanner's Stop). */
export function resetOcr() {
  strip.reset();
  title.reset();
}

/**
 * Read the text in a canvas, on the strip's reader. One read at a time (the page-segmentation mode
 * is the worker's own setting).
 * @param {HTMLCanvasElement} canvas
 * @param {string} [mode]  PSM_BLOCK (the collector line) or PSM_LINE (a title)
 * @returns {Promise<string>}
 */
export function readText(canvas, mode = PSM_BLOCK) {
  return strip.read(canvas, mode);
}

/** The same, on the title's reader (decision 551): read beside the strip, not after it. */
export function readTitleText(canvas, mode = PSM_LINE) {
  return title.read(canvas, mode);
}

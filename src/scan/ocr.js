// One Tesseract worker for the page's life (docs/SCAN_FUNCTION.md 6.1;
// mtgscan's getOcrWorker): creating one loads the English model, about 3 MB
// the first time (then the browser keeps it). Its files are the site's own
// (public/tesseract/, copied by vite.config.js), so nothing comes from a CDN.
// Tesseract's default settings read the collector line best (mtgscan's
// benchmark); a card's title is one line (S4), read with PSM 7.

let workerPromise = null;
let queue = Promise.resolve();
let psm = null;
const listeners = new Set();

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

/** The worker, created on first use; a failed start is tried again next time. */
export function ocrWorker() {
  workerPromise ??= import('tesseract.js')
    .then((mod) => (mod.default ?? mod).createWorker('eng', 1, {
      workerPath: asset('worker.min.js'),
      corePath: asset('core'),
      langPath: asset('lang'),
      logger: (m) => listeners.forEach((l) => l(m)),
    }))
    .catch((e) => {
      workerPromise = null;
      throw e;
    });
  return workerPromise;
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
    const worker = await ocrWorker();
    if (psm !== mode) {
      await worker.setParameters({ tessedit_pageseg_mode: mode });
      psm = mode;
    }
    const { data } = await worker.recognize(canvas);
    return data?.text ?? '';
  };
  const next = queue.then(run, run);
  queue = next.catch(() => {});
  return next;
}

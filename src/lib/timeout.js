// Time limits (owner, 2026-10-18: the scanner "kept getting stuck on
// 'Reading...'" on a slow network): a promise that hasn't settled in time
// rejects with a TimeoutError. What it was waiting on isn't stopped (a
// fetch, a Tesseract read); the caller decides what a late answer may still
// do, usually nothing.

export class TimeoutError extends Error {
  constructor(ms) {
    super(`No answer in ${Math.round(ms / 1000)} s`);
    this.name = 'TimeoutError';
  }
}

/**
 * `promise`, or a TimeoutError after `ms`.
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @returns {Promise<T>}
 */
export function withTimeout(promise, ms) {
  let timer;
  const late = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

/** True for a time limit reached (ours, or the browser's AbortSignal.timeout). */
export const isTimeout = (error) => error?.name === 'TimeoutError';

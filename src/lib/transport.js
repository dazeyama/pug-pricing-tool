// The request transport, ported from Audit Tool (app.js enqueue/scryfallFetch):
// one queue per API, at least `spacingMs` between request starts, and
// retries on 429/503/network errors with backoff that honours Retry-After.
// One request at a time unless the queue is given `concurrency` lanes
// (TCGdex: four, owner, 2026-10-16, "why is this screen so slow": 91 card
// records one by one took the better part of a minute); the spacing then
// holds between starts, however many are in flight.
//
// Additions for live search: requests carry an AbortSignal, so a query that's
// been superseded drops its queued requests; and a low-priority lane for
// background fills, which always waits behind anything the user is waiting on.

import { withTimeout } from './timeout.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function abortError() {
  return new DOMException('Superseded', 'AbortError');
}

/** The API didn't answer after every retry; `limited` when it said 429 (too many requests). */
export class UnavailableError extends Error {
  constructor(url, limited = false) {
    super(limited ? `${new URL(url).host} is asking for fewer requests` : `No response from ${new URL(url).host}`);
    this.name = 'UnavailableError';
    this.limited = limited;
  }
}

// After a 429 the queue spaces its requests five times wider (at least
// 500 ms) for a minute (owner, 2026-10-09). A load test at the normal pace
// (TCGdex's whole set fill and fast typing, 436 requests) never saw one.
const SLOW_FOR_MS = 60_000;

// A request with no answer in this long is given up and tried again, like a
// network error (owner, 2026-10-18: the scanner stuck on "Reading…" on a slow
// network: one stalled request held its queue, and every request after it,
// for good). Its body gets longer: the big lists (every set, every card name)
// take a while on a slow connection.
const ANSWER_MS = 15_000;
const BODY_MS = 60_000;

/**
 * @param {{ spacingMs?: number, tries?: number, concurrency?: number, timeoutMs?: number, bodyMs?: number }} [options]
 *   timeoutMs: an attempt with no answer by then is tried again; bodyMs: getJson's wait for the body
 */
export function createTransport({
  spacingMs = 100, tries = 5, concurrency = 1, timeoutMs = ANSWER_MS, bodyMs = BODY_MS,
} = {}) {
  const high = [];
  const low = [];
  let active = 0;
  let nextStartAt = 0;   // the earliest the next request may start: reserved, so lanes don't start together
  let slowUntil = 0;

  async function fetchWithRetry(url, signal) {
    let limited = false;
    for (let attempt = 0; attempt < tries; attempt++) {
      const gap = Date.now() < slowUntil ? Math.max(spacingMs * 5, 500) : spacingMs;
      const at = Math.max(Date.now(), nextStartAt);
      nextStartAt = at + gap;
      if (at > Date.now()) await sleep(at - Date.now());
      if (signal?.aborted) throw abortError();

      // The caller's signal, and this attempt's time limit, in one.
      const attemptSignal = new AbortController();
      const giveUp = () => attemptSignal.abort();
      signal?.addEventListener('abort', giveUp, { once: true });
      const clock = setTimeout(giveUp, timeoutMs);
      let res;
      try {
        res = await fetch(url, { headers: { Accept: 'application/json' }, signal: attemptSignal.signal });
      } catch {
        if (signal?.aborted) throw abortError();
        await sleep(400 * (attempt + 1));            // network hiccup, or no answer in time: back off, retry
        continue;
      } finally {
        clearTimeout(clock);
        signal?.removeEventListener('abort', giveUp);
      }
      if (res.status === 429 || res.status === 503) {
        if (res.status === 429) {
          limited = true;
          slowUntil = Date.now() + SLOW_FOR_MS;
        }
        const retryAfter = parseFloat(res.headers.get('Retry-After'));
        await sleep((Number.isNaN(retryAfter) ? 0.5 * (attempt + 1) : retryAfter) * 1000 + 250);
        continue;
      }
      return res;                                     // 200, 404, …: the caller decides
    }
    throw new UnavailableError(url, limited);
  }

  /** Start queued requests while a lane is free; each one that ends frees its lane and pumps again. */
  function pump() {
    while (active < concurrency && (high.length || low.length)) {
      const job = high.length ? high.shift() : low.shift();
      if (job.signal?.aborted) {
        job.reject(abortError());
        continue;
      }
      active += 1;
      fetchWithRetry(job.url, job.signal)
        .then(job.resolve, job.reject)
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  }

  /**
   * Queue a GET. Resolves with the Response (any status but 429/503), rejects
   * with AbortError if superseded or UnavailableError after every retry.
   * @param {string} url
   * @param {{ signal?: AbortSignal, priority?: 'high'|'low' }} [options]
   * @returns {Promise<Response>}
   */
  function request(url, { signal, priority = 'high' } = {}) {
    if (signal?.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      (priority === 'low' ? low : high).push({ url, signal, resolve, reject });
      pump();
    });
  }

  /**
   * Queue a GET and parse JSON. `null` for 404 (Scryfall's "no cards") and
   * 400 (a query the API can't read, which also means nothing matches).
   * @returns {Promise<any|null>}
   */
  async function getJson(url, options) {
    const res = await request(url, options);
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
    return withTimeout(res.json(), bodyMs);
  }

  /**
   * A queued low-priority GET of this URL moves to the user's lane: a search
   * is now waiting on what a background fill only queued (owner's "No. 32"
   * search sat behind the whole Japanese set fill, 2026-10-01).
   * @param {string} url
   */
  function promote(url) {
    const i = low.findIndex((job) => job.url === url);
    if (i !== -1) high.push(...low.splice(i, 1));
  }

  return { request, getJson, promote };
}

/** True for an error that only means "this search was replaced by a newer one". */
export function isAbort(error) {
  return error?.name === 'AbortError';
}

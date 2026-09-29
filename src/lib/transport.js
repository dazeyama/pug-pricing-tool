// The request transport, ported from Audit Tool (app.js enqueue/scryfallFetch):
// one serialized queue per API, at least `spacingMs` between requests, and
// retries on 429/503/network errors with backoff that honours Retry-After.
// Nothing is fired in parallel on one queue.
//
// Additions for live search: requests carry an AbortSignal, so a query that's
// been superseded drops its queued requests; and a low-priority lane for
// background fills, which always waits behind anything the user is waiting on.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function abortError() {
  return new DOMException('Superseded', 'AbortError');
}

/** The API didn't answer after every retry. */
export class UnavailableError extends Error {
  constructor(url) {
    super(`No response from ${new URL(url).host}`);
    this.name = 'UnavailableError';
  }
}

/**
 * @param {{ spacingMs?: number, tries?: number }} [options]
 */
export function createTransport({ spacingMs = 100, tries = 5 } = {}) {
  const high = [];
  const low = [];
  let running = false;
  let lastRequestAt = 0;

  async function fetchWithRetry(url, signal) {
    for (let attempt = 0; attempt < tries; attempt++) {
      const since = Date.now() - lastRequestAt;
      if (since < spacingMs) await sleep(spacingMs - since);
      if (signal?.aborted) throw abortError();
      lastRequestAt = Date.now();

      let res;
      try {
        res = await fetch(url, { headers: { Accept: 'application/json' }, signal });
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        await sleep(400 * (attempt + 1));            // network hiccup: back off, retry
        continue;
      }
      if (res.status === 429 || res.status === 503) {
        const retryAfter = parseFloat(res.headers.get('Retry-After'));
        await sleep((Number.isNaN(retryAfter) ? 0.5 * (attempt + 1) : retryAfter) * 1000 + 250);
        continue;
      }
      return res;                                     // 200, 404, …: the caller decides
    }
    throw new UnavailableError(url);
  }

  async function pump() {
    if (running) return;
    running = true;
    while (high.length || low.length) {
      const job = high.length ? high.shift() : low.shift();
      if (job.signal?.aborted) {
        job.reject(abortError());
        continue;
      }
      try {
        job.resolve(await fetchWithRetry(job.url, job.signal));
      } catch (e) {
        job.reject(e);
      }
    }
    running = false;
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
    return res.json();
  }

  return { request, getJson };
}

/** True for an error that only means "this search was replaced by a newer one". */
export function isAbort(error) {
  return error?.name === 'AbortError';
}

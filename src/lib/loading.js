// The sweep bar across the top of the page (CM #loading-bar). Every request
// wraps itself in withLoading(); the bar shows while any is in flight.
let pending = 0;

function markPending(delta) {
  pending = Math.max(0, pending + delta);
  document.body.classList.toggle('loading', pending > 0);
}

/**
 * Run `work` with the loading bar showing.
 * @template T
 * @param {() => Promise<T>} work
 * @returns {Promise<T>}
 */
export async function withLoading(work) {
  markPending(1);
  try {
    return await work();
  } finally {
    markPending(-1);
  }
}

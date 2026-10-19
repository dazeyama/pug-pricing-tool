// The scanner's run log, development only (owner, 2026-10-18: a timed run of
// 417 cards, "time stats, as well as accuracy, and number of times each
// fallback layer was used"). Each event the phone decides on (a card sent
// and the path that found it, a fallback opened, a failure, a stop) is
// posted to the dev server, which appends it to a file on the computer
// (vite.config.js `scanLog`). A build for the live site leaves it out:
// `import.meta.env.DEV` is false there, so nothing is sent.

const DEV = Boolean(import.meta.env?.DEV);
let seq = 0;

/** One event, with the phone's clock; best effort, never in the way. */
export function trace(type, data = {}) {
  if (!DEV) return;
  try {
    fetch('/__scan-log', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ seq: ++seq, phoneAt: Date.now(), type, ...data }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // the log is a convenience
  }
}

// The computer kept awake while cards arrive from the phone (owner,
// 2026-10-18: "A card arriving on the PC screen should ping the computer to
// stay awake like a keystroke would, right now it sleeps on me when I'm
// scanning"; decision 320). A page can't press a key, but it can hold a screen
// wake lock (navigator.wakeLock: Chrome, Edge, Safari 16.4+), which keeps the
// display on, and a Mac awake with it. Each card arriving keeps it for
// AWAKE_MS more, as a keystroke would; after that it's let go and the computer
// sleeps as it would have. The browser drops the lock when the tab is hidden,
// so it's taken again when the tab's shown while still wanted.

export const AWAKE_MS = 10 * 60_000;

/**
 * A keeper for one page: `ping()` on each card arriving; `stop()` to let go.
 * @param {{ nav?: Navigator, doc?: Document, now?: () => number, setTimer?: Function, clearTimer?: Function,
 *   ms?: number }} [env]  the browser's (tests pass their own)
 */
export function createStayAwake({
  nav = globalThis.navigator, doc = globalThis.document, now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (t) => clearTimeout(t), ms = AWAKE_MS,
} = {}) {
  let lock = null;
  let until = 0;
  let timer = null;
  let asking = false;

  const take = async () => {
    if (lock || asking || !nav?.wakeLock || doc?.visibilityState !== 'visible') return;
    asking = true;
    try {
      lock = await nav.wakeLock.request('screen');
      lock.addEventListener?.('release', () => {
        lock = null;
      });
    } catch {
      lock = null;   // refused (battery saver, a browser without it): the computer sleeps as before
    } finally {
      asking = false;
    }
  };
  const letGo = () => {
    until = 0;
    if (timer) clearTimer(timer);
    timer = null;
    const held = lock;
    lock = null;
    held?.release?.().catch?.(() => {});
  };
  const onVisible = () => {
    if (doc.visibilityState === 'visible' && now() < until) take();
  };
  doc?.addEventListener?.('visibilitychange', onVisible);

  return {
    /** A card arrived: awake for `ms` more. */
    ping() {
      until = now() + ms;
      if (timer) clearTimer(timer);
      timer = setTimer(letGo, ms);
      take();
    },
    /** Whether the lock is held now. */
    held: () => Boolean(lock),
    /** Let go, and stop watching the tab. */
    stop() {
      letGo();
      doc?.removeEventListener?.('visibilitychange', onVisible);
    },
  };
}

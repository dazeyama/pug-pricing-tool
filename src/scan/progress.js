// Scan card's loading bar (owner, 2026-10-16: "since it's a little slower,
// show an accurate smooth loading bar on the phone while it runs. Only do
// this for manual"). The work is a list of steps, each with the time it's
// expected to take (an OCR pass, a Scryfall lookup, a search); the bar
// stands at the share of that time done, creeping through the step under
// way (never past 90% of it till it's done), and never goes back when more
// work turns up (more text blocks to read, an older card's title).

/** Expected times, from the phone and Scryfall (docs/SCAN_FUNCTION.md 17). */
export const STEP_MS = { ocr: 600, lookup: 300, search: 600, older: 2500, send: 400 };

/**
 * @param {() => number} [now]  the clock (tests pass their own)
 */
export function createProgress(now = () => performance.now()) {
  const steps = new Map();   // name → { ms, done, startedAt }
  let shown = 0;

  return {
    /** Expect a step taking `ms` (a step already planned and not done is re-planned). */
    plan(name, ms) {
      const s = steps.get(name);
      if (s?.done) return;
      steps.set(name, { ms: Math.max(1, ms), done: false, startedAt: s?.startedAt ?? null });
    },
    /** A step not needed after all. */
    drop(name) {
      const s = steps.get(name);
      if (s && !s.done) steps.delete(name);
    },
    start(name) {
      if (!steps.has(name)) this.plan(name, STEP_MS.ocr);
      const s = steps.get(name);
      if (!s.done && s.startedAt == null) s.startedAt = now();
    },
    finish(name) {
      if (!steps.has(name)) this.plan(name, 1);
      steps.get(name).done = true;
    },
    /** All done: the bar full. */
    complete() {
      shown = 1;
    },
    /** Where the bar stands, 0 to 1. */
    value() {
      let total = 0;
      let done = 0;
      const t = now();
      for (const s of steps.values()) {
        total += s.ms;
        if (s.done) done += s.ms;
        else if (s.startedAt != null) done += s.ms * Math.min(0.9, (t - s.startedAt) / s.ms);
      }
      if (total > 0) shown = Math.max(shown, Math.min(1, done / total));
      return shown;
    },
  };
}

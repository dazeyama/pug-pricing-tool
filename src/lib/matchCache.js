// Remembered CC matches and set choices changed on this computer (decision 473): every write to them (an export's
// picks, Import Collection's, Settings → CC matching's Forget, a restore) calls matchesChanged(), and whatever was
// worked out from them before (the owned-copies counter's counts and match context, owned.js) is read again. A
// change on another computer shows within the counter's minute, as before.

let generation = 0;

/** Which round of matches this computer has: a count kept from an older round is stale. */
export const matchGeneration = () => generation;

/** A remembered match or set choice was saved, forgotten or restored here. */
export function matchesChanged() {
  generation += 1;
}

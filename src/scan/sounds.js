// The scanner's sounds (docs/SCAN_FUNCTION.md 5.3), made with the Web Audio
// API, no files: a soft two-note chime the moment a nonfoil card is sent, a
// brighter three-note one for a foil (or etched) card (owner, 2026-10-16:
// "the alternate sound to be used for Foil and the normal sound for normal
// nonfoil"), a lower tone when a card needs a price, a short low buzz when a
// card couldn't be read or added. A phone only plays sound after a tap, so START CAMERA
// unlocks them. Muted per phone (🔇, kept in localStorage).

import { readLocal, writeLocal } from '../lib/local.js';
import { trace } from './trace.js';

const MUTE_KEY = 'pug.scan.muted';
let ctx = null;

/** Call from a tap (START CAMERA): browsers start audio only after one. */
export function unlockSounds() {
  try {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    ctx ??= new Context();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    ctx = null;   // no audio here: the scanner works silently
  }
}

export const isMuted = () => readLocal(MUTE_KEY) === '1';
export const setMuted = (muted) => writeLocal(MUTE_KEY, muted ? '1' : null);

/** One note: a frequency for a moment, faded in and out so it doesn't click. */
function note(freq, at, length, { type = 'sine', volume = 0.16 } = {}) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t = ctx.currentTime + at;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

/**
 * Play a sound, waking the audio first if it's stopped (owner, 2026-10-19: "It doesn't seem to be
 * making the sound anymore"; decision 315): an iPhone stops a page's audio ("interrupted") when the
 * camera starts, restarts or is paused by the phone, and START CAMERA's tap was the only time it was
 * started; now each sound starts it again if it has to.
 * @param {'added'|'foil'|'needs_price'|'error'} kind  added: a nonfoil card sent; foil: a foil or etched one
 */
export function play(kind) {
  if (!ctx || isMuted()) return;
  if (ctx.state !== 'running') {
    trace('sound-woken', { state: ctx.state, kind });
    ctx.resume().then(() => sound(kind)).catch(() => {});
    return;
  }
  sound(kind);
}

function sound(kind) {
  try {
    if (kind === 'added') {
      note(1046.5, 0, 0.11);          // C6
      note(1568, 0.085, 0.16);        // G6
    } else if (kind === 'foil') {
      note(1318.5, 0, 0.1);           // E6
      note(1568, 0.075, 0.1);         // G6
      note(2093, 0.15, 0.22, { volume: 0.18 });   // C7, held
    } else if (kind === 'needs_price') {
      note(523.25, 0, 0.22, { volume: 0.18 });   // C5
    } else {
      note(170, 0, 0.14, { type: 'square', volume: 0.05 });
    }
  } catch {
    // a sound is never worth an error
  }
}

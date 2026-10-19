import { useCallback, useEffect, useRef, useState } from 'react';

// The phone's back camera (docs/SCAN_FUNCTION.md 5.3), written fresh from
// mtgscan's description: 1920 × 1280 asked for (the phone gives what it
// has), a frame captured at the camera's full size, and the torch when the
// camera offers one (Android Chrome mostly; iPhones don't to web pages).

const CONSTRAINTS = {
  audio: false,
  video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1280 } },
};

// One lens, never switching (owner, 2026-10-16, screenshots: the locked crop
// stayed put while the picture in it jumped as each new card came in). An
// iPhone Pro's default back camera ("Back Triple Camera") switches lenses by
// itself when a hand or a card comes close, and each lens sees the holder
// from elsewhere (docs/SCAN_LEARNINGS.md 2.4). Tried the same day: the
// ultra-wide alone (cards too small to read) and the telephoto alone (too
// close, the card didn't fit). The owner's choice: the normal 1× lens alone
// ("Back Camera"), as in the first attempt, its focus to be worked on. Opened
// by name once the camera's allowed, so the default camera opens first. Only
// on a phone with that switching camera; other phones keep the default
// camera, as does an iPhone if the 1× lens won't open.
const SWITCHING_CAMERA = /triple camera/i;
const ONE_X = /^back camera$/i;
// The 1× lens asked for the most pixels it gives (owner, 2026-10-16), so a
// card read from a little further away, where the lens focuses, has letters
// as large as before.
const ONE_X_SIZE = { width: { ideal: 3840 }, height: { ideal: 2160 } };

// What the camera was last opened with, so a restart (the page shown again,
// a refocus) opens the same lens straight away.
let chosen = null;

// The camera cut off (decision 303): a picture that hasn't moved for this long is frozen; restarted
// at most this many times in this long before it's left off.
const FROZEN_MS = 3_000;
const RESTART_MAX = 3;
const RESTART_WINDOW_MS = 60_000;

/** The camera to scan with: the 1× lens alone where the default one switches lenses, else the default. */
async function openCamera() {
  if (chosen) {
    try {
      return await navigator.mediaDevices.getUserMedia(chosen);
    } catch {
      chosen = null;   // that lens is gone or busy: choose again
    }
  }
  const first = await navigator.mediaDevices.getUserMedia(CONSTRAINTS);
  let lens = null;
  try {
    const cameras = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    if (cameras.some((d) => SWITCHING_CAMERA.test(d.label))) lens = cameras.find((d) => ONE_X.test(d.label.trim())) ?? null;
  } catch {
    lens = null;
  }
  if (!lens) {
    chosen = CONSTRAINTS;
    return first;
  }
  first.getTracks().forEach((t) => t.stop());
  const want = { audio: false, video: { deviceId: { exact: lens.deviceId }, ...ONE_X_SIZE } };
  try {
    const s = await navigator.mediaDevices.getUserMedia(want);
    chosen = want;
    return s;
  } catch (e) {
    console.warn('The 1× lens would not open: the default camera instead', e);
    chosen = CONSTRAINTS;
    return navigator.mediaDevices.getUserMedia(CONSTRAINTS);
  }
}

/** Why the camera didn't start, in the phone's words. */
function cameraError(e) {
  if (!window.isSecureContext) {
    return 'The camera needs the HTTPS address of this page (docs/SETUP.md: npm run dev:lan).';
  }
  if (e?.name === 'NotAllowedError') {
    return "The camera isn't allowed. Allow it in the browser's settings for this site, then START CAMERA again.";
  }
  if (e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError') return 'No camera found on this device.';
  if (e?.name === 'NotReadableError') return 'The camera is busy in another app: close it and try again.';
  return `The camera couldn't start: ${e?.message ?? e}`;
}

/**
 * @param {import('react').RefObject<HTMLVideoElement>} videoRef
 * @returns {{ on: boolean, starting: boolean, error: string|null, torch: boolean|null,
 *   size: { w: number, h: number }|null, start: () => Promise<boolean>, stop: () => void,
 *   toggleTorch: () => Promise<void>, capture: () => HTMLCanvasElement|null, refocus: () => Promise<void> }}
 *   torch: null when the camera has none, else whether it's lit; interrupted: null, 'paused' (the
 *   phone took the camera for a while, a call say) or 'restarting' (it ended, or froze)
 */
export function useCamera(videoRef) {
  // opened: counts each time the picture comes (back) — opened, refocused, restarted, given back
  // after a pause — for the scanner to find the card again (decision 314).
  const [state, setState] = useState({
    on: false, starting: false, error: null, torch: null, size: null, interrupted: null, opened: 0,
  });
  const stream = useRef(null);
  // Bumped by stop() (decision 321): an opening under way (START, a refocus, a restart, the tab shown
  // again) that finishes after Stop shuts what it opened instead of showing it.
  const generation = useRef(0);
  // Restarts after the camera was cut off, lately: a camera that keeps failing isn't restarted for ever.
  const restarts = useRef([]);

  const stop = useCallback(() => {
    generation.current += 1;
    stream.current?.getTracks().forEach((t) => {
      t.enabled = false;
      t.stop();
    });
    stream.current = null;
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    setState((s) => ({ ...s, on: false, starting: false, torch: null, interrupted: null }));
  }, [videoRef]);

  /** A stream opened after Stop (decision 321): shut at once, never shown. */
  const stale = (gen, s) => {
    if (gen === generation.current) return false;
    s?.getTracks().forEach((t) => t.stop());
    return true;
  };

  // Cut off (owner, 2026-10-18: "fix", to "The camera doesn't notice when it's cut off"): a call, Siri
  // or another app can take the camera while the page stays open, and the picture froze while auto
  // scan read the same frozen picture. Now the camera's track is watched: paused by the phone, the
  // scanner waits and says so; ended, the camera starts again by itself.
  const restartRef = useRef(null);
  const watch = useCallback((s) => {
    const track = s.getVideoTracks()[0];
    if (!track) return;
    track.addEventListener('mute', () => {
      if (stream.current === s) setState((st) => ({ ...st, interrupted: 'paused' }));
    });
    track.addEventListener('unmute', () => {
      if (stream.current === s) setState((st) => ({ ...st, interrupted: null, opened: st.opened + 1 }));
    });
    // Our own stop() doesn't fire `ended`: this is the phone ending it.
    track.addEventListener('ended', () => {
      if (stream.current === s) restartRef.current?.();
    });
  }, []);

  const start = useCallback(async () => {
    if (stream.current) return true;
    if (!navigator.mediaDevices?.getUserMedia) {
      setState((s) => ({ ...s, error: cameraError(null) }));
      return false;
    }
    setState((s) => ({ ...s, starting: true, error: null }));
    const gen = generation.current;
    try {
      const s = await openCamera();
      if (stale(gen, s)) return false;
      stream.current = s;
      watch(s);
      const video = videoRef.current;
      video.srcObject = s;
      video.muted = true;
      video.setAttribute('playsinline', '');
      await video.play().catch(() => {});
      if (!video.videoWidth) {
        await new Promise((resolve) => video.addEventListener('loadedmetadata', resolve, { once: true }));
      }
      if (gen !== generation.current) return false;   // stopped meanwhile: stop() has shut it
      const caps = s.getVideoTracks()[0]?.getCapabilities?.() ?? {};
      setState((st) => ({
        on: true, starting: false, error: null, torch: caps.torch ? false : null,
        size: { w: video.videoWidth, h: video.videoHeight }, interrupted: null, opened: st.opened + 1,
      }));
      return true;
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
      setState((st) => ({ ...st, on: false, starting: false, error: cameraError(e), interrupted: null }));
      return false;
    }
  }, [videoRef, watch]);

  /**
   * Start the camera again after it was cut off (it ended, or its picture
   * froze): at most RESTART_MAX times in RESTART_WINDOW_MS, then it's left
   * off with START CAMERA to press.
   */
  const restart = useCallback(async () => {
    const now = Date.now();
    restarts.current = restarts.current.filter((t) => now - t < RESTART_WINDOW_MS);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (restarts.current.length >= RESTART_MAX) {
      if (videoRef.current) videoRef.current.srcObject = null;
      setState((s) => ({
        ...s, on: false, starting: false, torch: null, interrupted: null,
        error: 'The camera keeps stopping. Press START CAMERA to try again.',
      }));
      return;
    }
    restarts.current.push(now);
    setState((s) => ({ ...s, interrupted: 'restarting' }));
    await start();
  }, [start, videoRef]);
  restartRef.current = restart;

  /**
   * Refocus (owner, 2026-10-16): the camera opened afresh, the same lens, so
   * the phone's autofocus starts over. The picture stops for a moment.
   */
  const refocusing = useRef(false);
  const refocus = useCallback(async () => {
    const video = videoRef.current;
    if (!stream.current || !video || refocusing.current) return;
    refocusing.current = true;
    const gen = generation.current;
    try {
      stream.current.getTracks().forEach((t) => t.stop());
      stream.current = null;
      const s = await openCamera();
      if (stale(gen, s)) return;
      stream.current = s;
      watch(s);
      video.srcObject = s;
      await video.play().catch(() => {});
      setState((st) => ({ ...st, torch: st.torch == null ? null : false, opened: st.opened + 1 }));
    } catch (e) {
      console.warn('Refocusing failed', e);
      setState((st) => ({ ...st, on: false, error: cameraError(e) }));
    } finally {
      refocusing.current = false;
    }
  }, [videoRef, watch]);

  // A frozen picture (an iPhone doesn't always say its camera ended): the video's clock checked every
  // second; stopped for FROZEN_MS while nothing paused it, the camera starts again. A paused video
  // is played first.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    let last = -1;
    let since = Date.now();
    const timer = setInterval(() => {
      const track = stream.current?.getVideoTracks()[0];
      if (!track || refocusing.current || track.muted || document.visibilityState !== 'visible') {
        last = -1;
        since = Date.now();
        return;
      }
      if (video.paused) video.play().catch(() => {});
      if (video.currentTime !== last) {
        last = video.currentTime;
        since = Date.now();
      } else if (Date.now() - since > FROZEN_MS) {
        last = -1;
        since = Date.now();
        restartRef.current?.();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [videoRef]);

  const toggleTorch = useCallback(async () => {
    const track = stream.current?.getVideoTracks()[0];
    if (!track || state.torch == null) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !state.torch }] });
      setState((s) => ({ ...s, torch: !s.torch }));
    } catch (e) {
      console.warn('Torch failed', e);
    }
  }, [state.torch]);

  /** The picture in front of the camera now, at its full size. */
  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!stream.current || !video?.videoWidth) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d', { willReadFrequently: true }).drawImage(video, 0, 0);
    return canvas;
  }, [videoRef]);

  // The picture's shape can change after the camera starts (turning the
  // phone; an iPhone settling on another format): followed on the video's
  // events, and checked every second, since an iPhone doesn't always say.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    const follow = () => {
      if (!video.videoWidth) return;
      setState((s) => (s.size?.w === video.videoWidth && s.size?.h === video.videoHeight
        ? s : { ...s, size: { w: video.videoWidth, h: video.videoHeight } }));
    };
    video.addEventListener('resize', follow);
    video.addEventListener('loadedmetadata', follow);
    const timer = setInterval(follow, 1000);
    return () => {
      video.removeEventListener('resize', follow);
      video.removeEventListener('loadedmetadata', follow);
      clearInterval(timer);
    };
  }, [videoRef]);

  // Off when the screen goes, and a camera still opening (a refocus, a restart) shut as it opens
  // instead of left on behind the next screen (decision 356).
  useEffect(() => () => {
    generation.current += 1;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  return { ...state, start, stop, toggleTorch, capture, refocus };
}

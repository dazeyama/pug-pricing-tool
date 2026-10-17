import { useCallback, useEffect, useRef, useState } from 'react';

// The phone's back camera (docs/SCAN_FUNCTION.md 5.3), written fresh from
// mtgscan's description: 1920 × 1280 asked for (the phone gives what it
// has), a frame captured at the camera's full size, and the torch when the
// camera offers one (Android Chrome mostly; iPhones don't to web pages).

const CONSTRAINTS = {
  audio: false,
  video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1280 } },
};

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
 *   toggleTorch: () => Promise<void>, capture: () => HTMLCanvasElement|null }}
 *   torch: null when the camera has none, else whether it's lit
 */
export function useCamera(videoRef) {
  const [state, setState] = useState({ on: false, starting: false, error: null, torch: null, size: null });
  const stream = useRef(null);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setState((s) => ({ ...s, on: false, starting: false, torch: null }));
  }, [videoRef]);

  const start = useCallback(async () => {
    if (stream.current) return true;
    if (!navigator.mediaDevices?.getUserMedia) {
      setState((s) => ({ ...s, error: cameraError(null) }));
      return false;
    }
    setState((s) => ({ ...s, starting: true, error: null }));
    try {
      const s = await navigator.mediaDevices.getUserMedia(CONSTRAINTS);
      stream.current = s;
      const video = videoRef.current;
      video.srcObject = s;
      video.muted = true;
      video.setAttribute('playsinline', '');
      await video.play().catch(() => {});
      if (!video.videoWidth) {
        await new Promise((resolve) => video.addEventListener('loadedmetadata', resolve, { once: true }));
      }
      const caps = s.getVideoTracks()[0]?.getCapabilities?.() ?? {};
      setState({
        on: true, starting: false, error: null, torch: caps.torch ? false : null,
        size: { w: video.videoWidth, h: video.videoHeight },
      });
      return true;
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
      setState((st) => ({ ...st, on: false, starting: false, error: cameraError(e) }));
      return false;
    }
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

  // Off when the screen goes.
  useEffect(() => () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  return { ...state, start, stop, toggleTorch, capture };
}

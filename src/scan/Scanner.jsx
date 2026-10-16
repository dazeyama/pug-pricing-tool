import { useEffect, useRef, useState } from 'react';
import { CONDITIONS } from '../lib/ladder.js';
import { readSession, writeSession } from '../lib/local.js';
import { formatMoney } from '../lib/money.js';
import * as scry from '../lib/scryfall.js';
import { scanFinish, scanText } from '../lib/scanPrice.js';
import { useConnection } from '../state/connection.jsx';
import { usePairing } from './usePairing.js';
import { useScans } from './useScans.js';
import { useCamera } from './camera.js';
import { onScreen, showPart } from './guide.js';
import { locate, paperSetCodes, readCollectorLine, readPrepared, setCodePattern } from './read.js';
import { resolveReadings, resolveThorough } from './resolve.js';
import { STEP_MS, createProgress } from './progress.js';
import { findCard } from './cardEdges.js';
import {
  ART_CHANGED, anchorBlock, artDistance, artPrint, blockOnCard, cropTo, makeLock, movedFrom, samePlace,
} from './lock.js';
import { straightCutout } from './straighten.js';
import { defaultCreateCanvas } from './recognition/canvasUtil.js';
import { ocrWorker, onOcrStatus } from './ocr.js';
import { isMuted, play, setMuted, unlockSounds } from './sounds.js';
import { readOlderCard } from './older.js';
import NeedsPriceSheet from './NeedsPriceSheet.jsx';
import PickPrintingSheet from './PickPrintingSheet.jsx';

// Auto scan (docs/SCAN_FUNCTION.md 6.3): the rest between one look at the
// camera and the next, and the wait before the first.
const REST_MS = 300;
/** A first read waiting for the second look that must agree: taken straight away, not after a rest. */
const CONFIRM_MS = 50;
const FIRST_LOOK_MS = 800;
// Older cards (tiers 2 and 3, 6.2) are read by their title, which is less
// sure than a collector line: only on Scan card until the benchmark on the
// store's own photos reads 80% of them right (docs/SCAN_FUNCTION.md 11.3).
const AUTO_OLDER = false;
// The card clearly moved for this long (the camera shifted): the view locks onto it again.
const RELOCK_MS = 2000;
// Scan card's loading bar stays full this long once it's done.
const BAR_DONE_MS = 250;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The condition and finish for the next scans, kept for this tab (a reload keeps them).
const CONDITION_KEY = 'pug.scan.condition';
const FOIL_KEY = 'pug.scan.foil';
// Auto scan on or off (owner, 2026-10-16: an "Auto?" checkbox), kept the same way.
const AUTO_KEY = 'pug.scan.auto';
// FOIL? gives up if the computer hasn't taken the normal copy off by then.
const FOIL_GIVE_UP_MS = 30_000;

// scan_send's refusals, as the phone says them.
const SEND_MESSAGES = {
  cannot_add: "The computer can't take cards right now.",
  not_paired: 'This phone is no longer paired.',
  session_gone: 'The computer left its price screen.',
  session_stale: "The computer hasn't been heard from for a minute.",
  bad_scan: "That card couldn't be sent.",
};

/** Why the paired computer can't take cards now, as the phone says it, or null. */
export function blockedText(session) {
  if (!session || session.can_add) return null;
  const name = session.device_label;
  if (!(session.games ?? []).includes('mtg')) return `${name} is on Pokémon: switch it to Magic.`;
  if (session.locked) return `${name}: ${session.locked}.`;
  if (!session.staff_user_id) return `Pick a user on ${name} first.`;
  return `${name} can't take cards right now.`;
}

/** The strip for a scan the computer has, by where it's got to. */
function scanStrip(s, computer) {
  const what = scanText(s);
  switch (s.status) {
    case 'sent': return { tone: 'muted', title: what, text: `Sending to ${computer}…` };
    case 'pricing': return { tone: 'muted', title: what, text: `Pricing on ${computer}…` };
    case 'added': return {
      tone: 'good',
      title: `✓ ${what}`,
      text: `Added to ${computer}${s.price != null ? ` at ${formatMoney(Number(s.price))}` : ''}${s.line_qty > 1 ? ` · ×${s.line_qty} in the list` : ''}`,
    };
    case 'needs_price': return { tone: 'warn', title: what, text: 'Needs a price: type one below.' };
    case 'failed': return { tone: 'err', title: what, text: `Couldn't add: ${s.note ?? 'unknown reason'}` };
    case 'skipped': return { tone: 'muted', title: what, text: 'Skipped: set it aside and add it on the computer.' };
    case 'undo':
    case 'undoing': return { tone: 'muted', title: what, text: `Taking it off ${computer}…` };
    case 'undone': return { tone: 'muted', title: `↶ ${what}`, text: `Taken off ${computer}.` };
    default: return { tone: 'muted', title: what, text: s.status };
  }
}

/**
 * The scanning screen (docs/SCAN_FUNCTION.md 5.3): who it's paired with, the
 * condition and finish for the next scans, the camera with its guide, Scan
 * card, Lighting and Stop, and the last scan and what became of it.
 * @param {{ computerId: string, phoneId: string, onEnd: (message: string|null) => void }} props
 */
export default function Scanner({ computerId, phoneId, onEnd }) {
  const { session, unpair, check } = usePairing(computerId, phoneId, onEnd);
  const { scans, send, answer, undo } = useScans(computerId, phoneId);
  const videoRef = useRef(null);
  const camera = useCamera(videoRef);
  // The space the camera has (the screen less the controls and buttons), measured.
  const middle = useRef(null);
  const [room, setRoom] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = middle.current;
    if (!el) return undefined;
    const measure = () => setRoom((r) => (r.w === el.clientWidth && r.h === el.clientHeight
      ? r : { w: el.clientWidth, h: el.clientHeight }));
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, []);
  const [condition, setConditionState] = useState(() => {
    const saved = readSession(CONDITION_KEY);
    return CONDITIONS.includes(saved) ? saved : 'NM';
  });
  const [foil, setFoilState] = useState(() => readSession(FOIL_KEY) === '1');
  const [autoOn, setAutoState] = useState(() => readSession(AUTO_KEY) !== '0');
  const [muted, setMutedState] = useState(isMuted);
  const [local, setLocal] = useState(null);       // the phone's own message: { tone, title?, text, at }
  const [reading, setReading] = useState(false);
  // Scan card's loading bar (progress.js), while it reads; and Scan card waiting for an auto look to end.
  const [progress, setProgress] = useState(null);
  const manualWaiting = useRef(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  // The locked view (lock.js): the card, its collector corner and its art,
  // where they are in the picture; null till the first card is found.
  const lockRef = useRef(null);
  const [lock, setLockState] = useState(null);
  // The card found before the view is locked, outlined on the picture.
  const [seenCard, setSeenCard] = useState(null);
  // The enlarged collector corner, under the card.
  const cutoutRef = useRef(null);
  // The card seen elsewhere than locked: { card, since }, till it's lasted RELOCK_MS.
  const moving = useRef(null);
  // Auto scan: `held`, the art of the card last sent (nothing's read while it's
  // still there); `pending`, the printing the last look read, for the next to agree with.
  const view = useRef({ held: null, pending: null });
  // An older card that could be several printings: { tier, name, cards } to pick from.
  const [pick, setPick] = useState(null);
  const { offline } = useConnection();
  const busy = useRef(false);
  const lastSent = useRef(null);                  // the printing and finish last sent (6.3)
  const computer = session?.device_label ?? 'the computer';

  const setCondition = (c) => {
    setConditionState(c);
    writeSession(CONDITION_KEY, c);
  };
  const setFoil = (f) => {
    setFoilState(f);
    writeSession(FOIL_KEY, f ? '1' : null);
  };
  const setAuto = (on) => {
    setAutoState(on);
    writeSession(AUTO_KEY, on ? null : '0');
    view.current.pending = null;   // auto scan starts afresh: two looks (or one sure one) again
  };

  // FOIL? (owner, 2026-10-16: "tag the last card scanned as foil … edits the last card scanned to be
  // a foil instead"): its copy taken off the computer's list, as Undo does, and once the computer
  // says it's off, the card sent again as foil, priced as foil. The count of cards scanned stays.
  const refoil = useRef(null);                     // { id, fields, seenUndo }
  const [foiling, setFoiling] = useState(null);    // the scan being made foil
  async function makeFoil(scan) {
    if (foiling) return;
    setFoiling(scan.id);
    try {
      const card = await scry.cardById(scan.scryfall_id);
      const finish = card ? scanFinish(card, true) : null;
      if (!card || finish === 'nonfoil' || finish === scan.finish) {
        say('warn', card ? 'This card has no foil printing.' : "Couldn't find that card on Scryfall.", scanText(scan));
        setFoiling(null);
        return;
      }
      const e = await undo(scan.id);
      if (e) {
        say('err', `Couldn't make it foil: ${e}`, scanText(scan));
        setFoiling(null);
        return;
      }
      refoil.current = {
        id: scan.id,
        fields: { ...cardFields(card), finish, condition: scan.condition, tier: scan.tier ?? 1 },
        seenUndo: false,
      };
      say('muted', `Making it foil: taking the normal copy off ${computer}…`, scanText(scan));
      setTimeout(() => {
        if (refoil.current?.id !== scan.id) return;
        refoil.current = null;
        setFoiling(null);
        say('err', `${computer} didn't take the normal copy off: check the list there.`, scanText(scan));
      }, FOIL_GIVE_UP_MS);
    } catch (e) {
      say('err', `Couldn't make it foil: ${e.message}`, scanText(scan));
      setFoiling(null);
    }
  }
  const say = (tone, text, title = null) => setLocal({ tone, text, title, at: Date.now() });

  const blocked = blockedText(session);
  const needs = [...scans].reverse().find((s) => s.status === 'needs_price') ?? null;
  const latest = scans[0] ?? null;

  // When the latest scan last changed, by this phone's clock (the database's
  // may differ from it), so the strip can tell whether its own message is newer.
  const [latestAt, setLatestAt] = useState(0);
  const latestKey = latest ? `${latest.id}:${latest.status}` : null;
  useEffect(() => {
    if (latestKey) setLatestAt(Date.now());
  }, [latestKey]);

  // FOIL?: the normal copy off, the foil one sent; Undo refused (the line gone, no user), nothing sent.
  useEffect(() => {
    const r = refoil.current;
    const s = r && scans.find((x) => x.id === r.id);
    if (!s) return;
    if (s.status === 'undo' || s.status === 'undoing') {
      r.seenUndo = true;
    } else if (s.status === 'undone') {
      refoil.current = null;
      send(r.fields).then((res) => {
        if (res.error) say('err', `Couldn't send the foil copy: ${SEND_MESSAGES[res.error] ?? res.error}`);
        setFoiling(null);
      });
    } else if (s.status === 'added' && r.seenUndo) {
      refoil.current = null;
      setFoiling(null);
      say('err', s.note ?? `${computer} couldn't take the normal copy off.`, scanText(s));
    }
  }, [scans, send, computer]);

  // A sound when the computer says how a scan went (not for scans already done when the page opened).
  const seen = useRef(null);
  useEffect(() => {
    const before = seen.current;
    seen.current = new Map(scans.map((s) => [s.id, s.status]));
    if (!before) return;
    for (const s of scans) {
      const was = before.get(s.id);
      if (!was || was === s.status) continue;
      if (s.status === 'added') play('added');
      else if (s.status === 'needs_price') play('needs_price');
      else if (s.status === 'failed') play('error');
    }
  }, [scans]);

  // The card reader loads its model on the first scan (about 3 MB): say so.
  useEffect(() => onOcrStatus((m) => {
    if (/loading|initializ/i.test(m.status ?? '')) setOcrLoading(true);
    else if (/recognizing/i.test(m.status ?? '')) setOcrLoading(false);
  }), []);

  // The screen stays awake while the camera runs, where the phone allows it.
  useEffect(() => {
    if (!camera.on || !navigator.wakeLock) return undefined;
    let lock = null;
    let alive = true;
    const take = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
      } catch {
        lock = null;   // a low battery or the browser said no: the screen may sleep
      }
    };
    take();
    const onVisible = () => {
      if (alive && document.visibilityState === 'visible') take();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => {});
    };
  }, [camera.on]);

  // The camera stops when the page is hidden (a locked screen, another app)
  // and comes back when it's shown again, as mtgscan's does.
  const cam = useRef(camera);
  cam.current = camera;
  useEffect(() => {
    let resume = false;
    const onVisible = () => {
      if (document.visibilityState === 'hidden') {
        if (cam.current.on) {
          resume = true;
          cam.current.stop();
        }
      } else if (resume) {
        resume = false;
        cam.current.start();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(() => {
    if (camera.on) return;
    lockRef.current = null;
    setLockState(null);
    setSeenCard(null);
  }, [camera.on]);

  async function startCamera() {
    unlockSounds();
    if (await camera.start()) {
      // Ready the reader and the set list while the card is being lined up.
      ocrWorker()
        .catch((e) => console.warn('The card reader failed to load', e))
        .finally(() => setOcrLoading(false));
      setCodePattern().catch(() => {});
    }
  }

  /** Lock the view onto a card (null: unlock); anything held about the last card goes. */
  function setLock(next, keep = null) {
    lockRef.current = next;
    setLockState(next);
    moving.current = null;
    view.current = { held: keep, pending: null };
  }

  /** Reset view: unlocked, and the next card found locks it again. */
  function resetView() {
    setLock(null);
    setSeenCard(null);
  }

  /** The enlarged, cleaned collector corner, drawn into the strip under the card. */
  function showCutout(src) {
    const el = cutoutRef.current;
    if (!el || !src) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(el.clientWidth * dpr));
    const h = Math.max(1, Math.round(el.clientHeight * dpr));
    if (el.width !== w) el.width = w;
    if (el.height !== h) el.height = h;
    const ctx = el.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    const k = Math.min(w / src.width, h / src.height);
    ctx.drawImage(src, (w - src.width * k) / 2, (h - src.height * k) / 2, src.width * k, src.height * k);
  }

  /**
   * The camera shifted (an iPhone switching lenses): when the card has
   * clearly moved from the locked place and stayed in its new one for two
   * seconds, with its collector line where a card's is, lock onto it there
   * (owner's choice). Returns the lock to use for this look.
   */
  function followMove(frame, lock) {
    const now = findCard(frame, defaultCreateCanvas);
    if (!now || !movedFrom(lock.card, now)) {
      moving.current = null;
      return lock;
    }
    const m = moving.current;
    if (!m || !samePlace(m.card, now)) {
      moving.current = { card: now, since: Date.now() };
      return lock;
    }
    if (Date.now() - m.since < RELOCK_MS) return lock;
    moving.current = null;
    const anchor = anchorBlock(locate(frame));
    if (!anchor || !blockOnCard(anchor, now)) return lock;
    const next = makeLock(now, anchor, frame);
    // The same card, now seen at its new place: still held.
    setLock(next, view.current.held ? artPrint(frame, next) : null);
    return next;
  }

  /**
   * Read the card in front of the camera and send it (6.1, 6.3, 6.4).
   * Until the view is locked, a look searches for the card to lock onto: its
   * edges, and a collector line where a card's is (owner, 2026-10-16); auto
   * scan starts once it's locked. Auto scan, for speed: the enlarged
   * collector strip only, resolved the quick way first (resolve.js); it
   * reads only once the card's art has changed from the card last sent, and
   * sends when two looks in a row agree, or on one look when every clue on
   * the strip agrees (owner, 2026-10-16). `manual`: Scan card, for accuracy
   * (owner, 2026-10-16: "do it the slow way"): the strip and the line on the
   * card itself read, every block, every search asked (resolveThorough),
   * its steps on the loading bar (`progress`); it takes a fair read, says
   * what went wrong, and always sends, the same card again included (a
   * second copy).
   */
  async function scanFrame({ manual, progress = null }) {
    if (busy.current || !camera.on) return;
    if (blocked) {
      if (manual) {
        say('warn', blocked);
        play('error');
      }
      return;
    }
    if (needs || pick) {
      if (manual) say('warn', needs ? 'Answer the card that needs a price first.' : 'Pick the printing first.');
      return;
    }
    busy.current = true;
    if (manual) say('muted', 'Reading…');
    try {
      const frame = camera.capture();
      if (!frame) return;
      const pattern = await setCodePattern();
      const known = await paperSetCodes();
      let lock = lockRef.current;
      // The camera's picture changed shape: the lock no longer fits it.
      if (lock && (lock.frame.width !== frame.width || lock.frame.height !== frame.height)) {
        resetView();
        lock = null;
      }
      let blocks = null;
      if (!lock) {
        const card = findCard(frame, defaultCreateCanvas);
        setSeenCard(card);
        blocks = locate(frame);
        const anchor = anchorBlock(blocks);
        if (card && anchor && blockOnCard(anchor, card)) {
          lock = makeLock(card, anchor, frame);
          setLock(lock);
        } else if (!manual) {
          return;   // auto scan starts once the view is locked
        }
      } else if (!manual) {
        lock = followMove(frame, lock);
      }

      let attempts = [];
      let found = null;
      let art = null;
      if (lock) {
        // This card's collector line, found in its zone and set level (owner, 2026-10-16).
        const cut = straightCutout(frame, lock, defaultCreateCanvas).canvas;
        showCutout(cut);
        art = artPrint(frame, lock);
        const v = view.current;
        if (!manual && v.held) {
          // The card last sent, still there: nothing to read, so a misread of it can't be sent.
          if (artDistance(v.held, art) < ART_CHANGED) return;
          v.held = null;
          v.pending = null;
        }
        progress?.start('strip');
        attempts = await readPrepared(cut, pattern);
        progress?.finish('strip');
        if (manual) {
          // Scan card: the line looked for on the card itself too, every block read; then all of it
          // weighed together. Auto scan looks again instead (several more reads would keep it busy
          // while a new card is laid in; the strip is found on each card already, straighten.js).
          const onCard = cropTo(frame, lock.view, defaultCreateCanvas);
          const located = locate(onCard);
          progress?.drop('card');
          located.forEach((_, i) => progress?.plan(`located-${i + 1}`, STEP_MS.ocr));
          const more = located.length ? await readCollectorLine(onCard, pattern, located, { all: true, progress }) : [];
          attempts = [...attempts, ...more];
          found = await resolveThorough(attempts.map((a) => a.text), known, { pattern, progress });
        } else {
          // What the strip names, the quick way first (resolve.js; owner, 2026-10-16).
          found = await resolveReadings(attempts, known, { pattern });
        }
      } else {
        // Scan card before the view is locked: the whole picture, every block read.
        progress?.drop('strip');
        progress?.drop('card');
        blocks.forEach((_, i) => progress?.plan(`located-${i + 1}`, STEP_MS.ocr));
        attempts = blocks.length ? await readCollectorLine(frame, pattern, blocks, { all: true, progress }) : [];
        found = await resolveThorough(attempts.map((a) => a.text), known, { pattern, progress });
      }

      // No modern collector line: an older card, by its title (and "123/350" from 1998 on).
      if (!found && (manual || AUTO_OLDER)) {
        if (manual) say('muted', 'No set code at the bottom: reading the title…');
        progress?.plan('older', STEP_MS.older);
        progress?.start('older');
        const old = await readOlderCard(frame, { texts: attempts.map((a) => a.text), card: lock?.card ?? null });
        progress?.finish('older');
        if (old?.cards.length === 1) found = { card: old.cards[0], tier: old.tier };
        else if (old) {
          setPick(old);
          say('muted', `${old.name}: pick its printing.`);
          return;
        }
      }
      if (!found) {
        if (!manual) view.current.pending = null;
        if (manual) {
          say('err', "Couldn't read this card: set it aside and add it on the computer.");
          play('error');
        }
        return;
      }
      if (found.foreign) {
        say('warn', `Not English (${found.foreign}): add it on the computer.`);
        if (manual) play('error');
        return;
      }
      progress?.start('send');
      await sendCard(found.card, { tier: found.tier ?? 1, manual, art, sure: Boolean(found.sure) });
      progress?.finish('send');
    } catch (e) {
      console.error('Scan failed', e);
      if (manual) {
        say('err', `Couldn't read it: ${e.message}`);
        play('error');
      }
    } finally {
      busy.current = false;
    }
  }

  /**
   * Scan card: the thorough read with its loading bar. Pressed during an
   * auto look, it waits for the look to end (auto scan holding off).
   */
  async function scanCard() {
    if (manualWaiting.current || reading) return;
    manualWaiting.current = true;   // auto scan holds off till Scan card is done: nothing interrupts it
    const bar = createProgress();
    // The work as expected; each step re-planned as it's known (the blocks found, the searches asked).
    if (busy.current) bar.plan('wait', STEP_MS.ocr);
    bar.plan('strip', STEP_MS.ocr);
    bar.plan('card', 2 * STEP_MS.ocr);
    bar.plan('resolve', STEP_MS.lookup + 2 * STEP_MS.search);
    bar.plan('send', STEP_MS.send);
    setProgress(bar);
    setReading(true);
    try {
      bar.start('wait');
      while (busy.current) await sleep(40);
      bar.finish('wait');
      await scanFrame({ manual: true, progress: bar });
    } finally {
      manualWaiting.current = false;
      bar.complete();
      await sleep(BAR_DONE_MS);
      setProgress(null);
      setReading(false);
    }
  }

  /**
   * Send a recognised card. Auto scan: never the card it last sent, and only
   * once two looks in a row have read this same printing, or on one look
   * when every clue on the strip agrees with it (`sure`, resolve.js isSure;
   * owner, 2026-10-16: "Let's try it with just one"). Once sent, the card's
   * art is held: nothing is read again till it changes.
   * @param {{ tier: number, manual: boolean, art?: Float32Array|null, sure?: boolean }} opts
   *   art: the card's (lock.js artPrint)
   */
  async function sendCard(card, { tier, manual, art = null, sure = false }) {
    const v = view.current;
    const finish = scanFinish(card, foil);
    const key = `${card.id}:${finish}`;
    if (!manual) {
      if (key === lastSent.current) {
        v.held = art;
        v.pending = null;
        return;
      }
      if (!sure && v.pending !== key) {
        v.pending = key;
        return;
      }
    }
    v.pending = null;
    const r = await send({ ...cardFields(card), finish, condition, tier });
    if (r.error) {
      say('err', SEND_MESSAGES[r.error] ?? `Couldn't send it: ${r.error}`);
      play('error');
      check();
      return;
    }
    lastSent.current = key;
    v.held = art;
    setLocal(null);
  }

  // Auto scan (6.3): while the camera runs, look again and again, resting
  // between looks; paused while the computer can't take cards, a card needs
  // a price, the connection is down, Scan card is reading (from the press
  // to the end), "Auto?" is unticked, or the page is hidden. It doesn't wait for the computer to price the last card (owner,
  // 2026-10-16: "the computer can load prices on it's own time while we
  // scan more cards"): the computer takes them in the order sent. Stop ends
  // it with the camera.
  const auto = useRef(null);
  auto.current = { scanFrame, paused: !autoOn || Boolean(blocked) || Boolean(needs) || Boolean(pick) || offline };
  useEffect(() => {
    if (!camera.on) return undefined;
    let alive = true;
    let timer;
    const look = async () => {
      if (!alive) return;
      if (!auto.current.paused && !manualWaiting.current && !busy.current && document.visibilityState === 'visible') {
        await auto.current.scanFrame({ manual: false });
      }
      if (alive) timer = setTimeout(look, view.current.pending ? CONFIRM_MS : REST_MS);
    };
    timer = setTimeout(look, FIRST_LOOK_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [camera.on]);

  // The strip: the phone's own message, or the latest scan's state, whichever is newer.
  const stripOfLatest = latest ? scanStrip(latest, computer) : null;
  const strip = local && local.at >= latestAt ? local : stripOfLatest ?? local;
  // Before the lock: the whole picture, filling the space, the card found
  // outlined. Locked: just the card, as large as fits, still (owner, 2026-10-16).
  const picture = camera.size ? { width: camera.size.w, height: camera.size.h } : null;
  const part = lock?.view ?? (picture && { x: 0, y: 0, width: picture.width, height: picture.height });
  const shown = picture && room.w && room.h ? showPart(picture, part, room.w, room.h, lock ? 'contain' : 'cover') : null;
  const outline = !lock && seenCard && shown ? onScreen(shown, seenCard) : null;
  const showUndo = strip === stripOfLatest && latest?.status === 'added';
  const showFoil = showUndo && latest.finish === 'nonfoil';

  return (
    <div className="scanner">
      <div className="scan-paired">
        <div className="scan-paired-text">
          <strong>→ {session?.device_label ?? 'Connecting…'}{session ? ` · ${session.target_name}` : ''}</strong>
          <span>
            {session?.staff_user_name ?? 'No user picked'}
            {session ? ` · ${session.scanned} scanned` : ''}
          </span>
        </div>
        <button
          type="button"
          className="btn small scan-mute"
          aria-pressed={muted}
          title={muted ? 'Sounds off: tap to turn them on' : 'Sounds on: tap to mute'}
          onClick={() => {
            setMuted(!muted);
            setMutedState(!muted);
          }}
        >
          {muted ? '🔇' : '🔔'}
        </button>
        <button type="button" className="btn small" onClick={unpair}>Unpair</button>
      </div>

      {/* The last scan and what became of it, always in view (owner, 2026-10-16). */}
      <div className={`scan-strip ${strip?.tone ?? 'muted'}`} role="status">
        <div className="scan-strip-text">
          {strip ? (
            <>
              {strip.title && <strong>{strip.title}</strong>}
              <span>{strip.text}</span>
            </>
          ) : <span>Cards you scan show here.</span>}
        </div>
        {/* Undo last scan (S5): one copy of it off the computer's list. */}
        {showUndo && (
          <button
            type="button"
            className="btn small scan-undo"
            onClick={async () => {
              const e = await undo(latest.id);
              if (e) say('err', `Couldn't undo it: ${e}`);
            }}
          >
            ↶ Undo
          </button>
        )}
        {/* FOIL? (owner, 2026-10-16): the last card made foil. */}
        {showFoil && (
          <button
            type="button"
            className="btn small scan-make-foil"
            disabled={Boolean(foiling)}
            title="The last card is foil: take the normal copy off and add it as foil"
            onClick={() => makeFoil(latest)}
          >
            FOIL?
          </button>
        )}
      </div>

      <div className="scan-controls">
        <div className="scan-seg conditions" role="radiogroup" aria-label="Condition for the next scans">
          {CONDITIONS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={condition === c}
              className={`scan-seg-btn cond-${c.toLowerCase()}${condition === c ? ' on' : ''}`}
              onClick={() => setCondition(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="scan-seg finish" role="radiogroup" aria-label="Finish for the next scans">
          <button type="button" role="radio" aria-checked={!foil} className={`scan-seg-btn${!foil ? ' on' : ''}`} onClick={() => setFoil(false)}>
            Normal
          </button>
          <button type="button" role="radio" aria-checked={foil} className={`scan-seg-btn foil${foil ? ' on' : ''}`} onClick={() => setFoil(true)}>
            Foil
          </button>
        </div>
      </div>

      {/* The camera takes the space that's left; notices and sheets lie over it. */}
      <div className="scan-middle" ref={middle}>
        <div className={`scan-stage${camera.on ? ' live' : ''}`}>
          <video
            ref={videoRef}
            className="scan-video"
            playsInline
            muted
            style={shown ? { left: shown.x, top: shown.y, width: shown.width, height: shown.height } : undefined}
          />
          {camera.on && outline && <div className="scan-card-outline" style={outline} aria-hidden="true" />}
          {!camera.on && (
            <div className="scan-stage-off">
              <button type="button" className="btn primary scan-start" disabled={camera.starting} onClick={startCamera}>
                {camera.starting ? 'Starting…' : 'START CAMERA'}
              </button>
              <p>Lay a card in the holder. The view locks onto the first card it finds; Reset view finds it again.</p>
            </div>
          )}
          {ocrLoading && <div className="scan-stage-note">Loading the card reader (first scan only)…</div>}
        </div>
        {(blocked || camera.error) && (
          <div className={`scan-notice ${camera.error ? 'err' : 'warn'} scan-over`} role="alert">{camera.error ?? blocked}</div>
        )}
        {needs ? (
          <NeedsPriceSheet key={needs.id} scan={needs} onAnswer={(price) => answer(needs.id, price)} />
        ) : pick && (
          <PickPrintingSheet
            pick={pick}
            onPick={(card) => {
              const { tier } = pick;
              setPick(null);
              sendCard(card, { tier, manual: true });
            }}
            onSkip={() => {
              setPick(null);
              say('muted', 'Skipped: set it aside and add it on the computer.');
            }}
          />
        )}
      </div>

      {/* The collector corner, enlarged and cleaned, for the person scanning (owner, 2026-10-16). */}
      {lock && camera.on && <canvas ref={cutoutRef} className="scan-cutout" aria-label="The set code and number, enlarged" />}

      {/* Scan card across the top; Auto?, Reset view, the light and Stop under it (owner, 2026-10-16). */}
      <div className="scan-actions">
        <button
          type="button"
          className={`btn primary scan-now${reading ? ' reading' : ''}`}
          disabled={!camera.on || reading || Boolean(needs) || Boolean(pick)}
          aria-busy={reading}
          onClick={scanCard}
        >
          {progress && <ScanBar progress={progress} />}
          <span className="scan-now-label">{reading ? 'Reading…' : 'Scan card'}</span>
        </button>
        <div className="scan-actions-row">
          <label className={`btn scan-auto${autoOn ? ' on' : ''}`} title="Scan cards by themselves">
            <input type="checkbox" checked={autoOn} onChange={(e) => setAuto(e.target.checked)} />
            Auto?
          </label>
          <button
            type="button"
            className="btn scan-reset"
            disabled={!camera.on || !lock}
            title="Find the card again and lock the view onto it"
            onClick={resetView}
          >
            Reset view
          </button>
          {camera.torch != null && (
            <button
              type="button"
              className={`btn scan-torch${camera.torch ? ' on' : ''}`}
              aria-pressed={camera.torch}
              aria-label="Light"
              title="Light"
              onClick={camera.toggleTorch}
            >
              💡
            </button>
          )}
          <button type="button" className="btn scan-stop" disabled={!camera.on} onClick={camera.stop}>■ Stop</button>
        </div>
      </div>
    </div>
  );
}

/** Scan card's loading bar, filling the button behind its label as the thorough read goes (progress.js). */
function ScanBar({ progress }) {
  const ref = useRef(null);
  useEffect(() => {
    let frame;
    const draw = () => {
      if (ref.current) ref.current.style.transform = `scaleX(${progress.value()})`;
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [progress]);
  return <span ref={ref} className="scan-now-bar" aria-hidden="true" />;
}

/** What a scan says about its card, from the Scryfall card. */
function cardFields(card) {
  return {
    scryfall_id: card.id,
    name: card.name,
    set_code: String(card.set).toUpperCase(),
    collector_number: card.collector_number,
  };
}

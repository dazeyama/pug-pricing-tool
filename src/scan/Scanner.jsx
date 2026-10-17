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
import { insetTo, onScreen, showPart } from './guide.js';
import { locate, paperSetCodes, readCollectorLine, readPrepared, setCodePattern } from './read.js';
import { readClues, resolveReadings, resolveThorough } from './resolve.js';
import { STEP_MS, createProgress } from './progress.js';
import { findCard } from './cardEdges.js';
import {
  ART_CHANGED, anchorBlock, artDistance, artPrint, blockOnCard, cropTo, lockOnCard, makeLock, rescaleLock,
} from './lock.js';
import { straightCutout } from './straighten.js';
import { stripShowsFoil } from './foilMark.js';
import { defaultCreateCanvas } from './recognition/canvasUtil.js';
import { ocrWorker, onOcrStatus } from './ocr.js';
import { isMuted, play, setMuted, unlockSounds } from './sounds.js';
import { readOlderCard } from './older.js';
import { inkShare, titleCutout } from './titles.js';
import NeedsPriceSheet from './NeedsPriceSheet.jsx';
import PickPrintingSheet from './PickPrintingSheet.jsx';

// Auto scan (docs/SCAN_FUNCTION.md 6.3): the rest between one look at the
// camera and the next, and the wait before the first.
const REST_MS = 300;
/** A first read waiting for the second look that must agree: taken straight away, not after a rest. */
const CONFIRM_MS = 50;
const FIRST_LOOK_MS = 800;
// Older cards (tiers 2 and 3, 6.2) are read by their title. Auto scan
// takes a card for an older one after this many looks in a row with no set
// code at its bottom (owner, 2026-10-16: "When it's detected that it's
// changing very rapidly like this shift to 2014 mode and focus the info box
// on the card name instead, resetting to the normal bottom position upon
// the next card"); then it reads the title, two looks naming the same card.
const OLDER_AFTER = 3;
// A blank strip with this much ink in the title band is a card (a white-bordered older one), not an empty holder.
const TITLE_INK = 0.02;
// Focus (owner, 2026-10-16): a collector strip under this sharpness
// (straighten.js; in focus about 5–7, a slight blur about 3, out of focus
// about 1) isn't read by auto scan; this many such looks in a row and the
// camera refocuses, no more often than this.
const BLUR_BELOW = 2;
const REFOCUS_AFTER = 4;
const REFOCUS_GAP_MS = 6000;
// Scan card's loading bar stays full this long once it's done.
const BAR_DONE_MS = 250;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The condition and finish for the next scans, kept for this tab (a reload keeps them).
const CONDITION_KEY = 'pug.scan.condition';
// The finish for the next scans (owner, 2026-10-16: "a 3rd foil state button Detect / Normal /
// Foil"): Detect goes by the strip's foil star (foilMark.js), Normal and Foil set every card flat.
const FINISH_KEY = 'pug.scan.finish';
const FINISHES = [['detect', 'Detect'], ['normal', 'Normal'], ['foil', 'Foil']];
// Auto scan on or off (owner, 2026-10-16: an "Auto?" checkbox), kept the same way.
const AUTO_KEY = 'pug.scan.auto';
// FOIL? / NONFOIL? gives up if the computer hasn't taken the old copy off by then.
const FOIL_GIVE_UP_MS = 30_000;
// +1 copies the last card scanned while it's on its way or added.
const COPYABLE = new Set(['sent', 'pricing', 'added']);

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
/**
 * The strip for a scan the computer has, by where it's got to: the card's
 * name on the first line, the short facts on the second (set, number, finish
 * and condition, then the price and how many in the list), so a phone shows
 * them all (owner, 2026-10-16: "The card name/set and the price all get
 * truncated"). The computer's name is in the paired bar, not repeated here.
 */
function scanStrip(s) {
  const mark = s.finish === 'foil' ? ' *F*' : s.finish === 'etched' ? ' *E*' : '';
  const cond = s.condition && s.condition !== 'NM' ? ` [${s.condition}]` : '';
  const code = `${String(s.set_code ?? '').toUpperCase()} ${s.collector_number ?? ''}`.trim() + mark + cond;
  const name = s.name ?? '';
  const facts = (...more) => [code, ...more].filter(Boolean).join(' · ');
  switch (s.status) {
    case 'sent': return { tone: 'muted', title: name, text: facts('sending…') };
    case 'pricing': return { tone: 'muted', title: name, text: facts('pricing…') };
    case 'added': return {
      tone: 'good',
      title: `✓ ${name}`,
      text: facts(s.price != null ? formatMoney(Number(s.price)) : null, s.line_qty > 1 ? `×${s.line_qty} in the list` : null),
    };
    case 'needs_price': return { tone: 'warn', title: name, text: facts('needs a price: type one below') };
    case 'failed': return { tone: 'err', title: name, text: facts(`couldn't add: ${s.note ?? 'unknown reason'}`) };
    case 'skipped': return { tone: 'muted', title: name, text: facts('skipped: set it aside') };
    case 'undo':
    case 'undoing': return { tone: 'muted', title: name, text: facts('taking it off…') };
    case 'undone': return { tone: 'muted', title: `↶ ${name}`, text: facts('taken off') };
    default: return { tone: 'muted', title: name, text: facts(s.status) };
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
  const [finishMode, setFinishState] = useState(() => {
    const saved = readSession(FINISH_KEY);
    return FINISHES.some(([k]) => k === saved) ? saved : 'detect';
  });
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
  // Focus: whether the strip's blurry (its border turns amber), blurry looks in a row, the last refocus.
  const [blurry, setBlurry] = useState(false);
  const blurryLooks = useRef(0);
  const lastRefocus = useRef(0);
  // Auto scan: `held`, the art of the card last sent (nothing's read while it's
  // still there); `pending`, the printing the last look read, for the next to agree with;
  // the older-card mode: `noLine`, looks in a row with no set code at the bottom (`lineArt`, the
  // card's art when they began), `older`, read by its title now, `pendingOld`, what the last
  // title read gave (the name, and the printing if one was clearly ahead), for the next to agree with.
  const view = useRef({ held: null, pending: null });
  // An older card that could be several printings: { tier, name, cards } to pick from.
  const [pick, setPick] = useState(null);
  // The info box on the card's title (the older-card mode, by itself or by Title), for the
  // Title / Number button's label.
  const [titleMode, setTitleMode] = useState(false);
  const { offline } = useConnection();
  const busy = useRef(false);
  const lastSent = useRef(null);                  // the printing and finish last sent (6.3)
  /**
   * The chime the moment a card is sent, not when the computer has added it
   * (owner, 2026-10-16): the brighter one for a foil (or etched) card, the
   * usual one for nonfoil, so the person scanning hears which went in.
   */
  const chime = (finish) => play(finish === 'nonfoil' ? 'added' : 'foil');
  const computer = session?.device_label ?? 'the computer';

  const setCondition = (c) => {
    setConditionState(c);
    writeSession(CONDITION_KEY, c);
  };
  const setFinishMode = (mode) => {
    setFinishState(mode);
    writeSession(FINISH_KEY, mode === 'detect' ? null : mode);
  };
  const setAuto = (on) => {
    setAutoState(on);
    writeSession(AUTO_KEY, on ? null : '0');
    view.current.pending = null;   // auto scan starts afresh: two looks (or one sure one) again
  };

  // FOIL? and NONFOIL? (owner, 2026-10-16: "tag the last card scanned as foil … edits the last card
  // scanned to be a foil instead"; "do the same for nonfoil when the settings are reversed"): its
  // copy taken off the computer's list, as Undo does, and once the computer says it's off, the card
  // sent again in the other finish, priced as that. The count of cards scanned stays.
  const swap = useRef(null);                       // { id, fields, seenUndo, was }
  const [swapping, setSwapping] = useState(null);  // the scan whose finish is being changed
  async function refinish(scan, toFoil) {
    if (swapping) return;
    const was = toFoil ? 'normal' : 'foil';
    setSwapping(scan.id);
    try {
      const card = await scry.cardById(scan.scryfall_id);
      const finish = card ? scanFinish(card, toFoil) : null;
      if (!card || finish === scan.finish || (finish === 'nonfoil') !== !toFoil) {
        say('warn', card ? `This card has no ${toFoil ? 'foil' : 'nonfoil'} printing.` : "Couldn't find that card on Scryfall.", scanText(scan));
        setSwapping(null);
        return;
      }
      const e = await undo(scan.id);
      if (e) {
        say('err', `Couldn't make it ${toFoil ? 'foil' : 'nonfoil'}: ${e}`, scanText(scan));
        setSwapping(null);
        return;
      }
      swap.current = {
        id: scan.id,
        card,
        fields: { ...cardFields(card), finish, condition: scan.condition, tier: scan.tier ?? 1 },
        seenUndo: false,
        was,
      };
      say('muted', `Making it ${toFoil ? 'foil' : 'nonfoil'}: taking the ${was} copy off ${computer}…`, scanText(scan));
      setTimeout(() => {
        if (swap.current?.id !== scan.id) return;
        swap.current = null;
        setSwapping(null);
        say('err', `${computer} didn't take the ${was} copy off: check the list there.`, scanText(scan));
      }, FOIL_GIVE_UP_MS);
    } catch (e) {
      say('err', `Couldn't change it: ${e.message}`, scanText(scan));
      setSwapping(null);
    }
  }
  const say = (tone, text, title = null) => setLocal({ tone, text, title, at: Date.now() });

  const blocked = blockedText(session);
  const needs = [...scans].reverse().find((s) => s.status === 'needs_price') ?? null;
  const latest = scans[0] ?? null;

  // +1 (owner, 2026-10-16: "adds another identical copy of the last scanned card. (So I don't have
  // to wait for the long scan now)"): the last card scanned sent again as it was (printing, finish,
  // condition), nothing read; the button by Scan card, or a tap on the middle of the picture.
  const lastCard = latest && COPYABLE.has(latest.status) ? latest : null;
  const [plusAt, setPlusAt] = useState(0);         // when +1 last showed over the picture
  async function plusOne() {
    const s = lastCard;
    if (!s || swapping) return;
    if (blocked) {
      say('warn', blocked);
      play('error');
      return;
    }
    setPlusAt(Date.now());
    const r = await send({
      scryfall_id: s.scryfall_id, name: s.name, set_code: s.set_code, collector_number: s.collector_number,
      finish: s.finish, condition: s.condition, tier: s.tier ?? 1,
    });
    if (r.error) {
      say('err', `Couldn't add another: ${SEND_MESSAGES[r.error] ?? r.error}`, scanText(s));
      play('error');
      return;
    }
    chime(s.finish);
  }
  /**
   * A tap on the picture: while it's unlocked and a card's outlined in
   * green, the view locks onto that card (owner, 2026-10-16: "Older cards
   * never initiate the crop … When this border is showing and the screen is
   * tapped instead of the normal +1, instead initiate the edge detection crop
   * on that area"); otherwise a tap on its middle half is +1.
   */
  function tapPicture(e) {
    if (!camera.on) return;
    if (!lockRef.current && seenCard) {
      lockOnSeen();
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    if (x > 0.25 && x < 0.75 && y > 0.25 && y < 0.75) plusOne();
  }

  /** Lock onto the card outlined: found again in the picture now, or where it was outlined. */
  function lockOnSeen() {
    const frame = camera.capture();
    if (!frame) return;
    const card = findCard(frame, defaultCreateCanvas) ?? seenCard;
    if (!card) return;
    setLock(lockOnCard(card, frame));
    setSeenCard(null);
  }

  // When the latest scan last changed, by this phone's clock (the database's
  // may differ from it), so the strip can tell whether its own message is newer.
  const [latestAt, setLatestAt] = useState(0);
  const latestKey = latest ? `${latest.id}:${latest.status}` : null;
  useEffect(() => {
    if (latestKey) setLatestAt(Date.now());
  }, [latestKey]);

  // FOIL? / NONFOIL?: the old copy off, the new one sent; Undo refused (the line gone, no user), nothing sent.
  useEffect(() => {
    const r = swap.current;
    const s = r && scans.find((x) => x.id === r.id);
    if (!s) return;
    if (s.status === 'undo' || s.status === 'undoing') {
      r.seenUndo = true;
    } else if (s.status === 'undone') {
      swap.current = null;
      send(r.fields).then((res) => {
        if (res.error) say('err', `Couldn't send the new copy: ${SEND_MESSAGES[res.error] ?? res.error}`);
        else chime(r.fields.finish);
        setSwapping(null);
      });
    } else if (s.status === 'added' && r.seenUndo) {
      swap.current = null;
      setSwapping(null);
      say('err', s.note ?? `${computer} couldn't take the ${r.was} copy off.`, scanText(s));
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
      // Added: no sound, the chime played when it was sent; these two are news.
      if (s.status === 'needs_price') play('needs_price');
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

  // The camera off (Stop, or the page hidden): the lock stays for when it's back, till Reset view
  // (owner, 2026-10-16: "Lock that in until reset is pressed"); only a first look's outline goes.
  useEffect(() => {
    if (camera.on) return;
    view.current.pending = null;
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
  function setLock(next) {
    lockRef.current = next;
    setLockState(next);
    view.current = { held: null, pending: null };
    setTitleMode(false);
  }

  /** One more look with no set code at the bottom; enough of them, and it's read as an older card. */
  function noLineAgain(v, art) {
    v.noLine = (v.noLine ?? 0) + 1;
    v.lineArt ??= art;
    if (!v.older && v.noLine >= OLDER_AFTER) {
      v.older = true;
      setTitleMode(true);
      say('muted', 'An older card: reading its title…');
    }
  }

  /** Back to the bottom strip: a card with a set code, or the next card. */
  function leaveOlder(v) {
    v.noLine = 0;
    v.lineArt = null;
    v.older = false;
    v.pendingOld = null;
    setTitleMode(false);
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
      // The camera's picture changed size (an iPhone switching lenses): the lock kept, scaled to it,
      // and what's held about the last card with it (owner, 2026-10-16: locked till Reset view).
      if (lock && (lock.frame.width !== frame.width || lock.frame.height !== frame.height)) {
        lock = rescaleLock(lock, frame);
        lockRef.current = lock;
        setLockState(lock);
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
      }
      // Locked, the view stays as it is till Reset view (owner, 2026-10-16: "more confident in the
      // viewport … relying on the user to press Reset if something major changes NOT moving around
      // on it's own"): nothing seen in the picture moves it.
      const v = view.current;   // (setLock, above, may have just replaced it)
      let attempts = [];
      let found = null;
      let art = null;
      // The finish the strip shows: its star (foil) or not (foilMark.js); undefined with no strip read.
      let foilSeen;
      if (lock) {
        // This card's collector line, found in its zone and set level (owner, 2026-10-16).
        const strip = straightCutout(frame, lock, defaultCreateCanvas);
        const cut = strip.canvas;
        art = artPrint(frame, lock);
        // Another card in: back to its bottom strip (the older mode was the last card's).
        if (v.lineArt && artDistance(v.lineArt, art) >= ART_CHANGED) leaveOlder(v);
        // The info box: the bottom strip, or an older card's title.
        showCutout(v.older ? titleCutout(frame, lock.card, defaultCreateCanvas) : cut);
        const outOfFocus = strip.sharpness > 0 && strip.sharpness < BLUR_BELOW;
        setBlurry(outOfFocus);
        if (!manual && v.held) {
          // The card last sent, still there: nothing to read, so a misread of it can't be sent.
          if (artDistance(v.held, art) < ART_CHANGED) return;
          v.held = null;
          v.pending = null;
          leaveOlder(v);
        }
        if (!manual && strip.sharpness === 0 && !v.older) {
          // Nothing in the strip: the holder empty, or a white-bordered older card (ink in its title).
          if (inkShare(titleCutout(frame, lock.card, defaultCreateCanvas)) > TITLE_INK) noLineAgain(v, art);
          if (!v.older) return;
        }
        if (!manual && outOfFocus) {
          // Out of focus: not read (a misread is likelier than a read). Several looks in a row,
          // the camera opened afresh so the phone's autofocus starts over (owner, 2026-10-16).
          blurryLooks.current += 1;
          if (blurryLooks.current >= REFOCUS_AFTER && Date.now() - lastRefocus.current > REFOCUS_GAP_MS) {
            blurryLooks.current = 0;
            lastRefocus.current = Date.now();
            await camera.refocus();
          }
          return;
        }
        blurryLooks.current = 0;
        // The foil star between the set code and the language, or not (owner, 2026-10-16): on Detect only.
        if (finishMode === 'detect') foilSeen = stripShowsFoil(cut);
        if (!manual && v.older) {
          // An older card: its title's read below, not the strip.
        } else {
          progress?.start('strip');
          attempts = await readPrepared(cut, pattern);
          progress?.finish('strip');
        }
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
        } else if (!v.older) {
          // What the strip names, the quick way first (resolve.js; owner, 2026-10-16).
          found = await resolveReadings(attempts, known, { pattern });
          if (found) leaveOlder(v);
          // No set code read at the bottom: once more towards the older-card mode.
          else if (!attempts.some((a) => readClues(a.text, known).sets.length)) noLineAgain(v, art);
        }
      } else {
        // Scan card before the view is locked: the whole picture, every block read.
        progress?.drop('strip');
        progress?.drop('card');
        blocks.forEach((_, i) => progress?.plan(`located-${i + 1}`, STEP_MS.ocr));
        attempts = blocks.length ? await readCollectorLine(frame, pattern, blocks, { all: true, progress }) : [];
        found = await resolveThorough(attempts.map((a) => a.text), known, { pattern, progress });
      }

      // No modern collector line: an older card, by its title (and "123/350" from 1998 on). Scan
      // card always tries it; auto scan in the older-card mode, two looks naming the same card.
      if (!found && (manual || (lock && v.older))) {
        if (manual) say('muted', 'No set code at the bottom: reading the title…');
        progress?.plan('older', STEP_MS.older);
        progress?.start('older');
        const old = await readOlderCard(frame, { texts: attempts.map((a) => a.text), card: lock?.card ?? null });
        progress?.finish('older');
        foilSeen = undefined;   // an older card, read by its title: no mark to go by
        if (!manual) {
          // Two looks must name the same card, and the same printing when one's to be taken.
          const said = old ? `${old.name}|${old.cards.length === 1 ? old.cards[0].id : ''}` : null;
          if (!old || v.pendingOld !== said) {
            v.pendingOld = said;
            return;
          }
          v.pendingOld = null;
        }
        // Two looks have named it: one printing, sent on this look.
        if (old?.cards.length === 1) found = { card: old.cards[0], tier: old.tier, sure: true };
        else if (old) {
          setPick({ ...old, art });
          say('muted', `${old.name}: pick its printing.`);
          return;
        }
      }
      if (!found) {
        if (!manual) v.pending = null;
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
      await sendCard(found.card, { tier: found.tier ?? 1, manual, art, sure: Boolean(found.sure), foilSeen });
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
   * Title (owner, 2026-10-16: "Sometimes an older card will get stuck without
   * it's name highlighted and doesn't respond to Scan Card … a way to force
   * scan card on older pre-2014 cards to actually detect and highlight the
   * name and name search open the card selection menu"): the view locked onto
   * the card outlined if it isn't yet, the info box on its title, the title
   * read and its name searched, and the printing menu opened, best match
   * first, whatever the match (the person scanning confirms it). Waits for an
   * auto look to end, as Scan card does; auto scan holds off meanwhile.
   */
  async function readTitleNow() {
    if (manualWaiting.current || reading || !camera.on) return;
    manualWaiting.current = true;
    const bar = createProgress();
    if (busy.current) bar.plan('wait', STEP_MS.ocr);
    bar.plan('older', STEP_MS.older);
    setProgress(bar);
    setReading(true);
    try {
      bar.start('wait');
      while (busy.current) await sleep(40);
      bar.finish('wait');
      busy.current = true;
      const frame = camera.capture();
      if (!frame) return;
      let lock = lockRef.current;
      if (!lock) {
        const card = findCard(frame, defaultCreateCanvas) ?? seenCard;
        if (card) {
          lock = lockOnCard(card, frame);
          setLock(lock);
          setSeenCard(null);
        }
      } else if (lock.frame.width !== frame.width || lock.frame.height !== frame.height) {
        lock = rescaleLock(lock, frame);
        lockRef.current = lock;
        setLockState(lock);
      }
      const v = view.current;
      const art = lock ? artPrint(frame, lock) : null;
      v.older = true;
      v.lineArt = art;
      v.pendingOld = null;
      setTitleMode(true);
      if (lock) showCutout(titleCutout(frame, lock.card, defaultCreateCanvas));
      say('muted', 'Reading the title…');
      bar.start('older');
      const old = await readOlderCard(frame, { card: lock?.card ?? null });
      bar.finish('older');
      if (!old) {
        say('err', "Couldn't read the title: straighten the card in the holder, then press Title again.");
        play('error');
        return;
      }
      setPick({ ...old, art });
      say('muted', `${old.name}: pick its printing.`);
    } catch (e) {
      console.error('Reading the title failed', e);
      say('err', `Couldn't read the title: ${e.message}`);
      play('error');
    } finally {
      busy.current = false;
      manualWaiting.current = false;
      bar.complete();
      await sleep(BAR_DONE_MS);
      setProgress(null);
      setReading(false);
    }
  }

  /** Number: the info box back on the bottom strip, read as a modern card's. */
  function backToNumber() {
    leaveOlder(view.current);
    say('muted', 'Reading the set code and number at the bottom.');
  }

  /**
   * Send a recognised card. Auto scan: never the card it last sent, and only
   * once two looks in a row have read this same printing, or on one look
   * when every clue on the strip agrees with it (`sure`, resolve.js isSure;
   * owner, 2026-10-16: "Let's try it with just one"). Once sent, the card's
   * art is held: nothing is read again till it changes. Its finish: Normal
   * or Foil, flat, when set; on Detect, what the strip shows (`foilSeen`:
   * the star, foil), nonfoil when there's no star or no strip to go by.
   * @param {{ tier: number, manual: boolean, art?: Float32Array|null, sure?: boolean, foilSeen?: boolean }} opts
   *   art: the card's (lock.js artPrint)
   */
  async function sendCard(card, { tier, manual, art = null, sure = false, foilSeen }) {
    const v = view.current;
    const finish = scanFinish(card, finishMode === 'foil' ? true : finishMode === 'normal' ? false : Boolean(foilSeen));
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
    chime(finish);
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
  const stripOfLatest = latest ? scanStrip(latest) : null;
  const strip = local && local.at >= latestAt ? local : stripOfLatest ?? local;
  // Before the lock: the whole picture, filling the space, the card found
  // outlined. Locked: just the card, as large as fits, still (owner, 2026-10-16).
  const picture = camera.size ? { width: camera.size.w, height: camera.size.h } : null;
  // The locked part, at the picture's size now (it may have changed since the last look).
  const part = lock && picture ? rescaleLock(lock, picture).view
    : lock?.view ?? (picture && { x: 0, y: 0, width: picture.width, height: picture.height });
  const shown = picture && room.w && room.h ? showPart(picture, part, room.w, room.h, lock ? 'contain' : 'cover') : null;
  const outline = !lock && seenCard && shown ? onScreen(shown, seenCard) : null;
  // Locked: the picture cut to the card at its sides too, not just its top and bottom (owner, 2026-10-16).
  const cut = lock && shown ? insetTo(shown, part) : null;
  const showUndo = strip === stripOfLatest && latest?.status === 'added';
  const toFoil = latest?.finish === 'nonfoil';

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
        {/* Detect: the strip's foil star decides; Normal or Foil: every card so, flat (owner, 2026-10-16). */}
        <div className="scan-seg finish" role="radiogroup" aria-label="Finish for the next scans">
          {FINISHES.map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={finishMode === mode}
              className={`scan-seg-btn${mode === 'foil' ? ' foil' : ''}${finishMode === mode ? ' on' : ''}`}
              title={mode === 'detect' ? 'Foil when the card shows the foil star (★) after its set code, else normal' : undefined}
              onClick={() => setFinishMode(mode)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* The camera takes the space that's left; notices and sheets lie over it. */}
      <div className="scan-middle" ref={middle}>
        <div className={`scan-stage${camera.on ? ' live' : ''}`} onClick={tapPicture}>
          <video
            ref={videoRef}
            className="scan-video"
            playsInline
            muted
            style={shown ? {
              left: shown.x, top: shown.y, width: shown.width, height: shown.height,
              ...(cut ? { clipPath: cut, WebkitClipPath: cut } : {}),
            } : undefined}
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
          {plusAt > 0 && <div key={plusAt} className="scan-plus-flash" aria-hidden="true">+1</div>}
        </div>
        {(blocked || camera.error) && (
          <div className={`scan-notice ${camera.error ? 'err' : 'warn'} scan-over`} role="alert">{camera.error ?? blocked}</div>
        )}
        {needs ? (
          <NeedsPriceSheet key={needs.id} scan={needs} onAnswer={(price) => answer(needs.id, price)} />
        ) : pick && (
          <PickPrintingSheet
            key={`${pick.name}:${pick.cards[0]?.id ?? ''}`}
            pick={pick}
            onPick={(card) => {
              const { tier, art } = pick;
              setPick(null);
              sendCard(card, { tier, manual: true, art: art ?? null });
            }}
            onSkip={() => {
              // Skipped: held, so auto scan doesn't ask about the card still in the holder again.
              view.current.held = pick.art ?? null;
              setPick(null);
              say('muted', 'Skipped: set it aside and add it on the computer.');
            }}
          />
        )}
      </div>

      {/* The collector corner, enlarged and cleaned, for the person scanning (owner, 2026-10-16). */}
      {/* The info box: the collector strip or an older card's title, enlarged; Title / Number
          switches it (owner, 2026-10-16). There while the camera's on, locked or not. */}
      {camera.on && (
        <div className="scan-cutout-wrap">
          <canvas
            ref={cutoutRef}
            className={`scan-cutout${blurry ? ' blurry' : ''}`}
            aria-label={titleMode ? "The card's title, enlarged" : blurry ? 'The set code and number, enlarged: out of focus' : 'The set code and number, enlarged'}
          />
          <button
            type="button"
            className="btn small scan-cutout-mode"
            disabled={reading || Boolean(needs) || Boolean(pick)}
            title={titleMode ? 'Read the set code and number at the bottom' : 'An older card: read its title and pick its printing'}
            onClick={titleMode ? backToNumber : readTitleNow}
          >
            {titleMode ? 'Number' : 'Title'}
          </button>
        </div>
      )}

      {/* The last scan and what became of it, always in view: under the info box, above Scan card,
          where the eye rests (owner, 2026-10-16). */}
      <div className={`scan-strip ${strip?.tone ?? 'muted'}`} role="status">
        <div className="scan-strip-text">
          {strip ? (
            <>
              {strip.title && <strong>{strip.title}</strong>}
              <span>{strip.text}</span>
            </>
          ) : <span>Cards you scan show here.</span>}
        </div>
        {/* Undo and FOIL? / NONFOIL?: two squares side by side at the right, the strip's height. */}
        {showUndo && (
          <div className="scan-strip-buttons">
            {/* Undo last scan (S5): one copy of it off the computer's list. */}
            <button
              type="button"
              className="btn small scan-undo"
              onClick={async () => {
                const e = await undo(latest.id);
                if (e) say('err', `Couldn't undo it: ${e}`);
              }}
            >
              <span className="sq-top">↶</span>
              <span>Undo</span>
            </button>
            {/* FOIL? on a normal card, NONFOIL? on a foil one (owner, 2026-10-16): the last card's finish changed. */}
            <button
              type="button"
              className={`btn small scan-refinish${toFoil ? ' to-foil' : ''}`}
              disabled={Boolean(swapping)}
              title={toFoil
                ? 'The last card is foil: take the normal copy off and add it as foil'
                : 'The last card is normal: take the foil copy off and add it as nonfoil'}
              onClick={() => refinish(latest, toFoil)}
            >
              <span className="sq-top">{toFoil ? '✦' : 'NON'}</span>
              <span>FOIL?</span>
            </button>
          </div>
        )}
      </div>

      {/* Scan card across the top; Auto?, Reset view, the light and Stop under it (owner, 2026-10-16). */}
      <div className="scan-actions">
        <div className="scan-now-row">
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
          <button
            type="button"
            className="btn scan-plus"
            disabled={!lastCard || Boolean(swapping)}
            title={lastCard ? `Another ${scanText(lastCard)} (or tap the middle of the picture)` : 'Scan a card first'}
            onClick={plusOne}
          >
            +1
          </button>
        </div>
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

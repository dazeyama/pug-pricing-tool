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
import { findListMark, listNumber } from './listMark.js';
import { defaultCreateCanvas } from './recognition/canvasUtil.js';
import { ocrWorker, onOcrStatus, resetOcr } from './ocr.js';
import { isTimeout, withTimeout } from '../lib/timeout.js';
import { isMuted, play, resetSounds, setMuted, unlockSounds } from './sounds.js';
import { printingsFor, readOlderCard } from './older.js';
import { isPromoStrip, resolvePromo } from './promo.js';
import { trace } from './trace.js';
import { guessName, matchName } from './nameMatch.js';
import { isDark, lightIn } from './light.js';
import { inkShare, titleCutout } from './titles.js';
import NeedsPriceSheet from './NeedsPriceSheet.jsx';
import PickPrintingSheet from './PickPrintingSheet.jsx';
import NameSheet from './NameSheet.jsx';

// Auto scan (docs/SCAN_FUNCTION.md 6.3): the rest between one look at the
// camera and the next, and the wait before the first.
const REST_MS = 300;
// Idle (owner, 2026-10-19: "fix", to "Auto scan never slows down"; decision 304): after this long with
// nothing new in the holder (no card found, the art unchanged, no button pressed), a look a second
// instead, to spare the battery and the heat; anything new and it's back to REST_MS.
const IDLE_AFTER_MS = 30_000;
const IDLE_REST_MS = 1_000;
// Too dark (decision 306): this many dark looks in a row and the strip suggests more light.
const DARK_AFTER = 4;
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
// The view found again every so many cards (owner, 2026-10-19: "As the stack gets taller it gets
// closer in and the old crop loses its accuracy. Quietly resetting and re-cropping will help";
// decision 312): after this many cards sent with one lock, the next looks find the card's edges again
// and lock onto it afresh; the old lock stays till a new one's found, and after this many looks
// without one it's kept till the next round.
const RELOCK_EVERY = 20;
const RELOCK_TRIES = 10;
// Which card? (decision 311): this many title reads in a row naming nothing, on the same card, and
// auto scan stops trying and asks for the name.
const UNREAD_AFTER = 3;
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
// Unstuck (owner, 2026-10-18: "it kept getting stuck on 'Reading...' after hitting Scan Card"):
// no look runs longer than this; whatever it waits on (Scryfall, the computer, the card
// reader), it's given up and says so. Scan card's slowest honest run, timed from its steps on
// 2026-10-18: four reads (1 s each on a phone), the lookups (0.3 s), about four searches (550 ms
// apart, 1 s each) and an older card's title (about 5 s): some 15 s, so 20 s. An auto look:
// one read, a lookup and two searches, about 4 s, so 10 s (every limit rounded up to 5 s).
const MANUAL_DEADLINE_MS = 20_000;
const AUTO_DEADLINE_MS = 10_000;
// Reading… can be tapped to stop once it's run this long.
const STOPPABLE_AFTER_MS = 3_000;
// Holding Scan card this long starts over: the reader started afresh, what auto scan held forgotten.
const LONG_PRESS_MS = 700;
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
  timeout: "No answer from the computer after three tries: check its list before scanning this card again.",
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
// A scan still "sending…" or "pricing…" this long after the phone first saw it waiting says so
// (owner, 2026-10-19; decision 307). Timed on the phone's own clock, from when it first saw it.
const STILL_WAITING_MS = 15_000;

function scanStrip(s, { waited = 0, computer = 'the computer' } = {}) {
  const mark = s.finish === 'foil' ? ' *F*' : s.finish === 'etched' ? ' *E*' : '';
  const cond = s.condition && s.condition !== 'NM' ? ` [${s.condition}]` : '';
  const code = `${String(s.set_code ?? '').toUpperCase()} ${s.collector_number ?? ''}`.trim() + mark + cond;
  const name = s.name ?? '';
  const facts = (...more) => [code, ...more].filter(Boolean).join(' · ');
  switch (s.status) {
    case 'sent': return waited > STILL_WAITING_MS
      ? { tone: 'warn', title: name, text: facts(`still waiting on ${computer}: is its price screen open?`) }
      : { tone: 'muted', title: name, text: facts('sending…') };
    case 'pricing': return waited > STILL_WAITING_MS
      ? { tone: 'warn', title: name, text: facts(`${computer} is still pricing it…`) }
      : { tone: 'muted', title: name, text: facts('pricing…') };
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
  // Which card? (decision 311): a title no read could name, its name to type: { guess, frame, card,
  // listMark, texts, art }.
  const [nameAsk, setNameAsk] = useState(null);
  // The info box on the card's title (the older-card mode, by itself or by Title), for the
  // Title / Number button's label.
  const [titleMode, setTitleMode] = useState(false);
  const { offline } = useConnection();
  const busy = useRef(false);
  // Cards sent with this lock, whether it's due to be found again, and the looks spent trying (decision 312).
  const sinceLock = useRef(0);
  const relockDue = useRef(false);
  const relockTries = useRef(0);
  // The art of the card a failed strip last asked a re-crop for (decision 317): one ask a card.
  const lineRelockArt = useRef(null);
  // The last time anything new was in the holder or a button was pressed (decision 304).
  const lastActive = useRef(Date.now());
  // Dark looks in a row (decision 306), and whether the last picture was too dark.
  const darkLooks = useRef(0);
  const lastDark = useRef(false);
  const markActive = () => {
    lastActive.current = Date.now();
  };
  // Each look's ticket (scanFrame), and each Scan card / Title press's: a look or press given up
  // (too long, or Stop) leaves the screen to the next one.
  const scanTicket = useRef(0);
  const readRun = useRef(0);
  // Reading… tappable as Stop, once it's run a few seconds; a long press on Scan card under way.
  const [stoppable, setStoppable] = useState(false);
  const pressTimer = useRef(null);
  const longPressed = useRef(false);
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
    trace('refinish', { name: scan.name, set: scan.set_code, number: scan.collector_number, toFoil });
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
  /** A message about the camera (decision 303): cleared when the camera's back. */
  const sayCamera = (tone, text) => setLocal({ tone, text, title: null, at: Date.now(), camera: true });
  /** What more light would take: the torch, where there is one and it's off. */
  const lightTip = () => (camera.torch === false ? 'tap 💡 for the light' : 'more light on the card helps');
  /**
   * Note a look's light (owner, 2026-10-19: "fix", to "No hint in dim light"; decision 306): after
   * DARK_AFTER dark looks in a row the strip says so, once; it goes when the light's back.
   */
  function noteLight(dark) {
    lastDark.current = dark;
    if (dark) {
      darkLooks.current += 1;
      if (darkLooks.current === DARK_AFTER) {
        trace('dark');
        setLocal({ tone: 'warn', text: `Too dark to read well: ${lightTip()}.`, title: null, at: Date.now(), light: true });
      }
    } else {
      if (darkLooks.current >= DARK_AFTER) setLocal((l) => (l?.light ? null : l));
      darkLooks.current = 0;
    }
  }

  const blocked = blockedText(session);
  const needs = [...scans].reverse().find((s) => s.status === 'needs_price') ?? null;
  const latest = scans[0] ?? null;

  // +1 (owner, 2026-10-16: "adds another identical copy of the last scanned card. (So I don't have
  // to wait for the long scan now)"): the last card scanned sent again as it was (printing, finish,
  // condition), nothing read; the button by Scan card, or a tap on the middle of the picture.
  const lastCard = latest && COPYABLE.has(latest.status) ? latest : null;
  const [plusAt, setPlusAt] = useState(0);         // when +1 last showed over the picture
  async function plusOne() {
    markActive();
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
    trace('sent', { via: 'plus-one', name: s.name, set: s.set_code, number: s.collector_number, finish: s.finish, condition: s.condition });
    noteSent();   // another copy laid on the stack too
  }
  /**
   * A tap on the picture: while it's unlocked and a card's outlined in
   * green, the view locks onto that card (owner, 2026-10-16: "Older cards
   * never initiate the crop … When this border is showing and the screen is
   * tapped instead of the normal +1, instead initiate the edge detection crop
   * on that area"); otherwise a tap on its middle half is +1.
   */
  function tapPicture(e) {
    markActive();
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
    markActive();
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
    sinceLock.current = 0;
    relockDue.current = false;
    relockTries.current = 0;
  }

  /** A card sent (decision 312): RELOCK_EVERY with one lock, and the view's due to be found again. */
  function noteSent() {
    sinceLock.current += 1;
    if (lockRef.current && sinceLock.current >= RELOCK_EVERY) relockDue.current = true;
  }

  /** One more look with no set code at the bottom; enough of them, and it's read as an older card. */
  function noLineAgain(v, art) {
    v.noLine = (v.noLine ?? 0) + 1;
    v.lineArt ??= art;
    // A card whose strip names no set: the view found again first (decision 317), once a card, before
    // it's taken for an older one: as the stack grows the card comes closer and the lock's outline,
    // and the strip's zone with it, drift off it. Two looks to find it, then on as before.
    if (v.noLine === 1 && lockRef.current && (!lineRelockArt.current || artDistance(lineRelockArt.current, art) >= ART_CHANGED)) {
      lineRelockArt.current = art;
      relockDue.current = true;
      relockTries.current = RELOCK_TRIES - 2;
      trace('relock-asked', { why: 'no set code' });
    }
    if (!v.older && v.noLine >= OLDER_AFTER) {
      v.older = true;
      setTitleMode(true);
      trace('older-mode');
      say('muted', 'An older card: reading its title…');
    }
  }

  /** Back to the bottom strip: a card with a set code, or the next card. */
  function leaveOlder(v) {
    v.unread = 0;
    v.noLine = 0;
    v.lineArt = null;
    v.older = false;
    v.pendingOld = null;
    setTitleMode(false);
  }

  /** Reset view: unlocked, and the next card found locks it again. */
  function resetView() {
    markActive();
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
    if (needs || pick || nameAsk) {
      if (manual) say('warn', needs ? 'Answer the card that needs a price first.' : pick ? 'Pick the printing first.' : 'Type the card\'s name first.');
      return;
    }
    busy.current = true;
    // This look's ticket: given up (too long, or Stop), it does nothing more if it ever ends.
    const ticket = ++scanTicket.current;
    const stale = () => scanTicket.current !== ticket;
    if (manual) say('muted', 'Reading…');
    const lookAt = Date.now();
    // How this look found its card, for the run log (trace.js).
    let via = null;
    const lookOnce = async () => {
      const frame = camera.capture();
      if (!frame) {
        if (manual) say('warn', "The camera isn't ready yet: press Scan card again.");
        return;
      }
      noteLight(isDark(lightIn(frame, lockRef.current?.view ?? null)));
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
      // Due to be found again (decision 312): the card's edges looked for afresh, quietly; locked onto
      // when found (by its collector line, or, an older card, by its edges alone), what's held about
      // the card last sent kept, so it isn't sent again. Not found: the old lock stays, tried again
      // on the next looks, RELOCK_TRIES at most.
      if (lock && !manual && relockDue.current) {
        const card = findCard(frame, defaultCreateCanvas);
        const anchor = card ? anchorBlock(locate(frame)) : null;
        const anchored = Boolean(anchor && blockOnCard(anchor, card));
        // Locked again only on a card whose collector line is where a card's is, as the first lock
        // (decision 314: an outline round the holder's floor, an empty holder's, isn't a card); an
        // older card, with no line, by its edges alone in the older-card mode.
        const next = !card ? null : anchored ? makeLock(card, anchor, frame) : view.current.older ? lockOnCard(card, frame) : null;
        if (next) {
          trace('relock', { anchor: anchored, tries: relockTries.current });
          const kept = { held: view.current.held, lastArt: view.current.lastArt, older: view.current.older };
          lock = next;
          setLock(lock);
          Object.assign(view.current, kept);
          if (kept.older) setTitleMode(true);
        } else if (++relockTries.current >= RELOCK_TRIES) {
          relockDue.current = false;
          relockTries.current = 0;
          sinceLock.current = 0;
        }
      }
      let blocks = null;
      if (!lock) {
        const card = findCard(frame, defaultCreateCanvas);
        if (card) markActive();
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
      // The List's mark at the card's corner (listMark.js), when the view's locked.
      let listSeen = null;
      if (lock) {
        // This card's collector line, found in its zone and set level (owner, 2026-10-16).
        const strip = straightCutout(frame, lock, defaultCreateCanvas);
        const cut = strip.canvas;
        art = artPrint(frame, lock);
        // Something new in the holder since the last look (decision 304): not idle.
        if (!v.lastArt || artDistance(v.lastArt, art) >= ART_CHANGED) markActive();
        v.lastArt = art;
        listSeen = findListMark(frame, lock.card, defaultCreateCanvas).mark;
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
            trace('refocus');
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
          via = 'scan-card';
        } else if (!v.older) {
          // What the strip names, the quick way first (resolve.js; owner, 2026-10-16).
          found = await resolveReadings(attempts, known, { pattern });
          via = found?.quick ? 'strip-quick' : 'strip-search';
          if (found) leaveOlder(v);
          // No set code read at the bottom: once more towards the older-card mode.
          // A promo's PRM counts as a set read (decision 313): it's no older card.
          else if (!attempts.some((a) => readClues(a.text, known).sets.length || isPromoStrip(a.text))) noLineAgain(v, art);
        }
      } else {
        // Scan card before the view is locked: the whole picture, every block read.
        progress?.drop('strip');
        progress?.drop('card');
        blocks.forEach((_, i) => progress?.plan(`located-${i + 1}`, STEP_MS.ocr));
        attempts = blocks.length ? await readCollectorLine(frame, pattern, blocks, { all: true, progress }) : [];
        found = await resolveThorough(attempts.map((a) => a.text), known, { pattern, progress });
        via = 'scan-card-unlocked';
      }

      // A promo printing PRM for its set (decision 313): its main set found by the size read
      // ("100/196"), and its promo printings of that number; one taken, several to pick from (the
      // stamp tells them apart).
      if (!found && attempts.some((a) => isPromoStrip(a.text))) {
        const promo = await resolvePromo(attempts.map((a) => a.text));
        if (stale()) return;
        if (promo?.cards.length === 1) {
          found = { card: promo.cards[0], tier: 1, sure: true };
          via = 'promo';
        } else if (promo) {
          trace('pick-open', { via: 'pick-promo', name: promo.name, count: promo.cards.length, manual });
          setPick({ tier: 1, name: promo.name, cards: promo.cards, all: promo.all, art, foilSeen, hint: 'A promo: match the stamp.', via: 'pick-promo' });
          say('muted', `${promo.name}: a promo, pick which one.`);
          return;
        }
      }

      // No modern collector line: an older card, by its title (and "123/350" from 1998 on). Scan
      // card always tries it; auto scan in the older-card mode, two looks naming the same card.
      if (!found && (manual || (lock && v.older))) {
        if (manual) say('muted', 'No set code at the bottom: reading the title…');
        progress?.plan('older', STEP_MS.older);
        progress?.start('older');
        const read = await readOlderCard(frame, { texts: attempts.map((a) => a.text), card: lock?.card ?? null, listMark: listSeen });
        progress?.finish('older');
        if (stale()) return;
        foilSeen = undefined;   // an older card, read by its title: no mark to go by
        // No read could name it (decision 311): Scan card asks for the name at once; auto scan after
        // UNREAD_AFTER such looks in a row on this card, instead of trying for ever.
        if (read && !read.name) {
          trace('title-unread', { manual, guess: read.guess, ms: Date.now() - lookAt });
          v.unread = (v.unread ?? 0) + 1;
          if (manual || v.unread >= UNREAD_AFTER) {
            v.unread = 0;
            v.pendingOld = null;
            askName({ guess: read.guess, frame, card: lock?.card ?? null, listMark: listSeen, texts: attempts.map((a) => a.text), art, from: manual ? 'scan-card' : 'auto' });
          }
          return;
        }
        v.unread = 0;
        const old = read;
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
        if (old?.cards.length === 1) {
          found = { card: old.cards[0], tier: old.tier, sure: true };
          via = `title-${old.how}-${old.tier === 2 ? 'number' : 'look'}`;
        } else if (old) {
          trace('pick-open', { via: `pick-title-${old.how}`, name: old.name, count: old.cards.length, manual });
          setPick({ ...old, art, via: `pick-title-${old.how}` });
          say('muted', `${old.name}: pick its printing.`);
          return;
        }
      }
      if (stale()) return;
      if (!found) {
        if (!manual) v.pending = null;
        trace('no-card', { manual, dark: lastDark.current, ms: Date.now() - lookAt, strip: attempts[0]?.text?.slice(0, 80) ?? null });
        if (manual) {
          say('err', lastDark.current
            ? `Couldn't read this card: it's too dark. ${lightTip()[0].toUpperCase()}${lightTip().slice(1)}, then press Scan card again.`
            : "Couldn't read this card: set it aside and add it on the computer.");
          play('error');
        }
        return;
      }
      if (found.foreign) {
        trace('foreign', { manual, lang: found.foreign });
        say('warn', `Not English (${found.foreign}): add it on the computer.`);
        if (manual) play('error');
        return;
      }
      // The List's mark on a card read by its strip: the List's printing of that set and number
      // ("A25-50"), when Scryfall has one (owner, 2026-10-16: "make sure that list and mystery
      // booster cards have 100% accuracy like the rest").
      if (listSeen && !found.tier) {
        const listed = await scry.cardBySetNumber('plst', listNumber(found.card)).catch(() => null);
        if (listed) {
          found = { ...found, card: listed };
          via = `${via ?? 'strip'}+list`;
        }
      }
      if (stale()) return;
      progress?.start('send');
      await sendCard(found.card, { tier: found.tier ?? 1, manual, art, sure: Boolean(found.sure), foilSeen, via, lookMs: Date.now() - lookAt });
      progress?.finish('send');
    };
    try {
      await withTimeout(lookOnce(), manual ? MANUAL_DEADLINE_MS : AUTO_DEADLINE_MS);
    } catch (e) {
      if (stale()) return;   // stopped meanwhile: the screen is the next read's
      if (isTimeout(e)) {
        // Too long (owner, 2026-10-18: stuck on "Reading…" on a slow network): given up, so the
        // next look or press isn't held behind it.
        trace('timeout', { manual, ms: Date.now() - lookAt });
        scanTicket.current += 1;
        busy.current = false;
        if (manual) {
          say('err', 'That took too long: the connection may be slow. Press Scan card to try again.');
          play('error');
        } else {
          view.current.pending = null;
        }
        return;
      }
      console.error('Scan failed', e);
      trace('error', { manual, message: String(e?.message ?? e).slice(0, 120) });
      if (manual) {
        say('err', `Couldn't read it: ${e.message}`);
        play('error');
      }
    } finally {
      if (!stale()) busy.current = false;
    }
  }

  /**
   * Scan card: the thorough read with its loading bar. Pressed during an
   * auto look, it waits for the look to end (auto scan holding off).
   */
  async function scanCard() {
    markActive();
    if (manualWaiting.current || reading) return;
    trace('scan-card-press');
    const run = ++readRun.current;
    manualWaiting.current = true;   // auto scan holds off till Scan card is done: nothing interrupts it
    const bar = createProgress();
    // The work as expected; each step re-planned as it's known (the blocks found, the searches asked).
    if (busy.current) bar.plan('wait', STEP_MS.ocr);
    bar.plan('strip', STEP_MS.ocr);
    bar.plan('card', 2 * STEP_MS.ocr);
    bar.plan('resolve', STEP_MS.lookup + 2 * STEP_MS.search);
    bar.plan('send', STEP_MS.send);
    setProgress(bar);
    setStoppable(false);
    setReading(true);
    try {
      bar.start('wait');
      while (busy.current && readRun.current === run) await sleep(40);
      bar.finish('wait');
      if (readRun.current !== run) return;
      await scanFrame({ manual: true, progress: bar });
    } finally {
      // Stopped meanwhile: Stop has put the screen right, and a new press may be under way.
      if (readRun.current === run) {
        manualWaiting.current = false;
        bar.complete();
        await sleep(BAR_DONE_MS);
        if (readRun.current === run) endReading();
      }
    }
  }

  /** The press is over: Scan card and its label as they were. */
  function endReading() {
    setProgress(null);
    setReading(false);
    setStoppable(false);
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
    trace('title-press');
    const run = ++readRun.current;
    manualWaiting.current = true;
    const bar = createProgress();
    if (busy.current) bar.plan('wait', STEP_MS.ocr);
    bar.plan('older', STEP_MS.older);
    setProgress(bar);
    setStoppable(false);
    setReading(true);
    let ticket = null;
    try {
      bar.start('wait');
      while (busy.current && readRun.current === run) await sleep(40);
      bar.finish('wait');
      if (readRun.current !== run) return;
      busy.current = true;
      ticket = ++scanTicket.current;
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
      const listMark = lock ? findListMark(frame, lock.card, defaultCreateCanvas).mark : null;
      const old = await withTimeout(readOlderCard(frame, { card: lock?.card ?? null, listMark }), MANUAL_DEADLINE_MS);
      bar.finish('older');
      if (scanTicket.current !== ticket) return;
      if (old && !old.name) {
        // No read could name it (decision 311): its name to type.
        askName({ guess: old.guess, frame, card: lock?.card ?? null, listMark, texts: [], art, from: 'title' });
        return;
      }
      if (!old) {
        say('err', "Couldn't read the title: straighten the card in the holder, then press Title again.");
        play('error');
        return;
      }
      trace('pick-open', { via: `pick-title-press-${old.how}`, name: old.name, count: old.cards.length, manual: true });
      setPick({ ...old, art, via: `pick-title-press-${old.how}` });
      say('muted', `${old.name}: pick its printing.`);
    } catch (e) {
      if (readRun.current !== run || (ticket != null && scanTicket.current !== ticket)) return;
      if (isTimeout(e)) {
        scanTicket.current += 1;   // the read, if it ever ends, does nothing
        say('err', 'Reading the title took too long: the connection may be slow. Press Title to try again.');
      } else {
        console.error('Reading the title failed', e);
        say('err', `Couldn't read the title: ${e.message}`);
      }
      play('error');
    } finally {
      if (readRun.current === run) {
        busy.current = false;
        manualWaiting.current = false;
        bar.complete();
        await sleep(BAR_DONE_MS);
        if (readRun.current === run) endReading();
      }
    }
  }

  /**
   * Stop (owner, 2026-10-18: "we need more things you can do to get it
   * unstuck"): Reading…, tapped once it's run a few seconds, gives up the read
   * under way; whatever it was waiting on, it does nothing more if it ever
   * ends. The card reader starts afresh (a stuck read can't hold the next
   * one), and what auto scan held about the last card is forgotten, so the
   * card in the holder is read again, even the same card.
   */
  function stopReading(text = 'Stopped. Press Scan card to read it again.') {
    trace(text ? 'stop' : 'start-over');
    readRun.current += 1;
    scanTicket.current += 1;
    busy.current = false;
    manualWaiting.current = false;
    resetOcr();
    const v = view.current;
    v.held = null;
    v.pending = null;
    v.pendingOld = null;
    endReading();
    if (text) say('muted', text);
  }

  /**
   * Stop (owner, 2026-10-19: "The stop button on the phone should cut off the camera faster than it
   * does, as an abort button, do what needs to be done to stop the camera immediately"; decision
   * 321): the camera shut at once (and any opening under way cancelled, camera.js), the look and any
   * Scan card read under way given up, and the card reader stopped, so nothing works on behind it.
   * The lock stays for when the camera's back (Reset view unlocks), as before.
   */
  function abortCamera() {
    camera.stop();
    readRun.current += 1;
    scanTicket.current += 1;
    busy.current = false;
    manualWaiting.current = false;
    relockDue.current = false;
    resetOcr();
    endReading();
    trace('stop-camera');
  }

  /**
   * Hold Scan card (owner, 2026-10-18: "a button or some gesture that helps
   * it get unstuck" when a card in plain view won't read): start over, as
   * Stop does, and read the card in front now. The view stays locked
   * (Reset view unlocks it).
   */
  function startOver() {
    stopReading(null);
    navigator.vibrate?.(40);
    scanCard();
  }

  /** Which card? (decision 311): the box opened, the reader's closest name in it. */
  function askName(ask) {
    trace('name-ask', { from: ask.from ?? null, guess: ask.guess });
    setNameAsk(ask);
    say('warn', lastDark.current
      ? `Couldn't read the name: it's too dark (${lightTip()}). Type it below, or skip the card.`
      : "Couldn't read the name: type it below, or skip the card.");
    play('error');
  }

  /**
   * The typed name (decision 311): the card of that name (exactly, else the
   * clear match, else the closest), its printings found and ranked by the
   * photo taken when the box opened, and the printing list opened. An error
   * to show in the box, or null.
   */
  async function nameTyped(typed) {
    const ask = nameAsk;
    if (!ask) return null;
    try {
      const names = await scry.loadNames();
      const lower = typed.toLowerCase();
      const name = names.find((n) => n.toLowerCase() === lower)
        ?? matchName(typed, names)?.name ?? guessName([typed], names)?.name ?? null;
      if (!name) return 'No card by that name: check the spelling.';
      const old = await withTimeout(printingsFor(name, ask.frame, { texts: ask.texts, card: ask.card, listMark: ask.listMark }), MANUAL_DEADLINE_MS);
      if (!old) return `Scryfall has no printing of ${name}.`;
      trace('name-typed', { typed, name, guessed: typed === ask.guess, count: old.cards.length });
      setNameAsk(null);
      setPick({ ...old, art: ask.art, via: 'pick-name' });
      say('muted', `${old.name}: pick its printing.`);
      return null;
    } catch (e) {
      return isTimeout(e) ? 'That took too long: the connection may be slow. Try again.' : `Couldn't find it: ${e.message}`;
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
  async function sendCard(card, { tier, manual, art = null, sure = false, foilSeen, via = null, lookMs = null }) {
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
    const sentAt = Date.now();
    const r = await send({ ...cardFields(card), finish, condition, tier });
    if (r.error) {
      trace('send-error', { error: r.error, via, name: card.name });
      say('err', SEND_MESSAGES[r.error] ?? `Couldn't send it: ${r.error}`);
      play('error');
      check();
      return;
    }
    chime(finish);
    trace('sent', {
      via: via ?? (manual ? 'scan-card' : 'auto'), tier, manual, sure, name: card.name,
      set: String(card.set).toUpperCase(), number: card.collector_number, finish, condition,
      lookMs, sendMs: Date.now() - sentAt, sinceLock: sinceLock.current + 1,
    });
    lastSent.current = key;
    v.held = art;
    setLocal(null);
    noteSent();
  }

  // The camera cut off (decision 303): said on the strip while the phone has it, or while it starts again.
  const interrupted = camera.interrupted;
  useEffect(() => {
    if (interrupted) trace('camera', { state: interrupted });
    if (interrupted === 'paused') sayCamera('warn', 'The phone has taken the camera (a call?): scanning carries on when it gives it back.');
    else if (interrupted === 'restarting') sayCamera('warn', 'The camera stopped: starting it again…');
    else setLocal((l) => (l?.camera ? null : l));
  }, [interrupted]);

  // When the phone first saw the latest scan waiting ("sending…" or "pricing…"), and a clock ticking
  // while it waits, for "still waiting" (decision 307).
  const latestWaiting = latest && ['sent', 'pricing'].includes(latest.status) ? `${latest.id}:${latest.status}` : null;
  const [waitingSince, setWaitingSince] = useState(null);
  const [clock, setClock] = useState(() => Date.now());
  const [waitingKey, setWaitingKey] = useState(null);
  if (latestWaiting !== waitingKey) {
    // A new wait (or none): timed from now (React's "adjust state when a prop changes" pattern).
    setWaitingKey(latestWaiting);
    setWaitingSince(latestWaiting ? Date.now() : null);
  }
  useEffect(() => {
    if (!latestWaiting) return undefined;
    const timer = setInterval(() => setClock(Date.now()), 2_000);
    return () => clearInterval(timer);
  }, [latestWaiting]);

  // The camera's picture came back (opened again, refocused, restarted, unpaused; decision 314): it may
  // be another lens or framing, so the lock, scaled to the new picture, may no longer fit the card. The
  // next look finds the card again (the re-crop of decision 312).
  const opened = camera.opened;
  useEffect(() => {
    if (!opened || !lockRef.current) return;
    relockDue.current = true;
    relockTries.current = 0;
    trace('camera-reopened', { opened });
  }, [opened]);

  // Any tap on the screen starts the audio again if the phone stopped it (decision 315): a tap is
  // what a phone needs to allow sound, and the camera starting or pausing stops it on an iPhone.
  useEffect(() => {
    const wake = () => unlockSounds();
    document.addEventListener('pointerdown', wake, { passive: true });
    return () => document.removeEventListener('pointerdown', wake);
  }, []);

  // Reading… becomes tappable (Stop) once a press has run a few seconds.
  useEffect(() => {
    if (!reading) return undefined;
    const timer = setTimeout(() => setStoppable(true), STOPPABLE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [reading]);

  // Auto scan (6.3): while the camera runs, look again and again, resting
  // between looks; paused while the computer can't take cards, a card needs
  // a price, the connection is down, Scan card is reading (from the press
  // to the end), "Auto?" is unticked, or the page is hidden. It doesn't wait for the computer to price the last card (owner,
  // 2026-10-16: "the computer can load prices on it's own time while we
  // scan more cards"): the computer takes them in the order sent. Stop ends
  // it with the camera.
  const auto = useRef(null);
  auto.current = {
    scanFrame,
    paused: !autoOn || Boolean(blocked) || Boolean(needs) || Boolean(pick) || Boolean(nameAsk) || offline
      || Boolean(camera.interrupted),
  };
  useEffect(() => {
    if (!camera.on) return undefined;
    let alive = true;
    let timer;
    const look = async () => {
      if (!alive) return;
      if (!auto.current.paused && !manualWaiting.current && !busy.current && document.visibilityState === 'visible') {
        await auto.current.scanFrame({ manual: false });
      }
      const idle = Date.now() - lastActive.current > IDLE_AFTER_MS;
      if (alive) timer = setTimeout(look, view.current.pending ? CONFIRM_MS : idle ? IDLE_REST_MS : REST_MS);
    };
    timer = setTimeout(look, FIRST_LOOK_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [camera.on]);

  // The strip: the phone's own message, or the latest scan's state, whichever is newer.
  const stripOfLatest = latest
    ? scanStrip(latest, { waited: waitingSince ? clock - waitingSince : 0, computer })
    : null;
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
          title={muted ? 'Sounds off: tap to turn them on (and start the sound afresh)' : 'Sounds on: tap to mute'}
          onClick={() => {
            setMuted(!muted);
            setMutedState(!muted);
            // Turned on: the sound started afresh, whatever had stopped it, and a chime to show it's back
            // (decision 318). Off, then on again, is the way to fix silent chimes.
            if (muted) {
              resetSounds();
              play('added');
            }
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
              const { tier, art, foilSeen } = pick;
              trace('pick-chosen', { via: pick.via ?? 'pick', name: card.name, rank: pick.cards.findIndex((c) => c.id === card.id) });
              setPick(null);
              // A promo's strip showed its foil star or not (decision 313); an older card's has none.
              sendCard(card, { tier, manual: true, art: art ?? null, foilSeen, via: pick.via ?? 'pick' });
            }}
            onSkip={() => {
              // Skipped: held, so auto scan doesn't ask about the card still in the holder again.
              trace('pick-skip', { via: pick.via ?? 'pick', name: pick.name });
              view.current.held = pick.art ?? null;
              setPick(null);
              say('muted', 'Skipped: set it aside and add it on the computer.');
            }}
          />
        )}
        {!needs && !pick && nameAsk && (
          <NameSheet
            key={nameAsk.guess ?? ''}
            guess={nameAsk.guess}
            onSubmit={nameTyped}
            onSkip={() => {
              // Skipped: held, as a skipped printing list is, so auto scan leaves this card be.
              trace('name-skip', { guess: nameAsk.guess });
              view.current.held = nameAsk.art ?? null;
              setNameAsk(null);
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
            disabled={reading || Boolean(needs) || Boolean(pick) || Boolean(nameAsk)}
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
                trace('undo', { name: latest.name, set: latest.set_code, number: latest.collector_number, status: latest.status });
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
          {/* Scan card; while reading, after a few seconds, tap to stop (owner, 2026-10-18); held,
              start over and read now. */}
          <button
            type="button"
            className={`btn primary scan-now${reading ? ' reading' : ''}${reading && stoppable ? ' stoppable' : ''}`}
            disabled={!camera.on || (reading ? !stoppable : Boolean(needs) || Boolean(pick) || Boolean(nameAsk))}
            aria-busy={reading}
            title={reading ? (stoppable ? 'Stop this read and start the reader afresh' : undefined) : 'Read the card. Hold to start over.'}
            onPointerDown={() => {
              longPressed.current = false;
              clearTimeout(pressTimer.current);
              if (reading || needs || pick || nameAsk) return;
              pressTimer.current = setTimeout(() => {
                longPressed.current = true;
                startOver();
              }, LONG_PRESS_MS);
            }}
            onPointerUp={() => clearTimeout(pressTimer.current)}
            onPointerLeave={() => clearTimeout(pressTimer.current)}
            onPointerCancel={() => clearTimeout(pressTimer.current)}
            onContextMenu={(e) => e.preventDefault()}
            onClick={() => {
              if (longPressed.current) {
                longPressed.current = false;
                return;
              }
              if (reading) stopReading();
              else scanCard();
            }}
          >
            {progress && <ScanBar progress={progress} />}
            <span className="scan-now-label">
              {reading ? (stoppable ? 'Reading… tap to stop' : 'Reading…') : 'Scan card'}
            </span>
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
          {/* An abort (owner, 2026-10-19; decision 321): on the touch itself, not the lift. */}
          <button
            type="button"
            className="btn scan-stop"
            disabled={!camera.on}
            onPointerDown={(e) => {
              e.preventDefault();
              abortCamera();
            }}
            onClick={() => {
              if (camera.on) abortCamera();
            }}
          >
            ■ Stop
          </button>
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

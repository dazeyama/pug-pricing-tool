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
import { CANDIDATES, readClues, resolveReadings, resolveThorough } from './resolve.js';
import { STEP_MS, createProgress } from './progress.js';
import { findCard } from './cardEdges.js';
import {
  ART_CHANGED, anchorBlock, artDistance, artPrint, blockOnCard, cropTo, lockOnCard, makeLock, rescaleLock,
} from './lock.js';
import { straightCutout } from './straighten.js';
import { stripShowsFoil } from './foilMark.js';
import { findListMark, listNumber } from './listMark.js';
import { defaultCreateCanvas } from './recognition/canvasUtil.js';
import { ocrWorker, onOcrStatus, readTitleText, resetOcr } from './ocr.js';
import { isTimeout, TimeoutError, withTimeout } from '../lib/timeout.js';
import { uuid } from '../lib/uuid.js';
import { isMuted, play, resetSounds, setMuted, unlockSounds } from './sounds.js';
import { printingsFor, readOlderCard, readTitleName, titleAmong } from './older.js';
import { cardNamed, isFnmStrip, isPromoStrip, resolveFnm, resolvePromo } from './promo.js';
import { trace } from './trace.js';
import { guessName, matchName } from './nameMatch.js';
import { isDark, lightIn } from './light.js';
import { inkShare, nameCutout, titleCutout } from './titles.js';
import NeedsPriceSheet from './NeedsPriceSheet.jsx';
import PickPrintingSheet from './PickPrintingSheet.jsx';
import NameSheet from './NameSheet.jsx';

// Auto scan (docs/SCAN_FUNCTION.md 6.3): the rest between one look at the
// camera and the next, and the wait before the first. 0.1 s (decision 550; was 0.3 s): a new card is
// seen moving, then settled, two looks before it's read, so the rest came twice before every card.
const REST_MS = 100;
// Idle (owner, 2026-10-18: "fix", to "Auto scan never slows down"; decision 304): after this long with
// nothing new in the holder (no card found, the art unchanged, no button pressed), a look a second
// instead, to spare the battery and the heat; anything new and it's back to REST_MS.
const IDLE_AFTER_MS = 30_000;
const IDLE_REST_MS = 1_000;
// Too dark (decision 306): this many dark looks in a row and the strip suggests more light.
const DARK_AFTER = 4;
/** A first read waiting for the second look that must agree: taken straight away, not after a rest. */
const CONFIRM_MS = 50;
// The first look as soon as the camera's on (decision 550; was 0.8 s): a look with no picture yet does nothing.
const FIRST_LOOK_MS = 0;
// Older cards (tiers 2 and 3, 6.2) are read by their title. Auto scan
// takes a card for an older one after this many looks in a row with no set
// code at its bottom (owner, 2026-10-16: "When it's detected that it's
// changing very rapidly like this shift to 2014 mode and focus the info box
// on the card name instead, resetting to the normal bottom position upon
// the next card"); then it reads the title once (decision 550): one printing
// is sent, several open the printing list. A blank strip with ink in the title
// is an older card at once (decision 550), with no looks to count.
const OLDER_AFTER = 3;
// Scan card reads at most this many blocks found on the card, besides its strip (decision 550; was every one
// found, three at most): each read is about 0.3 s, and the card has 3 s.
const SCAN_CARD_BLOCKS = 2;
// The view found again every so many cards (owner, 2026-10-18: "As the stack gets taller it gets
// closer in and the old crop loses its accuracy. Quietly resetting and re-cropping will help";
// decision 312): after this many cards sent with one lock, the next looks find the card's edges again
// and lock onto it afresh; the old lock stays till a new one's found, and after this many looks
// without one it's kept till the next round.
const RELOCK_EVERY = 20;
// Cards laid since the camera started before the stack's too tall (decision 331): a note to empty
// the holder, again each this many more if it's hidden.
const TALL_STACK = 100;
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
// A card's time (owner, 2026-10-26, after a demo at work: "a full time limit of 3s to force a choice
// to be made"; decision 549; was 10 s a look on auto scan and 20 s for Scan card): 3 s from the first
// settled look at a card on auto scan, from the press on Scan card and Title. Whatever is still being
// read or asked then is given up, and the phone shows the likeliest printings found to pick from, or
// says to set the card aside (timeUp).
const CARD_MS = 3_000;
// The least a press's look is given once it starts, when waiting for an auto look took most of its 3 s.
const LOOK_MIN_MS = 500;
// The typed name's printings (decision 311): searched after typing, not a read, so not held to 3 s.
const NAME_MS = 10_000;
// Reading… can be tapped to stop once it's run this long (inside a card's 3 s, decision 549; was 3 s).
const STOPPABLE_AFTER_MS = 1_500;
// Holding Scan card this long starts over: the reader started afresh, what auto scan held forgotten.
const LONG_PRESS_MS = 700;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** A card of this name, a two-faced card by its front face too (decision 551). */
const frontKey = (name) => String(name ?? '').split(' // ')[0].trim().toLowerCase();
const sameName = (card, name) => Boolean(card && name) && frontKey(card.name) === frontKey(name);

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
// (owner, 2026-10-18; decision 307). Timed on the phone's own clock, from when it first saw it.
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
  const { scans, send, answer, undo } = useScans(computerId, phoneId,
    session ? { kind: session.target_kind, buyId: session.buy_id ?? null } : null);
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
  const [local, setLocal] = useState(null);
  // Cards laid on the holder's stack since the camera started, and the note that it's tall (decision 331).
  const stackCount = useRef(0);
  const [tallStack, setTallStack] = useState(false);       // the phone's own message: { tone, title?, text, at }
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
  // The card's title, enlarged, above the camera (decision 552): what the second reader reads.
  const titleRef = useRef(null);
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
  // The card in the holder's 3 s on auto scan (decision 549): { at, art, frame, foilSeen, tier,
  // cands }, from its first settled look; `cands` the likeliest printings its reads found
  // (id → { card, score }). Null with no card being read.
  const cardTime = useRef(null);
  // An older card that could be several printings: { tier, name, cards } to pick from.
  const [pick, setPickState] = useState(null);
  // A list opened stops the card's 3 s (decision 551): they ran out between a tap on Branching Bolt
  // and its send finishing on 2026-10-26, and the list opened again.
  const setPick = (next) => {
    if (next) cardTime.current = null;
    setPickState(next);
  };
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
  const sending = useRef(null);                   // the printing and finish being sent now (decision 344)
  const unsure = useRef(null);                    // { key, id }: a send with no answer, tried again with its id
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
  const refinished = useRef(new Set());            // scans FOIL? / NONFOIL? took off: their notes are its own
  async function refinish(scan, toFoil) {
    if (swapping) return;
    // One at a time, past the 30 s too: a second would forget the first, whose new copy then never goes.
    if (swap.current) {
      say('warn', `Still waiting on ${computer} to take the last card's old copy off: try again once it has.`, scanText(scan));
      return;
    }
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
      refinished.current.add(scan.id);
      say('muted', `Making it ${toFoil ? 'foil' : 'nonfoil'}: taking the ${was} copy off ${computer}…`, scanText(scan));
      // The buttons come back, but the swap isn't dropped (decision 392): the computer can still take
      // the old copy off after this, and then the new one has to go, or neither copy is left.
      setTimeout(() => {
        if (swap.current?.id !== scan.id) return;
        setSwapping(null);
        say('warn', `${computer} hasn't taken the ${was} copy off yet: the ${toFoil ? 'foil' : 'nonfoil'} one goes in when it does.`, scanText(scan));
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
   * Note a look's light (owner, 2026-10-18: "fix", to "No hint in dim light"; decision 306): after
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
  // A sheet over the camera (a price to answer, a printing to pick, a name to type) takes the title's and
  // the strip's boxes' room too (owner, 2026-10-26: the pick list "is not tall enough anymore to see enough
  // information to choose accurately"; decision 554). Nothing is read while one's open.
  const sheetOpen = Boolean(needs || pick || nameAsk);
  // What's open now, for a read that started earlier (Scan card waits for an auto look, which may
  // have opened a sheet meanwhile; decision 356).
  const openNow = useRef({});
  openNow.current = { blocked, needs, pick, nameAsk };

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
      // A plain Undo the computer refused (no user, the card gone): back to "added", and the strip
      // shows a tick, so its note is said here (decision 392). FOIL? / NONFOIL? says its own.
      else if ((was === 'undo' || was === 'undoing') && s.status === 'added' && !refinished.current.has(s.id)) {
        play('error');
        say('err', s.note ?? `${computer} couldn't take it off.`, scanText(s));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on new scans only; say and the computer's name are read as they are then
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
      // A fresh start: the holder emptied, as the tall-stack note asks (decision 331).
      stackCount.current = 0;
      setTallStack(false);
      // Ready the reader and the set list while the card is being lined up.
      ocrWorker()
        .catch((e) => console.warn('The card reader failed to load', e))
        .finally(() => setOcrLoading(false));
      setCodePattern().catch(() => {});
      // The names and their letter-pair index, for the title read on every look (decision 551).
      scry.loadNames().then((names) => matchName('', names)).catch(() => {});
    }
  }

  /** Lock the view onto a card (null: unlock); anything held about the last card goes. */
  function setLock(next) {
    lockRef.current = next;
    setLockState(next);
    view.current = { held: null, pending: null };
    cardTime.current = null;
    setTitleMode(false);
    sinceLock.current = 0;
    relockDue.current = false;
    relockTries.current = 0;
  }

  /** A card sent (decision 312): RELOCK_EVERY with one lock, and the view's due to be found again. */
  function noteSent() {
    sinceLock.current += 1;
    if (lockRef.current && sinceLock.current >= RELOCK_EVERY) relockDue.current = true;
    // The stack (owner, 2026-10-18: "after 100 cards without resetting the physical scanner device
    // (the height of the stack) … telling the user to stop the camera and reload the scanner when
    // they get a chance. (but not stopping them from continuing if they want)"; decision 331).
    stackCount.current += 1;
    if (stackCount.current % TALL_STACK === 0) {
      trace('tall-stack', { cards: stackCount.current });
      setTallStack(true);
    }
  }

  /**
   * One more look with no set code at the bottom; enough of them, and it's read as an older card.
   * `now`: a blank strip with ink in the title, an older card at once (decision 550).
   */
  function noLineAgain(v, art, { now = false } = {}) {
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
    if (!v.older && (now || v.noLine >= OLDER_AFTER)) {
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

  /**
   * The enlarged, cleaned collector corner, drawn into the box under the card; or, `el` titleRef, the
   * title into the box above it (decision 552).
   */
  function showCutout(src, el = cutoutRef.current) {
    // A box hidden under a sheet (decision 554) has no size: drawn now, it would lose its picture.
    if (!el || !src || !el.clientWidth) return;
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
  async function scanFrame({ manual, progress = null, pressedAt = null }) {
    if (busy.current || !camera.on) return;
    const now = openNow.current;
    if (now.blocked) {
      if (manual) {
        say('warn', now.blocked);
        play('error');
      }
      return;
    }
    if (now.needs || now.pick || now.nameAsk) {
      if (manual) say('warn', now.needs ? 'Answer the card that needs a price first.' : now.pick ? 'Pick the printing first.' : 'Type the card\'s name first.');
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
    // The card's 3 s (decision 549): Scan card's from its press; auto scan's from the card's first
    // settled look (cardTime), the look's deadline moved to it once the look knows it's that card
    // (a 3 s left from a card taken out before its time was up isn't the next card's).
    const left = (at) => CARD_MS - (Date.now() - at);
    let expire;
    let timer;
    const deadline = new Promise((_, reject) => {
      expire = reject;
    });
    const dueIn = (ms) => {
      clearTimeout(timer);
      timer = setTimeout(() => expire(new TimeoutError(CARD_MS)), Math.max(1, ms));
    };
    dueIn(manual ? Math.max(LOOK_MIN_MS, left(pressedAt ?? lookAt)) : CARD_MS);
    // What this look asks Scryfall, dropped when it ends (its time up, or Stop), so nothing it leaves
    // holds the search queue for the next card.
    const ask = new AbortController();
    // The card this look reads, and the likeliest printings its reads find: Scan card's own; auto
    // scan's the card's (cardTime), kept across its looks.
    let cardRead = manual ? { at: pressedAt ?? lookAt, art: null, frame: null, foilSeen: undefined, tier: 1, cands: new Map() } : null;
    // Each kept with what vouches for it (decision 551): `printed`, its set code read as printed;
    // `named`, one of the printings of the name the title read.
    const collect = (likely, { named = false } = {}) => {
      if (!cardRead) return;
      for (const { card: c, score, printed = false } of likely ?? []) {
        const had = cardRead.cands.get(c.id);
        if (!had || had.score < score) {
          cardRead.cands.set(c.id, { card: c, score, printed: printed || Boolean(had?.printed), named: named || Boolean(had?.named) });
        }
      }
    };
    const net = { signal: ask.signal, onCandidates: collect };
    const lookOnce = async () => {
      const frame = camera.capture();
      if (!frame) {
        if (manual) say('warn', "The camera isn't ready yet: press Scan card again.");
        return;
      }
      if (cardRead) cardRead.frame = frame;
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
      // Found again only on a settled picture (decision 322): a crop made mid-motion, a hand over the
      // card or the card sliding in, sat wrong till the next one.
      if (lock && !manual && relockDue.current && !view.current.moving) {
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
      // The title's name, being read beside the strip (decision 551): { name, how } or { name: null, guess }.
      let nameRead = null;
      const readName = (pic, onCard) => readTitleName(pic, { card: onCard, read: readTitleText })
        .catch((e) => {
          if (!ask.signal.aborted) console.warn('Reading the title failed', e);
          return { name: null, guess: () => '' };
        });
      if (lock) {
        // The settle check first, on the card's art alone (decision 550): a look that finds the card
        // still moving, or the card last sent still there, stops before the strip is cut out and set
        // level, so at 0.1 s apart those looks cost next to nothing.
        art = artPrint(frame, lock);
        // Something new in the holder since the last look (decision 304): not idle. And still moving
        // (decision 322): the card (or a hand) not where it was a look ago.
        const moving = Boolean(v.lastArt) && artDistance(v.lastArt, art) >= ART_CHANGED;
        if (!v.lastArt || moving) markActive();
        v.lastArt = art;
        v.moving = moving;
        // Another card in: back to its bottom strip (the older mode was the last card's).
        if (v.lineArt && artDistance(v.lineArt, art) >= ART_CHANGED) leaveOlder(v);
        // Still moving (owner, 2026-10-18: "the first read is happening slightly too early when waiting
        // for blur to clear after motion … there's 1 wasted early read often that is then, redone";
        // decision 322: 62 of 134 strip reads in the run had a failed read 0.6 s before): auto scan
        // reads once the card's art is the same two looks running, so the card has settled.
        if (!manual && moving) return;
        if (!manual && v.held) {
          // The card last sent, still there: nothing to read, so a misread of it can't be sent.
          if (artDistance(v.held, art) < ART_CHANGED) return;
          v.held = null;
          v.pending = null;
          leaveOlder(v);
        }
        // This card's collector line, found in its zone and set level (owner, 2026-10-16).
        const strip = straightCutout(frame, lock, defaultCreateCanvas);
        const cut = strip.canvas;
        listSeen = findListMark(frame, lock.card, defaultCreateCanvas).mark;
        // The two boxes (decision 552): the bottom strip under the camera, the title above it, every
        // settled look, older card or not (the title box took over the older-card mode's).
        const titleCut = titleCutout(frame, lock.card, defaultCreateCanvas);
        showCutout(cut);
        showCutout(nameCutout(titleCut, defaultCreateCanvas), titleRef.current);   // the name alone (decision 553)
        const outOfFocus = strip.sharpness > 0 && strip.sharpness < BLUR_BELOW;
        setBlurry(outOfFocus);
        // Nothing in the strip: the holder empty, or a white-bordered older card (ink in its title).
        const inked = !manual && strip.sharpness === 0 ? inkShare(titleCut) > TITLE_INK : true;
        if (!manual && inked) {
          // A card in the holder, settled (decision 549): its 3 s start now, or go on from its first
          // look; another card's art, and they start afresh. Up, and the phone asks (timeUp).
          const t = cardTime.current;
          if (!t || artDistance(t.art, art) >= ART_CHANGED) {
            cardTime.current = { at: Date.now(), art, frame, foilSeen: undefined, tier: 1, cands: new Map() };
          } else if (left(t.at) <= 0) {
            timeUp(t, { manual: false });
            return;
          }
          cardRead = cardTime.current;
          cardRead.frame = frame;
          dueIn(left(cardRead.at));
        }
        if (!manual && strip.sharpness === 0 && !v.older) {
          // Ink in the title over a blank strip: an older card, read by its title on this look (decision 550).
          if (inked) noLineAgain(v, art, { now: true });
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
        if (cardRead) {
          cardRead.foilSeen = foilSeen;
          cardRead.art ??= art;
        }
        // The card's name, read from its title by the second reader while the first reads the strip
        // (owner, 2026-10-26: "Can we always ALSO be scanning the name area so we don't have to do it
        // as a second pass check?"; decision 551).
        nameRead = readName(frame, lock.card);
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
          const located = locate(onCard).slice(0, SCAN_CARD_BLOCKS);   // the likeliest first (decision 550)
          progress?.drop('card');
          located.forEach((_, i) => progress?.plan(`located-${i + 1}`, STEP_MS.ocr));
          const more = located.length ? await readCollectorLine(onCard, pattern, located, { all: true, progress }) : [];
          attempts = [...attempts, ...more];
          found = await resolveThorough(attempts.map((a) => a.text), known, { pattern, progress, ...net });
          via = 'scan-card';
        } else if (!v.older) {
          // What the strip names, the quick way first (resolve.js; owner, 2026-10-16).
          found = await resolveReadings(attempts, known, { pattern, ...net });
          via = found?.quick ? 'strip-quick' : 'strip-search';
          if (found) leaveOlder(v);
          // No set code read at the bottom: once more towards the older-card mode.
          // A promo's PRM counts as a set read (decision 313): it's no older card.
          else if (!attempts.some((a) => readClues(a.text, known).sets.length || isPromoStrip(a.text))) noLineAgain(v, art);
        }
      } else {
        // Scan card before the view is locked: the whole picture, every block read.
        nameRead = readName(frame, null);   // decision 551
        progress?.drop('strip');
        progress?.drop('card');
        const likely = blocks.slice(0, SCAN_CARD_BLOCKS);   // the likeliest first (decision 550)
        likely.forEach((_, i) => progress?.plan(`located-${i + 1}`, STEP_MS.ocr));
        attempts = likely.length ? await readCollectorLine(frame, pattern, likely, { all: true, progress }) : [];
        found = await resolveThorough(attempts.map((a) => a.text), known, { pattern, progress, ...net });
        via = 'scan-card-unlocked';
      }

      // An FNM promo of 2014–2018 (decision 327): its "FNM" found Scryfall's 2000 promos, never a card
      // with this line. Its year's card instead, by the artist on the line, else by the title.
      // Nothing found on such a strip (FNM has no card 12): the same.
      if ((!found || found.card?.set === 'fnm') && attempts.some((a) => isFnmStrip(a.text))) {
        const fnm = await resolveFnm(attempts.map((a) => a.text), { number: found?.card?.collector_number ?? null });
        if (stale()) return;
        found = null;
        if (fnm?.cards.length === 1) {
          found = { card: fnm.cards[0], tier: 1, sure: true };
          via = `fnm-${fnm.by}`;
        } else if (fnm) {
          const named = await titleAmong(frame, fnm.cards, cardNamed, { card: lock?.card ?? null });
          if (stale()) return;
          if (named) {
            found = { card: named, tier: 1, sure: true };
            via = 'fnm-title';
          } else {
            trace('pick-open', { via: 'pick-fnm', name: 'FNM promo', count: fnm.cards.length, manual });
            setPick({ tier: 1, name: 'FNM promo', cards: fnm.cards, all: fnm.cards, art, frame, foilSeen, hint: 'Match the picture.', via: 'pick-fnm' });
            say('muted', 'An FNM promo: pick which one.');
            return;
          }
        }
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
          setPick({ tier: 1, name: promo.name, cards: promo.cards, all: promo.all, art, frame, foilSeen, hint: 'A promo: match the stamp.', via: 'pick-promo' });
          say('muted', `${promo.name}: a promo, pick which one.`);
          return;
        }
      }

      // The title's name, read beside the strip (decision 551). A strip sure of its card doesn't wait
      // for it; otherwise it settles what the strip couldn't.
      const stripSet = attempts.some((a) => readClues(a.text, known).sets.length || isPromoStrip(a.text));
      const texts = attempts.map((a) => a.text);
      let title = null;
      if (nameRead && !(found && (found.sure || manual || found.foreign))) {
        title = await nameRead;
        if (stale()) return;
        if (cardRead && title.name) cardRead.name = title.name;
      }
      // The strip unsure of its card (it waited for a second look), the name agreeing: sure on this look.
      if (found && !found.foreign && !found.sure && sameName(found.card, title?.name)) {
        found = { ...found, sure: true };
        via = `${via}+name`;
      }
      // No card from the strip, but one of its likely ones has the name read: taken when its set code
      // was read as printed and it's clearly ahead of any other of that name.
      if (!found && title?.name && cardRead) {
        const agree = [...cardRead.cands.values()].filter((c) => sameName(c.card, title.name)).sort((a, b) => b.score - a.score);
        if (agree[0]?.printed && (agree.length === 1 || agree[0].score - agree[1].score >= 1.5)) {
          found = { card: agree[0].card, tier: 1, sure: true };
          via = 'strip+name';
        }
      }
      // An older card: by its name's printings (and "123/350" from 1998 on), on this look (decision 550:
      // one read). Auto scan once it's in the older-card mode (a blank strip with ink in the title at
      // once, else three looks with no set code, each about 0.4 s now): a modern card's strip missed
      // once (glare, a thumb) is read again rather than its printing picked by look among dozens.
      // Scan card always ends here when the strip found nothing.
      if (!found && title?.name && (manual || (!stripSet && v.older))) {
        if (manual) say('muted', `${title.name}: finding its printing…`);
        progress?.plan('older', STEP_MS.older);
        progress?.start('older');
        const old = await printingsFor(title.name, frame, {
          texts, card: lock?.card ?? null, listMark: listSeen, signal: ask.signal, read: readTitleText,
          onPrintings: (cards, { tier }) => {
            if (cardRead) cardRead.tier = tier;
            collect(cards.map((c, i) => ({ card: c, score: 50 - i })), { named: true });
          },
        });
        progress?.finish('older');
        if (stale()) return;
        foilSeen = undefined;   // read by its title: no mark to go by
        v.unread = 0;
        if (old && cardRead) {
          cardRead.tier = old.tier;
          cardRead.foilSeen = undefined;
          collect(old.cards.map((c, i) => ({ card: c, score: 100 - i })), { named: true });
        }
        if (!old) {
          if (!manual) return;   // Scryfall has no printing of that name: looked at again
        } else if (old.cards.length === 1) {
          // One printing, by its number and set size or clearly ahead by look: sent on this look.
          found = { card: old.cards[0], tier: old.tier, sure: true };
          via = `title-${title.how}-${old.tier === 2 ? 'number' : 'look'}`;
        } else {
          trace('pick-open', { via: `pick-title-${title.how}`, name: old.name, count: old.cards.length, manual });
          setPick({ ...old, how: title.how, art, frame, via: `pick-title-${title.how}` });
          say('muted', `${old.name}: pick its printing.`);
          return;
        }
      }
      // No name either, and no set code on the strip (decision 311): Scan card asks for the name at once;
      // auto scan after UNREAD_AFTER such looks in a row on this card, unless its 3 s run out first.
      if (!found && title && !title.name && (manual || (!stripSet && v.older))) {
        trace('title-unread', { manual, ms: Date.now() - lookAt });
        v.unread = (v.unread ?? 0) + 1;
        if (manual || v.unread >= UNREAD_AFTER) {
          v.unread = 0;
          askName({ guess: title.guess(), frame, card: lock?.card ?? null, listMark: listSeen, texts, art, from: manual ? 'scan-card' : 'auto' });
        }
        return;
      }
      if (stale()) return;
      if (!found) {
        if (!manual) v.pending = null;
        trace('no-card', { manual, dark: lastDark.current, ms: Date.now() - lookAt, strip: attempts[0]?.text?.slice(0, 80) ?? null });
        if (manual && cardRead?.cands.size) {
          // No card clearly ahead, but likely ones (decision 549): Scan card ends in a choice too.
          timeUp(cardRead, { manual });
        } else if (manual) {
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
        const listed = await scry.cardBySetNumber('plst', listNumber(found.card), { signal: ask.signal }).catch(() => null);
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
      await Promise.race([lookOnce(), deadline]);
    } catch (e) {
      if (stale()) return;   // stopped meanwhile: the screen is the next read's
      if (isTimeout(e)) {
        // The card's 3 s up mid-look (decision 549; owner, 2026-10-18: stuck on "Reading…" on a slow
        // network): given up, so the next look or press isn't held behind it, and the phone asks.
        trace('timeout', { manual, ms: Date.now() - lookAt });
        scanTicket.current += 1;
        busy.current = false;
        // Auto scan: the card this look was reading, if it got that far; else nothing is asked.
        if (manual || cardRead) timeUp(cardRead, { manual });
        else view.current.pending = null;
        return;
      }
      console.error('Scan failed', e);
      trace('error', { manual, message: String(e?.message ?? e).slice(0, 120) });
      if (manual) {
        say('err', `Couldn't read it: ${e.message}`);
        play('error');
      }
    } finally {
      clearTimeout(timer);
      deadline.catch(() => {});   // the race is over: a deadline reached later is nobody's
      ask.abort();   // nothing this look asked is needed now (decision 549)
      if (!stale()) busy.current = false;
    }
  }

  /**
   * A card's 3 s up (owner, 2026-10-26: "show the top 3 candidates as a pick list on the phone, one
   * tap to choose, or set the card aside"; decision 549): the likeliest printings its reads found,
   * best first, three at most, to pick from (a tap sends it; Skip this card sets it aside). With
   * none found, the phone says to set it aside, and the card isn't read again till another is laid.
   * Scan card ending with no card clearly ahead comes here too.
   * @param {{ at: number, art: Float32Array|null, frame: HTMLCanvasElement|null, foilSeen?: boolean,
   *   tier: number, cands: Map<string, { card: object, score: number }> }} t
   */
  function timeUp(t, { manual }) {
    if (cardTime.current === t) cardTime.current = null;
    const v = view.current;
    v.pending = null;
    v.pendingOld = null;
    // Which guesses it offers (decision 551; owner, 2026-10-26, after a strip read as flavour text offered
    // Benalish Trapper, Ardent Soldier and Benalish Heralds): the title's name read, only that name's;
    // else only cards whose set code was read as printed, not a look-alike's guess.
    const all = [...(t?.cands.values() ?? [])];
    const ofName = t?.name ? all.filter((c) => c.named || sameName(c.card, t.name)) : [];
    const offered = ofName.length ? ofName : all.filter((c) => c.printed);
    const top = offered.sort((a, b) => b.score - a.score).slice(0, CANDIDATES).map((c) => c.card);
    trace('time-up', {
      manual, count: top.length, ms: t ? Date.now() - t.at : null,
      cards: top.map((c) => `${c.name} ${String(c.set).toUpperCase()} ${c.collector_number}`),
    });
    if (top.length) {
      const name = top.every((c) => c.name === top[0].name) ? top[0].name : 'card';
      trace('pick-open', { via: 'pick-time', name, count: top.length, manual });
      setPick({
        tier: t.tier ?? 1, name, cards: top, all: top, art: t.art, frame: t.frame, foilSeen: t.foilSeen,
        hint: 'Not sure: match the picture.', via: 'pick-time',
      });
      say('muted', 'Not sure which card: pick it, or skip it.');
      play('needs_price');
      return;
    }
    if (!manual && t?.art) v.held = t.art;
    say('err', lastDark.current
      ? `Couldn't read this card in time: it's too dark. Set it aside, or ${lightTip()} and press Scan card.`
      : "Couldn't read this card in time: set it aside and add it on the computer.");
    play('error');
  }

  /**
   * Scan card: the thorough read with its loading bar. Pressed during an
   * auto look, it waits for the look to end (auto scan holding off).
   */
  async function scanCard() {
    markActive();
    if (manualWaiting.current || reading) return;
    trace('scan-card-press');
    const pressedAt = Date.now();   // its 3 s count from here, the wait for an auto look included (decision 549)
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
      await scanFrame({ manual: true, progress: bar, pressedAt });
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
    const pressedAt = Date.now();   // its 3 s, as Scan card's (decision 549)
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
      if (lock) showCutout(nameCutout(titleCutout(frame, lock.card, defaultCreateCanvas), defaultCreateCanvas), titleRef.current);   // decisions 552, 553
      say('muted', 'Reading the title…');
      bar.start('older');
      const listMark = lock ? findListMark(frame, lock.card, defaultCreateCanvas).mark : null;
      const old = await withTimeout(readOlderCard(frame, { card: lock?.card ?? null, listMark }),
        Math.max(LOOK_MIN_MS, CARD_MS - (Date.now() - pressedAt)));
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
      setPick({ ...old, art, frame, via: `pick-title-press-${old.how}` });
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
    cardTime.current = null;
    endReading();
    if (text) say('muted', text);
  }

  /**
   * Stop (owner, 2026-10-18: "The stop button on the phone should cut off the camera faster than it
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
    cardTime.current = null;
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
    cardTime.current = null;   // the box stops the card's 3 s, as a list does (decision 551)
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
      const old = await withTimeout(printingsFor(name, ask.frame, { texts: ask.texts, card: ask.card, listMark: ask.listMark }), NAME_MS);
      if (!old) return `Scryfall has no printing of ${name}.`;
      trace('name-typed', { typed, name, guessed: typed === ask.guess, count: old.cards.length });
      setNameAsk(null);
      setPick({ ...old, art: ask.art, frame: ask.frame, via: 'pick-name' });
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
        cardTime.current = null;
        return;
      }
      if (!sure && v.pending !== key) {
        v.pending = key;
        return;
      }
    }
    // One card, one copy (decision 344): while its send is out, the same card isn't sent again (a look
    // given up at its deadline, a second press); a send with no sure answer is tried again with its id,
    // so the computer, which keeps one scan per id, never gets it twice.
    if (sending.current === key) {
      if (manual) say('warn', 'Still sending that card: wait for its chime.');
      return;
    }
    v.pending = null;
    const clientId = unsure.current?.key === key ? unsure.current.id : uuid();
    const sentAt = Date.now();
    sending.current = key;
    let r;
    try {
      r = await send({ ...cardFields(card), finish, condition, tier, client_id: clientId });
    } finally {
      sending.current = null;
    }
    unsure.current = r.error === 'timeout' ? { key, id: clientId } : null;
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
    cardTime.current = null;   // this card's done: the next one's 3 s start when it's laid (decision 549)
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

      {/* The card's title, enlarged and cleaned, above the camera (owner, 2026-10-26: "another viewport
          like the one we have below the camera, above the camera, always focused on the name"; decision
          552): what the second reader reads on every look. There while the camera's on. */}
      {camera.on && (
        <canvas ref={titleRef} className={`scan-cutout scan-title-box${sheetOpen ? ' covered' : ''}`} aria-label="The card's title, enlarged" />
      )}

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
              // Held at once (decision 551): auto scan, back on as the list closes, doesn't read the
              // card in the holder again while its send is out.
              if (art) view.current.held = art;
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
            onType={() => {
              // Let me type it (owner, 2026-10-21; decision 420): the reader named the wrong card. The
              // list closes and the name box opens empty; the typed name's printings are ranked by
              // the list's photo where it has one (the pick carries its frame), else listed oldest first.
              trace('pick-type', { via: pick.via ?? 'pick', name: pick.name });
              const { art, frame } = pick;
              setPick(null);
              setNameAsk({ guess: '', frame: frame ?? null, card: lock?.card ?? null, listMark: null, texts: [], art: art ?? null, from: 'pick' });
              say('muted', "Type the card's name, then pick its printing.");
            }}
          />
        )}
        {!needs && !pick && nameAsk && (
          <NameSheet
            key={nameAsk.guess ?? ''}
            guess={nameAsk.guess}
            title={nameAsk.from === 'pick' ? "Which card is it? Type its name." : undefined}
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

      {/* The stack's tall (decision 331): a note, nothing stopped; a tap hides it till 100 more. */}
      {camera.on && tallStack && (
        <button type="button" className="scan-notice warn scan-stack-note" onClick={() => setTallStack(false)}>
          {stackCount.current} cards on the stack: when you get a chance, ■ Stop, empty the holder and start the
          camera again. Tap to hide.
        </button>
      )}

      {/* The collector corner, enlarged and cleaned, for the person scanning (owner, 2026-10-16). */}
      {/* The info box: the collector strip, enlarged (owner, 2026-10-16); the title has its own box above
          the camera (decision 552). Title / Number reads the title, or goes back to the strip's set code
          and number. There while the camera's on, locked or not. */}
      {camera.on && (
        <div className={`scan-cutout-wrap${sheetOpen ? ' covered' : ''}`}>
          <canvas
            ref={cutoutRef}
            className={`scan-cutout${blurry ? ' blurry' : ''}`}
            aria-label={blurry ? 'The set code and number, enlarged: out of focus' : 'The set code and number, enlarged'}
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
          {/* An abort (owner, 2026-10-18; decision 321): on the touch itself, not the lift. */}
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

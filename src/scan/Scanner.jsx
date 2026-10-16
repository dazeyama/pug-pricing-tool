import { useEffect, useRef, useState } from 'react';
import { CONDITIONS } from '../lib/ladder.js';
import { readSession, writeSession } from '../lib/local.js';
import { formatMoney } from '../lib/money.js';
import { scanFinish, scanText } from '../lib/scanPrice.js';
import { useConnection } from '../state/connection.jsx';
import { usePairing } from './usePairing.js';
import { useScans } from './useScans.js';
import { useCamera } from './camera.js';
import { guideStyle } from './guide.js';
import { HIGH, MEDIUM, locate, lookupReading, readCollectorLine, setCodePattern } from './read.js';
import { ocrWorker, onOcrStatus } from './ocr.js';
import { isMuted, play, setMuted, unlockSounds } from './sounds.js';
import { readOlderCard } from './older.js';
import NeedsPriceSheet from './NeedsPriceSheet.jsx';
import PickPrintingSheet from './PickPrintingSheet.jsx';

// Auto scan (docs/SCAN_FUNCTION.md 6.3): the rest between one look at the
// camera and the next, and the wait before the first.
const REST_MS = 300;
const FIRST_LOOK_MS = 800;
// Older cards (tiers 2 and 3, 6.2) are read by their title, which is less
// sure than a collector line: only on Scan card until the benchmark on the
// store's own photos reads 80% of them right (docs/SCAN_FUNCTION.md 11.3).
const AUTO_OLDER = false;
// A scan still with the computer: auto scan waits for its outcome.
const WITH_COMPUTER = new Set(['sent', 'pricing']);

// The condition and finish for the next scans, kept for this tab (a reload keeps them).
const CONDITION_KEY = 'pug.scan.condition';
const FOIL_KEY = 'pug.scan.foil';

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
  const { scans, send, answer } = useScans(computerId, phoneId);
  const videoRef = useRef(null);
  const camera = useCamera(videoRef);
  const [condition, setConditionState] = useState(() => {
    const saved = readSession(CONDITION_KEY);
    return CONDITIONS.includes(saved) ? saved : 'NM';
  });
  const [foil, setFoilState] = useState(() => readSession(FOIL_KEY) === '1');
  const [muted, setMutedState] = useState(isMuted);
  const [local, setLocal] = useState(null);       // the phone's own message: { tone, title?, text, at }
  const [reading, setReading] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  // The card last sent is still in view (auto scan won't send it again).
  const [sameCard, setSameCard] = useState(false);
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
  const say = (tone, text, title = null) => setLocal({ tone, text, title, at: Date.now() });

  const blocked = blockedText(session);
  const needs = [...scans].reverse().find((s) => s.status === 'needs_price') ?? null;
  const latest = scans[0] ?? null;
  const withComputer = Boolean(latest && WITH_COMPUTER.has(latest.status));

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

  /**
   * Read the card in front of the camera and send it (6.1, 6.3, 6.4).
   * `manual`: Scan card, which takes a fair read, says what went wrong, and
   * always sends, the same card again included (a second copy). Auto scan
   * takes only sure reads, drops the rest silently, and never sends the card
   * it last sent.
   */
  async function scanFrame({ manual }) {
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
    if (manual) {
      setReading(true);
      say('muted', 'Reading…');
    }
    try {
      const frame = camera.capture();
      if (!frame) return;
      const pattern = await setCodePattern();
      const blocks = locate(frame);
      // Nothing like a collector line in view: no card (or it's been taken away).
      if (!blocks.length && !manual) {
        setSameCard(false);
        return;
      }
      const attempts = blocks.length ? await readCollectorLine(frame, pattern, blocks) : [];
      let found = attempts.length ? await lookupReading(attempts, pattern, manual ? MEDIUM : HIGH) : null;
      // No modern collector line: an older card, by its title (and "123/350" from 1998 on).
      if (!found && (manual || AUTO_OLDER)) {
        if (manual) say('muted', 'No set code at the bottom: reading the title…');
        const old = await readOlderCard(frame, { texts: attempts.map((a) => a.text) });
        if (old?.cards.length === 1) found = { card: old.cards[0], tier: old.tier };
        else if (old) {
          setPick(old);
          say('muted', `${old.name}: pick its printing.`);
          return;
        }
      }
      if (!found) {
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
      await sendCard(found.card, { tier: found.tier ?? 1, manual });
    } catch (e) {
      console.error('Scan failed', e);
      if (manual) {
        say('err', `Couldn't read it: ${e.message}`);
        play('error');
      }
    } finally {
      busy.current = false;
      if (manual) setReading(false);
    }
  }

  /** Send a recognised card, unless auto scan sees the card it last sent. */
  async function sendCard(card, { tier, manual }) {
    const finish = scanFinish(card, foil);
    const key = `${card.id}:${finish}`;
    if (!manual && key === lastSent.current) {
      setSameCard(true);
      return;
    }
    const r = await send({ ...cardFields(card), finish, condition, tier });
    if (r.error) {
      say('err', SEND_MESSAGES[r.error] ?? `Couldn't send it: ${r.error}`);
      play('error');
      check();
      return;
    }
    lastSent.current = key;
    setSameCard(true);
    setLocal(null);
  }

  // Auto scan (6.3): while the camera runs, look again and again, resting
  // between looks; paused while the computer can't take cards, a card needs
  // a price, the last scan is still with the computer (so sounds and the
  // strip keep step with the list), the connection is down, or the page is
  // hidden. Stop ends it with the camera.
  const auto = useRef(null);
  auto.current = { scanFrame, paused: Boolean(blocked) || Boolean(needs) || Boolean(pick) || withComputer || offline };
  useEffect(() => {
    if (!camera.on) return undefined;
    let alive = true;
    let timer;
    const look = async () => {
      if (!alive) return;
      if (!auto.current.paused && !busy.current && document.visibilityState === 'visible') {
        await auto.current.scanFrame({ manual: false });
      }
      if (alive) timer = setTimeout(look, REST_MS);
    };
    timer = setTimeout(look, FIRST_LOOK_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [camera.on]);

  // The strip: the phone's own message, or the latest scan's state, whichever is newer.
  const latestAt = latest ? Date.parse(latest.handled_at ?? latest.created_at) : 0;
  const strip = local && local.at >= latestAt ? local : latest ? scanStrip(latest, computer) : local;
  const size = camera.size;
  const stageStyle = size
    ? { aspectRatio: `${size.w} / ${size.h}`, width: `min(100%, calc(60vh * ${size.w / size.h}))` }
    : undefined;

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
        <div className="scan-seg finish" role="radiogroup" aria-label="Finish for the next scans">
          <button type="button" role="radio" aria-checked={!foil} className={`scan-seg-btn${!foil ? ' on' : ''}`} onClick={() => setFoil(false)}>
            Normal
          </button>
          <button type="button" role="radio" aria-checked={foil} className={`scan-seg-btn foil${foil ? ' on' : ''}`} onClick={() => setFoil(true)}>
            Foil
          </button>
        </div>
      </div>

      {blocked && <div className="scan-notice warn" role="status">{blocked}</div>}

      <div className={`scan-stage${camera.on ? ' live' : ''}`} style={stageStyle}>
        <video ref={videoRef} className="scan-video" playsInline muted />
        {camera.on && size && (
          <div className="scan-guide" style={guideStyle(size.w, size.h)} aria-hidden="true">
            <i className="v1" /><i className="v2" /><i className="h1" /><i className="h2" />
          </div>
        )}
        {!camera.on && (
          <div className="scan-stage-off">
            <button type="button" className="btn primary scan-start" disabled={camera.starting} onClick={startCamera}>
              {camera.starting ? 'Starting…' : 'START CAMERA'}
            </button>
            <p>Fill the frame with the card, its bottom edge clear: the reader looks for the set code and number there.</p>
          </div>
        )}
        {ocrLoading && <div className="scan-stage-note">Loading the card reader (first scan only)…</div>}
      </div>
      {camera.error && <div className="scan-notice err" role="alert">{camera.error}</div>}

      <div className="scan-actions">
        <button
          type="button"
          className="btn primary scan-now"
          disabled={!camera.on || reading || Boolean(needs) || Boolean(pick)}
          onClick={() => scanFrame({ manual: true })}
        >
          {reading ? 'Reading…' : 'Scan card'}
        </button>
        {camera.torch != null && (
          <button type="button" className={`btn scan-torch${camera.torch ? ' on' : ''}`} aria-pressed={camera.torch} onClick={camera.toggleTorch}>
            💡 Lighting
          </button>
        )}
        <button type="button" className="btn scan-stop" disabled={!camera.on} onClick={camera.stop}>■ Stop</button>
      </div>

      {needs ? (
        <NeedsPriceSheet key={needs.id} scan={needs} onAnswer={(price) => answer(needs.id, price)} />
      ) : pick ? (
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
      ) : strip && (
        <div className={`scan-strip ${strip.tone}`} role="status">
          {strip.title && <strong>{strip.title}</strong>}
          <span>{strip.text}</span>
        </div>
      )}
      {camera.on && !needs && !pick && (
        <p className="scan-hint">
          {sameCard
            ? 'Same card in view: it won’t be added again. Tap Scan card for another copy.'
            : 'Cards are added by themselves when they read clearly. Scan card reads the one in view now.'}
        </p>
      )}
    </div>
  );
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

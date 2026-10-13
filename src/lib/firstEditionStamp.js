// The 1st Edition stamp on vintage English Pokémon scans (owner, 2026-10-12).
// TCGdex's pictures of the 1st Edition sets (Base Set to Neo Destiny) are
// 1st Edition scans: every one checked carries the stamp, but the version
// picked by default is Unlimited, which has none. So with Unlimited picked
// the stamp is painted out, and with 1st Edition picked a scan without one
// gets one drawn on.
//
// The stamp sits in the same place on every card of those sets: a Pokémon's
// just left of the Length/Weight stripe under the art, a Trainer's above the
// illustrator's name, bottom left (measured on 74 TCGdex scans of all ten
// sets, the way the holo masks were). It's found by its ink: dark marks
// lying wholly inside the stamp's zone, with its solid disc dark at the
// middle; anything reaching outside the zone (the art's frame, the stripe,
// an energy symbol, text) is left alone. The ink, and the white "1" it
// encloses, is filled from the card's colour around it, smoothed in, with
// the paper's grain added back.
//
// Pure functions, so the tests run under Node; stampPatch is the browser's part.

/**
 * Per layout, as fractions of the card picture: `zone`, where the stamp's ink
 * can be; `core`, the middle of its solid disc; `stamp`, the stamp itself
 * (the median of the measured ink), where a drawn one goes.
 */
export const STAMP_LAYOUTS = {
  pokemon: {
    zone: { x0: 0.034, y0: 0.509, x1: 0.130, y1: 0.580 },
    core: { x0: 0.070, y0: 0.545, x1: 0.098, y1: 0.566 },
    stamp: { x0: 0.045, y0: 0.5333, x1: 0.115, y1: 0.5709 },
  },
  trainer: {
    zone: { x0: 0.128, y0: 0.884, x1: 0.250, y1: 0.938 },
    core: { x0: 0.175, y0: 0.905, x1: 0.205, y1: 0.925 },
    stamp: { x0: 0.172, y0: 0.893, x1: 0.242, y1: 0.931 },
  },
};

/** Pixels around the zone that the fill blends into (left as they are). */
const MARGIN = 6;

const TCGDEX_IMAGE = /^https:\/\/assets\.tcgdex\.net\//;

/**
 * Cards whose stamp sits off its layout's place, by TCGdex card ID: how far
 * down (negative: up), as a fraction of the picture's height. Rocket's Mewtwo
 * (Gym Challenge 14): its art and stripe sit higher, and its stamp with them,
 * 64 pixels on the 600 × 825 scan (owner, 2026-10-12: the one card that matters).
 */
export const CARD_SHIFTS = { 'gym2-14': -64 / 825 };

/** A TCGdex picture's card ID: …/en/gym/gym2/14/high.webp → "gym2-14". */
export function tcgdexCardId(image) {
  const m = String(image ?? '').match(/^https:\/\/assets\.tcgdex\.net\/[a-z-]+\/[^/]+\/([^/]+)\/([^/]+)\//);
  return m ? `${m[1]}-${m[2]}` : null;
}

/** A card's stamp layout by its category: Pokémon and Trainers; not Energy. */
export function stampLayout(category) {
  return { Pokemon: 'pokemon', Trainer: 'trainer' }[category] ?? null;
}

/**
 * Whether the selected card's picture gets the stamp treatment: an English
 * Pokémon card that has a 1st Edition version, shown from TCGdex (the only
 * scans measured). `hide` paints a stamp out (any version but 1st Edition),
 * `show` draws one on a scan without it (1st Edition). `shift` moves the
 * stamp's place for a card in CARD_SHIFTS.
 * @returns {{ mode: 'hide'|'show', layout: 'pokemon'|'trainer', shift: number }|null}
 */
export function firstEditionMode({ game, lang, hasFirstEdition, firstEdition, category, image }) {
  if (game !== 'pokemon' || lang !== 'en' || !hasFirstEdition) return null;
  if (!TCGDEX_IMAGE.test(String(image ?? ''))) return null;
  const layout = stampLayout(category);
  if (!layout) return null;
  return { mode: firstEdition ? 'show' : 'hide', layout, shift: CARD_SHIFTS[tcgdexCardId(image)] ?? 0 };
}

/** Where a drawn stamp goes, as fractions of the card picture. */
export function drawnStampBox(layout, shift = 0) {
  const b = STAMP_LAYOUTS[layout].stamp;
  return { left: b.x0, top: b.y0 + shift, width: b.x1 - b.x0, height: b.y1 - b.y0 };
}

/**
 * The picture's rectangle the stamp work reads (the zone plus a margin), in
 * pixels of a picture `width` × `height`, and the zone and core inside it;
 * moved down by `shift` (a fraction of the height) for a card in CARD_SHIFTS.
 */
export function stampRect(layout, width, height, shift = 0) {
  const L = STAMP_LAYOUTS[layout];
  const dy = Math.round(shift * height);   // whole pixels: the same shape, moved
  const px = (r) => ({
    x0: Math.round(r.x0 * width), y0: Math.round(r.y0 * height) + dy,
    x1: Math.round(r.x1 * width), y1: Math.round(r.y1 * height) + dy,
  });
  const zone = px(L.zone);
  const core = px(L.core);
  const x = Math.max(zone.x0 - MARGIN, 0);
  const y = Math.max(zone.y0 - MARGIN, 0);
  const w = Math.min(zone.x1 + MARGIN, width) - x;
  const h = Math.min(zone.y1 + MARGIN, height) - y;
  const local = (r) => ({ x0: r.x0 - x, y0: r.y0 - y, x1: r.x1 - x, y1: r.y1 - y });
  return { x, y, w, h, zone: local(zone), core: local(core) };
}

const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * Finds the stamp in the rectangle's pixels (RGBA, `w` × `h`, as stampRect
 * gives). `mask` is what a fill replaces: the stamp's ink, the light marks
 * it encloses (its "1") and a 2-pixel edge, inside the zone.
 * @returns {{ stamped: boolean, core: number, mask: Uint8Array, body: number[] }}
 */
export function findStamp(data, w, h, { zone, core }) {
  // The card's colour here: the median across the zone, mostly the card
  // around the stamp (the rectangle's edge is mostly the yellow border, the
  // art's frame and the stripe).
  const inZone = [];
  for (let y = zone.y0; y < zone.y1; y++) for (let x = zone.x0; x < zone.x1; x++) inZone.push((y * w + x) * 4);
  const body = [0, 1, 2].map((c) => median(inZone.map((i) => data[i + c])));
  const bodyLum = lum(...body);
  const limit = Math.min(bodyLum * 0.6, bodyLum - 45);
  const dark = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    if (lum(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]) < limit) dark[p] = 1;
  }

  // Dark marks wholly inside the zone (8-connected).
  const keep = new Uint8Array(w * h);
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let start = 0; start < w * h; start++) {
    if (!dark[start] || seen[start]) continue;
    const pts = [];
    let inside = true;
    seen[start] = 1;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop();
      pts.push(p);
      const x = p % w;
      const y = (p - x) / w;
      if (x < zone.x0 || x >= zone.x1 || y < zone.y0 || y >= zone.y1) inside = false;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (dark[q] && !seen[q]) {
            seen[q] = 1;
            stack.push(q);
          }
        }
      }
    }
    if (inside) for (const p of pts) keep[p] = 1;
  }

  let coreDark = 0;
  let coreAll = 0;
  for (let y = core.y0; y < core.y1; y++) {
    for (let x = core.x0; x < core.x1; x++) {
      coreAll++;
      coreDark += keep[y * w + x];
    }
  }
  const coreShare = coreAll ? coreDark / coreAll : 0;
  const inked = keep.reduce((n, v) => n + v, 0);
  const stamped = coreShare >= 0.35 && inked >= 0.02 * (zone.x1 - zone.x0) * (zone.y1 - zone.y0);

  // What the ink encloses (the white "1"): not reachable from the edge.
  const reach = new Uint8Array(w * h);
  const open = (p) => {
    if (!keep[p] && !reach[p]) {
      reach[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < w; x++) { open(x); open((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { open(y * w); open(y * w + w - 1); }
  while (stack.length) {
    const p = stack.pop();
    const x = p % w;
    if (x > 0) open(p - 1);
    if (x < w - 1) open(p + 1);
    if (p >= w) open(p - w);
    if (p < w * (h - 1)) open(p + w);
  }
  let mask = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) mask[p] = keep[p] || !reach[p] ? 1 : 0;
  // A 2-pixel edge, for the ink's soft rim; never outside the zone.
  for (let pass = 0; pass < 2; pass++) {
    const grown = mask.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (mask[p]) continue;
        if ((x > 0 && mask[p - 1]) || (x < w - 1 && mask[p + 1]) || (y > 0 && mask[p - w]) || (y < h - 1 && mask[p + w])) {
          grown[p] = 1;
        }
      }
    }
    mask = grown;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x < zone.x0 || x >= zone.x1 || y < zone.y0 || y >= zone.y1) mask[y * w + x] = 0;
    }
  }
  return { stamped, core: coreShare, mask, body };
}

/** A small seeded random generator (mulberry32): the same grain every time. */
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Paints the mask out of the pixels (RGBA, changed in place): the masked
 * area is grown in from its edge a ring at a time, each pixel the average of
 * the ones beside it already known, so it takes the card's colour right
 * around it; then smoothed; then the paper's grain (the body's own
 * brightness spread nearby) is added back.
 */
export function fillStamp(data, w, h, mask, body, seed = 1) {
  const n = w * h;
  const cur = new Float32Array(n * 3);
  const known = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    if (mask[p]) continue;
    known[p] = 1;
    for (let c = 0; c < 3; c++) cur[p * 3 + c] = data[p * 4 + c];
  }
  const masked = [];
  for (let p = 0; p < n; p++) if (mask[p]) masked.push(p);
  // Ring by ring from the edge in.
  let left = masked;
  while (left.length) {
    const ring = [];
    const rest = [];
    for (const p of left) {
      const x = p % w;
      const y = (p - x) / w;
      const sum = [0, 0, 0];
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if ((dx || dy) && nx >= 0 && ny >= 0 && nx < w && ny < h && known[ny * w + nx]) {
            const q = ny * w + nx;
            for (let c = 0; c < 3; c++) sum[c] += cur[q * 3 + c];
            count++;
          }
        }
      }
      if (count) ring.push([p, sum.map((v) => v / count)]);
      else rest.push(p);
    }
    if (!ring.length) {
      for (const p of rest) for (let c = 0; c < 3; c++) cur[p * 3 + c] = body[c];   // nothing around it at all
      break;
    }
    for (const [p, v] of ring) {
      known[p] = 1;
      for (let c = 0; c < 3; c++) cur[p * 3 + c] = v[c];
    }
    left = rest;
  }
  // Smoothed, so no ring shows.
  const next = new Float32Array(n * 3);
  for (let pass = 0; pass < 40; pass++) {
    for (const p of masked) {
      const x = p % w;
      const l = x > 0 ? p - 1 : p;
      const r = x < w - 1 ? p + 1 : p;
      const u = p >= w ? p - w : p;
      const d = p < n - w ? p + w : p;
      for (let c = 0; c < 3; c++) {
        next[p * 3 + c] = (cur[l * 3 + c] + cur[r * 3 + c] + cur[u * 3 + c] + cur[d * 3 + c]) / 4;
      }
    }
    for (const p of masked) for (let c = 0; c < 3; c++) cur[p * 3 + c] = next[p * 3 + c];
  }
  // The grain: brightness only, as strong as the body's own around the stamp.
  const near = [];
  for (let p = 0; p < n; p++) {
    if (mask[p]) continue;
    const dr = data[p * 4] - body[0];
    const dg = data[p * 4 + 1] - body[1];
    const db = data[p * 4 + 2] - body[2];
    if (Math.sqrt(dr * dr + dg * dg + db * db) < 35) near.push(lum(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]));
  }
  let grain = 0;
  if (near.length > 20) {
    const mean = near.reduce((s, v) => s + v, 0) / near.length;
    grain = Math.sqrt(near.reduce((s, v) => s + (v - mean) ** 2, 0) / near.length) * 0.8;
  }
  const rnd = random(seed);
  for (const p of masked) {
    const noise = grain ? Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd()) * grain : 0;
    for (let c = 0; c < 3; c++) data[p * 4 + c] = Math.max(0, Math.min(255, Math.round(cur[p * 3 + c] + noise)));
  }
  return data;
}

// ------------------------------------------------------------------ browser

const patches = new Map();   // `${url}|${layout}|${shift}` → its answer, once worked out

/**
 * Reads the picture at `url` (TCGdex allows that) and looks for the stamp.
 * Answers whether it's there and, when it is, a small picture of the
 * rectangle with it painted out (a data URL) and where that goes, as
 * fractions of the card picture. Worked out once per picture. Null when the
 * picture can't be read.
 * @returns {Promise<{ stamped: boolean, patch: string|null, at: { left: number, top: number, width: number, height: number },
 *   aspect: number }|null>}
 */
export function stampPatch(url, layout, shift = 0) {
  const key = `${url}|${layout}|${shift}`;
  if (!patches.has(key)) {
    patches.set(key, readStamp(url, layout, shift).catch(() => {
      patches.delete(key);   // a network blip: try again next time
      return null;
    }));
  }
  return patches.get(key);
}

async function readStamp(url, layout, shift) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const rect = stampRect(layout, W, H, shift);
  const canvas = document.createElement('canvas');
  canvas.width = rect.w;
  canvas.height = rect.h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
  const pixels = ctx.getImageData(0, 0, rect.w, rect.h);
  const found = findStamp(pixels.data, rect.w, rect.h, rect);
  const at = { left: rect.x / W, top: rect.y / H, width: rect.w / W, height: rect.h / H };
  if (!found.stamped) return { stamped: false, patch: null, at, aspect: W / H };
  fillStamp(pixels.data, rect.w, rect.h, found.mask, found.body);
  ctx.putImageData(pixels, 0, 0);
  return { stamped: true, patch: canvas.toDataURL('image/png'), at, aspect: W / H };
}

// --------------------------------------------------------- the drawn stamp

/**
 * The 1st Edition stamp drawn (owner, 2026-10-12: "draw the stamp yourself"),
 * as the real one is printed: a black disc with a serif "1" cut out of it
 * (the card shows through; it isn't white), standing the disc's full height,
 * and EDITION in heavy capitals fanned over its top half, each letter
 * standing out from the disc's centre. In a 135 × 100 box, the real stamp's
 * shape. `oneHeight`: Times New Roman's figures stand 0.662 of the font size.
 */
export function stampDrawing() {
  const r = 36;                 // the disc
  const cx = 67.5;
  const cy = 63.5;
  const base = r * 1.08;        // where the letters stand, just off the disc
  const angles = [-80, -53.3, -26.7, 0, 26.7, 53.3, 80];
  const oneHeight = r * 1.5;    // top to bottom of the disc, a thin rim left round it
  return {
    viewBox: '0 0 135 100',
    disc: { cx, cy, r },
    one: { x: cx, y: cy + oneHeight / 2, size: oneHeight / 0.662 },
    letters: [...'EDITION'].map((ch, i) => ({
      ch,
      transform: `rotate(${angles[i]} ${cx} ${cy}) translate(${cx} ${cy - base}) scale(0.82 1)`,
    })),
    letterSize: r * 0.86,
    letterStroke: 2.4,          // thickens the letters, as heavy as the printed ones
  };
}

// The List's mark (owner, 2026-10-16: "We should attempt to detect this
// symbol like we do with collector number info and make sure that list and
// mystery booster cards have 100% accuracy like the rest"). A card on The
// List, and one from the first Mystery Booster (which Scryfall files with
// it), is its original printing to the letter, set code and number and all,
// but for a small white planeswalker symbol in the black border at its
// bottom-left corner. Scryfall numbers it "<set>-<number>" in set plst
// ("A25-50"). Looked for in that corner, on the locked card's place: a small
// bright shape, the symbol's size, clear of the corner's edges, with dark
// border all round it (so the holder showing past a card set a little off
// isn't taken for it). DOM-free: the canvas maker is passed in.

/** The corner looked in, as fractions of the card: the border band the mark sits in (its middle ~5% in, ~95% down). */
const CORNER = { left: 0.0, right: 0.09, top: 0.905, bottom: 0.995 };
/** The card's width the corner is looked at in (px). */
const CARD_W = 600;

/**
 * Whether the card in `card` (the locked place) carries The List's mark.
 * @param {object} frame  the camera's picture
 * @param {{ x: number, y: number, width: number, height: number }} card
 * @returns {{ mark: boolean, at?: object }}
 */
export function findListMark(frame, card, createCanvas, debug = null) {
  const scale = CARD_W / card.width;
  const rx = card.x + card.width * CORNER.left;
  const ry = card.y + card.height * CORNER.top;
  const rw = card.width * (CORNER.right - CORNER.left);
  const rh = card.height * (CORNER.bottom - CORNER.top);
  const w = Math.max(4, Math.round(rw * scale));
  const h = Math.max(4, Math.round(rh * scale));
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(frame, rx, ry, rw, rh, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const gray = new Float32Array(w * h);
  for (let k = 0; k < gray.length; k++) gray[k] = 0.299 * data[4 * k] + 0.587 * data[4 * k + 1] + 0.114 * data[4 * k + 2];
  const sorted = Float32Array.from(gray).sort();
  const dark = sorted[Math.floor(sorted.length * 0.25)];
  const top = sorted[Math.floor(sorted.length * 0.985)];
  if (top - dark < 60) return { mark: false };   // nothing bright on the border there
  const cut = (dark + top) / 2;
  const bright = new Uint8Array(w * h);
  for (let k = 0; k < gray.length; k++) bright[k] = gray[k] > cut ? 1 : 0;

  // The bright marks (8-connected), each pixel labelled with its mark.
  const label = new Int32Array(w * h).fill(-1);
  const cardH = card.height * scale;
  const marks = [];
  for (let start = 0; start < bright.length; start++) {
    if (!bright[start] || label[start] >= 0) continue;
    const id = marks.length;
    const b = { x0: w, y0: h, x1: 0, y1: 0, area: 0 };
    const stack = [start];
    label[start] = id;
    while (stack.length) {
      const k = stack.pop();
      const x = k % w;
      const y = (k - x) / w;
      b.area += 1;
      b.x0 = Math.min(b.x0, x);
      b.x1 = Math.max(b.x1, x);
      b.y0 = Math.min(b.y0, y);
      b.y1 = Math.max(b.y1, y);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const nk = ny * w + nx;
          if (bright[nk] && label[nk] < 0) {
            label[nk] = id;
            stack.push(nk);
          }
        }
      }
    }
    marks.push(b);
  }
  // A glyph-sized mark: what crowds a digit (the holder past a card set off, or a frame's edge, is
  // big and runs off the corner's edge).
  const glyph = marks.map((m) => m.x0 > 0 && m.y0 > 0 && m.x1 < w - 1 && m.y1 < h - 1 && m.area <= 400);
  for (const [id, b] of marks.entries()) {
    const bw = b.x1 - b.x0 + 1;
    const bh = b.y1 - b.y0 + 1;
    debug?.push({ ...b, bw, bh, cardH, w, h, dark, top, cut });
    // The symbol's size (about 2.5% of the card wide, 1.6–2.1% of it high) and shape (about as
    // wide as high: the collector number's digits beside it are narrower), clear of the corner's edges.
    if (bh < cardH * 0.014 || bh > cardH * 0.04 || bw < CARD_W * 0.012 || bw > CARD_W * 0.045) continue;
    if (bw / bh < 0.8 || bw / bh > 1.25) continue;
    if (b.x0 < 1 || b.y0 < 1 || b.x1 > w - 2 || b.y1 > h - 2) continue;
    const fill = b.area / (bw * bh);
    if (fill < 0.2 || fill > 0.8) continue;
    // Standing alone, in a band a sixth of its size round it: at its sides next to no other
    // glyph-sized mark (a digit has the next one a pixel or two off; the collector line starts four
    // or five pixels right of the mark), above and below little.
    const pad = Math.max(2, Math.round(Math.max(bw, bh) / 6));
    const share = (x0, x1, y0, y1) => {
      let lit = 0;
      let n = 0;
      for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y++) {
        for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) {
          const l = label[y * w + x];
          if (l >= 0 && l !== id && glyph[l]) lit += 1;
          n += 1;
        }
      }
      return n ? lit / n : 0;
    };
    const sides = Math.max(share(b.x0 - pad, b.x0 - 1, b.y0, b.y1), share(b.x1 + 1, b.x1 + pad, b.y0, b.y1));
    const ends = Math.max(share(b.x0, b.x1, b.y0 - pad, b.y0 - 1), share(b.x0, b.x1, b.y1 + 1, b.y1 + pad));
    if (sides < 0.05 && ends < 0.3) return { mark: true, at: { x: b.x0, y: b.y0, w: bw, h: bh, fill } };
  }
  return { mark: false };
}

/** The List's number for a printing read off a card: "A25-50" (Scryfall's plst numbers). */
export function listNumber(card) {
  return `${String(card.set).toUpperCase()}-${card.collector_number}`;
}

/**
 * The List's printing of a card, among a name's printings ("A25-50" in plst), or null (decision 355).
 * @param {{ set: string, collector_number: string }} card  the original printing
 * @param {{ set: string, collector_number: string }[]} printings  every printing of its name
 */
export function listPrintingOf(card, printings) {
  const want = listNumber(card).toUpperCase();
  return (printings ?? []).find((p) => p.set === 'plst' && String(p.collector_number).toUpperCase() === want) ?? null;
}

// The foil star (owner, 2026-10-16: "there's a STAR symbol after the Set
// Code … when it's not a star it's a small dot … when the star is detected
// I want it to automatically send in the card as a foil, and when it's not
// detected … non-foil"). Since 2014 a card's collector line marks its
// finish between the set code and the language: "TMT ★ EN" on a foil,
// "TMT • EN" on the rest. Looked for on the strip straighten.js has already
// cut, set level and cleaned (black letters about 48px tall on white), by
// shape, with no OCR: of the marks on a line, the one after the set code's
// two to four letters, set apart by spaces, before the language's letters.
// A dot is small and round: about 0.4 of a letter's height (0.40–0.44 on 17
// cards), filling about three quarters of its box. A star stands taller:
// 0.78 on the owner's foil, its points blurred in, so filling 0.64 there and
// about half when sharp.
// DOM-free: the canvas is passed in.

/** A mark this much of a letter's height or more, filling less than this of its box (not a solid blob), is a star. */
const STAR = { height: 0.58, fill: 0.74 };

/**
 * The dark marks on a black-on-white canvas, each as its box and area
 * (4-connected, so letters a pixel apart stay apart).
 * @returns {{ x0: number, y0: number, x1: number, y1: number, w: number, h: number, area: number }[]}
 */
export function marksOn(canvas) {
  const { width: w, height: h } = canvas;
  const { data } = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h);
  const dark = new Uint8Array(w * h);
  for (let k = 0; k < dark.length; k++) dark[k] = data[4 * k] < 128 ? 1 : 0;
  const marks = [];
  const stack = new Int32Array(w * h);
  for (let start = 0; start < dark.length; start++) {
    if (!dark[start]) continue;
    dark[start] = 0;
    let top = 0;
    stack[top++] = start;
    let x0 = w;
    let y0 = h;
    let x1 = 0;
    let y1 = 0;
    let area = 0;
    while (top) {
      const k = stack[--top];
      const x = k % w;
      const y = (k - x) / w;
      area += 1;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x > 0 && dark[k - 1]) { dark[k - 1] = 0; stack[top++] = k - 1; }
      if (x < w - 1 && dark[k + 1]) { dark[k + 1] = 0; stack[top++] = k + 1; }
      if (y > 0 && dark[k - w]) { dark[k - w] = 0; stack[top++] = k - w; }
      if (y < h - 1 && dark[k + w]) { dark[k + w] = 0; stack[top++] = k + w; }
    }
    marks.push({ x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, area });
  }
  return marks;
}

const median = (v) => {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/**
 * The finish mark among a strip's marks: 'star', 'dot', or null when no
 * mark sits where a finish mark does. Pure, for tests.
 * @param {{ x0: number, y0: number, x1: number, y1: number, w: number, h: number, area: number }[]} marks
 * @returns {{ mark: 'star'|'dot', height: number, fill: number }|null}  height: of a letter's
 */
export function judgeFinishMark(marks) {
  // The letters' height: the middle of the letter-shaped marks (straighten.js makes them ~48px).
  const letterish = marks.filter((m) => m.h >= 20 && m.h <= 110 && m.w <= m.h * 1.5);
  if (letterish.length < 4) return null;
  const letter = median(letterish.map((m) => m.h));
  const isLetter = (m) => m.h >= letter * 0.7 && m.h <= letter * 1.35 && m.w <= letter * 1.5;
  // Lines of marks: each mark (not a dust speck, not a rule across the strip) with the line its middle falls in.
  const usable = marks.filter((m) => m.h >= letter * 0.18 && m.h <= letter * 1.35 && m.w <= letter * 2.5)
    .sort((a, b) => a.x0 - b.x0);
  const lines = [];
  for (const m of usable) {
    const mid = (m.y0 + m.y1) / 2;
    const line = lines.find((l) => Math.abs(l.mid - mid) < letter * 0.55);
    if (line) line.marks.push(m);
    else lines.push({ mid, marks: [m] });
  }
  for (const { marks: row } of lines) {
    // After the set code's 2–4 letters, before the language's letters, spaced from both.
    for (let i = 2; i <= 4 && i < row.length - 2; i++) {
      const m = row[i];
      const before = row.slice(0, i);
      if (!before.every(isLetter) || !isLetter(row[i + 1]) || !isLetter(row[i + 2])) continue;
      const height = m.h / letter;
      const shape = m.w / m.h;
      if (height < 0.2 || height > 0.95 || shape < 0.6 || shape > 1.6) continue;
      if (m.x0 - row[i - 1].x1 < letter * 0.12 || row[i + 1].x0 - m.x1 < letter * 0.12) continue;
      const fill = m.area / (m.w * m.h);
      return { mark: height >= STAR.height && fill < STAR.fill ? 'star' : 'dot', height, fill };
    }
  }
  return null;
}

/**
 * The finish the strip shows: true for a star (foil), false otherwise (a
 * dot, or no mark found: the owner's "when it's not detected … non-foil").
 * @param {object} canvas  straighten.js's strip, black on white
 */
export function stripShowsFoil(canvas) {
  return judgeFinishMark(marksOn(canvas))?.mark === 'star';
}

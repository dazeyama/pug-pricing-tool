// Reading a card's collector line (docs/SCAN_FUNCTION.md 6.1, tier 1): the
// steps of mtgscan's processImage around its copied recognition modules
// (./recognition/). Find the light-on-dark text blocks, OCR them best first
// (stopping at a sure read). What the text names is worked out by
// resolve.js.

import { locateCollectorTextBlocks } from './recognition/textLocator.js';
import { generateDetectionVariants, MAX_CANDIDATES } from './recognition/pipeline.js';
import { cleanOCRText, scoreCollectorNumberResult } from './recognition/parsing.js';
import { PSM_BLOCK, readText } from './ocr.js';
import * as scry from '../lib/scryfall.js';

/** A sure read (mtgscan's HIGH): no more blocks are read after one. */
const HIGH = 80;

let codesPromise = null;
/**
 * Every paper set's code, upper case, from the app's own set list (letters
 * and digits only: what's printed on a card).
 * @returns {Promise<Set<string>>}
 */
export function paperSetCodes() {
  codesPromise ??= scry.loadSets()
    .then((sets) => new Set([...sets.values()].filter((s) => !s.digital).map((s) => s.code.toUpperCase())
      .filter((c) => /^[A-Z0-9]+$/.test(c))))
    .catch((e) => {
      codesPromise = null;
      throw e;
    });
  return codesPromise;
}

/**
 * mtgscan's set-code pattern (an alternation of every set code, named group
 * `collection`): longest codes first so a code is never read as a shorter
 * one inside it.
 * @returns {Promise<RegExp>}
 */
export async function setCodePattern() {
  const codes = [...await paperSetCodes()].sort((a, b) => b.length - a.length || a.localeCompare(b));
  return new RegExp(`(?<collection>${codes.join('|')})`);
}

/** The collector-text blocks in a frame, best first: cheap (no OCR), so auto scan looks before it reads. */
export function locate(canvas) {
  return locateCollectorTextBlocks(canvas, { maxCandidates: MAX_CANDIDATES });
}

/**
 * OCR the blocks best first, stopping at a sure read (mtgscan's
 * performCollectorNumberOCRWithFallback): each reading scored raw and
 * cleaned, the better kept.
 * @returns {Promise<{ text: string, score: number }[]>}  best first
 */
export async function readCollectorLine(canvas, pattern, blocks = locate(canvas)) {
  const attempts = [];
  for (const variant of generateDetectionVariants(canvas, undefined, blocks)) {
    let raw;
    try {
      raw = await readText(variant.canvas, PSM_BLOCK);
    } catch (e) {
      console.warn(`OCR failed on ${variant.name}`, e);
      continue;
    }
    const cleaned = cleanOCRText(raw);
    const rawScore = scoreCollectorNumberResult(raw, pattern);
    const cleanedScore = scoreCollectorNumberResult(cleaned, pattern);
    attempts.push({ text: rawScore > cleanedScore ? raw : cleaned, score: Math.max(rawScore, cleanedScore) });
    if (Math.max(rawScore, cleanedScore) >= HIGH) break;
  }
  return attempts.sort((a, b) => b.score - a.score);
}

/**
 * Read one picture already cut out and cleaned (the locked view's collector
 * strip, straighten.js): the text as read first, its lines and letters kept
 * for resolve.js (the rarity, the artist's name), then mtgscan's cleaned
 * version of it, each scored as readCollectorLine scores.
 * @returns {Promise<{ text: string, score: number }[]>}
 */
export async function readPrepared(canvas, pattern) {
  const raw = await readText(canvas, PSM_BLOCK);
  const cleaned = cleanOCRText(raw);
  return [
    { text: raw, score: scoreCollectorNumberResult(raw, pattern) },
    { text: cleaned, score: scoreCollectorNumberResult(cleaned, pattern) },
  ];
}

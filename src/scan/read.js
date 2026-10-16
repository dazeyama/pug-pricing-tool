// Reading a card's collector line (docs/SCAN_FUNCTION.md 6.1, tier 1): the
// steps of mtgscan's processImage around its copied recognition modules
// (./recognition/). Find the light-on-dark text blocks, OCR them best first
// (stopping at a sure read), parse set code, number and language, and look
// the printing up on Scryfall, trying the next reading on a miss.

import { locateCollectorTextBlocks } from './recognition/textLocator.js';
import { generateDetectionVariants, MAX_CANDIDATES } from './recognition/pipeline.js';
import { cleanOCRText, parseCollectorNumber, scoreCollectorNumberResult } from './recognition/parsing.js';
import { PSM_BLOCK, readText } from './ocr.js';
import * as scry from '../lib/scryfall.js';

/** A sure read (mtgscan's HIGH): auto scan takes only these. */
export const HIGH = 80;
/** A fair read (MEDIUM): Scan card takes these too, a person watching the result. */
export const MEDIUM = 40;

let patternPromise = null;
/**
 * mtgscan's set-code pattern (an alternation of every set code, named group
 * `collection`), from the app's own set list: paper sets only, longest
 * codes first so a code is never read as a shorter one inside it.
 * @returns {Promise<RegExp>}
 */
export function setCodePattern() {
  patternPromise ??= scry.loadSets()
    .then((sets) => {
      const codes = [...sets.values()].filter((s) => !s.digital).map((s) => s.code.toUpperCase())
        .filter((c) => /^[A-Z0-9]+$/.test(c))
        .sort((a, b) => b.length - a.length || a.localeCompare(b));
      return new RegExp(`(?<collection>${codes.join('|')})`);
    })
    .catch((e) => {
      patternPromise = null;
      throw e;
    });
  return patternPromise;
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
 * The printing the readings name: the best three with at least `min`, each
 * parsed and looked up on Scryfall until one is a card.
 * - A card printed in another language is refused ({ foreign: 'DE' }): its
 *   English printing isn't what's in hand. Except a Japanese-only printing
 *   (Mystical Archive's Japanese art), which the app knows (decision 269).
 * @returns {Promise<{ card: object, score: number }|{ foreign: string }|null>}
 */
export async function lookupReading(attempts, pattern, min) {
  for (const a of attempts.slice(0, 3)) {
    if (!a.text || a.score < min) continue;
    const parsed = parseCollectorNumber(a.text, pattern);
    if (!parsed) continue;
    const card = await scry.cardBySetNumber(parsed.setCode, parsed.collectorNumber);
    if (parsed.language && parsed.language !== 'EN') {
      if (parsed.language === 'JP' && card?.lang === 'ja') return { card, score: a.score };
      if (card) return { foreign: parsed.language };
      continue;
    }
    if (card) return { card, score: a.score };
  }
  return null;
}

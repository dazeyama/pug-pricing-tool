// Request ids for the writes a press can repeat (decision 388): ADD CARD, ×, strike, and creating
// a collection or a project. The database does each request id once (migration 0004,
// internal.request_begin), so a press again after a lost answer sends the lost one's id: the
// write happens once, whether the lost one went through or not. Any other press gets a new id,
// so adding the same card twice on purpose still adds it twice: after an answered press, after
// the press that reused the id (which says so), or once the lost one is two minutes old.
import { uuid } from './uuid.js';
import { dbErrorCode } from './dbErrors.js';

/** How long a lost answer's id waits for the press again that it's meant for. */
export const LOST_MS = 120_000;

/** The toast after a press that reused a lost answer's id. */
export const DONE_ONCE = 'Done once: after a lost answer, pressing again never does it twice. Press again to do it again.';

/**
 * What a write does, the same for the same press again: its function and arguments, without
 * the version a reload moves on, nor the time a fresh line is stamped with.
 * @param {string} fn
 * @param {object} args
 * @returns {string}
 */
export function requestKey(fn, args) {
  const rest = { ...args };
  delete rest.p_expected_version;
  delete rest.p_request;
  if (rest.p_line && typeof rest.p_line === 'object') {
    rest.p_line = { ...rest.p_line };
    delete rest.p_line.priced_at;
  }
  return JSON.stringify([fn, rest]);
}

/**
 * One screen's request ids for staff's presses (the phone's scans keep their own): the last
 * write whose answer was lost, kept for a press again.
 */
export function createRequests(newId = uuid, clock = Date.now) {
  let lost = null;   // { key, id, at }
  return {
    /** The id for this write; `again`: it's the lost one's, so this press may do nothing new. */
    idFor(key) {
      if (lost?.key === key && clock() - lost.at < LOST_MS) {
        const { id } = lost;
        lost = null;   // once: a further press is a new one
        return { id, again: true };
      }
      return { id: newId(), again: false };
    },
    /** After the call: kept only when its answer was lost (an error that isn't a refusal). */
    settle(key, id, error) {
      lost = error && !dbErrorCode(error) ? { key, id, at: clock() } : null;
    },
  };
}

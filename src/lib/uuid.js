// A random ID (UUID v4). crypto.randomUUID only exists on https:// pages and
// on localhost; a computer opening the dev server by its network address
// (http://192.168…) doesn't have it, and naming that computer failed silently
// (owner's MacBook, 2026-10-09). The same kind of ID is then made from
// crypto.getRandomValues, which every page has.

/** @param {Crypto} [c] */
export function uuid(c = globalThis.crypto) {
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;   // version 4
  b[8] = (b[8] & 0x3f) | 0x80;   // the RFC 4122 variant
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

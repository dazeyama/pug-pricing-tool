// The database's refusals (`raise exception 'stale_version'` in the
// migrations). Every one is a bare code, so a code is the whole message, and
// it's read exactly (FABLE_REPORT A5): never "the message contains a code",
// which took the first key that happened to be inside it.
//
// DB_MESSAGES holds the sentences that read the same on every page. A page
// spreads it and adds its own where a code means something different there
// ("This buy changed on another computer…" / "This collection changed…").

export const DB_MESSAGES = {
  no_user: 'Pick a user first.',
  line_gone: 'That card was already removed.',
  line_not_struck: 'That card was already restored.',
  day_not_over: "Today can't be exported until it's over.",
  bad_pct: 'Enter a percentage from 0 to 100, with up to 2 decimals.',
  name_needed: "Enter the customer's name.",
  phone_needed: 'Enter a phone number.',
};

const CODE = /^[a-z][a-z0-9_]*$/;

/** The refusal's code ("stale_version"), or null for any other error (a lost connection, a broken constraint). */
export function dbErrorCode(error) {
  const message = String(error?.message ?? '').trim();
  return CODE.test(message) ? message : null;
}

/** The code, if `messages` has a sentence for it; else null. */
export function knownCode(error, messages = DB_MESSAGES) {
  const code = dbErrorCode(error);
  return code && Object.hasOwn(messages, code) ? code : null;
}

/** A toast-ready sentence: `messages`' for the code, or "<failure>: <the error>" for anything else. */
export function dbMessage(error, failure, messages = DB_MESSAGES) {
  const code = knownCode(error, messages);
  return code ? messages[code] : `${failure}: ${error?.message}`;
}

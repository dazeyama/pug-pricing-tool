// localStorage for per-computer choices (device ID and name), and
// sessionStorage for per-tab ones (the picked user). Every access is guarded:
// storage can be blocked, and the app must still run.

export function readLocal(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Blocked: the choice lasts for this page load only.
  }
}

/** This tab's value: sessionStorage starts empty in every new tab and survives a reload. */
export function readSession(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSession(key, value) {
  try {
    if (value == null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // Blocked: the choice lasts for this page load only.
  }
}

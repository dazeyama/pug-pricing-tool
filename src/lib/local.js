// localStorage for per-computer choices (device ID and name, picked user).
// Every access is guarded: storage can be blocked, and the app must still run.

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

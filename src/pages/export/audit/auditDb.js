// The matching audit's files in this browser (decision 547): the data file picked once and the picks after every
// key, in IndexedDB (localStorage is too small for an 11 MB file). Storage blocked: kept in memory for the page's
// life, and the page says so. Nothing here touches the database.

const NAME = 'pug-audit-cc';
const STORE = 'files';
const memory = new Map();

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function request(mode, run) {
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = run(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  }));
}

/** The stored value, or null. */
export async function readStored(key) {
  try {
    return (await request('readonly', (store) => store.get(key))) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

/** Keep a value; false when the browser refused and it's in memory only. */
export async function writeStored(key, value) {
  memory.set(key, value);
  try {
    await request('readwrite', (store) => (value == null ? store.delete(key) : store.put(value, key)));
    return true;
  } catch {
    return false;
  }
}

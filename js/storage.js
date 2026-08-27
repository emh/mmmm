/**
 * Persistence (PRD §22).
 *
 * IndexedDB is the authoritative store, because saves accumulate event history,
 * memories, world state and discovered places -- more than localStorage should
 * hold. No wrapper library; the raw API is enough for one object store.
 */

const DB_NAME = "molly-mae";
const DB_VERSION = 1;
const STORE = "saves";
const SLOT = "current";

let dbPromise = null;

/** How long to wait for any IndexedDB operation before giving up on it. */
const TIMEOUT_MS = 2500;

/**
 * Reject if a promise has not settled in time.
 *
 * Every path into IndexedDB gets wrapped in this, not just `open`. Opening is
 * the most famous way for it to stall, but a transaction against a database
 * held by another connection stalls just as silently, and either one is enough
 * to leave `await load()` pending forever -- which strands boot and leaves a
 * blank screen with nothing logged anywhere.
 */
function withTimeout(promise, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`indexedDB ${label} timed out`)), TIMEOUT_MS)),
  ]);
}

/**
 * Open the database, but never hang on it.
 *
 * `indexedDB.open` can block indefinitely -- an older connection still holding
 * the database, a pending deleteDatabase, private browsing, a browser with
 * storage disabled. None of those fire `onerror`, so an await on it simply
 * never settles. That took the whole game down with it: boot awaits the load,
 * so a blocked database meant a permanently blank screen with nothing logged.
 *
 * A save is a convenience; being able to play is not. If storage will not
 * cooperate promptly we carry on without it.
 */
function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => { if (!settled) { settled = true; fn(value); } };

    const timer = setTimeout(
      () => finish(reject, new Error("indexedDB open timed out")),
      TIMEOUT_MS);

    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      clearTimeout(timer);
      return finish(reject, err);
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => { clearTimeout(timer); finish(resolve, request.result); };
    request.onerror = () => { clearTimeout(timer); finish(reject, request.error); };
    // Fires when another tab or a pending delete is holding the database.
    request.onblocked = () => { clearTimeout(timer); finish(reject, new Error("indexedDB blocked")); };
  });

  // A failed open must not poison every later attempt with the same rejection.
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

export async function save(state) {
  try {
    const db = await open();
    return await withTimeout(new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(serialise(state), SLOT);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    }), "save");
  } catch (err) {
    console.warn("save failed -- continuing without persistence", err.message);
    return false;
  }
}

export async function load() {
  try {
    const db = await open();
    const raw = await withTimeout(new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(SLOT);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }), "load");
    return raw ? migrate(raw) : null;
  } catch (err) {
    console.warn("load failed -- starting fresh", err.message);
    return null;
  }
}

export async function clear() {
  const db = await open();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(SLOT);
    tx.oncomplete = () => resolve(true);
  });
}

/** Strip anything non-structured-cloneable (functions, class instances). */
function serialise(state) {
  return JSON.parse(JSON.stringify(state));
}

/**
 * Schema migration (§22). Version 1 is the first shipped shape; future versions
 * step forward here rather than discarding a player's dog.
 */
function migrate(save) {
  if (save.game?.version === 1) return save;
  console.warn("unknown save version", save.game?.version, "-- starting fresh");
  return null;
}

/**
 * Persistence (PRD §22).
 *
 * IndexedDB is the authoritative store, because saves accumulate event history,
 * memories, world state and discovered places -- more than localStorage should
 * hold. No wrapper library; the raw API is enough for one object store.
 */

import { PLACES, SPOTS } from "./world/places.js";

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
  const version = save.game?.version;

  /*
   * v1 -> v2: physical needs were removed. Her memories, her model of the
   * player and where she has been are all still valid, and those are the parts
   * worth keeping -- discarding a save over a field that no longer exists
   * would throw away exactly the progression §8 calls the point of the game.
   */
  if (version === 1) {
    delete save.dog?.needs;
    delete save.world?.bowlHasFood;
    save.game.version = 2;
    console.info("save migrated 1 -> 2 (physical needs removed)");
  } else if (version !== 2) {
    console.warn("unknown save version", version, "-- starting fresh");
    return null;
  }
  return repair(save);
}

/**
 * Put a save back on its feet if the world has moved under it.
 *
 * Places and spots change as the park grows, and a save can also be written
 * mid-failure -- one was persisted with a place but no spot, which then threw
 * during perception on every subsequent boot. A save that cannot be loaded is
 * indistinguishable from a lost dog, so repair what can be repaired rather than
 * discarding her memories over a bad field.
 */
function repair(save) {
  const dog = save.dog;
  if (!dog) return null;

  if (!PLACES[dog.place]) {
    console.warn(`save: unknown place "${dog.place}" -- putting her back on the trail`);
    dog.place = "cedar_trail";
    dog.spot = null;
  }
  if (!dog.spot || !SPOTS[dog.spot] || SPOTS[dog.spot].place !== dog.place) {
    const first = PLACES[dog.place].spots[0];
    console.warn(`save: spot "${dog.spot}" is not in ${dog.place} -- moving her to ${first}`);
    dog.spot = first;
  }
  // Memories of places that no longer exist are harmless but never useful.
  if (dog.memory?.places) {
    for (const id of Object.keys(dog.memory.places)) {
      if (!SPOTS[id]) delete dog.memory.places[id];
    }
  }
  return save;
}

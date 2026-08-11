// ─── Offline capture queue ──────────────────────────────────────────────────
// Photos taken in a walk-in/freezer/basement often have no signal. Rather than losing the
// count or blocking the counter, a capture batch built while offline (or one where the
// count session couldn't be started) is stored whole in IndexedDB -- photo Blobs included,
// which is why this is IndexedDB and not localStorage (~5MB quota, no Blob support) -- and
// retried automatically once the device is back online. Nothing here talks to the backend
// directly; App.jsx's flushOfflineQueue() replays the same startCountSession /
// uploadPhotoToStorage / analysePhotosViaBackend calls the live capture flow already uses.

const DB_NAME = "inventoryiq-offline";
const DB_VERSION = 1;
const STORE = "capture-queue";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Could not open offline queue"));
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let result;
    Promise.resolve(fn(store))
      .then(r => { result = r; })
      .catch(reject);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Offline queue transaction aborted"));
  });
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// entry: {
//   id, locationId, locationName, areaId, areaName,
//   stages: [{ id, name, images: [{ id, name, mediaType, blob, sizeKB }] }],
//   scannedItems, createdAt, status, error
// }
export async function enqueueCapture(entry) {
  const record = { status: "pending", error: null, createdAt: Date.now(), ...entry };
  await withStore("readwrite", store => reqToPromise(store.put(record)));
  return record;
}

export async function listQueuedCaptures() {
  const all = await withStore("readonly", store => reqToPromise(store.getAll()));
  return (all || []).sort((a, b) => a.createdAt - b.createdAt);
}

export async function updateQueuedCapture(id, patch) {
  return withStore("readwrite", async store => {
    const existing = await reqToPromise(store.get(id));
    if (!existing) return null;
    const next = { ...existing, ...patch };
    await reqToPromise(store.put(next));
    return next;
  });
}

export async function removeQueuedCapture(id) {
  return withStore("readwrite", store => reqToPromise(store.delete(id)));
}

export async function pendingCount() {
  const all = await listQueuedCaptures();
  return all.filter(c => c.status === "pending" || c.status === "syncing").length;
}

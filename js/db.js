/* =========================================================
   db.js — Persistent storage (IndexedDB) for Paribar
   - Everything lives on the device, inside the browser.
   - Data is kept in memory (FT.state) and written through
     to IndexedDB on every change.
   ========================================================= */
window.FT = window.FT || {};

FT.db = (() => {
  const DB_NAME = 'paribar';
  // No version number on open: we use whatever version is on the phone. v0.9 made version 1;
  // the first v1.0 build upgraded to 2 (added a "visits" store). Never upgrading again means
  // an older copy open in another tab can't block us, and v0.9 keeps working on version 1 phones.
  // Visits are saved in the meta store as "visit:<id>" records, so no new store is needed.
  const VISIT = 'visit:';
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME);
      req.onupgradeneeded = () => { // only on a brand-new phone (nothing saved yet)
        const db = req.result;
        if (!db.objectStoreNames.contains('people')) db.createObjectStore('people', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('relationships')) db.createObjectStore('relationships', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => db.close(); // if any other copy ever needs to upgrade, step aside
        resolve(db);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Another Paribar tab is busy with storage. Close other Paribar tabs and reload.'));
    });
    return dbPromise;
  }
  const hasStore = (db, name) => db.objectStoreNames.contains(name);

  // Small helper to run a transaction and wait for it to finish
  async function tx(stores, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(stores.filter((n) => hasStore(db, n)), mode);
      const result = fn(t, db);
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  async function getAll(store) {
    const db = await open();
    if (!hasStore(db, store)) return [];
    return new Promise((resolve, reject) => {
      const req = db.transaction(store).objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  return {
    // Load the full dataset into memory
    async loadAll() {
      const [people, relationships, meta, oldVisits] = await Promise.all([
        getAll('people'), getAll('relationships'), getAll('meta'), getAll('visits'), // "visits" store only on phones the first v1.0 upgraded
      ]);
      const metaObj = {}; const visits = new Map(oldVisits.map((v) => [v.id, v]));
      meta.forEach((m) => { if (String(m.key).startsWith(VISIT)) visits.set(m.value.id, m.value); else metaObj[m.key] = m.value; });
      return { people, relationships, meta: metaObj, visits: [...visits.values()] };
    },
    put(store, obj) {
      if (store === 'visits') return tx(['meta'], 'readwrite', (t) => t.objectStore('meta').put({ key: VISIT + obj.id, value: obj }));
      return tx([store], 'readwrite', (t) => t.objectStore(store).put(obj));
    },
    del(store, id) {
      if (store === 'visits') return tx(['meta', 'visits'], 'readwrite', (t, db) => {
        t.objectStore('meta').delete(VISIT + id);
        if (hasStore(db, 'visits')) t.objectStore('visits').delete(id);
      });
      return tx([store], 'readwrite', (t) => t.objectStore(store).delete(id));
    },
    setMeta(key, value) { return tx(['meta'], 'readwrite', (t) => t.objectStore('meta').put({ key, value })); },

    // Replace everything (used by Import → Replace, merges, demo, erase)
    async replaceAll({ people, relationships, meta, visits = [] }) {
      return tx(['people', 'relationships', 'meta', 'visits'], 'readwrite', (t, db) => {
        const ps = t.objectStore('people'), rs = t.objectStore('relationships'), ms = t.objectStore('meta');
        ps.clear(); rs.clear(); ms.clear();
        if (hasStore(db, 'visits')) t.objectStore('visits').clear(); // move any old-store visits into meta
        people.forEach((p) => ps.put(p));
        relationships.forEach((r) => rs.put(r));
        Object.entries(meta || {}).forEach(([key, value]) => ms.put({ key, value }));
        visits.forEach((v) => ms.put({ key: VISIT + v.id, value: v }));
      });
    },

    // Ask the browser not to evict our data when the phone is low on space
    async requestPersist() {
      if (navigator.storage && navigator.storage.persist) {
        const already = await navigator.storage.persisted();
        return already || (await navigator.storage.persist());
      }
      return false;
    },
    async isPersisted() {
      return navigator.storage && navigator.storage.persisted ? navigator.storage.persisted() : false;
    },
    async estimate() {
      return navigator.storage && navigator.storage.estimate ? navigator.storage.estimate() : null;
    },
  };
})();

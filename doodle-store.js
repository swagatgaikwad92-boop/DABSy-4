/* ============================================================
   D.A.B.S.y — doodle-store.js  (v12.1 · Doodle Space persistence)
   IndexedDB, one record per page (so saving after a stroke writes ONE small page, never the whole notebook).
   Pages are stored as vector strokes (a few KB), not bitmaps. Fun and Maths notebooks are separate keys.
     meta record  "meta:<mode>"  -> { pages:[id,...], current:id, paper:"plain|grid|ruled" }
     page record  "page:<mode>:<id>" -> { id, strokes:[...], blocks:[...], updated }
   Storage failure: if IndexedDB is unavailable (private mode / quota), work stays in memory for this session and the UI is told
   (store.status().persistent === false) — nothing pretends to be saved when it isn't.
   Nothing here touches the network.
   ============================================================ */
(function(){
  const DB = "dabsy-doodle", ST = "kv";
  let dbp = null, mem = new Map(), persistent = true, lastError = "", listeners = [];
  const say = () => listeners.forEach(f => { try{ f(status()); }catch(_){} });
  function open(){
    if(dbp) return dbp;
    dbp = new Promise(res => {
      try{
        if(!window.indexedDB) throw new Error("IndexedDB isn't available");
        const rq = indexedDB.open(DB, 1);
        rq.onupgradeneeded = () => { rq.result.createObjectStore(ST); };
        rq.onsuccess = () => { rq.result.onclose = () => { persistent = false; say(); }; res(rq.result); };
        rq.onerror = () => { fail(rq.error); res(null); };
        rq.onblocked = () => { fail(new Error("blocked")); res(null); };
      }catch(e){ fail(e); res(null); }
    });
    return dbp;
  }
  function fail(e){ persistent = false; lastError = (e && e.message) || String(e || "unknown"); say(); }
  const tx = (db, mode) => db.transaction(ST, mode).objectStore(ST);
  const wrap = rq => new Promise((res, rej) => { rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
  async function get(key){
    const db = await open(); if(!db) return mem.has(key) ? mem.get(key) : null;
    try{ const v = await wrap(tx(db, "readonly").get(key)); return v === undefined ? (mem.has(key) ? mem.get(key) : null) : v; }catch(e){ fail(e); return mem.has(key) ? mem.get(key) : null; }
  }
  async function set(key, val){
    mem.set(key, val);                                        // always keep a session copy, so a failed write never loses the page you are on
    const db = await open(); if(!db) return false;
    try{ await wrap(tx(db, "readwrite").put(val, key)); if(!persistent && !lastError){ persistent = true; say(); } return true; }
    catch(e){ fail(e); return false; }
  }
  async function del(key){ mem.delete(key); const db = await open(); if(!db) return false; try{ await wrap(tx(db, "readwrite").delete(key)); return true; }catch(e){ fail(e); return false; } }
  const uid = () => "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  /* v12.1.2: each page also remembers its own paper ("bg": {k, c?, pat?}) and size key; the notebook remembers defaults for new pages and page names. */
  const mk = (id, o) => ({ id: id || uid(), strokes: [], blocks: [], bg: (o && o.bg) || null, size: (o && o.size) || null, updated: Date.now() });

  /* A notebook is loaded once per open; pages are fetched on demand. */
  async function loadNotebook(mode){
    let meta = await get("meta:" + mode);
    if(!meta || !Array.isArray(meta.pages) || !meta.pages.length){ const p = mk(); meta = { pages: [p.id], current: p.id, paper: mode === "maths" ? "grid" : "plain", bg: { k: mode === "maths" ? "graph" : "plain" }, size: "std", names: {} }; await set("page:" + mode + ":" + p.id, p); await set("meta:" + mode, meta); }
    if(!meta.pages.includes(meta.current)) meta.current = meta.pages[0];
    if(!meta.bg) meta.bg = { k: meta.paper === "grid" ? (mode === "maths" ? "graph" : "grid") : meta.paper === "ruled" ? "ruled" : "plain" };   // upgrade from v12.1
    if(!meta.size) meta.size = "std"; if(!meta.names) meta.names = {};
    return meta;
  }
  const saveMeta = (mode, meta) => set("meta:" + mode, meta);
  async function loadPage(mode, id){ const p = await get("page:" + mode + ":" + id); return p && Array.isArray(p.strokes) ? p : mk(id); }
  const savePage = (mode, page) => { page.updated = Date.now(); return set("page:" + mode + ":" + page.id, page); };
  const deletePage = (mode, id) => del("page:" + mode + ":" + id);
  const status = () => ({ persistent, error: lastError });
  const onStatus = f => { listeners.push(f); };

  /* Where did we really keep the work? Used by the Doodle Space "storage" notice. */
  async function estimate(){ try{ if(navigator.storage && navigator.storage.estimate){ const e = await navigator.storage.estimate(); return { usage: e.usage, quota: e.quota }; } }catch(_){} return null; }
  async function requestPersist(){ try{ return !!(navigator.storage && navigator.storage.persist && await navigator.storage.persist()); }catch(_){ return false; } }

  window.DABSy = window.DABSy || {};
  window.DABSy.doodleStore = { loadNotebook, saveMeta, loadPage, savePage, deletePage, mk, status, onStatus, estimate, requestPersist, _mem: mem };
})();

// AuraFace offline. Alla pubblicazione, scripts/finalize-pages.mjs sostituisce BUILD e SHELL con la versione e l'elenco dei file dell'app.
const BUILD = "925572a88f4e";
const SHELL = ["_next/static/Lf2Gs-OCZDt0l-91Zsbpy/_buildManifest.js","_next/static/Lf2Gs-OCZDt0l-91Zsbpy/_ssgManifest.js","_next/static/chunks/139.7a5a8e93a21948c1.js","_next/static/chunks/255-0516df34a2a4556b.js","_next/static/chunks/256.13a44f886e437141.js","_next/static/chunks/258.311ddbc3b4e554dd.js","_next/static/chunks/355.3a83a6c836f93d42.js","_next/static/chunks/4bd1b696-c023c6e3521b1417.js","_next/static/chunks/619-ba102abea3e3d0e4.js","_next/static/chunks/646.f342b7cffc01feb0.js","_next/static/chunks/734.db15ec04d27c56e6.js","_next/static/chunks/901.4485088200b0a116.js","_next/static/chunks/app/_not-found/page-3652544a139e42b1.js","_next/static/chunks/app/guide/[slug]/page-984f068264441a39.js","_next/static/chunks/app/layout-56920724188d57bd.js","_next/static/chunks/app/page-2bb23b13956f65a0.js","_next/static/chunks/app/privacy/page-9888d31d79a8e4be.js","_next/static/chunks/app/scopri/page-984f068264441a39.js","_next/static/chunks/framework-acd67e14855de5a2.js","_next/static/chunks/main-a9f5b5f66e5d3205.js","_next/static/chunks/main-app-5ff141cfe7c6bad8.js","_next/static/chunks/pages/_app-82835f42865034fa.js","_next/static/chunks/pages/_error-013f4188946cdd04.js","_next/static/chunks/polyfills-42372ed130431b0a.js","_next/static/chunks/webpack-2ec9a4e53759f2a2.js","_next/static/css/7629b4165b060606.css","icon-192.png","icon-512.png","manifest.webmanifest"];
const SHELL_CACHE = "auraface-shell", MODEL_CACHE = "auraface-models-v1";
const scope = self.registration.scope;
const MODELS = ["vision_wasm_internal.js", "vision_wasm_internal.wasm", "face_landmarker.task", "selfie_multiclass.tflite", "pose_landmarker_full.task"].map((f) => `${scope}mediapipe/${f}`);

/** Safari non mostra offline una pagina salvata dopo un reindirizzamento: si salva una copia "pulita". */
async function clean(res) {
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
}

async function store(cache, url) {
  const res = await fetch(url, { cache: "reload" });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  await cache.put(url, await clean(res));
}

async function cacheModels() {
  const cache = await caches.open(MODEL_CACHE);
  for (const url of MODELS) if (!(await cache.match(url))) { try { await store(cache, url); } catch (e) { /* riprova al prossimo avvio */ } }
  for (const client of await self.clients.matchAll()) client.postMessage({ type: "offline-status" });
}

self.addEventListener("install", (event) => {
  // L'interfaccia (circa 1 MB) si salva subito, così l'app si attiva in pochi secondi.
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE), urls = [scope, ...SHELL.map((p) => scope + p)];
    await store(cache, scope);
    await Promise.allSettled(urls.slice(1).map((u) => store(cache, u)));
    for (const req of await cache.keys()) if (!urls.includes(req.url)) await cache.delete(req);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== SHELL_CACHE && key !== MODEL_CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

// I modelli AI (38 MB) si scaricano dopo, su richiesta della pagina, senza bloccare l'attivazione.
self.addEventListener("message", (event) => { if (event.data === "cache-models") event.waitUntil(cacheModels()); });

self.addEventListener("fetch", (event) => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || !req.url.startsWith(scope.replace(/\/$/, ""))) return;
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        const res = await Promise.race([fetch(req), new Promise((_, no) => setTimeout(() => no(new Error("lenta")), 4000))]);
        if (res.ok && (url.pathname === new URL(scope).pathname || url.pathname.endsWith("/index.html"))) await cache.put(scope, await clean(res.clone()));
        return res.redirected ? clean(res) : res;
      } catch {
        return (await cache.match(scope)) ?? Response.error();
      }
    })());
    return;
  }
  event.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok && (url.pathname.includes("/_next/static/") || url.pathname.includes("/mediapipe/"))) {
      const cache = await caches.open(url.pathname.includes("/mediapipe/") ? MODEL_CACHE : SHELL_CACHE);
      cache.put(req, res.clone());
    }
    return res;
  })());
});

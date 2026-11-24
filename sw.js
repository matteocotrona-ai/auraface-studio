// AuraFace: funziona anche offline. I modelli AI e i file dell'app restano sul dispositivo dopo il primo avvio.
const CACHE = "auraface-v1";
const scope = self.registration.scope;
const MODELS = ["vision_wasm_internal.js", "vision_wasm_internal.wasm", "face_landmarker.task", "selfie_multiclass.tflite", "pose_landmarker_full.task"].map((f) => `${scope}mediapipe/${f}`);

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled([scope, ...MODELS].map((url) => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  // Pagine: prima la rete, così gli aggiornamenti arrivano subito; offline si usa la copia salvata.
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try { const res = await fetch(req); (await caches.open(CACHE)).put(scope, res.clone()); return res; }
      catch { return (await caches.match(scope)) ?? Response.error(); }
    })());
    return;
  }
  // Modelli e file con nome versionato: prima la copia salvata.
  if (url.pathname.includes("/mediapipe/") || url.pathname.includes("/_next/static/") || /\.(png|webmanifest)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
      return res;
    })());
  }
});

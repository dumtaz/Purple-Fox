/* Offline cache for Purple Fox. Bump VERSION when you change any file. */
const VERSION = "pf-v10";
const FILES = [
  "./", "index.html", "app.css", "app.js", "seed.js", "tts.js", "studio.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
  "assets/v2/pose-desk.png", "assets/v2/pose-coffee.png", "assets/v2/pose-relax.png", "assets/v2/pose-back.png", "assets/v2/logo.png", "assets/v2/subscribe.png", "assets/v2/expr-normal.png", "assets/v2/expr-talking.png", "assets/v2/expr-happy.png", "assets/v2/expr-wink.png", "assets/v2/expr-thinking.png", "assets/v2/expr-shocked.png", "assets/v2/expr-stressed.png"
];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request, {ignoreSearch: true}).then(hit => hit || fetch(e.request).then(res => {
      const host = new URL(e.request.url).hostname;
      if ((res.ok || res.type === "opaque") && (new URL(e.request.url).origin === location.origin || host === "cdn.jsdelivr.net" || host === "cdnjs.cloudflare.com")) {
        const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match("index.html")))
  );
});

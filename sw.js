// Service worker: offline support and installability. Registered by js/pwa.js.
//
// Network first for every same-origin GET, with the cache as the fallback. The site has no
// build step and no hashed file names, so serving modules from the cache first could mix
// two deploys (a new index.html with an old content.js); network first never does while
// online. Everything the visitor loads is kept, so a second visit works offline.
// Cross-origin requests (the GitHub API) are left alone.
const CACHE = "pm-runtime-v1";
const OFFLINE_FALLBACK = "./";
const SHELL = ["./", "index.html", "cv/", "manifest.webmanifest", "assets/favicon.svg", "assets/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => {}) // a missing shell file must not block the install
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Range requests (audio seeking) bypass the cache.
  if (request.headers.has("range")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request, { ignoreSearch: request.mode === "navigate" });
        if (cached) return cached;
        if (request.mode === "navigate") {
          const shell = await caches.match(OFFLINE_FALLBACK);
          if (shell) return shell;
        }
        return Response.error();
      })
  );
});

/* Usetally service worker: offline access.
 * - App files (scripts, styles, fonts, icons) are cached as they load.
 * - Pages: network first. Pages you've opened while signed in stay
 *   readable offline (read-only); anything else shows /offline.
 * - Never cached: API calls, payments, sign-in, PDFs, form submissions.
 * - Signing out clears every cached page on this device.
 */
const VERSION = "pt-v1";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const OFFLINE_URL = "/offline";
const MAX_PAGES = 60;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll([OFFLINE_URL, "/icons/icon-192.png", "/manifest.webmanifest"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "clear-pages") event.waitUntil(caches.delete(PAGES));
});

const NEVER = /^\/(api|auth|pay|login|signup|forgot|reset|invite|onboarding)(\/|$)|\/pdf(\/|$)|^\/_next\/data/;
const STATIC_RE = /^\/(_next\/static|fonts|icons|hero)\//;

async function trim(cache) {
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_PAGES))) await cache.delete(k);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER.test(url.pathname)) return;

  if (STATIC_RE.test(url.pathname)) {
    // hashed files never change: cache first
    event.respondWith(caches.open(STATIC).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.type === "basic") cache.put(req, res.clone());
      return res;
    }));
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(PAGES);
      try {
        const res = await fetch(req);
        // keep a copy of successful pages that aren't redirects to sign in
        if (res.ok && res.type === "basic" && !res.redirected) {
          cache.put(url.pathname + url.search, res.clone()).then(() => trim(cache));
        }
        return res;
      } catch {
        return (await cache.match(url.pathname + url.search)) || (await cache.match(url.pathname)) || (await caches.match(OFFLINE_URL)) || Response.error();
      }
    })());
  }
});

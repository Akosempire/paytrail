/* Usetally service worker: offline access.
 * - App files (scripts, styles, fonts, icons) are cached as they load.
 * - The offline app (/offline-app) and all its files are kept on the device,
 *   so the whole app works with no internet: when /app can't be reached, it
 *   opens instead, on the same screen, using the data saved on this device.
 * - Logos and signatures (/media) are cached so documents look right offline.
 * - Other pages: network first, the last copy if offline, else /offline.
 * - Never cached: API calls (including offline sync), payments, sign-in, PDFs.
 * - Signing out clears cached pages and media from this device.
 */
const VERSION = "pt-v2";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const MEDIA = `${VERSION}-media`;
const OFFLINE_URL = "/offline";
const OFFLINE_APP = "/offline-app";
const MAX_PAGES = 60;
const MAX_MEDIA = 80;

// fetch the offline app and every script and stylesheet it needs
async function warmOfflineApp() {
  const cache = await caches.open(STATIC);
  const res = await fetch(OFFLINE_APP, { cache: "no-store", credentials: "same-origin" });
  if (!res.ok || res.redirected) return;
  const html = await res.clone().text();
  const assets = [...new Set([...html.matchAll(/\/_next\/static\/[^"'\s)\\]+/g)].map((m) => m[0]))];
  for (const a of assets) {
    if (await cache.match(a)) continue;
    try { const r = await fetch(a); if (r.ok) await cache.put(a, r); } catch { /* try again next time */ }
  }
  await cache.put(OFFLINE_APP, res);
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC);
    await cache.addAll([OFFLINE_URL, "/icons/icon-192.png", "/manifest.webmanifest"]);
    await warmOfflineApp().catch(() => {});
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "clear-pages") event.waitUntil(Promise.all([caches.delete(PAGES), caches.delete(MEDIA)]));
  if (event.data?.type === "warm-offline") event.waitUntil(warmOfflineApp().catch(() => {}));
});

const NEVER = /^\/(api|auth|pay|login|signup|forgot|reset|invite|onboarding)(\/|$)|\/pdf(\/|$)|^\/_next\/data/;
const STATIC_RE = /^\/(_next\/static|fonts|icons|hero)\//;

async function trim(cache, max) {
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(k);
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

  if (url.pathname.startsWith("/media/")) {
    // logos and signatures: the cached copy, refreshed in the background
    event.respondWith(caches.open(MEDIA).then(async (cache) => {
      const hit = await cache.match(req);
      const fresh = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()).then(() => trim(cache, MAX_MEDIA)); return res; }).catch(() => null);
      return hit || (await fresh) || Response.error();
    }));
    return;
  }

  if (req.mode !== "navigate") return;

  if (url.pathname === OFFLINE_APP) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok && !res.redirected) caches.open(STATIC).then((c) => c.put(OFFLINE_APP, res.clone()));
        return res;
      } catch {
        return (await caches.match(OFFLINE_APP)) || (await caches.match(OFFLINE_URL)) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(PAGES);
    try {
      const res = await fetch(req);
      // keep a copy of successful pages that aren't redirects to sign in
      if (res.ok && res.type === "basic" && !res.redirected && !url.pathname.startsWith("/app")) {
        cache.put(url.pathname + url.search, res.clone()).then(() => trim(cache, MAX_PAGES));
      }
      return res;
    } catch {
      // the app itself: open the offline app on the same screen
      if (/^\/app(\/|$)/.test(url.pathname) && (await caches.match(OFFLINE_APP))) {
        return Response.redirect(`${OFFLINE_APP}#${url.pathname}${url.search}`, 302);
      }
      return (await cache.match(url.pathname + url.search)) || (await cache.match(url.pathname)) || (await caches.match(OFFLINE_URL)) || Response.error();
    }
  })());
});

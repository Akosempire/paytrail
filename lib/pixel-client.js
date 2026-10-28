"use client";
// The Meta Pixel in the browser, loaded on demand. Events carry an eventID
// shared with the Conversions API, so Meta keeps just one of each.
let loadedId = null;
export function ensurePixel(id) {
  if (!id || typeof window === "undefined") return false;
  if (!window.fbq) {
    /* eslint-disable */
    !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    /* eslint-enable */
  }
  if (loadedId !== id) { window.fbq("init", id); loadedId = id; }
  return true;
}
export function pixelTrack(name, params, eventId) {
  if (!window.fbq) return;
  window.fbq("track", name, params || {}, eventId ? { eventID: eventId } : undefined);
}

export function readCookie(name) {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? m[1] : null;
}
export function writeCookie(name, value, days) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${value}; Max-Age=${Math.round(days * 86400)}; Path=/; SameSite=Lax${secure}`;
}

// site settings (Pixel ID) and the visitor's country, each fetched once per tab
let configP = null, geoP = null;
export const siteConfig = () => (configP ||= fetch("/site-config.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
export const visitorGeo = () => (geoP ||= (async () => {
  try { const c = sessionStorage.getItem("ut_geo"); if (c !== null) return c || null; } catch {}
  const country = await fetch("/api/geo").then((r) => (r.ok ? r.json() : {})).then((j) => j.country || "").catch(() => "");
  try { sessionStorage.setItem("ut_geo", country); } catch {}
  return country || null;
})());

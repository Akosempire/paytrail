"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { adTagsAllowed, consentRequired, fbcFrom, parseAttribution } from "@/lib/attribution-core";
import { ensurePixel, pixelTrack, readCookie, siteConfig, visitorGeo, writeCookie } from "@/lib/pixel-client";

// On public pages and the sign-up flow (never in the app, admin, or a
// business's own customer pages):
//  - remembers which ad brought the visitor (UTM tags, fbclid) for 30 days:
//    ut_attr = first touch (never replaced), ut_attr_last = latest touch
//  - loads the Meta Pixel (ID from Admin → Marketing) with a PageView, and
//    sends browser copies of server events queued in ut_meta_ev
// In the EU, EEA, UK and Switzerland it first asks; elsewhere it doesn't.
export function MarketingTags({ pixel = false }) {
  const path = usePathname() || "/";
  const [ask, setAsk] = useState(false);
  const [consent, setConsent] = useState(null); // "yes" | "no" | "implied"

  useEffect(() => {
    if (consent) return;
    const saved = readCookie("ut_consent");
    if (saved === "yes" || saved === "no") { setConsent(saved); return; }
    let gone = false;
    visitorGeo().then((country) => { if (gone) return; if (consentRequired(country)) setAsk(true); else setConsent("implied"); });
    return () => { gone = true; };
  }, [consent]);

  useEffect(() => {
    if (!adTagsAllowed(path) || !(consent === "yes" || consent === "implied")) return;
    // which ad: first touch kept, last touch updated
    const a = parseAttribution(location.href);
    if (a) {
      const val = encodeURIComponent(JSON.stringify(a));
      if (!readCookie("ut_attr")) writeCookie("ut_attr", val, 30);
      writeCookie("ut_attr_last", val, 30);
      if (a.fbclid && !readCookie("_fbc")) writeCookie("_fbc", fbcFrom(a.fbclid), 90);
    }
    if (!pixel) return;
    siteConfig().then((cfg) => {
      const id = cfg?.meta?.pixel;
      if (!id || !ensurePixel(id)) return;
      pixelTrack("PageView");
      // the browser half of events the server already sent (same event ID)
      const queued = readCookie("ut_meta_ev");
      if (queued) {
        try { for (const e of JSON.parse(decodeURIComponent(queued))) pixelTrack(e.n, e.v != null && e.c ? { value: e.v, currency: e.c } : {}, e.id); } catch {}
        writeCookie("ut_meta_ev", "", 0);
      }
    });
  }, [path, consent, pixel]);

  if (!ask || consent || !adTagsAllowed(path)) return null;
  const choose = (v) => { writeCookie("ut_consent", v, 365); setConsent(v); setAsk(false); };
  return (
    <div role="dialog" aria-label="Cookies" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-[520px] rounded-2xl bg-surface p-4 shadow-[var(--shadow-overlay,0_20px_40px_-12px_rgba(0,0,0,.35))] ring-1 ring-line sm:bottom-5 sm:p-5">
      <p className="text-[14px] leading-relaxed text-ink-2">We use cookies to see which ads bring people to Usetally. Is that OK? <a href="/privacy" className="font-medium text-brand-ink underline-offset-2 hover:underline">Privacy</a></p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => choose("no")} className="h-11 flex-1 rounded-xl text-[14px] font-semibold text-ink ring-1 ring-line-strong hover:bg-tray">No thanks</button>
        <button type="button" onClick={() => choose("yes")} className="h-11 flex-1 rounded-xl bg-brand text-[14px] font-semibold text-white hover:opacity-90">Accept</button>
      </div>
    </div>
  );
}

// one event in the app itself (e.g. Purchase on the billing page), sent once
export function MetaEvent({ name, eventId, value, currency }) {
  useEffect(() => {
    if (!eventId) return;
    try { if (localStorage.getItem(`ut_ev:${eventId}`)) return; } catch {}
    (async () => {
      const saved = readCookie("ut_consent");
      if (saved === "no") return;
      if (saved !== "yes" && consentRequired(await visitorGeo())) return;
      const cfg = await siteConfig();
      if (!cfg?.meta?.pixel || !ensurePixel(cfg.meta.pixel)) return;
      pixelTrack(name, value != null && currency ? { value, currency } : {}, eventId);
      try { localStorage.setItem(`ut_ev:${eventId}`, "1"); } catch {}
    })();
  }, [name, eventId, value, currency]);
  return null;
}

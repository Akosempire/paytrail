"use client";
import { useEffect } from "react";

// Loads the analytics set in Admin → Integrations → Analytics (live site only).
// Read at runtime, so changing them never needs a redeploy.
export function Analytics() {
  useEffect(() => {
    let gone = false;
    const add = (src, attrs = {}) => {
      if (document.querySelector(`script[src="${src}"]`)) return;
      const s = document.createElement("script");
      s.async = true; s.src = src;
      for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
      document.head.appendChild(s);
    };
    fetch("/site-config.json").then((r) => (r.ok ? r.json() : null)).then((cfg) => {
      if (gone || !cfg?.analytics) return;
      const { sabilytics, ga } = cfg.analytics;
      if (sabilytics?.site) add("https://www.sabilytics.com/script.js", { "data-site": sabilytics.site, "data-domain": sabilytics.domain });
      if (ga) {
        add(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga)}`);
        window.dataLayer = window.dataLayer || [];
        window.gtag = function gtag() { window.dataLayer.push(arguments); };
        window.gtag("js", new Date());
        window.gtag("config", ga);
      }
    }).catch(() => {});
    return () => { gone = true; };
  }, []);
  return null;
}

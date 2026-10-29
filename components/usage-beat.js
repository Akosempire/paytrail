"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { usageArea } from "@/lib/usage-core";

// Counts active time per app area: only while the tab is visible and the
// person did something in the last 2 minutes. Sent every minute, and when the
// page is hidden or left. Nothing about what's on the page is sent.
const TICK = 15, IDLE = 120_000, FLUSH_AT = 60;

export function UsageBeat() {
  const path = usePathname();
  const area = useRef(usageArea(path));
  const pending = useRef(new Map());
  const lastActive = useRef(Date.now());

  useEffect(() => { area.current = usageArea(path); lastActive.current = Date.now(); }, [path]);

  useEffect(() => {
    const send = (useBeacon) => {
      const items = [...pending.current].filter(([, s]) => s > 0).map(([a, seconds]) => ({ area: a, seconds }));
      pending.current.clear();
      if (!items.length) return;
      const body = JSON.stringify({ items });
      try {
        if (useBeacon && navigator.sendBeacon?.("/api/usage", new Blob([body], { type: "application/json" }))) return;
        fetch("/api/usage", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
      } catch { /* usage is best effort */ }
    };
    const active = () => { lastActive.current = Date.now(); };
    const tick = setInterval(() => {
      if (document.visibilityState !== "visible" || !area.current || Date.now() - lastActive.current > IDLE) return;
      const m = pending.current;
      m.set(area.current, (m.get(area.current) || 0) + TICK);
      if ([...m.values()].reduce((a, b) => a + b, 0) >= FLUSH_AT) send(false);
    }, TICK * 1000);
    const hide = () => { if (document.visibilityState === "hidden") send(true); };
    const events = ["pointerdown", "keydown", "scroll", "touchstart", "mousemove"];
    events.forEach((e) => window.addEventListener(e, active, { passive: true }));
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", () => send(true));
    return () => {
      clearInterval(tick);
      events.forEach((e) => window.removeEventListener(e, active));
      document.removeEventListener("visibilitychange", hide);
      send(true);
    };
  }, []);
  return null;
}

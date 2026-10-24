"use client";
import { useEffect, useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { Logo } from "@/components/ui";

// Registers the service worker (offline access). Skipped in development so
// cached files never hide code changes.
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production" && !window.localStorage?.getItem?.("pt-sw-dev")) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}

// call before signing out: removes cached pages from this device
export function clearOfflinePages() {
  try { navigator.serviceWorker?.controller?.postMessage({ type: "clear-pages" }); } catch { /* no worker */ }
  try { caches?.keys?.().then((keys) => keys.filter((k) => k.endsWith("-pages")).forEach((k) => caches.delete(k))); } catch { /* no cache api */ }
}

const DISMISS_KEY = "pt-install-dismissed";
const read = (k) => { try { return window.localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { window.localStorage.setItem(k, v); } catch { /* storage blocked */ } };

// A pop-up on phones asking to install PayTrail. Android/Chrome uses the
// browser's install prompt; iPhone/iPad Safari gets "Add to Home Screen" steps.
// Not shown when already installed, on desktop, or for 14 days after "Not now".
export function InstallPrompt({ delay = 3500 }) {
  const [event, setEvent] = useState(null);
  const [mode, setMode] = useState(null); // "prompt" | "ios"
  useEffect(() => {
    const standalone = matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
    const phone = matchMedia("(max-width: 820px) and (pointer: coarse)").matches;
    const dismissed = Number(read(DISMISS_KEY) || 0);
    if (standalone || !phone || Date.now() - dismissed < 14 * 86400000) return;
    let timer;
    const onPrompt = (e) => { e.preventDefault(); setEvent(e); timer = setTimeout(() => setMode("prompt"), delay); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
    const safari = /safari/i.test(ua) && !/crios|fxios|edgios|opios/i.test(ua);
    if (ios && safari) timer = setTimeout(() => setMode("ios"), delay);
    const onInstalled = () => setMode(null);
    window.addEventListener("appinstalled", onInstalled);
    return () => { clearTimeout(timer); window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, [delay]);

  if (!mode) return null;
  const close = () => { write(DISMISS_KEY, String(Date.now())); setMode(null); };
  const install = async () => {
    if (!event) return close();
    event.prompt();
    const choice = await event.userChoice.catch(() => null);
    if (choice?.outcome !== "accepted") write(DISMISS_KEY, String(Date.now()));
    setEvent(null); setMode(null);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] p-3 pb-[max(12px,env(safe-area-inset-bottom))]" role="dialog" aria-modal="false" aria-labelledby="pt-install-title">
      <div className="mx-auto max-w-md animate-rise rounded-2xl bg-surface p-4 shadow-[var(--shadow-dialog)] ring-1 ring-line">
        <div className="flex items-start gap-3">
          <Logo className="size-11 shrink-0" />
          <div className="min-w-0 flex-1">
            <p id="pt-install-title" className="text-title-3 text-ink">Install PayTrail</p>
            <p className="mt-0.5 text-[13px] text-ink-2">Open it from your home screen like an app: faster, full screen, and readable offline.</p>
          </div>
          <button type="button" onClick={close} aria-label="Close" className="-mt-1 -mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-hover hover:text-ink"><X className="size-4" /></button>
        </div>
        {mode === "ios" ? (
          <ol className="mt-3 space-y-2 rounded-xl bg-tray p-3 text-[13px] text-ink-2">
            <li className="flex items-center gap-2"><span className="inline-flex size-6 items-center justify-center rounded-full bg-surface text-xs font-semibold text-ink ring-1 ring-line">1</span>Tap <Share className="size-4 text-brand" aria-label="Share" /> <strong className="text-ink">Share</strong> in Safari's toolbar</li>
            <li className="flex items-center gap-2"><span className="inline-flex size-6 items-center justify-center rounded-full bg-surface text-xs font-semibold text-ink ring-1 ring-line">2</span>Choose <SquarePlus className="size-4 text-brand" aria-hidden="true" /> <strong className="text-ink">Add to Home Screen</strong></li>
          </ol>
        ) : (
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={close} className="h-11 flex-1 rounded-lg text-sm font-medium text-ink-2 ring-1 ring-line-strong hover:bg-hover">Not now</button>
            <button type="button" onClick={install} className="inline-flex h-11 flex-[1.4] items-center justify-center gap-2 rounded-lg bg-primary-gradient text-sm font-semibold text-white"><Download className="size-4" />Install app</button>
          </div>
        )}
      </div>
    </div>
  );
}

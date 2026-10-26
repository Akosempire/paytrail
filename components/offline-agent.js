"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CloudOff, RefreshCw } from "lucide-react";
import { load, subscribe, sync, current } from "@/lib/offline/engine";

// In the online app: keeps this device's offline copy up to date in the
// background, gets the offline app ready, and when the connection drops offers
// to carry on in offline mode on the same screen.
export function OfflineAgent() {
  const path = usePathname();
  const [s, setS] = useState(null);
  useEffect(() => {
    let stop = () => {};
    load().then(() => {
      stop = subscribe(setS);
      const last = current().lastSync ? Date.parse(current().lastSync) : 0;
      if (navigator.onLine && Date.now() - last > 60 * 1000) sync();
    });
    const warm = () => navigator.serviceWorker?.controller?.postMessage({ type: "warm-offline" });
    if (navigator.serviceWorker?.controller) warm(); else navigator.serviceWorker?.addEventListener?.("controllerchange", warm, { once: true });
    return () => stop();
  }, []);
  // after a change online (a save, a payment), refresh the copy soon
  useEffect(() => { const t = setTimeout(() => { if (navigator.onLine && current().ready) sync(); }, 4000); return () => clearTimeout(t); }, [path]);

  if (!s) return null;
  if (!s.online) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-50 p-3 pb-[max(12px,env(safe-area-inset-bottom))] print:hidden" role="status">
        <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-surface p-3 shadow-[var(--shadow-dialog)] ring-1 ring-line">
          <CloudOff className="size-5 shrink-0 text-warn" />
          <p className="min-w-0 flex-1 text-[13px] text-ink-2"><strong className="text-ink">You're offline.</strong> Keep working: changes sync when you're back.</p>
          <a href={`/offline-app#${path}`} className="inline-flex h-9 shrink-0 items-center rounded-lg bg-primary-gradient px-3 text-[13px] font-semibold text-white">Continue offline</a>
        </div>
      </div>
    );
  }
  if (s.outbox.length) {
    return (
      <div className="fixed bottom-4 right-4 z-50 print:hidden" role="status">
        <a href="/offline-app" className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-2 text-[12.5px] font-medium text-ink-2 shadow-[var(--shadow-dialog)] ring-1 ring-line">
          <RefreshCw className={`size-3.5 ${s.syncing ? "animate-spin" : ""}`} />Syncing {s.outbox.length} offline change{s.outbox.length === 1 ? "" : "s"}
        </a>
      </div>
    );
  }
  return null;
}

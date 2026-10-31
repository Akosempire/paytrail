"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CircleDashed, X } from "lucide-react";

// Once a business has invoices, the setup checklist shrinks to one slim line
// at the foot of the dashboard: it's a one-time job, not daily work. Closing it
// is remembered on this device for this person.
export function SetupStrip({ userId, items, done, total }) {
  const key = `usetally:setup-strip:${userId}`;
  const [hidden, setHidden] = useState(true); // hidden until we know it wasn't closed (no flash)
  useEffect(() => {
    let closed = false;
    try { closed = localStorage.getItem(key) === "1"; } catch { closed = false; }
    setHidden(closed);
  }, [key]);
  if (hidden || !items.length) return null;
  const next = items[0];
  return (
    <div data-tour="setup" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-tray px-4 py-2.5 text-[13px]">
      <CircleDashed className="size-4 shrink-0 text-ink-3" aria-hidden />
      <span className="text-ink-2">Setup: {done} of {total} done.</span>
      <Link href={next.href} className="inline-flex min-h-9 items-center gap-1 font-medium text-brand-ink hover:underline">{next.label}<ArrowRight className="size-3.5" /></Link>
      {items.length > 1 && <span className="text-ink-3 max-sm:hidden">+{items.length - 1} more</span>}
      <button type="button" onClick={() => { try { localStorage.setItem(key, "1"); } catch { /* storage blocked */ } setHidden(true); }}
        aria-label="Hide setup checklist" className="ml-auto inline-flex size-9 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink max-sm:size-11">
        <X className="size-4" />
      </button>
    </div>
  );
}

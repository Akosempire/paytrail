"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";

// News from the Usetally team (Admin → Announcements) at the top of the
// dashboard. Closing it hides it on this device.
export function AnnouncementBanner({ a, preview = false }) {
  const key = `pt-announce-${a?.id}`;
  const [hidden, setHidden] = useState(!preview); // hidden until we've checked, so it never flashes
  useEffect(() => {
    if (preview) return;
    try { setHidden(localStorage.getItem(key) === "closed"); } catch { setHidden(false); }
  }, [key, preview]);
  if (!a?.title || hidden) return null;
  const close = () => { setHidden(true); try { localStorage.setItem(key, "closed"); } catch { /* private mode */ } };
  const external = /^https?:/.test(a.link_href || "");
  return (
    <section aria-label="News from Usetally" className="flex min-h-11 items-center gap-2.5 rounded-lg bg-surface py-1.5 pr-1.5 pl-3 text-[13px] ring-1 ring-line">
      <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold text-violet-ink ring-1 ring-violet/30">New</span>
      <p className="min-w-0 flex-1 truncate text-ink" title={a.body || a.title}><span className="font-medium">{a.title}</span></p>
      {a.link_href && a.link_label && (
        <Link href={a.link_href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className="inline-flex shrink-0 items-center gap-1 font-medium whitespace-nowrap text-brand-ink hover:underline">
          {a.link_label}<ArrowRight className="size-3.5" />
        </Link>
      )}
      <button type="button" onClick={preview ? undefined : close} aria-label="Close this announcement"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink">
        <X className="size-4" />
      </button>
    </section>
  );
}

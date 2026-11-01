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
    <section aria-label="News from Usetally" className="flex min-h-11 items-center gap-2.5 rounded-xl bg-surface py-1.5 pr-1.5 pl-2 text-[13px] ring-1 ring-line shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(16,24,40,0.05),0_3px_8px_-3px_rgba(16,24,40,0.10)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_4px_12px_-6px_rgba(0,0,0,0.9)]">
      <span className="shrink-0 rounded-md bg-violet-soft px-1.5 py-0.5 text-[11px] font-semibold text-violet-ink shadow-[inset_0_-1px_0_rgba(0,0,0,0.06)] dark:bg-violet/15">New</span>
      <p className="min-w-0 flex-1 truncate text-ink" title={a.body || a.title}><span className="font-medium">{a.title}</span></p>
      {a.link_href && a.link_label && (
        <Link href={a.link_href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className="inline-flex shrink-0 items-center gap-1 font-medium whitespace-nowrap text-brand-ink hover:underline">
          {a.link_label}<ArrowRight className="size-3.5" />
        </Link>
      )}
      <button type="button" onClick={preview ? undefined : close} aria-label="Close this announcement"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-3 hover:bg-hover hover:text-ink">
        <X className="size-4" />
      </button>
    </section>
  );
}

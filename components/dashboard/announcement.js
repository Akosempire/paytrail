"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles, X } from "lucide-react";

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
  const first = String(a.body || "").split(/\n{2,}/)[0]?.trim();
  const close = () => { setHidden(true); try { localStorage.setItem(key, "closed"); } catch { /* private mode */ } };
  const external = /^https?:/.test(a.link_href || "");
  return (
    <section aria-label="News from Usetally" className="relative flex flex-col gap-3 rounded-xl bg-surface p-4 pr-12 shadow-[var(--shadow-card)] ring-1 ring-violet/30 sm:flex-row sm:items-center sm:gap-4 sm:p-5 sm:pr-14">
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-violet-ink ring-1 ring-violet/30"><Sparkles className="size-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold tracking-[0.08em] text-violet-ink uppercase">New in Usetally</p>
        <p className="text-[15px] font-semibold text-ink">{a.title}</p>
        {first && <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{first}</p>}
      </div>
      {a.link_href && a.link_label && (
        <Link href={a.link_href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-lg bg-ink px-3.5 text-[13px] font-semibold text-surface hover:opacity-90 sm:self-center">
          {a.link_label}<ArrowRight className="size-4" />
        </Link>
      )}
      <button type="button" onClick={preview ? undefined : close} aria-label="Close this announcement"
        className="absolute top-3 right-3 inline-flex size-8 items-center justify-center rounded-lg text-ink-3 hover:bg-hover hover:text-ink">
        <X className="size-4" />
      </button>
    </section>
  );
}

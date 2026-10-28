"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Clock, X } from "lucide-react";
import { dueAgain, nudgeKey } from "@/lib/trial-nudge";

// Shown to whoever can pay, during the free trial (every 3 days, daily near
// the end). Leads with what they've already done (their real numbers), then
// the real offer: while it runs, 25% off a yearly plan if they pay before the
// trial ends. No fake timers: real days left, real end date.
export function TrialNudge({ businessId, nudge, stats, offer, freeLimit }) {
  const key = nudgeKey(businessId);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let stored = null;
    try { stored = localStorage.getItem(key); } catch {}
    if (dueAgain(stored, nudge)) { const t = setTimeout(() => setOpen(true), 900); return () => clearTimeout(t); }
  }, [key, nudge]);
  const close = () => { try { localStorage.setItem(key, new Date().toISOString().slice(0, 10)); } catch {} setOpen(false); };
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });
  if (!open) return null;

  const left = nudge.mode === "days"
    ? nudge.daysLeft === 0 ? "Your free trial ends today" : `Your free trial ends in ${nudge.daysLeft} day${nudge.daysLeft === 1 ? "" : "s"}`
    : nudge.docsLeft === 0 ? "You've used all your free documents" : `${nudge.docsLeft} free document${nudge.docsLeft === 1 ? "" : "s"} left`;
  const done = [
    stats.sent > 0 && [stats.sent, stats.sent === 1 ? "quote or invoice sent" : "quotes & invoices sent"],
    stats.collected && [stats.collected, "collected"],
    stats.customers > 0 && [stats.customers, stats.customers === 1 ? "customer" : "customers"],
  ].filter(Boolean);
  const sale = Boolean(offer?.discount);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 animate-fade-in bg-[#101828]/55 backdrop-blur-[2px]" onClick={close} />
      <div role="dialog" aria-modal="true" aria-labelledby="nudge-title"
        className="relative w-full max-w-md animate-rise rounded-t-3xl bg-surface px-6 pt-6 pb-[calc(env(safe-area-inset-bottom)+20px)] shadow-[var(--shadow-dialog)] ring-1 ring-line sm:rounded-3xl sm:pb-6">
        <button type="button" onClick={close} aria-label="Close" className="absolute top-3 right-3 grid size-10 place-items-center rounded-full text-ink-3 hover:bg-tray hover:text-ink"><X className="size-5" /></button>
        <p className="inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-2.5 py-1 text-[12px] font-semibold text-warn-ink"><Clock className="size-3.5" />{left}</p>
        <h2 id="nudge-title" className="mt-3 pr-8 text-[23px] leading-tight font-semibold tracking-[-0.02em] text-ink">
          {sale ? <>🎁 {offer.discount}% off your first year</> : done.length ? "Look what you've built." : "Keep Usetally working for you."}
        </h2>
        {sale && <p className="mt-1.5 text-[14px] text-ink-2">Pay before your free trial ends. Offer ends {offer.endsLabel}.</p>}

        {done.length > 0 && (
          <ul className={`mt-4 grid gap-2 ${done.length === 3 ? "grid-cols-3" : done.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
            {done.map(([value, label]) => (
              <li key={label} className="min-w-0 rounded-2xl bg-tray px-2 py-3 text-center">
                <span className={`block font-semibold tracking-[-0.02em] text-ink tabular-nums ${String(value).length > 8 ? "text-[15px]" : "text-[19px]"}`}>{value}</span>
                <span className="mt-0.5 block text-[11.5px] leading-tight text-ink-3">{label}</span>
              </li>
            ))}
          </ul>
        )}

        {offer && (
          <div className="mt-4 rounded-2xl border border-brand-line bg-brand-soft/40 p-4">
            <p className="text-[13px] font-semibold text-brand-ink">{sale ? `${offer.name}, yearly` : offer.founding ? `${offer.name} price · locked for life` : `${offer.name} plan`}</p>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
              <span className="text-[24px] font-semibold tracking-[-0.02em] text-ink">{offer.price}<span className="text-[14px] font-medium text-ink-3"> / {offer.interval}</span></span>
              {sale && <s className="text-[14px] text-ink-3">{offer.was}</s>}
            </p>
            {offer.perMonth && <p className="text-[12.5px] text-ink-3">That's {offer.perMonth} a month</p>}
            {offer.founding && offer.spotsLeft != null && <p className="mt-1.5 text-[12.5px] font-medium text-warn-ink">{offer.spotsLeft} of {offer.spots} founding spots left</p>}
            <ul className="mt-3 space-y-1.5 text-[13.5px] text-ink-2">
              {["No “Powered by Usetally” on your documents", offer.limit == null ? "Unlimited quotes & invoices" : `${offer.limit} quotes & invoices a month`, "Everything you set up stays as it is"].map((t) => (
                <li key={t} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" />{t}</li>
              ))}
            </ul>
          </div>
        )}
        {freeLimit != null && <p className="mt-3 text-[12.5px] text-ink-3">If you don't choose a plan, you move to Free: {freeLimit} documents a month.</p>}

        <Link href={sale ? "/app/settings/billing?interval=year" : "/app/settings/billing"} onClick={close}
          className="mt-5 flex h-12 items-center justify-center rounded-xl bg-brand text-[15px] font-semibold text-white hover:opacity-95">{sale ? `Get ${offer.discount}% off` : "Keep Usetally"}</Link>
        <button type="button" onClick={close} className="mt-1 h-11 w-full text-[14px] font-medium text-ink-3 hover:text-ink">Not now</button>
      </div>
    </div>
  );
}

"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui";
import { markTourDone } from "@/app/app/tour-actions";

// A short guided tour of the dashboard. It shines a spotlight on one part of
// the screen at a time (anything marked data-tour="…") with a card explaining
// it. Steps whose part isn't on screen for this person (their role can't see
// it, or it's inside the phone menu) fall back to the phone menu button or to
// a centred card, so the tour works for every role and screen size.
//
// It opens by itself once, on the dashboard, for anyone who hasn't finished
// or skipped it. "Take the tour" in the sidebar replays it, via the
// "usetally:tour" event.
const STEPS = [
  { title: "Welcome to Usetally 👋", body: "Here's a one-minute look around. Use the arrows or your keyboard, and skip whenever you like." },
  { anchor: "new-quote", title: "Start with a quote", body: "Create a branded quote in a minute. Add hidden costs to see your real profit before you send it." },
  { anchor: "nav:/app/quotes", mobile: "menu", title: "Quotes and invoices", body: "Every quote and invoice lives here. When a customer accepts a quote, turn it into an invoice in one click." },
  { anchor: "nav:/app/customers", mobile: "menu", title: "Your customers", body: "Save customers once and pick them on any quote or invoice. Their history stays in one place." },
  { anchor: "nav:/app/payments", mobile: "menu", title: "Payments and receipts", body: "Every payment, online or by transfer. Receipts are issued and emailed automatically." },
  { anchor: "nav:/app/settings/payments", mobile: "menu", title: "Get paid online", body: "Connect your own Paystack, Stripe, Flutterwave or Bachs account. Money goes straight to you." },
  { anchor: "nav:/app/settings", mobile: "menu", title: "Your brand", body: "Add your logo, colour and signature. They appear on every quote, invoice and receipt." },
  { anchor: "setup", title: "Your checklist", body: "Tick these off to finish setting up. You can come back to the tour any time from “Take the tour”." },
];

const PAD = 8; // space around the highlighted part
const visible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; };
const find = (key) => [...document.querySelectorAll(`[data-tour="${CSS.escape(key)}"]`)].find(visible) || null;

export function Tour({ userId, done: doneOnServer }) {
  const pathname = usePathname();
  const [step, setStep] = useState(null); // index, or null when closed
  const [box, setBox] = useState(null); // spotlight rect
  const [steps, setSteps] = useState(STEPS);
  const card = useRef(null);
  const storeKey = `usetally:tour-done:${userId}`;

  // which steps make sense here (skip parts this person can't see at all)
  const plan = useCallback(() => STEPS.filter((s) => !s.anchor || find(s.anchor) || (s.mobile && find(s.mobile))), []);

  const open = useCallback(() => { setSteps(plan()); setStep(0); }, [plan]);
  const close = useCallback(() => {
    setStep(null); setBox(null);
    try { localStorage.setItem(storeKey, "1"); } catch {}
    markTourDone().catch(() => {});
  }, [storeKey]);

  // first visit to the dashboard: open once
  useEffect(() => {
    if (pathname !== "/app" || doneOnServer) return;
    let seen = false;
    try { seen = localStorage.getItem(storeKey) === "1"; } catch {}
    if (seen) return;
    const t = setTimeout(open, 900);
    return () => clearTimeout(t);
  }, [pathname, doneOnServer, storeKey, open]);

  // "Take the tour" anywhere in the app
  useEffect(() => {
    const go = () => open();
    window.addEventListener("usetally:tour", go);
    return () => window.removeEventListener("usetally:tour", go);
  }, [open]);

  const current = step == null ? null : steps[step];
  const target = current?.anchor ? (find(current.anchor) || (current.mobile && find(current.mobile))) : null;
  const viaMenu = Boolean(current?.anchor && !find(current.anchor) && target);

  // follow the highlighted part as the page scrolls or resizes
  useLayoutEffect(() => {
    if (!current) return;
    if (!target) { setBox(null); return; }
    const r0 = target.getBoundingClientRect();
    if (r0.top < 72 || r0.bottom > window.innerHeight - 160) target.scrollIntoView({ block: "center", behavior: "smooth" });
    const measure = () => { const r = target.getBoundingClientRect(); setBox({ x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 }); };
    measure();
    const id = setInterval(measure, 120); // covers smooth scrolling and layout shifts
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { clearInterval(id); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [current, target]);

  // keyboard: arrows to move, Esc to leave; focus the card for screen readers
  useEffect(() => {
    if (step == null) return;
    card.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") setStep((s) => (s < steps.length - 1 ? s + 1 : s));
      else if (e.key === "ArrowLeft") setStep((s) => (s > 0 ? s - 1 : s));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, steps.length, close]);

  if (!current) return null;
  const last = step === steps.length - 1;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200, vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const CARD_W = Math.min(340, vw - 24);

  // place the card beside the spotlight: below, else above, else to the right; centred without one
  let pos;
  if (!box) pos = { left: (vw - CARD_W) / 2, top: Math.max(24, vh / 2 - 120) };
  else {
    const left = Math.min(Math.max(12, box.x + box.w / 2 - CARD_W / 2), vw - CARD_W - 12);
    if (box.y + box.h + 12 + 200 < vh) pos = { left, top: box.y + box.h + 12 };
    else if (box.y - 12 - 200 > 0) pos = { left, bottom: vh - box.y + 12 };
    else pos = { left: Math.min(box.x + box.w + 12, vw - CARD_W - 12), top: Math.max(12, Math.min(box.y, vh - 220)) };
  }

  return (
    <div className="fixed inset-0 z-[70]" role="presentation">
      {/* dimmed page with a hole over the highlighted part */}
      <svg className="absolute inset-0 size-full" aria-hidden="true" onClick={close}>
        <defs>
          <mask id="tour-hole">
            <rect width="100%" height="100%" fill="white" />
            {box && <rect x={box.x} y={box.y} width={box.w} height={box.h} rx="12" fill="black" className="transition-all duration-300" />}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgb(16 24 40 / .55)" mask="url(#tour-hole)" />
      </svg>
      {box && <div aria-hidden="true" className="pointer-events-none absolute rounded-xl ring-2 ring-[#5a9dff] transition-all duration-300 motion-safe:animate-[tour-pulse_1.8s_ease-in-out_infinite]" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />}

      <div ref={card} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body"
        className="absolute animate-rise rounded-2xl bg-surface p-5 shadow-[var(--shadow-dialog)] ring-1 ring-line outline-none"
        style={{ width: CARD_W, ...pos }}>
        <div className="flex items-start gap-3">
          <p className="flex-1 text-[11px] font-semibold tracking-[0.12em] text-ink-3 uppercase" aria-live="polite">Step {step + 1} of {steps.length}</p>
          <button type="button" onClick={close} aria-label="Close the tour" className="-mt-1 -mr-1 inline-flex size-8 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink"><X className="size-4" /></button>
        </div>
        <h2 id="tour-title" className="mt-1 text-[17px] font-semibold text-ink">{current.title}</h2>
        <p id="tour-body" className="mt-1.5 text-sm leading-relaxed text-ink-2">
          {current.body}
          {viaMenu && <span className="mt-1.5 block text-ink-3">On your phone, it's in the menu (☰).</span>}
        </p>
        <div className="mt-4 flex items-center gap-2">
          <div className="flex flex-1 gap-1" aria-hidden="true">
            {steps.map((_, i) => <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-5 bg-brand" : "w-1.5 bg-line-strong"}`} />)}
          </div>
          {step > 0 ? <Button size="sm" icon={ArrowLeft} onClick={() => setStep(step - 1)} aria-label="Previous step" /> : <Button size="sm" onClick={close}>Skip</Button>}
          <Button size="sm" variant="primary" iconRight={last ? undefined : ArrowRight} onClick={() => (last ? close() : setStep(step + 1))}>{last ? "Done" : step === 0 ? "Show me" : "Next"}</Button>
        </div>
      </div>
    </div>
  );
}

// "Take the tour" button for menus
export function TourButton({ className, children }) {
  return <button type="button" className={className} onClick={() => window.dispatchEvent(new Event("usetally:tour"))}>{children}</button>;
}

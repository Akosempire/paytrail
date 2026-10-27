"use client";
import { useEffect, useState } from "react";
import { GiftArt } from "@/components/gift-art";
import { Button } from "@/components/ui";

const COLORS = ["#f43f5e", "#fbbf24", "#22c55e", "#5a9dff", "#a78bfa", "#175cd3"];

// Shown once (per person, per device) after free access is given: confetti, the
// gift, and what they got. Remembered in this browser so it never nags.
export function GiftCelebration({ gift }) {
  const key = `usetally:gift:${gift.id}`;
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try { if (!localStorage.getItem(key)) setOpen(true); } catch { setOpen(true); }
  }, [key]);
  const close = () => { try { localStorage.setItem(key, "1"); } catch {} setOpen(false); };
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });
  if (!open) return null;
  const span = gift.months === 12 ? "a free year" : gift.months === 1 ? "a free month" : `${gift.months} free months`;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 animate-fade-in bg-[#101828]/55 backdrop-blur-[2px]" onClick={close} />
      {/* confetti falling across the screen */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 70 }, (_, i) => (
          <span key={i} className="confetti-piece" style={{
            left: `${(i * 37) % 100}%`, background: COLORS[i % COLORS.length],
            "--dx": `${((i * 53) % 120) - 60}px`, "--rot": `${((i * 97) % 720) - 360}deg`,
            "--dur": `${2.4 + ((i * 13) % 20) / 10}s`, "--delay": `${((i * 7) % 12) / 10}s`,
            width: i % 3 ? 8 : 6, height: i % 3 ? 13 : 6, borderRadius: i % 3 ? 2 : 999,
          }} />
        ))}
      </div>
      <div role="dialog" aria-modal="true" aria-labelledby="gift-title"
        className="relative w-full max-w-md animate-rise rounded-t-3xl bg-surface px-6 pt-6 pb-[calc(env(safe-area-inset-bottom)+20px)] text-center shadow-[var(--shadow-dialog)] ring-1 ring-line sm:rounded-3xl sm:pb-6">
        <GiftArt animated className="mx-auto h-40 w-52" />
        <p className="mt-2 font-mono text-[11px] font-semibold tracking-[0.2em] text-brand-ink uppercase">A gift from Usetally</p>
        <h2 id="gift-title" className="mt-2 text-[24px] leading-tight font-semibold tracking-[-0.02em] text-ink">You've got {span} of {gift.plan}</h2>
        <p className="mt-2 text-[14.5px] text-ink-2">Free until <strong className="text-ink">{gift.until}</strong>. No card, nothing to pay.</p>
        <Button variant="primary" block className="mt-6 h-12 text-[15px]" onClick={close}>Let's go 🎉</Button>
      </div>
    </div>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ListTodo } from "lucide-react";
import { cx } from "@/components/ui";

const TONE = { warn: "bg-warn", danger: "bg-danger", brand: "bg-brand", neutral: "bg-ink-3" };

// "To do": the small jobs that used to stack up as banners on the dashboard
// (set your country, confirm transfers, convert accepted quotes, approvals,
// finish setting up), folded into one list next to the greeting.
export function TodoMenu({ items = [] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const n = items.length;
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true"
        className={cx("inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium ring-1 transition-colors", n ? "text-ink ring-line-strong hover:bg-hover" : "text-ink-3 ring-line hover:bg-hover")}>
        {n ? <ListTodo className="size-4" /> : <Check className="size-4 text-success" />}
        <span className="max-sm:sr-only">To do</span>
        {n > 0 && <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white tabular">{n}</span>}
        <ChevronDown className={cx("size-4 text-ink-3 transition-transform max-sm:hidden", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[min(360px,calc(100vw-32px))] overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-pop)] ring-1 ring-line">
          {n ? (
            <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
              {items.map((t) => (
                <li key={t.id}>
                  <Link href={t.href} onClick={() => setOpen(false)} className="flex gap-3 px-4 py-3 hover:bg-hover">
                    <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", TONE[t.tone] || TONE.neutral)} />
                    <span className="min-w-0"><span className="block text-[13.5px] font-medium text-ink">{t.label}</span>{t.detail && <span className="block text-[12.5px] text-ink-3">{t.detail}</span>}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="px-4 py-4 text-[13px] text-ink-3">Nothing to do. Nice.</p>}
        </div>
      )}
    </div>
  );
}

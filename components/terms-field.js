"use client";
import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Textarea, cx } from "@/components/ui";

const MAX = 2000;

// Default terms for new quotes and invoices: one term per line, with common
// ones a tap away. Lines are kept as written, so they print as a tidy list.
export function TermsField({ name = "default_terms", id = "terms", defaultValue = "", validityDays, dueDays }) {
  const [value, setValue] = useState(defaultValue || "");
  const ref = useRef(null);

  const suggestions = [
    "50% deposit before work starts, balance on delivery.",
    "Full payment before delivery.",
    dueDays != null ? `Invoices are due within ${dueDays} day${dueDays == 1 ? "" : "s"} of issue.` : "Invoices are due within 7 days of issue.",
    validityDays ? `Prices are valid for ${validityDays} days from the quote date.` : "Prices are valid for 14 days from the quote date.",
    "Work starts once the deposit is received.",
    "Goods sold in good condition are not returnable.",
    "Delivery charges are not included unless stated.",
    "Prices include VAT where shown.",
  ];
  const lines = value.split("\n").map((l) => l.trim().toLowerCase());
  const has = (s) => lines.includes(s.toLowerCase());

  // grow with the text, so every term stays visible without scrolling
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(132, el.scrollHeight + 2)}px`;
  }, [value]);

  const add = (s) => {
    const next = value.trim() ? `${value.replace(/\s+$/, "")}\n${s}` : s;
    if (next.length <= MAX) setValue(next);
    requestAnimationFrame(() => { const el = ref.current; if (el) { el.focus(); el.setSelectionRange(next.length, next.length); } });
  };

  const left = MAX - value.length;
  return (
    <div className="flex flex-col gap-3">
      <Textarea ref={ref} id={id} name={name} value={value} onChange={(e) => setValue(e.target.value.slice(0, MAX))} rows={5}
        placeholder={"One term per line, for example:\n50% deposit before work starts, balance on delivery.\nPrices are valid for 14 days."}
        className="resize-none py-3" />
      <div className="flex items-center justify-between gap-3 text-xs text-ink-3">
        <span>Start each term on a new line. You can still change them on any document.</span>
        <span className={cx("shrink-0 tabular", left < 100 && "text-warn-ink")} aria-live="polite">{value.length} / {MAX}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Add a common term">
        <span className="mr-1 text-xs font-medium text-ink-3">Quick add</span>
        {suggestions.filter((s) => !has(s)).slice(0, 5).map((s) => (
          <button key={s} type="button" onClick={() => add(s)}
            className="inline-flex min-h-8 items-center gap-1 rounded-full bg-tray px-2.5 py-1 text-left text-xs text-ink-2 hover:bg-hover hover:text-ink">
            <Plus className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />{s}
          </button>
        ))}
      </div>
    </div>
  );
}

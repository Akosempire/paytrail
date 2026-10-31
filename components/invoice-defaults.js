"use client";
import { useState } from "react";
import { Field, Input, cx } from "@/components/ui";

const TERMS = [[0, "On receipt"], [7, "7 days"], [14, "14 days"], [30, "30 days"]];

// payment terms as one tap, with any other number of days still possible
export function DueDaysField({ defaultValue = 14, name = "invoice_due_days", onChange }) {
  const start = Number(defaultValue) || 0;
  const [days, setOwn] = useState(start);
  const setDays = (d) => { setOwn(d); onChange?.(d); };
  const [other, setOther] = useState(!TERMS.some(([d]) => d === start));
  return (
    <Field label="Payment terms" hint={days === 0 ? "Invoices are due the day you send them." : `New invoices are due ${days} day${days === 1 ? "" : "s"} after they're issued.`}>
      <input type="hidden" name={name} value={days} />
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Payment terms">
        {TERMS.map(([d, label]) => (
          <button key={d} type="button" role="radio" aria-checked={!other && days === d} onClick={() => { setOther(false); setDays(d); }}
            className={cx("inline-flex h-11 items-center rounded-md px-3.5 text-[13px] font-medium ring-1 sm:h-9",
              !other && days === d ? "bg-brand-soft text-brand-ink ring-brand-line" : "bg-surface text-ink-2 ring-line hover:bg-hover")}>{label}</button>
        ))}
        <button type="button" role="radio" aria-checked={other} onClick={() => setOther(true)}
          className={cx("inline-flex h-11 items-center rounded-md px-3.5 text-[13px] font-medium ring-1 sm:h-9", other ? "bg-brand-soft text-brand-ink ring-brand-line" : "bg-surface text-ink-2 ring-line hover:bg-hover")}>Other</button>
        {other && (
          <Input aria-label="Days until due" type="number" min="0" max="365" inputMode="numeric" className="h-11 w-24 sm:h-9" value={days}
            onChange={(e) => setDays(Math.max(0, Math.min(365, parseInt(e.target.value || "0", 10) || 0)))} />
        )}
      </div>
    </Field>
  );
}

// a prefix input whose "Next:" hint follows what you type
export function PrefixField({ id, name, label, defaultValue, seq = 0, onChange }) {
  const [p, setOwn] = useState(defaultValue || "");
  const setP = (v) => { setOwn(v); onChange?.(v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || defaultValue); };
  const clean = p.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || defaultValue;
  return (
    <Field label={label} htmlFor={id} hint={`Next: ${clean}-${String(Number(seq || 0) + 1).padStart(4, "0")}`}>
      <Input id={id} name={name} value={p} onChange={(e) => setP(e.target.value)} maxLength={8} autoCapitalize="characters" />
    </Field>
  );
}

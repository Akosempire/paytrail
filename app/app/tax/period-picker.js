"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cx } from "@/components/ui";
import { formatMoney } from "@/lib/money";

// Month · Quarter · Year, arrows to step, and a calendar where every month
// shows a small bar of the VAT charged, so busy months stand out.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n) => String(n).padStart(2, "0");
const compact = (minor, cur) => {
  const v = Number(minor || 0) / 100;
  if (!v) return "–";
  const sym = formatMoney(0, cur).replace(/[\d.,\s]/g, "");
  return v >= 1e6 ? `${sym}${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}m` : v >= 1e3 ? `${sym}${Math.round(v / 1e3)}k` : `${sym}${Math.round(v)}`;
};

export function PeriodPicker({ period, vat, currency, today }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(period.year);
  const ref = useRef(null);
  useEffect(() => { setYear(period.year); }, [period.year]);
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  const [ty, tm] = today.split("-").map(Number); // this month: nothing after it can be picked
  const go = (key) => { setOpen(false); router.push(`/app/tax?period=${key}`, { scroll: false }); };
  const monthNum = period.type === "month" ? Number(period.key.slice(5, 7)) : period.type === "quarter" ? (period.quarter - 1) * 3 + 1 : 1;
  const isFuture = (y, m) => y > ty || (y === ty && m > tm);

  // switching type keeps you in the same stretch of time
  const asType = (type) => {
    if (type === "month") return `${period.year}-${pad(period.type === "year" ? (period.year === ty ? tm : 12) : period.type === "quarter" ? Math.min(period.quarter * 3, period.year === ty ? tm : 12) : monthNum)}`;
    if (type === "quarter") return `${period.year}-Q${Math.ceil(monthNum / 3)}`;
    return String(period.year);
  };
  const step = (dir) => {
    if (period.type === "year") return String(period.year + dir);
    if (period.type === "quarter") { const n = period.quarter + dir; return n < 1 ? `${period.year - 1}-Q4` : n > 4 ? `${period.year + 1}-Q1` : `${period.year}-Q${n}`; }
    const d = new Date(Date.UTC(period.year, monthNum - 1 + dir, 1));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  };
  const nextKey = step(1);
  const nextIsFuture = period.type === "year" ? period.year + 1 > ty : period.type === "quarter" ? isFuture(Number(nextKey.slice(0, 4)), (Number(nextKey.slice(-1)) - 1) * 3 + 1) : isFuture(Number(nextKey.slice(0, 4)), Number(nextKey.slice(5, 7)));

  const yearVat = (y) => MONTHS.reduce((t, _, i) => t + (vat[`${y}-${pad(i + 1)}`] || 0), 0);
  const max = Math.max(1, ...MONTHS.map((_, i) => vat[`${year}-${pad(i + 1)}`] || 0));
  const cells = period.type === "year"
    ? [ty - 3, ty - 2, ty - 1, ty].map((y) => ({ key: String(y), name: String(y), amount: yearVat(y), selected: period.key === String(y), disabled: false, bar: 0 }))
    : period.type === "quarter"
      ? [1, 2, 3, 4].map((q) => { const a = [0, 1, 2].reduce((t, i) => t + (vat[`${year}-${pad((q - 1) * 3 + 1 + i)}`] || 0), 0); return { key: `${year}-Q${q}`, name: `Q${q}`, sub: `${MONTHS[(q - 1) * 3]}–${MONTHS[(q - 1) * 3 + 2]}`, amount: a, bar: a / (max * 3), selected: period.key === `${year}-Q${q}`, disabled: isFuture(year, (q - 1) * 3 + 1) }; })
      : MONTHS.map((name, i) => { const a = vat[`${year}-${pad(i + 1)}`] || 0; return { key: `${year}-${pad(i + 1)}`, name, amount: a, bar: a / max, selected: period.key === `${year}-${pad(i + 1)}`, disabled: isFuture(year, i + 1) }; });

  const arrow = "inline-flex size-9 items-center justify-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <div ref={ref} className="relative flex flex-wrap items-center gap-2">
      <div role="tablist" aria-label="Period" className="inline-flex rounded-xl bg-tray p-1 ring-1 ring-line">
        {["month", "quarter", "year"].map((t) => (
          <button key={t} type="button" role="tab" aria-selected={period.type === t} onClick={() => go(asType(t))}
            className={cx("rounded-lg px-3 py-1.5 text-[13px] font-medium capitalize", period.type === t ? "bg-surface text-ink shadow-[var(--shadow-xs)] ring-1 ring-line" : "text-ink-3 hover:text-ink")}>{t}</button>
        ))}
      </div>
      <div className="inline-flex items-center rounded-xl bg-surface p-1 ring-1 ring-line">
        <button type="button" className={arrow} aria-label="Previous" onClick={() => go(step(-1))}><ChevronLeft className="size-4" /></button>
        <button type="button" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)}
          className="inline-flex h-9 min-w-[150px] items-center justify-center gap-2 rounded-lg px-3 text-[14px] font-semibold text-ink hover:bg-hover">
          <CalendarDays className="size-4 text-brand" />{period.label}<ChevronDown className={cx("size-3.5 text-ink-3 transition-transform", open && "rotate-180")} />
        </button>
        <button type="button" className={arrow} aria-label="Next" disabled={nextIsFuture} onClick={() => go(nextKey)}><ChevronRight className="size-4" /></button>
      </div>
      {period.type !== "month" && <span className="text-[13px] text-ink-3">{period.long}</span>}

      {open && (
        <div role="dialog" aria-label="Choose a period" className="absolute top-full left-0 z-30 mt-2 w-[min(360px,calc(100vw-32px))] animate-rise rounded-2xl bg-surface p-3 shadow-[var(--shadow-pop)] ring-1 ring-line sm:left-auto sm:right-auto">
          {period.type !== "year" && (
            <div className="mb-2 flex items-center justify-between px-1">
              <button type="button" className={arrow} aria-label="Previous year" onClick={() => setYear(year - 1)}><ChevronLeft className="size-4" /></button>
              <span className="text-[14px] font-semibold text-ink">{year}</span>
              <button type="button" className={arrow} aria-label="Next year" disabled={year >= ty} onClick={() => setYear(year + 1)}><ChevronRight className="size-4" /></button>
            </div>
          )}
          <div className={cx("grid gap-1.5", period.type === "month" ? "grid-cols-4" : "grid-cols-2")}>
            {cells.map((c) => (
              <button key={c.key} type="button" disabled={c.disabled} onClick={() => go(c.key)} aria-current={c.selected ? "true" : undefined}
                className={cx("relative flex flex-col items-start overflow-hidden rounded-xl px-2.5 pt-2 pb-2.5 text-left ring-1 ring-inset transition-colors disabled:cursor-not-allowed disabled:opacity-35",
                  c.selected ? "bg-brand text-white ring-brand" : "bg-surface text-ink ring-line hover:bg-hover")}>
                <span className="text-[13px] font-semibold">{c.name}</span>
                {c.sub && <span className={cx("text-[11px]", c.selected ? "text-white/80" : "text-ink-3")}>{c.sub}</span>}
                <span className={cx("mt-1 text-[11.5px] tabular-nums", c.selected ? "text-white/90" : c.amount ? "text-ink-2" : "text-ink-3")}>{compact(c.amount, currency)}</span>
                {/* VAT charged that period, relative to the busiest */}
                {c.bar > 0 && <span aria-hidden="true" className={cx("absolute bottom-0 left-0 h-1 rounded-r-full", c.selected ? "bg-white/70" : "bg-brand/70")} style={{ width: `${Math.max(8, Math.round(c.bar * 100))}%` }} />}
              </button>
            ))}
          </div>
          <p className="mt-2.5 px-1 text-[11.5px] text-ink-3">Amounts are VAT charged on invoices issued.</p>
        </div>
      )}
    </div>
  );
}

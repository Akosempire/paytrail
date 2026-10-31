"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, FileText, List, Plus } from "lucide-react";
import { cx } from "@/components/ui";
import { StatusBadge } from "@/components/doc-bits";
import { formatMoney } from "@/lib/money";

const money = (v, c) => formatMoney(v, c);

// The quote builder's header: "All quotes (N) ▾" (recent quotes, then the full
// list) and a strip of the latest drafts to pick up where you left off.
export function QuoteSwitcher({ count, recent, current }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const item = "flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-1.5 text-left text-sm hover:bg-hover";
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}
        className="inline-flex h-10 items-center gap-2 rounded-md bg-surface px-3.5 text-[14px] font-medium text-ink ring-1 ring-line-strong hover:bg-hover focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]">
        <List className="size-4 text-ink-3" />All quotes <span className="text-ink-3 tabular">({count})</span><ChevronDown className="size-4 text-ink-3" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-1.5 w-[min(340px,calc(100vw-2rem))] animate-rise rounded-xl bg-surface p-1.5 shadow-[var(--shadow-pop)] ring-1 ring-line">
          {current && <Link role="menuitem" href="/app/quotes" className={cx(item, "font-medium text-brand-ink")}><Plus className="size-4" />New quote</Link>}
          {recent.length > 0 && <p className="px-3 pt-2 pb-1 text-overline text-ink-3">Recent</p>}
          {recent.map((d) => (
            <Link key={d.id} role="menuitem" href={["draft", "pending_approval"].includes(d.status) ? `/app/documents/${d.id}/edit` : `/app/documents/${d.id}`}
              className={cx(item, d.id === current && "bg-hover")} aria-current={d.id === current ? "page" : undefined}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink">{d.customer_name || "No customer yet"}</span>
                <span className="block truncate text-[12.5px] text-ink-3">{d.number} · {money(d.total_minor, d.currency)}</span>
              </span>
              <StatusBadge doc={{ ...d, kind: "quote" }} size="sm" />
            </Link>
          ))}
          <Link role="menuitem" href="/app/quotes/all" className={cx(item, "mt-1 border-t border-line text-ink-2")}><FileText className="size-4" />See all {count} quotes</Link>
        </div>
      )}
    </div>
  );
}

export function DraftStrip({ drafts }) {
  if (!drafts.length) return null;
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 scroll-thin" aria-label="Recent drafts">
      <span className="shrink-0 text-[12.5px] text-ink-3">Pick up a draft:</span>
      {drafts.map((d) => (
        <Link key={d.id} href={`/app/documents/${d.id}/edit`}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 text-[12.5px] text-ink-2 ring-1 ring-line hover:bg-hover hover:text-ink">
          <span className="max-w-[160px] truncate font-medium text-ink">{d.customer_name || d.number}</span>
          <span className="text-ink-3 tabular">{money(d.total_minor, d.currency)}</span>
        </Link>
      ))}
    </div>
  );
}

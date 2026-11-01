"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { timeAgo } from "@/lib/format";
import { activityText } from "@/components/doc-bits";
import { joinVerbs } from "@/lib/dashboard-core";
import { cx } from "@/components/ui";

const FILTERS = [["all", "All"], ["quotes", "Quotes"], ["invoices", "Invoices"], ["payments", "Payments"]];
const DOT = { quotes: "bg-brand/60", invoices: "bg-violet/60", payments: "bg-success/70", other: "bg-ink-3/50" };

// Recent activity with a quiet filter; repeated events already merged (groupActivity)
export function ActivityFeed({ items = [] }) {
  const [f, setF] = useState("all");
  const present = new Set(items.map((a) => a.kind));
  const filters = FILTERS.filter(([k]) => k === "all" || present.has(k));
  const shown = items.filter((a) => f === "all" || a.kind === f).slice(0, 8);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="text-[14px] font-semibold text-ink">Recent activity</h2>
        {filters.length > 2 && (
          <div className="flex gap-0.5" role="group" aria-label="Show">
            {filters.map(([k, label]) => (
              <button key={k} type="button" aria-pressed={f === k} onClick={() => setF(k)}
                className={cx("rounded-md px-2 py-1 text-[12px] font-medium transition-colors", f === k ? "bg-hover text-ink" : "text-ink-3 hover:text-ink")}>{label}</button>
            ))}
          </div>
        )}
      </div>
      <div className="overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-card)] ring-1 ring-line">
        {shown.length ? (
          <ol className="space-y-1 px-5 py-3">
            {shown.map((a) => {
              const body = (
                <>
                  <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", DOT[a.kind] || DOT.other)} />
                  <span className="min-w-0">
                    <span className="text-ink"><strong className="font-medium">{a.actor_label || "Customer"}</strong> {a.verbs ? joinVerbs(a.verbs) : activityText(a)}</span>
                    {a.documents?.number && <span className="ml-1 font-mono text-xs text-brand-ink group-hover:underline">{a.documents.number}</span>}
                    <span className="block text-xs text-ink-3">{timeAgo(a.created_at)}</span>
                  </span>
                </>
              );
              return (
                <li key={a.id}>
                  {a.document_id
                    ? <Link href={`/app/documents/${a.document_id}`} className="group -mx-2 flex gap-3 rounded-lg px-2 py-1.5 text-[13px] hover:bg-hover focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]">{body}</Link>
                    : <div className="flex gap-3 py-1.5 text-[13px]">{body}</div>}
                </li>
              );
            })}
          </ol>
        ) : <p className="px-5 py-6 text-[13px] text-ink-3">{items.length ? "Nothing here yet." : "Activity shows up here as your team works."}</p>}
        <Link href="/app/payments" className="flex items-center justify-between border-t border-line px-5 py-3 text-[13px] font-medium text-brand-ink hover:bg-hover">All payments & receipts<ArrowRight className="size-4" /></Link>
      </div>
    </section>
  );
}

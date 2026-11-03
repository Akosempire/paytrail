"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { Card, EmptyState, SectionHeader, cx } from "@/components/ui";
import { CollectActions } from "@/components/collect-actions";
import { formatMoney } from "@/lib/money";
import { balanceOf, collectStatus, urgencySort } from "@/lib/collect-core";

// Dashboard → Collect: every unpaid invoice, most urgent first, each one a tap
// away from a reminder or a recorded payment. Rows update in place after an
// action (so the list never jumps); a payment that clears the balance slides
// the row out, and Undo brings it back.
const TONE = { danger: "text-danger-ink", warn: "text-warn-ink", info: "text-ink-2", neutral: "text-ink-3", success: "text-success-ink" };

export function CollectQueue({ docs, businessName, currency, today, perms }) {
  const [state, setState] = useState({}); // id → { reminded, leaving, gone, paidMinor }
  const ordered = useMemo(() => urgencySort(docs, today), [docs, today]);
  const visible = ordered.filter((d) => !state[d.id]?.gone);
  const total = visible.reduce((s, d) => s + Math.max(0, balanceOf(d) - (state[d.id]?.paidMinor || 0)), 0);
  const money = (v) => formatMoney(v, currency);

  const update = (d) => (e) => setState((all) => {
    const cur = all[d.id] || {};
    if (e.reminded !== undefined) return { ...all, [d.id]: { ...cur, reminded: e.reminded } };
    if (e.undone) return { ...all, [d.id]: { ...cur, leaving: false, gone: false, paidMinor: 0 } };
    if (e.pendingPaid !== undefined) {
      if (!e.pendingPaid) return { ...all, [d.id]: { ...cur, paidMinor: e.amountMinor } };
      // slide out, then drop from the list (the Undo toast can bring it back)
      const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      setTimeout(() => setState((a) => (a[d.id]?.leaving ? { ...a, [d.id]: { ...a[d.id], gone: true } } : a)), reduce ? 0 : 320);
      return { ...all, [d.id]: { ...cur, leaving: true, paidMinor: e.amountMinor } };
    }
    return all;
  });

  return (
    <section id="collect" className="flex scroll-mt-24 flex-col gap-3" aria-labelledby="collect-title">
      <SectionHeader title={<span id="collect-title">Collect</span>} count={visible.length}
        description={visible.length ? <><span data-money>{money(total)}</span> owed</> : undefined}
        action={visible.length ? <Link href="/app/invoices?status=unpaid" className="inline-flex min-h-9 items-center text-[13px] font-medium text-brand-ink hover:underline">All unpaid</Link> : null} />
      {visible.length === 0 && <EmptyState compact icon={CircleCheck} title="Nothing owed to you right now." description="Invoices you send show up here until they're paid." />}
      {ordered.length > 0 && (
        // stays mounted even when every row has been paid, so the last Undo still works
        <Card hidden={visible.length === 0} className="!overflow-visible">
          <ul className="divide-y divide-line">
            {ordered.map((d) => {
              const s = state[d.id] || {};
              const owed = Math.max(0, balanceOf(d) - (s.paidMinor || 0));
              const status = s.reminded ? { text: `Reminder sent just now${s.reminded === "whatsapp" ? " on WhatsApp" : ""}`, tone: "info" }
                : s.paidMinor ? { text: `${money(s.paidMinor)} recorded just now`, tone: "success" }
                : collectStatus(d, today);
              return (
                // a paid row stays mounted (hidden) so its Undo still works
                <li key={d.id} style={s.gone ? { display: "none" } : undefined}
                  className={cx("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3.5 transition-[opacity,transform] duration-300 sm:px-5 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_auto_auto] motion-reduce:transition-none",
                    s.leaving && "pointer-events-none translate-x-6 opacity-0")}>
                  <Link href={`/app/documents/${d.id}`} className="col-start-1 row-start-1 min-w-0 rounded-md focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]">
                    <span className="block truncate text-[14px] font-semibold text-ink">{d.customer_company || d.customer_name}</span>
                    <span className="block truncate text-[13px] text-ink-3"><span className="font-mono text-[12px]">{d.number}</span>{d.title ? ` · ${d.title}` : ""}</span>
                  </Link>
                  <p className={cx("col-span-2 row-start-2 text-[13px] font-medium md:col-span-1 md:col-start-2 md:row-start-1", TONE[status.tone])} aria-live="polite">{status.text}</p>
                  <span data-money className="col-start-2 row-start-1 text-right text-[15px] font-semibold text-ink tabular md:col-start-3">{money(owed)}</span>
                  <CollectActions doc={d} businessName={businessName} perms={perms} onChange={update(d)}
                    className="col-span-2 row-start-3 mt-1 md:col-span-1 md:col-start-4 md:row-start-1 md:mt-0" />
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </section>
  );
}

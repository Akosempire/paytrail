import Link from "next/link";
import { ArrowRight, FileText, Receipt, Sparkles } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { timeAgo } from "@/lib/format";
import { SectionHeader, cx } from "@/components/ui";

// Drafts on the dashboard: quotes and invoices not sent yet, newest first.
// The ones an AI assistant made (ChatGPT, Claude, Grok) say so, so they get a
// look before they go out.
export function DraftsList({ drafts = [], total = 0, counts = {} }) {
  if (!drafts.length) return null;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="drafts-title">
      <SectionHeader title={<span id="drafts-title">Drafts</span>} count={total}
        action={<span className="flex gap-4 text-[13px] font-medium">
          {counts.quote > 0 && <Link href="/app/quotes/all?status=drafts" className="text-brand-ink hover:underline">Quotes ({counts.quote})</Link>}
          {counts.invoice > 0 && <Link href="/app/invoices?status=drafts" className="text-brand-ink hover:underline">Invoices ({counts.invoice})</Link>}
        </span>} />
      <ul className="divide-y divide-line overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-card)] ring-1 ring-line">
        {drafts.map((d) => {
          const Icon = d.kind === "quote" ? FileText : Receipt;
          return (
            <li key={d.id}>
              <Link href={`/app/documents/${d.id}`} className="group flex items-center gap-3 px-4 py-3 hover:bg-hover sm:px-5">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-3 ring-1 ring-line"><Icon className="size-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate text-sm font-medium text-ink">{d.customer_name || "No customer yet"}</span>
                    {d.created_via && (
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-violet-ink ring-1 ring-violet/30">
                        <Sparkles className="size-3" />Made by {d.created_via}
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-ink-3"><span className="font-mono">{d.number}</span> · {d.status === "pending_approval" ? "waiting for approval" : `edited ${timeAgo(d.updated_at)}`}</span>
                </span>
                <span data-money className="text-sm font-semibold text-ink tabular">{formatMoney(d.total_minor, d.currency)}</span>
                <ArrowRight className={cx("size-4 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5")} />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

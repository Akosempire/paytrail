import Link from "next/link";
import { ArrowRight, ArrowUpRight, ArrowDownRight, BellRing, CheckCircle2, FileCheck2, Landmark, ShieldCheck } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { MoneyEye } from "@/components/money-eye";
import { compactMoney } from "@/lib/collect-core";
import { moneyFlow } from "@/lib/dashboard-core";
import { Button, cx } from "@/components/ui";
import { CollectActions } from "@/components/collect-actions";

const PART = {
  collected: { label: "Collected", bar: "bg-success", dot: "bg-success" },
  owed: { label: "Owed, not due yet", bar: "bg-brand/70", dot: "bg-brand/70" },
  overdue: { label: "Overdue", bar: "bg-danger", dot: "bg-danger" },
};
const ICON = { claim: Landmark, remind: BellRing, convert: FileCheck2, approve: ShieldCheck, clear: CheckCircle2 };

// The top of the dashboard: this month's money as one picture, and the one
// thing worth doing next, with its button right there.
export function MoneyStory({ month, currency, collected, lastMonth, trend, outstanding, overdue, overdueCount, next, businessName, perms }) {
  const flow = moneyFlow({ collected, outstanding, overdue });
  const money = (m) => formatMoney(m || 0, currency);
  const Icon = ICON[next.kind] || CheckCircle2;
  return (
    <section aria-label={`${month} so far`} className="overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-card)] ring-1 ring-line">
      <div className="flex flex-col gap-6 p-5 sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            <p className="flex items-center gap-1.5 text-overline text-ink-3">{month} so far<MoneyEye className="-my-1.5 size-7" /></p>
            <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span data-money className="font-display text-[clamp(34px,5vw,48px)] leading-none font-semibold tracking-[-0.03em] text-ink tabular">{money(collected)}</span>
              <span className="text-[15px] text-ink-2">collected</span>
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
              {trend != null && (
                <span className={cx("inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ring-1", trend >= 0 ? "text-success-ink ring-success/30" : "text-danger-ink ring-danger/30")}>
                  {trend >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}{Math.abs(trend)}%
                </span>
              )}
              <span data-money>{money(lastMonth)}</span> last month
            </p>
          </div>
          <a href="#collect" className="group sm:text-right">
            <span className="block text-overline text-ink-3">Still owed to you</span>
            <span data-money className="mt-1 block text-[22px] font-semibold tracking-[-0.02em] text-ink tabular">{money(outstanding)}</span>
            <span className={cx("inline-flex items-center gap-1 text-[13px]", overdueCount ? "text-danger-ink" : "text-ink-3")}>
              {overdueCount ? <>{overdueCount} overdue · <span data-money>{money(overdue)}</span></> : "Nothing overdue"}<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </a>
        </div>

        {flow.total > 0 ? (
          <div>
            <div className="flex h-3 w-full gap-1 overflow-hidden" role="img"
              aria-label={flow.parts.map((p) => `${PART[p.key].label} ${money(p.minor)}`).join(", ")}>
              {flow.parts.map((p) => <span key={p.key} className={cx("h-full rounded-full", PART[p.key].bar)} style={{ width: `${Math.max(p.pct, 2)}%` }} />)}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] text-ink-2">
              {flow.parts.map((p) => (
                <li key={p.key} className="inline-flex items-center gap-1.5"><span className={cx("size-2 rounded-full", PART[p.key].dot)} />{PART[p.key].label}<span data-money className="font-medium text-ink tabular">{compactMoney(p.minor, currency)}</span></li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-[13px] text-ink-3">Send an invoice and you'll see your money move here: what's collected, what's owed and what's late.</p>
        )}
      </div>

      <div className={cx("flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line px-5 py-4 sm:px-7", next.kind === "clear" && "")}>
        <span className={cx("inline-flex size-9 shrink-0 items-center justify-center rounded-lg ring-1", next.kind === "remind" && next.detail.includes("overdue") ? "text-danger-ink ring-danger/25" : next.kind === "clear" ? "text-success-ink ring-success/25" : "text-brand-ink ring-brand-line")}>
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1 basis-[200px]">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">{next.kind === "clear" ? "Next" : "Do this next"}</p>
          <p className="text-[15px] font-semibold text-ink">{next.title}</p>
          <p className="text-[13px] text-ink-2">{next.detail}</p>
        </div>
        <div className="max-sm:w-full max-sm:pl-[52px]">{next.kind === "remind"
          ? <CollectActions doc={next.doc} businessName={businessName} perms={perms} labels show={["remind", "record"]} />
          : <Button href={next.href} size="sm" variant={next.kind === "clear" ? "secondary" : "primary"} iconRight={ArrowRight}>{next.cta}</Button>}</div>
      </div>
    </section>
  );
}

// three small tiles under the story: quotes, profit (or approvals), 6 months
export function MiniTiles({ currency, openQuotes, openQuotesCount, profit, costs, showCosts, awaiting, monthly = [] }) {
  const money = (m) => formatMoney(m || 0, currency);
  const max = Math.max(1, ...monthly.map((m) => m.collected_minor));
  const tile = "flex min-w-0 flex-col justify-between gap-3 rounded-xl bg-surface p-4 shadow-[var(--shadow-card)] ring-1 ring-line sm:p-5";
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-[1fr_1fr_1.4fr]">
      <Link href="/app/quotes" className={cx(tile, "transition-shadow hover:shadow-[var(--shadow-pop)]")}>
        <span className="text-[12.5px] font-medium text-ink-3">Open quotes</span>
        <span><span data-money className="block text-[20px] font-semibold tracking-[-0.02em] text-ink tabular sm:text-[22px]">{money(openQuotes)}</span>
          <span className="text-[12.5px] text-ink-3">{openQuotesCount || 0} waiting for a reply</span></span>
      </Link>
      {showCosts ? (
        <div className={tile}>
          <span className="text-[12.5px] font-medium text-ink-3">Profit on paid invoices</span>
          <span><span data-money className="block text-[20px] font-semibold tracking-[-0.02em] text-ink tabular sm:text-[22px]">{profit == null ? "—" : money(profit)}</span>
            <span className="text-[12.5px] text-ink-3">This month, after <span data-money>{money(costs)}</span> costs</span></span>
        </div>
      ) : (
        <Link href="/app/invoices?status=pending_approval" className={cx(tile, "transition-shadow hover:shadow-[var(--shadow-pop)]")}>
          <span className="text-[12.5px] font-medium text-ink-3">Awaiting approval</span>
          <span><span className="block text-[20px] font-semibold text-ink tabular sm:text-[22px]">{awaiting || 0}</span><span className="text-[12.5px] text-ink-3">Drafts sent for sign-off</span></span>
        </Link>
      )}
      <Link href="/app/payments" className={cx(tile, "col-span-2 transition-shadow hover:shadow-[var(--shadow-pop)] lg:col-span-1")}>
        <span className="flex items-center justify-between text-[12.5px] font-medium text-ink-3">Collected, last 6 months<ArrowRight className="size-3.5" /></span>
        <span data-money className="flex h-16 items-end gap-2" role="img" aria-label={monthly.map((m) => `${m.month} ${money(m.collected_minor)}`).join(", ")}>
          {monthly.map((m, i) => (
            <span key={m.month} className="flex flex-1 flex-col items-center gap-1" title={`${m.month}: ${money(m.collected_minor)}`}>
              <span className="flex h-12 w-full items-end"><span className={cx("w-full rounded-t-[3px]", i === monthly.length - 1 ? "bg-brand" : "bg-brand/25")} style={{ height: `${Math.max(4, (m.collected_minor / max) * 100)}%` }} /></span>
              <span className="text-[10.5px] text-ink-3">{m.month}</span>
            </span>
          ))}
        </span>
      </Link>
    </div>
  );
}

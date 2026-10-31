import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileText, Plus, Receipt, Search, Wallet } from "lucide-react";
import { Button, Card, EmptyState, Input, PageHeader, StatCard, StatGroup, cx } from "@/components/ui";
import { StatusBadge } from "@/components/doc-bits";
import { RowActions } from "@/components/row-actions";
import { formatMoney } from "@/lib/money";
import { formatDate, isOverdue } from "@/lib/format";
import { documentCounts, listDocuments } from "@/lib/documents";
import { invoiceSummary } from "@/lib/reminders-core";

const today = () => new Date().toISOString().slice(0, 10);

// the three numbers at the top of Invoices, in the business's own currency
function InvoiceSummary({ rows, currency }) {
  const t = today();
  const all = invoiceSummary(rows, { today: t, monthStart: t.slice(0, 8) + "01" });
  const main = all[currency] || { outstanding: 0, overdue: 0, overdueCount: 0, paidThisMonth: 0 };
  const others = Object.keys(all).filter((c) => c !== currency && (all[c].outstanding || all[c].paidThisMonth));
  const hint = others.length ? `Plus invoices in ${others.join(", ")}` : undefined;
  const line = (label, value, tone) => (
    <div className="flex min-w-0 flex-col px-3 py-2.5">
      <span className="truncate text-[12px] text-ink-3">{label}</span>
      <span className={cx("truncate text-[15px] font-semibold tabular", tone || "text-ink")}>{value}</span>
    </div>
  );
  return (
    <>
    {/* phones: one compact strip, so the list stays in view */}
    <Card className="grid grid-cols-3 divide-x divide-line sm:hidden" aria-label="Invoice summary">
      {line("Outstanding", formatMoney(main.outstanding, currency, { decimals: 0 }))}
      {line(main.overdueCount ? `Overdue (${main.overdueCount})` : "Overdue", formatMoney(main.overdue, currency, { decimals: 0 }), main.overdueCount ? "text-danger-ink" : "")}
      {line("Paid this month", formatMoney(main.paidThisMonth, currency, { decimals: 0 }))}
    </Card>
    <StatGroup cols={3} className="max-sm:hidden">
      <StatCard icon={Wallet} tone="brand" label="Outstanding" value={formatMoney(main.outstanding, currency)} hint={hint ?? "Sent and not yet paid"} />
      <StatCard icon={AlertTriangle} tone={main.overdueCount ? "danger" : "neutral"} label="Overdue" value={formatMoney(main.overdue, currency)}
        hint={main.overdueCount ? `${main.overdueCount} invoice${main.overdueCount === 1 ? "" : "s"} past the due date` : "Nothing past the due date"} />
      <StatCard icon={CheckCircle2} tone="success" label="Paid this month" value={formatMoney(main.paidThisMonth, currency)} hint="Invoices paid in full" />
    </StatGroup>
    </>
  );
}

export async function DocumentListPage({ ctx, kind, searchParams }) {
  const status = searchParams.status || "";
  const q = searchParams.q || "";
  const [rows, counts] = await Promise.all([listDocuments(ctx, { kind, status, q }), documentCounts(ctx, kind)]);
  const quote = kind === "quote";
  const base = quote ? "/app/quotes" : "/app/invoices";
  const tabs = quote
    ? [["", "All", counts.all], ["drafts", "Drafts", counts.drafts], ["open", "Awaiting reply", counts.open], ["accepted", "Accepted", counts.accepted]]
    : [["", "All", counts.all], ["drafts", "Draft", counts.drafts], ["sent", "Sent", counts.sent], ["viewed", "Viewed", counts.viewed], ["overdue", "Overdue", counts.overdue], ["paid", "Paid", counts.paid]];
  // older links (?status=open) still work; they just don't light up a chip
  const href = (value) => {
    const p = new URLSearchParams();
    if (value) p.set("status", value);
    if (q) p.set("q", q);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };
  const filtered = Boolean(q || status);
  const empty = (() => {
    if (!filtered) return quote
      ? { title: "No quotes yet", description: "Create your first quote. Add your hidden costs to see your profit before you send it." }
      : { title: "No invoices yet", description: "Your first one takes about a minute." };
    if (!quote && status === "overdue" && !q) return { title: "No overdue invoices. Nice.", description: "Everything you've sent is still within its due date or paid." };
    return { title: "Nothing matches", description: q ? `No ${quote ? "quotes" : "invoices"} match “${q}”. Try a customer name, number or amount.` : "Nothing here yet." };
  })();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={quote ? "Quotes" : "Invoices"}
        description={quote ? "Price jobs, send them, and turn accepted quotes into invoices." : "Bills you've sent and what's still owed."}
        actions={<Button href={`${base}/new`} variant="primary" icon={Plus}>{quote ? "New quote" : "New invoice"}</Button>} />
      {!quote && counts.all > 0 && <InvoiceSummary rows={counts.rows} currency={ctx.business.currency || "NGN"} />}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <nav className="inline-flex max-w-full items-center gap-0.5 self-start overflow-x-auto rounded-lg bg-tray p-1 no-scrollbar" aria-label="Filter">
          {tabs.map(([value, label, count]) => (
            <Link key={value} href={href(value)} aria-current={status === value ? "page" : undefined}
              className={cx("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium whitespace-nowrap",
                status === value ? "bg-surface text-ink shadow-[var(--shadow-xs)] ring-1 ring-line" : "text-ink-3 hover:text-ink")}>
              {label}<span className={cx("tabular", value === "overdue" && count ? "text-danger-ink" : "text-ink-3")}>{count}</span>
            </Link>
          ))}
        </nav>
        <form className="w-full md:w-80" role="search">
          {status && <input type="hidden" name="status" value={status} />}
          <Input icon={Search} name="q" type="search" defaultValue={q} placeholder={quote ? "Search number, customer…" : "Search customer, number or amount"} aria-label="Search" />
        </form>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={quote ? FileText : Receipt} title={empty.title} description={empty.description}
          action={filtered
            ? <Button href={base} variant="secondary">{q ? "Clear search" : "Clear filter"}</Button>
            : <Button href={`${base}/new`} variant="primary" icon={Plus}>{quote ? "Create a quote" : "Create an invoice"}</Button>} />
      ) : (
        <Card>
          <div className={cx("hidden gap-4 border-b border-line bg-subtle px-5 py-2.5 text-xs font-medium text-ink-3 md:grid",
            quote ? "grid-cols-[130px_minmax(0,1fr)_120px_130px_140px]" : "grid-cols-[130px_minmax(0,1fr)_120px_130px_140px_44px]")}>
            <span>Number</span><span>Customer</span><span>{quote ? "Valid until" : "Due"}</span><span>Status</span><span className="text-right">{quote ? "Total" : "Balance"}</span>
            {!quote && <span className="sr-only">Actions</span>}
          </div>
          <ul className="divide-y divide-line">
            {rows.map((d) => {
              const amount = quote || d.status === "paid" ? d.total_minor : d.total_minor - d.amount_paid_minor;
              const row = (
                <Link href={`/app/documents/${d.id}`} className="grid min-w-0 flex-1 grid-cols-[1fr_auto] gap-x-4 gap-y-1 py-3.5 pl-5 pr-2 md:grid-cols-[130px_minmax(0,1fr)_120px_130px_140px] md:items-center md:pr-0">
                  <span className="font-mono text-[13px] font-medium text-ink">{d.number}</span>
                  <span className="order-3 min-w-0 md:order-none">
                    <span className="block truncate text-sm font-medium text-ink">{d.customer_name || "No customer"}{d.customer_company ? ` · ${d.customer_company}` : ""}</span>
                    {d.title && <span className="block truncate text-xs text-ink-3">{d.title}</span>}
                    {!quote && d.due_date && <span className={cx("block text-xs md:hidden", isOverdue(d) ? "font-medium text-danger-ink" : "text-ink-3")}>Due {formatDate(d.due_date)}</span>}
                  </span>
                  <span className={cx("hidden text-[13px] md:block", isOverdue(d) ? "font-medium text-danger-ink" : "text-ink-2")}>{formatDate(quote ? d.valid_until : d.due_date)}</span>
                  <span className="order-4 justify-self-end md:order-none md:justify-self-start"><StatusBadge doc={d} size="sm" /></span>
                  <span className="order-2 text-right text-sm font-semibold text-ink tabular md:order-none">{formatMoney(amount, d.currency)}</span>
                </Link>
              );
              return (
                <li key={d.id} className={cx("transition-colors hover:bg-subtle", quote ? "" : "flex items-center gap-1 pr-2 md:pr-3")}>
                  {quote ? <div className="flex pr-5">{row}</div> : <>{row}<RowActions id={d.id} token={d.status === "draft" || d.status === "pending_approval" ? null : d.access_token} number={d.number} /></>}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

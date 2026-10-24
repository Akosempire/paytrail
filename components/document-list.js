import Link from "next/link";
import { FileText, Plus, Receipt, Search } from "lucide-react";
import { Button, Card, EmptyState, Input, PageHeader, cx } from "@/components/ui";
import { StatusBadge } from "@/components/doc-bits";
import { formatMoney } from "@/lib/money";
import { formatDate, isOverdue } from "@/lib/format";
import { documentCounts, listDocuments } from "@/lib/documents";

export async function DocumentListPage({ ctx, kind, searchParams }) {
  const status = searchParams.status || "";
  const q = searchParams.q || "";
  const [rows, counts] = await Promise.all([listDocuments(ctx, { kind, status, q }), documentCounts(ctx, kind)]);
  const quote = kind === "quote";
  const base = quote ? "/app/quotes" : "/app/invoices";
  const tabs = quote
    ? [["", "All", counts.all], ["drafts", "Drafts", counts.drafts], ["open", "Awaiting reply", counts.open], ["accepted", "Accepted", counts.accepted]]
    : [["", "All", counts.all], ["drafts", "Drafts", counts.drafts], ["open", "Unpaid", counts.open], ["overdue", "Overdue", counts.overdue], ["paid", "Paid", counts.paid]];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={quote ? "Quotes" : "Invoices"}
        description={quote ? "Price jobs, send them, and turn accepted quotes into invoices." : "Bills you've sent and what's still owed."}
        actions={<Button href={`${base}/new`} variant="primary" icon={Plus}>{quote ? "New quote" : "New invoice"}</Button>} />
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <nav className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg bg-tray p-1 no-scrollbar" aria-label="Filter">
          {tabs.map(([value, label, count]) => (
            <Link key={value} href={value ? `${base}?status=${value}` : base} aria-current={status === value ? "page" : undefined}
              className={cx("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium whitespace-nowrap",
                status === value ? "bg-surface text-ink shadow-[var(--shadow-xs)] ring-1 ring-line" : "text-ink-3 hover:text-ink")}>
              {label}<span className={cx("tabular", value === "overdue" && count ? "text-danger-ink" : "text-ink-3")}>{count}</span>
            </Link>
          ))}
        </nav>
        <form className="w-full md:w-72">
          {status && <input type="hidden" name="status" value={status} />}
          <Input icon={Search} name="q" defaultValue={q} placeholder="Search number, customer…" aria-label="Search" />
        </form>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={quote ? FileText : Receipt}
          title={q || status ? "Nothing matches" : quote ? "No quotes yet" : "No invoices yet"}
          description={q || status ? "Try another filter or search." : quote ? "Create your first quote. Add your hidden costs to see your profit before you send it." : "Invoices appear here when you convert a quote or bill a customer directly."}
          action={!q && !status && <Button href={`${base}/new`} variant="primary" icon={Plus}>{quote ? "Create a quote" : "Create an invoice"}</Button>} />
      ) : (
        <Card>
          <div className="hidden grid-cols-[130px_minmax(0,1fr)_120px_130px_140px] gap-4 border-b border-line bg-subtle px-5 py-2.5 text-xs font-medium text-ink-3 md:grid">
            <span>Number</span><span>Customer</span><span>{quote ? "Valid until" : "Due"}</span><span>Status</span><span className="text-right">{quote ? "Total" : "Balance"}</span>
          </div>
          <ul className="divide-y divide-line">
            {rows.map((d) => {
              const amount = quote || d.status === "paid" ? d.total_minor : d.total_minor - d.amount_paid_minor;
              return (
                <li key={d.id}>
                  <Link href={`/app/documents/${d.id}`} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 px-5 py-3.5 transition-colors hover:bg-subtle md:grid-cols-[130px_minmax(0,1fr)_120px_130px_140px] md:items-center">
                    <span className="font-mono text-[13px] font-medium text-ink">{d.number}</span>
                    <span className="order-3 min-w-0 md:order-none">
                      <span className="block truncate text-sm font-medium text-ink">{d.customer_name || "No customer"}{d.customer_company ? ` · ${d.customer_company}` : ""}</span>
                      {d.title && <span className="block truncate text-xs text-ink-3">{d.title}</span>}
                    </span>
                    <span className={cx("hidden text-[13px] md:block", isOverdue(d) ? "font-medium text-danger-ink" : "text-ink-2")}>{formatDate(quote ? d.valid_until : d.due_date)}</span>
                    <span className="order-4 justify-self-end md:order-none md:justify-self-start"><StatusBadge doc={d} size="sm" /></span>
                    <span className="order-2 text-right text-sm font-semibold text-ink tabular md:order-none">{formatMoney(amount, d.currency)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

import Link from "next/link";
import { FileText, Plus, Receipt, Search } from "lucide-react";
import { Button, Card, EmptyState, Input, PageHeader, cx } from "@/components/ui";
import { StatusBadge } from "@/components/doc-bits";
import { InvoiceRows } from "@/components/invoice-rows";
import { formatMoney } from "@/lib/money";
import { formatDate, isOverdue } from "@/lib/format";
import { documentCounts, listDocuments } from "@/lib/documents";
import { invoiceSummary } from "@/lib/reminders-core";
import { can } from "@/lib/permissions";
import { collectSummary, compactMoney, defaultInvoiceTab, sortForTab, todayIso } from "@/lib/collect-core";

export async function DocumentListPage({ ctx, kind, searchParams }) {
  const quote = kind === "quote";
  const q = searchParams.q || "";
  const asked = searchParams.status || searchParams.tab || "";
  const counts = await documentCounts(ctx, kind);
  // Invoices open on Unpaid when anything is owed (unless the URL asks for a tab, or it's a search)
  const status = quote ? asked : defaultInvoiceTab(asked || (q ? "all" : ""), counts.open);
  const query = status === "all" ? "" : status;
  const today = todayIso();
  const currency = ctx.business.currency || "NGN";
  let rows = await listDocuments(ctx, { kind, status: query, q });
  const base = quote ? "/app/quotes" : "/app/invoices";
  let summary = null, money = null;
  if (!quote) {
    rows = sortForTab(rows, status, today);
    summary = collectSummary(counts.rows.filter((r) => (r.currency || "NGN") === currency), today, currency);
    money = invoiceSummary(counts.rows, { today, monthStart: today.slice(0, 8) + "01" })[currency] || { outstanding: 0, overdue: 0, paidThisMonth: 0 };
    // paid rows link straight to their latest receipt
    const paidIds = rows.filter((r) => r.status === "paid").map((r) => r.id);
    if (paidIds.length) {
      const { data: recs } = await ctx.supabase.from("receipts").select("id, document_id, issued_at").in("document_id", paidIds).order("issued_at", { ascending: false });
      const latest = new Map();
      for (const r of recs || []) if (!latest.has(r.document_id)) latest.set(r.document_id, r.id);
      rows = rows.map((r) => (latest.has(r.id) ? { ...r, receipt_id: latest.get(r.id) } : r));
    }
  }
  const tabs = quote
    ? [["", "All", counts.all], ["drafts", "Drafts", counts.drafts], ["open", "Awaiting reply", counts.open], ["accepted", "Accepted", counts.accepted]]
    : [
      ["open", "Unpaid", counts.open, money.outstanding ? compactMoney(money.outstanding, currency) : null],
      ["overdue", "Overdue", counts.overdue, money.overdue ? compactMoney(money.overdue, currency) : null],
      ["drafts", "Drafts", counts.drafts],
      ["paid", "Paid", counts.paid, `${compactMoney(money.paidThisMonth, currency)} this month`],
      ["all", "All", counts.all],
    ];
  // older links (?status=sent, ?status=viewed) still work; they just don't light up a tab
  const href = (value) => {
    const p = new URLSearchParams();
    if (value) p.set("status", value);
    if (q) p.set("q", q);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };
  const filtered = Boolean(q || query);
  const empty = (() => {
    if (!filtered) return quote
      ? { title: "No quotes yet", description: "Create your first quote. Add your hidden costs to see your profit before you send it." }
      : { title: "No invoices yet", description: "Your first one takes about a minute." };
    if (!quote && status === "overdue" && !q) return { title: "No overdue invoices. Nice.", description: "Everything you've sent is still within its due date or paid." };
    if (!quote && status === "open" && !q) return { title: "Nothing owed to you right now.", description: "Every invoice you've sent is paid." };
    return { title: "Nothing matches", description: q ? `No ${quote ? "quotes" : "invoices"} match “${q}”. Try a customer name, number or amount.` : "Nothing here yet." };
  })();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={quote ? "Quotes" : "Invoices"}
        description={quote ? "Price jobs, send them, and turn accepted quotes into invoices." : "Bills you've sent and what's still owed."}
        actions={<Button href={`${base}/new`} variant="primary" icon={Plus}>{quote ? "New quote" : "New invoice"}</Button>} />
      {!quote && counts.all > 0 && (
        <p className="-mt-2 text-[15px] text-ink-2" aria-live="polite">
          {summary.count ? <><span className="font-semibold text-ink tabular">{formatMoney(summary.total, currency)}</span>{summary.text.slice(formatMoney(summary.total, currency).length)}</> : summary.text}
        </p>
      )}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <nav className="inline-flex max-w-full items-center gap-0.5 self-start overflow-x-auto rounded-lg bg-tray p-1 no-scrollbar" aria-label="Filter">
          {tabs.map(([value, label, count, amount]) => (
            <Link key={value} href={href(value)} aria-current={status === value ? "page" : undefined}
              className={cx("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium whitespace-nowrap max-sm:h-11",
                status === value ? "bg-surface text-ink shadow-[var(--shadow-xs)] ring-1 ring-line" : "text-ink-3 hover:text-ink")}>
              {label}<span className={cx("tabular", value === "overdue" && count ? "text-danger-ink" : "text-ink-3")}>{count}</span>
              {amount && <span className={cx("tabular", value === "overdue" && count ? "text-danger-ink" : "text-ink-3")}>· {amount}</span>}
            </Link>
          ))}
        </nav>
        <form className="w-full md:w-80" role="search">
          {query && <input type="hidden" name="status" value={query} />}
          <Input icon={Search} name="q" type="search" defaultValue={q} placeholder={quote ? "Search number, customer…" : "Search customer, number or amount"} aria-label="Search" />
        </form>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={quote ? FileText : Receipt} title={empty.title} description={empty.description}
          action={filtered
            ? <Button href={base} variant="secondary">{q ? "Clear search" : "Clear filter"}</Button>
            : <Button href={`${base}/new`} variant="primary" icon={Plus}>{quote ? "Create a quote" : "Create an invoice"}</Button>} />
      ) : !quote ? (
        <InvoiceRows rows={rows} today={today} businessName={ctx.business.name}
          perms={{ canSend: can(ctx.member, "documents.send"), canRecord: can(ctx.member, "payments.record") }} />
      ) : (
        <Card>
          <div className={cx("hidden gap-4 border-b border-line bg-subtle px-5 py-2.5 text-xs font-medium text-ink-3 md:grid",
            "grid-cols-[130px_minmax(0,1fr)_120px_130px_140px]")}>
            <span>Number</span><span>Customer</span><span>{quote ? "Valid until" : "Due"}</span><span>Status</span><span className="text-right">{quote ? "Total" : "Balance"}</span>
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
                <li key={d.id} className="transition-colors hover:bg-subtle">
                  <div className="flex pr-5">{row}</div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

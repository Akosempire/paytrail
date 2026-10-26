import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CalendarClock, Download, FileText, Landmark, ReceiptText } from "lucide-react";
import { requireBusiness } from "@/lib/context";
import { can } from "@/lib/permissions";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { loadTaxMonth, recentMonths } from "@/lib/tax";
import { Badge, buttonClass, Callout, Card, CardHeader, EmptyState, PageHeader, StatCard, StatGroup, cx } from "@/components/ui";

export const metadata = { title: "Tax" };

// VAT charged on the month's invoices, when it's due, and withholding tax
// customers deducted, with a CSV for the accountant. Not tax advice.
export default async function TaxPage({ searchParams }) {
  const [sp, ctx] = await Promise.all([searchParams, requireBusiness()]);
  if (!can(ctx.member, "payments.record")) notFound();
  const { month, invoices, wht, totals, tinReady, whtReady } = await loadTaxMonth(ctx, sp.month);
  const b = ctx.business, cur = b.currency;
  const t = totals[cur] || { taxable: 0, vat: 0, gross: 0, wht: 0, invoices: 0 };
  const others = Object.entries(totals).filter(([c]) => c !== cur);
  const money = (v, c = cur) => formatMoney(v, c);
  const missingTin = invoices.filter((d) => !d.customer_tax_id).length;
  const overdue = new Date(`${month.due}T23:59:59`) < new Date();
  const label = b.tax_label || "VAT";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Tax" description={`${label} you charged and withholding tax your customers deducted, month by month. Share the export with your accountant.`}
        actions={<a href={`/app/tax/export?month=${month.key}`} className={buttonClass({ variant: "primary" })}><Download className="size-4 shrink-0" aria-hidden />Export {month.label}</a>} />

      <nav aria-label="Month" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scroll-thin sm:mx-0 sm:px-0">
        {recentMonths(12).map((m) => (
          <Link key={m.key} href={`/app/tax?month=${m.key}`} aria-current={m.key === month.key ? "page" : undefined}
            className={cx("shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium ring-1 ring-inset", m.key === month.key ? "bg-brand text-white ring-brand" : "bg-surface text-ink-2 ring-line hover:text-ink")}>
            {m.label}
          </Link>
        ))}
      </nav>

      {!tinReady && <Callout tone="warn" icon={AlertTriangle} title="One step left">Run <strong>RUN_NEW_2026-10-26d.sql</strong> in Supabase to add customer TINs and withholding tax.</Callout>}
      {Number(b.tax_rate) === 0 && <Callout tone="info" title={`You're not charging ${label}`}>Your default tax rate is 0%. If your sales pass the VAT threshold, set your rate in Settings → Business & branding.</Callout>}

      <StatGroup cols={4}>
        <StatCard label={`${label} charged`} value={money(t.vat)} hint={`On ${t.invoices} invoice${t.invoices === 1 ? "" : "s"} issued in ${month.label}`} icon={Landmark} tone="brand" />
        <StatCard label={`Sales before ${label}`} value={money(t.taxable)} hint={`${money(t.gross)} including ${label}`} icon={FileText} />
        <StatCard label="Return due" value={formatDate(month.due)} hint={overdue ? "This date has passed" : "21st of the following month"} icon={CalendarClock} tone={overdue ? "warn" : "neutral"} />
        <StatCard label="WHT deducted by customers" value={money(t.wht)} hint="Credits you can claim against your own tax" icon={ReceiptText} tone="violet" />
      </StatGroup>
      {others.length > 0 && <p className="-mt-3 text-[13px] text-ink-3">Also in other currencies: {others.map(([c, v]) => `${formatMoney(v.vat, c)} ${label} on ${v.invoices} invoice${v.invoices === 1 ? "" : "s"}`).join(" · ")}</p>}

      <Card>
        <CardHeader title={`Invoices issued in ${month.label}`} description={`Sent invoices dated this month, not including cancelled ones.${missingTin && tinReady ? ` ${missingTin} without a customer TIN.` : ""}`} />
        {invoices.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13.5px]">
              <thead><tr className="border-y border-line text-left text-[12px] text-ink-3">
                <th className="px-5 py-2.5 font-medium">Invoice</th><th className="px-3 py-2.5 font-medium">Customer</th><th className="px-3 py-2.5 font-medium">TIN</th>
                <th className="px-3 py-2.5 text-right font-medium">Before {label}</th><th className="px-3 py-2.5 text-right font-medium">{label}</th><th className="px-5 py-2.5 text-right font-medium">Total</th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {invoices.map((d) => (
                  <tr key={d.id}>
                    <td className="px-5 py-2.5 whitespace-nowrap"><Link href={`/app/documents/${d.id}`} className="font-medium text-ink hover:underline">{d.number}</Link><div className="text-[12px] text-ink-3">{formatDate(d.issue_date)}</div></td>
                    <td className="max-w-[220px] truncate px-3 py-2.5 text-ink-2">{[d.customer_name, d.customer_company].filter(Boolean).join(", ")}</td>
                    <td className="px-3 py-2.5">{d.customer_tax_id ? <span className="font-mono text-[12.5px] text-ink-2">{d.customer_tax_id}</span> : <Badge size="sm" tone="neutral">None</Badge>}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{money(Number(d.subtotal_minor) - Number(d.discount_minor || 0), d.currency)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{money(d.tax_minor, d.currency)}</td>
                    <td className="px-5 py-2.5 text-right font-medium tabular-nums">{money(d.total_minor, d.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState compact icon={FileText} title={`No invoices issued in ${month.label}`} description="You may still need to file a nil return." />}
      </Card>

      {whtReady && (
        <Card>
          <CardHeader title="Withholding tax deducted" description="Ask each customer for their WHT credit note and attach it to the invoice under Files." />
          {wht.length ? (
            <ul className="divide-y divide-line">
              {wht.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/app/documents/${p.document_id}`} className="text-[14px] font-medium text-ink hover:underline">{p.documents?.number}</Link>
                    <p className="truncate text-[12.5px] text-ink-3">{[p.documents?.customer_name, p.documents?.customer_company].filter(Boolean).join(", ")} · {formatDate(p.paid_at)}</p>
                  </div>
                  <span className="text-[14px] font-semibold tabular-nums">{money(p.wht_minor, p.currency)}</span>
                </li>
              ))}
            </ul>
          ) : <EmptyState compact icon={ReceiptText} title="No WHT deducted this month" description="When a customer pays less because they withheld tax, tick the WHT box when you record the payment." />}
        </Card>
      )}

      <p className="text-[12.5px] text-ink-3">Counts invoices by the date they were issued. Check with your accountant how you should file. Usetally is a record-keeping tool, not tax advice.</p>
    </div>
  );
}

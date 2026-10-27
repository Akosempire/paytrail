import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CalendarClock, Download, FileText, Landmark, ReceiptText } from "lucide-react";
import { requireBusiness } from "@/lib/context";
import { can } from "@/lib/permissions";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { loadTaxMonth, vatByMonth } from "@/lib/tax";
import { PeriodPicker } from "./period-picker";
import { VatReturnCard, VatReturnsList } from "./vat-return";
import { createSupabaseService } from "@/lib/supabase/server";
import { Badge, buttonClass, Callout, Card, CardHeader, EmptyState, PageHeader, StatCard, StatGroup, cx } from "@/components/ui";

export const metadata = { title: "Tax" };

// VAT charged on the month's invoices, when it's due, and withholding tax
// customers deducted, with a CSV for the accountant. Not tax advice.
export default async function TaxPage({ searchParams }) {
  const [sp, ctx] = await Promise.all([searchParams, requireBusiness()]);
  if (!can(ctx.member, "payments.record")) notFound();
  const { month, invoices, wht, totals, tinReady, whtReady } = await loadTaxMonth(ctx, sp.period || sp.month);
  const now = new Date(), today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const vat = await vatByMonth(ctx, [month.year - 3, month.year, now.getFullYear()]);
  const b = ctx.business, cur = b.currency;
  const t = totals[cur] || { taxable: 0, vat: 0, gross: 0, wht: 0, invoices: 0, standard: 0, zero: 0, exempt: 0 };
  const others = Object.entries(totals).filter(([c]) => c !== cur);
  const money = (v, c = cur) => formatMoney(v, c);
  const missingTin = invoices.filter((d) => !d.customer_tax_id).length;
  const overdue = month.type === "month" && new Date(`${month.due}T23:59:59`) < new Date();
  // returns are monthly: in a quarter or year, the next one still to come
  const upcoming = month.months.map((m) => m.due).find((d) => new Date(`${d}T23:59:59`) >= new Date());
  const label = b.tax_label || "VAT";

  // the month's VAT return (or each month's, in a quarter or year)
  const past = month.months.filter((m) => m.key <= today);
  const { data: rets, error: retError } = await ctx.supabase.from("vat_returns").select("*").eq("business_id", b.id).in("period", past.map((m) => m.key).concat(["0000-00"]));
  const retOf = (k) => (rets || []).find((r) => r.period === k) || null;
  const ret = month.type === "month" ? retOf(month.key) : null;
  const service = createSupabaseService();
  const [{ data: retFiles }, consultant, fee] = await Promise.all([
    ret ? ctx.supabase.from("vat_return_files").select("id, kind, name, created_at").eq("return_id", ret.id).order("created_at") : Promise.resolve({ data: [] }),
    ret?.consultant_id ? service.from("tax_consultants").select("name").eq("id", ret.consultant_id).maybeSingle().then((r) => r.data?.name || null) : Promise.resolve(null),
    import("@/lib/vat-returns").then((m) => m.filingFee(service)).catch(() => 0),
  ]);
  const monthsList = past.slice().reverse().map((m) => ({ key: m.key, label: m.label, vat: retOf(m.key)?.vat_minor ?? vat[m.key] ?? 0, status: retOf(m.key)?.status || "to_file", overdue: new Date(`${m.due}T23:59:59`) < now }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Tax" description={`${label} you charged and withholding tax your customers deducted, for any month, quarter or year. Share the export with your accountant.`}
        actions={<a href={`/app/tax/export?period=${month.key}`} className={buttonClass({ variant: "primary" })}><Download className="size-4 shrink-0" aria-hidden />Export {month.label}</a>} />

      <PeriodPicker period={{ type: month.type, key: month.key, label: month.label, long: month.long, year: month.year, quarter: month.quarter || null }} vat={vat} currency={cur} today={today} />

      {!tinReady && <Callout tone="warn" icon={AlertTriangle} title="One step left">Run <strong>RUN_NEW_2026-10-26d.sql</strong> in Supabase to add customer TINs and withholding tax.</Callout>}
      {Number(b.tax_rate) === 0 && <Callout tone="info" title={`You're not charging ${label}`}>Your default tax rate is 0%. If your sales pass the VAT threshold, set your rate in Settings → Business & branding.</Callout>}

      {retError && past.length > 0 && <Callout tone="warn" title="One step left">Run <strong>RUN_NEW_2026-10-27a.sql</strong> in Supabase to track VAT returns here and use "File &amp; pay for me".</Callout>}
      {!retError && month.type === "month" && past.length > 0 && (
        <VatReturnCard period={month.key} label={month.label} due={month.due} dueLabel={formatDate(month.due)} vat={ret && ["filed", "done"].includes(ret.status) ? ret.vat_minor : t.vat} currency={cur}
          ret={ret} files={retFiles || []} consultant={consultant} fee={fee} canAct={can(ctx.member, "payments.record")} overdue={new Date(`${month.due}T23:59:59`) < now} />
      )}
      {!retError && month.type !== "month" && past.length > 0 && <VatReturnsList months={monthsList} currency={cur} />}

      <StatGroup cols={4}>
        <StatCard label={`${label} charged`} value={money(t.vat)} hint={`On ${t.invoices} invoice${t.invoices === 1 ? "" : "s"} issued in ${month.label}`} icon={Landmark} tone="brand" />
        <StatCard label={`Sales before ${label}`} value={money(t.taxable)} hint={t.zero || t.exempt ? `Standard ${money(t.standard)} · zero-rated ${money(t.zero)} · exempt ${money(t.exempt)}` : `${money(t.gross)} including ${label}`} icon={FileText} />
        <StatCard label={month.type === "month" ? "Return due" : upcoming ? "Next return due" : "Returns"} value={month.type === "month" ? formatDate(month.due) : upcoming ? formatDate(upcoming) : `${month.months.length} monthly`} hint={month.type === "month" ? (overdue ? "This date has passed" : "21st of the following month") : `${month.months.length} monthly returns, each due on the 21st`} icon={CalendarClock} tone={overdue ? "warn" : "neutral"} />
        <StatCard label="WHT deducted by customers" value={money(t.wht)} hint="Credits you can claim against your own tax" icon={ReceiptText} tone="violet" />
      </StatGroup>
      {others.length > 0 && <p className="-mt-3 text-[13px] text-ink-3">Also in other currencies: {others.map(([c, v]) => `${formatMoney(v.vat, c)} ${label} on ${v.invoices} invoice${v.invoices === 1 ? "" : "s"}`).join(" · ")}</p>}

      <Card>
        <CardHeader title={`Invoices issued in ${month.label}`} description={`Sent invoices dated in this period, not including cancelled ones.${missingTin && tinReady ? ` ${missingTin} without a customer TIN.` : ""}`} />
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
                    <td className="px-3 py-2.5 text-right tabular-nums">{money(Number(d.total_minor) - Number(d.tax_minor || 0), d.currency)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{money(d.tax_minor, d.currency)}</td>
                    <td className="px-5 py-2.5 text-right font-medium tabular-nums">{money(d.total_minor, d.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState compact icon={FileText} title={`No invoices issued in ${month.label}`} description="You may still need to file a nil return." />}
      </Card>

      <EInvoicing invoices={invoices} />

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
          ) : <EmptyState compact icon={ReceiptText} title={`No WHT deducted in ${month.label}`} description="When a customer pays less because they withheld tax, tick the WHT box when you record the payment." />}
        </Card>
      )}

      <p className="text-[12.5px] text-ink-3">Counts invoices by the date they were issued. Check with your accountant how you should file. Usetally is a record-keeping tool, not tax advice.</p>
    </div>
  );
}

// Nigeria's e-invoicing: how many of this month's invoices have what it needs
function EInvoicing({ invoices }) {
  const ready = invoices.filter((d) => d.einvoice?.ready).length;
  const issues = {};
  for (const d of invoices) for (const m of [...(d.einvoice?.missing || []), ...(d.einvoice?.advice || [])]) issues[m] = (issues[m] || 0) + 1;
  const top = Object.entries(issues).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return (
    <Card>
      <CardHeader title="E-invoicing readiness" description="What NRS e-invoicing needs on each invoice."
        actions={invoices.length ? <Badge tone={ready === invoices.length ? "success" : "warn"} size="sm">{ready} of {invoices.length} ready</Badge> : null} />
      <div className="flex flex-col gap-3 p-5 text-[13.5px] text-ink-2">
        {top.length ? (
          <ul className="space-y-1.5">{top.map(([m, n]) => <li key={m} className="flex justify-between gap-3"><span>{m}</span><span className="shrink-0 text-ink-3">{n} invoice{n === 1 ? "" : "s"}</span></li>)}</ul>
        ) : invoices.length ? <p>All set. Every invoice has what it needs.</p> : <p className="text-ink-3">No invoices in this period.</p>}
      </div>
    </Card>
  );
}

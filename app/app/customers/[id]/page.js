import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText, Plus, Receipt } from "lucide-react";
import { requireBusiness } from "@/lib/context";
import { listDocuments } from "@/lib/documents";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { Avatar, Button, Card, CardHeader, DescriptionList, EmptyState, StatCard, StatGroup } from "@/components/ui";
import { CustomerButton } from "@/components/customer-form";
import { StatusBadge } from "@/components/doc-bits";

export const metadata = { title: "Customer" };

export default async function CustomerPage({ params }) {
  const { id } = await params;
  const ctx = await requireBusiness();
  const { data: c } = await ctx.supabase.from("customers").select("*").eq("id", id).eq("business_id", ctx.business.id).maybeSingle();
  if (!c) notFound();
  const docs = await listDocuments(ctx, { customerId: id, limit: 200 });
  const money = (v) => formatMoney(v, ctx.business.currency);
  const owed = docs.filter((d) => d.kind === "invoice" && ["sent", "viewed", "partially_paid"].includes(d.status)).reduce((s, d) => s + d.total_minor - d.amount_paid_minor, 0);
  const paid = docs.filter((d) => d.kind === "invoice").reduce((s, d) => s + Number(d.amount_paid_minor), 0);
  const won = docs.filter((d) => d.kind === "quote" && d.status === "accepted").length;
  const quoted = docs.filter((d) => d.kind === "quote" && d.status !== "draft" && d.status !== "pending_approval").length;
  return (
    <div className="flex flex-col gap-6">
      <Link href="/app/customers" className="inline-flex items-center gap-1.5 self-start text-[13px] font-medium text-ink-2 hover:text-ink"><ArrowLeft className="size-4" />Customers</Link>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar name={c.name} size="lg" />
          <div><h1 className="text-title-1 text-ink">{c.name}</h1><p className="text-sm text-ink-2">{c.company || "Individual"}{c.archived_at && " · Archived"}</p></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <CustomerButton customer={c} variant="secondary" />
          <Button href={`/app/invoices/new?customer=${c.id}`} icon={Plus}>Invoice</Button>
          <Button href={`/app/quotes/new?customer=${c.id}`} variant="primary" icon={Plus}>Quote</Button>
        </div>
      </div>
      <StatGroup>
        <StatCard label="Owes you" value={money(owed)} />
        <StatCard label="Paid to you" value={money(paid)} />
        <StatCard label="Quotes won" value={`${won} of ${quoted}`} hint={quoted ? `${Math.round((won / quoted) * 100)}% acceptance` : undefined} />
        <StatCard label="Documents" value={docs.length} />
      </StatGroup>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader title="Quotes & invoices" />
          {docs.length ? (
            <ul className="divide-y divide-line">
              {docs.map((d) => (
                <li key={d.id}>
                  <Link href={`/app/documents/${d.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-subtle">
                    {d.kind === "quote" ? <FileText className="size-4 text-ink-3" /> : <Receipt className="size-4 text-ink-3" />}
                    <span className="min-w-0 flex-1"><span className="font-mono text-[13px] font-medium text-ink">{d.number}</span><span className="block truncate text-xs text-ink-3">{d.title || formatDate(d.issue_date)}</span></span>
                    <StatusBadge doc={d} size="sm" />
                    <span className="w-28 text-right text-sm font-semibold tabular">{formatMoney(d.total_minor, d.currency)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <div className="p-5"><EmptyState compact icon={FileText} title="Nothing yet" description="Create a quote for this customer." /></div>}
        </Card>
        <Card>
          <CardHeader title="Details" />
          <DescriptionList items={[["Email", c.email || "—"], ["Phone", c.phone || "—"], ["Address", c.address || "—"], c.notes && ["Notes", c.notes]]} />
        </Card>
      </div>
    </div>
  );
}

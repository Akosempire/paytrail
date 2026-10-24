import Link from "next/link";
import { Download, Receipt, Wallet } from "lucide-react";
import { requireBusiness } from "@/lib/context";
import { formatMoney } from "@/lib/money";
import { PAYMENT_METHODS, formatDate } from "@/lib/format";
import { Badge, Button, Card, EmptyState, PageHeader, StatCard, StatGroup, cx } from "@/components/ui";

export const metadata = { title: "Payments & receipts" };

const METHOD_TONE = { bachs: "brand", flutterwave: "warn", bank_transfer: "success", cash: "neutral", pos: "info", other: "neutral" };

export default async function Payments({ searchParams }) {
  const { method = "" } = await searchParams;
  const ctx = await requireBusiness();
  let query = ctx.supabase.from("payments").select("*, documents(id, number, customer_name, customer_company, kind), receipts(id, number, access_token)").eq("business_id", ctx.business.id).order("paid_at", { ascending: false }).limit(200);
  if (method === "online") query = query.in("method", ["bachs", "flutterwave"]);
  else if (method === "manual") query = query.in("method", ["bank_transfer", "cash", "pos", "other"]);
  const [{ data: payments }, { data: s }] = await Promise.all([query, ctx.supabase.rpc("business_summary", { target: ctx.business.id })]);
  const money = (v) => formatMoney(v, ctx.business.currency);
  const online = (payments || []).filter((p) => ["bachs", "flutterwave"].includes(p.method)).reduce((a, p) => a + Number(p.amount_minor), 0);
  const tabs = [["", "All"], ["online", "Online"], ["manual", "Recorded by team"]];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Payments & receipts" description="Every payment received, with the receipt that was issued for it." />
      <StatGroup cols={3}>
        <StatCard label="Collected this month" value={money(s?.collected_month_minor || 0)} icon={Wallet} tone="success" />
        <StatCard label="Still owed" value={money(s?.outstanding_minor || 0)} icon={Receipt} tone="warn" />
        <StatCard label="Paid online" value={money(online)} hint="Bachs + Flutterwave, in the list below" />
      </StatGroup>
      <nav className="inline-flex items-center gap-0.5 self-start rounded-lg bg-tray p-1" aria-label="Filter">
        {tabs.map(([v, l]) => (
          <Link key={v} href={v ? `/app/payments?method=${v}` : "/app/payments"} className={cx("inline-flex h-8 items-center rounded-md px-3 text-[13px] font-medium", method === v ? "bg-surface text-ink shadow-[var(--shadow-xs)] ring-1 ring-line" : "text-ink-3 hover:text-ink")}>{l}</Link>
        ))}
      </nav>
      {!payments?.length ? (
        <EmptyState icon={Wallet} title="No payments yet" description="Payments appear here when customers pay online, or when your team records a transfer." />
      ) : (
        <Card>
          <div className="hidden grid-cols-[110px_minmax(0,1fr)_140px_120px_140px] gap-4 border-b border-line bg-subtle px-5 py-2.5 text-xs font-medium text-ink-3 md:grid">
            <span>Date</span><span>From</span><span>Method</span><span>Receipt</span><span className="text-right">Amount</span>
          </div>
          <ul className="divide-y divide-line">
            {payments.map((p) => {
              const r = Array.isArray(p.receipts) ? p.receipts[0] : p.receipts;
              return (
                <li key={p.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-5 py-3.5 md:grid-cols-[110px_minmax(0,1fr)_140px_120px_140px]">
                  <span className="text-[13px] text-ink-2">{formatDate(p.paid_at)}</span>
                  <Link href={`/app/documents/${p.documents?.id}`} className="order-3 min-w-0 md:order-none">
                    <span className="block truncate text-sm font-medium text-ink hover:text-brand-ink">{p.documents?.customer_company || p.documents?.customer_name}</span>
                    <span className="block truncate font-mono text-xs text-ink-3">{p.documents?.number}{p.reference ? ` · ${p.reference}` : ""}</span>
                  </Link>
                  <span className="order-4 md:order-none"><Badge tone={METHOD_TONE[p.method]} size="sm">{PAYMENT_METHODS[p.method]}</Badge></span>
                  <span className="hidden md:block">{r && <span className="flex items-center gap-1"><Link href={`/r/${r.access_token}`} className="font-mono text-[13px] text-brand-ink hover:underline">{r.number}</Link><Button size="sm" variant="ghost" href={`/app/receipts/${r.id}/pdf`} icon={Download} aria-label="Download receipt PDF" className="!px-1.5" /></span>}</span>
                  <span className="order-2 text-right text-sm font-semibold text-ink tabular md:order-none">{formatMoney(p.amount_minor, p.currency)}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

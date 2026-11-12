import { AlertTriangle, Building2, CreditCard, FileCheck2, FileText, Layers, ReceiptText, ShoppingBag, Sparkles, UserPlus, Wallet } from "lucide-react";
import { requireFounderView } from "@/lib/context";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatCard, StatGroup } from "@/components/ui";
import { change, shortMoney, gatewayName, gatewayStatus, mainAmount, methodName, monthLabel, moneyText, successRate } from "@/lib/founder-core";

export const metadata = { title: "Founder dashboard" };
const n = (v) => Number(v || 0).toLocaleString("en-NG");
export const dynamic = "force-dynamic";

// How Usetally is doing, for founders who don't need the technical side:
// customers, money in, and the payment gateway. Read-only, one database call
// (founder_summary), which only founders and platform admins may make.
export default async function FounderHome() {
  const ctx = await requireFounderView();
  const [{ data: s, error }, { data: sent }] = await Promise.all([ctx.supabase.rpc("founder_summary"), ctx.supabase.rpc("founder_sent_counts")]);
  if (error || !s) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Founder dashboard" />
        <Card><EmptyState icon={AlertTriangle} title="The numbers couldn't load" description="Try again in a minute. If it keeps happening, ask your platform admin to check that the founder dashboard is set up." /></Card>
      </div>
    );
  }

  const months = s.months || [];
  const gw = gatewayStatus(s.gateway);
  const rate = successRate(s.checkouts_month);
  const revMax = Math.max(1, ...months.map((m) => mainAmount(m.revenue)));
  const signMax = Math.max(1, ...months.map((m) => Number(m.signups || 0)));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow={<Badge tone="brand" size="sm">View only</Badge>} title="How Usetally is doing" description="Customers, money in and payments. Updated every time you open this page." />

      <StatGroup>
        <StatCard icon={Wallet} tone="success" label="Money in this month" value={moneyText(s.revenue_month)} trend={change(mainAmount(s.revenue_month), mainAmount(s.revenue_last_month))} hint={`Last month: ${moneyText(s.revenue_last_month)}`} />
        <StatCard icon={Building2} tone="brand" label="Paying businesses" value={s.paying ?? 0} hint={`${s.businesses ?? 0} businesses in total`} />
        <StatCard icon={Sparkles} tone="info" label="On free trial" value={s.trialing ?? 0} hint={s.lapsed ? `${s.lapsed} stopped paying` : "None have stopped paying"} />
        <StatCard icon={UserPlus} tone="violet" label="New sign-ups this month" value={s.signups_month ?? 0} trend={change(s.signups_month, s.signups_last_month)} hint={`Last month: ${s.signups_last_month ?? 0}`} />
      </StatGroup>

      {sent && (
        <section className="flex flex-col gap-3" aria-labelledby="sent-title">
          <div className="flex items-baseline justify-between gap-3 px-1">
            <h2 id="sent-title" className="text-[15px] font-semibold text-ink">Sent out with Usetally this month</h2>
            <span className="text-xs text-ink-3">All businesses</span>
          </div>
          <StatGroup>
            <StatCard icon={FileText} tone="brand" label="Quotes sent" value={n(sent.quotes.month)} trend={change(sent.quotes.month, sent.quotes.last_month)} hint={`Last month ${n(sent.quotes.last_month)} · All time ${n(sent.quotes.all)}`} />
            <StatCard icon={FileCheck2} tone="violet" label="Invoices sent" value={n(sent.invoices.month)} trend={change(sent.invoices.month, sent.invoices.last_month)} hint={`Last month ${n(sent.invoices.last_month)} · All time ${n(sent.invoices.all)}`} />
            <StatCard icon={ReceiptText} tone="success" label="Receipts issued" value={n(sent.receipts.month)} trend={change(sent.receipts.month, sent.receipts.last_month)} hint={`Last month ${n(sent.receipts.last_month)} · All time ${n(sent.receipts.all)}`} />
            <StatCard icon={ShoppingBag} tone="info" label="Shop sales (TrackOja)" value={n(sent.pos_sales.month)} trend={change(sent.pos_sales.month, sent.pos_sales.last_month)} hint={`Last month ${n(sent.pos_sales.last_month)} · All time ${n(sent.pos_sales.all)}`} />
          </StatGroup>
        </section>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Money in, last 6 months" description={`Payments for Usetally plans. All time: ${moneyText(s.revenue_all)}.`} />
          <Bars items={months.map((m) => ({ key: m.month, label: monthLabel(m.month), value: mainAmount(m.revenue), text: moneyText(m.revenue, "₦0"), short: shortMoney(mainAmount(m.revenue)), share: mainAmount(m.revenue) / revMax }))} tone="bg-success" sr="Money in per month" />
        </Card>
        <Card>
          <CardHeader title="New sign-ups, last 6 months" description="Businesses that created an account." />
          <Bars items={months.map((m) => ({ key: m.month, label: monthLabel(m.month), value: Number(m.signups || 0), text: String(m.signups || 0), share: Number(m.signups || 0) / signMax }))} tone="bg-brand" sr="New sign-ups per month" />
        </Card>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card>
          <CardHeader icon={CreditCard} iconTone="brand" title="Payment gateway" description="How customers pay for their Usetally plan." actions={<Badge tone={gw.tone} size="sm">{gw.label}</Badge>} />
          <div className="flex flex-col gap-5 p-5">
            <div>
              <p className="text-[22px] font-semibold tracking-[-0.02em] text-ink">{gatewayName(s.gateway?.provider)}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">{gw.text}</p>
            </div>
            <dl className="grid grid-cols-3 gap-2 rounded-xl bg-tray p-1.5 text-center">
              <Num label="Checkouts started" value={s.checkouts_month?.started ?? 0} />
              <Num label="Paid" value={s.checkouts_month?.paid ?? 0} />
              <Num label="Didn't finish" value={s.checkouts_month?.unfinished ?? 0} />
            </dl>
            <p className="text-[13px] text-ink-3">{rate == null ? "No finished checkouts yet this month." : `This month, ${rate}% of finished checkouts ended in a payment.`}</p>
          </div>
        </Card>

        <Card>
          <CardHeader icon={Wallet} iconTone="success" title="Latest payments" description="The most recent money received for Usetally plans." />
          {(s.recent_payments || []).length ? (
            <ul className="divide-y divide-line">
              {s.recent_payments.map((p, i) => (
                <li key={i} className="flex items-center gap-3 px-5 py-3">
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">{p.business}</span><span className="text-xs text-ink-3">{p.plan || "Plan"} · {methodName(p.method)} · {formatDate(p.at)}</span></span>
                  <span className="text-sm font-semibold text-success-ink tabular">+{formatMoney(p.amount_minor, p.currency)}</span>
                </li>
              ))}
            </ul>
          ) : <EmptyState compact icon={Wallet} title="No payments yet" description="Payments for Usetally plans show up here." />}
        </Card>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader icon={AlertTriangle} iconTone="warn" title="Upgrades not finished" description="Started paying in the last 14 days but didn't complete. Your admin can follow up with them." />
          {(s.unpaid || []).length ? (
            <ul className="divide-y divide-line">
              {s.unpaid.map((u, i) => (
                <li key={i} className="flex items-center gap-3 px-5 py-3">
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">{u.business}</span><span className="text-xs text-ink-3">{u.plan || "Plan"} · {formatMoney(u.amount_minor, u.currency)} · {formatDate(u.at)}</span></span>
                  <Badge size="sm" tone="warn">{u.reason}</Badge>
                </li>
              ))}
            </ul>
          ) : <EmptyState compact icon={AlertTriangle} title="Nothing waiting" description="Everyone who started paying recently finished." />}
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader icon={Layers} iconTone="violet" title="Paying businesses by plan" />
            {(s.plans || []).length ? (
              <ul className="divide-y divide-line">
                {s.plans.map((p) => (
                  <li key={p.name} className="flex items-center gap-3 px-5 py-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{p.name}</span>
                    <span className="text-sm font-semibold text-ink tabular">{p.businesses}</span>
                  </li>
                ))}
              </ul>
            ) : <EmptyState compact icon={Layers} title="No paying businesses yet" />}
          </Card>
          <Card>
            <CardHeader icon={Building2} title="Who uses Usetally" />
            <dl className="grid grid-cols-2 gap-2 p-5 pt-0">
              <Num label="Freelancers" value={Math.max(0, (s.businesses ?? 0) - (s.companies ?? 0))} hint={`of ${s.businesses ?? 0} businesses`} left />
              <Num label="Companies" value={s.companies ?? 0} hint={`of ${s.businesses ?? 0} businesses`} left />
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Num({ label, value, hint, left }) {
  return (
    <div className={left ? "flex flex-col gap-0.5 rounded-lg bg-tray p-3" : "flex flex-col-reverse gap-0.5 rounded-lg bg-surface p-3 ring-1 ring-line"}>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className={left ? "order-first text-[22px] font-semibold text-ink tabular" : "text-[22px] font-semibold text-ink tabular"}>{value}</dd>
      {hint && <span className="text-xs text-ink-3">{hint}</span>}
    </div>
  );
}

// simple bars, one per month, value written above each (no chart library)
function Bars({ items, tone, sr }) {
  return (
    <div className="px-5 pt-2 pb-5">
      <table className="sr-only"><caption>{sr}</caption><tbody>{items.map((i) => <tr key={i.key}><th scope="row">{i.label}</th><td>{i.text}</td></tr>)}</tbody></table>
      <div aria-hidden="true" className="grid h-48 grid-cols-6 items-end gap-3">
        {items.map((i, n) => (
          <div key={i.key} className="flex h-full flex-col items-center justify-end gap-1.5">
            <span className="w-full truncate text-center text-[11px] font-medium text-ink-2 tabular">{i.value ? <><span className="sm:hidden">{i.short || i.text}</span><span className="hidden sm:inline">{i.text}</span></> : ""}</span>
            <div className={`w-full rounded-t-md ${tone} ${n === items.length - 1 ? "" : "opacity-60"}`} style={{ height: `${Math.max(i.value ? 4 : 1.5, i.share * 100)}%` }} />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="mt-2 grid grid-cols-6 gap-3 border-t border-line pt-2">
        {items.map((i) => <span key={i.key} className="text-center text-xs text-ink-3">{i.label}</span>)}
      </div>
    </div>
  );
}

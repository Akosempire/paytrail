import { redirect } from "next/navigation";
import Link from "next/link";
import { Building2, FileText, Sparkles, Wallet, AlertTriangle } from "lucide-react";
import { adminAreaAccess } from "@/lib/context";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { Badge, Card, CardHeader, PageHeader, StatCard, StatGroup } from "@/components/ui";

export default async function AdminHome() {
  const { ctx, cofounder } = await adminAreaAccess();
  if (cofounder) redirect("/admin/businesses"); // the overview is for platform admins
  const [{ data: s }, { data: recent }] = await Promise.all([
    ctx.supabase.rpc("platform_summary"),
    ctx.supabase.from("businesses").select("id, name, kind, subscription_status, created_at, plans(name)").order("created_at", { ascending: false }).limit(10),
  ]);
  const revenue = Object.entries(s?.subscription_revenue_month || {});
  // upgrades started in the last 14 days that weren't paid (and weren't paid later either)
  const since = new Date(Date.now() - 14 * 864e5).toISOString();
  const [{ data: failedSubs }, { data: paidSubs }] = await Promise.all([
    ctx.supabase.from("payment_attempts").select("id, business_id, amount_minor, currency, created_at, failure_reason, businesses(name), plans(name)").eq("purpose", "subscription").eq("status", "failed").gt("created_at", since).order("created_at", { ascending: false }).limit(50).then((r) => r, () => ({ data: [] })),
    ctx.supabase.from("payment_attempts").select("business_id, created_at").eq("purpose", "subscription").eq("status", "succeeded").gt("created_at", since).then((r) => r, () => ({ data: [] })),
  ]);
  const seen = new Set();
  const unpaid = (failedSubs || []).filter((a) => {
    if (/test_mode_payment|mismatch/.test(a.failure_reason || "") || seen.has(a.business_id)) return false;
    seen.add(a.business_id);
    return !(paidSubs || []).some((p) => p.business_id === a.business_id && p.created_at > a.created_at);
  });
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Usetally overview" description="Every business on the platform, and how billing is going." />
      <StatGroup>
        <StatCard icon={Building2} tone="brand" label="Businesses" value={s?.businesses ?? 0} hint={`${s?.companies ?? 0} companies`} />
        <StatCard icon={Sparkles} tone="info" label="On free trial" value={s?.trialing ?? 0} />
        <StatCard icon={Wallet} tone="success" label="Paying" value={s?.active ?? 0} hint={revenue.length ? revenue.map(([c, v]) => formatMoney(v, c)).join(" + ") + " this month" : "No subscription income yet this month"} />
        <StatCard icon={AlertTriangle} tone="warn" label="Lapsed" value={s?.past_due ?? 0} hint={`${s?.documents_month ?? 0} documents sent this month`} />
      </StatGroup>
      {unpaid.length > 0 && (
        <Card>
          <CardHeader title={`Upgrades not paid (${unpaid.length})`} description="Started paying in the last 14 days but didn't finish. A short message often gets them over the line." />
          <ul className="divide-y divide-line">
            {unpaid.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">{a.businesses?.name || "Business"}</span><span className="text-xs text-ink-3">{a.plans?.name || "Plan"} · {formatMoney(a.amount_minor, a.currency)} · {formatDate(a.created_at)} · {/expired|abandon/.test(a.failure_reason || "") ? "checkout expired" : /declin/.test(a.failure_reason || "") ? "card declined" : "not completed"}</span></span>
                <Link href={`/admin/businesses/${a.business_id}?message=upgrade_unpaid#message`} className="inline-flex min-h-9 items-center rounded-md px-3 text-[13px] font-medium text-brand-ink ring-1 ring-line hover:bg-hover">Message</Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card>
        <CardHeader title="Newest businesses" actions={<Link href="/admin/businesses" className="text-[13px] font-medium text-brand-ink">See all</Link>} />
        <ul className="divide-y divide-line">
          {(recent || []).map((b) => (
            <li key={b.id}><Link href={`/admin/businesses?q=${encodeURIComponent(b.name)}`} className="flex items-center gap-3 px-5 py-3 hover:bg-subtle">
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">{b.name}</span><span className="text-xs text-ink-3">{b.kind === "company" ? "Company" : "Freelancer"} · joined {formatDate(b.created_at)}</span></span>
              <span className="text-[13px] text-ink-2">{b.plans?.name || "—"}</span>
              <Badge size="sm" tone={b.subscription_status === "active" ? "success" : b.subscription_status === "trialing" ? "brand" : "warn"}>{b.subscription_status}</Badge>
            </Link></li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

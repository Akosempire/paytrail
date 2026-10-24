import Link from "next/link";
import { Building2, FileText, Sparkles, Wallet, AlertTriangle } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/context";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { Badge, Card, CardHeader, PageHeader, StatCard, StatGroup } from "@/components/ui";

export default async function AdminHome() {
  const ctx = await requirePlatformAdmin();
  const [{ data: s }, { data: recent }] = await Promise.all([
    ctx.supabase.rpc("platform_summary"),
    ctx.supabase.from("businesses").select("id, name, kind, subscription_status, created_at, plans(name)").order("created_at", { ascending: false }).limit(10),
  ]);
  const revenue = Object.entries(s?.subscription_revenue_month || {});
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Usetally overview" description="Every business on the platform, and how billing is going." />
      <StatGroup>
        <StatCard icon={Building2} tone="brand" label="Businesses" value={s?.businesses ?? 0} hint={`${s?.companies ?? 0} companies`} />
        <StatCard icon={Sparkles} tone="info" label="On free trial" value={s?.trialing ?? 0} />
        <StatCard icon={Wallet} tone="success" label="Paying" value={s?.active ?? 0} hint={revenue.length ? revenue.map(([c, v]) => formatMoney(v, c)).join(" + ") + " this month" : "No subscription income yet this month"} />
        <StatCard icon={AlertTriangle} tone="warn" label="Lapsed" value={s?.past_due ?? 0} hint={`${s?.documents_month ?? 0} documents sent this month`} />
      </StatGroup>
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

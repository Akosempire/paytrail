import { BarChart3, CircleDollarSign, Clock, Coins, Megaphone, ReceiptText, TrendingUp, UserPlus, Users } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/context";
import { createSupabaseService } from "@/lib/supabase/server";
import { Badge, Callout, Card, CardHeader, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { marketingSettings } from "@/lib/meta";
import { PERIODS, periodReport, trend } from "@/lib/marketing";
import { funnel } from "@/lib/marketing-core";
import { formatDate } from "@/lib/format";
import { AdsTable, Filters, Funnel, MetaConnection, SyncNow, Thresholds, TrendChart } from "./ui";
import { moneyIn } from "@/lib/marketing-format";

export const metadata = { title: "Marketing" };
export const dynamic = "force-dynamic";

const ago = (iso) => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : formatDate(iso);
};

export default async function Marketing({ searchParams }) {
  await requirePlatformAdmin();
  const sp = await searchParams;
  const period = PERIODS[sp.period] ? sp.period : "7d";
  const country = ["NG", "UK"].includes(sp.country) ? sp.country : "all";
  const cfg = await marketingSettings();
  if (!cfg.ready) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Marketing" description="Which ads bring sign-ups and paying customers, and which waste money." />
        <Callout tone="warn" title="One step left">Run <strong>RUN_NEW_2026-10-28a.sql</strong> in Supabase (SQL Editor), then refresh this page.</Callout>
      </div>
    );
  }
  const service = createSupabaseService();
  // "last 6h": spend since the sync about 6 hours ago
  const { data: older } = await service.from("marketing_reports").select("summary").lte("sent_at", new Date(Date.now() - 5.5 * 3600_000).toISOString()).order("sent_at", { ascending: false }).limit(1);
  const [rep, days, { data: reports }] = await Promise.all([
    periodReport(service, cfg, period, { country, prevSnapshot: older?.[0]?.summary?.snapshot || null }),
    trend(service, { country }),
    service.from("marketing_reports").select("id, sent_at, status, summary").order("sent_at", { ascending: false }).limit(20),
  ]);
  const money = moneyIn(rep.accountCurrency), t = rep.totals;
  const steps = funnel([{ label: "Visits (landing page views)", value: t.landing_page_views }, { label: "Sign-ups", value: t.signups }, { label: "Trials", value: t.trials }, { label: "Paid", value: t.paid }]);
  const connected = Boolean(cfg.accessToken && cfg.adAccountId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Marketing" description="Which ads bring sign-ups and paying customers, and which waste money. Synced from Meta every 6 hours."
        actions={<div className="flex items-center gap-3"><span className="inline-flex items-center gap-1.5 text-[13px] text-ink-3"><Clock className="size-3.5" />Synced {ago(cfg.row.last_sync_at)}</span><SyncNow /></div>} />
      {cfg.row.last_sync_error && <Callout tone="warn" title="Last sync had a problem">{cfg.row.last_sync_error}</Callout>}
      <Filters period={period} country={country} periods={PERIODS} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Spend" value={rep.spendKnown ? money(t.spend) : "—"} hint={rep.spendKnown ? rep.label : "Needs a sync from 6 hours ago"} icon={Coins} tone="brand" />
        <StatCard label="Sign-ups from ads" value={t.signups} hint={rep.otherSignups ? `+${rep.otherSignups} from elsewhere` : rep.label} icon={UserPlus} />
        <StatCard label="Cost per sign-up" value={money(t.cost_per_signup)} hint={`Most you set: ${money(cfg.thresholds.max_cost_per_signup)}`} icon={CircleDollarSign} />
        <StatCard label="Trials" value={t.trials} icon={Users} />
        <StatCard label="Paid" value={t.paid} icon={ReceiptText} tone="violet" />
        <StatCard label="Revenue" value={money(t.revenue)} hint={rep.accountCurrency === "NGN" ? `$ at ₦${cfg.thresholds.ngn_per_usd}` : undefined} icon={TrendingUp} />
        <StatCard label="Return on spend" value={t.return_on_spend != null ? `${t.return_on_spend.toFixed(2)}×` : "—"} hint="Revenue ÷ spend" icon={BarChart3} tone="brand" />
      </div>

      <Card>
        <CardHeader icon={Megaphone} title="Ads" description={`${rep.label}${country !== "all" ? ` · ${country}` : ""}. Sign-ups are counted in Usetally, matched by each ad's utm_content.`} />
        <div className="p-3 sm:p-5 sm:pt-2">
          {rep.rows.length ? <AdsTable rows={rep.rows} currency={rep.accountCurrency} />
            : <EmptyState compact icon={Megaphone} title="No ad data yet" description={connected ? "Click Sync now, or wait for the next 6-hourly sync." : "Add the Meta access token and ad account ID below (Meta connection), then click Sync now."} />}
        </div>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Funnel" description="Where people drop off." /><div className="p-5 pt-1"><Funnel steps={steps} /></div></Card>
        <Card><CardHeader title="Last 14 days" description="Daily spend and sign-ups from ads." /><div className="p-5 pt-1"><TrendChart days={days} currency={rep.accountCurrency} /></div></Card>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <MetaConnection saved={cfg.row} />
        <Thresholds saved={cfg.row} currency={rep.accountCurrency} />
      </div>

      <Card>
        <CardHeader title="Reports" description="The last 20 syncs and emails." />
        {reports?.length ? (
          <ul className="divide-y divide-line">
            {reports.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-[13.5px]">
                <span className="text-ink">{formatDate(r.sent_at)} · {new Date(r.sent_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" })}<span className="ml-2 text-ink-3">{r.summary?.trigger === "admin" ? "Sync now" : "Scheduled"}</span></span>
                <span className="flex items-center gap-2 text-ink-3">
                  {r.summary?.periods?.["6h"] && <span className="tabular-nums">{r.summary.periods["6h"].signups} sign-ups · 6h</span>}
                  <Badge tone={r.status === "sent" ? "success" : r.status === "error" ? "danger" : "neutral"} size="sm">{r.status === "sent" ? "Emailed" : r.status === "error" ? "Error" : "Saved"}</Badge>
                </span>
                {(r.summary?.error || r.summary?.emailError) && <p className="w-full text-[12.5px] text-danger-ink">{r.summary.error || r.summary.emailError}</p>}
              </li>
            ))}
          </ul>
        ) : <div className="p-5 pt-0"><EmptyState compact icon={Clock} title="No reports yet" description="The first one goes out at the next 6-hourly sync." /></div>}
      </Card>
    </div>
  );
}

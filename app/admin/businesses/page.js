import { Search } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/context";
import { createSupabaseService } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { Badge, Card, Input, PageHeader } from "@/components/ui";
import { AccountButton } from "./account-button";

export const metadata = { title: "Businesses" };

export default async function Businesses({ searchParams }) {
  const { q = "", status = "" } = await searchParams;
  const ctx = await requirePlatformAdmin();
  const service = createSupabaseService();
  let query = service.from("businesses").select("id, name, kind, email, subscription_status, plan_id, current_period_end, trial_documents_used, trial_ends_at, deletion_scheduled_for, created_at, plans(name)").order("created_at", { ascending: false }).limit(300);
  const term = q.replace(/[%,()]/g, " ").trim();
  if (term) query = query.or(`name.ilike.%${term}%,email.ilike.%${term}%`);
  if (status) query = query.eq("subscription_status", status);
  const [{ data: rows }, { data: plans }, { data: members }, { data: docs }] = await Promise.all([
    query,
    ctx.supabase.from("plans").select("id, name, price_minor, currency, billing_interval, active").order("sort_order"),
    service.from("memberships").select("business_id"),
    service.from("documents").select("business_id").not("sent_at", "is", null),
  ]);
  const seats = {}; for (const m of members || []) seats[m.business_id] = (seats[m.business_id] || 0) + 1;
  const sent = {}; for (const d of docs || []) sent[d.business_id] = (sent[d.business_id] || 0) + 1;
  const tone = { active: "success", trialing: "brand", past_due: "warn", canceled: "warn", suspended: "danger" };
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Businesses" description="Change plans, record bank-transfer subscriptions, extend trials or suspend accounts." />
      <form className="flex flex-col gap-3 sm:flex-row">
        <Input icon={Search} name="q" defaultValue={q} placeholder="Search name or email" className="sm:w-80" aria-label="Search" />
        <select name="status" defaultValue={status} className="h-10 rounded-md bg-surface px-3 text-sm ring-1 ring-inset ring-line-strong" aria-label="Status">
          <option value="">All statuses</option>{Object.keys(tone).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="h-10 rounded-md bg-surface px-4 text-sm font-medium ring-1 ring-inset ring-line-strong" type="submit">Filter</button>
      </form>
      <Card>
        <div className="hidden grid-cols-[minmax(0,1fr)_110px_140px_70px_80px_100px] gap-4 border-b border-line bg-subtle px-5 py-2.5 text-xs font-medium text-ink-3 lg:grid">
          <span>Business</span><span>Status</span><span>Plan</span><span className="text-right">Seats</span><span className="text-right">Sent</span><span />
        </div>
        <ul className="divide-y divide-line">
          {(rows || []).map((b) => (
            <li key={b.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-5 py-3.5 lg:grid-cols-[minmax(0,1fr)_110px_140px_70px_80px_100px]">
              <span className="min-w-0"><span className="block truncate text-sm font-medium text-ink">{b.name}</span><span className="block truncate text-xs text-ink-3">{b.kind === "company" ? "Company" : "Freelancer"} · {b.email || "no email"} · since {formatDate(b.created_at)}</span></span>
              <span><Badge size="sm" tone={tone[b.subscription_status]}>{b.subscription_status.replace("_", " ")}</Badge>{b.deletion_scheduled_for && <span className="mt-1 block text-xs text-danger-ink">Deletes {formatDate(b.deletion_scheduled_for)}</span>}</span>
              <span className="text-[13px] text-ink-2">{b.plans?.name || (b.subscription_status === "trialing" ? `Trial · ${b.trial_documents_used} used` : "—")}{b.current_period_end && <span className="block text-xs text-ink-3">until {formatDate(b.current_period_end)}</span>}</span>
              <span className="hidden text-right text-sm tabular lg:block">{seats[b.id] || 0}</span>
              <span className="hidden text-right text-sm tabular lg:block">{sent[b.id] || 0}</span>
              <span className="justify-self-end"><AccountButton business={{ id: b.id, name: b.name, status: b.subscription_status, plan_id: b.plan_id }} plans={plans || []} /></span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

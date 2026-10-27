import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, CreditCard, FileText, History, Landmark, Mail, Phone, Plug, Users, Wallet } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/context";
import { createSupabaseService } from "@/lib/supabase/server";
import { formatDate, timeAgo } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { logoUrl } from "@/lib/site";
import { isPaying, onFreeTier } from "@/lib/plans";
import { ROLES } from "@/lib/permissions";
import { activityText } from "@/components/doc-bits";
import { Avatar, Badge, Card, CardHeader, EmptyState, StatCard, StatGroup, buttonClass } from "@/components/ui";
import { AccountButton } from "../account-button";
import { FreeAccessButton } from "./controls";

export const metadata = { title: "Business" };

const TONE = { active: "success", trialing: "brand", past_due: "warn", canceled: "warn", suspended: "danger" };

// Everything about one business for the platform admin: plan and billing,
// usage, team, details, payment setup, history, and actions.
export default async function BusinessDetail({ params }) {
  const { id } = await params;
  const ctx = await requirePlatformAdmin();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const service = createSupabaseService();
  const { data: b } = await service.from("businesses").select("*, plans(id, name, price_minor, currency, billing_interval, document_limit, seat_limit)").eq("id", id).maybeSingle();
  if (!b) notFound();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const [{ data: plans }, { data: members }, { data: docs }, { data: pays }, { count: customers }, { data: connections }, { data: subs }, { data: activity }, { data: allowance }, { data: returns }] = await Promise.all([
    ctx.supabase.from("plans").select("id, name, price_minor, currency, billing_interval, active").order("sort_order"),
    service.from("memberships").select("user_id, role, full_name, email, created_at").eq("business_id", id).order("created_at"),
    service.from("documents").select("kind, status, sent_at, total_minor, currency, created_at").eq("business_id", id).limit(5000),
    service.from("payments").select("amount_minor, currency, paid_at").eq("business_id", id).limit(5000),
    service.from("customers").select("id", { count: "exact", head: true }).eq("business_id", id),
    service.from("payment_connections").select("provider, mode, enabled, payment_confirmed_at, webhook_confirmed_at").eq("business_id", id),
    service.from("subscription_payments").select("*, plans(name)").eq("business_id", id).order("created_at", { ascending: false }).limit(20),
    service.from("activity").select("id, action, actor_label, created_at, detail, document_id, documents(number)").eq("business_id", id).order("created_at", { ascending: false }).limit(15),
    service.rpc("business_allowance", { target: id }),
    (async () => { try { return await service.from("vat_returns").select("period, status").eq("business_id", id).order("period", { ascending: false }).limit(6); } catch { return { data: null }; } })(),
  ]);

  const sent = (docs || []).filter((d) => d.sent_at);
  const sentMonth = sent.filter((d) => d.sent_at >= monthStart).length;
  const count = (k) => sent.filter((d) => d.kind === k).length;
  const collected = {};
  for (const p of pays || []) collected[p.currency] = (collected[p.currency] || 0) + Number(p.amount_minor || 0);
  const lastActive = [activity?.[0]?.created_at, sent[0]?.sent_at].filter(Boolean).sort().pop();
  const paying = isPaying(b), free = onFreeTier(b);
  const owner = (members || []).find((m) => m.role === "owner");
  const contact = b.email || owner?.email;
  const a = allowance || {};
  const planLine = paying ? `${b.plans?.name} · ${formatMoney(b.plans?.price_minor, b.plans?.currency)} / ${b.plans?.billing_interval}`
    : b.subscription_status === "trialing" && !free ? "Free trial" : free ? "Free plan" : b.plans?.name || "No plan";

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/businesses" className="inline-flex items-center gap-1.5 self-start text-[13px] font-medium text-ink-3 hover:text-ink"><ArrowLeft className="size-4" />All businesses</Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar size="lg" name={b.name} src={logoUrl(b.logo_path)} color={b.logo_path ? null : b.brand_color} />
          <div className="min-w-0">
            <h1 className="truncate text-title-1 text-ink">{b.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
              <Badge size="sm" tone={free ? "neutral" : TONE[b.subscription_status]}>{free ? "free" : b.subscription_status.replace("_", " ")}</Badge>
              {b.kind === "company" ? "Company" : "Freelancer"} · joined {formatDate(b.created_at)}{lastActive ? ` · active ${timeAgo(lastActive)}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {contact && <a href={`mailto:${contact}`} className={buttonClass({ size: "sm" })}><Mail className="size-4" />Email</a>}
          <FreeAccessButton business={{ id: b.id, name: b.name, plan_id: b.plan_id }} plans={(plans || []).filter((p) => p.price_minor > 0)} />
          <AccountButton business={{ id: b.id, name: b.name, status: b.subscription_status, plan_id: b.plan_id }} plans={plans || []} />
        </div>
      </div>

      {b.deletion_scheduled_for && <Card className="p-4 text-[13.5px] text-danger-ink ring-danger/30">Deletion requested. Their data is deleted on {formatDate(b.deletion_scheduled_for)} unless they cancel.</Card>}

      <StatGroup cols={4}>
        <StatCard label="Plan" value={planLine} hint={paying && b.current_period_end ? `Paid until ${formatDate(b.current_period_end)}` : b.subscription_status === "trialing" && b.trial_ends_at ? `Trial ${new Date(b.trial_ends_at) > new Date() ? "ends" : "ended"} ${formatDate(b.trial_ends_at)}` : a.limit != null ? `${a.used} of ${a.limit} this month` : ""} icon={CreditCard} tone="brand" />
        <StatCard label="Sent this month" value={String(sentMonth)} hint={a.limit != null ? `Limit ${a.limit}` : "No limit"} icon={FileText} />
        <StatCard label="Collected" value={Object.entries(collected).map(([c, v]) => formatMoney(v, c)).join(" · ") || "—"} hint={`${(pays || []).length} payment${(pays || []).length === 1 ? "" : "s"} recorded`} icon={Wallet} tone="success" />
        <StatCard label="Customers" value={String(customers || 0)} hint={`${count("quote")} quotes · ${count("invoice")} invoices sent`} icon={Users} />
      </StatGroup>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader icon={Building2} title="Details" />
          <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2.5 px-5 pb-5 text-[13.5px]">
            {[["Legal name", b.legal_name], ["Email", b.email], ["Phone", b.phone], ["Website", b.website], ["Address", [b.address, b.city, b.country].filter(Boolean).join(", ")], ["Currency", b.currency], ["Tax ID", b.tax_id], ["Tax", b.tax_rate ? `${b.tax_label || "VAT"} ${Number(b.tax_rate)}%` : "Not charging"], ["Bank", [b.bank_name, b.bank_account_number].filter(Boolean).join(" · ")]].map(([k, v]) => (
              <div key={k} className="contents"><dt className="text-ink-3">{k}</dt><dd className="min-w-0 break-words text-ink">{v || <span className="text-ink-3">—</span>}</dd></div>
            ))}
          </dl>
        </Card>

        <Card>
          <CardHeader icon={Users} title={`Team · ${(members || []).length}${b.plans?.seat_limit ? ` of ${b.plans.seat_limit}` : ""}`} />
          <ul className="divide-y divide-line">
            {(members || []).map((m) => (
              <li key={m.user_id} className="flex items-center gap-3 px-5 py-3">
                <Avatar size="sm" name={m.full_name || m.email} />
                <div className="min-w-0 flex-1"><p className="truncate text-[14px] font-medium text-ink">{m.full_name || m.email}</p><p className="truncate text-[12.5px] text-ink-3">{m.email} · joined {formatDate(m.created_at)}</p></div>
                <Badge size="sm" tone={m.role === "owner" ? "brand" : "neutral"}>{ROLES[m.role]?.label || m.role}</Badge>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader icon={Plug} title="Payment setup" description="How their customers pay them." />
          {connections?.length ? (
            <ul className="divide-y divide-line">
              {connections.map((c) => (
                <li key={c.provider} className="flex items-center justify-between gap-3 px-5 py-3 text-[13.5px]">
                  <span className="font-medium capitalize text-ink">{c.provider}</span>
                  <span className="flex gap-1.5">
                    <Badge size="sm" tone={c.mode === "live" ? "success" : "warn"}>{c.mode}</Badge>
                    <Badge size="sm" tone={c.enabled && c.payment_confirmed_at && c.webhook_confirmed_at ? "success" : "neutral"}>{c.enabled ? (c.payment_confirmed_at && c.webhook_confirmed_at ? "working" : "not confirmed") : "off"}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="px-5 pb-5 text-[13.5px] text-ink-3">{b.bank_account_number ? "Bank transfer only (account details on invoices)." : "Nothing set up yet."}</p>}
          {returns?.length > 0 && (
            <div className="border-t border-line px-5 py-3 text-[13px] text-ink-2"><Landmark className="mr-1.5 inline size-3.5 text-ink-3" />VAT returns: {returns.map((r) => `${r.period} ${r.status.replace("_", " ")}`).join(" · ")}</div>
          )}
        </Card>

        <Card>
          <CardHeader icon={CreditCard} title="Billing history" description="What they've paid Usetally, and free access given." />
          {subs?.length ? (
            <ul className="divide-y divide-line">
              {subs.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3 text-[13.5px]">
                  <span className="min-w-0"><span className="font-medium text-ink">{s.plans?.name || "Plan"}</span><span className="block text-[12px] text-ink-3">{formatDate(s.period_start)} – {formatDate(s.period_end)} · {s.method === "free_access" ? "free access" : s.method}{s.reference ? ` · ${s.reference}` : ""}</span></span>
                  <span className="shrink-0 font-semibold tabular-nums">{Number(s.amount_minor) ? formatMoney(s.amount_minor, s.currency) : "Free"}</span>
                </li>
              ))}
            </ul>
          ) : <p className="px-5 pb-5 text-[13.5px] text-ink-3">Nothing yet.</p>}
        </Card>
      </div>

      <Card>
        <CardHeader icon={History} title="Recent activity" />
        {activity?.length ? (
          <ul className="divide-y divide-line">
            {activity.map((x) => (
              <li key={x.id} className="flex gap-3 px-5 py-3 text-[13.5px]">
                <span className="w-24 shrink-0 text-[12px] text-ink-3">{timeAgo(x.created_at)}</span>
                <span className="min-w-0 text-ink-2"><strong className="font-medium text-ink">{x.actor_label || "Customer"}</strong> {activityText(x)}</span>
              </li>
            ))}
          </ul>
        ) : <EmptyState compact icon={History} title="No activity yet" description="They haven't done anything since signing up." />}
      </Card>

      {owner?.email && <p className="text-[12.5px] text-ink-3"><Phone className="mr-1 inline size-3" />Owner: {owner.full_name || "—"} · {owner.email}{b.phone ? ` · ${b.phone}` : ""}</p>}
    </div>
  );
}

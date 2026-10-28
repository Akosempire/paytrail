import { ShowToast } from "@/components/show-toast";
import Link from "next/link";
import { Check, CreditCard, Sparkles } from "lucide-react";
import { requirePermission } from "@/lib/context";
import { createSupabaseService } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { PlanButton } from "./plan-button";
import { hasYearly, monthlyEquivalent, plansFor, subscriptionCurrencyFor } from "@/lib/plans";
import { cx } from "@/components/ui";
import { MetaEvent } from "@/components/marketing-tags";

export const metadata = { title: "Plan & billing" };

export default async function Billing({ searchParams }) {
  const { payment, interval: wanted } = await searchParams;
  const ctx = await requirePermission("settings.billing");
  const b = ctx.business;
  const service = createSupabaseService();
  const [{ data: plans }, { data: history }, { data: settings }] = await Promise.all([
    // plans aren't secret; the service client also returns a hidden plan this business is on
    service.from("plans").select("*").or(`active.eq.true,id.eq.${b.plan_id || "00000000-0000-0000-0000-000000000000"},spots.gt.0`).order("sort_order").order("price_minor"),
    ctx.supabase.from("subscription_payments").select("*, plans(name)").eq("business_id", b.id).order("created_at", { ascending: false }).limit(24),
    service.from("platform_settings").select("trial_mode, trial_documents, trial_days, billing_provider, support_email").eq("id", true).single(),
  ]);
  const currentInterval = (plans || []).find((p) => p.id === b.plan_id)?.billing_interval;
  const interval = wanted === "year" || wanted === "month" ? wanted : currentInterval === "year" ? "year" : "month";
  const { currency: planCurrency, plans: visible } = plansFor(plans, { currency: subscriptionCurrencyFor(b), interval, kind: b.kind, currentPlanId: b.subscription_status === "active" ? b.plan_id : null });
  const yearly = hasYearly(plans, planCurrency);
  const a = ctx.allowance || {};
  const onFree = Boolean(a.free);
  const active = b.subscription_status === "active" && !(onFree && a.ended);
  // hidden offers with spots left (Founding), in this business's currency
  const offers = [];
  for (const p of (plans || []).filter((p) => !p.active && p.spots > 0 && p.currency === planCurrency && p.id !== b.plan_id && (b.kind !== "company" || p.allow_company))) {
    const { data: left } = await service.rpc("plan_spots_left", { plan: p.id });
    if (left > 0) offers.push({ ...p, left });
  }
  let status;
  if (onFree) status = `Free plan · ${a.used} of ${a.limit} documents sent this month${a.ended === "trial_used" ? " · your trial has ended" : a.ended ? " · your paid plan has ended" : ""}`;
  else if (b.subscription_status === "trialing") status = settings.trial_mode === "documents" ? `Free trial: ${Math.max(0, (a.limit ?? 0) - (a.used ?? 0))} of ${a.limit ?? 0} free documents left` : settings.trial_mode === "days" ? `Free trial until ${formatDate(b.trial_ends_at)}` : "No free trial";
  else if (active) status = `${b.plans?.name || "Plan"}${b.current_period_end ? ` · paid until ${formatDate(b.current_period_end)}` : ""}${a.limit != null ? ` · ${a.used} of ${a.limit} documents used this month` : ""}`;
  else status = b.subscription_status === "suspended" ? "Suspended. Contact Usetally support." : "Your subscription has ended";
  // the browser copy of Meta's Purchase (the server already sent it, same event ID)
  const paid = payment === "succeeded"
    ? (await service.from("payment_attempts").select("id, amount_minor, currency").eq("business_id", b.id).eq("purpose", "subscription").eq("status", "succeeded")
        .gt("completed_at", new Date(Date.now() - 2 * 3600_000).toISOString()).order("completed_at", { ascending: false }).limit(1)).data?.[0]
    : null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Plan & billing" description="Your Usetally subscription. This is separate from the payments your customers make to you." />
      {paid && <MetaEvent name="Purchase" eventId={`purchase-${paid.id}`} value={Number(paid.amount_minor) / 100} currency={paid.currency} />}
      {payment === "succeeded" && <ShowToast title="Payment received" message="Your plan is active. Thank you!" clear={["payment"]} />}
      {payment === "pending" && <ShowToast intent="info" title="Confirming payment" message="Your plan updates once the payment is confirmed. That usually takes under a minute; refresh this page shortly." clear={["payment"]} duration={9000} />}
      {payment === "failed" && <ShowToast intent="error" title="Payment didn't go through" message="Nothing was charged. Try again." clear={["payment"]} />}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3"><Sparkles className="size-5 text-brand" /><div><p className="text-title-3 text-ink">{onFree ? "Free plan" : active ? "Current plan" : b.subscription_status === "trialing" ? "Trial" : "No active plan"}</p><p className="text-[13px] text-ink-2">{status}</p></div></div>
          <Badge tone={onFree ? "neutral" : active ? "success" : b.subscription_status === "trialing" ? "brand" : "danger"}>{onFree ? "free" : b.subscription_status.replace("_", " ")}</Badge>
        </div>
      </Card>
      {offers.map((p) => (
        <Card key={p.id} className="flex flex-col gap-4 p-5 ring-2 ring-brand/40 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><p className="text-title-3 text-ink">{p.name} offer</p><Badge tone="brand" size="sm">{p.left} of {p.spots} spots left</Badge></div>
            <p className="mt-1 text-[13px] text-ink-2">{p.tagline || "Early-customer price"} · <strong className="text-ink">{formatMoney(p.price_minor, p.currency)} / {p.billing_interval}</strong>{p.document_limit != null ? ` · ${p.document_limit} documents a month` : ""}{p.seat_limit ? ` · up to ${p.seat_limit} team members` : ""}</p>
          </div>
          <div className="sm:w-56"><PlanButton planId={p.id} label="Claim this price" primary /></div>
        </Card>
      ))}
      {yearly && (
        <nav className="inline-flex items-center gap-0.5 self-start rounded-lg bg-tray p-1" aria-label="Billing period">
          {[["month", "Monthly"], ["year", "Yearly · 2 months free"]].map(([v, l]) => (
            <Link key={v} href={`/app/settings/billing?interval=${v}`} className={cx("inline-flex h-8 items-center rounded-md px-3 text-[13px] font-medium", interval === v ? "bg-surface text-ink shadow-[var(--shadow-xs)] ring-1 ring-line" : "text-ink-3 hover:text-ink")}>{l}</Link>
          ))}
        </nav>
      )}
      {visible.length === 0 ? (
        <EmptyState icon={CreditCard} title="Plans are coming soon" description={`Contact ${settings.support_email || "Usetally support"} to subscribe.`} />
      ) : (
        <div className={cx("grid gap-1.5 rounded-2xl bg-tray p-1.5 md:grid-cols-2", visible.length >= 4 ? "xl:grid-cols-4" : visible.length === 3 ? "xl:grid-cols-3" : "")}>
          {visible.map((p) => {
            const current = (active && b.plan_id === p.id) || (onFree && a.ended && p.price_minor === 0);
            const perMonth = monthlyEquivalent(p);
            const free = p.price_minor === 0;
            return (
              <div key={p.id} className={`flex flex-col rounded-xl bg-surface p-5 ring-1 ${current ? "ring-2 ring-brand" : "ring-line"}`}>
                <div className="flex items-center justify-between gap-2"><p className="text-title-3 text-ink">{p.name}</p>{current && <Badge tone="brand" size="sm">Current</Badge>}</div>
                {p.tagline && <p className="mt-1 text-[13px] text-ink-3">{p.tagline}</p>}
                <p className="mt-4"><span className="text-[28px] font-semibold tracking-[-0.02em] text-ink tabular">{free ? "Free" : formatMoney(p.price_minor, p.currency)}</span>{!free && <span className="text-sm text-ink-3"> / {p.billing_interval}</span>}</p>
                {perMonth && <p className="text-xs text-ink-3">{formatMoney(perMonth, p.currency)} a month</p>}
                <ul className="mt-4 flex-1 space-y-2 text-[13px] text-ink-2">
                  <li className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-success" />{p.document_limit == null ? "Unlimited quotes & invoices" : `${p.document_limit} quotes & invoices a month`}</li>
                  <li className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-success" />{p.seat_limit == null ? "Unlimited team members" : p.seat_limit === 1 ? "1 user" : `Up to ${p.seat_limit} team members`}</li>
                  {(p.features || []).map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-success" />{f}</li>)}
                </ul>
                {!(current && free) && <PlanButton planId={p.id} label={current ? "Renew / pay ahead" : free ? "Switch to Free" : active ? "Switch to this plan" : "Choose plan"} primary={!current && !free} />}
              </div>
            );
          })}
        </div>
      )}
      <Card>
        <CardHeader title="Billing history" />
        {history?.length ? (
          <ul className="divide-y divide-line">
            {history.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span><span className="font-medium text-ink">{h.plans?.name || "Plan"}</span><span className="block text-xs text-ink-3">{formatDate(h.period_start)} – {formatDate(h.period_end)} · {h.method}</span></span>
                <span className="font-semibold tabular">{formatMoney(h.amount_minor, h.currency)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="px-5 py-4 text-[13px] text-ink-3">No payments yet.</p>}
      </Card>
    </div>
  );
}

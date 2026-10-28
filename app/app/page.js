import { ShowToast } from "@/components/show-toast";
import Link from "next/link";
import { AlertCircle, ArrowRight, Banknote, Check, CircleDashed, FileClock, FileText, PiggyBank, Plus, ShieldCheck, Wallet } from "lucide-react";
import { requireBusiness } from "@/lib/context";
import { can } from "@/lib/permissions";
import { formatMoney } from "@/lib/money";
import { formatDate, timeAgo } from "@/lib/format";
import { Button, Callout, Card, CardHeader, EmptyState, ListRow, PageHeader, SectionHeader, StatCard, StatGroup, cx } from "@/components/ui";
import { StatusBadge, activityText } from "@/components/doc-bits";
import { GiftCelebration } from "@/components/gift-celebration";
import { TrialNudge } from "@/components/trial-nudge";
import { trialNudge } from "@/lib/trial-nudge";
import { TRIAL_OFFER, offerEligible, offerPrice } from "@/lib/trial-offer";
import { monthlyEquivalent, subscriptionCurrencyFor } from "@/lib/plans";
import { createSupabaseService } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({ searchParams }) {
  const sp = await searchParams;
  const ctx = await requireBusiness();
  const { business, member, supabase } = ctx;
  const showCosts = can(member, "costs.view");
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: s }, { data: attention }, { data: accepted }, { data: activity }, { data: connections }, { count: docCount }, { count: teamCount }] = await Promise.all([
    supabase.rpc("business_summary", { target: business.id }),
    supabase.from("documents").select("id, kind, number, customer_name, status, due_date, valid_until, total_minor, amount_paid_minor, currency")
      .eq("business_id", business.id).or(`status.eq.pending_approval,and(kind.eq.invoice,status.in.(sent,viewed,partially_paid),due_date.lt.${today})`).order("due_date").limit(8),
    supabase.from("documents").select("id, kind, number, customer_name, status, total_minor, currency, accepted_at").eq("business_id", business.id).eq("kind", "quote").eq("status", "accepted").is("converted_invoice_id", null).limit(5),
    supabase.from("activity").select("id, action, actor_label, created_at, detail, document_id, documents(number)").eq("business_id", business.id).order("created_at", { ascending: false }).limit(8),
    supabase.from("payment_connections").select("provider, payment_confirmed_at, webhook_confirmed_at").eq("business_id", business.id),
    supabase.from("documents").select("id", { count: "exact", head: true }).eq("business_id", business.id).not("sent_at", "is", null),
    supabase.from("memberships").select("user_id", { count: "exact", head: true }).eq("business_id", business.id),
  ]);
  const money = (v) => formatMoney(v, business.currency);
  // free access given in the last 30 days: celebrate it once
  let gift = null;
  try {
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { data: g } = await createSupabaseService().from("subscription_payments").select("id, period_start, period_end, plans(name)").eq("business_id", business.id).eq("method", "free_access").gte("created_at", since).order("created_at", { ascending: false }).limit(1);
    if (g?.[0] && new Date(g[0].period_end) > new Date()) {
      const months = Math.max(1, Math.round((Date.parse(g[0].period_end) - Date.parse(g[0].period_start)) / (30.44 * 86400_000)));
      gift = { id: g[0].id, plan: g[0].plans?.name || "Usetally", months, until: formatDate(g[0].period_end, { day: "numeric", month: "long", year: "numeric" }) };
    }
  } catch { /* never block the dashboard */ }
  // near the end of the free trial: "Keep Usetally", for whoever can pay
  let trial = null;
  if (!gift && business.subscription_status === "trialing" && can(member, "settings.billing")) {
    try {
      const service = createSupabaseService();
      const { count: paidBefore } = await service.from("subscription_payments").select("id", { count: "exact", head: true }).eq("business_id", business.id).gt("amount_minor", 0);
      const deal = offerEligible({ business, paidBefore: (paidBefore || 0) > 0 });
      const nudge = trialNudge({ allowance: ctx.allowance, createdAt: business.created_at, docsSent: docCount || 0, offer: deal });
      if (nudge) {
        const cur = subscriptionCurrencyFor(business);
        const [{ data: pays }, { count: customers }, { data: plans }] = await Promise.all([
          supabase.from("payments").select("amount_minor, currency").eq("business_id", business.id).limit(5000),
          supabase.from("customers").select("id", { count: "exact", head: true }).eq("business_id", business.id),
          service.from("plans").select("id, name, price_minor, currency, billing_interval, document_limit, allow_company, active, spots, sort_order").eq("currency", cur),
        ]);
        const collected = (pays || []).filter((p) => p.currency === business.currency).reduce((t, p) => t + Number(p.amount_minor), 0);
        const fits = (p) => business.kind !== "company" || p.allow_company;
        const show = (p, extra = {}) => ({ name: p.name, price: formatMoney(p.price_minor, p.currency), interval: p.billing_interval || "month",
          perMonth: monthlyEquivalent(p) ? formatMoney(monthlyEquivalent(p), p.currency) : null, limit: p.document_limit ?? null, ...extra });
        let offer = null;
        // 25% off a yearly plan while the offer runs: Solo for freelancers, Team for companies
        if (deal) {
          const yearly = (plans || []).filter((p) => p.active && p.billing_interval === "year" && p.price_minor > 0 && fits(p)).sort((a, b) => a.price_minor - b.price_minor);
          const pick = business.kind === "company" ? yearly.find((p) => p.allow_company) : yearly[0];
          if (pick) {
            const sale = offerPrice(pick);
            offer = { ...show(pick), discount: TRIAL_OFFER.percent, price: formatMoney(sale, pick.currency), was: formatMoney(pick.price_minor, pick.currency),
              perMonth: formatMoney(Math.round(sale / 12 / 100) * 100, pick.currency), endsLabel: TRIAL_OFFER.endsLabel };
          }
        }
        // otherwise the founding price while real spots are left, else the cheapest plan that fits
        for (const p of (offer ? [] : plans || []).filter((p) => !p.active && p.spots > 0 && p.price_minor > 0 && fits(p))) {
          const { data: left } = await service.rpc("plan_spots_left", { plan: p.id });
          if (left > 0) { offer = show(p, { founding: true, spotsLeft: left, spots: p.spots }); break; }
        }
        if (!offer) {
          const paid = (plans || []).filter((p) => p.active && p.price_minor > 0 && fits(p))
            .sort((a, b) => (a.billing_interval === "month" ? 0 : 1) - (b.billing_interval === "month" ? 0 : 1) || a.price_minor - b.price_minor)[0];
          if (paid) offer = show(paid);
        }
        const free = (plans || []).find((p) => p.active && p.price_minor === 0);
        trial = { nudge, offer, freeLimit: free?.document_limit ?? null,
          stats: { sent: docCount || 0, collected: collected > 0 ? money(collected) : null, customers: customers || 0 } };
      }
    } catch { /* never block the dashboard */ }
  }
  // bank transfers customers say they've sent, waiting for someone to check
  const { data: claims } = await supabase.from("payment_claims").select("id, amount_minor, currency, payer_name, document_id, documents(number)")
    .eq("business_id", business.id).eq("status", "pending").order("created_at").limit(5);
  const sum = s || {};
  const trend = sum.collected_last_month_minor > 0 ? Math.round(((sum.collected_month_minor - sum.collected_last_month_minor) / sum.collected_last_month_minor) * 100) : null;
  const profit = sum.paid_month_costs_minor == null ? null : sum.paid_month_revenue_minor - sum.paid_month_costs_minor;
  const paymentsReady = (connections || []).some((c) => c.payment_confirmed_at && c.webhook_confirmed_at);
  const firstName = (member.full_name || "").split(" ")[0];

  const checklist = [
    { done: Boolean(business.logo_path), label: "Add your logo and brand colour", href: "/app/settings", show: can(member, "settings.business") },
    { done: paymentsReady, label: "Connect online payments", href: "/app/settings/payments", show: can(member, "settings.payments") },
    { done: (docCount || 0) > 0, label: "Send your first quote", href: "/app/quotes/new", show: true },
    { done: (teamCount || 0) > 1, label: "Invite your finance team", href: "/app/settings/team", show: business.kind === "company" && can(member, "settings.team") },
  ].filter((c) => c.show);
  const remaining = checklist.filter((c) => !c.done).length;
  const maxBar = Math.max(1, ...(sum.monthly || []).map((m) => m.collected_minor));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={`${greeting()}${firstName ? `, ${firstName}` : ""}`} description={`Here's how ${business.name} is doing.`} />

      {gift && <GiftCelebration gift={gift} />}
      {trial && <TrialNudge businessId={business.id} nudge={trial.nudge} stats={trial.stats} offer={trial.offer} freeLimit={trial.freeLimit} />}
      {!String(business.country || "").trim() && can(member, "settings.business") && (
        <Callout tone="warn" icon={AlertCircle} title="Choose your country" action={<Button href="/app/settings" size="sm" variant="primary">Set country</Button>}>
          It decides your tax features and what shows on your invoices.
        </Callout>
      )}
      {sp.welcome && <ShowToast title="You're all set up" message="Create your first quote. Add your hidden costs to see your profit before you send it." clear={["welcome"]} duration={7000} />}
      {ctx.allowance?.reason === "deletion_pending" && <Callout tone="danger" icon={AlertCircle} title={`${business.name} will be permanently deleted on ${formatDate(ctx.allowance.deletes_at)}`}
        action={member.role === "owner" && <Button href="/app/settings/privacy" size="sm" variant="primary">Keep my business</Button>}>
        Sending is switched off. Download anything you need from Settings → Privacy & data before then.
      </Callout>}
      {ctx.allowance && !ctx.allowance.allowed && ctx.allowance.reason !== "deletion_pending" && <Callout tone="danger" icon={AlertCircle} title={business.subscription_status === "trialing" ? "Your free trial has ended" : "Sending is paused"}
        action={can(member, "settings.billing") && <Button href="/app/settings/billing" size="sm" variant="primary">Choose a plan</Button>}>
        You can still create drafts and record payments. {can(member, "settings.billing") ? "Choose a plan to keep sending quotes and invoices. Your drafts, customers and records are all kept." : "Ask the account owner to choose a plan."}
      </Callout>}

      {claims?.length > 0 && (
        <Callout tone="info" icon={Banknote} title={claims.length === 1 ? `${claims[0].payer_name || "A customer"} says they've paid ${formatMoney(claims[0].amount_minor, claims[0].currency)}` : `${claims.length} bank transfers to confirm`}
          action={<Button href={`/app/documents/${claims[0].document_id}`} size="sm" variant="primary">Check and confirm</Button>}>
          {claims.length === 1 ? `For ${claims[0].documents?.number || "an invoice"}. Check your bank account, then confirm it to send their receipt.` : claims.map((c) => `${c.documents?.number}: ${formatMoney(c.amount_minor, c.currency)}`).join(" · ")}
        </Callout>
      )}

      {remaining > 0 && (
        <Card data-tour="setup">
          <CardHeader title="Get set up" description={`${checklist.length - remaining} of ${checklist.length} done`} />
          <ul className="grid gap-1.5 bg-tray p-1.5 sm:grid-cols-2 lg:grid-cols-4">
            {checklist.map((c) => (
              <li key={c.label}>
                <Link href={c.href} className={cx("flex h-full items-center gap-3 rounded-xl bg-surface p-4 ring-1 ring-line transition-shadow hover:shadow-[var(--shadow-card)]", c.done && "opacity-60")}>
                  {c.done ? <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-success text-white"><Check className="size-3.5" /></span> : <CircleDashed className="size-6 shrink-0 text-ink-3" />}
                  <span className={cx("text-[13px] font-medium", c.done ? "text-ink-3 line-through" : "text-ink")}>{c.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <StatGroup>
        <StatCard icon={Banknote} tone="warn" label="Owed to you" value={money(sum.outstanding_minor)} hint={sum.overdue_count ? <span className="text-danger-ink">{sum.overdue_count} overdue · {money(sum.overdue_minor)}</span> : "Nothing overdue"} />
        <StatCard icon={Wallet} tone="success" label="Collected this month" value={money(sum.collected_month_minor)} trend={trend != null ? { value: `${Math.abs(trend)}%`, direction: trend >= 0 ? "up" : "down" } : undefined} hint={`${money(sum.collected_last_month_minor)} last month`} />
        <StatCard icon={FileText} tone="brand" label="Open quotes" value={money(sum.open_quotes_minor)} hint={`${sum.open_quotes_count || 0} waiting for a reply`} />
        {showCosts
          ? <StatCard icon={PiggyBank} tone="violet" label="Profit on paid invoices" value={profit == null ? "—" : money(profit)} hint={`This month, after ${money(sum.paid_month_costs_minor || 0)} costs`} />
          : <StatCard icon={FileClock} tone="violet" label="Awaiting approval" value={sum.awaiting_approval || 0} hint="Drafts sent for sign-off" />}
      </StatGroup>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section className="flex flex-col gap-3">
            <SectionHeader title="Needs attention" count={(attention?.length || 0) + (accepted?.length || 0)} />
            {(attention?.length || 0) + (accepted?.length || 0) === 0 ? (
              <EmptyState compact icon={ShieldCheck} title="All clear" description="No overdue invoices, approvals or accepted quotes waiting." />
            ) : (
              <Card>
                <ul className="divide-y divide-line">
                  {(accepted || []).map((d) => (
                    <li key={d.id}><ListRow href={`/app/documents/${d.id}`} title={`${d.number} · ${d.customer_name}`} subtitle="Accepted. Convert it to an invoice or wait for payment."
                      trailing={<><span className="text-sm font-semibold tabular">{formatMoney(d.total_minor, d.currency)}</span><StatusBadge doc={d} size="sm" /></>} /></li>
                  ))}
                  {(attention || []).map((d) => (
                    <li key={d.id}><ListRow href={`/app/documents/${d.id}`} title={`${d.number} · ${d.customer_name}`}
                      subtitle={d.status === "pending_approval" ? "Waiting for approval" : `Was due ${formatDate(d.due_date)}`}
                      trailing={<><span className="text-sm font-semibold tabular">{formatMoney(d.total_minor - d.amount_paid_minor, d.currency)}</span><StatusBadge doc={d} size="sm" /></>} /></li>
                  ))}
                </ul>
              </Card>
            )}
          </section>

          <Card>
            <CardHeader title="Collected" description="Payments received, last 6 months" />
            <div className="flex items-end gap-3 px-5 pt-5 pb-4">
              {(sum.monthly || []).map((m, i, arr) => (
                <div key={m.month} className="flex flex-1 flex-col items-center gap-2">
                  <span className="h-4 text-[11px] text-ink-3 tabular">{m.collected_minor ? compact(m.collected_minor, business.currency) : ""}</span>
                  <div className="flex h-32 w-full items-end justify-center">
                    <div className={cx("w-full max-w-12 rounded-t-md", i === arr.length - 1 ? "bg-brand" : "bg-brand/25")} style={{ height: `${Math.max(3, (m.collected_minor / maxBar) * 100)}%` }} title={money(m.collected_minor)} />
                  </div>
                  <span className="text-xs text-ink-3">{m.month}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <section className="flex flex-col gap-3">
          <SectionHeader title="Recent activity" />
          <Card>
            {activity?.length ? (
              <ol className="space-y-4 px-5 py-4">
                {activity.map((a) => (
                  <li key={a.id} className="flex gap-3 text-[13px]">
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand/60" />
                    <span className="min-w-0">
                      <span className="text-ink"><strong className="font-medium">{a.actor_label || "Customer"}</strong> {activityText(a)}</span>
                      {a.documents?.number && <Link href={`/app/documents/${a.document_id}`} className="ml-1 font-mono text-xs text-brand-ink hover:underline">{a.documents.number}</Link>}
                      <span className="block text-xs text-ink-3">{timeAgo(a.created_at)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : <p className="px-5 py-6 text-[13px] text-ink-3">Activity shows up here as your team works.</p>}
            <Link href="/app/payments" className="flex items-center justify-between border-t border-line px-5 py-3 text-[13px] font-medium text-brand-ink hover:bg-subtle">All payments & receipts<ArrowRight className="size-4" /></Link>
          </Card>
        </section>
      </div>
    </div>
  );
}

function greeting() {
  const h = Number(new Date().toLocaleString("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Lagos" }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function compact(minor, currency) {
  const v = minor / 100;
  const sym = formatMoney(0, currency).replace(/[\d.,\s]/g, "");
  if (v >= 1e6) return `${sym}${(v / 1e6).toFixed(1).replace(/\.0$/, "")}m`;
  if (v >= 1e3) return `${sym}${Math.round(v / 1e3)}k`;
  return `${sym}${Math.round(v)}`;
}

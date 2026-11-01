import { ShowToast } from "@/components/show-toast";
import Link from "next/link";
import { AlertCircle, ArrowRight, Check, CircleDashed } from "lucide-react";
import { requireBusiness } from "@/lib/context";
import { can } from "@/lib/permissions";
import { formatMoney } from "@/lib/money";
import { formatDate, timeAgo } from "@/lib/format";
import { Button, Callout, Card, CardHeader, SectionHeader, cx } from "@/components/ui";
import { activityText } from "@/components/doc-bits";
import { CollectQueue } from "@/components/collect-queue";
import { MoneyStory, MiniTiles } from "@/components/dashboard/money-story";
import { TodoMenu } from "@/components/dashboard/todo-menu";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { monthName, nextAction } from "@/lib/dashboard-core";
import { OPEN_INVOICE } from "@/lib/collect-core";
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

  const [{ data: s }, { data: unpaid }, { data: approvals }, { data: accepted }, { data: activity }, { data: connections }, { count: docCount }, { count: teamCount }, { count: invoiceCount }] = await Promise.all([
    supabase.rpc("business_summary", { target: business.id }),
    // Collect: every invoice that's been sent and isn't paid yet
    supabase.from("documents").select("id, kind, number, title, customer_id, customer_name, customer_company, customer_email, customer_phone, access_token, status, due_date, viewed_at, total_minor, amount_paid_minor, currency")
      .eq("business_id", business.id).eq("kind", "invoice").in("status", OPEN_INVOICE).limit(300),
    supabase.from("documents").select("id, kind, number, customer_name, status, total_minor, amount_paid_minor, currency")
      .eq("business_id", business.id).eq("status", "pending_approval").order("updated_at", { ascending: false }).limit(8),
    supabase.from("documents").select("id, kind, number, customer_name, status, total_minor, currency, accepted_at").eq("business_id", business.id).eq("kind", "quote").eq("status", "accepted").is("converted_invoice_id", null).limit(5),
    supabase.from("activity").select("id, action, actor_label, created_at, detail, document_id, documents(number)").eq("business_id", business.id).order("created_at", { ascending: false }).limit(8),
    supabase.from("payment_connections").select("provider, payment_confirmed_at, webhook_confirmed_at").eq("business_id", business.id),
    supabase.from("documents").select("id", { count: "exact", head: true }).eq("business_id", business.id).not("sent_at", "is", null),
    supabase.from("memberships").select("user_id", { count: "exact", head: true }).eq("business_id", business.id),
    supabase.from("documents").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("kind", "invoice"),
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
        trial = { nudge, offer, freeLimit: free ? (free.document_limit ?? "unlimited") : null,
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
  const perms = { canSend: can(member, "documents.send"), canRecord: can(member, "payments.record"), canConvert: can(member, "documents.convert"), canApprove: can(member, "documents.approve") };
  const next = nextAction({ claims: claims || [], unpaid: unpaid || [], accepted: accepted || [], approvals: approvals || [], today, perms });
  // everything else that needs a hand, in one list (To do)
  const todo = [
    ...(!String(business.country || "").trim() && can(member, "settings.business") ? [{ id: "country", tone: "warn", label: "Choose your country", detail: "It decides your tax features and what shows on your invoices.", href: "/app/settings" }] : []),
    ...(claims || []).map((c) => ({ id: `claim-${c.id}`, tone: "brand", label: `Confirm ${c.payer_name || "a customer"}'s ${formatMoney(c.amount_minor, c.currency)} transfer`, detail: `For ${c.documents?.number || "an invoice"}. Check your bank first.`, href: `/app/documents/${c.document_id}` })),
    ...(accepted || []).map((d) => ({ id: `acc-${d.id}`, tone: "brand", label: `Turn ${d.number} into an invoice`, detail: `${d.customer_name} accepted ${formatMoney(d.total_minor, d.currency)}.`, href: `/app/documents/${d.id}` })),
    ...(approvals || []).map((d) => ({ id: `appr-${d.id}`, tone: "neutral", label: `${d.number} is waiting for approval`, detail: `${d.customer_name} · ${formatMoney(d.total_minor, d.currency)}`, href: `/app/documents/${d.id}` })),
    ...(invoiceCount > 0 ? checklist.filter((c) => !c.done).map((c) => ({ id: `setup-${c.href}`, tone: "neutral", label: c.label, href: c.href })) : []),
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-3 sm:items-end">
        <div className="min-w-0">
          <h1 className="text-title-1 text-ink">{greeting()}{firstName ? `, ${firstName}` : ""}</h1>
          <p className="mt-1 text-sm text-ink-2">Here's how {business.name} is doing.</p>
        </div>
        <TodoMenu items={todo} />
      </div>

      <QuickActions canCreate={can(member, "documents.create")} canRecord={perms.canRecord} hasUnpaid={(unpaid?.length || 0) > 0} />

      {gift && <GiftCelebration gift={gift} />}
      {trial && <TrialNudge businessId={business.id} nudge={trial.nudge} stats={trial.stats} offer={trial.offer} freeLimit={trial.freeLimit} />}
      {sp.welcome && <ShowToast title="You're all set up" message="Create your first quote. Add your hidden costs to see your profit before you send it." clear={["welcome"]} duration={7000} />}
      {ctx.allowance?.reason === "deletion_pending" && <Callout tone="danger" icon={AlertCircle} title={`${business.name} will be permanently deleted on ${formatDate(ctx.allowance.deletes_at)}`}
        action={member.role === "owner" && <Button href="/app/settings/privacy" size="sm" variant="primary">Keep my business</Button>}>
        Sending is switched off. Download anything you need from Settings → Privacy & data before then.
      </Callout>}
      {ctx.allowance && !ctx.allowance.allowed && ctx.allowance.reason !== "deletion_pending" && <Callout tone="danger" icon={AlertCircle} title={business.subscription_status === "trialing" ? "Your free trial has ended" : "Sending is paused"}
        action={can(member, "settings.billing") && <Button href="/app/settings/billing" size="sm" variant="primary">Choose a plan</Button>}>
        You can still create drafts and record payments. {can(member, "settings.billing") ? "Choose a plan to keep sending quotes and invoices. Your drafts, customers and records are all kept." : "Ask the account owner to choose a plan."}
      </Callout>}

      {remaining > 0 && !invoiceCount && (
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

      <div className="flex flex-col gap-3 sm:gap-4">
        <MoneyStory month={monthName()} currency={business.currency} collected={sum.collected_month_minor} lastMonth={sum.collected_last_month_minor} trend={trend}
          outstanding={sum.outstanding_minor} overdue={sum.overdue_minor} overdueCount={sum.overdue_count} next={next} businessName={business.name} perms={perms} />
        <MiniTiles currency={business.currency} openQuotes={sum.open_quotes_minor} openQuotesCount={sum.open_quotes_count} profit={profit} costs={sum.paid_month_costs_minor}
          showCosts={showCosts} awaiting={sum.awaiting_approval} monthly={sum.monthly || []} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <CollectQueue docs={unpaid || []} businessName={business.name} currency={business.currency} today={today}
            perms={perms} />

        </div>

        <section className="flex flex-col gap-3">
          <SectionHeader title="Recent activity" />
          <Card>
            {activity?.length ? (
              <ol className="space-y-1.5 px-5 py-3">
                {activity.map((a) => {
                  const body = (
                    <>
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand/60" />
                      <span className="min-w-0">
                        <span className="text-ink"><strong className="font-medium">{a.actor_label || "Customer"}</strong> {activityText(a)}</span>
                        {a.documents?.number && <span className="ml-1 font-mono text-xs text-brand-ink group-hover:underline">{a.documents.number}</span>}
                        <span className="block text-xs text-ink-3">{timeAgo(a.created_at)}</span>
                      </span>
                    </>
                  );
                  return (
                    <li key={a.id}>
                      {a.document_id
                        ? <Link href={`/app/documents/${a.document_id}`} className="group -mx-2 flex gap-3 rounded-lg px-2 py-1.5 text-[13px] hover:bg-hover focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]">{body}</Link>
                        : <div className="flex gap-3 px-0 py-1.5 text-[13px]">{body}</div>}
                    </li>
                  );
                })}
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


import Link from "next/link";
import { ArrowRight, Check, EyeOff, FileText, Palette, Receipt, ShieldCheck, Users, Wallet } from "lucide-react";
import { Button, Logo } from "@/components/ui";
import { ThemeToggle } from "@/components/ui-client";
import { createSupabaseService, supabaseConfigured } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";
import { formatMoney } from "@/lib/money";
import { hasYearly, monthlyEquivalent, plansFor } from "@/lib/plans";


async function publicData() {
  if (!supabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { plans: [], trial: null };
  const service = createSupabaseService();
  const [{ data: plans }, { data: trial }] = await Promise.all([
    service.from("plans").select("id, name, tagline, price_minor, currency, billing_interval, document_limit, seat_limit, allow_company, features, active, sort_order").eq("active", true).order("sort_order").order("price_minor"),
    service.from("platform_settings").select("trial_mode, trial_documents, trial_days").eq("id", true).maybeSingle(),
  ]);
  return { plans: plans || [], trial };
}

const STEPS = [
  { icon: FileText, title: "Quote", text: "Price the job with your logo and colours. Add hidden costs to check your profit." },
  { icon: Check, title: "Accept", text: "Your customer opens a link, reads it on any phone and accepts with their name." },
  { icon: Wallet, title: "Pay", text: "They pay by card or bank transfer through Stripe, Paystack, Flutterwave or Bachs. The quote becomes a paid invoice." },
  { icon: Receipt, title: "Receipt", text: "A numbered, branded receipt is issued for every payment, full or part." },
];

export default async function Home({ searchParams }) {
  const sp = await searchParams;
  const [{ plans: allPlans, trial }, ctx] = await Promise.all([publicData(), supabaseConfigured() ? getContext() : { user: null }]);
  const trialText = trial?.trial_mode === "documents" ? `First ${trial.trial_documents} documents free` : trial?.trial_mode === "days" ? `${trial.trial_days}-day free trial` : "Start free";
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="mx-auto flex max-w-[1200px] items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Logo withWord />
        <nav className="flex items-center gap-2">
          <a href="#pricing" className="hidden px-3 text-sm font-medium text-ink-2 hover:text-ink sm:block">Pricing</a>
          <ThemeToggle />
          {ctx.user ? <Button href="/app" variant="primary">Open dashboard</Button> : <><Button href="/login" variant="ghost">Sign in</Button><Button href="/signup" variant="primary">Get started</Button></>}
        </nav>
      </header>

      <section className="mx-auto max-w-[1200px] px-4 pt-10 pb-16 sm:px-6 lg:px-8 lg:pt-16">
        <div className="relative overflow-hidden rounded-3xl bg-[#0c111d] px-6 py-14 text-white sm:px-12 lg:py-20">
          <div className="pointer-events-none absolute -top-40 -right-40 size-[560px] rounded-full bg-[#1570EF]/30 blur-[140px]" />
          <div className="relative max-w-2xl">
            <p className="text-overline text-[#6ee0a6]">For freelancers & finance teams</p>
            <h1 className="mt-4 text-[40px] leading-[1.1] font-semibold tracking-[-0.03em] sm:text-[56px]">Quotes your customers accept. Payments that record themselves.</h1>
            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-white/70">PayTrail turns a branded quotation into a paid invoice and a receipt, and shows you the real profit on every job, after data, power and every hidden cost.</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button href="/signup" variant="primary" size="lg" iconRight={ArrowRight}>{trialText}</Button>
              <span className="text-sm text-white/55">No card needed</span>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-4 pb-16 sm:px-6 lg:px-8">
        <div className="grid gap-1.5 rounded-2xl bg-tray p-1.5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <div key={s.title} className="rounded-xl bg-surface p-5 ring-1 ring-line">
              <div className="flex items-center gap-3"><span className="inline-flex size-9 items-center justify-center rounded-full bg-brand-soft text-brand ring-1 ring-brand-line"><s.icon className="size-4" /></span><span className="text-xs font-semibold text-ink-3">Step {i + 1}</span></div>
              <p className="mt-4 text-title-3 text-ink">{s.title}</p>
              <p className="mt-1 text-[13.5px] text-ink-2">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-[1200px] gap-6 px-4 pb-20 sm:px-6 lg:grid-cols-3 lg:px-8">
        <Feature icon={EyeOff} tone="text-violet" title="Hidden costs, real profit" text="Add your data subscription, electricity, transport and software to any quote. Your customer sees a clean price. You see costs, profit and margin, plus the price you need to hit your target margin." />
        <Feature icon={Palette} tone="text-brand" title="Your brand everywhere" text="Logo, colour, bank details and terms on every quote, invoice, receipt, PDF and email. Customers see your business, not ours." />
        <Feature icon={Users} tone="text-success" title="Built for finance teams" text="Invite managers, finance officers and juniors. Junior drafts go for approval, and you decide who can see hidden costs." />
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center lg:px-8">
          <ShieldCheck className="size-10 shrink-0 text-brand" />
          <div className="flex-1">
            <h2 className="text-title-1 text-ink">Paid straight into your own account</h2>
            <p className="mt-1 max-w-2xl text-ink-2">Connect your own Stripe, Paystack, Flutterwave or Bachs account with our step-by-step guide. Businesses in Nigeria, Ghana, Kenya, South Africa, the US, UK, Europe and beyond can take payments. Money goes directly to you. PayTrail confirms each payment with the provider before marking an invoice paid.</p>
          </div>
        </div>
      </section>

      {allPlans.length > 0 && (() => {
        const currencies = [...new Set(allPlans.filter((p) => p.price_minor > 0).map((p) => p.currency))];
        const interval = sp.interval === "year" ? "year" : "month";
        const { currency, plans } = plansFor(allPlans, { currency: currencies.includes(sp.currency) ? sp.currency : currencies.includes("NGN") ? "NGN" : "USD", interval });
        const link = (c, i) => `/?currency=${c}&interval=${i}#pricing`;
        const pill = (on) => `inline-flex h-8 items-center rounded-md px-3 text-[13px] font-medium ${on ? "bg-surface text-ink shadow-[var(--shadow-xs)] ring-1 ring-line" : "text-ink-3 hover:text-ink"}`;
        return (
        <section id="pricing" className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 lg:px-8">
          <h2 className="text-center text-[32px] font-semibold tracking-[-0.02em] text-ink">Simple pricing</h2>
          <p className="mt-2 text-center text-ink-2">{trialText}, then pick a plan that fits. Cancel any time.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {currencies.length > 1 && <nav className="inline-flex gap-0.5 rounded-lg bg-tray p-1" aria-label="Currency">{currencies.map((c) => <Link key={c} href={link(c, interval)} className={pill(c === currency)}>{c === "NGN" ? "₦ Naira" : c === "USD" ? "$ US dollar" : c}</Link>)}</nav>}
            {hasYearly(allPlans, currency) && <nav className="inline-flex gap-0.5 rounded-lg bg-tray p-1" aria-label="Billing period"><Link href={link(currency, "month")} className={pill(interval === "month")}>Monthly</Link><Link href={link(currency, "year")} className={pill(interval === "year")}>Yearly · 2 months free</Link></nav>}
          </div>
          <div className={`mx-auto mt-6 grid max-w-6xl gap-1.5 rounded-2xl bg-tray p-1.5 md:grid-cols-2 ${plans.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
            {plans.map((p) => (
              <div key={p.id} className={`flex flex-col rounded-xl bg-surface p-6 ring-1 ${p.name === "Team" ? "ring-2 ring-brand" : "ring-line"}`}>
                <p className="text-title-3 text-ink">{p.name}</p>
                {p.tagline && <p className="mt-1 text-[13px] text-ink-3">{p.tagline}</p>}
                <p className="mt-5"><span className="text-[32px] font-semibold tracking-[-0.02em] text-ink tabular">{p.price_minor === 0 ? "Free" : formatMoney(p.price_minor, p.currency)}</span>{p.price_minor > 0 && <span className="text-ink-3"> / {p.billing_interval}</span>}</p>
                {monthlyEquivalent(p) && <p className="text-xs text-ink-3">{formatMoney(monthlyEquivalent(p), p.currency)} a month</p>}
                <ul className="mt-5 flex-1 space-y-2 text-[13.5px] text-ink-2">
                  <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" />{p.document_limit == null ? "Unlimited quotes & invoices" : `${p.document_limit} documents a month`}</li>
                  <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" />{!p.allow_company ? "For freelancers" : p.seat_limit == null ? "Unlimited team members" : p.seat_limit === 1 ? "1 user" : `Up to ${p.seat_limit} team members`}</li>
                  {(p.features || []).map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" />{f}</li>)}
                </ul>
                <Button href="/signup" variant="secondary" block className="mt-6">Start 14-day free trial</Button>
              </div>
            ))}
          </div>
        </section>
        );
      })()}

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-4 py-8 text-[13px] text-ink-3 sm:px-6 lg:px-8">
          <Logo withWord className="size-7" />
          <span>© {new Date().getFullYear()} PayTrail</span>
        </div>
      </footer>
    </div>
  );
}

function Feature({ icon: Icon, tone, title, text }) {
  return (
    <div className="rounded-2xl bg-surface p-6 shadow-[var(--shadow-card)] ring-1 ring-line">
      <Icon className={`size-6 ${tone}`} />
      <h3 className="mt-4 text-title-2 text-ink">{title}</h3>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{text}</p>
    </div>
  );
}

import Link from "next/link";
import { ArrowDown, ArrowRight, BadgeCheck, Building2, Check, EyeOff, Landmark, Lock, Plus, ShieldCheck, UserRound, Wallet } from "lucide-react";
import { Alert, Logo } from "@/components/ui";
import { ThemeToggle } from "@/components/ui-client";
import { HeroFilm } from "@/components/hero-film";
import { InstallPrompt } from "@/components/pwa";
import { TemplateThumb } from "@/components/layout-panel";
import { Chapters, PainStory } from "@/components/landing/story";
import { DotField } from "@/components/landing/dot-field";
import { createSupabaseService, supabaseConfigured } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";
import { formatMoney } from "@/lib/money";
import { hasYearly, monthlyEquivalent, plansFor } from "@/lib/plans";
import { BRAND } from "@/lib/brand";

async function publicData() {
  if (!supabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { plans: [], trial: null };
  const service = createSupabaseService();
  const [{ data: plans }, { data: trial }] = await Promise.all([
    service.from("plans").select("id, name, tagline, price_minor, currency, billing_interval, document_limit, seat_limit, allow_company, features, active, sort_order").eq("active", true).order("sort_order").order("price_minor"),
    service.from("platform_settings").select("trial_mode, trial_documents, trial_days").eq("id", true).maybeSingle(),
  ]);
  return { plans: plans || [], trial };
}

const BTN = "inline-flex h-[52px] items-center justify-center gap-2.5 rounded-full bg-hero-ink px-7 text-[15px] font-semibold text-hero transition-[transform,background] hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hero-accent focus-visible:ring-offset-2 focus-visible:ring-offset-hero";
const BTN_SM = "inline-flex h-9 items-center rounded-full bg-hero-ink px-4 text-[13px] font-semibold text-hero transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hero-accent";
const BTN_GHOST = "inline-flex h-[52px] items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold ring-1 ring-inset transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hero-accent";
const PAPER = "rounded-[18px] bg-hero-paper shadow-[0_1px_2px_rgba(20,16,8,.05),0_18px_40px_-24px_rgba(20,16,8,.3)] ring-1 ring-black/[.05] dark:ring-white/[.06]";
const WRAP = "mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-10";
const KICKER = "text-[13px] font-semibold tracking-[0.14em] text-hero-accent uppercase";
const H2 = "text-[clamp(32px,4.4vw,56px)] leading-[1.04] font-semibold tracking-[-0.035em]";

// everything here is true of the product today
const TRUST = [
  [Wallet, "Paid directly to you", "Into your own Paystack or Stripe"],
  [ShieldCheck, "Verified payments", "Confirmed with the provider"],
  [Lock, "Keys encrypted", "NDPA-ready data handling"],
  [BadgeCheck, "14-day free trial", "No card needed to start"],
];

const ROLES = [
  { icon: Building2, role: "Owner", who: "Runs the business", can: ["Everything, including billing", "Sees costs and profit", "Sets who sees what"] },
  { icon: UserRound, role: "Finance", who: "Sends and collects", can: ["Creates and sends documents", "Records payments", "Sees hidden costs"] },
  { icon: UserRound, role: "Junior", who: "Prepares drafts", can: ["Drafts quotes and invoices", "Needs approval to send", "Costs hidden unless allowed"] },
];

const PROVIDERS = [
  ["Paystack", "Cards, bank transfer and USSD"],
  ["Stripe", "US, UK, Europe and 40+ countries"],
  ["Flutterwave", "Cards and mobile money"],
  ["Bachs", "Where Bachs operates"],
  ["Bank transfer", "Your account details on every invoice"],
];

const FAQ = [
  ["Do you hold my money?", "No. Customers pay through your own Paystack, Stripe, Flutterwave or Bachs account, so money goes straight to you. We confirm each payment with the provider, then mark the invoice paid and issue the receipt."],
  ["Can my customers see my costs?", "Never. Hidden costs live only inside your account. In a team, you choose who can see them, and they never appear on quotes, invoices, receipts or PDFs."],
  ["Do my customers need an account?", "No. They open a secure link on any phone or computer, accept the quote with their name, and pay. They can download the PDF and their receipt."],
  ["Can I print receipts on a POS printer?", "Yes. Every document prints on A4, US Letter, A5 or half letter, and receipts also print on 80 mm and 58 mm thermal rolls."],
  ["What happens after the free trial?", "You get 14 days free with no card. After that, choose a plan to keep sending. Your quotes, invoices, customers and receipts stay safe either way."],
  ["Can I use it on my phone?", "Yes. It works in any browser, and you can install it to your home screen. Pages you've opened stay readable offline."],
  ["Is my data safe?", "Each business's data is kept separate in the database, payment keys are encrypted, and changing bank details or payment keys needs a code sent to your email. You can download or delete your data at any time."],
];

export default async function Home({ searchParams }) {
  const sp = await searchParams;
  const [{ plans: allPlans, trial }, ctx] = await Promise.all([publicData(), supabaseConfigured() ? getContext() : { user: null }]);
  const trialText = trial?.trial_mode === "documents" ? `First ${trial.trial_documents} documents free` : trial?.trial_mode === "days" ? `${trial.trial_days}-day free trial` : "Free trial";
  const signedIn = Boolean(ctx.user);

  return (
    <div className="min-h-dvh bg-hero text-hero-ink">
      {signedIn && <InstallPrompt delay={5000} />}

      {/* ------------------------------------------------ hero */}
      <div className="relative isolate overflow-hidden">
        {/* interactive dot field behind the hero; fades out at the bottom */}
        <div aria-hidden="true" className="absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,#000_72%,transparent)]">
          <DotField />
        </div>
        <header className={`relative z-10 flex items-center justify-between py-4 ${WRAP}`}>
          <Logo withWord wordClass="text-hero-ink" />
          <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main">
            <a href="#how-it-works" className="hidden px-3 text-sm font-medium text-hero-ink-2 hover:text-hero-ink md:block">How it works</a>
            <a href="#pricing" className="hidden px-3 text-sm font-medium text-hero-ink-2 hover:text-hero-ink sm:block">Pricing</a>
            <ThemeToggle />
            {signedIn
              ? <Link href="/app" className={BTN_SM}>Open dashboard</Link>
              : <><Link href="/login" className="px-3 text-sm font-medium text-hero-ink-2 hover:text-hero-ink">Sign in</Link><Link href="/signup" className={BTN_SM}>Get started</Link></>}
          </nav>
        </header>
        {sp.account === "deleted" && <div className={WRAP}><Alert intent="success" title="Account deleted">Your data has been removed. Thanks for using {BRAND.name}.</Alert></div>}

        <section className={`grid items-center gap-6 pt-8 pb-10 sm:pt-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-4 lg:pt-6 lg:pb-12 ${WRAP}`}>
          <div className="max-w-[560px] lg:pb-10">
            <h1 className="text-[clamp(46px,6.4vw,84px)] leading-[0.98] font-semibold tracking-[-0.045em]">
              Quotes.<br />Invoices.<br /><span className="text-hero-accent">Payments.</span>
            </h1>
            <p className="mt-6 text-[17px] leading-relaxed text-hero-ink-2 sm:text-[19px]">From quote to payment. Everything flows.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
              <Link href="/signup" className={BTN}>Get started free<ArrowRight className="size-[18px]" aria-hidden="true" /></Link>
              <a href="#how-it-works" className="group inline-flex items-center justify-center gap-2 text-[15px] font-medium sm:justify-start">
                <span className="border-b border-hero-line pb-0.5 transition-colors group-hover:border-hero-ink">See how it works</span>
                <ArrowDown className="size-4 transition-transform group-hover:translate-y-0.5" aria-hidden="true" />
              </a>
            </div>
          </div>
          <HeroFilm className="hero-film-mask -mx-4 aspect-[826/778] sm:mx-auto sm:w-full sm:max-w-[560px] lg:mr-[-40px] lg:ml-0 lg:aspect-[10/9] lg:max-w-none" />
        </section>

        {/* trust strip */}
        <div className={`pb-16 ${WRAP}`}>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Why businesses trust Usetally">
            {TRUST.map(([Icon, title, sub]) => (
              <li key={title} className="flex items-center gap-3.5 rounded-2xl bg-hero-paper/90 p-4 shadow-[0_1px_2px_rgba(20,16,8,.04),0_10px_30px_-18px_rgba(20,16,8,.25)] ring-1 ring-black/[.05] backdrop-blur-sm dark:ring-white/[.06]">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-hero-accent/10 text-hero-accent"><Icon className="size-[18px]" aria-hidden="true" /></span>
                <span className="min-w-0 leading-tight">
                  <span className="block text-[14.5px] font-semibold tracking-[-0.01em] text-hero-ink">{title}</span>
                  <span className="mt-1 block text-[13px] text-hero-ink-2">{sub}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ------------------------------------------------ story */}
      <PainStory />
      <Chapters />

      {/* ------------------------------------------------ teams */}
      <section className={`py-24 ${WRAP}`} aria-labelledby="teams-title">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-center">
          <div className="max-w-[520px]">
            <p className={KICKER}>For teams</p>
            <h2 id="teams-title" className={`mt-4 ${H2}`}>Everyone does their part. You see everything.</h2>
            <p className="mt-5 text-[17px] leading-relaxed text-hero-ink-2">Invite your finance people and juniors. Junior drafts wait for approval, and you decide who can see your costs and profit.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {ROLES.map((r, i) => (
              <div key={r.role} className={`${PAPER} p-5 ${i === 1 ? "sm:translate-y-6" : ""}`}>
                <span className="inline-flex size-10 items-center justify-center rounded-full bg-hero-tint"><r.icon className="size-5 text-hero-ink" aria-hidden="true" /></span>
                <p className="mt-4 text-[18px] font-semibold tracking-[-0.01em]">{r.role}</p>
                <p className="text-[13px] text-hero-ink-2">{r.who}</p>
                <ul className="mt-4 space-y-2 text-[13.5px]">
                  {r.can.map((c) => <li key={c} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-hero-accent" aria-hidden="true" />{c}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ get paid + print */}
      <section className="bg-hero-tint/60 py-24" aria-labelledby="paid-title">
        <div className={`grid gap-14 lg:grid-cols-2 ${WRAP}`}>
          <div>
            <p className={KICKER}>Get paid</p>
            <h2 id="paid-title" className={`mt-4 ${H2}`}>Your account. Your money.</h2>
            <p className="mt-5 max-w-[520px] text-[17px] leading-relaxed text-hero-ink-2">Connect the provider you already use with our step-by-step guide. Money goes straight to you. {BRAND.name} never holds it.</p>
            <ul className="mt-8 divide-y divide-hero-line border-y border-hero-line">
              {PROVIDERS.map(([name, where]) => (
                <li key={name} className="flex items-center justify-between gap-4 py-3.5">
                  <span className="flex items-center gap-3 text-[16px] font-semibold">{name === "Bank transfer" ? <Landmark className="size-4 text-hero-ink-2" aria-hidden="true" /> : <span className="size-2 rounded-full bg-hero-accent" aria-hidden="true" />}{name}</span>
                  <span className="text-right text-[13.5px] text-hero-ink-2">{where}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className={KICKER}>Print anywhere</p>
            <h2 className={`mt-4 ${H2}`}>Every document, any paper.</h2>
            <p className="mt-5 max-w-[520px] text-[17px] leading-relaxed text-hero-ink-2">Four templates that carry your logo and colour. Download PDFs or print on A4, Letter, A5, half letter, or 80 mm and 58 mm receipt rolls.</p>
            <div className="mt-8 grid grid-cols-4 gap-2.5">
              {[["essential", "Essential"], ["signature", "Signature"], ["executive", "Executive"], ["pos", "POS"]].map(([id, name]) => (
                <figure key={id} className="flex flex-col gap-2">
                  <div className="aspect-[4/5] overflow-hidden rounded-xl bg-hero-paper p-2 ring-1 ring-black/[.05] dark:ring-white/[.06]"><TemplateThumb id={id} /></div>
                  <figcaption className="text-center text-[12.5px] font-medium text-hero-ink-2">{name}</figcaption>
                </figure>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-2 text-[12.5px] font-medium">
              {["A4", "US Letter", "A5", "Half letter", "80 mm roll", "58 mm roll"].map((p) => <span key={p} className="rounded-full bg-hero-paper px-3 py-1.5 ring-1 ring-hero-line">{p}</span>)}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ pricing */}
      {allPlans.length > 0 && (() => {
        const currencies = [...new Set(allPlans.filter((p) => p.price_minor > 0).map((p) => p.currency))];
        const interval = sp.interval === "year" ? "year" : "month";
        const { currency, plans } = plansFor(allPlans, { currency: currencies.includes(sp.currency) ? sp.currency : currencies.includes("NGN") ? "NGN" : "USD", interval });
        const link = (c, i) => `/?currency=${c}&interval=${i}#pricing`;
        const pill = (on) => `inline-flex h-9 items-center rounded-full px-4 text-[13px] font-semibold ${on ? "bg-hero-ink text-hero" : "text-hero-ink-2 hover:text-hero-ink"}`;
        return (
          <section id="pricing" className={`scroll-mt-4 py-24 ${WRAP}`} aria-labelledby="pricing-title">
            <div className="text-center">
              <p className={KICKER}>Pricing</p>
              <h2 id="pricing-title" className={`mt-4 ${H2}`}>Simple plans. Start free.</h2>
              <p className="mt-4 text-[17px] text-hero-ink-2">{trialText}, no card needed. Then pick a plan that fits.</p>
            </div>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {currencies.length > 1 && <nav className="inline-flex gap-1 rounded-full bg-hero-tint p-1" aria-label="Currency">{currencies.map((c) => <Link key={c} href={link(c, interval)} className={pill(c === currency)}>{c === "NGN" ? "₦ Naira" : c === "USD" ? "$ Dollar" : c}</Link>)}</nav>}
              {hasYearly(allPlans, currency) && <nav className="inline-flex gap-1 rounded-full bg-hero-tint p-1" aria-label="Billing period"><Link href={link(currency, "month")} className={pill(interval === "month")}>Monthly</Link><Link href={link(currency, "year")} className={pill(interval === "year")}>Yearly · 2 months free</Link></nav>}
            </div>
            <div className={`mx-auto mt-10 grid max-w-5xl gap-4 md:grid-cols-2 ${plans.length >= 3 ? "lg:grid-cols-3" : ""}`}>
              {plans.map((p) => {
                const featured = p.name === "Team";
                return (
                  <div key={p.id} className={`relative flex flex-col p-7 ${featured ? "rounded-[18px] bg-hero-ink text-hero shadow-[0_30px_60px_-30px_rgba(20,16,8,.6)]" : PAPER}`}>
                    {featured && <span className="absolute top-6 right-6 rounded-full bg-hero-accent px-2.5 py-1 text-[11px] font-semibold text-white">Most popular</span>}
                    <p className="text-[18px] font-semibold">{p.name}</p>
                    {p.tagline && <p className={`mt-1 text-[13.5px] ${featured ? "text-hero/70" : "text-hero-ink-2"}`}>{p.tagline}</p>}
                    <p className="mt-6"><span className="text-[40px] font-semibold tracking-[-0.03em] tabular-nums">{formatMoney(p.price_minor, p.currency)}</span><span className={featured ? "text-hero/70" : "text-hero-ink-2"}> / {p.billing_interval}</span></p>
                    <p className={`h-5 text-[13px] ${featured ? "text-hero/70" : "text-hero-ink-2"}`}>{monthlyEquivalent(p) ? `${formatMoney(monthlyEquivalent(p), p.currency)} a month` : ""}</p>
                    <ul className="mt-6 flex-1 space-y-2.5 text-[14px]">
                      <li className="flex gap-2.5"><Check className="mt-0.5 size-4 shrink-0 text-hero-accent" aria-hidden="true" />{p.document_limit == null ? "Unlimited quotes & invoices" : `${p.document_limit} documents a month`}</li>
                      <li className="flex gap-2.5"><Check className="mt-0.5 size-4 shrink-0 text-hero-accent" aria-hidden="true" />{!p.allow_company ? "For freelancers" : p.seat_limit == null ? "Unlimited team members" : p.seat_limit === 1 ? "1 user" : `Up to ${p.seat_limit} team members`}</li>
                      {(p.features || []).map((f) => <li key={f} className="flex gap-2.5"><Check className="mt-0.5 size-4 shrink-0 text-hero-accent" aria-hidden="true" />{f}</li>)}
                    </ul>
                    <Link href="/signup" className={`mt-8 inline-flex h-12 items-center justify-center rounded-full text-[14px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hero-accent ${featured ? "bg-hero text-hero-ink hover:bg-hero/90" : "bg-hero-ink text-hero hover:bg-hero-ink/90"}`}>Start free trial</Link>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })()}

      {/* ------------------------------------------------ FAQ */}
      <section className={`grid gap-12 py-24 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] ${WRAP}`} aria-labelledby="faq-title">
        <div>
          <p className={KICKER}>Questions</p>
          <h2 id="faq-title" className={`mt-4 ${H2}`}>Good to know.</h2>
          <p className="mt-5 max-w-[420px] text-[17px] leading-relaxed text-hero-ink-2">Something else? <Link href="/signup" className="font-semibold text-hero-ink underline decoration-hero-line underline-offset-4 hover:decoration-hero-ink">Start the free trial</Link> and ask us from inside the app.</p>
        </div>
        <div className="divide-y divide-hero-line border-y border-hero-line">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 rounded-lg py-4 text-[17px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hero-accent [&::-webkit-details-marker]:hidden">
                {q}
                <Plus className="size-5 shrink-0 text-hero-ink-2 transition-transform duration-300 group-open:rotate-45" aria-hidden="true" />
              </summary>
              <p className="max-w-[640px] pb-5 text-[15.5px] leading-relaxed text-hero-ink-2">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------ founding CTA */}
      <section className={`pb-24 ${WRAP}`}>
        <div className="relative overflow-hidden rounded-[28px] bg-[#121210] px-6 py-16 text-[#f2efe7] sm:px-12 lg:px-16 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-end">
            <div>
              <p className="text-[13px] font-semibold tracking-[0.14em] text-[#5a9dff] uppercase">Early access</p>
              <h2 className="mt-4 text-[clamp(34px,4.8vw,64px)] leading-[1.02] font-semibold tracking-[-0.035em]">Good deals deserve a better <span className="text-[#5a9dff]">ending.</span></h2>
              <p className="mt-5 max-w-[560px] text-[17px] leading-relaxed text-[#a29e93]">{BRAND.name} is new, and built for freelancers and small businesses. Join early, tell us what you need, and help shape what we build next.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col lg:items-stretch">
              <Link href="/signup" className="inline-flex h-[52px] items-center justify-center gap-2.5 rounded-full bg-[#f2efe7] px-7 text-[15px] font-semibold text-[#121210] transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5a9dff]">Get started free<ArrowRight className="size-[18px]" aria-hidden="true" /></Link>
              <a href="#pricing" className={`${BTN_GHOST} text-[#f2efe7] ring-white/20 hover:ring-white/50`}>See pricing</a>
            </div>
          </div>
          <EyeOff className="pointer-events-none absolute -right-10 -bottom-12 size-64 text-white/[.03]" aria-hidden="true" />
        </div>
      </section>

      {/* ------------------------------------------------ footer */}
      <footer className="border-t border-hero-line">
        <div className={`flex flex-col gap-8 py-10 sm:flex-row sm:items-start sm:justify-between ${WRAP}`}>
          <div className="max-w-[320px]">
            <Logo withWord className="size-8" wordClass="text-hero-ink" />
            <p className="mt-3 text-[13.5px] leading-relaxed text-hero-ink-2">Quotes, invoices and payments for freelancers and small businesses.</p>
          </div>
          <nav className="grid grid-cols-2 gap-x-12 gap-y-2 text-[13.5px] sm:grid-cols-3" aria-label="Footer">
            <a href="#how-it-works" className="text-hero-ink-2 hover:text-hero-ink">How it works</a>
            <a href="#pricing" className="text-hero-ink-2 hover:text-hero-ink">Pricing</a>
            <Link href="/signup" className="text-hero-ink-2 hover:text-hero-ink">Start free</Link>
            <Link href="/login" className="text-hero-ink-2 hover:text-hero-ink">Sign in</Link>
            <Link href="/terms" className="text-hero-ink-2 hover:text-hero-ink">Terms</Link>
            <Link href="/privacy" className="text-hero-ink-2 hover:text-hero-ink">Privacy</Link>
            <Link href="/dpa" className="text-hero-ink-2 hover:text-hero-ink">Data processing</Link>
            <Link href="/subprocessors" className="text-hero-ink-2 hover:text-hero-ink">Sub-processors</Link>
          </nav>
        </div>
        <p className={`pb-10 text-[12.5px] text-hero-ink-2 ${WRAP}`}>© {new Date().getFullYear()} {BRAND.name}. All rights reserved.</p>
      </footer>
    </div>
  );
}

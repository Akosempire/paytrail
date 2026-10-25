import Link from "next/link";
import { preload } from "react-dom";
import { ArrowDown, EyeOff, Landmark, Plus } from "lucide-react";
import { Logo } from "@/components/ui";
import { HeroFilm } from "@/components/hero-film";
import { InstallPrompt } from "@/components/pwa";
import { TemplateThumb } from "@/components/layout-panel";
import { Chapters, PainStory } from "@/components/landing/story";
import { DotField } from "@/components/landing/dot-field";
import { ReceiptTape } from "@/components/landing/receipt-tape";
import { PrimaryCta, SecondaryCta } from "@/components/landing/cta";
import { ThemeSwitch } from "@/components/landing/theme-switch";
import { Platforms } from "@/components/landing/platforms";
import { Pricing } from "@/components/landing/pricing";
import { Team } from "@/components/landing/team";
import { SiteFooter } from "@/components/landing/site-footer";
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

const PAPER = "rounded-[18px] bg-hero-paper shadow-[0_1px_2px_rgba(20,16,8,.05),0_18px_40px_-24px_rgba(20,16,8,.3)] ring-1 ring-black/[.05] dark:ring-white/[.06]";
const WRAP = "mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-10";
const KICKER = "text-[13px] font-semibold tracking-[0.14em] text-hero-accent uppercase";
const H2 = "font-display text-[clamp(32px,4.4vw,56px)] leading-[1.04] font-semibold tracking-[-0.035em]";

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
  preload("/fonts/chintzy-cpu.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  const sp = await searchParams;
  const [{ plans: allPlans, trial }, ctx] = await Promise.all([publicData(), supabaseConfigured() ? getContext() : { user: null }]);
  const trialText = trial?.trial_mode === "documents" ? `First ${trial.trial_documents} documents free` : trial?.trial_mode === "days" ? `${trial.trial_days}-day free trial` : "Free trial";
  const signedIn = Boolean(ctx.user);

  return (
    <div className="relative min-h-dvh bg-hero text-hero-ink">
      {/* interactive dot field behind the whole page */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0"><DotField /></div>
      <div className="relative z-[1]">
      {signedIn && <InstallPrompt delay={5000} />}

      {/* ------------------------------------------------ hero */}
      <div className="relative overflow-hidden">
        <header className={`relative z-10 flex items-center justify-between py-4 ${WRAP}`}>
          <Logo withWord wordClass="text-hero-ink" />
          <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main">
            <a href="#how-it-works" className="hidden px-3 text-sm font-medium text-hero-ink-2 hover:text-hero-ink md:block">How it works</a>
            <a href="#pricing" className="hidden px-3 text-sm font-medium text-hero-ink-2 hover:text-hero-ink sm:block">Pricing</a>
            <ThemeSwitch />
            {signedIn
              ? <PrimaryCta href="/app" size="sm">Dashboard</PrimaryCta>
              : <><Link href="/login" className="px-3 text-sm font-medium text-hero-ink-2 hover:text-hero-ink">Sign in</Link><PrimaryCta href="/signup" size="sm">Get started</PrimaryCta></>}
          </nav>
        </header>

        {/* phones & tablets: film first, then the words, all fitted to one screen
            (sizes follow the screen height); desktop: words left, film right */}
        <section className={`flex min-h-[calc(100svh-68px)] flex-col items-center justify-center gap-3 pt-1 pb-6 lg:grid lg:min-h-0 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:items-center lg:gap-4 lg:pt-20 lg:pb-12 ${WRAP}`}>
          <div className="w-full max-w-[560px] self-start text-left lg:self-auto lg:pb-10">
            <h1 className="font-display text-[clamp(32px,6svh,60px)] leading-[0.98] font-semibold tracking-[-0.045em] lg:text-[clamp(46px,6.4vw,84px)]">
              Quotes.<br />Invoices.<br /><span className="text-hero-accent">Payments.</span>
            </h1>
            <p className="mt-4 max-w-[440px] text-[15px] leading-relaxed text-hero-ink-2 sm:max-w-[520px] sm:text-[17px] lg:mt-6 lg:max-w-[560px] lg:text-[19px] [@media(max-height:700px)]:text-[14px] [@media(max-height:700px)]:leading-snug">Send branded quotes, turn them into invoices, and get paid straight into your own Paystack or Stripe. See your real profit on every job, with receipts sent automatically.</p>
            <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-6 lg:mt-9">
              <PrimaryCta href="/signup">Get started free</PrimaryCta>
              <a href="#how-it-works" className="group hidden items-center justify-start gap-2 self-start text-[15px] font-medium sm:inline-flex sm:self-auto [@media(max-height:700px)]:max-lg:hidden">
                <span className="border-b border-hero-line pb-0.5 transition-colors group-hover:border-hero-ink">See how it works</span>
                <ArrowDown className="size-4 transition-transform group-hover:translate-y-0.5" aria-hidden="true" />
              </a>
            </div>
          </div>
          <HeroFilm className="hero-film-mask order-first aspect-[826/778] h-[36svh] max-h-[420px] w-auto shrink-0 lg:order-none lg:mr-[-40px] lg:ml-0 lg:h-auto lg:max-h-none lg:w-full lg:aspect-[10/9] [@media(max-height:700px)]:h-[29svh]" />
        </section>

        {/* trust facts on receipt tape */}
        <div className="pb-4"><ReceiptTape /></div>
        <Platforms wrap={WRAP} kicker={KICKER} />
      </div>

      {/* ------------------------------------------------ story */}
      <PainStory />
      <Chapters />

      {/* ------------------------------------------------ teams */}
      <Team wrap={WRAP} kicker={KICKER} h2={H2} />

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
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ pricing */}
      {allPlans.length > 0 && (() => {
        const currencies = [...new Set(allPlans.filter((p) => p.price_minor > 0).map((p) => p.currency))];
        const interval = sp.interval === "year" ? "year" : "month";
        const { currency, plans } = plansFor(allPlans, { currency: currencies.includes(sp.currency) ? sp.currency : currencies.includes("NGN") ? "NGN" : "USD", interval });
        const link = (c, i) => `/?currency=${c}&interval=${i}#pricing`;
        return <Pricing plans={plans} currency={currency} currencies={currencies} interval={interval} yearly={hasYearly(allPlans, currency)} trialText={trialText} link={link} wrap={WRAP} kicker={KICKER} h2={H2} />;
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
              <h2 className="font-display mt-4 text-[clamp(34px,4.8vw,64px)] leading-[1.02] font-semibold tracking-[-0.035em]">Good deals deserve a better <span className="text-[#5a9dff]">ending.</span></h2>
              <p className="mt-5 max-w-[560px] text-[17px] leading-relaxed text-[#a29e93]">{BRAND.name} is new, and built for freelancers and small businesses. Join early, tell us what you need, and help shape what we build next.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col lg:items-stretch">
              <PrimaryCta href="/signup" block>Get started free</PrimaryCta>
              <SecondaryCta href="#pricing" onDark block>See pricing</SecondaryCta>
            </div>
          </div>
          <EyeOff className="pointer-events-none absolute -right-10 -bottom-12 size-64 text-white/[.03]" aria-hidden="true" />
        </div>
      </section>

      {/* ------------------------------------------------ footer */}
      <SiteFooter />
      </div>
    </div>
  );
}

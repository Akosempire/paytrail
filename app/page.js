import Link from "next/link";
import { preload } from "react-dom";
import { ArrowDown, EyeOff, Landmark, Plus } from "lucide-react";
import { HeroFilm } from "@/components/hero-film";
import { InstallPrompt } from "@/components/pwa";
import { TemplateThumb } from "@/components/layout-panel";
import { Chapters, PainStory } from "@/components/landing/story";
import { DotField } from "@/components/landing/dot-field";
import { ReceiptTape } from "@/components/landing/receipt-tape";
import { PrimaryCta, SecondaryCta } from "@/components/landing/cta";
import { SiteNav } from "@/components/landing/site-nav";
import { Platforms } from "@/components/landing/platforms";
import { Pricing } from "@/components/landing/pricing";
import { Team } from "@/components/landing/team";
import { Tax } from "@/components/landing/tax";
import { SiteFooter } from "@/components/landing/site-footer";
import { LiveStats } from "@/components/landing/live-stats";
import { supabaseConfigured } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";
import { formatMoney } from "@/lib/money";
import { hasYearly, monthlyEquivalent, plansFor } from "@/lib/plans";
import { BRAND } from "@/lib/brand";
import { SEO } from "@/lib/seo";
import { publicPlans } from "@/lib/public-plans";
import { siteUrl } from "@/lib/site";

const publicData = publicPlans;

// page metadata replaces (not merges) the layout's openGraph, so repeat it in full
export const metadata = { alternates: { canonical: "/" }, openGraph: { type: "website", siteName: "Usetally", title: SEO.title, description: SEO.short, url: "/", locale: "en" } };

const PAPER = "rounded-[18px] bg-hero-paper shadow-[0_1px_2px_rgba(20,16,8,.05),0_18px_40px_-24px_rgba(20,16,8,.3)] ring-1 ring-black/[.05] dark:ring-white/[.06]";
const WRAP = "mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-10";
const KICKER = "text-[13px] font-semibold tracking-[0.14em] text-hero-accent uppercase";
const H2 = "font-display text-[clamp(32px,4.4vw,56px)] leading-[1.04] font-semibold tracking-[-0.035em]";

const PROVIDERS = [
  ["Bank transfer", "Confirm in one tap"],
  ["Bachs", "Recommended"],
  ["Paystack", "Cards, bank transfer and USSD"],
  ["Flutterwave", "Cards and mobile money"],
  ["Stripe", "US, UK, Europe and 40+ countries"],
];

const FAQ = SEO.faq;

function structuredData(plans) {
  const base = siteUrl();
  const offers = (plans || []).filter((p) => p.active).map((p) => ({
    "@type": "Offer", name: p.name, price: (p.price_minor / 100).toFixed(2), priceCurrency: p.currency,
    ...(p.price_minor > 0 ? { priceSpecification: { "@type": "UnitPriceSpecification", price: (p.price_minor / 100).toFixed(2), priceCurrency: p.currency, billingDuration: 1, unitCode: p.billing_interval === "year" ? "ANN" : "MON" } } : {}),
    url: `${base}/signup`,
  }));
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${base}/#org`, name: BRAND.name, url: base, logo: `${base}/icons/icon-512.png` },
      { "@type": "WebSite", "@id": `${base}/#site`, name: BRAND.name, url: base, publisher: { "@id": `${base}/#org` }, description: SEO.short },
      {
        "@type": "SoftwareApplication", "@id": `${base}/#app`, name: BRAND.name, url: base,
        applicationCategory: "BusinessApplication", applicationSubCategory: "Invoicing software", operatingSystem: "Web, iOS, Android, Windows, macOS",
        description: SEO.description, keywords: SEO.keywords.join(", "), audience: { "@type": "BusinessAudience", name: SEO.audience },
        featureList: SEO.features.map(([t, d]) => `${t}: ${d}`), publisher: { "@id": `${base}/#org` },
        ...(offers.length ? { offers } : { offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: "Free trial" } }),
      },
      { "@type": "FAQPage", "@id": `${base}/#faq`, mainEntity: SEO.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
    ],
  };
}

export default async function Home({ searchParams }) {
  preload("/fonts/orbitron-700.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  const sp = await searchParams;
  const [{ plans: allPlans, trial }, ctx] = await Promise.all([publicData(), supabaseConfigured() ? getContext() : { user: null }]);
  const trialText = trial?.trial_mode === "documents" ? `First ${trial.trial_documents} documents free` : trial?.trial_mode === "days" ? `${trial.trial_days}-day free trial` : "Free trial";
  const signedIn = Boolean(ctx.user);
  const jsonLd = structuredData(allPlans);

  return (
    <div className="relative min-h-dvh bg-hero text-hero-ink">
      {/* facts for search engines and AI assistants (no ratings or reviews: only what's true) */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      {/* interactive dot field behind the whole page */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0"><DotField /></div>
      <div className="relative z-[1]">
      {signedIn && <InstallPrompt delay={5000} />}

      {/* floating nav: stays at the top while you scroll */}
      <SiteNav signedIn={signedIn} wrap={WRAP} />

      {/* ------------------------------------------------ hero */}
      <div className="relative overflow-hidden">

        {/* phones & tablets: film first, then the words, all fitted to one screen
            (sizes follow the screen height); desktop: words left, film right */}
        <section className={`flex min-h-[calc(100svh-72px)] flex-col items-center justify-center gap-3 pt-1 pb-6 lg:grid lg:min-h-0 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:items-center lg:gap-4 lg:pt-20 lg:pb-12 ${WRAP}`}>
          <div className="w-full max-w-[560px] self-start text-left lg:self-auto lg:pb-10">
            <h1 className="font-display text-[clamp(32px,6svh,60px)] leading-[0.98] font-semibold tracking-[-0.045em] lg:text-[clamp(46px,6.4vw,84px)]">
              Quotes.<br />Invoices.<br /><span className="text-hero-accent">Payments.</span>
            </h1>
            <p className="mt-4 max-w-[440px] text-[15px] leading-relaxed text-hero-ink-2 sm:max-w-[520px] sm:text-[17px] lg:mt-6 lg:max-w-[560px] lg:text-[19px] [@media(max-height:700px)]:text-[14px] [@media(max-height:700px)]:leading-snug">Send branded quotes, turn them into invoices, and get paid by transfer, Bachs, Paystack or Stripe, straight into your own account. See your real profit and the VAT you owe, with receipts sent automatically.</p>
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

        {/* trust facts, printed as a receipt */}
        <div className="pb-4"><ReceiptTape /></div>
        <Platforms wrap={WRAP} kicker={KICKER} />
        <LiveStats wrap={WRAP} kicker={KICKER} />
      </div>

      {/* ------------------------------------------------ story */}
      <PainStory />
      <Chapters />

      {/* ------------------------------------------------ tax */}
      <Tax wrap={WRAP} kicker={KICKER} h2={H2} />

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
                  <span className="flex items-center gap-3 text-[16px] font-semibold whitespace-nowrap">{name === "Bank transfer" ? <Landmark className="size-4 text-hero-ink-2" aria-hidden="true" /> : <span className="size-2 rounded-full bg-hero-accent" aria-hidden="true" />}{name}</span>
                  {where === "Recommended"
                    ? <span className="rounded-full border border-hero-accent px-2.5 py-0.5 font-mono text-[10.5px] tracking-[0.14em] text-hero-accent uppercase">Recommended</span>
                    : <span className="text-right text-[13.5px] text-hero-ink-2">{where}</span>}
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
          <h2 id="faq-title" className={`mt-4 scroll-mt-28 ${H2}`}>Good to know.</h2>
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

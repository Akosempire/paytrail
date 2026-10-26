import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { monthlyEquivalent } from "@/lib/plans";
import { PrimaryCta, SecondaryCta } from "@/components/landing/cta";

// Pricing as a row of receipts: torn bottom edge, dashed rules, line items
// with dotted leaders, a barcode, and a "Most popular" stamp on the
// featured plan. Plan data and filtering come from the page.
const cx = (...c) => c.filter(Boolean).join(" ");

function Segmented({ label, options }) {
  return (
    <nav aria-label={label} className="inline-flex gap-1 rounded-full bg-hero-paper/80 p-1 ring-1 ring-black/[.06] backdrop-blur-sm ring-inset dark:ring-white/[.08]">
      {options.map(([text, href, on]) => (
        <Link key={text} href={href} scroll={false} aria-current={on ? "true" : undefined}
          className={cx("inline-flex h-8 items-center rounded-full px-4 font-mono text-[11.5px] tracking-[0.12em] uppercase transition-colors",
            on ? "bg-hero-ink text-hero" : "text-hero-ink-2 hover:text-hero-ink")}>{text}</Link>
      ))}
    </nav>
  );
}

function Line({ children }) {
  return (
    <li className="flex items-baseline gap-2 text-[14px]">
      <span>{children}</span>
      <span aria-hidden="true" className="min-w-4 flex-1 -translate-y-[3px] border-b border-dotted border-hero-ink/25" />
      <span aria-hidden="true" className="font-mono text-[12px] text-hero-accent">✓</span>
    </li>
  );
}

function Barcode({ seed }) {
  // decorative: bar widths from the plan name, so each receipt differs
  const bars = [...(seed + "usetally")].slice(0, 22).map((ch, i) => 1 + ((ch.charCodeAt(0) + i) % 3));
  return (
    <div aria-hidden="true" className="flex h-7 items-stretch gap-[2px] opacity-70">
      {bars.map((w, i) => <span key={i} className="bg-hero-ink" style={{ width: w }} />)}
    </div>
  );
}

export function Pricing({ plans, currency, currencies, interval, yearly, trialText, link, wrap, kicker, h2 }) {
  return (
    <section id="pricing" className={`scroll-mt-16 py-24 ${wrap}`} aria-labelledby="pricing-title">
      <div className="text-center">
        <p className={kicker}>Pricing</p>
        <h2 id="pricing-title" className={`mt-4 ${h2}`}>Simple plans. Start free.</h2>
        <p className="mt-4 text-[17px] text-hero-ink-2">{trialText}, no card needed. Then pick a plan that fits.</p>
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {currencies.length > 1 && <Segmented label="Currency" options={currencies.map((c) => [c === "NGN" ? "₦ Naira" : c === "USD" ? "$ Dollar" : c, link(c, interval), c === currency])} />}
        {yearly && <Segmented label="Billing period" options={[["Monthly", link(currency, "month"), interval === "month"], ["Yearly · 2 months free", link(currency, "year"), interval === "year"]]} />}
      </div>

      <div className={cx("mx-auto mt-12 grid max-w-5xl items-start gap-6 md:grid-cols-2", plans.length >= 3 && "lg:grid-cols-3")}>
        {plans.map((p, i) => {
          const featured = p.name === "Team";
          const month = monthlyEquivalent(p);
          return (
            <div key={p.id} className={cx("receipt-shadow relative", featured && "lg:-mt-3")}>
              <article className="receipt-edge flex flex-col bg-hero-paper px-7 pt-7 pb-11 text-hero-ink" aria-label={`${p.name} plan`}>
                <div className="flex items-center justify-between font-mono text-[11px] tracking-[0.14em] text-hero-ink-2 uppercase">
                  <span>Plan 0{i + 1}</span>
                  {featured
                    ? <span className="-my-1 rotate-[6deg] rounded-md border-2 border-hero-accent px-2 py-0.5 font-semibold tracking-[0.16em] text-hero-accent">Most popular</span>
                    : <span>{p.billing_interval === "year" ? "Yearly" : "Monthly"}</span>}
                </div>
                <h3 className="font-display mt-4 text-[34px] leading-none">{p.name}</h3>
                {p.tagline && <p className="mt-2 text-[14px] text-hero-ink-2">{p.tagline}</p>}

                <div className="my-5 border-t border-dashed border-hero-ink/25" />
                <p className="flex items-baseline gap-2">
                  <span className="font-display text-[44px] leading-none tabular-nums">{formatMoney(p.price_minor, p.currency)}</span>
                  <span className="font-mono text-[11.5px] tracking-[0.12em] text-hero-ink-2 uppercase">/ {p.billing_interval}</span>
                </p>
                <p className="mt-2 h-4 font-mono text-[11.5px] tracking-[0.06em] text-hero-ink-2">{month ? `= ${formatMoney(month, p.currency)} a month` : ""}</p>
                <div className="my-5 border-t border-dashed border-hero-ink/25" />

                <ul className="flex-1 space-y-2.5">
                  <Line>{p.document_limit == null ? "Unlimited quotes & invoices" : `${p.document_limit} documents a month`}</Line>
                  <Line>{!p.allow_company ? "For freelancers" : p.seat_limit == null ? "Unlimited team members" : p.seat_limit === 1 ? "1 user" : `Up to ${p.seat_limit} team members`}</Line>
                  {(p.features || []).map((f) => <Line key={f}>{f}</Line>)}
                </ul>

                <div className="mt-8">{featured ? <PrimaryCta href="/signup" block>Start free trial</PrimaryCta> : <SecondaryCta href="/signup" block>Start free trial</SecondaryCta>}</div>
                <div className="mt-7 flex items-end justify-between gap-4">
                  <Barcode seed={p.name} />
                  <span className="font-mono text-[10.5px] tracking-[0.14em] text-hero-ink-2/70 uppercase">Thank you</span>
                </div>
              </article>
            </div>
          );
        })}
      </div>
    </section>
  );
}

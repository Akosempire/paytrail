import { Check, Download, FileCheck2, Send } from "lucide-react";

// Tax: works anywhere (your tax name and rate, totals for any period, an
// export for your accountant). In Nigeria, the VAT return can be filed for
// you; the card shows that to visitors in Nigeria. Everyone else sees a
// monthly tax summary in dollars with the export.
const cx = (...c) => c.filter(Boolean).join(" ");
const PAPER = "rounded-[18px] bg-hero-paper text-hero-ink shadow-[0_1px_2px_rgba(20,16,8,.06),0_26px_50px_-26px_rgba(20,16,8,.45)] ring-1 ring-black/[.05] dark:ring-white/[.06]";

const STEPS = ["To file", "Filed", "Paid"];
const LINES = ["VAT, GST or sales tax", "Customer tax ID", "Export for your accountant"];

export function Tax({ wrap, kicker, h2, nigeria = true }) {
  return (
    <section className={`py-24 ${wrap}`} aria-labelledby="tax-title">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-16">
        <div className="max-w-[520px]">
          <p className={kicker}>Tax</p>
          <h2 id="tax-title" className={`mt-4 ${h2}`}>Your tax, sorted.</h2>
          <p className="mt-5 text-[17px] leading-relaxed text-hero-ink-2">Usetally works out the tax on every invoice, at your rate, and adds it up for any month, quarter or year. One export and your accountant has it all.</p>
          {nigeria && (
            <p className="mt-6 inline-flex items-center gap-2 font-mono text-[11.5px] tracking-[0.12em] text-hero-ink-2 uppercase">
              <span className="size-1.5 rounded-full bg-hero-accent" aria-hidden="true" />In Nigeria: tap once and a tax consultant files your VAT
            </p>
          )}
        </div>

        <div className="mx-auto w-full max-w-[460px]">
          {nigeria ? (
          <div className={cx(PAPER, "relative z-10 p-6 sm:p-7")}>
            <div className="flex items-start justify-between gap-4">
              <p className="text-[11px] font-semibold tracking-[0.18em] text-hero-ink-2">OCTOBER VAT RETURN</p>
              <span className="rounded-full bg-hero-tint px-2.5 py-1 text-[11px] font-semibold text-hero-ink-2">Nigeria · example</span>
            </div>
            <p className="font-display mt-3 text-[40px] leading-none tabular-nums">₦80,250</p>
            <p className="mt-2 text-[13.5px] text-hero-ink-2">Due 21 Nov</p>

            <ol className="mt-5 flex items-center gap-2 border-y border-hero-line py-3 text-[12px] font-semibold" aria-label="Progress">
              {STEPS.map((s, i) => (
                <li key={s} className="flex items-center gap-2">
                  {i > 0 && <span aria-hidden="true" className="h-px w-5 bg-hero-line sm:w-8" />}
                  <span className={cx("rounded-full px-2.5 py-1", i === 0 ? "bg-hero-accent/10 text-hero-accent" : "text-hero-ink-2")}>{s}</span>
                </li>
              ))}
            </ol>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <span className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[#175cd3] px-4 text-[14px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.28),0_14px_30px_-14px_rgba(23,92,211,.7)] dark:bg-[#2563eb]"><Send className="size-4" aria-hidden="true" />File &amp; pay for me</span>
              <span className="inline-flex h-11 items-center justify-center gap-2 rounded-full px-4 text-[14px] font-semibold ring-1 ring-hero-line"><FileCheck2 className="size-4" aria-hidden="true" />I'll file it</span>
            </div>
          </div>
          ) : (
          <div className={cx(PAPER, "relative z-10 p-6 sm:p-7")}>
            <div className="flex items-start justify-between gap-4">
              <p className="text-[11px] font-semibold tracking-[0.18em] text-hero-ink-2">OCTOBER TAX SUMMARY</p>
              <span className="rounded-full bg-hero-tint px-2.5 py-1 text-[11px] font-semibold text-hero-ink-2">Example</span>
            </div>
            <p className="font-display mt-3 text-[40px] leading-none tabular-nums">$802.50</p>
            <p className="mt-2 text-[13.5px] text-hero-ink-2">Tax collected on 24 invoices</p>

            <dl className="mt-5 space-y-2 border-y border-hero-line py-3 text-[13.5px]">
              <div className="flex justify-between"><dt className="text-hero-ink-2">Sales</dt><dd className="font-semibold tabular-nums">$10,700.00</dd></div>
              <div className="flex justify-between"><dt className="text-hero-ink-2">Tax at 7.5%</dt><dd className="font-semibold tabular-nums">$802.50</dd></div>
            </dl>

            <div className="mt-5">
              <span className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#175cd3] px-4 text-[14px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.28),0_14px_30px_-14px_rgba(23,92,211,.7)] dark:bg-[#2563eb]"><Download className="size-4" aria-hidden="true" />Export for your accountant</span>
            </div>
          </div>
          )}

          {/* what's on every invoice: a small torn slip */}
          <div className="receipt-shadow relative z-0 -mt-3 ml-4 w-[70%] sm:ml-8 sm:w-[64%]">
            <ul className="receipt-paper space-y-2 bg-hero-paper px-5 pt-6 pb-7 font-mono text-[11px] tracking-[0.05em] text-hero-ink uppercase">
              {LINES.map((l) => (
                <li key={l} className="flex items-baseline gap-2">
                  <span>{l}</span>
                  <span aria-hidden="true" className="min-w-3 flex-1 -translate-y-[3px] border-b border-dotted border-hero-ink/25" />
                  <Check className="size-3 shrink-0 translate-y-[1px] text-hero-accent" aria-label="Yes" />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

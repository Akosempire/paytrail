// The trust facts, printed on a strip of thermal receipt tape that runs across
// the page, crossed by a blue brand tape. Pure CSS: scrolls slowly, pauses on
// hover, and stands still for people who prefer reduced motion. Screen
// readers get one plain list; the moving copies are hidden from them.

// everything here is true of the product today
const FACTS = [
  "Paid straight into your own Paystack or Stripe",
  "Every payment verified with the provider",
  "Payment keys encrypted · NDPA-ready",
  "14 days free · no card",
  "Usetally's cut of your payments: 0%",
];
const WORDS = ["Quotes", "Invoices", "Payments", "Receipts", "Real profit"];

function Track({ items, render, direction, seconds }) {
  // two identical halves so translating by -50% loops seamlessly
  const half = <div className="flex shrink-0 items-center">{items.map(render)}</div>;
  return (
    <div aria-hidden="true" className={`tape-track flex w-max ${direction === "right" ? "tape-right" : "tape-left"}`} style={{ animationDuration: `${seconds}s` }}>
      {half}{half}
    </div>
  );
}

export function ReceiptTape() {
  return (
    <section aria-label="Why businesses trust Usetally" className="tape-zone relative isolate my-2 h-[190px] overflow-hidden sm:h-[240px]">
      <ul className="sr-only">{FACTS.map((f) => <li key={f}>{f}</li>)}</ul>

      {/* back: blue brand tape */}
      <div className="absolute top-1/2 left-[-5%] w-[110%] -translate-y-1/2 rotate-[4deg] bg-hero-accent py-2.5 text-white sm:py-3">
        <Track items={WORDS} direction="right" seconds={38}
          render={(w, i) => (
            <span key={i} className="font-display flex items-center gap-6 px-6 text-[22px] leading-none whitespace-nowrap sm:text-[28px]">
              {w}<span className="text-white/60">✦</span>
            </span>
          )} />
      </div>

      {/* front: receipt tape with torn edges */}
      <div className="tape-shadow absolute top-1/2 left-[-5%] w-[110%] -translate-y-1/2 rotate-[-2.6deg]">
        <div className="tape-paper bg-hero-paper py-4 text-hero-ink sm:py-5">
          <Track items={FACTS} direction="left" seconds={46}
            render={(f, i) => (
              <span key={i} className="flex items-center gap-5 px-5 font-mono text-[12.5px] font-medium tracking-[0.08em] whitespace-nowrap uppercase sm:text-[13.5px]">
                <span className={i === FACTS.length - 1 ? "text-hero-accent" : ""}>{i === FACTS.length - 1 ? "◆" : "✓"} {f}</span>
                <span className="text-hero-ink-2/50">·····</span>
              </span>
            )} />
        </div>
      </div>
    </section>
  );
}

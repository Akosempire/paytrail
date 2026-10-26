// The trust facts as one printed receipt: each fact is a line item and
// "Usetally's cut" is the total. Straight, still and readable; the torn edge
// at the bottom is a CSS mask. Everything here is true of the product today.
const LINES = [
  ["Paid into your own Paystack/Stripe", "✓"],
  ["Every payment verified", "✓"],
  ["Keys encrypted · NDPA-ready", "✓"],
  ["Free trial", "14 days"],
  ["Card needed to start", "No"],
];

export function ReceiptTape() {
  return (
    <section aria-label="What you get with Usetally" className="flex justify-center px-4 py-10 sm:py-14">
      <div className="receipt-shadow w-full max-w-[440px]">
      <div className="receipt-paper bg-hero-paper px-6 pt-7 pb-10 font-mono text-hero-ink sm:px-8">
        <p className="font-display text-center text-[22px] leading-none">usetally</p>
        <p className="mt-1.5 text-center text-[11.5px] tracking-[0.12em] text-hero-ink-2 uppercase">What you get</p>
        <ul className="mt-5 space-y-2.5">
          {LINES.map(([label, value]) => (
            <li key={label} className="flex items-baseline gap-2 text-[12px] tracking-[0.05em] uppercase sm:text-[12.5px]">
              <span className="min-w-0">{label}</span>
              <span aria-hidden="true" className="min-w-4 flex-1 border-b-2 border-dotted border-hero-line" />
              <span className="shrink-0 font-semibold">{value === "✓" ? <><span aria-hidden="true">✓</span><span className="sr-only">Yes</span></> : value}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-center justify-between border-t-2 border-dashed border-hero-line pt-3.5">
          <span className="text-[13px] font-bold tracking-[0.05em] uppercase">Usetally's cut of your payments</span>
          <span className="font-display text-[24px] leading-none text-hero-accent">0%</span>
        </div>
        <p className="mt-5 text-center text-[11px] tracking-[0.14em] text-hero-ink-2 uppercase">*** Thank you for your business ***</p>
      </div>
      </div>
    </section>
  );
}

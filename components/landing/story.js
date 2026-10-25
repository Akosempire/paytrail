"use client";
import { Check, EyeOff, FileText, MessageCircle, Printer, ShieldCheck } from "lucide-react";
import { ScrollScene, ScrollWords } from "@/components/landing/scroll-scene";

// Landing story: the hidden-cost "pain" and four chapters (quote, accept,
// pay, receipt). Everything is real HTML in Usetally's paper style. Figures
// are clearly labelled examples, never claims about customers.

const PAPER = "rounded-[14px] bg-hero-paper text-hero-ink shadow-[0_1px_2px_rgba(20,16,8,.06),0_22px_44px_-22px_rgba(20,16,8,.38)] ring-1 ring-black/[.06] dark:ring-white/[.06]";
const naira = (n) => `₦${n.toLocaleString("en-NG")}`;
const cx = (...c) => c.filter(Boolean).join(" ");

const COSTS = [
  ["Data & internet", 25000],
  ["Fuel & generator", 38000],
  ["Transport", 15000],
  ["Software subscriptions", 30000],
  ["Freelance help", 50000],
];
const PRICE = 500000;

export function PainStory() {
  return (
    <ScrollScene steps={COSTS.length + 2} heightVh={320} label="The real cost of a job" className="bg-hero text-hero-ink">
      {(step) => {
        const shown = Math.min(COSTS.length, Math.max(0, step));
        const spent = COSTS.slice(0, shown).reduce((s, [, v]) => s + v, 0);
        const done = step >= COSTS.length + 1 || shown === COSTS.length;
        return (
          <div className="mx-auto grid w-full max-w-[1280px] items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-16 lg:px-10 lg:py-0">
            <div className="max-w-[560px]">
              <p className="text-[13px] font-semibold tracking-[0.14em] text-hero-accent uppercase">The problem</p>
              <h2 className="font-display mt-4 text-[clamp(34px,4.6vw,60px)] leading-[1.02] font-semibold tracking-[-0.035em]">
                You quoted ₦500,000.<br /><span className="text-hero-ink-2">What did you keep?</span>
              </h2>
              <ScrollWords from={0.05} to={0.75} className="mt-6 text-[17px] leading-relaxed text-hero-ink sm:text-[19px]"
                text="Data, fuel, transport, software and the friend who helped you finish. None of it shows on the invoice, so most small businesses never see their real profit. Usetally keeps those costs on every job, hidden from your customer and visible to you." />
            </div>

            <div className="relative mx-auto w-full max-w-[440px]">
              <div className={cx(PAPER, "p-6 sm:p-7")}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold tracking-[0.18em] text-hero-ink-2">QUOTATION</p>
                    <p className="mt-1 text-[15px] font-semibold">Website & brand refresh</p>
                  </div>
                  <span className="rounded-full bg-hero-tint px-2.5 py-1 text-[11px] font-semibold text-hero-ink-2">Example</span>
                </div>
                <div className="mt-5 flex items-baseline justify-between border-b border-hero-line pb-4">
                  <span className="text-[14px] text-hero-ink-2">Customer pays</span>
                  <span className="text-[26px] font-semibold tracking-[-0.02em] tabular-nums">{naira(PRICE)}</span>
                </div>
                <div className="mt-4 flex items-center gap-2 text-[12px] font-semibold text-hero-violet">
                  <EyeOff className="size-3.5" aria-hidden="true" />YOUR COSTS · ONLY YOUR TEAM SEES THESE
                </div>
                <ul className="mt-2.5 space-y-1.5">
                  {COSTS.map(([label, value], i) => (
                    <li key={label} className={cx("flex items-center justify-between rounded-lg px-3 py-2 text-[14px] transition-all duration-500",
                      i < shown ? "translate-x-0 bg-hero-tint/70 opacity-100" : "translate-x-3 opacity-0")}>
                      <span className="text-hero-ink-2">{label}</span>
                      <span className="tabular-nums">−{naira(value)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex items-baseline justify-between border-t border-hero-line pt-4">
                  <span className="text-[14px] font-semibold">Real profit</span>
                  <span className={cx("text-[26px] font-semibold tracking-[-0.02em] tabular-nums transition-colors duration-500", done ? "text-hero-accent" : "text-hero-ink")}>{naira(PRICE - spent)}</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-hero-tint" aria-hidden="true">
                  <div className="h-full rounded-full bg-hero-accent transition-[width] duration-500" style={{ width: `${((PRICE - spent) / PRICE) * 100}%` }} />
                </div>
                <p className="mt-2 text-right text-[12px] text-hero-ink-2 tabular-nums">{Math.round(((PRICE - spent) / PRICE) * 100)}% margin</p>
              </div>
            </div>
          </div>
        );
      }}
    </ScrollScene>
  );
}

// ---------------------------------------------------------------- chapters

const CHAPTERS = [
  { kicker: "01 · Quote", title: "Price the job. See the profit first.", body: "Add your items, then your hidden costs. Usetally shows your margin before you send, and suggests a price if it's too thin.", Visual: QuoteVisual },
  { kicker: "02 · Accept", title: "Share a link. They accept in one tap.", body: "Send by WhatsApp or email. Your customer opens your branded quote on any phone and accepts with their name, no app or account needed.", Visual: AcceptVisual },
  { kicker: "03 · Pay", title: "They pay. It marks itself paid.", body: "Card or transfer through your own Paystack, Stripe, Flutterwave or Bachs account. Every payment is confirmed with the provider before the invoice is marked paid.", Visual: PayVisual },
  { kicker: "04 · Receipt", title: "A receipt, printed or sent.", body: "A numbered receipt is issued for every payment, full or part. Download it, share it, or print it on A4 or an 80 mm or 58 mm receipt printer.", Visual: ReceiptVisual },
];

export function Chapters() {
  return (
    <div id="how-it-works" className="scroll-mt-0 bg-hero text-hero-ink">
      {/* phones & reduced motion: a simple stacked story */}
      <ScrollScene steps={CHAPTERS.length} heightVh={CHAPTERS.length * 110} label="How Usetally works">
        {(step, still) => still ? (
          <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-16 px-4 py-20 sm:px-6 lg:px-10">
            <ChapterIntro />
            {CHAPTERS.map((c) => (
              <div key={c.kicker} className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
                <ChapterText chapter={c} />
                <div className="mx-auto w-full max-w-[460px]"><c.Visual active /></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mx-auto grid w-full max-w-[1280px] grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] items-center gap-16 px-10">
            <div className="flex gap-8">
              <Rail step={step} />
              <div className="relative min-h-[360px] flex-1">
                <ChapterIntro small />
                {CHAPTERS.map((c, i) => (
                  <div key={c.kicker} className={cx("absolute inset-x-0 top-24 transition-all duration-500", i === step ? "translate-y-0 opacity-100" : i < step ? "-translate-y-4 opacity-0" : "translate-y-4 opacity-0")} aria-hidden={i !== step}>
                    <ChapterText chapter={c} />
                  </div>
                ))}
              </div>
            </div>
            <div className="relative h-[520px]">
              {CHAPTERS.map((c, i) => (
                <div key={c.kicker} className={cx("absolute inset-0 flex items-center justify-center transition-all duration-700", i === step ? "scale-100 opacity-100" : "pointer-events-none scale-[.97] opacity-0")} aria-hidden={i !== step}>
                  <div className="w-full max-w-[460px]"><c.Visual active={i === step} /></div>
                </div>
              ))}
            </div>
          </div>
        )}
      </ScrollScene>
    </div>
  );
}

function ChapterIntro({ small }) {
  return small
    ? <p className="text-[13px] font-semibold tracking-[0.14em] text-hero-accent uppercase">How it works</p>
    : (
      <div className="max-w-[640px]">
        <p className="text-[13px] font-semibold tracking-[0.14em] text-hero-accent uppercase">How it works</p>
        <h2 className="font-display mt-4 text-[clamp(32px,4.4vw,56px)] leading-[1.04] font-semibold tracking-[-0.035em]">One flow, from first price to final receipt.</h2>
      </div>
    );
}

function ChapterText({ chapter }) {
  return (
    <div className="max-w-[520px]">
      <p className="text-[13px] font-semibold tabular-nums text-hero-ink-2">{chapter.kicker}</p>
      <h3 className="font-display mt-3 text-[clamp(28px,3.4vw,44px)] leading-[1.06] font-semibold tracking-[-0.03em]">{chapter.title}</h3>
      <p className="mt-4 text-[17px] leading-relaxed text-hero-ink-2">{chapter.body}</p>
    </div>
  );
}

function Rail({ step }) {
  return (
    <div className="relative mt-1 flex flex-col items-center" aria-hidden="true">
      <div className="absolute top-2 bottom-2 w-px bg-hero-line" />
      <div className="absolute top-2 w-px bg-hero-accent transition-[height] duration-500" style={{ height: `calc(${(step / (CHAPTERS.length - 1)) * 100}% - 16px)` }} />
      {CHAPTERS.map((c, i) => (
        <span key={c.kicker} className={cx("relative z-10 mb-[54px] size-3 rounded-full ring-4 ring-hero transition-colors duration-300 last:mb-0", i <= step ? "bg-hero-accent" : "bg-hero-line")} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- visuals

function Row({ label, value, muted, strong }) {
  return (
    <div className={cx("flex items-center justify-between gap-3 py-1.5 text-[13.5px]", muted && "text-hero-ink-2", strong && "font-semibold")}>
      <span>{label}</span><span className="tabular-nums">{value}</span>
    </div>
  );
}

function QuoteVisual({ active }) {
  return (
    <div className="relative">
      <div className={cx(PAPER, "p-6")}>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold tracking-[0.18em] text-hero-ink-2">QUOTATION · QT-0042</span>
          <span className="rounded-full bg-hero-tint px-2 py-0.5 text-[11px] font-semibold text-hero-ink-2">Draft</span>
        </div>
        <div className="mt-4 divide-y divide-hero-line">
          <Row label="Brand identity" value="₦180,000" />
          <Row label="Website, 6 pages" value="₦270,000" />
          <Row label="Product photos" value="₦50,000" />
        </div>
        <div className="mt-2 border-t border-hero-ink pt-2"><Row label="Total" value="₦500,000" strong /></div>
      </div>
      <div className={cx("absolute -right-3 -bottom-16 w-[62%] rounded-[14px] border border-dashed border-hero-violet/50 bg-hero-paper p-4 shadow-[0_22px_44px_-22px_rgba(20,16,8,.45)] transition-all duration-700 sm:-right-8", active ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0")}>
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-hero-violet"><EyeOff className="size-3.5" aria-hidden="true" />HIDDEN COSTS</p>
        <p className="mt-2 flex justify-between text-[13px]"><span className="text-hero-ink-2">Costs</span><span className="tabular-nums">₦158,000</span></p>
        <p className="mt-1 flex justify-between text-[13px] font-semibold"><span>Profit</span><span className="tabular-nums text-hero-accent">₦342,000</span></p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-hero-tint"><div className="h-full rounded-full bg-hero-accent transition-[width] delay-300 duration-1000" style={{ width: active ? "68%" : "0%" }} /></div>
        <p className="mt-1 text-right text-[11px] text-hero-ink-2">68% margin</p>
      </div>
      <div className="h-14" />
    </div>
  );
}

function AcceptVisual({ active }) {
  return (
    <div className="mx-auto flex max-w-[400px] justify-center">
      <div className="w-[268px] rounded-[38px] bg-hero-ink p-2.5 shadow-[0_30px_60px_-28px_rgba(20,16,8,.55)]">
        <div className="overflow-hidden rounded-[30px] bg-hero-tint">
          <div className="flex items-center gap-2 bg-hero-paper px-4 pt-6 pb-3 text-[12px] font-semibold"><MessageCircle className="size-4 text-hero-accent" aria-hidden="true" />Chioma · Obi Foods</div>
          <div className="space-y-2.5 p-3">
            <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-[#d9f2e3] px-3 py-2 text-[12.5px] text-[#14281d]">Hi Chioma, here's our quote for the website and brand refresh 👇<span className="mt-1 block truncate font-medium underline">usetally.cc/d/7f3a…</span></div>
            <div className={cx("rounded-2xl bg-hero-paper p-3 text-[12.5px] text-hero-ink shadow-sm transition-all duration-500", active ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0")}>
              <p className="text-[10.5px] font-semibold tracking-[0.14em] text-hero-ink-2">QUOTATION</p>
              <p className="mt-0.5 font-semibold">₦500,000</p>
              <div className={cx("mt-2.5 flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-semibold transition-colors delay-700 duration-500", active ? "bg-hero-accent text-white" : "bg-hero-ink text-hero")}>
                {active ? <><Check className="size-3.5" aria-hidden="true" />Accepted by Chioma Obi</> : "Accept quote"}
              </div>
            </div>
          </div>
          <div className="h-16" />
        </div>
      </div>
    </div>
  );
}

function PayVisual({ active }) {
  return (
    <div className="relative">
      <div className={cx(PAPER, "p-6")}>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold tracking-[0.18em] text-hero-ink-2">INVOICE · INV-0042</span>
          <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors delay-500 duration-500", active ? "bg-[#e3f1e8] text-[#175cd3]" : "bg-[#f6eedc] text-[#8a5a12]")}>{active ? "Paid" : "Due 31 Oct"}</span>
        </div>
        <div className="mt-4 divide-y divide-hero-line">
          <Row label="Subtotal" value="₦500,000" muted />
          <Row label="VAT 7.5%" value="₦37,500" muted />
        </div>
        <div className="mt-2 border-t border-hero-ink pt-2"><Row label="Total due" value="₦537,500" strong /></div>
        <div className="mt-4 grid grid-cols-3 gap-1.5 text-center text-[11.5px] font-semibold">
          {["Paystack", "Stripe", "Transfer"].map((p, i) => (
            <span key={p} className={cx("rounded-lg py-2 ring-1", i === 0 && active ? "bg-hero-ink text-hero ring-hero-ink" : "text-hero-ink-2 ring-hero-line")}>{p}</span>
          ))}
        </div>
      </div>
      <div aria-hidden="true" className={cx("absolute top-[38%] right-6 rotate-[-12deg] rounded-md border-[3px] border-[#175cd3] px-3 py-1 text-[26px] font-bold tracking-[0.16em] text-[#175cd3] transition-all duration-300", active ? "scale-100 opacity-90 delay-300" : "scale-[1.6] opacity-0")}>PAID</div>
      <p className={cx("mt-4 flex items-center justify-center gap-2 text-[13px] text-hero-ink-2 transition-opacity delay-700 duration-500", active ? "opacity-100" : "opacity-0")}>
        <ShieldCheck className="size-4 text-hero-accent" aria-hidden="true" />Verified with Paystack before marking paid
      </p>
    </div>
  );
}

function ReceiptVisual({ active }) {
  return (
    <div className="mx-auto flex max-w-[360px] flex-col items-center">
      <div className="relative z-10 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-hero-ink text-[12px] font-semibold text-hero shadow-[0_18px_40px_-20px_rgba(20,16,8,.6)]">
        <Printer className="size-4" aria-hidden="true" />80 mm receipt printer
      </div>
      <div className="-mt-2 w-[78%] overflow-hidden">
        <div className={cx("bg-hero-paper px-5 pt-6 pb-5 font-mono text-[11.5px] leading-relaxed text-hero-ink shadow-[0_20px_40px_-24px_rgba(20,16,8,.5)] transition-transform duration-[1400ms] ease-out", active ? "translate-y-0" : "-translate-y-full")}
          style={{ clipPath: "polygon(0 0,100% 0,100% calc(100% - 6px),95% 100%,90% calc(100% - 6px),85% 100%,80% calc(100% - 6px),75% 100%,70% calc(100% - 6px),65% 100%,60% calc(100% - 6px),55% 100%,50% calc(100% - 6px),45% 100%,40% calc(100% - 6px),35% 100%,30% calc(100% - 6px),25% 100%,20% calc(100% - 6px),15% 100%,10% calc(100% - 6px),5% 100%,0 calc(100% - 6px))" }}>
          <p className="text-center font-sans text-[13px] font-semibold">Adeyemi Studio</p>
          <p className="text-center text-hero-ink-2">Design &amp; brand studio</p>
          <p className="mt-2 border-y border-dashed border-hero-ink/60 py-1 text-center font-sans text-[12px] font-semibold tracking-[0.18em]">RECEIPT</p>
          <p className="mt-2 flex justify-between"><span>RC-0042</span><span>24 Oct</span></p>
          <p className="flex justify-between"><span>For</span><span>INV-0042</span></p>
          <p className="flex justify-between"><span>Method</span><span>Paystack</span></p>
          <p className="mt-2 flex justify-between border-t border-dashed border-hero-ink/60 pt-2 font-sans text-[15px] font-bold"><span>PAID</span><span className="tabular-nums">₦537,500</span></p>
          <p className="mt-3 text-center text-hero-ink-2">Thank you!</p>
        </div>
      </div>
      <p className="mt-4 flex items-center gap-2 text-[13px] text-hero-ink-2"><FileText className="size-3.5" aria-hidden="true" />Also as a PDF on A4, Letter or A5</p>
    </div>
  );
}

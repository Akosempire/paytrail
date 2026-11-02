import Link from "next/link";
import { ArrowRight, BellRing, CalendarClock, Repeat, Sparkles } from "lucide-react";
import { formatMoney } from "@/lib/money";

// One compact section for what paid plans (and the trial) add: automatic
// reminders, scheduled and repeating invoices, and Usetally inside ChatGPT,
// Claude and Grok (over MCP), with a clearly labelled example chat. Visitors
// outside Nigeria see dollars (naira ÷ 100, like the rest of the page).
const PAPER = "rounded-[18px] bg-hero-paper text-hero-ink shadow-[0_1px_2px_rgba(20,16,8,.06),0_26px_50px_-26px_rgba(20,16,8,.45)] ring-1 ring-black/[.05] dark:ring-white/[.06]";
const POINTS = [
  [BellRing, "Automatic reminders", "Polite emails before and after the due date. They stop when it's paid."],
  [CalendarClock, "Scheduled sending", "Write it tonight, pick when it lands."],
  [Repeat, "Repeating invoices", "Retainers and rent, made for you every week or month."],
  [Sparkles, "Inside ChatGPT, Claude & Grok", "Say what you need; it makes the invoice and asks before sending."],
];

export function Autopilot({ wrap, kicker, h2, currency = "NGN" }) {
  const m = (naira) => formatMoney(currency === "NGN" ? naira * 100 : naira, currency, { decimals: 0 });
  const sub = 300000, vat = sub * 0.075;
  return (
    <section className={`py-24 ${wrap}`} aria-labelledby="autopilot-title">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-16">
        <div className="max-w-[540px]">
          <p className={kicker}>On autopilot</p>
          <h2 id="autopilot-title" className={`mt-4 ${h2}`}>Get paid without <span className="text-hero-accent">chasing.</span></h2>
          <ul className="mt-8 space-y-5">
            {POINTS.map(([Icon, t, d]) => (
              <li key={t} className="flex gap-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-hero-accent/10 text-hero-accent"><Icon className="size-[18px]" aria-hidden="true" /></span>
                <p className="text-[15.5px] leading-snug"><span className="block font-semibold">{t}</span><span className="text-hero-ink-2">{d}</span></p>
              </li>
            ))}
          </ul>
          <p className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[11px] tracking-[0.12em] text-hero-ink-2 uppercase">
            <span>Paid plans &amp; the free trial</span>
            <Link href="/docs/mcp" className="inline-flex items-center gap-1 font-sans text-[13.5px] font-semibold tracking-normal text-hero-ink normal-case underline decoration-hero-line underline-offset-4 hover:decoration-hero-ink">AI &amp; MCP: how it works<ArrowRight className="size-3.5" aria-hidden="true" /></Link>
          </p>
        </div>

        {/* an example chat */}
        <figure className={`${PAPER} mx-auto w-full max-w-[440px] overflow-hidden`} aria-label="Example: making an invoice in ChatGPT">
          <div className="flex items-center justify-between border-b border-hero-line px-5 py-3">
            <span className="flex items-center gap-2 text-[13px] font-semibold"><Sparkles className="size-4 text-hero-accent" aria-hidden="true" />ChatGPT · Usetally</span>
            <span className="rounded-full bg-hero-tint px-2.5 py-1 text-[11px] font-semibold text-hero-ink-2">Example</span>
          </div>
          <div className="space-y-3 p-5 text-[13.5px] leading-relaxed">
            <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-hero-ink px-3.5 py-2.5 text-hero">Invoice Obi Foods for 2 logo designs at {m(sub / 2)} each, due Friday.</p>
            <div className="rounded-xl bg-hero p-3.5 ring-1 ring-hero-line">
              <div className="flex items-center justify-between font-mono text-[10.5px] tracking-[0.14em] text-hero-ink-2 uppercase"><span>Invoice · INV-0043</span><span>Draft</span></div>
              <div className="mt-2.5 space-y-1 text-[12.5px]">
                <p className="flex justify-between"><span className="text-hero-ink-2">2 × Logo design</span><span className="tabular-nums">{m(sub)}</span></p>
                <p className="flex justify-between"><span className="text-hero-ink-2">VAT (7.5%)</span><span className="tabular-nums">{m(vat)}</span></p>
                <p className="flex justify-between border-t border-hero-line pt-1.5 font-semibold"><span>Total due</span><span className="tabular-nums">{m(sub + vat)}</span></p>
              </div>
            </div>
            <p className="text-hero-ink-2">Shall I email it to Chioma? <span className="text-hero-ink">· Yes, send it.</span></p>
            <p className="text-hero-ink-2">Sent ✓ Reminders are on if it runs late.</p>
          </div>
        </figure>
      </div>
    </section>
  );
}

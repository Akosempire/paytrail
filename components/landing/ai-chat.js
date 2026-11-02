import Link from "next/link";
import { ArrowRight, Bot, Sparkles, Zap } from "lucide-react";
import { formatMoney } from "@/lib/money";

// "Invoice by chatting": Usetally inside ChatGPT, Claude and Grok (over MCP).
// A clearly labelled example conversation, in Usetally's paper style. Visitors
// outside Nigeria see dollars (naira ÷ 100, like the rest of the page).
const cx = (...c) => c.filter(Boolean).join(" ");
const PAPER = "rounded-[18px] bg-hero-paper text-hero-ink shadow-[0_1px_2px_rgba(20,16,8,.06),0_26px_50px_-26px_rgba(20,16,8,.45)] ring-1 ring-black/[.05] dark:ring-white/[.06]";
const APPS = [["ChatGPT", Sparkles], ["Claude", Bot], ["Grok", Zap]];
const POINTS = [
  ["Make it", "Quotes and invoices from one sentence, using your saved customers and prices."],
  ["Send it", "It shows you the total and asks before anything reaches a customer."],
  ["Ask it", "“Who owes me money?” “How much did I collect in October?”"],
];

export function AiChat({ wrap, kicker, h2, currency = "NGN" }) {
  const m = (naira) => formatMoney(currency === "NGN" ? naira * 100 : naira, currency, { decimals: 0 });
  const each = 150000, sub = each * 2, vat = sub * 0.075;
  return (
    <section className={`py-24 ${wrap}`} aria-labelledby="ai-title">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-16">
        <div className="max-w-[520px]">
          <p className={kicker}>New · AI &amp; MCP</p>
          <h2 id="ai-title" className={`mt-4 ${h2}`}>Invoice by <span className="text-hero-accent">chatting.</span></h2>
          <p className="mt-5 text-[17px] leading-relaxed text-hero-ink-2">Connect Usetally to ChatGPT, Claude or Grok in a minute. Then just say what you need, and it's done in your Usetally, with your branding.</p>
          <ul className="mt-7 space-y-4">
            {POINTS.map(([t, d]) => (
              <li key={t} className="flex gap-3">
                <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-hero-accent" />
                <p className="text-[15.5px] leading-relaxed"><span className="font-semibold">{t}.</span> <span className="text-hero-ink-2">{d}</span></p>
              </li>
            ))}
          </ul>
          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
            <span className="flex items-center gap-2">
              {APPS.map(([name, Icon]) => (
                <span key={name} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-hero-paper/80 px-3 text-[13px] font-semibold ring-1 ring-black/[.06] dark:ring-white/[.08]"><Icon className="size-3.5 text-hero-accent" aria-hidden="true" />{name}</span>
              ))}
            </span>
            <Link href="/docs/mcp" className="inline-flex items-center gap-1 text-[14px] font-semibold text-hero-ink underline decoration-hero-line underline-offset-4 hover:decoration-hero-ink">How it works<ArrowRight className="size-3.5" aria-hidden="true" /></Link>
          </div>
          <p className="mt-4 font-mono text-[11px] tracking-[0.12em] text-hero-ink-2 uppercase">On paid plans and the free trial</p>
        </div>

        {/* an example chat */}
        <figure className={cx(PAPER, "mx-auto w-full max-w-[470px] overflow-hidden")} aria-label="Example: making an invoice in ChatGPT">
          <div className="flex items-center justify-between border-b border-hero-line px-5 py-3.5">
            <span className="flex items-center gap-2 text-[13px] font-semibold"><Sparkles className="size-4 text-hero-accent" aria-hidden="true" />ChatGPT · Usetally</span>
            <span className="rounded-full bg-hero-tint px-2.5 py-1 text-[11px] font-semibold text-hero-ink-2">Example</span>
          </div>
          <div className="space-y-3 p-5 text-[13.5px] leading-relaxed">
            <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-hero-ink px-3.5 py-2.5 text-hero">Invoice Obi Foods for 2 logo designs at {m(each)} each, due Friday.</p>
            <div className="max-w-[92%] space-y-2.5">
              <p className="text-hero-ink-2">Here's the draft. Shall I email it to Chioma at Obi Foods?</p>
              <div className="rounded-xl bg-hero p-3.5 ring-1 ring-hero-line">
                <div className="flex items-center justify-between font-mono text-[10.5px] tracking-[0.14em] text-hero-ink-2 uppercase"><span>Invoice · INV-0043</span><span>Draft</span></div>
                <div className="mt-2.5 space-y-1 text-[12.5px]">
                  <p className="flex justify-between"><span className="text-hero-ink-2">2 × Logo design</span><span className="tabular-nums">{m(sub)}</span></p>
                  <p className="flex justify-between"><span className="text-hero-ink-2">VAT (7.5%)</span><span className="tabular-nums">{m(vat)}</span></p>
                  <p className="flex justify-between border-t border-hero-line pt-1.5 font-semibold"><span>Total due</span><span className="tabular-nums">{m(sub + vat)}</span></p>
                </div>
              </div>
            </div>
            <p className="ml-auto w-fit rounded-2xl rounded-br-md bg-hero-ink px-3.5 py-2.5 text-hero">Yes, send it.</p>
            <p className="max-w-[92%] text-hero-ink-2">Sent ✓ Chioma can view and pay it from her link.</p>
          </div>
        </figure>
      </div>
    </section>
  );
}
